// Builds renderable city geometry for one 1 km region tile: extruded
// buildings (with simple pitched roofs for small houses), road/rail ribbons
// draped on terrain (elevated bridges with piers), street lights, trees and
// towers. All geometry is positioned in the current world frame.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Palettes per regional architectural style (used when data has no colour)
// ---------------------------------------------------------------------------
const PAL = {
  nyc: {
    res: [[0.55, 0.30, 0.24], [0.62, 0.38, 0.30], [0.48, 0.28, 0.22], [0.45, 0.33, 0.27], [0.80, 0.76, 0.66], [0.64, 0.63, 0.60], [0.84, 0.83, 0.80]],
    com: [[0.76, 0.72, 0.62], [0.60, 0.60, 0.59], [0.40, 0.41, 0.43], [0.70, 0.66, 0.58], [0.55, 0.50, 0.45]],
    tall: [[0.42, 0.50, 0.58], [0.30, 0.36, 0.44], [0.56, 0.60, 0.64], [0.22, 0.26, 0.32], [0.70, 0.68, 0.62]],
    ind: [[0.50, 0.47, 0.42], [0.60, 0.56, 0.50], [0.45, 0.45, 0.46]],
    roofFlat: [[0.36, 0.36, 0.37], [0.30, 0.30, 0.31], [0.48, 0.47, 0.45], [0.78, 0.78, 0.76]],
    roofPitch: [[0.30, 0.30, 0.33], [0.40, 0.30, 0.25], [0.55, 0.30, 0.22]],
  },
  mediterranean: {
    res: [[0.90, 0.88, 0.84], [0.86, 0.82, 0.72], [0.82, 0.78, 0.68], [0.70, 0.69, 0.66], [0.92, 0.91, 0.88]],
    com: [[0.80, 0.78, 0.74], [0.66, 0.66, 0.65], [0.86, 0.84, 0.78]],
    tall: [[0.45, 0.55, 0.62], [0.82, 0.84, 0.85], [0.35, 0.42, 0.50], [0.60, 0.66, 0.70]],
    ind: [[0.70, 0.68, 0.62], [0.62, 0.60, 0.56]],
    roofFlat: [[0.70, 0.68, 0.64], [0.55, 0.54, 0.52], [0.82, 0.82, 0.80]],
    roofPitch: [[0.66, 0.36, 0.26], [0.55, 0.32, 0.25]],
  },
  desert: {
    res: [[0.80, 0.70, 0.55], [0.85, 0.78, 0.64], [0.76, 0.58, 0.45], [0.90, 0.86, 0.78]],
    com: [[0.82, 0.76, 0.66], [0.70, 0.66, 0.60], [0.88, 0.85, 0.80]],
    tall: [[0.72, 0.60, 0.36], [0.52, 0.42, 0.32], [0.88, 0.86, 0.82], [0.40, 0.45, 0.52]],
    ind: [[0.72, 0.68, 0.60], [0.62, 0.60, 0.56]],
    roofFlat: [[0.80, 0.80, 0.78], [0.62, 0.58, 0.52], [0.50, 0.48, 0.45]],
    roofPitch: [[0.64, 0.42, 0.32], [0.58, 0.52, 0.46]],
  },
  alpine: {
    res: [[0.92, 0.90, 0.86], [0.88, 0.84, 0.74], [0.90, 0.82, 0.58], [0.88, 0.74, 0.70], [0.82, 0.86, 0.80]],
    com: [[0.86, 0.84, 0.80], [0.70, 0.70, 0.70], [0.80, 0.76, 0.66]],
    tall: [[0.60, 0.64, 0.68], [0.85, 0.85, 0.84]],
    ind: [[0.70, 0.70, 0.68], [0.60, 0.62, 0.64]],
    roofFlat: [[0.45, 0.45, 0.46], [0.60, 0.60, 0.58]],
    roofPitch: [[0.40, 0.25, 0.20], [0.30, 0.30, 0.32], [0.55, 0.30, 0.22], [0.35, 0.28, 0.24]],
  },
  tropical: {
    res: [[0.92, 0.92, 0.90], [0.86, 0.86, 0.75], [0.75, 0.84, 0.86], [0.88, 0.80, 0.72], [0.70, 0.70, 0.68]],
    com: [[0.85, 0.85, 0.82], [0.70, 0.72, 0.72], [0.80, 0.78, 0.70]],
    tall: [[0.55, 0.65, 0.70], [0.86, 0.86, 0.84], [0.40, 0.50, 0.58]],
    ind: [[0.70, 0.70, 0.68], [0.60, 0.62, 0.64]],
    roofFlat: [[0.55, 0.55, 0.54], [0.75, 0.75, 0.73]],
    roofPitch: [[0.42, 0.40, 0.40], [0.58, 0.32, 0.25], [0.30, 0.42, 0.40]],
  },
};
const STYLE_ID = { nyc: 0, mediterranean: 1, desert: 2, alpine: 3, tropical: 4 };
export function styleId(s) { return STYLE_ID[s] ?? 0; }

const ROAD_W = { 1: 22, 2: 17, 3: 13, 4: 11, 5: 9, 6: 7.5, 7: 4.5, 8: 6, 9: 3.5, 20: 4.5, 21: 4.5, 22: 4, 23: 4 };
const ROAD_LIFT = { 1: 0.34, 2: 0.32, 3: 0.30, 4: 0.28, 5: 0.26, 6: 0.24, 7: 0.20, 8: 0.20, 9: 0.18, 20: 0.22, 21: 0.22, 22: 0.22, 23: 0.24 };

function pick(arr, h) { return arr[h % arr.length]; }
function unpackRGB(c) { return [((c >>> 24) & 255) / 255, ((c >>> 16) & 255) / 255, ((c >>> 8) & 255) / 255]; }

// ---------------------------------------------------------------------------
// Geometry accumulator with compact attributes
// ---------------------------------------------------------------------------
class Acc {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.info = []; this.col = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  vert(x, y, z, nx, ny, nz, u, v, info, col) {
    this.pos.push(x, y, z);
    this.nrm.push(Math.round(nx * 127), Math.round(ny * 127), Math.round(nz * 127));
    this.uv.push(u, v);
    this.info.push(info[0], info[1], info[2], info[3]);
    this.col.push(Math.round(col[0] * 255), Math.round(col[1] * 255), Math.round(col[2] * 255));
  }
  build() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(this.nrm), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('aInfo', new THREE.BufferAttribute(new Uint8Array(this.info), 4, true));
    g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(this.col), 3, true));
    const n = this.n;
    g.setIndex(n > 65535 ? new THREE.BufferAttribute(new Uint32Array(this.idx), 1) : new THREE.BufferAttribute(new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------
function ringArea(r) {
  let a = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += r[i * 2] * r[j * 2 + 1] - r[j * 2] * r[i * 2 + 1];
  }
  return a / 2;
}

function addWalls(acc, ring, ox, oy, z0, z1, info, col, reverse) {
  const n = ring.length / 2;
  let u = 0;
  for (let i = 0; i < n; i++) {
    const a = reverse ? (n - i) % n : i;
    const b = reverse ? (n - i - 1 + n) % n : (i + 1) % n;
    const ax = ring[a * 2] - ox, ay = ring[a * 2 + 1] - oy, bx = ring[b * 2] - ox, by = ring[b * 2 + 1] - oy;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.05) continue;
    const nx = dy / len, ny = -dx / len; // outward (right side) for CCW
    const k = acc.n;
    // three coords: x = east, y = up, z = -north
    acc.vert(ax, z0, -ay, nx, 0, -ny, u, 0, info, col);
    acc.vert(bx, z0, -by, nx, 0, -ny, u + len, 0, info, col);
    acc.vert(bx, z1, -by, nx, 0, -ny, u + len, z1 - z0, info, col);
    acc.vert(ax, z1, -ay, nx, 0, -ny, u, z1 - z0, info, col);
    acc.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    u += len;
  }
}

function addFlatRoof(acc, rings, ox, oy, z, info, col) {
  const contour = [];
  const r0 = rings[0];
  for (let i = 0; i < r0.length; i += 2) contour.push(new THREE.Vector2(r0[i] - ox, r0[i + 1] - oy));
  const holes = [];
  for (let h = 1; h < rings.length; h++) {
    const hr = [];
    for (let i = 0; i < rings[h].length; i += 2) hr.push(new THREE.Vector2(rings[h][i] - ox, rings[h][i + 1] - oy));
    holes.push(hr);
  }
  let tris;
  try { tris = THREE.ShapeUtils.triangulateShape(contour, holes); } catch { return; }
  const all = contour.concat(...holes);
  const k = acc.n;
  for (const p of all) acc.vert(p.x, z, -p.y, 0, 1, 0, p.x + ox, p.y + oy, info, col);
  for (const t of tris) {
    // keep triangles counter-clockwise seen from above (front faces)
    const a = all[t[0]], b = all[t[1]], c = all[t[2]];
    const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (cr >= 0) acc.idx.push(k + t[0], k + t[1], k + t[2]);
    else acc.idx.push(k + t[0], k + t[2], k + t[1]);
  }
}

function faceNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}
function addPoly3(acc, pts, info, col) {
  // pts in three coords, convex polygon; normal from first triangle, made to face up/out
  let n = faceNormal(pts[0], pts[1], pts[2]);
  const k = acc.n;
  for (const p of pts) acc.vert(p[0], p[1], p[2], n[0], n[1], n[2], p[0], -p[2], info, col);
  for (let i = 1; i < pts.length - 1; i++) acc.idx.push(k, k + i, k + i + 1);
}

// Gabled / hipped / pyramidal roof for 4-corner footprints (CCW ring).
function addPitchedRoof(acc, ring, ox, oy, zE, rh, type, infoRoof, infoWall, roofCol, wallCol) {
  const P = [];
  for (let i = 0; i < 4; i++) P.push([ring[i * 2] - ox, ring[i * 2 + 1] - oy]);
  const len = (a, b) => Math.hypot(P[b][0] - P[a][0], P[b][1] - P[a][1]);
  // rotate so P0->P1 is a long edge
  if (len(0, 1) < len(1, 2)) P.push(P.shift());
  const mid = (a, b) => [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2];
  const W = len(1, 2);
  const zR = zE + rh;
  let m1 = mid(1, 2), m3 = mid(3, 0);
  const t3 = (p, z) => [p[0], z, -p[1]];
  if (type === 3) {
    const c = [(P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4];
    for (let i = 0; i < 4; i++) addPoly3(acc, [t3(P[i], zE), t3(P[(i + 1) % 4], zE), t3(c, zR)], infoRoof, roofCol);
    return;
  }
  if (type === 2) {
    const L = Math.hypot(m1[0] - m3[0], m1[1] - m3[1]);
    const inset = Math.min(W * 0.5, L * 0.45) / Math.max(L, 0.01);
    const r1 = [m1[0] + (m3[0] - m1[0]) * inset, m1[1] + (m3[1] - m1[1]) * inset];
    const r3 = [m3[0] + (m1[0] - m3[0]) * inset, m3[1] + (m1[1] - m3[1]) * inset];
    m1 = r1; m3 = r3;
    addPoly3(acc, [t3(P[1], zE), t3(P[2], zE), t3(m1, zR)], infoRoof, roofCol);
    addPoly3(acc, [t3(P[3], zE), t3(P[0], zE), t3(m3, zR)], infoRoof, roofCol);
  } else {
    addPoly3(acc, [t3(P[1], zE), t3(P[2], zE), t3(m1, zR)], infoWall, wallCol);
    addPoly3(acc, [t3(P[3], zE), t3(P[0], zE), t3(m3, zR)], infoWall, wallCol);
  }
  addPoly3(acc, [t3(P[0], zE), t3(P[1], zE), t3(m1, zR), t3(m3, zR)], infoRoof, roofCol);
  addPoly3(acc, [t3(P[2], zE), t3(P[3], zE), t3(m3, zR), t3(m1, zR)], infoRoof, roofCol);
}

export function buildBuildings(tile, ctx) {
  const { toWorld, heightAt, style } = ctx;
  const pal = PAL[style] || PAL.nyc;
  const near = new Acc(), far = new Acc();
  const { ox, oy } = ctx; // world-frame origin for this tile mesh
  let maxH = 0, count = 0;
  const wp = { x: 0, y: 0 };
  for (const b of tile.buildings) {
    const rings = b.rings.map((r) => {
      const o = new Float64Array(r.length);
      for (let i = 0; i < r.length; i += 2) { toWorld(r[i], r[i + 1], wp); o[i] = wp.x; o[i + 1] = wp.y; }
      return o;
    });
    const r0 = rings[0];
    const nv = r0.length / 2;
    if (nv < 3) continue;
    // terrain base: min of a few samples
    let base = 1e9;
    const step = Math.max(1, Math.floor(nv / 5));
    for (let i = 0; i < nv; i += step) base = Math.min(base, heightAt(r0[i * 2], r0[i * 2 + 1]));
    if (!(base < 1e8)) base = 0;
    const area = Math.abs(ringArea(r0));
    const h = b.h, isPart = (b.flags & 2) !== 0;
    const tall = h > 60;
    const hsh = b.hash >>> 0;
    let wall;
    if (b.color) wall = unpackRGB(b.color);
    else if (tall) wall = pick(pal.tall, hsh);
    else if (b.sub === 2 || b.sub === 4 || b.sub === 6 || b.sub === 8 || b.sub === 9) wall = pick(pal.com, hsh);
    else if (b.sub === 3 || b.sub === 7 || b.sub === 10 || b.sub === 12) wall = pick(pal.ind, hsh);
    else wall = pick(pal.res, hsh);
    // roof type
    let roof = b.roof;
    if (roof === 255) {
      roof = 0;
      const small = area < 320 && h < 15 && nv === 4 && rings.length === 1 && !isPart;
      if (small && (b.sub === 1 || b.sub === 11 || b.sub === 0)) {
        const r = (hsh >>> 8) % 100;
        if (style === 'alpine') roof = r < 70 ? 1 : 2;
        else if (style === 'nyc') roof = area < 200 && r < 45 ? 1 : 0;
        else if (style === 'tropical') roof = r < 50 ? 2 : 0;
      }
    }
    if (roof !== 0 && !(nv === 4 && rings.length === 1)) roof = 0;
    const roofCol = b.roofColor ? unpackRGB(b.roofColor) : (roof === 0 ? pick(pal.roofFlat, hsh >>> 4) : pick(pal.roofPitch, hsh >>> 4));
    const cls = Math.min(255, b.sub);
    const seed = hsh & 255;
    const hb = Math.min(255, Math.round(h / 2));
    const infoW = [0, cls, seed, hb], infoR = [255, cls, seed, hb];
    const z0 = isPart && b.minH > 0 ? base + b.minH : base - 1.0;
    const rh = roof ? Math.min(b.roofH > 0 ? b.roofH : Math.sqrt(area) * 0.32, Math.max(2, h * 0.45)) : 0;
    const zTop = base + h;
    const zEave = zTop - rh;
    const target = (tall || area > 2500 || h > 30) ? [near, far] : [near];
    for (const acc of target) {
      const lox = ox, loy = oy;
      addWalls(acc, r0, lox, loy, z0, zEave, infoW, wall, false);
      for (let k = 1; k < rings.length; k++) addWalls(acc, rings[k], lox, loy, z0, zEave, infoW, wall, false);
      if (roof === 0 || roof >= 4) addFlatRoof(acc, rings, lox, loy, zEave, infoR, roofCol);
      else addPitchedRoof(acc, r0, lox, loy, zEave, rh, roof, infoR, infoW, roofCol, wall);
    }
    if (h > maxH) maxH = h;
    count++;
  }
  return { near: near.build(), far: far.build(), maxH, count };
}

// ---------------------------------------------------------------------------
// Roads & rail
// ---------------------------------------------------------------------------
function densify(pts, maxSeg) {
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1];
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.ceil(d / maxSeg);
    for (let k = 1; k <= n; k++) out.push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
  }
  return out;
}

export function buildRoads(tile, ctx) {
  const { toWorld, heightAt, bridgeDeck, ox, oy } = ctx;
  const pos = [], nrm = [], uv = [], info = [], idx = [];
  const piers = [];
  const lights = [];
  const wp = { x: 0, y: 0 };
  let n = 0;
  for (const l of tile.lines) {
    const w = ROAD_W[l.cls] || 6;
    const raw = new Float64Array(l.pts.length);
    for (let i = 0; i < l.pts.length; i += 2) { toWorld(l.pts[i], l.pts[i + 1], wp); raw[i] = wp.x; raw[i + 1] = wp.y; }
    const bridge = (l.flags & 1) !== 0;
    const pts = densify(raw, bridge ? 40 : 22);
    const np = pts.length / 2;
    if (np < 2) continue;
    const lift = ROAD_LIFT[l.cls] || 0.2;
    const hs = new Float64Array(np);
    if (bridge) {
      const h0 = heightAt(pts[0], pts[1]), h1 = heightAt(pts[(np - 1) * 2], pts[(np - 1) * 2 + 1]);
      const add = Math.max(0, l.level) * 6.5;
      for (let i = 0; i < np; i++) {
        const f = i / (np - 1);
        let h = Math.max(h0, 0) * (1 - f) + Math.max(h1, 0) * f + add + 0.4;
        const deck = bridgeDeck ? bridgeDeck(pts[i * 2], pts[i * 2 + 1]) : null;
        if (deck !== null) h = Math.max(h, deck);
        else h = Math.max(h, heightAt(pts[i * 2], pts[i * 2 + 1]) + 0.5, 4 + add);
        hs[i] = h;
      }
    } else {
      for (let i = 0; i < np; i++) hs[i] = heightAt(pts[i * 2], pts[i * 2 + 1]) + lift;
    }
    let v = 0;
    const base = n;
    for (let i = 0; i < np; i++) {
      const x = pts[i * 2], y = pts[i * 2 + 1];
      const i0 = Math.max(0, i - 1), i1 = Math.min(np - 1, i + 1);
      let dx = pts[i1 * 2] - pts[i0 * 2], dy = pts[i1 * 2 + 1] - pts[i0 * 2 + 1];
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      const px = -dy * w * 0.5, py = dx * w * 0.5;
      if (i > 0) v += Math.hypot(x - pts[(i - 1) * 2], y - pts[(i - 1) * 2 + 1]);
      const z = hs[i];
      pos.push(x - px - ox, z, -(y - py - oy), x + px - ox, z, -(y + py - oy));
      nrm.push(0, 1, 0, 0, 1, 0);
      uv.push(0, v, 1, v);
      info.push(l.cls, w, l.flags, l.cls, w, l.flags);
      n += 2;
      if (i > 0) {
        const a = base + (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      if (bridge && i % 2 === 1) {
        const g = heightAt(x, y);
        if (z - Math.max(g, -3) > 6) piers.push([x - ox, Math.max(g, -6), -(y - oy), z - 0.6, w]);
      }
    }
    // bridge deck sides
    if (bridge) {
      for (let s = 0; s < 2; s++) {
        const sb = n;
        let vv = 0;
        for (let i = 0; i < np; i++) {
          const k = base + i * 2 + s;
          if (i > 0) vv += Math.hypot(pts[i * 2] - pts[(i - 1) * 2], pts[i * 2 + 1] - pts[(i - 1) * 2 + 1]);
          pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], pos[k * 3], pos[k * 3 + 1] - 1.4, pos[k * 3 + 2]);
          nrm.push(0, 0, 0, 0, 0, 0);
          uv.push(0, vv, 1, vv);
          info.push(9, 1, 0, 9, 1, 0);
          n += 2;
          if (i > 0) {
            const a = sb + (i - 1) * 2;
            if (s === 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
            else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
          }
        }
      }
    }
    // street lights along urban roads
    if (l.cls >= 1 && l.cls <= 6 && np >= 2) {
      const spacing = l.cls <= 2 ? 45 : 38;
      let acc = spacing * 0.5;
      for (let i = 1; i < np; i++) {
        const ax = pts[(i - 1) * 2], ay = pts[(i - 1) * 2 + 1], bx = pts[i * 2], by = pts[i * 2 + 1];
        const seg = Math.hypot(bx - ax, by - ay);
        while (acc < seg) {
          const f = acc / seg;
          const side = (lights.length & 1) ? 1 : -1;
          const nx = -(by - ay) / seg * side * (w * 0.5 + 1), ny = (bx - ax) / seg * side * (w * 0.5 + 1);
          lights.push(ax + (bx - ax) * f + nx - ox, hs[i - 1] * (1 - f) + hs[i] * f + 8.5, -(ay + (by - ay) * f + ny - oy), l.cls <= 2 ? 1 : 0);
          acc += spacing;
        }
        acc -= seg;
      }
    }
  }
  let geo = null;
  if (idx.length) {
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(info), 3));
    geo.setIndex(n > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
    // fix zero normals of deck sides (lighting only)
    const N = geo.attributes.normal.array;
    for (let i = 0; i < N.length; i += 3) if (N[i] === 0 && N[i + 1] === 0 && N[i + 2] === 0) N[i + 1] = 0.3;
    geo.computeBoundingSphere();
  }
  return { geo, piers, lights };
}

// Concrete piers for elevated roads.
export function buildPiers(piers) {
  if (!piers.length) return null;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0x8a8782 });
  const m = new THREE.InstancedMesh(box, mat, piers.length);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  piers.forEach((pp, i) => {
    const [x, y0, z, y1, w] = pp;
    p.set(x, (y0 + y1) / 2, z);
    s.set(Math.min(3, w * 0.25), Math.max(0.5, y1 - y0), Math.min(3, w * 0.25));
    M.compose(p, q, s);
    m.setMatrixAt(i, M);
  });
  m.instanceMatrix.needsUpdate = true;
  return m;
}

// ---------------------------------------------------------------------------
// Trees: data points + scatter inside forest/park polygons
// ---------------------------------------------------------------------------
let treeGeo = null;
function getTreeGeo() {
  if (treeGeo) return treeGeo;
  const crown = new THREE.IcosahedronGeometry(1, 1);
  crown.scale(0.42, 0.55, 0.42);
  crown.translate(0, 0.62, 0);
  const trunk = new THREE.CylinderGeometry(0.05, 0.07, 0.4, 5);
  trunk.translate(0, 0.2, 0);
  const colorize = (g, c) => {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g.toNonIndexed();
  };
  const a = colorize(crown, [1, 1, 1]), b = colorize(trunk, [0.45, 0.35, 0.28]);
  const merged = new THREE.BufferGeometry();
  const pa = new Float32Array(a.attributes.position.array.length + b.attributes.position.array.length);
  pa.set(a.attributes.position.array); pa.set(b.attributes.position.array, a.attributes.position.array.length);
  const ca = new Float32Array(pa.length);
  ca.set(a.attributes.color.array); ca.set(b.attributes.color.array, a.attributes.color.array.length);
  merged.setAttribute('position', new THREE.BufferAttribute(pa, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  merged.computeVertexNormals();
  treeGeo = merged;
  return merged;
}
let treeMat = null;
function getTreeMat() {
  if (!treeMat) treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  return treeMat;
}

function pointInRing(x, y, r) {
  let inside = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2], yi = r[i * 2 + 1], xj = r[j * 2], yj = r[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function buildTrees(tile, ctx, maxTrees, style) {
  const { toWorld, heightAt, ox, oy, isWet } = ctx;
  const items = [];
  const wp = { x: 0, y: 0 };
  for (const p of tile.points) {
    if (p.kind !== 1) continue;
    toWorld(p.x, p.y, wp);
    items.push([wp.x, wp.y, p.h || 10]);
  }
  // scatter in vegetation polygons (deterministic per tile)
  let seed = (tile.tx * 73856093) ^ (tile.ty * 19349663);
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (const poly of tile.polys) {
    const dens = poly.code === 20 ? 1 / 140 : (poly.code === 23 || poly.code === 26 ? 1 / 500 : (poly.code === 31 ? 1 / 220 : (poly.code === 21 ? 1 / 700 : 0)));
    if (!dens || (poly.layer !== 1 && poly.layer !== 2 && poly.layer !== 3)) continue;
    const r = poly.rings[0];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); }
    const want = Math.min(1500, Math.abs(ringArea(r)) * dens);
    let tries = want * 3;
    let got = 0;
    while (got < want && tries-- > 0 && items.length < maxTrees * 1.5) {
      const x = x0 + (x1 - x0) * rnd(), y = y0 + (y1 - y0) * rnd();
      if (!pointInRing(x, y, r)) continue;
      if (isWet && isWet(x, y)) continue;
      toWorld(x, y, wp);
      items.push([wp.x, wp.y, 7 + rnd() * 11]);
      got++;
    }
  }
  if (!items.length) return null;
  if (items.length > maxTrees) {
    const stepK = items.length / maxTrees;
    const keep = [];
    for (let i = 0; i < maxTrees; i++) keep.push(items[Math.floor(i * stepK)]);
    items.length = 0;
    items.push(...keep);
  }
  const mesh = new THREE.InstancedMesh(getTreeGeo(), getTreeMat(), items.length);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const greens = style === 'desert' ? [[0.42, 0.45, 0.28], [0.36, 0.40, 0.24]] : style === 'mediterranean' ? [[0.30, 0.40, 0.20], [0.38, 0.45, 0.25]] : [[0.18, 0.33, 0.14], [0.24, 0.40, 0.17], [0.30, 0.42, 0.20]];
  items.forEach((it, i) => {
    const [x, y, h] = it;
    const g = heightAt(x, y);
    if (g < 0.4) { s.set(0, 0, 0); M.compose(p.set(0, -1000, 0), q, s); mesh.setMatrixAt(i, M); return; }
    p.set(x - ox, g - 0.3, -(y - oy));
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.399) % 6.28);
    const wd = h * (0.65 + 0.2 * ((i * 7) % 5) / 5);
    s.set(wd, h, wd);
    M.compose(p, q, s);
    mesh.setMatrixAt(i, M);
    const gcol = greens[i % greens.length];
    c.setRGB(gcol[0] * (0.85 + 0.3 * ((i * 13) % 7) / 7), gcol[1], gcol[2]);
    mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// Towers (power / communication / wind / lighthouse) with obstruction lights
// ---------------------------------------------------------------------------
export function buildTowers(tile, ctx) {
  const { toWorld, heightAt, ox, oy } = ctx;
  const items = [];
  const wp = { x: 0, y: 0 };
  for (const p of tile.points) {
    if (p.kind < 2) continue;
    toWorld(p.x, p.y, wp);
    items.push([p.kind, wp.x, wp.y, Math.max(10, Math.min(p.h, 400)), heightAt(wp.x, wp.y)]);
  }
  if (!items.length) return null;
  const g = new THREE.CylinderGeometry(0.15, 0.6, 1, 4, 1);
  g.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0x9a9a9a }), items.length);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const lights = [];
  items.forEach((it, i) => {
    const [kind, x, y, h, g0] = it;
    const w = kind === 2 ? 5 : kind === 4 ? 2.5 : 1.5;
    p.set(x - ox, g0, -(y - oy));
    s.set(w, h, w);
    M.compose(p, q, s);
    mesh.setMatrixAt(i, M);
    if (h > 40 || kind === 5) lights.push([x - ox, g0 + h + 0.5, -(y - oy), kind === 5 ? 2 : 6]);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, lights };
}
