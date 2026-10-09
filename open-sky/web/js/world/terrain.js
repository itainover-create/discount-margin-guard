// Terrain: elevation data provider (bundled region tiles -> online tiles with
// a persistent local cache -> coarse global layer) and a quadtree LOD mesh
// system over Web-Mercator tiles, built in the current GeoFrame.
import * as THREE from 'three';
import { decodeImage, TileCache } from '../util/net.js';
import { lonToTileX, latToTileY, tileXToLon, tileYToLat } from './geo.js';
import { terrainMaterial } from './shaders.js';

const ONLINE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const TILE_PX = 256;

// ---------------------------------------------------------------------------
// Global coarse DEM (web/data/global/dem.png, see tools/build_global_dem.py)
// ---------------------------------------------------------------------------
export class GlobalDem {
  static async load(url) {
    const img = await decodeImage(url);
    const g = new GlobalDem();
    g.w = img.width;
    g.h = img.height;
    g.v = new Uint8Array(img.width * img.height);
    for (let i = 0; i < g.v.length; i++) g.v[i] = img.data[i * 4];
    return g;
  }
  static decode(v) { return v === 0 ? -12 : -450 + ((v - 1) / 254) ** 2 * 9350; }
  rawAt(ix, iy) {
    ix = ((ix % this.w) + this.w) % this.w;
    iy = Math.max(0, Math.min(this.h - 1, iy));
    return this.v[iy * this.w + ix];
  }
  height(lat, lon) {
    const fx = ((lon + 180) / 360) * this.w - 0.5;
    const fy = ((90 - lat) / 180) * this.h - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const a = GlobalDem.decode(this.rawAt(x0, y0)), b = GlobalDem.decode(this.rawAt(x0 + 1, y0));
    const c = GlobalDem.decode(this.rawAt(x0, y0 + 1)), d = GlobalDem.decode(this.rawAt(x0 + 1, y0 + 1));
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  isWater(lat, lon) {
    return this.rawAt(Math.floor(((lon + 180) / 360) * this.w), Math.floor(((90 - lat) / 180) * this.h)) === 0;
  }
}

// ---------------------------------------------------------------------------
// Elevation tile provider
// ---------------------------------------------------------------------------
export class TerrainProvider {
  // bundledIndex: { "z/x/y": "pack file name" } from data/terrain/index.json
  constructor({ base, bundledIndex, online, globalDem, packs }) {
    this.base = base;
    this.bundledPack = bundledIndex || {};
    this.bundled = new Set(Object.keys(this.bundledPack));
    this.packs = packs;
    this.bundledMaxZ = 0;
    for (const k of this.bundled) this.bundledMaxZ = Math.max(this.bundledMaxZ, +k.split('/')[0]);
    this.onlineEnabled = online;
    this.onlineFailures = 0;
    this.onlineBlockedUntil = 0;
    this.global = globalDem;
    this.cache = new Map();      // key -> Tile (decoded)
    this.pending = new Map();    // key -> Promise
    this.tileCache = new TileCache('opensky-terrain-v1');
    this.stats = { bundled: 0, online: 0, failed: 0 };
    this.maxCached = 260;
  }
  key(z, x, y) { return `${z}/${x}/${y}`; }
  get onlineAvailable() { return this.onlineEnabled && performance.now() > this.onlineBlockedUntil; }
  status() {
    if (!this.onlineEnabled) return 'offline (bundled + global)';
    if (!this.onlineAvailable) return 'online tiles unavailable — using bundled/global data';
    return 'online + local cache';
  }

  // Highest zoom with real data likely available at a location.
  dataZoomAt(z, x, y) {
    for (let dz = Math.min(z, this.bundledMaxZ); dz >= 8; dz--) {
      const s = z - dz;
      if (this.bundled.has(this.key(dz, x >> s, y >> s))) return dz;
    }
    if (this.onlineAvailable) return Math.min(z, 13);
    return 0;
  }

  peek(z, x, y) {
    const t = this.cache.get(this.key(z, x, y));
    if (t) t.used = performance.now();
    return t || null;
  }

  // Best cached tile covering (z,x,y): returns {tile, shift} or null.
  bestCached(z, x, y) {
    for (let dz = z; dz >= 0; dz--) {
      const s = z - dz;
      const t = this.peek(dz, x >> s, y >> s);
      if (t) return { tile: t, shift: s };
    }
    return null;
  }

  request(z, x, y) {
    const k = this.key(z, x, y);
    if (this.cache.has(k)) return Promise.resolve(this.cache.get(k));
    if (this.pending.has(k)) return this.pending.get(k);
    const p = this._load(z, x, y).then((t) => {
      this.pending.delete(k);
      if (t) {
        this.cache.set(k, t);
        this._evict();
      }
      return t;
    });
    this.pending.set(k, p);
    return p;
  }

  async _load(z, x, y) {
    const k = this.key(z, x, y);
    try {
      let img;
      let source;
      if (this.bundled.has(k)) {
        const bytes = await this.packs.get(`${this.base}terrain/packs/${this.bundledPack[k]}`, k);
        img = await decodeImage(new Blob([bytes], { type: 'image/png' }));
        source = 'bundled';
        this.stats.bundled++;
      } else if (this.onlineAvailable) {
        const blob = await this.tileCache.get(ONLINE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y));
        img = await decodeImage(blob);
        source = 'online';
        this.stats.online++;
        this.onlineFailures = 0;
      } else {
        return null;
      }
      const h = new Float32Array(TILE_PX * TILE_PX);
      const d = img.data;
      let mn = 1e9, mx = -1e9;
      for (let i = 0; i < h.length; i++) {
        const v = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
        h[i] = v;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      return { z, x, y, h, min: mn, max: mx, source, used: performance.now() };
    } catch (e) {
      this.stats.failed++;
      if (!this.bundled.has(k)) {
        this.onlineFailures++;
        if (this.onlineFailures >= 3) {
          this.onlineBlockedUntil = performance.now() + 60000;
          this.onlineFailures = 0;
        }
      }
      return null;
    }
  }

  _evict() {
    if (this.cache.size <= this.maxCached) return;
    const arr = [...this.cache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < arr.length - this.maxCached; i++) this.cache.delete(arr[i][0]);
  }

  // Height at lat/lon from the best cached tile (no network), else global DEM.
  heightLatLon(lat, lon, maxZ = 14) {
    for (let z = Math.min(maxZ, 14); z >= 6; z--) {
      const fx = lonToTileX(lon, z), fy = latToTileY(lat, z);
      const tx = Math.floor(fx), ty = Math.floor(fy);
      const t = this.cache.get(this.key(z, tx, ty));
      if (t) return sampleTile(t, (fx - tx) * TILE_PX, (fy - ty) * TILE_PX);
    }
    return this.global ? this.global.height(lat, lon) : 0;
  }
}

function sampleTile(t, px, py) {
  px = Math.min(TILE_PX - 1.001, Math.max(0, px - 0.5));
  py = Math.min(TILE_PX - 1.001, Math.max(0, py - 0.5));
  const x0 = px | 0, y0 = py | 0, fx = px - x0, fy = py - y0;
  const i = y0 * TILE_PX + x0;
  const h = t.h;
  return (h[i] * (1 - fx) + h[i + 1] * fx) * (1 - fy) + (h[i + TILE_PX] * (1 - fx) + h[i + TILE_PX + 1] * fx) * fy;
}

// ---------------------------------------------------------------------------
// LOD system
// ---------------------------------------------------------------------------
const ROOT_Z = 7;

export class TerrainSystem {
  constructor(world, provider) {
    this.world = world;
    this.provider = provider;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.material = terrainMaterial(world.shared);
    this.chunks = new Map();     // key -> chunk
    this.buildQueue = [];
    this.quality = 1.0;          // split threshold scale
    this.viewDistance = 90000;
    this.maxBuildsPerFrame = 3;
    this.stats = { chunks: 0, tris: 0 };
  }

  setQuality(q, viewDistance) { this.quality = q; this.viewDistance = viewDistance; }

  dispose() {
    for (const c of this.chunks.values()) this._dropChunk(c);
    this.chunks.clear();
  }

  // Called every frame with camera position in frame coords (x east, y north, z up).
  update(cam) {
    const frame = this.world.frame;
    const ll = frame.toLatLon(cam.x, cam.y);
    const desired = new Map();
    const n = 1 << ROOT_Z;
    const rx = Math.floor(lonToTileX(ll.lon, ROOT_Z)), ry = Math.floor(latToTileY(ll.lat, ROOT_Z));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = (((rx + dx) % n) + n) % n, y = ry + dy;
        if (y < 0 || y >= n) continue;
        this._visit(ROOT_Z, x, y, cam, ll, desired);
      }
    }
    // remove chunks no longer wanted (only once a replacement exists)
    for (const [k, c] of this.chunks) {
      if (!desired.has(k)) {
        this._dropChunk(c);
        this.chunks.delete(k);
      }
    }
    // create / refine
    let builds = 0;
    const todo = [];
    for (const [k, info] of desired) {
      let c = this.chunks.get(k);
      if (!c) {
        c = { key: k, z: info.z, x: info.x, y: info.y, mesh: null, dataZ: -1, wantZ: info.dataZ, dist: info.dist, requested: false };
        this.chunks.set(k, c);
      }
      c.dist = info.dist;
      c.wantZ = info.dataZ;
      if (!c.mesh || c.dirty || c.dataZ < c.availZ) todo.push(c);
      if (!c.requested && c.wantZ > 0) {
        c.requested = true;
        const s = c.z - c.wantZ;
        this.provider.request(c.wantZ, c.x >> s, c.y >> s).then((t) => {
          if (t) { c.availZ = c.wantZ; }
        });
      }
    }
    todo.sort((a, b) => (a.mesh ? 1 : 0) - (b.mesh ? 1 : 0) || a.dist - b.dist);
    for (const c of todo) {
      if (builds >= this.maxBuildsPerFrame && c.mesh) break;
      if (builds >= this.maxBuildsPerFrame * 4) break;
      this._build(c);
      builds++;
    }
    let tris = 0;
    for (const c of this.chunks.values()) if (c.mesh) tris += c.tris;
    this.stats.chunks = this.chunks.size;
    this.stats.tris = tris;
  }

  _visit(z, x, y, cam, ll, out) {
    const b = this._bounds(z, x, y);
    const dx = Math.max(b.x0 - cam.x, 0, cam.x - b.x1);
    const dy = Math.max(b.y0 - cam.y, 0, cam.y - b.y1);
    const dz = Math.max(0, cam.z - 3000);
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz * 0.25);
    if (dist > this.viewDistance) return;
    const size = b.x1 - b.x0;
    const dataZ = this.provider.dataZoomAt(z, x, y);
    const maxZ = dataZ >= 12 ? 13 : (dataZ > 0 ? 12 : 11);
    const altFactor = Math.max(1, cam.z / 4000);
    if (z < maxZ && size / Math.max(dist * altFactor, 1) > 1.25 / this.quality) {
      for (let k = 0; k < 4; k++) this._visit(z + 1, x * 2 + (k & 1), y * 2 + (k >> 1), cam, ll, out);
      return;
    }
    out.set(`${z}/${x}/${y}`, { z, x, y, dist, dataZ: Math.min(dataZ, z) });
  }

  _bounds(z, x, y) {
    const f = this.world.frame;
    const lon0 = tileXToLon(x, z), lon1 = tileXToLon(x + 1, z);
    const lat0 = tileYToLat(y + 1, z), lat1 = tileYToLat(y, z);
    const a = f.toXY(lat0, lon0), b = f.toXY(lat1, lon1);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }

  _dropChunk(c) {
    if (c.mesh) {
      this.group.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh = null;
    }
  }

  _build(c) {
    const frame = this.world.frame;
    const best = this.provider.bestCached(c.z, c.x, c.y);
    const N = c.z >= 13 ? 96 : c.z >= 12 ? 64 : c.z >= 10 ? 40 : 24;
    const verts = (N + 1) * (N + 1);
    const skirtN = 4 * N;
    const pos = new Float32Array((verts + skirtN + 4) * 3);
    const nrm = new Float32Array((verts + skirtN + 4) * 3);
    const heights = new Float32Array(verts);
    const lon0 = tileXToLon(c.x, c.z), lon1 = tileXToLon(c.x + 1, c.z);
    const cLat = tileYToLat(c.y + 0.5, c.z), cLon = (lon0 + lon1) / 2;
    const center = frame.toXY(cLat, cLon);
    const mods = this.world.terrainModifiers;
    const tmp = {};
    let minH = 1e9, maxH = -1e9;
    for (let j = 0; j <= N; j++) {
      const ty = c.y + j / N;
      const lat = tileYToLat(ty, c.z);
      for (let i = 0; i <= N; i++) {
        const tx = c.x + i / N;
        const lon = tileXToLon(tx, c.z);
        let h;
        if (best) {
          const s = best.shift;
          const px = (tx / (1 << s) - best.tile.x) * TILE_PX;
          const py = (ty / (1 << s) - best.tile.y) * TILE_PX;
          h = sampleTile(best.tile, px, py);
        } else {
          h = this.provider.global ? this.provider.global.height(lat, lon) : 0;
        }
        frame.toXY(lat, lon, tmp);
        for (let m = 0; m < mods.length; m++) h = mods[m](tmp.x, tmp.y, h);
        const k = j * (N + 1) + i;
        heights[k] = h;
        pos[k * 3] = tmp.x - center.x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = -(tmp.y - center.y);
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
    // normals
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const k = j * (N + 1) + i;
        const il = Math.max(0, i - 1), ir = Math.min(N, i + 1), jd = Math.max(0, j - 1), ju = Math.min(N, j + 1);
        const kl = j * (N + 1) + il, kr = j * (N + 1) + ir, kd = jd * (N + 1) + i, ku = ju * (N + 1) + i;
        const ex = pos[kr * 3] - pos[kl * 3], ey = pos[kr * 3 + 1] - pos[kl * 3 + 1], ez = pos[kr * 3 + 2] - pos[kl * 3 + 2];
        const fx = pos[ku * 3] - pos[kd * 3], fy = pos[ku * 3 + 1] - pos[kd * 3 + 1], fz = pos[ku * 3 + 2] - pos[kd * 3 + 2];
        // n = f x e  (rows go south -> +z in three)
        let nx = fy * ez - fz * ey, ny = fz * ex - fx * ez, nz = fx * ey - fy * ex;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const l = Math.hypot(nx, ny, nz) || 1;
        nrm[k * 3] = nx / l; nrm[k * 3 + 1] = ny / l; nrm[k * 3 + 2] = nz / l;
      }
    }
    // skirts
    const size = Math.abs(pos[N * 3] - pos[0]);
    const drop = 15 + size * 0.015;
    const edge = [];
    for (let i = 0; i < N; i++) edge.push(i);                          // top row (north)
    for (let j = 0; j < N; j++) edge.push(j * (N + 1) + N);            // right col
    for (let i = N; i > 0; i--) edge.push(N * (N + 1) + i);            // bottom row
    for (let j = N; j > 0; j--) edge.push(j * (N + 1));                // left col
    let sv = verts;
    const idx = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, d = a + N + 1, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    for (let e = 0; e < edge.length; e++) {
      const k = edge[e], k2 = edge[(e + 1) % edge.length];
      pos[sv * 3] = pos[k * 3];
      pos[sv * 3 + 1] = pos[k * 3 + 1] - drop;
      pos[sv * 3 + 2] = pos[k * 3 + 2];
      nrm[sv * 3] = nrm[k * 3]; nrm[sv * 3 + 1] = nrm[k * 3 + 1]; nrm[sv * 3 + 2] = nrm[k * 3 + 2];
      const s1 = sv, s2 = e + 1 < edge.length ? sv + 1 : verts;
      idx.push(k, k2, s1, k2, s2, s1);
      sv++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, sv * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm.subarray(0, sv * 3), 3));
    geo.setIndex(sv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (minH + maxH) / 2, 0), Math.hypot(size, size, maxH - minH) / 2 + drop);
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(center.x, 0, -center.y);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.frustumCulled = true;
    mesh.userData.chunk = c.key;
    if (c.mesh) this._dropChunk(c);
    c.mesh = mesh;
    c.tris = idx.length / 3;
    c.dataZ = best ? best.tile.z : 0;
    c.heights = heights;
    c.N = N;
    c.dirty = false;
    this.group.add(mesh);
  }

  // Mark chunks for rebuild (e.g. terrain modifiers changed: new airport).
  invalidate() { for (const c of this.chunks.values()) c.dirty = true; }

  // Ground height at frame coords using the best cached data + modifiers.
  heightAt(x, y) {
    const ll = this.world.frame.toLatLon(x, y);
    let h = this.provider.heightLatLon(ll.lat, ll.lon);
    const mods = this.world.terrainModifiers;
    for (let m = 0; m < mods.length; m++) h = mods[m](x, y, h);
    return h;
  }
}
