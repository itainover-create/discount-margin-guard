// World orchestrator: scene graph, floating-origin GeoFrame, terrain LOD,
// baked regions, airports (detailed or generic), landmarks, ocean, sky and
// weather. Provides ground queries (height, normal, surface) for physics.
import * as THREE from 'three';
import { GeoFrame, haversine } from './geo.js';
import { TerrainProvider, TerrainSystem, GlobalDem } from './terrain.js';
import { createSharedUniforms, waterMaterial } from './shaders.js';
import { Region } from './region.js';
import { Airport, genericAirportData, estimateMagVar, SURF } from './airport.js';
import { Landmarks } from './landmarks.js';
import { Sky } from './sky.js';
import { Weather } from './weather.js';
import { PackStore } from '../util/pack.js';
import { detectEncoding, fetchJson, fetchJsonGz } from '../util/net.js';

export class World {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.base = opts.dataBase || './data/';
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xb0c0d0, 0.00002);
    this.shared = createSharedUniforms();
    this.packs = new PackStore(64);
    this.terrainModifiers = [];
    this.regions = [];
    this.airports = [];        // built Airport objects
    this.frame = new GeoFrame(0, 0);
    this.fieldElevation = 0;
    this.cameraAlt = 0;
    this.time = 0;
    this.settings = { online: opts.online !== false, quality: 'high' };
    this.status = { terrain: '', place: '' };
  }

  async init(progress = () => {}) {
    progress('Loading catalogue');
    await detectEncoding(this.base);
    this.catalog = await fetchJson(this.base + 'catalog.json');
    progress('Loading global elevation');
    this.globalDem = await GlobalDem.load(this.base + 'global/dem.png');
    const tIndex = await fetchJson(this.base + 'terrain/index.json');
    this.terrainProvider = new TerrainProvider({ base: this.base, bundledIndex: tIndex.tiles, online: this.settings.online, globalDem: this.globalDem, packs: this.packs });
    this.terrain = new TerrainSystem(this, this.terrainProvider);
    this.scene.add(this.terrain.group);
    progress('Loading airport database');
    this.airportDb = await fetchJsonGz(this.base + 'airports.json.gz');
    this.airportIndex = new Map(this.airportDb.rows.map((r) => [r[0], r]));
    // ocean
    this.ocean = this._makeOcean();
    this.scene.add(this.ocean);
    this.sky = new Sky(this, this.scene);
    this.weather = new Weather(this);
    this.scene.add(this.weather.group);
    this.landmarks = new Landmarks(this);
    this.staticGroup = new THREE.Group();
    this.staticGroup.name = 'static';
    this.scene.add(this.staticGroup);
  }

  _makeOcean() {
    // radial disc (dense near centre) following the camera; curved in shader
    const rings = 40, segs = 64;
    const pos = [], idx = [];
    for (let r = 0; r <= rings; r++) {
      const rad = r === 0 ? 0 : 30 * Math.pow(1.24, r);
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segs; s++) {
        const a = r * segs + s, b = r * segs + ((s + 1) % segs), c = a + segs, d = b + segs;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, waterMaterial(this.shared));
    m.frustumCulled = false;
    m.renderOrder = -1;
    return m;
  }

  // -------------------------------------------------------------------------
  // Place setup: a catalogue region (detailed) or any airport in the database
  // -------------------------------------------------------------------------
  regionForAirport(icao) {
    return this.catalog.regions.find((r) => r.airports.some((a) => a.icao === icao)) || null;
  }

  async loadPlace({ icao, lat, lon }, progress = () => {}) {
    this.clearPlace();
    this.urbanGlow = 0.25;   // light pollution at night: a built city region glows on the horizon
    this.shared.uUrban.value = 0;
    let entry = icao ? this.regionForAirport(icao) : null;
    if (!entry && lat !== undefined) {
      entry = this.catalog.regions.find((r) => lon > r.bbox[0] && lon < r.bbox[2] && lat > r.bbox[1] && lat < r.bbox[3]) || null;
    }
    if (entry) {
      this.frame = new GeoFrame(entry.anchor.lat, entry.anchor.lon);
      progress(`Loading ${entry.name}`);
      const region = new Region(this, entry, this.base);
      await region.load();
      this.regions.push(region);
      this.scene.add(region.group);
      this.terrainModifiers.push(region.terrainModifier());
      this.landmarks.addRegion(region);
      for (const ap of region.manifest.airports) {
        const data = await fetchJson(`${this.base}regions/${entry.id}/airports/${ap.icao}.json`);
        const owner = this._ownerForRegion(region);
        const airport = new Airport(this, data, owner);
        airport.region = region;
        airport.detail = ap.detail;
        this.airports.push(airport);
        this.terrainModifiers.push(airport.terrainModifier());
      }
      region.bindShader(this.shared);
      this.status.place = `${entry.name} — tier ${entry.tier}`;
      this.placeTier = entry.tier;
      this.urbanGlow = ['nyc', 'tlv', 'las', 'la'].includes(entry.id) ? 1 : 0.55;
      this.shared.uUrban.value = ['nyc', 'tlv', 'la'].includes(entry.id) ? 1 : entry.id === 'las' ? 0.7 : 0.3;
      this.magVar = region.manifest.magVar;
    } else {
      const row = this.airportIndex.get(icao);
      const plat = row ? row[6] : lat, plon = row ? row[7] : lon;
      this.frame = new GeoFrame(plat, plon);
      this.shared.uRegionInfo.value.w = 0;
      if (row) await this._addGenericAirport(row);
      this.placeTier = 'G';
      this.status.place = row ? `${row[2]} — global tier (generic scenery)` : 'Global tier';
    }
    this.shared.uLat.value = this.frame.lat0;
    this.shared.uSnowLine.value = 4800 - Math.max(0, Math.abs(this.frame.lat0) - 25) * 75;
    // prefetch bundled terrain around the place, then build airports
    progress('Loading terrain');
    await this._prefetchTerrain(this.frame.lat0, this.frame.lon0);
    progress('Building airports');
    for (const a of this.airports) a.build();
    this.terrain.invalidate();
    if (this.airports[0]) this.fieldElevation = this.airports[0].elev;
  }

  async _addGenericAirport(row) {
    const F = this.airportDb.fields;
    const tmpFrame = this.frame;
    const data0 = genericAirportData(row, F, this.airportDb.runwayFields, tmpFrame, 0);
    const mv = estimateMagVar(data0.runways);
    const data = genericAirportData(row, F, this.airportDb.runwayFields, tmpFrame, mv);
    this.magVar = mv;
    const g = new THREE.Group();
    g.name = 'generic-site';
    this.scene.add(g);
    const owner = { frame: tmpFrame, group: g, toWorld: (x, y, o = {}) => { const a = this._ownerAffine(tmpFrame); o.x = a.sx * x + a.tx; o.y = y + a.ty; return o; },
      toLocal: (x, y, o = {}) => { const a = this._ownerAffine(tmpFrame); o.x = (x - a.tx) / a.sx; o.y = y - a.ty; return o; } };
    owner.updateTransform = () => { const a = this._ownerAffine(tmpFrame); g.position.set(a.tx, 0, -a.ty); g.scale.set(a.sx, 1, 1); g.updateMatrixWorld(true); };
    owner.updateTransform();
    this.genericOwners = (this.genericOwners || []).concat([owner]);
    const airport = new Airport(this, data, owner);
    airport.detail = true;
    this.airports.push(airport);
    this.terrainModifiers.push(airport.terrainModifier());
    // generic airports get a terminal and hangar block
    this._genericBuildings(airport, g);
  }

  _ownerAffine(frame) {
    if (!frame._cache || frame._cache.f !== this.frame) frame._cache = { f: this.frame, a: frame.affineTo(this.frame) };
    return frame._cache.a;
  }

  _ownerForRegion(region) {
    return {
      frame: region.frame, group: region.group,
      toWorld: (x, y, o) => region.toWorld(x, y, o), toLocal: (x, y, o) => region.toRegion(x, y, o),
    };
  }

  _genericBuildings(ap, group) {
    const d = ap.data;
    const a = d.aprons[0];
    if (!a) return;
    const r = a.rings[0];
    // terminal along the far side of the apron, hangar at one end
    const mx = (r[2][0] + r[3][0]) / 2, my = (r[2][1] + r[3][1]) / 2;
    const ex = r[2][0] - r[3][0], ey = r[2][1] - r[3][1];
    const len = Math.hypot(ex, ey);
    const ux = ex / len, uy = ey / len, nx = -uy, ny = ux;
    const z = ap.targetHeight(mx, my);
    const mat = new THREE.MeshLambertMaterial({ color: 0xc8c6c0 });
    const glass = new THREE.MeshLambertMaterial({ color: 0x506070 });
    const term = new THREE.Mesh(new THREE.BoxGeometry(len * 0.7, 12, 30), [mat, mat, mat, mat, glass, glass]);
    term.position.set(mx + nx * 20, z + 6, -(my + ny * 20));
    term.rotation.y = -Math.atan2(ux, uy) + Math.PI / 2;
    const hang = new THREE.Mesh(new THREE.BoxGeometry(60, 16, 50), new THREE.MeshLambertMaterial({ color: 0x9aa3ab }));
    hang.position.set(r[3][0] - ux * 50 + nx * 10, z + 8, -(r[3][1] - uy * 50 + ny * 10));
    hang.rotation.y = term.rotation.y;
    group.add(term, hang);
  }

  async _prefetchTerrain(lat, lon) {
    // request the bundled/online tiles around the start point at zoom 12-13
    const reqs = [];
    for (const z of [10, 11, 12, 13]) {
      const n = 1 << z;
      const x = Math.floor(((lon + 180) / 360) * n);
      const r = lat * Math.PI / 180;
      const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
      const k = z >= 12 ? 1 : 0;
      for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) reqs.push(this.terrainProvider.request(z, x + dx, y + dy));
    }
    await Promise.race([Promise.all(reqs), new Promise((res) => setTimeout(res, 12000))]);
  }

  clearPlace() {
    for (const r of this.regions) { r.dispose(); this.scene.remove(r.group); }
    for (const o of this.genericOwners || []) this.scene.remove(o.group);
    this.genericOwners = [];
    this.regions = [];
    this.airports = [];
    this.terrainModifiers = [];
    this.landmarks = new Landmarks(this);
    this.terrain && this.terrain.dispose();
  }

  // -------------------------------------------------------------------------
  // Floating origin: rebase the frame when the camera is far from the origin.
  // Returns the affine map so dynamic objects can be converted, or null.
  maybeRebase(camX, camY, limit = 22000) {
    if (Math.abs(camX) < limit && Math.abs(camY) < limit) return null;
    const ll = this.frame.toLatLon(camX, camY);
    const old = this.frame;
    this.frame = new GeoFrame(ll.lat, ll.lon);
    const a = old.affineTo(this.frame);
    for (const r of this.regions) { r.updateTransform(); r.bindShader(this.shared); }
    for (const o of this.genericOwners || []) o.updateTransform();
    this.terrain.dispose();
    this.shared.uLat.value = this.frame.lat0;
    return a;
  }

  // -------------------------------------------------------------------------
  heightAt(x, y) { return this.terrain.heightAt(x, y); }
  heightAtLocal(owner, x, y) { const w = owner.toWorld(x, y, {}); return this.heightAt(w.x, w.y); }

  // Ground under a world point for the physics core: height, normal, surface.
  groundAt(x, y) {
    const h = this.heightAt(x, y);
    // Central differences over the aircraft's footprint: the core extends this
    // plane to the wheels, wingtips and tail, so a local kink must not tilt it.
    const d = 4.0;
    const sx = (this.heightAt(x + d, y) - this.heightAt(x - d, y)) / (2 * d);
    const sy = (this.heightAt(x, y + d) - this.heightAt(x, y - d)) / (2 * d);
    let nx = -sx, ny = -sy, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    let surface = SURF.GRASS;
    let onAirport = false;
    for (const a of this.airports) {
      const loc = a.owner.toLocal(x, y, {});
      const s = a.surfaceAtLocal(loc.x, loc.y);
      if (s >= 0) { surface = s; onAirport = s !== SURF.GRASS; break; }
    }
    if (!onAirport) {
      let found = false;
      for (const r of this.regions) {
        if (r.containsWorld(x, y)) { surface = r.surfaceAt(x, y); found = true; break; }
      }
      if (!found && h < 0.3) surface = SURF.WATER;
    }
    if (h < -0.5) surface = SURF.WATER;
    return { h: Math.max(h, surface === SURF.WATER ? 0 : h), nE: nx, nN: ny, nU: nz, surface };
  }

  // Building collision test near a point (cheap: heights of loaded tiles).
  // -------------------------------------------------------------------------
  update(dt, camera, camWorld, date) {
    this.time += dt;
    this.cameraAlt = camWorld.z;
    this.shared.uTime.value = this.time;
    this.shared.uCamPos.value.copy(camera.position);
    const ll = this.frame.toLatLon(camWorld.x, camWorld.y);
    this.sky.update(date, ll.lat, ll.lon, this.weather, camera.position);
    this.weather.update(dt, camWorld, camera.position, this.sky);
    this.terrain.update(camWorld);
    for (const r of this.regions) r.update(camWorld);
    for (const r of this.regions) r.lights.flush();
    const wind = { dirFrom: this.weather.state.windDir, speedKt: this.weather.state.windKt };
    for (const a of this.airports) a.update(dt, wind);
    this.landmarks.update();
    this.ocean.position.set(camera.position.x, 0, camera.position.z);
    const scale = Math.max(1, camWorld.z / 600);
    this.ocean.scale.set(scale, 1, scale);
    this.status.terrain = this.terrainProvider.status();
  }

  nearestAirports(lat, lon, n = 8) {
    const out = [];
    for (const r of this.airportDb.rows) {
      const d = haversine(lat, lon, r[6], r[7]);
      if (d < 600000) out.push([d, r]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return out.slice(0, n);
  }
}
