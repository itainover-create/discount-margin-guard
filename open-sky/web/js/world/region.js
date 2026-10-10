// A baked real-world region: streams 1 km tiles (buildings, roads, trees,
// lights) around the camera with distance-based LOD, provides the land-class
// raster to the terrain shader and coastline/height corrections to the
// terrain mesher. Everything lives in one group transformed region -> world.
import * as THREE from 'three';
import { GeoFrame } from './geo.js';
import { decodeTile } from './tiledata.js';
import { buildBuildings, buildRoads, buildPiers, buildTrees, buildTowers, styleId } from './city.js';
import { buildingMaterial, roadMaterial } from './shaders.js';
import { decodeImage, fetchJson, fetchGz } from '../util/net.js';
import { LightBatch } from './lights.js';

const WATER_CLASSES = new Set([1, 3]);

export class Region {
  constructor(world, entry, base) {
    this.world = world;
    this.entry = entry;
    this.base = `${base}regions/${entry.id}/`;
    this.id = entry.id;
    this.group = new THREE.Group();
    this.group.name = 'region:' + entry.id;
    this.tiles = new Map();
    this.loaded = false;
    this.buildQueue = [];
    this.frame = new GeoFrame(entry.anchor.lat, entry.anchor.lon);
    this.settings = { nearKm: 2.4, midKm: 6, farKm: 24, trees: 1800, buildPerFrame: 1 };
    this.stats = { tilesLoaded: 0, tilesBuilt: 0, buildings: 0 };
  }

  async load() {
    this.manifest = await fetchJson(this.base + 'manifest.json');
    const lc = this.manifest.landclass;
    if (lc) {
      const img = await decodeImage(this.base + lc.file);
      const data = new Uint8Array(img.width * img.height);
      for (let i = 0; i < data.length; i++) data[i] = img.data[i * 4];
      this.lc = { ...lc, data, w: img.width, h: img.height };
      const tex = new THREE.DataTexture(data, img.width, img.height, THREE.RedFormat, THREE.UnsignedByteType);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      this.lcTex = tex;
    }
    this.bldMat = buildingMaterial(this.world.shared);
    this.roadMat = roadMaterial(this.world.shared);
    this.lights = new LightBatch(this.world, 'region-lights');
    this.group.add(this.lights.points);
    this.updateTransform();
    this.loaded = true;
    return this;
  }

  // region frame -> world frame (exact affine between equirectangular frames)
  updateTransform() {
    const a = this.frame.affineTo(this.world.frame);
    this.affine = a;
    this.group.position.set(a.tx, 0, -a.ty);
    this.group.scale.set(a.sx, 1, 1);
    this.group.updateMatrixWorld(true);
  }
  toWorld(x, y, out = {}) { out.x = this.affine.sx * x + this.affine.tx; out.y = y + this.affine.ty; return out; }
  toRegion(x, y, out = {}) { out.x = (x - this.affine.tx) / this.affine.sx; out.y = y - this.affine.ty; return out; }

  containsWorld(x, y, margin = 0) {
    const r = this.toRegion(x, y);
    const e = this.manifest.extent;
    return r.x > e[0] - margin && r.x < e[2] + margin && r.y > e[1] - margin && r.y < e[3] + margin;
  }

  classAt(xr, yr) {
    const lc = this.lc;
    if (!lc) return -1;
    const px = Math.floor((xr - lc.origin[0]) / lc.res), py = Math.floor((lc.origin[1] - yr) / lc.res);
    if (px < 0 || py < 0 || px >= lc.w || py >= lc.h) return -1;
    return lc.data[py * lc.w + px];
  }

  // Terrain modifier: sharpen coastlines with the vector-derived class raster.
  terrainModifier() {
    const tmp = {};
    return (x, y, h) => {
      if (h > 6) return h;
      this.toRegion(x, y, tmp);
      const c = this.classAt(tmp.x, tmp.y);
      if (c < 0) return h;
      if (WATER_CLASSES.has(c)) return Math.min(h, -2.5);
      if (c === 2 || c === 4) return h;
      if (h < 0.8) return 0.8 + Math.max(0, h) * 0.2;
      return h;
    };
  }

  surfaceAt(x, y) {
    const r = this.toRegion(x, y);
    const c = this.classAt(r.x, r.y);
    if (c >= 1 && c <= 4) return 3;               // water
    if (c >= 50 && c <= 55) return c === 50 ? 2 : 4;
    if (c >= 10 && c <= 13) return 1;
    if (c >= 60 || c === 0) return c >= 70 ? 1 : 2;
    return 2;
  }

  bindShader(shared) {
    if (!this.lcTex) return;
    shared.uRegionTex.value = this.lcTex;
    const lc = this.lc;
    shared.uRegionInfo.value.set(lc.origin[0], lc.origin[1], lc.res, 1);
    shared.uRegionSize.value.set(lc.w, lc.h);
    shared.uRegionAffine.value.set(this.affine.sx, this.affine.tx, this.affine.ty);
    shared.uStyle.value = styleId(this.manifest.style);
  }

  // ---------------------------------------------------------------------
  update(camWorld) {
    if (!this.loaded) return;
    const m = this.manifest;
    const T = m.tileSize;
    const c = this.toRegion(camWorld.x, camWorld.y);
    const alt = Math.max(0, camWorld.z - 300);
    const s = this.settings;
    const near = s.nearKm * 1000 + alt * 0.4, mid = s.midKm * 1000 + alt * 0.8, far = s.farKm * 1000 + alt * 1.5;
    const rMax = far;
    const tx0 = Math.floor((c.x - rMax) / T), tx1 = Math.floor((c.x + rMax) / T);
    const ty0 = Math.floor((c.y - rMax) / T), ty1 = Math.floor((c.y + rMax) / T);
    const want = new Map();
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = `${tx},${ty}`;
        const info = m.tiles[key];
        if (!info) continue;
        const cx = tx * T + T / 2, cy = ty * T + T / 2;
        const d = Math.hypot(cx - c.x, cy - c.y);
        let lod = 0;
        if (d < near) lod = 3;
        else if (d < mid) lod = 2;
        else if (d < far && (m.tileMaxH[key] || 0) > 45) lod = 1;
        if (lod) want.set(key, { tx, ty, d, lod });
      }
    }
    // drop tiles out of range
    for (const [key, t] of this.tiles) {
      if (!want.has(key)) { this._dispose(t); this.tiles.delete(key); }
    }
    // load / LOD switch
    const queue = [];
    for (const [key, w] of want) {
      let t = this.tiles.get(key);
      if (!t) {
        t = { key, tx: w.tx, ty: w.ty, state: 'new', lod: 0, want: w.lod, d: w.d, objs: {} };
        this.tiles.set(key, t);
      }
      t.want = w.lod;
      t.d = w.d;
      if (t.state === 'new') this._fetch(t);
      if (t.state === 'ready' && t.lod !== t.want) queue.push(t);
    }
    queue.sort((a, b) => a.d - b.d);
    let budget = s.buildPerFrame;
    const t0 = performance.now();
    for (const t of queue) {
      if (budget <= 0 || performance.now() - t0 > 6) break;
      this._applyLod(t);
      budget--;
    }
    let nb = 0;
    for (const t of this.tiles.values()) nb += t.count || 0;
    this.stats.buildings = nb;
    this.stats.tilesLoaded = this.tiles.size;
  }

  async _fetch(t) {
    t.state = 'loading';
    const m = this.manifest;
    const pk = `${Math.floor(t.tx / m.packBlock)},${Math.floor(t.ty / m.packBlock)}`;
    try {
      const bytes = await this.world.packs.get(this.base + 'packs/' + m.packs[pk], t.key);
      const raw = await gunzip(bytes);
      t.data = decodeTile(raw, t.tx, t.ty, m.tileSize, m.quant);
      t.state = 'ready';
    } catch (e) {
      console.warn('tile load failed', t.key, e);
      t.state = 'failed';
    }
  }

  _ctx(t) {
    const T = this.manifest.tileSize;
    const ox = t.tx * T + T / 2, oy = t.ty * T + T / 2;
    const wtmp = {};
    return {
      ox, oy, style: this.manifest.style,
      toWorld: (x, y, out) => { out.x = x; out.y = y; return out; },
      heightAt: (x, y) => { this.toWorld(x, y, wtmp); return this.world.heightAt(wtmp.x, wtmp.y); },
      bridgeDeck: this.world.landmarks ? (x, y) => this.world.landmarks.deckHeight(this.id, x, y) : null,
      isWet: (x, y) => { const c = this.classAt(x, y); return (c >= 1 && c <= 4) || c === 44 || c === 45; },
    };
  }

  // Brings a tile to its wanted LOD. Does at most one heavy build stage
  // (buildings, roads, trees) per call so a dense city tile is spread over
  // several frames; returns false while stages remain.
  _applyLod(t) {
    const ctx = this._ctx(t);
    const place = (o) => { o.position.set(ctx.ox, 0, -ctx.oy); o.updateMatrix(); o.matrixAutoUpdate = false; this.group.add(o); return o; };
    // buildings (near + far geometry built once)
    if (!t.bld && t.want >= 1) {
      t.bld = buildBuildings(t.data, ctx);
      t.count = t.data.buildings.length;
      if (t.bld.near) t.objs.near = place(new THREE.Mesh(t.bld.near, this.bldMat));
      if (t.bld.far) t.objs.far = place(new THREE.Mesh(t.bld.far, this.bldMat));
      this._visibility(t);
      if (t.want >= 2) return false;
    }
    // roads, lights, trees, towers only up close
    if (t.want >= 2 && !t.objs.roads && !t.roadsBuilt) {
      t.roadsBuilt = true;
      const r = buildRoads(t.data, ctx);
      if (r.geo) t.objs.roads = place(new THREE.Mesh(r.geo, this.roadMat));
      const piers = buildPiers(r.piers);
      if (piers) t.objs.piers = place(piers);
      t.lightIds = this.lights.add(r.lights.map((l) => [l[0] + ctx.ox, l[1], l[2] - ctx.oy, l[3] ? 1.0 : 0.8, 5, 0, l[3] ? [1.0, 0.85, 0.65] : [1.0, 0.72, 0.42]]));
      const tw = buildTowers(t.data, ctx);
      if (tw) {
        t.objs.towers = place(tw.mesh);
        t.towerLights = this.lights.add(tw.lights.map((l) => [l[0] + ctx.ox, l[1], l[2] - ctx.oy, 1.2, l[3], Math.random(), l[3] === 2 ? [1, 1, 0.9] : [1, 0.1, 0.05]]));
      }
      this._visibility(t);
      if (t.want >= 3) return false;
    }
    if (t.want >= 3 && !t.objs.trees && !t.treesBuilt) {
      t.treesBuilt = true;
      const tr = buildTrees(t.data, ctx, this.settings.trees, this.manifest.style);
      if (tr) t.objs.trees = place(tr);
    }
    this._visibility(t);
    t.lod = t.want;
    return true;
  }

  _visibility(t) {
    if (t.objs.near) t.objs.near.visible = t.want >= 2;
    if (t.objs.far) t.objs.far.visible = t.want === 1;
    if (t.objs.trees) t.objs.trees.visible = t.want >= 3;
    for (const k of ['roads', 'piers', 'towers']) if (t.objs[k]) t.objs[k].visible = t.want >= 2;
    if (t.lightIds) this.lights.setVisible(t.lightIds, t.want >= 2);
  }

  _dispose(t) {
    for (const o of Object.values(t.objs)) {
      this.group.remove(o);
      if (o.geometry && o.geometry !== undefined && !(o.isInstancedMesh && o.geometry.userData.shared)) {
        if (!o.isInstancedMesh) o.geometry.dispose();
      }
      if (o.isInstancedMesh) o.dispose();
    }
    if (t.lightIds) this.lights.remove(t.lightIds);
    if (t.towerLights) this.lights.remove(t.towerLights);
    t.objs = {};
  }

  // Re-run building/road placement when terrain resolution improved.
  dispose() {
    for (const t of this.tiles.values()) this._dispose(t);
    this.tiles.clear();
    this.lights.dispose();
  }
}

async function gunzip(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export { fetchGz };
