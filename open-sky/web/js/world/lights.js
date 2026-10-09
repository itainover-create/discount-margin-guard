// Batched point lights (runway/taxiway/approach/street/obstruction lights).
// One THREE.Points per batch with a free-list so tiles can add/remove lights.
import * as THREE from 'three';
import { lightMaterial } from './shaders.js';

export class LightBatch {
  constructor(world, name, capacity = 40000) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.lgt = new Float32Array(capacity * 4);
    this.dir = new Float32Array(capacity * 4);
    this.base = new Float32Array(capacity); // original intensity
    this.free = [];
    this.used = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLight', new THREE.BufferAttribute(this.lgt, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aDir', new THREE.BufferAttribute(this.dir, 4).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.material = world.lightMaterial || (world.lightMaterial = lightMaterial(world.shared, world.renderer));
    this.points = new THREE.Points(g, this.material);
    this.points.name = name;
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.dirty = false;
  }

  // items: [x, y, z (three coords), intensity, mode, phase, [r,g,b], dir?[x,y,z,w]]
  add(items) {
    const ids = [];
    for (const it of items) {
      let i = this.free.length ? this.free.pop() : this.used < this.cap ? this.used++ : -1;
      if (i < 0) break;
      this.pos[i * 3] = it[0]; this.pos[i * 3 + 1] = it[1]; this.pos[i * 3 + 2] = it[2];
      const c = it[6] || [1, 1, 1];
      this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
      this.lgt[i * 4] = it[3]; this.lgt[i * 4 + 1] = it[4] || 0; this.lgt[i * 4 + 2] = it[5] || 0; this.lgt[i * 4 + 3] = 0;
      const d = it[7] || [0, 0, 1, 0];
      this.dir[i * 4] = d[0]; this.dir[i * 4 + 1] = d[1]; this.dir[i * 4 + 2] = d[2]; this.dir[i * 4 + 3] = d[3] || 0;
      this.base[i] = it[3];
      ids.push(i);
    }
    this.dirty = true;
    return ids;
  }
  remove(ids) {
    for (const i of ids) { this.lgt[i * 4] = 0; this.base[i] = 0; this.free.push(i); }
    this.dirty = true;
  }
  setVisible(ids, on) {
    for (const i of ids) this.lgt[i * 4] = on ? this.base[i] : 0;
    this.dirty = true;
  }
  setIntensity(ids, k) {
    for (const i of ids) this.lgt[i * 4] = this.base[i] * k;
    this.dirty = true;
  }
  flush() {
    if (!this.dirty) return;
    this.geo.setDrawRange(0, this.used);
    for (const n of ['position', 'color', 'aLight', 'aDir']) this.geo.attributes[n].needsUpdate = true;
    this.dirty = false;
  }
  dispose() { this.geo.dispose(); }
}
