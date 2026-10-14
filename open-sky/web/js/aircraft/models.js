// Procedural aircraft models (original designs, no third-party assets).
// Model space: x = right, y = up, z = aft (nose toward -z), origin = CG.
// Body FRD (x fwd, y right, z down) maps to model (y, -z, -x).
import * as THREE from 'three';
import { applyMaterialKit } from './materials.js';
import { mergeStaticChildren } from '../world/batch.js';

export const B = (x, y, z) => new THREE.Vector3(y, -z, -x); // body FRD -> model

// Loft a closed tube through cross-sections (superellipse) along body x.
// UVs: u along the stations (0 = first), v around (0 = right side, 0.25 = top).
export function loft(stations, segs = 20, power = 2.6) {
  const pos = [], idx = [], uv = [];
  const x0 = stations[0].x, x1 = stations[stations.length - 1].x;
  stations.forEach((s, i) => {
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / power), ey = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / power);
      const v = B(s.x, (s.w / 2) * ex, s.zc - (s.h / 2) * ey);
      pos.push(v.x, v.y, v.z);
      uv.push((s.x - x0) / (x1 - x0 || 1), k / segs);
    }
    if (i > 0) {
      const a0 = (i - 1) * segs, a1 = i * segs;
      for (let k = 0; k < segs; k++) {
        const k1 = (k + 1) % segs;
        idx.push(a0 + k, a0 + k1, a1 + k, a0 + k1, a1 + k1, a1 + k);
      }
    }
  });
  // caps
  const capA = pos.length / 3;
  const s0 = stations[0], sN = stations[stations.length - 1];
  let v = B(s0.x, 0, s0.zc); pos.push(v.x, v.y, v.z);
  v = B(sN.x, 0, sN.zc); pos.push(v.x, v.y, v.z);
  uv.push(0, 0.5, 1, 0.5);
  const last = (stations.length - 1) * segs;
  for (let k = 0; k < segs; k++) {
    const k1 = (k + 1) % segs;
    idx.push(capA, k1, k);
    idx.push(capA + 1, last + k, last + k1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Wing/tail panel with a simple airfoil (thickness t of chord), from root to tip.
// root/tip: {x: leading edge body x, y: body y, z: body z, c: chord}
export function panel(root, tip, t = 0.12, n = 10) {
  const prof = [];
  for (let i = 0; i <= n; i++) {
    const xc = 1 - Math.cos((i / n) * Math.PI / 2);   // cosine spacing
    const yt = 5 * t * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1036 * xc ** 4);
    prof.push([xc, yt]);
  }
  const ring = [...prof.map(([xc, yt]) => [xc, -yt]).reverse(), ...prof.slice(1).map(([xc, yt]) => [xc, yt])];
  const pos = [], idx = [];
  const sec = (s) => ring.forEach(([xc, yt]) => { const v = B(s.x - xc * s.c, s.y, s.z - yt * s.c); pos.push(v.x, v.y, v.z); });
  sec(root); sec(tip);
  const m = ring.length;
  for (let k = 0; k < m - 1; k++) idx.push(k, k + 1, m + k, k + 1, m + k + 1, m + k);
  // tip & root caps (fans)
  for (let k = 1; k < m - 2; k++) { idx.push(m, m + k + 1, m + k); idx.push(0, k, k + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function liveryTexture(reg) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f5f6';
  g.fillRect(0, 0, 1024, 256);
  // cheat line: orange + deep blue (ORION GAMES colours)
  g.fillStyle = '#e8641b';
  g.fillRect(0, 150, 1024, 14);
  g.fillStyle = '#16325c';
  g.fillRect(0, 166, 1024, 10);
  g.fillStyle = '#16325c';
  g.font = 'bold 54px Arial, sans-serif';
  g.fillText(reg, 600, 120);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Skylark T1 trainer (dimensions match core/src/aircraft_trainer.cpp)
// ---------------------------------------------------------------------------
export function createTrainer(opts = {}) {
  const root = new THREE.Group();
  root.name = 'skylark-t1';
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f3f4, roughness: 0.35, metalness: 0.05 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xe8641b, roughness: 0.4 });
  const navy = new THREE.MeshStandardMaterial({ color: 0x16325c, roughness: 0.45 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1d2a36, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.8 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 });

  // fuselage stations (body x fwd, width, height, centre z)
  const fus = loft([
    { x: 1.98, w: 0.30, h: 0.30, zc: 0.18 },
    { x: 1.85, w: 0.78, h: 0.72, zc: 0.12 },
    { x: 1.40, w: 1.02, h: 0.98, zc: 0.05 },
    { x: 0.80, w: 1.12, h: 1.30, zc: -0.12 },
    { x: 0.00, w: 1.12, h: 1.42, zc: -0.20 },
    { x: -0.90, w: 1.06, h: 1.30, zc: -0.22 },
    { x: -2.00, w: 0.80, h: 0.92, zc: -0.30 },
    { x: -3.60, w: 0.46, h: 0.62, zc: -0.42 },
    { x: -5.30, w: 0.22, h: 0.42, zc: -0.52 },
    { x: -5.95, w: 0.10, h: 0.30, zc: -0.56 },
  ], 24, 2.8);
  const fuselage = new THREE.Mesh(fus, paint);
  fuselage.userData.exterior = true;
  root.add(fuselage);
  // stripe band (thin lofted shell slightly larger along the side)
  const stripe = new THREE.Mesh(loft([
    { x: 1.6, w: 1.0, h: 0.12, zc: 0.18 }, { x: 0.0, w: 1.14, h: 0.12, zc: 0.16 }, { x: -2.0, w: 0.82, h: 0.10, zc: -0.08 },
    { x: -4.2, w: 0.40, h: 0.08, zc: -0.30 },
  ], 16, 2.2), accent);
  stripe.userData.exterior = true;
  root.add(stripe);
  // windshield & side windows (slightly proud glass shapes)
  const ws = new THREE.Mesh(loft([
    { x: 1.05, w: 1.06, h: 0.05, zc: -0.42 }, { x: 0.78, w: 1.12, h: 0.50, zc: -0.60 }, { x: 0.55, w: 1.13, h: 0.58, zc: -0.68 },
  ], 20, 2.4), glass);
  ws.userData.exterior = true;
  root.add(ws);
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.46), glass);
    win.position.copy(B(-0.05, side * 0.571, -0.48));
    win.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    win.userData.exterior = true;
    root.add(win);
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), glass);
    rear.position.copy(B(-0.95, side * 0.54, -0.46));
    rear.rotation.y = win.rotation.y;
    rear.userData.exterior = true;
    root.add(rear);
  }
  // registration on the rear fuselage
  const regTex = liveryTexture(opts.registration || '4X-ONS');
  for (const side of [-1, 1]) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: regTex, transparent: true, roughness: 0.4, alphaTest: 0.1 }));
    decal.position.copy(B(-3.0, side * 0.29, -0.28));
    decal.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (side < 0) decal.scale.x = -1;
    decal.userData.exterior = true;
    root.add(decal);
  }

  // wings: high wing, constant chord inner, tapered outer, 1.7 deg dihedral
  const wz = -0.92, dih = Math.tan(1.7 * Math.PI / 180);
  const wings = new THREE.Group();
  const surfaces = {};
  for (const side of [-1, 1]) {
    const inner = new THREE.Mesh(panel({ x: 0.95, y: side * 0.5, z: wz, c: 1.62 }, { x: 0.95, y: side * 2.6, z: wz - 2.1 * dih, c: 1.62 }, 0.13), paint);
    const outer = new THREE.Mesh(panel({ x: 0.95, y: side * 2.6, z: wz - 2.1 * dih, c: 1.62 * 0.72 + 0.0 }, { x: 0.80, y: side * 5.5, z: wz - 5.0 * dih, c: 1.12 }, 0.12), paint);
    wings.add(inner, outer);
    // flap (inner trailing edge) and aileron (outer), hinged
    const flap = new THREE.Group();
    const flapMesh = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.06, 0.40), paint);
    flapMesh.position.set(0, 0, 0.2);
    flap.add(flapMesh);
    flap.position.copy(B(0.95 - 1.20, side * 1.6, wz - 1.6 * dih + 0.03));
    wings.add(flap);
    const ail = new THREE.Group();
    const ailMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.32), paint);
    ailMesh.position.set(0, 0, 0.16);
    ail.add(ailMesh);
    ail.position.copy(B(0.80 - 0.80, side * 4.1, wz - 4.1 * dih + 0.02));
    wings.add(ail);
    surfaces[side < 0 ? 'flapL' : 'flapR'] = flap;
    surfaces[side < 0 ? 'ailL' : 'ailR'] = ail;
    // wing strut
    const a = B(0.15, side * 0.55, 0.40), b = B(0.35, side * 2.65, wz - 2.65 * dih + 0.05);
    const len = a.distanceTo(b);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, len, 6), metal);
    strut.position.copy(a).lerp(b, 0.5);
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    wings.add(strut);
    // wingtip
    const tipCap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), side < 0 ? new THREE.MeshBasicMaterial({ color: 0xff2020 }) : new THREE.MeshBasicMaterial({ color: 0x20ff40 }));
    tipCap.position.copy(B(0.55, side * 5.52, wz - 5.0 * dih));
    wings.add(tipCap);
  }
  root.add(wings);

  // horizontal tail + elevator, vertical tail + rudder
  const hz = -0.50;
  const stab = new THREE.Mesh(panel({ x: -4.95, y: -1.72, z: hz, c: 0.62 }, { x: -4.95, y: 1.72, z: hz, c: 0.62 }, 0.09), paint);
  root.add(stab);
  const elev = new THREE.Group();
  const elevMesh = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.05, 0.42), paint);
  elevMesh.position.set(0, 0, 0.21);
  elev.add(elevMesh);
  elev.position.copy(B(-5.57, 0, hz));
  root.add(elev);
  surfaces.elevator = elev;
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(1.25, 0); finShape.lineTo(1.18, 1.45); finShape.lineTo(0.72, 1.45); finShape.lineTo(-0.35, 0.1); finShape.lineTo(0, 0);
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.08, bevelEnabled: false }), paint);
  fin.position.copy(B(-4.55, -0.04, -0.62));
  fin.rotation.y = Math.PI / 2;
  root.add(fin);
  const finStripe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 1.0), navy);
  finStripe.position.copy(B(-5.25, 0, -1.6));
  root.add(finStripe);
  const rud = new THREE.Group();
  const rudMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.42, 0.44), paint);
  rudMesh.position.set(0, 0, 0.22);
  rud.add(rudMesh);
  rud.position.copy(B(-5.80, 0, -1.30));
  root.add(rud);
  surfaces.rudder = rud;

  // landing gear (spring steel mains, nose strut), wheel fairings
  const wheelGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.14, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const gear = new THREE.Group();
  for (const side of [-1, 1]) {
    const top = B(-0.25, side * 0.45, 0.45), axle = B(-0.30, side * 1.27, 0.86);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, top.distanceTo(axle), 0.12), metal);
    leg.position.copy(top).lerp(axle, 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axle.clone().sub(top).normalize());
    gear.add(leg);
    const w = new THREE.Mesh(wheelGeo, tire);
    w.position.copy(axle);
    gear.add(w);
    const fairing = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), paint);
    fairing.scale.set(0.55, 0.75, 1.5);
    fairing.position.copy(axle).add(new THREE.Vector3(0, 0.05, 0));
    gear.add(fairing);
  }
  const nAx = B(1.35, 0, 0.86);
  const nLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.6, 8), metal);
  nLeg.position.copy(nAx).add(new THREE.Vector3(0, 0.33, -0.04));
  gear.add(nLeg);
  const nw = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.11, 14).rotateZ(Math.PI / 2), tire);
  nw.position.copy(nAx);
  const nwPivot = new THREE.Group();
  nwPivot.position.copy(nAx);
  nw.position.set(0, 0, 0);
  nwPivot.add(nw);
  gear.add(nwPivot);
  surfaces.noseWheel = nwPivot;
  root.add(gear);

  // propeller & spinner
  const prop = new THREE.Group();
  prop.position.copy(B(2.02, 0, 0.18));
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.38, 16), paint);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.1;
  prop.add(spinner);
  const blades = new THREE.Group();
  for (const s of [-1, 1]) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.95, 0.025), dark);
    bl.position.y = s * 0.5;
    bl.rotation.y = s * 0.35;
    blades.add(bl);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.111, 0.08, 0.026), new THREE.MeshBasicMaterial({ color: 0xffe02a }));
    tip.position.y = s * 0.93;
    blades.add(tip);
  }
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.965, 40), new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
  prop.add(disc);
  root.add(prop);

  // light positions (model space) for the light system
  const lights = {
    navL: B(0.55, -5.55, wz - 5.0 * dih), navR: B(0.55, 5.55, wz - 5.0 * dih), tail: B(-5.98, 0, -0.56),
    beacon: B(-5.3, 0, -2.08), strobeL: B(0.40, -5.56, wz - 5.0 * dih), strobeR: B(0.40, 5.56, wz - 5.0 * dih),
    landing: B(0.95, -1.9, wz + 0.05), taxi: B(0.95, -2.1, wz + 0.05),
  };
  const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0x661111 }));
  beaconMesh.position.copy(lights.beacon);
  root.add(beaconMesh);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  applyMaterialKit(root);
  return { root, surfaces, prop: { group: prop, blades, disc }, lights, beaconMesh };
}

// Pose animated parts from core outputs (normalised controls, deg flaps).
export function poseTrainer(m, o, dt) {
  const s = m.surfaces;
  const flap = (o.flapsDeg || 0) * Math.PI / 180;
  s.flapL.rotation.x = -flap;
  s.flapR.rotation.x = -flap;
  const ail = o.ail || 0;
  s.ailL.rotation.x = ail * 0.30;
  s.ailR.rotation.x = -ail * 0.30;
  const el = o.elev || 0;
  s.elevator.rotation.x = el > 0 ? el * 0.49 : el * 0.40;
  s.rudder.rotation.y = -(o.rud || 0) * 0.28;
  s.noseWheel.rotation.y = -(o.steer || 0);
  // prop: blades below ~600 rpm, disc above
  const rpm = o.rpm || 0;
  m.prop.blades.rotation.z = -(o.propAngle || 0);
  const blur = THREE.MathUtils.smoothstep(rpm, 500, 1300);
  m.prop.disc.material.opacity = blur * (o.inside ? 0.035 : 0.22);  // from the seat a spinning prop is nearly invisible
  m.prop.blades.visible = blur < 0.98;
}

// ---------------------------------------------------------------------------
// Generic AI aircraft (fictional liveries). type: 0 narrow-body, 1 regional,
// 2 wide-body, 3 light single. Scale from the wingspan of each class.
// ---------------------------------------------------------------------------
const AI_SPEC = [
  { len: 38, span: 35, fusW: 3.8, eng: 2, tail: 12, color: 0xf2f2f2, accent: 0x1b4f9c },
  { len: 31, span: 26, fusW: 2.9, eng: 2, tail: 9, color: 0xf2f2f2, accent: 0xc0392b },
  { len: 62, span: 60, fusW: 5.9, eng: 2, tail: 17, color: 0xf6f6f6, accent: 0x16325c },
  { len: 8.3, span: 11, fusW: 1.1, eng: 0, tail: 2.6, color: 0xf2f2f2, accent: 0x2e7d32 },
];
const aiCache = new Map();
export function createAIAircraft(type, liveryIndex = 0) {
  const key = type + ':' + liveryIndex;
  if (aiCache.has(key)) return aiCache.get(key).clone();
  if (type === 3) {
    const t = createTrainer({ registration: 'N' + (500 + liveryIndex * 37) + 'GA' });
    t.root.userData.trainer = t;
    aiCache.set(key, t.root);
    return t.root.clone();
  }
  const sp = AI_SPEC[type];
  const liveries = [0x1b4f9c, 0xc0392b, 0x16325c, 0x2e7d32, 0x8e44ad, 0xe8641b];
  const accentCol = liveries[liveryIndex % liveries.length];
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: sp.color, roughness: 0.35, metalness: 0.1 });
  const accent = new THREE.MeshStandardMaterial({ color: accentCol, roughness: 0.4 });
  const gray = new THREE.MeshStandardMaterial({ color: 0xa8adb2, roughness: 0.4, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.3 });
  const L = sp.len, R = sp.fusW / 2;
  const fus = loft([
    { x: L * 0.5, w: 0.2, h: 0.2, zc: 0.1 * R },
    { x: L * 0.47, w: R * 1.1, h: R * 1.1, zc: 0.05 * R },
    { x: L * 0.40, w: R * 1.9, h: R * 1.95, zc: 0 },
    { x: L * 0.30, w: R * 2, h: R * 2.05, zc: 0 },
    { x: -L * 0.22, w: R * 2, h: R * 2.05, zc: 0 },
    { x: -L * 0.40, w: R * 1.2, h: R * 1.5, zc: -R * 0.35 },
    { x: -L * 0.50, w: R * 0.3, h: R * 0.6, zc: -R * 0.75 },
  ], 22, 2.1);
  g.add(new THREE.Mesh(fus, white));
  // belly accent and cockpit windows
  const band = new THREE.Mesh(loft([{ x: L * 0.36, w: R * 2.02, h: R * 0.4, zc: R * 0.2 }, { x: -L * 0.3, w: R * 2.02, h: R * 0.4, zc: R * 0.2 }], 16, 2.0), accent);
  g.add(band);
  const cock = new THREE.Mesh(new THREE.BoxGeometry(R * 1.2, R * 0.28, R * 0.7), dark);
  cock.position.copy(B(L * 0.445, 0, -R * 0.45));
  g.add(cock);
  // swept wings
  const sweep = Math.tan(27 * Math.PI / 180);
  for (const side of [-1, 1]) {
    const rootC = sp.span * 0.2, tipC = sp.span * 0.06;
    const w = new THREE.Mesh(panel({ x: L * 0.1, y: side * R, z: R * 0.45, c: rootC }, { x: L * 0.1 - sp.span * 0.5 * sweep, y: side * sp.span / 2, z: R * 0.45 - sp.span * 0.5 * 0.08, c: tipC }, 0.11), white);
    g.add(w);
    const ht = new THREE.Mesh(panel({ x: -L * 0.38, y: side * R * 0.4, z: -R * 0.5, c: sp.tail * 0.42 }, { x: -L * 0.38 - sp.tail * 0.6 * sweep, y: side * sp.tail * 0.9, z: -R * 0.6, c: sp.tail * 0.16 }, 0.09), white);
    g.add(ht);
    if (sp.eng) {
      const ex = L * 0.12, ey = side * sp.span * 0.17;
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.42, R * 0.36, sp.span * 0.11, 16), gray);
      eng.rotation.x = Math.PI / 2;
      eng.position.copy(B(ex + sp.span * 0.03 - Math.abs(ey) * sweep * 0.5, ey, R * 0.95));
      g.add(eng);
      const inlet = new THREE.Mesh(new THREE.CircleGeometry(R * 0.36, 16), dark);
      inlet.position.copy(eng.position).add(new THREE.Vector3(0, 0, -sp.span * 0.056));
      inlet.rotation.y = Math.PI;
      g.add(inlet);
    }
  }
  // vertical tail
  const fin = new THREE.Shape();
  fin.moveTo(0, 0); fin.lineTo(sp.tail * 0.9, 0); fin.lineTo(sp.tail * 1.25, sp.tail); fin.lineTo(sp.tail * 0.85, sp.tail); fin.lineTo(0, 0);
  const finM = new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: R * 0.18, bevelEnabled: false }), accent);
  finM.position.copy(B(-L * 0.27, -R * 0.09, -R * 0.8));
  finM.rotation.y = Math.PI / 2;
  g.add(finM);
  // gear (visible when lowered)
  const gear = new THREE.Group();
  const tireM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheel = new THREE.CylinderGeometry(R * 0.28, R * 0.28, R * 0.25, 12).rotateZ(Math.PI / 2);
  const gearH = R * 1.45;
  for (const p of [[L * 0.38, 0], [L * 0.0, -R * 1.4], [L * 0.0, R * 1.4]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.07, R * 0.07, gearH, 6), gray);
    leg.position.copy(B(p[0], p[1], R * 0.4 + gearH / 2));
    gear.add(leg);
    for (const o of [-1, 1]) {
      const w = new THREE.Mesh(wheel, tireM);
      w.position.copy(B(p[0], p[1] + o * R * 0.22, R * 0.4 + gearH));
      gear.add(w);
    }
  }
  g.add(gear);
  g.userData.gear = gear;
  g.userData.gearHeight = R * 0.4 + gearH + R * 0.28;  // CG height above ground on gear
  applyMaterialKit(g);
  // static parts: one draw call per material (21 meshes -> 6)
  mergeStaticChildren(gear);
  g.remove(gear);
  mergeStaticChildren(g);
  g.add(gear);
  aiCache.set(key, g);
  const c = g.clone();
  c.userData = { ...g.userData, gear: c.children[c.children.length - 1] };
  return c;
}
