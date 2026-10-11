// Aircraft material kit: turns the builders' plain standard materials into
// role-based physical materials once the model is assembled, so every type
// shares one material language (clearcoat paint over a bump of panel seams,
// brushed metal, rubber, tinted glass) and all of it reflects the live sky
// (scene.environment from world/envmap.js).
import * as THREE from 'three';

const cache = new WeakMap();

// role from the existing material's settings
function roleOf(m) {
  if (m.transparent && m.opacity < 0.95 && !m.map) return 'glass';
  if (m.metalness >= 0.6) return 'metal';
  if (m.roughness >= 0.85) return 'rubber';
  if (m.color && m.color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.08) return 'dark';
  return 'paint';
}

function upgrade(m, panel, matte = false) {
  if (!m || !m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.userData.keep) return m;
  const key = (panel && m.map ? 'p' : '') + (matte ? 'm' : '');
  let byKey = cache.get(m);
  if (byKey && byKey[key]) return byKey[key];
  const role = roleOf(m);
  const p = new THREE.MeshPhysicalMaterial({
    color: m.color, map: m.map, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite,
    side: m.side, alphaTest: m.alphaTest, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, emissiveMap: m.emissiveMap,
  });
  p.name = m.name || role;
  switch (role) {
    case 'paint':   // gloss enamel over aluminium: clearcoat carries the sharp sky reflection
      p.metalness = 0.05; p.roughness = Math.max(0.38, m.roughness); p.clearcoat = 0.75; p.clearcoatRoughness = 0.12; p.envMapIntensity = 0.9;
      if (matte) { p.roughness = 0.58; p.clearcoat = 0.12; p.clearcoatRoughness = 0.5; p.envMapIntensity = 0.7; }   // low-observable coatings are satin
      if (panel && m.map) { p.bumpMap = panel; p.bumpScale = 0.9; }
      break;
    case 'metal':   // bare / brushed alloy: needs the environment to read as metal
      p.metalness = 1.0; p.roughness = Math.max(0.3, m.roughness * 0.85); p.envMapIntensity = 1.1;
      break;
    case 'rubber':
      p.metalness = 0; p.roughness = 0.92; p.envMapIntensity = 0.3;
      break;
    case 'dark':    // matte housings, intakes, radomes' dark parts
      p.metalness = 0.1; p.roughness = 0.6; p.envMapIntensity = 0.5;
      break;
    case 'glass':   // tinted, coated windscreen / canopy: fake glass, no transmission pass
      p.metalness = m.metalness > 0.8 ? 0.6 : 0.1; p.roughness = 0.04; p.clearcoat = 1; p.clearcoatRoughness = 0.03;
      p.envMapIntensity = 1.6; p.opacity = Math.min(0.85, m.opacity + 0.15);
      break;
    default:
  }
  byKey = byKey || {};
  byKey[key] = p;
  cache.set(m, byKey);
  return p;
}

// Upgrade every mesh in a built aircraft. panel: optional bump texture for the
// fuselage (same UV layout as its livery texture).
export function applyMaterialKit(root, { panel = null, matte = false } = {}) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (Array.isArray(o.material)) o.material = o.material.map((m) => upgrade(m, panel, matte));
    else o.material = upgrade(o.material, o.material.map && o === root.userData.fuselage ? panel : null, matte);
    o.receiveShadow = true;
    const mm = Array.isArray(o.material) ? o.material[0] : o.material;
    if (mm && mm.transparent) o.castShadow = false;   // glass and decals must not darken what is behind them
  });
}

// Panel seams, lap joints and rivet rows for a lofted fuselage whose texture
// runs u = metres from the nose / L, v = around the section (flipY canvas).
export function panelTexture(L, opts = {}) {
  const W = 2048, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#808080';
  x.fillRect(0, 0, W, H);
  const col = (m) => (m / L) * W;
  const row = (v) => (1 - v) * H;
  // circumferential seams at frame stations (~ every 1.6-2.4 m), slightly irregular
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  x.strokeStyle = '#5c5c5c'; x.lineWidth = 1.5;
  for (let m = (opts.nose || 2) * 0.8; m < L - (opts.tail || 3) * 0.3; m += 1.6 + rnd() * 0.8) {
    x.beginPath(); x.moveTo(col(m), 0); x.lineTo(col(m), H); x.stroke();
  }
  // longitudinal lap joints
  x.lineWidth = 1.2;
  for (const v of [0.08, 0.2, 0.31, 0.42, 0.58, 0.69, 0.8, 0.92]) {
    x.beginPath(); x.moveTo(0, row(v)); x.lineTo(W, row(v)); x.stroke();
  }
  // rivet rows: faint dotted highlights beside each seam
  x.fillStyle = '#9a9a9a';
  for (const v of [0.085, 0.205, 0.315, 0.425, 0.585, 0.695, 0.805, 0.925]) {
    for (let px = 0; px < W; px += 5) x.fillRect(px, row(v) - 2.5, 1, 1);
  }
  // access panels (small rectangles) along the lower fuselage
  x.strokeStyle = '#646464'; x.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const m = rnd() * L, v = 0.56 + rnd() * 0.36, w = 0.4 + rnd() * 0.7, h = 0.02 + rnd() * 0.04;
    x.strokeRect(col(m), row(v + h), col(w), row(v) - row(v + h));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}
