// Renders the computer-controlled aircraft simulated by the C++ traffic
// system (positions are in the airport's frame) and the cosmetic ground
// vehicles: cars on real road geometry and airport service vehicles.
import * as THREE from 'three';
import { createAIAircraft } from '../aircraft/models.js';
import { LightBatch } from '../world/lights.js';

export const PHASE = ['none', 'parked', 'pushback', 'taxi-out', 'holding', 'line-up', 'takeoff', 'climb', 'approach', 'landing', 'rollout', 'taxi-in', 'go-around', 'arrived'];
const GROUND_PHASES = new Set([1, 2, 3, 4, 5, 10, 11, 13]);
const AI_SPAN = [35, 26, 60, 11];  // wingspan by AI type (core kTypes)

export class TrafficView {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.models = new Map(); // slot -> {obj, type}
    this.agents = [];
    this.lights = new LightBatch(game.world, 'ai-lights', 40 * 6);
    this.world.scene.add(this.lights.points);
    this.lightSlots = new Map();
  }

  attach(airport) {
    this.airport = airport;
    for (const m of this.models.values()) this.world.scene.remove(m.obj);
    this.models.clear();
  }

  // Player vs AI aircraft: fuselage and wing of the AI as two boxes in its
  // own axes, the player as a disc of its half-span.
  _collide(x, y, zc, hdg, type, phase, speed) {
    const p = this.game.player, o = p.o;
    if (o.crashed) return;
    const span = AI_SPAN[type] || 35, len = type === 3 ? 8.5 : span * 1.05;
    const dx = o.x - x, dy = o.y - y;
    if (dx * dx + dy * dy > (len + 12) ** 2 || Math.abs(o.z - zc) > span * 0.22 + 2) return;
    const along = dx * Math.sin(hdg) + dy * Math.cos(hdg), lat = dx * Math.cos(hdg) - dy * Math.sin(hdg);
    const r = 5.2;  // Skylark half-span
    const fus = type === 3 ? 0.7 : span * 0.06;
    const hitFuselage = Math.abs(along) < len / 2 && Math.abs(lat) < fus + r;
    const hitWing = Math.abs(along + span * 0.04) < r + span * 0.08 && Math.abs(lat) < span / 2 + r * 0.6;
    if (hitFuselage || hitWing) {
      p.core.crash(5);
      p.crashText = 'collision with traffic';
      p.crashInfo = { type, phase, aiSpeed: +speed.toFixed(1), part: hitFuselage ? 'fuselage' : 'wing', along: Math.round(along), lat: Math.round(lat), playerGs: +o.gs.toFixed(1) };
    }
  }

  update(dt, camPos) {
    const core = this.game.core;
    if (!this.airport) return;
    core.tfcUpdate(dt);
    const st = core.tfcState, stride = core.tfcStride, n = core.tfcMaxAgents;
    const owner = this.airport.owner;
    this.agents.length = 0;
    const w = {};
    for (let i = 0; i < n; i++) {
      const s = i * stride;
      const active = st[s] > 0.5;
      let m = this.models.get(i);
      if (!active) {
        if (m) { this.world.scene.remove(m.obj); this.models.delete(i); this._lightsOff(i); }
        continue;
      }
      const type = st[s + 9] | 0, callsign = st[s + 11] | 0;
      if (!m || m.type !== type || m.callsign !== callsign) {
        if (m) this.world.scene.remove(m.obj);
        const obj = createAIAircraft(type, callsign);
        this.world.scene.add(obj);
        m = { obj, type, callsign, gearH: obj.userData.gearHeight || 1.0 };
        this.models.set(i, m);
      }
      owner.toWorld(st[s + 1], st[s + 2], w);
      const phase = st[s + 8] | 0;
      let z = st[s + 3];
      const onGround = GROUND_PHASES.has(phase) || (phase === 6 && st[s + 14] < 0.1 && st[s + 5] < 0.07);
      if (onGround) z = this.world.heightAt(w.x, w.y);
      const hdg = st[s + 4], pitch = st[s + 5], roll = st[s + 6];
      const o = m.obj;
      o.position.set(w.x, z + (type === 3 ? 0.98 : m.gearH) * (onGround || st[s + 12] > 0.5 ? 1 : 0.6), -w.y);
      o.rotation.order = 'YXZ';
      o.rotation.set(pitch, -hdg, -roll);
      if (o.userData.gear) o.userData.gear.visible = st[s + 12] > 0.5;
      const lightsBits = st[s + 10] | 0;
      this._lights(i, o, lightsBits, type);
      const dist = Math.hypot(camPos.x - o.position.x, camPos.y - o.position.y, camPos.z - o.position.z);
      this.agents.push({ slot: i, phase, callsign, type, speed: st[s + 7], runway: st[s + 13] | 0, x: w.x, y: w.y, z, dist, waiting: st[s + 15] > 0.5 });
      this._collide(w.x, w.y, o.position.y, hdg, type, phase, st[s + 7]);
    }
    this.lights.flush();
  }

  _lights(i, obj, bits, type) {
    let ids = this.lightSlots.get(i);
    if (!ids) {
      ids = this.lights.add([[0, 0, 0, 0.9, 0, 0, [1, 0.1, 0.08]], [0, 0, 0, 0.9, 0, 0, [0.1, 1, 0.25]], [0, 0, 0, 1.6, 2, Math.random(), [1, 0.1, 0.05]], [0, 0, 0, 2.6, 2, Math.random(), [1, 1, 1]], [0, 0, 0, 3.0, 0, 0, [1, 0.97, 0.9]]]);
      this.lightSlots.set(i, ids);
    }
    const span = [35, 26, 60, 11][type] / 2;
    const pts = [[-span, 0.5, 2], [span, 0.5, 2], [0, 3.2, 4], [0, 0.3, 2], [0, -1.2, -6]];
    const on = [bits & 1, bits & 1, bits & 2, bits & 4, bits & 8];
    const v = new THREE.Vector3();
    obj.updateMatrixWorld();
    pts.forEach((p, k) => {
      v.set(p[0], p[1], p[2] * (type === 3 ? 0.25 : 1)).applyMatrix4(obj.matrixWorld);
      const id = ids[k];
      this.lights.pos[id * 3] = v.x; this.lights.pos[id * 3 + 1] = v.y; this.lights.pos[id * 3 + 2] = v.z;
      this.lights.lgt[id * 4] = on[k] ? this.lights.base[id] : 0;
    });
    this.lights.dirty = true;
  }

  _lightsOff(i) {
    const ids = this.lightSlots.get(i);
    if (ids) { for (const id of ids) this.lights.lgt[id * 4] = 0; this.lights.dirty = true; }
  }

  clear() {
    for (const m of this.models.values()) this.world.scene.remove(m.obj);
    this.models.clear();
    for (const i of [...this.lightSlots.keys()]) this._lightsOff(i);
    this.agents.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Cars & service vehicles following real road polylines near the camera
// ---------------------------------------------------------------------------
const SPEED = { 1: 27, 2: 22, 3: 14, 4: 12, 5: 11, 6: 8, 7: 6 };
export class Vehicles {
  constructor(world, max = 220) {
    this.world = world;
    this.max = max;
    const body = new THREE.BoxGeometry(1.8, 1.4, 4.4);
    body.translate(0, 0.75, 0);
    this.mesh = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    world.scene.add(this.mesh);
    this.cars = [];
    this.lights = new LightBatch(world, 'vehicle-lights', max * 2);
    world.scene.add(this.lights.points);
    this.timer = 0;
    this.palette = [0xe8e8e8, 0x202020, 0x8a8f96, 0x1d3f7a, 0x8c1c1c, 0xd8d0c0, 0x2f5a3a, 0xf2c200];
  }

  setDensity(n) { this.target = Math.min(this.max, n); }

  _roads(camWorld) {
    const out = [];
    for (const r of this.world.regions) {
      const loc = r.toRegion(camWorld.x, camWorld.y);
      const T = r.manifest.tileSize;
      const cx = Math.floor(loc.x / T), cy = Math.floor(loc.y / T);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const t = r.tiles.get(`${cx + dx},${cy + dy}`);
        if (!t || !t.data) continue;
        for (const l of t.data.lines) if (l.cls >= 1 && l.cls <= 7 && !(l.flags & 1) && l.pts.length >= 4) out.push({ r, l });
      }
    }
    return out;
  }

  update(dt, camWorld) {
    const target = this.target ?? 0;
    this.timer -= dt;
    if (this.timer <= 0 && this.cars.length < target && camWorld.z - this.world.heightAt(camWorld.x, camWorld.y) < 2500) {
      this.timer = 0.05;
      const roads = this._roads(camWorld);
      if (roads.length) {
        for (let k = 0; k < 6 && this.cars.length < target; k++) {
          const pick = roads[(Math.random() * roads.length) | 0];
          const isService = pick.l.cls === 7;
          this.cars.push({ road: pick, seg: 0, t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1, speed: (SPEED[pick.l.cls] || 9) * (0.8 + Math.random() * 0.4), color: isService ? 0xf2c200 : this.palette[(Math.random() * this.palette.length) | 0], service: isService });
        }
      }
    }
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), c = new THREE.Color();
    const w = {};
    const night = this.world.shared.uNight.value;
    let n = 0;
    this.lights.used = 0;
    this.lights.free.length = 0;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const pts = car.road.l.pts;
      const nseg = pts.length / 2 - 1;
      const ax = pts[car.seg * 2], ay = pts[car.seg * 2 + 1], bx = pts[car.seg * 2 + 2], by = pts[car.seg * 2 + 3];
      const L = Math.hypot(bx - ax, by - ay) || 1;
      car.t += (car.speed * dt * car.dir) / L;
      if (car.t > 1 || car.t < 0) {
        car.seg += car.dir;
        car.t = car.dir > 0 ? 0 : 1;
        if (car.seg < 0 || car.seg >= nseg) { this.cars.splice(i, 1); continue; }
        continue;
      }
      const x = ax + (bx - ax) * car.t, y = ay + (by - ay) * car.t;
      const ux = (bx - ax) / L * car.dir, uy = (by - ay) / L * car.dir;
      // drive on the right
      const ox = x + uy * 1.8, oy = y - ux * 1.8;
      car.road.r.toWorld(ox, oy, w);
      if (Math.hypot(w.x - camWorld.x, w.y - camWorld.y) > 2600) { this.cars.splice(i, 1); continue; }
      const g = this.world.heightAt(w.x, w.y);
      p.set(w.x, g + 0.25, -w.y);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(ux, uy) + Math.PI);
      M.compose(p, q, s);
      if (n < this.max) {
        this.mesh.setMatrixAt(n, M);
        this.mesh.setColorAt(n, c.setHex(car.color));
        n++;
      }
      if (night > 0.2 && this.lights.used < this.lights.cap - 2) {
        this.lights.add([[w.x + ux * 2.4, g + 0.9, -(w.y + uy * 2.4), 0.7, 0, 0, [1, 0.95, 0.8]], [w.x - ux * 2.4, g + 0.9, -(w.y - uy * 2.4), 0.45, 0, 0, [1, 0.1, 0.05]]]);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.lights.dirty = true;
    this.lights.flush();
  }

  clear() { this.cars.length = 0; this.mesh.count = 0; }
}
