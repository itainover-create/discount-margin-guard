// Interactive globe for choosing where to fly: Earth texture generated from
// the global elevation layer, region markers, airport points, picking and
// great-circle route arcs. Uses its own small WebGL renderer.
import * as THREE from 'three';
import { GlobalDem } from '../world/terrain.js';
import { gcInterpolate } from '../world/geo.js';

const D2R = Math.PI / 180;

function latLonToVec(lat, lon, r = 1) {
  const p = lat * D2R, l = lon * D2R;
  return new THREE.Vector3(r * Math.cos(p) * Math.sin(l), r * Math.sin(p), r * Math.cos(p) * Math.cos(l));
}
function vecToLatLon(v) {
  const n = v.clone().normalize();
  return { lat: Math.asin(n.y) / D2R, lon: Math.atan2(n.x, n.z) / D2R };
}

export class Globe {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    this.dist = 3.6;
    this.rot = new THREE.Quaternion();
    this.earth = new THREE.Group();
    this.scene.add(this.earth);
    this.listeners = {};
    this.labels = [];
    this.focus = null;
    this._build();
    this._events();
    this.resize();
  }

  on(k, f) { this.listeners[k] = f; }

  _build() {
    const dem = this.world.globalDem;
    const W = 2048, H = 1024;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const lat = 90 - ((y + 0.5) / H) * 180;
      for (let x = 0; x < W; x++) {
        const v = dem.rawAt(Math.floor((x / W) * dem.w), Math.floor((y / H) * dem.h));
        const i = (y * W + x) * 4;
        let r, gg, b;
        if (v === 0) {
          const k = 1 - Math.abs(lat) / 120;
          r = 12 * k + 8; gg = 46 * k + 14; b = 92 * k + 30;
        } else {
          const h = GlobalDem.decode(v);
          const t = Math.max(0, Math.min(1, h / 3500));
          const polar = Math.abs(lat) > 62 || h > 4200 ? 1 : 0;
          const arid = Math.abs(lat) > 15 && Math.abs(lat) < 33 ? 0.6 : 0;
          r = 70 + t * 110 + arid * 70; gg = 110 + t * 50 - arid * 10; b = 60 + t * 40;
          if (polar) { r = 225; gg = 232; b = 240; }
        }
        img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // graticule
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    for (let lo = -180; lo <= 180; lo += 30) { const x = ((lo + 180) / 360) * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let la = -60; la <= 60; la += 30) { const y = ((90 - la) / 180) * H; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshPhongMaterial({ map: tex, shininess: 12, specular: 0x223344 }));
    // three's sphere uv: u=0 at lon -90?  rotate so lon 0 faces +z
    sphere.rotation.y = -Math.PI / 2;
    this.sphere = sphere;
    this.earth.add(sphere);
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.025, 64, 32), new THREE.MeshBasicMaterial({ color: 0x4f8fff, transparent: true, opacity: 0.12, side: THREE.BackSide }));
    this.earth.add(atmo);
    this.scene.add(new THREE.AmbientLight(0x8899aa, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(3, 2, 4);
    this.scene.add(sun);
    // airports (large & medium) as points
    const rows = this.world.airportDb.rows.filter((r) => r[9] !== 'S');
    const pos = new Float32Array(rows.length * 3), col = new Float32Array(rows.length * 3);
    rows.forEach((r, i) => {
      const v = latLonToVec(r[6], r[7], 1.003);
      pos.set([v.x, v.y, v.z], i * 3);
      const big = r[9] === 'L';
      col.set(big ? [1, 0.75, 0.45] : [0.75, 0.85, 1], i * 3);
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85 }));
    this.earth.add(this.points);
    // featured regions
    this.regionMarkers = this.world.catalog.regions.map((r) => {
      const v = latLonToVec(r.anchor.lat, r.anchor.lon, 1.012);
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: r.tier === 'A' ? 0xff7a2a : 0x4b8dff }));
      m.position.copy(v);
      this.earth.add(m);
      const el = document.createElement('div');
      el.className = 'globe-label';
      el.textContent = r.name;
      el.style.cssText = 'position:absolute;pointer-events:none;font:600 12px "Exo 2",sans-serif;color:#fff;text-shadow:0 1px 4px #000;white-space:nowrap;transform:translate(8px,-50%)';
      this.canvas.parentElement.appendChild(el);
      this.labels.push({ el, v });
      return m;
    });
    // places in development: flyable at the global tier, marked as such
    for (const r of this.world.catalog.planned || []) {
      const v = latLonToVec(r.anchor.lat, r.anchor.lon, 1.012);
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 6), new THREE.MeshBasicMaterial({ color: 0x8a96a8 }));
      m.position.copy(v);
      this.earth.add(m);
      const el = document.createElement('div');
      el.className = 'globe-label';
      el.textContent = `${r.name} (${r.status === 'in development' ? 'in dev.' : 'planned'})`;
      el.style.cssText = 'position:absolute;pointer-events:none;font:400 11px "Exo 2",sans-serif;color:#b9c4d6;text-shadow:0 1px 4px #000;white-space:nowrap;transform:translate(8px,-50%)';
      this.canvas.parentElement.appendChild(el);
      this.labels.push({ el, v });
    }
    this.selMarker = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.026, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    this.selMarker.visible = false;
    this.earth.add(this.selMarker);
    this.arc = null;
    this.setView(30, -40);
  }

  setView(lat, lon) {
    // rotate earth so (lat, lon) faces the camera (+z)
    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -lon * D2R);
    const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lat * D2R);
    this.target = q2.multiply(q1);
    if (!this.rotInit) { this.rot.copy(this.target); this.rotInit = true; }
  }

  flyTo(lat, lon, dist = 2.2) { this.setView(lat, lon); this.targetDist = dist; }

  select(lat, lon) {
    const v = latLonToVec(lat, lon, 1.004);
    this.selMarker.position.copy(v);
    this.selMarker.lookAt(v.clone().multiplyScalar(2));
    this.selMarker.visible = true;
  }

  setArc(a, b) {
    if (this.arc) { this.earth.remove(this.arc); this.arc.geometry.dispose(); this.arc = null; }
    if (!a || !b) return;
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const p = gcInterpolate(a.lat, a.lon, b.lat, b.lon, i / 64);
      pts.push(latLonToVec(p.lat, p.lon, 1.006 + Math.sin((i / 64) * Math.PI) * 0.02));
    }
    this.arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffb000 }));
    this.earth.add(this.arc);
  }

  _events() {
    let drag = null;
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; c.setPointerCapture(e.pointerId); this.target = null; });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX; drag.y = e.clientY;
      const s = 0.005 * (this.dist - 1);
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * s);
      const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * s);
      this.rot.premultiply(qy).premultiply(qx);
    });
    c.addEventListener('pointerup', (e) => {
      if (drag && drag.moved < 5) this._pick(e);
      drag = null;
    });
    c.addEventListener('wheel', (e) => { this.dist = Math.min(6, Math.max(1.15, this.dist * (1 + e.deltaY * 0.001))); this.targetDist = null; e.preventDefault(); }, { passive: false });
  }

  _pick(e) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const hit = rc.intersectObject(this.sphere)[0];
    if (!hit) return;
    const local = this.earth.worldToLocal(hit.point.clone());
    const ll = vecToLatLon(local);
    if (this.listeners.pick) this.listeners.pick(ll);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(10, r.width), h = Math.max(10, r.height);
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame(dt) {
    if (!this.canvas.offsetParent) return;
    if (this.target) this.rot.slerp(this.target, Math.min(1, dt * 3));
    if (this.targetDist) this.dist += (this.targetDist - this.dist) * Math.min(1, dt * 3);
    this.earth.quaternion.copy(this.rot);
    this.camera.position.set(0, 0, this.dist);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
    const r = this.canvas.getBoundingClientRect();
    for (const L of this.labels) {
      const wv = L.v.clone().applyQuaternion(this.earth.quaternion);
      const facing = wv.z > 0.15;
      const p = wv.clone().project(this.camera);
      L.el.style.display = facing ? 'block' : 'none';
      L.el.style.left = `${((p.x + 1) / 2) * r.width}px`;
      L.el.style.top = `${((1 - p.y) / 2) * r.height}px`;
    }
  }
}
