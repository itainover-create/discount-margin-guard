// Airport: builds runways (procedural markings), taxiways, aprons, hold-short
// markings, signs, the lighting system (edge, threshold/end, centreline,
// touchdown zone, approach lights with sequenced flashers, PAPI, taxiway
// edge/centreline, apron floods, beacon), windsock and tower; flattens the
// terrain under the airfield; feeds the taxi graph and runways to the C++
// traffic/runway authority. Coordinates: the owner's frame (region frame or
// a generic airport frame); the owner's group maps them into the world.
import * as THREE from 'three';
import { roadMaterial, runwayMaterial, decalMaterial } from './shaders.js';
import { LightBatch } from './lights.js';
import { mergeBaked, buildAtlas, placeMatrix } from './batch.js';

const D2R = Math.PI / 180;
export const SURF = { NONE: 0, ASPHALT: 1, GRASS: 2, WATER: 3, CONCRETE: 4 };

// ---------------------------------------------------------------------------
// canvas textures (cached)
// ---------------------------------------------------------------------------
const texCache = new Map();
function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

function designatorTex(ident) {
  const num = ident.replace(/[LRC]/g, '');
  const letter = ident.replace(/[0-9]/g, '');
  return canvasTex('des:' + ident, 256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#f2f2ee';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 230px "Arial Narrow", Arial, sans-serif';
    g.save();
    g.scale(0.75, 1);
    g.fillText(num, (w / 2) / 0.75, h * 0.27);
    if (letter) g.fillText(letter, (w / 2) / 0.75, h * 0.76);
    g.restore();
  });
}

function holdShortTex() {
  return canvasTex('holdshort', 512, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#d9a91f';
    const lw = h / 9;
    g.fillRect(0, lw * 0.5, w, lw);            // solid (hold side)
    g.fillRect(0, lw * 2.5, w, lw);
    for (let x = 0; x < w; x += 40) {          // dashed (runway side)
      g.fillRect(x, lw * 5, 24, lw);
      g.fillRect(x, lw * 7, 24, lw);
    }
  });
}

function signTex(text, kind) {
  return canvasTex(`sign:${kind}:${text}`, 256, 64, (g, w, h) => {
    g.fillStyle = kind === 'rwy' ? '#c4161c' : kind === 'loc' ? '#111' : '#e8c21a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = kind === 'rwy' ? '#fff' : kind === 'loc' ? '#e8c21a' : '#111';
    g.font = 'bold 44px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
    if (kind === 'loc') { g.strokeStyle = '#e8c21a'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); }
  });
}

function sockTex() {
  return canvasTex('windsock', 128, 32, (g, w, h) => {
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i % 2 ? '#f5f5f5' : '#ff5a12';
      g.fillRect((i * w) / 5, 0, w / 5 + 1, h);
    }
  });
}

// ---------------------------------------------------------------------------
export class Airport {
  constructor(world, data, owner) {
    this.world = world;
    this.data = data;
    this.owner = owner;               // { toWorld, toLocal, group, frame }
    this.icao = data.icao;
    this.group = new THREE.Group();
    this.group.name = 'airport:' + data.icao;
    owner.group.add(this.group);
    this.elev = data.elevation;
    this.magVar = data.magVar || 0;
    this.synthetic = !!data.synthetic;
    this.prepareRunways();
    this.flatten = this.buildFlattenRaster();
  }

  // ---------------------------------------------------------------------
  prepareRunways() {
    this.rw = this.data.runways.map((r, i) => {
      const ax = r.le.x, ay = r.le.y, bx = r.he.x, by = r.he.y;
      const L = Math.hypot(bx - ax, by - ay);
      const ux = (bx - ax) / L, uy = (by - ay) / L;
      const hdgT = (Math.atan2(ux, uy) / D2R + 360) % 360;
      const mk = (end, dir) => ({
        ident: end.ident, x: end.x, y: end.y, z: end.z, disp: end.disp || 0,
        hdgTrue: dir === 0 ? hdgT : (hdgT + 180) % 360,
        hdgMag: (((dir === 0 ? hdgT : hdgT + 180) - this.magVar) % 360 + 360) % 360,
        dir, rw: i,
        // threshold point (after displacement)
        tx: end.x + (dir === 0 ? ux : -ux) * (end.disp || 0),
        ty: end.y + (dir === 0 ? uy : -uy) * (end.disp || 0),
      });
      return { ...r, i, L, W: r.width, ux, uy, hdgT, ends: [mk(r.le, 0), mk(r.he, 1)] };
    });
  }

  runwayHeight(rw, x, y) {
    const r = this.rw[rw];
    const s = Math.max(0, Math.min(r.L, (x - r.le.x) * r.ux + (y - r.le.y) * r.uy));
    return r.le.z + (r.he.z - r.le.z) * (s / r.L);
  }
  // runway index the local point is on (with lateral margin), else -1
  runwayAt(x, y, margin = 0) {
    for (const r of this.rw) {
      const dx = x - r.le.x, dy = y - r.le.y;
      const s = dx * r.ux + dy * r.uy, l = -dx * r.uy + dy * r.ux;
      if (s > -margin && s < r.L + margin && Math.abs(l) < r.W / 2 + margin) return r.i;
    }
    return -1;
  }
  // along/lateral coordinates relative to a runway end's threshold
  runwayCoords(end, x, y) {
    const r = this.rw[end.rw];
    const ux = end.dir === 0 ? r.ux : -r.ux, uy = end.dir === 0 ? r.uy : -r.uy;
    const dx = x - end.tx, dy = y - end.ty;
    return { along: dx * ux + dy * uy, lateral: dx * uy - dy * ux, ux, uy };
  }
  endByIdent(ident) {
    for (const r of this.rw) for (const e of r.ends) if (e.ident === ident) return e;
    return null;
  }

  // ---------------------------------------------------------------------
  // Terrain flattening: rasterise paved areas (10 m cells), blur into a
  // blend mask; target height = nearest runway profile.
  buildFlattenRaster() {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const ext = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    for (const r of this.rw) { ext(r.le.x, r.le.y); ext(r.he.x, r.he.y); }
    for (const t of this.data.taxiways) for (const p of t.pts) ext(p[0], p[1]);
    for (const a of this.data.aprons) for (const p of a.rings[0]) ext(p[0], p[1]);
    const pad = 350, res = 10;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const W = Math.ceil((x1 - x0) / res), H = Math.ceil((y1 - y0) / res);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    const tx = (x) => (x - x0) / res, ty = (y) => (y1 - y) / res;
    g.strokeStyle = '#fff';
    g.fillStyle = '#fff';
    g.lineCap = 'round';
    for (const r of this.rw) {
      g.lineWidth = (r.W + 90) / res;
      g.beginPath(); g.moveTo(tx(r.le.x - r.ux * 60), ty(r.le.y - r.uy * 60)); g.lineTo(tx(r.he.x + r.ux * 60), ty(r.he.y + r.uy * 60)); g.stroke();
    }
    for (const t of this.data.taxiways) {
      g.lineWidth = (t.kind === 'taxiway' ? 60 : 44) / res;
      g.beginPath();
      t.pts.forEach((p, i) => (i ? g.lineTo(tx(p[0]), ty(p[1])) : g.moveTo(tx(p[0]), ty(p[1]))));
      g.stroke();
    }
    for (const a of this.data.aprons) {
      g.beginPath();
      a.rings[0].forEach((p, i) => (i ? g.lineTo(tx(p[0]), ty(p[1])) : g.moveTo(tx(p[0]), ty(p[1]))));
      g.closePath();
      g.fill();
      g.lineWidth = 30 / res;
      g.stroke();
    }
    const src = g.getImageData(0, 0, W, H).data;
    let m = new Float32Array(W * H);
    for (let i = 0; i < m.length; i++) m[i] = src[i * 4] / 255;
    // box blur twice (~12 cells) for a smooth blend into natural terrain
    const blur = (a, r) => {
      const o = new Float32Array(a.length);
      for (let y = 0; y < H; y++) {
        let s = 0;
        for (let x = -r; x <= r; x++) s += a[y * W + Math.min(W - 1, Math.max(0, x))];
        for (let x = 0; x < W; x++) {
          o[y * W + x] = s / (2 * r + 1);
          s += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)];
        }
      }
      const o2 = new Float32Array(a.length);
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let y = -r; y <= r; y++) s += o[Math.min(H - 1, Math.max(0, y)) * W + x];
        for (let y = 0; y < H; y++) {
          o2[y * W + x] = s / (2 * r + 1);
          s += o[Math.min(H - 1, y + r + 1) * W + x] - o[Math.max(0, y - r) * W + x];
        }
      }
      return o2;
    };
    const solid = m;
    m = blur(blur(m, 4), 4);
    for (let i = 0; i < m.length; i++) m[i] = Math.max(solid[i], Math.min(1, m[i] * 1.6));
    return { x0, y1, res, W, H, m };
  }

  // Height target for paved surfaces: nearest runway profile (clamped).
  // Field surface height: each runway's profile, blended smoothly between
  // runways (a hard nearest-runway choice leaves a step where runways of
  // different elevation meet, which upsets the gear on the taxiways).
  targetHeight(x, y) {
    const n = this.rw.length;
    if (!n) return this.elev;
    const hs = this._th || (this._th = new Float64Array(n)), ds = this._td || (this._td = new Float64Array(n));
    let dmin = 1e18;
    for (let i = 0; i < n; i++) {
      const r = this.rw[i];
      const s = Math.max(0, Math.min(r.L, (x - r.le.x) * r.ux + (y - r.le.y) * r.uy));
      const px = r.le.x + r.ux * s, py = r.le.y + r.uy * s;
      ds[i] = Math.hypot(x - px, y - py);
      hs[i] = r.le.z + (r.he.z - r.le.z) * (s / r.L);
      if (ds[i] < dmin) dmin = ds[i];
    }
    let sw = 0, sh = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.exp(-(ds[i] - dmin) / 60);
      sw += w; sh += w * hs[i];
    }
    return sh / sw;
  }

  maskAt(x, y) {
    const f = this.flatten;
    const fx = (x - f.x0) / f.res, fy = (f.y1 - y) / f.res;
    if (fx < 0 || fy < 0 || fx >= f.W - 1 || fy >= f.H - 1) return 0;
    const ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy;
    const m = f.m, W = f.W;
    return (m[iy * W + ix] * (1 - ax) + m[iy * W + ix + 1] * ax) * (1 - ay) + (m[(iy + 1) * W + ix] * (1 - ax) + m[(iy + 1) * W + ix + 1] * ax) * ay;
  }

  terrainModifier() {
    const tmp = {};
    return (xw, yw, h) => {
      this.owner.toLocal(xw, yw, tmp);
      const k = this.maskAt(tmp.x, tmp.y);
      if (k <= 0) return h;
      const t = this.targetHeight(tmp.x, tmp.y);
      return h + (t - h) * k;
    };
  }

  surfaceAtLocal(x, y) {
    if (this.runwayAt(x, y, 4) >= 0) return SURF.ASPHALT;
    const k = this.maskAt(x, y);
    if (k > 0.98) return SURF.CONCRETE;
    if (k > 0.2) return SURF.GRASS;
    return -1;
  }

  // ---------------------------------------------------------------------
  build(opts = {}) {
    const shared = this.world.shared;
    this.lights = new LightBatch(this.world, 'airport-lights:' + this.icao, 30000);
    this.group.add(this.lights.points);
    this.rwMat = runwayMaterial(shared);
    this.padMat = roadMaterial(shared);
    this._buildRunways();
    this._buildTaxiways();
    this._buildAprons();
    this._buildHoldShort();
    this._buildRunwayLights();
    this._buildTaxiLights();
    this._buildTower();
    this._buildWindsock();
    this.lights.flush();
  }

  _h(x, y) { return this.targetHeight(x, y); }

  _buildRunways() {
    const pos = [], uv = [], rwA = [], idx = [], des = [];
    for (const r of this.rw) {
      const segs = Math.max(2, Math.ceil(r.L / 150));
      const half = r.W / 2 + 7.5;
      const nx = -r.uy, ny = r.ux;
      const base = pos.length / 3;
      for (let i = 0; i <= segs; i++) {
        const s = (r.L * i) / segs;
        const cx = r.le.x + r.ux * s, cy = r.le.y + r.uy * s;
        const z = r.le.z + (r.he.z - r.le.z) * (i / segs) + 0.08;
        for (const side of [-1, 1]) {
          pos.push(cx + nx * half * side, z, -(cy + ny * half * side));
          uv.push(half * side, s);
          rwA.push(r.W, r.L, r.le.disp || 0, r.he.disp || 0);
        }
        if (i > 0) {
          const a = base + (i - 1) * 2;
          // left(-1) then right(+1) per row
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      // designators at both ends (one atlas, one draw call for the airport)
      for (const e of r.ends) {
        const ux = e.dir === 0 ? r.ux : -r.ux, uy = e.dir === 0 ? r.uy : -r.uy;
        const s0 = 60, len = Math.min(42, r.W * 0.9), wid = Math.min(16, r.W * 0.36);
        const cx = e.tx + ux * (s0 + len / 2), cy = e.ty + uy * (s0 + len / 2);
        const geo = new THREE.PlaneGeometry(wid, len);
        geo.rotateX(-Math.PI / 2);
        // plane's +y (text up) after rotateX points to -z (north); rotate to runway direction
        des.push({ geo, matrix: placeMatrix(cx, this.runwayHeight(r.i, cx, cy) + 0.12, -cy, -Math.atan2(ux, uy)), tex: designatorTex(e.ident) });
      }
    }
    this._decalBatch(des, 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    g.setAttribute('aRw', new THREE.BufferAttribute(new Float32Array(rwA), 4));
    g.setIndex(idx);
    g.computeBoundingSphere();
    // fix triangle winding (front faces up)
    const P = g.attributes.position.array, I = g.index.array;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const cr = (P[b] - P[a]) * (-(P[c + 2]) + P[a + 2]) - (-(P[b + 2]) + P[a + 2]) * (P[c] - P[a]);
      if (cr < 0) { const tmp = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = tmp; }
    }
    const mesh = new THREE.Mesh(g, this.rwMat);
    mesh.renderOrder = 1;
    this.group.add(mesh);
  }

  _ribbon(list, out) {
    // list: [{pts:[[x,y]...], w, cls, lift}]
    for (const it of list) {
      const pts = it.pts;
      if (pts.length < 2) continue;
      const base = out.pos.length / 3;
      let v = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let dx = b[0] - a[0], dy = b[1] - a[1];
        const dl = Math.hypot(dx, dy) || 1;
        dx /= dl; dy /= dl;
        const px = -dy * it.w / 2, py = dx * it.w / 2;
        if (i) v += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
        const z = this._h(x, y) + it.lift;
        out.pos.push(x - px, z, -(y - py), x + px, z, -(y + py));
        out.uv.push(0, v, 1, v);
        out.info.push(it.cls, it.w, 0, it.cls, it.w, 0);
        if (i) {
          const k = base + (i - 1) * 2;
          out.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
        }
      }
    }
  }

  _meshFrom(out, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(out.pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.uv), 2));
    g.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(out.info), 3));
    g.setIndex(out.idx);
    g.computeBoundingSphere();
    return new THREE.Mesh(g, mat);
  }

  _densify(pts, maxSeg) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.ceil(d / maxSeg);
      for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    return out;
  }

  _buildTaxiways() {
    const out = { pos: [], uv: [], info: [], idx: [] };
    const items = this.data.taxiways.map((t) => ({
      pts: this._densify(t.pts, 40), w: t.kind === 'taxiway' ? 23 : 16, cls: t.kind === 'taxiway' ? 80 : 81, lift: 0.06,
    }));
    // stand lead-in lines
    for (const gt of this.data.gates || []) {
      const n = this.data.graph.nodes;
      const e = this.data.graph.edges.find((ed) => ed[0] === gt.node || ed[1] === gt.node);
      if (!e) continue;
      const o = n[e[0] === gt.node ? e[1] : e[0]];
      items.push({ pts: [[o[0], o[1]], [gt.x, gt.y]], w: 0.35, cls: 82, lift: 0.09 });
    }
    this._ribbon(items, out);
    if (out.idx.length) {
      const m = this._meshFrom(out, this.padMat);
      m.renderOrder = 1;
      this.group.add(m);
    }
  }

  _buildAprons() {
    const pos = [], uv = [], info = [], idx = [];
    for (const a of this.data.aprons) {
      const contour = a.rings[0].map((p) => new THREE.Vector2(p[0], p[1]));
      const holes = a.rings.slice(1).map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
      let tris;
      try { tris = THREE.ShapeUtils.triangulateShape(contour, holes); } catch { continue; }
      const all = contour.concat(...holes);
      const base = pos.length / 3;
      for (const p of all) {
        pos.push(p.x, this._h(p.x, p.y) + 0.04, -p.y);
        uv.push(0, 0);
        info.push(90, 1, 0);
      }
      for (const t of tris) {
        const A = all[t[0]], B = all[t[1]], C = all[t[2]];
        const cr = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
        if (cr >= 0) idx.push(base + t[0], base + t[1], base + t[2]);
        else idx.push(base + t[0], base + t[2], base + t[1]);
      }
    }
    if (!idx.length) return;
    const m = this._meshFrom({ pos, uv, info, idx }, this.padMat);
    this.group.add(m);
  }

  _buildHoldShort() {
    const nodes = this.data.graph.nodes, edges = this.data.graph.edges, names = this.data.graph.names;
    const holdGeo = new THREE.PlaneGeometry(20, 3.6).rotateX(-Math.PI / 2);
    const holdGeos = [];
    this.holds = [];
    const signs = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n[2] !== 1) continue;
      // direction: from the taxiway-side neighbour toward the runway-side neighbour
      let toward = null, away = null, nm = '';
      for (const e of edges) {
        if (e[0] !== i && e[1] !== i) continue;
        const o = nodes[e[0] === i ? e[1] : e[0]];
        const rwSide = this._distToRunway(o[0], o[1], n[3]) < this._distToRunway(n[0], n[1], n[3]);
        if (rwSide) toward = o; else { away = o; nm = names[e[2]] || nm; }
      }
      if (!toward) continue;
      const dx = toward[0] - n[0], dy = toward[1] - n[1];
      const L = Math.hypot(dx, dy) || 1;
      const ux = dx / L, uy = dy / L;
      holdGeos.push({ geo: holdGeo, matrix: placeMatrix(n[0], this._h(n[0], n[1]) + 0.1, -n[1], -Math.atan2(ux, uy)) });
      this.holds.push({ node: i, x: n[0], y: n[1], ux, uy, rw: n[3], taxiway: nm });
      // signs left of the hold line, facing the holding aircraft
      const r = this.rw[n[3]];
      if (r) {
        // left of an aircraft taxiing toward the runway (left normal = (-uy, ux))
        const lx = n[0] - uy * 13 - ux * 1.5, ly = n[1] + ux * 13 - uy * 1.5;
        const face = Math.atan2(-ux, uy);
        signs.push({ x: lx, y: ly, face, text: `${r.le.ident}-${r.he.ident}`, kind: 'rwy' });
        if (nm) signs.push({ x: lx - uy * 3.2, y: ly + ux * 3.2, face, text: nm, kind: 'loc' });
      }
    }
    const hg = mergeBaked(holdGeos, { normals: false });
    if (hg) {
      const m = new THREE.Mesh(hg, decalMaterial(this.world.shared, holdShortTex()));
      m.renderOrder = 2;
      this.group.add(m);
    }
    this._buildSigns(signs);
  }

  // Painted decals with one canvas texture each -> one atlas + one merged mesh.
  _decalBatch(items, renderOrder) {
    if (!items.length) return;
    const uniq = [...new Set(items.map((d) => d.tex))];
    const atlas = buildAtlas(uniq.map((t) => t.image), { pad: 8 });
    const geo = mergeBaked(items.map((d) => ({ geo: d.geo, matrix: d.matrix, rect: atlas.rects[uniq.indexOf(d.tex)] })), { normals: false });
    const m = new THREE.Mesh(geo, decalMaterial(this.world.shared, atlas.texture));
    m.renderOrder = renderOrder;
    this.group.add(m);
  }

  _distToRunway(x, y, rw) {
    const r = this.rw[rw];
    if (!r) return 1e9;
    const dx = x - r.le.x, dy = y - r.le.y;
    return Math.abs(-dx * r.uy + dy * r.ux);
  }

  _buildSigns(signs) {
    // all sign boxes in two draw calls: the frames, and the lit faces from one atlas
    // (BoxGeometry groups: 0-3 sides/top/bottom, 4-5 the +z / -z faces)
    if (signs.length) {
      const frameGeo = new THREE.BoxGeometry(2.6, 1.0, 0.3);
      const texs = signs.map((s) => signTex(s.text, s.kind));
      const uniq = [...new Set(texs)];
      const atlas = buildAtlas(uniq.map((t) => t.image), { pad: 4 });
      const mats = signs.map((s) => placeMatrix(s.x, this._h(s.x, s.y) + 0.9, -s.y, s.face));
      const frames = mergeBaked(signs.map((s, i) => ({ geo: frameGeo, matrix: mats[i], groups: [0, 1, 2, 3] })));
      const faces = mergeBaked(signs.map((s, i) => ({ geo: frameGeo, matrix: mats[i], groups: [4, 5], rect: atlas.rects[uniq.indexOf(texs[i])] })));
      this.group.add(new THREE.Mesh(frames, new THREE.MeshLambertMaterial({ color: 0x333333 })));
      this.group.add(new THREE.Mesh(faces, new THREE.MeshBasicMaterial({ map: atlas.texture })));
    }
    // sign lights (signs are internally lit at night)
    this.lights.add(signs.map((s) => [s.x, this._h(s.x, s.y) + 0.9, -s.y, 0.35, 5, 0, s.kind === 'rwy' ? [1, 0.3, 0.3] : [1, 0.9, 0.3]]));
  }

  _buildRunwayLights() {
    const L = [];
    const white = [1, 0.97, 0.9], green = [0.2, 1, 0.35], red = [1, 0.12, 0.08], yellow = [1, 0.8, 0.25];
    for (const r of this.rw) {
      if (!r.lighted && !this.synthetic) continue;
      const nx = -r.uy, ny = r.ux;
      const zf = (s) => r.le.z + (r.he.z - r.le.z) * (s / r.L) + 0.4;
      const P = (s, l) => [r.le.x + r.ux * s + nx * l, r.le.y + r.uy * s + ny * l];
      const fwd = [r.ux, 0, -r.uy], back = [-r.ux, 0, r.uy];
      // edge lights every 60 m
      const nE = Math.floor(r.L / 60);
      for (let i = 0; i <= nE; i++) {
        const s = (r.L * i) / nE;
        for (const side of [-1, 1]) {
          const [x, y] = P(s, side * (r.W / 2 + 1.5));
          const caution = s > r.L - 600 || s < 600;
          L.push([x, zf(s), -y, 0.9, 0, 0, caution && r.L > 2400 ? yellow : white]);
        }
      }
      // thresholds (green toward approach) and ends (red toward runway)
      for (const e of r.ends) {
        const sT = e.dir === 0 ? e.disp : r.L - e.disp;
        const sE = e.dir === 0 ? 0 : r.L;
        const toApproach = e.dir === 0 ? back : fwd;
        const toRunway = e.dir === 0 ? fwd : back;
        const n = Math.max(4, Math.floor(r.W / 3));
        for (let k = 0; k <= n; k++) {
          const l = -r.W / 2 + (r.W * k) / n;
          const [x, y] = P(sT, l);
          L.push([x, zf(sT), -y, 1.3, 1, 0, green, [...toApproach, 0]]);
          const [x2, y2] = P(sE, l);
          L.push([x2, zf(sE), -y2, 1.0, 1, 0, red, [...toRunway, 0]]);
        }
      }
      // centreline (long runways): directional pairs, colour coded near the ends
      if (r.L >= 2400 && r.W >= 40) {
        for (let s = 15; s < r.L - 10; s += 30) {
          const [x, y] = P(s, 0);
          const toHe = r.L - s, toLe = s;
          const cF = toHe < 300 ? red : toHe < 900 ? (Math.floor(s / 30) % 2 ? red : white) : white;
          const cB = toLe < 300 ? red : toLe < 900 ? (Math.floor(s / 30) % 2 ? red : white) : white;
          L.push([x, zf(s) - 0.3, -y, 0.7, 1, 0, cF, [...back, 0]]);
          L.push([x, zf(s) - 0.3, -y, 0.7, 1, 0, cB, [...fwd, 0]]);
        }
      }
      // approach lighting, touchdown zone, PAPI per end
      for (const e of r.ends) {
        const into = e.dir === 0 ? 1 : -1;                 // +s direction for this end's landing
        const sT = e.dir === 0 ? e.disp : r.L - e.disp;
        const toApproach = e.dir === 0 ? back : fwd;
        const long = r.L >= 2400;
        const alsLen = long ? 720 : r.L >= 1500 ? 420 : 0;
        if (alsLen && (r.lighted || this.synthetic)) {
          for (let d = 30; d <= alsLen; d += 30) {
            const s = sT - into * d;
            const gz = Math.max(this.world.heightAtLocal(this.owner, ...P(s, 0)), 0.5) + 1.2;
            for (let k = -2; k <= 2; k++) {
              const [x, y] = P(s, k * 1.0);
              L.push([x, gz, -y, 1.1, 1, 0, white, [...toApproach, 0]]);
            }
            if (d === 300) {
              for (let k = -7; k <= 7; k++) {
                if (Math.abs(k) < 3) continue;
                const [x, y] = P(s, k * 1.5);
                L.push([x, gz, -y, 1.1, 1, 0, white, [...toApproach, 0]]);
              }
            }
            if (long && d <= 270) {
              for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
                const [x, y] = P(s, sd * (6 + k * 1.5));
                L.push([x, gz, -y, 0.9, 1, 0, red, [...toApproach, 0]]);
              }
            }
            if (d >= 300) {
              const [x, y] = P(s, 0);
              L.push([x, gz + 0.6, -y, 2.4, 4, d / alsLen, [1, 1, 1], [...toApproach, 0]]);
            }
          }
        }
        if (long) {
          for (let d = 60; d <= 900; d += 30) {
            const s = sT + into * d;
            for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
              const [x, y] = P(s, sd * (5 + k * 1.5));
              L.push([x, zf(s) - 0.3, -y, 0.6, 1, 0, white, [...toApproach, 0]]);
            }
          }
        }
        // PAPI on the left of the landing direction, ~300 m beyond threshold
        const sP = sT + into * Math.min(300, r.L * 0.2);
        const leftSide = into; // lateral sign of the left side for this landing direction
        const angles = [3.5, 3.17, 2.83, 2.5];
        for (let k = 0; k < 4; k++) {
          const [x, y] = P(sP, leftSide * (r.W / 2 + 15 + k * 9));
          L.push([x, zf(sP) + 0.4, -y, 1.6, 3, 0, [1, 1, 1], [...toApproach, angles[k]]]);
        }
      }
    }
    this.lights.add(L);
  }

  _buildTaxiLights() {
    const L = [];
    const blue = [0.25, 0.4, 1.0], green = [0.2, 1.0, 0.4];
    for (const t of this.data.taxiways) {
      const pts = this._densify(t.pts, 30);
      const w = t.kind === 'taxiway' ? 23 : 16;
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        if (this.runwayAt(x, y, 8) >= 0) continue;
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let dx = b[0] - a[0], dy = b[1] - a[1];
        const dl = Math.hypot(dx, dy) || 1;
        dx /= dl; dy /= dl;
        const z = this._h(x, y) + 0.35;
        if (i % 2 === 0) for (const sd of [-1, 1]) L.push([x - dy * sd * (w / 2 + 1), z, -(y + dx * sd * (w / 2 + 1)), 0.55, 0, 0, blue]);
        if (t.kind === 'taxiway') L.push([x, z - 0.25, -y, 0.45, 0, 0, green]);
      }
    }
    // apron flood lights on poles
    this.poles = [];
    for (const a of this.data.aprons) {
      const r = a.rings[0];
      let per = 0;
      for (let i = 1; i < r.length; i++) per += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
      if (per < 300) continue;
      let acc = 0;
      for (let i = 1; i < r.length; i++) {
        const seg = Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
        acc += seg;
        if (acc > 160) {
          acc = 0;
          const x = r[i][0], y = r[i][1];
          const z = this._h(x, y);
          L.push([x, z + 24, -y, 2.2, 5, 0, [1, 0.88, 0.7]]);
          this.poles.push([x, z, y]);
        }
      }
    }
    if (this.poles.length) {
      const g = new THREE.CylinderGeometry(0.25, 0.35, 24, 6);
      g.translate(0, 12, 0);
      const m = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0x9a9a9a }), this.poles.length);
      const M = new THREE.Matrix4();
      this.poles.forEach((p, i) => { M.makeTranslation(p[0], p[1], -p[2]); m.setMatrixAt(i, M); });
      this.group.add(m);
    }
    this.lights.add(L);
  }

  _buildTower() {
    const t = this.data.tower;
    if (!t) return;
    const z = this.world.heightAtLocal(this.owner, t.x, t.y);
    this.towerPos = { x: t.x, y: t.y, z: z + t.height - 4 };
    if (t.source !== 'overture') {
      const H = t.height;
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, H - 9, 8), new THREE.MeshLambertMaterial({ color: 0xd8d4cc }));
      shaft.position.y = (H - 9) / 2;
      const cabBase = new THREE.Mesh(new THREE.CylinderGeometry(7, 4.5, 3, 8), new THREE.MeshLambertMaterial({ color: 0xcfcac2 }));
      cabBase.position.y = H - 7.5;
      const cab = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 6.8, 4.5, 8, 1, true), new THREE.MeshPhongMaterial({ color: 0x2a3a48, specular: 0x8899aa, shininess: 80, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
      cab.position.y = H - 3.8;
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 8, 1.4, 8), new THREE.MeshLambertMaterial({ color: 0x6d6d6d }));
      roof.position.y = H - 0.9;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8), new THREE.MeshLambertMaterial({ color: 0xbbbbbb }));
      mast.position.y = H + 4;
      g.add(shaft, cabBase, cab, roof, mast);
      g.position.set(t.x, z, -t.y);
      this.group.add(g);
    }
    // rotating beacon (alternating white/green) and obstruction light
    const bz = z + t.height + 7;
    this.lights.add([
      [t.x, bz, -t.y, 3.0, 2, 0.0, [1, 1, 1]],
      [t.x + 0.3, bz, -t.y, 3.0, 2, 0.5, [0.2, 1, 0.4]],
      [t.x, bz + 1.5, -t.y, 1.2, 6, 0.3, [1, 0.1, 0.05]],
    ]);
  }

  _buildWindsock() {
    // near the touchdown zone of the longest runway, left side
    const r = this.rw.reduce((a, b) => (b.L > a.L ? b : a), this.rw[0]);
    if (!r) return;
    const s = Math.min(320, r.L * 0.25);
    const off = r.W / 2 + 70;
    const x = r.le.x + r.ux * s - r.uy * -off, y = r.le.y + r.uy * s + r.ux * -off;
    const z = this._h(x, y);
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    pole.position.y = 3;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 3.6, 12, 1, true), new THREE.MeshLambertMaterial({ map: sockTex(), side: THREE.DoubleSide }));
    cone.geometry.rotateZ(Math.PI / 2);
    cone.geometry.translate(1.8, 0, 0);
    const pivot = new THREE.Group();
    pivot.position.y = 5.8;
    pivot.add(cone);
    g.add(pole, pivot);
    g.position.set(x, z, -y);
    this.group.add(g);
    this.sock = { pivot, cone };
    this.lights.add([[x, z + 6.3, -y, 0.8, 0, 0, [1, 0.1, 0.05]]]);
  }

  update(dt, wind) {
    if (this.sock && wind) {
      // point downwind; droop at low wind speed (kt)
      const spd = wind.speedKt;
      const to = (wind.dirFrom + 180) * D2R;
      this.sock.pivot.rotation.y = Math.PI / 2 - to + (Math.sin(performance.now() * 0.002) * 0.05 * Math.min(1, spd / 10));
      this.sock.pivot.rotation.z = -Math.max(0, 1 - spd / 15) * 1.25;
    }
    this.lights.flush();
  }

  // ---------------------------------------------------------------------
  // Load the taxi graph & runways into the C++ traffic system.
  loadTraffic(core) {
    core.tfcReset();
    for (const r of this.rw) core.tfcAddRunway(r.le.x, r.le.y, r.le.z, r.he.x, r.he.y, r.he.z, r.W);
    for (const n of this.data.graph.nodes) core.tfcAddNode(n[0], n[1], n[2], n[3]);
    for (const e of this.data.graph.edges) core.tfcAddEdge(e[0], e[1], e[2]);
    core.tfcFinalize();
  }

  // Describe a node path as taxiway names: ["B", "K", ...]
  routeNames(path) {
    const names = [];
    const g = this.data.graph;
    const key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
    if (!this._edgeMap) {
      this._edgeMap = new Map();
      for (const e of g.edges) this._edgeMap.set(key(e[0], e[1]), g.names[e[2]]);
    }
    // Runs of the same taxiway name with their length; short internal hops
    // (a few metres across a connector) are dropped like a controller would.
    const nodes = g.nodes, runs = [];
    for (let i = 1; i < path.length; i++) {
      const n = this._edgeMap.get(key(path[i - 1], path[i]));
      if (!n || n === 'apron' || n.includes('/')) continue;
      const a = nodes[path[i - 1]], b = nodes[path[i]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (runs.length && runs[runs.length - 1].n === n) runs[runs.length - 1].len += len;
      else runs.push({ n, len });
    }
    const kept = runs.filter((r, i) => i === 0 || i === runs.length - 1 || r.len >= 90);
    for (const r of kept) if (names[names.length - 1] !== r.n) names.push(r.n);
    return names;
  }
}

// ---------------------------------------------------------------------------
// Generic airport (global tier): layout synthesised from real runway data.
// ---------------------------------------------------------------------------
export function genericAirportData(row, fields, rwFields, frame, magVarDeg) {
  const F = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
  const RF = (r) => Object.fromEntries(rwFields.map((f, i) => [f, r[i]]));
  const elev = F.elevFt * 0.3048;
  const runways = F.runways.map((rr, i) => {
    const r = RF(rr);
    const a = frame.toXY(r.leLat, r.leLon), b = frame.toXY(r.heLat, r.heLon);
    return {
      id: i, name: `${r.le}/${r.he}`, width: Math.max(18, r.widthFt * 0.3048), length: Math.hypot(b.x - a.x, b.y - a.y),
      surface: r.surface, lighted: r.lighted,
      le: { ident: r.le, x: a.x, y: a.y, z: r.leElevFt > -9000 ? r.leElevFt * 0.3048 : elev, disp: r.leDispFt * 0.3048 },
      he: { ident: r.he, x: b.x, y: b.y, z: r.heElevFt > -9000 ? r.heElevFt * 0.3048 : elev, disp: r.heDispFt * 0.3048 },
    };
  });
  const big = F.type !== 'S';
  const nodes = [], edges = [], names = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'apron'];
  const taxiways = [], aprons = [], gates = [], stands = [];
  const node = (x, y, t, rw) => { nodes.push([x, y, t, rw]); return nodes.length - 1; };
  const longest = runways.reduce((m, r) => Math.max(m, r.length), 0);
  const hold = longest > 2400 ? 85 : longest > 1200 ? 60 : 45;
  let apronNode = -1;
  runways.forEach((r, i) => {
    const L = r.length, ux = (r.he.x - r.le.x) / L, uy = (r.he.y - r.le.y) / L;
    const off = big ? 180 : 95;
    const nx = -uy, ny = ux;
    const P = (s, l) => [r.le.x + ux * s + nx * l, r.le.y + uy * s + ny * l];
    const name = names[1 + (i % 6)];
    const sList = [0, L * 0.5, L];
    const tNodes = [], hNodes = [], rNodes = [];
    sList.forEach((s) => {
      const [tx, ty] = P(s, off), [hx, hy] = P(s, hold), [rx, ry] = P(s, 0);
      tNodes.push(node(tx, ty, 0, -1));
      hNodes.push(node(hx, hy, 1, i));
      rNodes.push(node(rx, ry, 2, i));
    });
    for (let k = 0; k < 3; k++) {
      edges.push([tNodes[k], hNodes[k], 1 + (k % 6)], [hNodes[k], rNodes[k], 1 + (k % 6)]);
      if (k) { edges.push([tNodes[k - 1], tNodes[k], 1 + (i % 6)]); edges.push([rNodes[k - 1], rNodes[k], 0]); }
      taxiways.push({ name: names[1 + (k % 6)], kind: 'taxiway', pts: [nodes[tNodes[k]].slice(0, 2), nodes[rNodes[k]].slice(0, 2)] });
    }
    taxiways.push({ name, kind: 'taxiway', pts: tNodes.map((n) => nodes[n].slice(0, 2)) });
    if (i === 0) {
      // apron beyond the parallel taxiway at mid-field
      const [ax, ay] = P(L * 0.5, off + (big ? 130 : 70));
      const w = big ? 320 : 140, d = big ? 160 : 80;
      const ring = [P(L * 0.5 - w / 2, off + 25), P(L * 0.5 + w / 2, off + 25), P(L * 0.5 + w / 2, off + 25 + d), P(L * 0.5 - w / 2, off + 25 + d)];
      aprons.push({ name: 'Main apron', rings: [ring] });
      apronNode = node(ax, ay, 0, -1);
      edges.push([tNodes[1], apronNode, 7]);
      for (let k = 0; k < 4; k++) {
        const [gx, gy] = P(L * 0.5 - w / 2 + 40 + k * ((w - 80) / 3), off + 25 + d - 30);
        const gn = node(gx, gy, 3, -1);
        edges.push([gn, apronNode, 7]);
        const hdg = (Math.atan2(nx, ny) / D2R + 360) % 360;
        gates.push({ ref: String(k + 1), x: gx, y: gy, hdg, node: gn });
        stands.push({ name: `Stand ${k + 1}`, x: gx, y: gy, hdg: (hdg + 180) % 360, node: gn, ga: true });
      }
    } else if (apronNode >= 0) {
      edges.push([tNodes[1], apronNode, 7]);
    }
  });
  const r0 = runways[0];
  const L0 = r0.length, ux0 = (r0.he.x - r0.le.x) / L0, uy0 = (r0.he.y - r0.le.y) / L0;
  const tw = { x: r0.le.x + ux0 * L0 * 0.5 - uy0 * (big ? 520 : 240), y: r0.le.y + uy0 * L0 * 0.5 + ux0 * (big ? 520 : 240) };
  return {
    icao: F.ident, iata: F.iata, name: F.name, city: F.city, country: F.country, elevation: elev,
    magVar: magVarDeg, holdDistance: hold, runways, taxiways, aprons, helipads: [], gates, stands,
    tower: { x: tw.x, y: tw.y, height: big ? 45 : 18, source: 'synthetic' },
    graph: { nodes, edges, names }, synthetic: true,
    source: 'Runways: OurAirports (real position/heading/length). Taxiways, apron and buildings: generic (synthetic).',
  };
}

// Estimate magnetic variation from runway idents vs true headings (±5°).
export function estimateMagVar(runways) {
  const vals = [];
  for (const r of runways) {
    const n = parseInt(r.le.ident, 10);
    if (!n) continue;
    const t = (Math.atan2(r.he.x - r.le.x, r.he.y - r.le.y) / D2R + 360) % 360;
    let d = t - n * 10;
    d = ((d + 540) % 360) - 180;
    if (Math.abs(d) < 30) vals.push(d);
  }
  if (!vals.length) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
