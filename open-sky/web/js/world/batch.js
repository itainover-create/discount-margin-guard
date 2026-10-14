// Static batching helpers: bake many small, never-moving meshes (airport signs,
// painted decals) into one geometry per material, and pack their canvas
// textures into one atlas, so a busy airport costs a handful of draw calls
// instead of hundreds (each BoxGeometry face group is its own draw call).
import * as THREE from 'three';

const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();

// items: [{ geo, matrix, rect?: [u0, v0, u1, v1], groups?: [groupIndex...] }]
// Every geo must carry position (uv and normal optional). Returns an indexed
// BufferGeometry in the matrices' space, or null when there is nothing to merge.
export function mergeBaked(items, { normals = true } = {}) {
  let nv = 0, ni = 0;
  const plan = items.map((it) => {
    const g = it.geo;
    const idx = g.index ? g.index.array : null;
    const ranges = it.groups ? it.groups.map((k) => g.groups[k]) : [{ start: 0, count: idx ? idx.length : g.attributes.position.count }];
    nv += g.attributes.position.count;
    for (const r of ranges) ni += r.count;
    return { ...it, idx, ranges };
  });
  if (!ni) return null;
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), nor = normals ? new Float32Array(nv * 3) : null;
  const index = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const it of plan) {
    const g = it.geo, P = g.attributes.position, U = g.attributes.uv, N = g.attributes.normal;
    if (nor) _n.getNormalMatrix(it.matrix);
    const [u0, v0, u1, v1] = it.rect || [0, 0, 1, 1];
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(it.matrix);
      pos[(vo + i) * 3] = _v.x; pos[(vo + i) * 3 + 1] = _v.y; pos[(vo + i) * 3 + 2] = _v.z;
      uv[(vo + i) * 2] = U ? u0 + U.getX(i) * (u1 - u0) : 0;
      uv[(vo + i) * 2 + 1] = U ? v0 + U.getY(i) * (v1 - v0) : 0;
      if (nor) {
        if (N) _v.fromBufferAttribute(N, i).applyMatrix3(_n).normalize(); else _v.set(0, 1, 0);
        nor[(vo + i) * 3] = _v.x; nor[(vo + i) * 3 + 1] = _v.y; nor[(vo + i) * 3 + 2] = _v.z;
      }
    }
    for (const r of it.ranges) {
      for (let k = r.start; k < r.start + r.count; k++) index[io++] = vo + (it.idx ? it.idx[k] : k);
    }
    vo += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (nor) out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Pack same-sized canvases into one texture. pad: gutter (px) filled with the
// cell's own edge colours so mipmaps don't bleed a neighbour into it.
// Returns { texture, rects } with rects[i] = [u0, v0, u1, v1] (flipY layout).
export function buildAtlas(canvases, { pad = 4, maxW = 4096 } = {}) {
  if (!canvases.length) return null;
  const cw = canvases[0].width, ch = canvases[0].height;
  const sw = cw + pad * 2, sh = ch + pad * 2;
  // the column count that gives the smallest power-of-two texture
  let cols = 1, W = Infinity, H = Infinity;
  for (let c = 1; c <= Math.min(canvases.length, Math.floor(maxW / sw)); c++) {
    const w = THREE.MathUtils.ceilPowerOfTwo(c * sw), h = THREE.MathUtils.ceilPowerOfTwo(Math.ceil(canvases.length / c) * sh);
    if (w * h < W * H || (w * h === W * H && Math.abs(w - h) < Math.abs(W - H))) { cols = c; W = w; H = h; }
  }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const rects = canvases.map((cv, i) => {
    const px = (i % cols) * sw, py = Math.floor(i / cols) * sh;
    x.drawImage(cv, px, py, sw, sh);              // stretched copy fills the gutter
    x.clearRect(px + pad, py + pad, cw, ch);
    x.drawImage(cv, px + pad, py + pad);
    return [(px + pad) / W, 1 - (py + pad + ch) / H, (px + pad + cw) / W, 1 - (py + pad) / H];
  });
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, rects };
}

// Local matrix of a placement (position + yaw about +y), as the meshes used to have.
export function placeMatrix(x, y, z, yaw, m = new THREE.Matrix4()) {
  return m.makeRotationY(yaw).setPosition(x, y, z);
}

// Materials that render identically (same type, colours, maps, flags) can
// share one draw call even when they are separate objects.
function matKey(m) {
  if (m.isShaderMaterial) return m.uuid;
  const c = (x) => (x && x.isColor ? x.getHexString() : '');
  const t = (x) => (x ? x.uuid : '');
  return [m.type, c(m.color), c(m.emissive), m.emissiveIntensity, m.roughness, m.metalness, m.clearcoat, m.clearcoatRoughness, m.envMapIntensity,
    t(m.map), t(m.emissiveMap), t(m.bumpMap), m.bumpScale, t(m.normalMap), t(m.roughnessMap), t(m.alphaMap),
    m.transparent, m.opacity, m.side, m.depthWrite, m.depthTest, m.alphaTest, m.toneMapped, m.vertexColors, m.flatShading,
    m.polygonOffset, m.polygonOffsetFactor, m.blending, m.wireframe].join('|');
}

// Merge the direct mesh children of a group that look the same into one mesh
// per material (static parts of a model: fuselage, wings, panels, bezels ...).
// Children with children of their own, several materials, morphs/skins, or
// userData.keep (animated or clickable parts) stay as they are.
export function mergeStaticChildren(group) {
  // materials that animated parts change at runtime must stay their own objects
  const live = new Set();
  group.traverse((o) => { if (o.userData.keep && o.material) [].concat(o.material).forEach((m) => live.add(m)); });
  const buckets = new Map();
  for (const c of group.children) {
    if (!c.isMesh || c.isInstancedMesh || c.isSkinnedMesh || Array.isArray(c.material) || c.children.length || c.userData.keep || !c.visible) continue;
    if (c.geometry.morphAttributes && Object.keys(c.geometry.morphAttributes).length) continue;
    const k = (live.has(c.material) ? c.material.uuid : matKey(c.material)) + '#' + c.renderOrder + (c.geometry.attributes.color ? '#vc' : '');
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(c);
  }
  let merged = 0;
  for (const list of buckets.values()) {
    if (list.length < 2 || list.some((c) => c.geometry.attributes.color)) continue;
    const geo = mergeBaked(list.map((c) => { c.updateMatrix(); return { geo: c.geometry, matrix: c.matrix }; }));
    if (!geo) continue;
    const m = new THREE.Mesh(geo, list[0].material);
    m.renderOrder = list[0].renderOrder;
    m.castShadow = list.some((c) => c.castShadow);
    m.receiveShadow = list.some((c) => c.receiveShadow);
    m.userData = { ...list[0].userData, merged: list.length };
    for (const c of list) group.remove(c);
    group.add(m);
    merged += list.length - 1;
  }
  return merged;
}

// Mark everything a builder still references (animation targets, clickable
// parts) so mergeStaticChildren leaves it alone. refs: any mix of Object3Ds,
// arrays and plain objects holding them (searched two levels deep).
export function keepReferenced(...refs) {
  const mark = (v, depth) => {
    if (!v || depth > 3) return;
    if (v.isObject3D) { v.userData.keep = true; return; }
    if (Array.isArray(v)) { for (const x of v) mark(x, depth + 1); return; }
    if (typeof v === 'object' && !v.isMaterial && !v.isTexture && !(v instanceof HTMLElement)) for (const x of Object.values(v)) mark(x, depth + 1);
  };
  for (const r of refs) mark(r, 0);
}

// Merge geometries that differ only by a translation, keeping every attribute
// in its own array type (int8 normals, uint8 colours ...). items: [{ geo, dx, dy, dz }].
// All geometries must share the same attribute set; all must be indexed or none.
export function mergeTranslated(items) {
  if (!items.length) return null;
  const first = items[0].geo;
  const names = Object.keys(first.attributes);
  const sig = (g) => Object.keys(g.attributes).sort().join() + (g.index ? '|i' : '');
  const s0 = sig(first);
  if (items.some((it) => sig(it.geo) !== s0)) return null;
  let nv = 0, ni = 0;
  for (const it of items) { nv += it.geo.attributes.position.count; ni += it.geo.index ? it.geo.index.count : 0; }
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const a = first.attributes[n];
    const arr = new a.array.constructor(nv * a.itemSize);
    let o = 0;
    for (const it of items) {
      const src = it.geo.attributes[n].array;
      arr.set(src, o);
      if (n === 'position') {
        for (let k = o; k < o + src.length; k += 3) { arr[k] += it.dx; arr[k + 1] += it.dy; arr[k + 2] += it.dz; }
      }
      o += src.length;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  }
  if (first.index) {
    const index = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    let o = 0, base = 0;
    for (const it of items) {
      const src = it.geo.index.array;
      for (let k = 0; k < src.length; k++) index[o + k] = src[k] + base;
      o += src.length;
      base += it.geo.attributes.position.count;
    }
    out.setIndex(new THREE.BufferAttribute(index, 1));
  }
  out.computeBoundingSphere();
  return out;
}
