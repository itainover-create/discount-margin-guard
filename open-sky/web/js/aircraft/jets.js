// Procedural models for the GLOBAL SKIES fleet (original geometry generated
// from the flight-model numbers in fleet.js; no third-party assets).
// Model space: x = right, y = up, z = aft; origin = CG (as models.js).
// Styles: airliner (incl. rear-engine business jet), fighter, flying wing,
// aerobatic monoplane. Every moving part is driven by core outputs.
import * as THREE from 'three';
import { applyMaterialKit, panelTexture } from './materials.js';
import { B, loft, panel } from './models.js';
import { emblemImage } from '../ui/brand.js';

const D2R = Math.PI / 180;

// Lifting surface with thickness along body z (wings) or body y (fins).
function surface(root, tip, t = 0.1, fin = false, n = 8) {
  if (!fin) return panel(root, tip, t, n);
  const prof = [];
  for (let i = 0; i <= n; i++) {
    const xc = 1 - Math.cos((i / n) * Math.PI / 2);
    const yt = 5 * t * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1036 * xc ** 4);
    prof.push([xc, yt]);
  }
  const ring = [...prof.map(([xc, yt]) => [xc, -yt]).reverse(), ...prof.slice(1).map(([xc, yt]) => [xc, yt])];
  const pos = [], idx = [];
  const sec = (s) => ring.forEach(([xc, yt]) => { const v = B(s.x - xc * s.c, s.y + yt * s.c, s.z); pos.push(v.x, v.y, v.z); });
  sec(root); sec(tip);
  const m = ring.length;
  for (let k = 0; k < m - 1; k++) idx.push(k, m + k, k + 1, k + 1, m + k, m + k + 1);
  for (let k = 1; k < m - 2; k++) { idx.push(m, m + k, m + k + 1); idx.push(0, k + 1, k); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Hinged control surface: a group whose local x runs along the hinge line
// (model space, left -> right) and local +z points aft; rotate .rotation.x
// (positive = trailing edge down).
function hinged(a, b, chord, thick, mat) {
  // a, b: body-frame hinge end points [x, y, z]; returns group at the midpoint
  const pa = B(...a), pb = B(...b);
  if (pa.x > pb.x) { const t = pa.clone(); pa.copy(pb); pb.copy(t); }
  const g = new THREE.Group();
  g.position.copy(pa).lerp(pb, 0.5);
  const dir = pb.clone().sub(pa);
  const len = dir.length();
  g.rotation.order = 'YZX';
  g.rotation.y = -Math.atan2(dir.z, dir.x);
  g.rotation.z = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, thick, chord), mat);
  mesh.position.z = chord / 2;
  g.add(mesh);
  g.userData.mesh = mesh;
  return g;
}

function lathe(profile, segs = 28) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

// Fan face texture (blades) for spinning engines
let fanTex = null;
function fanTexture() {
  if (fanTex) return fanTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1d21';
  g.fillRect(0, 0, 256, 256);
  g.translate(128, 128);
  for (let i = 0; i < 22; i++) {
    g.rotate((Math.PI * 2) / 22);
    g.fillStyle = i % 2 ? '#5a6068' : '#6c737c';
    g.beginPath();
    g.moveTo(10, -4); g.quadraticCurveTo(70, -26, 126, -14); g.lineTo(126, 2); g.quadraticCurveTo(70, -6, 10, 6);
    g.fill();
  }
  g.fillStyle = '#c9ced4';
  g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f4f4f4'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(8, -6, 16, 2, 20, 12); g.stroke();  // spinner swirl
  fanTex = new THREE.CanvasTexture(c);
  fanTex.colorSpace = THREE.SRGBColorSpace;
  return fanTex;
}

// Fuselage livery: body / belly colours, cheat lines, windows, cockpit glass
function fuselageTexture(f, g, Ln, Lt) {
  const L = g.L, lv = f.livery;
  const W = 2048, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const row = (v) => (1 - v) * H;   // flipY: canvas top = v 1
  const col = (m) => (m / L) * W;   // metres from the nose
  x.fillStyle = hex(lv.body);
  x.fillRect(0, 0, W, H);
  x.fillStyle = hex(lv.belly);
  x.fillRect(0, row(0.94), W, row(0.56) - row(0.94));
  // cheat lines under the window rows, both sides
  const stripe = (v0, v1, color) => { x.fillStyle = color; x.fillRect(col(Ln * 0.9), row(v1), col(L - Lt * 0.55) - col(Ln * 0.9), row(v0) - row(v1)); };
  stripe(0.0, 0.012, hex(lv.stripe)); stripe(0.976, 0.999, hex(lv.stripe));
  stripe(0.488, 0.524, hex(lv.stripe));
  stripe(0.958, 0.972, hex(lv.accent)); stripe(0.528, 0.542, hex(lv.accent));
  // passenger windows (drawn again on the emissive map: cabin lights at night)
  const rows = g.deck2 ? [[0.028, 0.048], [0.452, 0.472], [0.115, 0.13], [0.37, 0.385]] : [[0.03, 0.05], [0.45, 0.47]];
  const pitch = g.ovalWindows ? 1.05 : 0.53;
  const ec = document.createElement('canvas');
  ec.width = W; ec.height = H;
  const ex = ec.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
  const windows = (cx, fill, lit) => {
    cx.fillStyle = fill;
    let k = 0;
    for (const [v0, v1] of rows) {
      for (let m = Ln * 1.05; m < L - Lt * 0.75; m += pitch) {
        k++;
        if (lit && (k * 7919) % 13 === 0) continue;   // a few blinds down
        const w = col(g.ovalWindows ? 0.42 : 0.26);
        cx.beginPath();
        cx.ellipse(col(m), (row(v0) + row(v1)) / 2, w / 2, (row(v0) - row(v1)) / 2, 0, 0, Math.PI * 2);
        cx.fill();
      }
    }
    // upper deck windows (hump)
    if (g.hump) for (const [v0, v1] of [[0.16, 0.175], [0.325, 0.34]]) for (let m = Ln * 1.0; m < L * 0.30; m += 0.53) {
      cx.fillRect(col(m), row(v1), col(0.26), row(v0) - row(v1));
    }
  };
  windows(x, '#1b2430', false);
  windows(ex, '#ffe2b0', true);
  // flight deck windows
  x.fillStyle = '#0d1218';
  const cw0 = Ln * 0.56, cw1 = Ln * 0.8;
  const deckV = g.hump ? [[0.13, 0.2], [0.30, 0.37]] : g.deck2 ? [[0.07, 0.13], [0.37, 0.43]] : [[0.065, 0.14], [0.36, 0.435]];
  for (const [v0, v1] of deckV) {
    x.beginPath();
    x.moveTo(col(cw0), row(v0)); x.lineTo(col(cw1), row(v0 - 0.005)); x.lineTo(col(cw1 - 0.2), row(v1)); x.lineTo(col(cw0 + 0.3), row(v1 - 0.01));
    x.closePath(); x.fill();
  }
  if (g.mask) { x.fillStyle = '#10151b'; x.fillRect(col(cw0 - 0.3), row(0.45), col(cw1 + 0.6) - col(cw0 - 0.3), row(0.05) - row(0.45)); }
  // doors
  x.strokeStyle = 'rgba(40,50,60,0.55)'; x.lineWidth = 2;
  const doors = [Ln * 1.0, L * 0.42, L - Lt * 1.05];
  for (const m of doors) for (const [v0, v1] of [[-0.02, 0.07], [0.43, 0.52]]) x.strokeRect(col(m), row(v1), col(0.9), row(v0) - row(v1));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const e = new THREE.CanvasTexture(ec);
  e.colorSpace = THREE.SRGBColorSpace;
  t.userData.emissive = e;
  return t;
}

function titleDecal(text, color) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const x = c.getContext('2d');
  x.font = '600 84px Cinzel, Georgia, serif';
  x.fillStyle = color;
  x.textBaseline = 'middle';
  x.fillText(text, 8, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function emblemTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  emblemImage().then((img) => { if (!img) return; c.getContext('2d').drawImage(img, 0, 0, 256, 256); t.needsUpdate = true; }).catch(() => {});
  return t;
}

function mats(lv) {
  return {
    body: new THREE.MeshStandardMaterial({ color: lv.body, roughness: 0.32, metalness: 0.12 }),
    tail: new THREE.MeshStandardMaterial({ color: lv.tail ?? lv.body, roughness: 0.35, metalness: 0.1 }),
    accent: new THREE.MeshStandardMaterial({ color: lv.accent ?? 0xd4a85c, roughness: 0.35, metalness: 0.3 }),
    eng: new THREE.MeshStandardMaterial({ color: lv.eng ?? 0xd8dde3, roughness: 0.3, metalness: 0.35 }),
    wing: new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.38, metalness: 0.25 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9ba2aa, roughness: 0.3, metalness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.6 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2632, roughness: 0.05, metalness: 0.7, transparent: true, opacity: 0.6 }),
    canopy: new THREE.MeshStandardMaterial({ color: 0xc8a84a, roughness: 0.04, metalness: 0.9, transparent: true, opacity: 0.45 }),
    hot: new THREE.MeshStandardMaterial({ color: 0x8a8079, roughness: 0.55, metalness: 0.75 }),   // heat-tinted titanium
  };
}

// ---------------------------------------------------------------------------
// Landing gear (tricycle). Retracts by rotating each leg about its top.
function buildGear(g, M, opts) {
  const gear = { group: new THREE.Group(), legs: [] };
  const wheelR = Math.max(0.28, Math.min(0.68, g.cg * 0.13));
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelR * 0.75, 18).rotateZ(Math.PI / 2);
  const noseX = g.wheelbase - g.mainAft;
  const legsDef = [
    { x: noseX, y: 0, top: opts.noseTop, wheels: g.noseWheels || 2, fold: 1, nose: true },
    { x: -g.mainAft, y: -g.track / 2, top: opts.mainTop, wheels: g.bogie || 2, fold: -1 },
    { x: -g.mainAft, y: g.track / 2, top: opts.mainTop, wheels: g.bogie || 2, fold: 1 },
  ];
  for (const L of legsDef) {
    const pivot = new THREE.Group();
    pivot.position.copy(B(L.x, L.y, L.top));
    const len = g.cg - wheelR - L.top;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.18, wheelR * 0.22, len, 10), M.metal);
    strut.position.y = -len / 2;
    pivot.add(strut);
    const steer = new THREE.Group();
    steer.position.y = -len;
    pivot.add(steer);
    const nW = L.wheels;
    const rowsX = nW >= 4 ? (nW >= 6 ? [-1.5, 0, 1.5] : [-0.75, 0.75]) : [0];
    const cols = nW === 1 ? [0] : [-1, 1];
    for (const rx of rowsX) for (const cy of cols) {
      const w = new THREE.Mesh(wheelGeo, M.tire);
      w.position.set(cy * wheelR * 0.62, 0, rx * wheelR * 1.15);
      steer.add(w);
    }
    if (rowsX.length > 1) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(wheelR * 0.3, wheelR * 0.3, (rowsX.length - 1) * wheelR * 2.4), M.metal);
      steer.add(beam);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, len * 0.8, wheelR * 1.6), M.body);
    door.position.set(-L.fold * wheelR * 0.9, -len * 0.45, 0);
    if (!L.nose) pivot.add(door);
    gear.group.add(pivot);
    gear.legs.push({ pivot, steer, fold: L.fold, nose: L.nose });
  }
  return gear;
}

// ---------------------------------------------------------------------------
function buildAirliner(f, root, M, parts) {
  const g = f.g;
  const L = g.L, R = g.fusD / 2, H = g.fusH || g.fusD;
  const nx = g.noseX, tx = nx - L;
  const Ln = g.fusD * (g.rearEngines ? 2.1 : 1.75), Lt = g.fusD * (g.rearEngines ? 3.0 : 2.9);
  const st = (t, w, h, zc) => ({ x: nx - t, w, h, zc });
  const humpEnd = g.hump ? L * 0.36 : 0;
  const hAt = (t) => (g.hump && t < humpEnd ? H : (g.hump && t < humpEnd + 6 ? H - (H - g.fusD) * (t - humpEnd) / 6 : (g.hump ? g.fusD : H)));
  const zAt = (t) => -(hAt(t) - (g.hump ? g.fusD : H)) / 2;
  const S = [];
  const nose = [[0, 0.05, 0.05, 0.22], [0.06, 0.42, 0.38, 0.14], [0.2, 0.7, 0.66, 0.06], [0.42, 0.88, 0.86, 0.02], [0.7, 0.97, 0.96, 0.0], [1.0, 1, 1, 0]];
  for (const [k, w, h, z] of nose) { const t = k * Ln; S.push(st(t, g.fusD * w, hAt(t) * h, z * R + zAt(t))); }
  if (g.hump) { S.push(st(humpEnd, g.fusD, hAt(humpEnd), zAt(humpEnd))); S.push(st(humpEnd + 6, g.fusD, g.fusD, 0)); }
  const tail = [[1.0, 1, 1, 0], [0.6, 0.82, 0.8, -0.2], [0.3, 0.52, 0.5, -0.42], [0.08, 0.2, 0.22, -0.58], [0, 0.1, 0.12, -0.62]];
  const H0 = g.hump ? g.fusD : H;
  for (const [k, w, h, z] of tail) S.push(st(L - k * Lt, g.fusD * w, H0 * h, z * R));
  const fusTex = fuselageTexture(f, g, Ln, Lt);
  const fus = new THREE.Mesh(loft(S, 40, 2.15), new THREE.MeshStandardMaterial({ map: fusTex, roughness: 0.32, metalness: 0.1, emissive: 0xffffff, emissiveMap: fusTex.userData.emissive, emissiveIntensity: 0 }));
  fus.userData.exterior = true;
  root.add(fus);
  parts.fuselage = fus;
  // title decals ("GLOBAL SKIES") on both sides, ahead of the wing
  const titleTex = titleDecal('GLOBAL SKIES', '#' + f.livery.stripe.toString(16).padStart(6, '0'));
  for (const side of [-1, 1]) {
    const w = Math.min(L * 0.28, 14), h = w / 8;
    const d = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: titleTex, transparent: true, roughness: 0.4, depthWrite: false }));
    d.position.copy(B(nx - Ln - w * 0.55, side * (g.fusD / 2 + 0.03), -R * (g.deck2 ? 0.85 : 0.5) + zAt(Ln + 2)));
    d.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    d.userData.exterior = true;
    root.add(d);
  }

  // ---- wing
  const b2 = g.b / 2, lam = g.taper ?? 0.25;
  const cr = (2 * g.S) / (g.b * (1 + lam));
  const sweepLE = (g.sweep + 3) * D2R;
  const xLEr = 0.25 * cr * 0.95 + (g.b / 5.6) * Math.tan(sweepLE) * 0.92;
  const dih = Math.tan((g.dihedral || 5) * D2R);
  const yk = b2 * 0.34;
  const zAtY = (y) => g.wingZ - Math.abs(y) * dih;
  const xLE = (y) => xLEr - Math.abs(y) * Math.tan(sweepLE);
  const cK = cr * (1 - (1 - lam) * 0.34), cT = cr * lam;
  const cRoot = g.rearEngines ? cr : cr * 1.22;  // yehudi
  parts.wing = [];
  const wingMats = new THREE.MeshStandardMaterial({ color: 0xd2d6db, roughness: 0.4, metalness: 0.2 });
  for (const side of [-1, 1]) {
    const grpIn = new THREE.Group(), grpOut = new THREE.Group();
    const r0 = { x: xLE(0), y: 0, z: zAtY(0), c: cRoot };
    const k = { x: xLE(yk), y: side * yk, z: zAtY(yk), c: cK };
    const t = { x: xLE(b2), y: side * b2, z: zAtY(b2), c: cT };
    grpIn.add(new THREE.Mesh(panel(side < 0 ? k : r0, side < 0 ? r0 : k, 0.13), wingMats));
    grpOut.add(new THREE.Mesh(panel(side < 0 ? t : k, side < 0 ? k : t, 0.105), wingMats));
    // winglets
    const wl = g.winglet;
    if (wl && wl !== 'raked') {
      const h = wl === 'fence' ? g.b * 0.035 : g.b * (wl === 'curved' ? 0.06 : 0.055);
      const cant = wl === 'canted' ? 25 : wl === 'fence' ? 0 : 12;
      const base = { x: t.x, y: t.y, z: t.z, c: cT * 0.9 };
      const top = { x: t.x - h * 0.7, y: t.y + side * h * Math.sin(cant * D2R), z: t.z - h * Math.cos(cant * D2R), c: cT * 0.38 };
      grpOut.add(new THREE.Mesh(surface(base, top, 0.08, true), M.tail));
      if (wl === 'fence') { const bot = { x: t.x + 0.3, y: t.y, z: t.z + h * 0.6, c: cT * 0.5 }; grpOut.add(new THREE.Mesh(surface(base, bot, 0.08, true), M.tail)); }
      // split-tip winglet: smaller element swept aft and down below the tip
      if (wl === 'split') { const bot = { x: t.x - h * 0.45, y: t.y + side * h * 0.1, z: t.z + h * 0.42, c: cT * 0.4 }; grpOut.add(new THREE.Mesh(surface(base, bot, 0.08, true), M.tail)); }
    } else if (wl === 'raked') {
      const rk = { x: t.x - g.b * 0.05, y: side * (b2 + g.b * 0.02), z: t.z - 0.1, c: cT * 0.25 };
      grpOut.add(new THREE.Mesh(panel(side < 0 ? rk : t, side < 0 ? t : rk, 0.08), wingMats));
    }
    // flaps (inboard, outboard), aileron, spoilers: hinge lines at ~72 % chord
    const hingeAt = (y, c, frac) => [xLE(y) - c * frac, side * y, zAtY(y) + 0.02];
    const cAt = (y) => (y < yk ? cRoot + (cK - cRoot) * y / yk : cK + (cT - cK) * (y - yk) / (b2 - yk));
    const flapIn = hinged(hingeAt(R * 1.05, cAt(R * 1.05), 0.72), hingeAt(yk, cK, 0.72), cK * 0.28, 0.12, wingMats);
    const flapOut = hinged(hingeAt(yk + 0.3, cK, 0.74), hingeAt(b2 * 0.72, cAt(b2 * 0.72), 0.74), cAt(b2 * 0.6) * 0.26, 0.1, wingMats);
    const ail = hinged(hingeAt(b2 * 0.73, cAt(b2 * 0.73), 0.76), hingeAt(b2 * 0.95, cAt(b2 * 0.95), 0.76), cAt(b2 * 0.85) * 0.24, 0.08, wingMats);
    grpIn.add(flapIn);
    grpOut.add(flapOut, ail);
    const spoilers = [];
    for (let i = 0; i < 4; i++) {
      const y0 = yk * 0.5 + i * (b2 * 0.68 - yk * 0.5) / 4, y1 = y0 + (b2 * 0.68 - yk * 0.5) / 4 * 0.92;
      const sp = hinged(hingeAt(y0, cAt(y0), 0.6), hingeAt(y1, cAt(y1), 0.6), cAt(y0) * 0.13, 0.05, wingMats);
      sp.position.y += 0.08;
      (y1 < yk ? grpIn : grpOut).add(sp);
      spoilers.push(sp);
    }
    // nav light tip caps
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff2020 : 0x20ff40 }));
    cap.position.copy(B(t.x - cT * 0.2, side * (b2 + 0.05), t.z));
    grpOut.add(cap);
    root.add(grpIn, grpOut);
    parts.wing.push({ inner: grpIn, outer: grpOut, flaps: [flapIn, flapOut], ail, spoilers, side, tip: B(t.x - cT * 0.4, side * b2, t.z), mid: B(xLE(b2 * 0.55) - cAt(b2 * 0.55) * 0.5, side * b2 * 0.55, zAtY(b2 * 0.55)) });
    grpOut.userData.exterior = true;
  }

  // ---- engines
  parts.engines = [];
  const fan = new THREE.MeshBasicMaterial({ map: fanTexture() });
  for (const p of g.eng) {
    const D = g.engD, len = D * (g.rearEngines ? 2.3 : 1.85), r = D / 2;
    const grp = new THREE.Group();
    const cx = p[0] + len * (g.rearEngines ? 0.1 : 0.35);
    grp.position.copy(B(cx, p[1], p[2]));
    const shell = lathe([[r * 0.92, len * 0.5], [r, len * 0.46], [r * 1.02, len * 0.25], [r * 0.98, -len * 0.05], [r * 0.82, -len * 0.38], [r * 0.7, -len * 0.5]]);
    shell.rotateX(Math.PI / 2);
    const nac = new THREE.Mesh(shell, M.eng);
    grp.add(nac);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.94, r * 0.07, 8, 28), M.metal);
    lip.position.z = -len * 0.5;
    grp.add(lip);
    const fanDisc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 28), fan);
    fanDisc.position.z = -len * 0.44;
    fanDisc.rotation.y = Math.PI;
    grp.add(fanDisc);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.88, len * 0.1, 24, 1, true), M.dark);
    inner.rotation.x = Math.PI / 2;
    inner.position.z = -len * 0.47;
    grp.add(inner);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 0.42, len * 0.36, 20), M.hot);
    cone.rotation.x = Math.PI / 2;
    cone.position.z = len * 0.62;
    grp.add(cone);
    if (g.chevrons) {
      for (let i = 0; i < 14; i++) {
        const tri = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, r * 0.25, 3), M.eng);
        const a = (i / 14) * Math.PI * 2;
        tri.position.set(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, len * 0.53);
        tri.rotation.x = Math.PI / 2;
        grp.add(tri);
      }
    }
    // reverser sleeve: slides aft, exposing the cascades
    const cascade = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.99, r * 0.99, len * 0.16, 24, 1, true), M.dark);
    cascade.rotation.x = Math.PI / 2;
    cascade.position.z = len * 0.02;
    cascade.visible = false;
    grp.add(cascade);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.0, r * 0.84, len * 0.32, 24, 1, true), M.eng);
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.z = len * 0.2;
    grp.add(sleeve);
    // pylon
    if (g.rearEngines) {
      const py = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(p[1]) - R * 0.7, D * 0.18, len * 0.5), M.body);
      py.position.set(-Math.sign(p[1]) * (Math.abs(p[1]) - R * 0.7) / 2, 0, 0);
      grp.add(py);
    } else {
      const top = zAtY(Math.abs(p[1]));
      const ph = p[2] - top;
      const py = new THREE.Mesh(new THREE.BoxGeometry(D * 0.14, Math.max(0.3, ph), len * 0.95), M.body);
      py.position.set(0, ph / 2 + r * 0.2, -len * 0.05 - (cx - p[0]) * 0.3);
      grp.add(py);
    }
    root.add(grp);
    parts.engines.push({ group: grp, fan: fanDisc, sleeve, cascade, len, r, nozzle: B(p[0] - len * 0.35, p[1], p[2]) });
  }

  // ---- empennage
  const vH = g.vtail, vCr = (2 * g.S * 0.2) / (vH * 1.3) * 0.9, vCt = vCr * 0.32;
  const vx = tx + Lt * 0.62 + vCr * 0.5, vz = -R * 0.55;
  const vSweep = Math.tan(40 * D2R);
  const finRoot = { x: vx, y: 0, z: vz, c: vCr }, finTip = { x: vx - vH * vSweep, y: 0, z: vz - vH, c: vCt };
  const fin = new THREE.Mesh(surface(finRoot, finTip, 0.1, true), M.tail);
  root.add(fin);
  parts.tail = [fin];
  // emblem on the fin, both sides
  const emb = emblemTexture();
  for (const side of [-1, 1]) {
    const s = vH * 0.5;
    const d = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: emb, transparent: true, depthWrite: false }));
    d.position.copy(B(vx - vH * 0.45 * vSweep - vCr * 0.45, side * vCr * 0.065, vz - vH * 0.45));
    d.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    root.add(d);
    parts.tail.push(d);
  }
  const rg = new THREE.Group();
  const ra = B(vx - vCr * 0.72, 0, vz), rb = B(vx - vH * vSweep - vCt * 0.72, 0, vz - vH * 0.93);
  rg.position.copy(ra);
  const rudLen = ra.distanceTo(rb);
  const rudMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, rudLen, vCr * 0.26), M.tail);
  rudMesh.position.set(0, rudLen / 2, vCr * 0.13);
  const rAxis = new THREE.Group();
  rAxis.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rb.clone().sub(ra).normalize());
  rAxis.add(rudMesh);
  rg.add(rAxis);
  root.add(rg);
  parts.rudder = rAxis;
  parts.tail.push(rg);
  // horizontal tail (T-tail on top of the fin for rear-engine jets)
  const hS = g.htail / 2, hCr = (2 * g.S * 0.26) / (g.htail * 1.3), hCt = hCr * 0.33;
  // optional g.htailFrac (0..1): cruciform tail, stabiliser that far up the fin
  const hf = g.ttail ? 0 : (g.htailFrac || 0);
  const hx = g.ttail ? finTip.x + vCt * 0.3 : hf ? vx - vH * hf * vSweep + (vCr + (vCt - vCr) * hf) * 0.1 : tx + Lt * 0.72;
  const hz = g.ttail ? finTip.z + 0.1 : hf ? vz - vH * hf : -R * 0.15;
  const hSweep = Math.tan(34 * D2R);
  parts.elevators = [];
  for (const side of [-1, 1]) {
    const a = { x: hx, y: side * (g.ttail || hf ? 0.1 : R * 0.25), z: hz, c: hCr }, bb = { x: hx - hS * hSweep, y: side * hS, z: hz - hS * 0.08, c: hCt };
    const stab = new THREE.Mesh(panel(side < 0 ? bb : a, side < 0 ? a : bb, 0.09), M.tail.color.getHex() === f.livery.body ? M.body : wingMats);
    root.add(stab);
    parts.tail.push(stab);
    const el = hinged([a.x - hCr * 0.72, a.y, hz], [bb.x - hCt * 0.7, bb.y, bb.z], hCr * 0.26, 0.08, wingMats);
    root.add(el);
    parts.elevators.push(el);
    parts.tail.push(el);
  }
  // APU exhaust & tail cone tip
  const apu = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.08, R * 0.08, 0.3, 10), M.dark);
  apu.rotation.x = Math.PI / 2;
  apu.position.copy(B(tx + 0.1, 0, -R * 0.62));
  root.add(apu);

  // gear
  const gear = buildGear(g, M, { noseTop: R * 0.85, mainTop: g.wingZ + 0.25 });
  root.add(gear.group);
  parts.gear = gear;

  // lights (body frame)
  const tipY = b2 + 0.1, tipX = xLE(b2) - cT * 0.3, tipZ = zAtY(b2);
  return {
    navL: B(tipX, -tipY, tipZ), navR: B(tipX, tipY, tipZ), tail: B(tx + 0.2, 0, -R * 0.6),
    beacon: B(xLEr - 2, 0, -(g.hump ? H - g.fusD / 2 : H / 2) - 0.1), beaconLow: B(xLEr - 4, 0, R + 0.05),
    strobeL: B(tipX - 0.3, -tipY, tipZ), strobeR: B(tipX - 0.3, tipY, tipZ),
    landing: B(xLEr - 0.5, -R * 1.25, g.wingZ + 0.1), taxi: B(nx - Ln * 0.95, 0, R * 1.1),
    logo: B(vx - 2, 0, vz),
  };
}

// ---------------------------------------------------------------------------
function buildFighter(f, root, M, parts) {
  const g = f.g;
  const L = g.L, nx = g.noseX, tx = nx - L;
  const W = g.fusW, Hh = g.fusD;
  const st = (t, w, h, zc) => ({ x: nx - t, w, h, zc });
  const S = [
    st(0, 0.05, 0.05, 0.05), st(L * 0.06, 0.45, 0.42, 0.04), st(L * 0.16, 0.9, 0.85, 0.0), st(L * 0.26, 1.15, 1.25, -0.1),
    st(L * 0.36, W * 0.9, Hh * 0.92, 0.0), st(L * 0.5, W, Hh, 0.05), st(L * 0.72, W * 0.95, Hh * 0.9, 0.05), st(L * 0.88, W * 0.78, Hh * 0.7, 0.05),
    st(L * 0.97, W * 0.62, Hh * 0.55, 0.05), st(L, W * 0.5, Hh * 0.5, 0.05),
  ];
  const fus = new THREE.Mesh(loft(S, 28, 3.2), M.body);
  fus.userData.exterior = true;
  root.add(fus);
  parts.fuselage = fus;
  // canopy over the eye point
  const can = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.canopy);
  can.scale.set(0.55, 0.55, 2.0);
  can.position.copy(B(g.eye[0] - 0.4, 0, -Hh * 0.38));
  can.userData.exterior = true;
  root.add(can);
  parts.canopy = can;
  // intakes: side boxes, or one ventral (chin) intake with g.intake === 'chin'
  if (g.intake === 'chin') {
    const iw = g.intakeW || 1.1;
    const ib = new THREE.Mesh(new THREE.BoxGeometry(iw, 0.8, L * 0.3), M.body);
    ib.position.copy(B(nx - L * 0.42, 0, Hh * 0.42));
    root.add(ib);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(iw * 0.86, 0.66), M.dark);
    mouth.position.copy(B(nx - L * 0.27 + 0.01, 0, Hh * 0.42));
    mouth.rotation.y = Math.PI;
    root.add(mouth);
  }
  for (const side of g.intake === 'chin' ? [] : [-1, 1]) {
    const ib = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.0, L * 0.3), M.body);
    ib.position.copy(B(nx - L * 0.42, side * (W * 0.5 - 0.15), 0.1));
    if (g.intake === 'caret') ib.rotation.z = side * 0.2;
    root.add(ib);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.88), M.dark);
    mouth.position.copy(B(nx - L * 0.27 + 0.01, side * (W * 0.5 - 0.15), 0.1));
    mouth.rotation.y = Math.PI;
    root.add(mouth);
  }
  // wing: trailing edge just ahead of the stabilators, swept leading edge
  const b2 = g.b / 2, lam = g.taper ?? 0.25;
  const cr = (2 * g.S) / (g.b * (1 + lam)) * 1.05;
  const sw = Math.tan((g.sweep) * D2R);
  const hCr = L * 0.16;
  const stabPivot = tx + hCr * 0.6, stabLE = stabPivot + hCr * 0.5;
  const yR = W * 0.38;
  const cAt = (y) => cr * (1 - (1 - lam) * Math.abs(y) / b2);
  // g.canard: close-coupled canards ahead of a tailless delta wing that runs to the tail
  const rootTE = g.canard ? tx + 0.8 : stabLE + 0.3;
  const leAt = (y) => rootTE + cAt(yR) - (Math.abs(y) - yR) * sw;
  const teAt = (y) => { const t = (Math.abs(y) - yR) / (b2 - yR); return rootTE + t * ((leAt(b2) - cAt(b2)) - rootTE); };
  const xLEr = leAt(yR);
  parts.wing = [];
  for (const side of [-1, 1]) {
    const grpIn = new THREE.Group(), grpOut = new THREE.Group();
    const sec = (y) => ({ x: leAt(y), y: side * y, z: g.wingZ + (y > yR ? (y - yR) * 0.01 : 0), c: leAt(y) - teAt(y) });
    const r0 = sec(0.15), rr = sec(yR), k = sec(b2 * 0.55), t = sec(b2);
    grpIn.add(new THREE.Mesh(panel(side < 0 ? rr : r0, side < 0 ? r0 : rr, 0.045), M.body));
    grpIn.add(new THREE.Mesh(panel(side < 0 ? k : rr, side < 0 ? rr : k, 0.045), M.body));
    grpOut.add(new THREE.Mesh(panel(side < 0 ? t : k, side < 0 ? k : t, 0.04), M.body));
    const hingeAt = (y, frac) => [teAt(y) + (leAt(y) - teAt(y)) * frac, side * y, g.wingZ];
    const flap = hinged(hingeAt(yR + 0.15, 0.2), hingeAt(b2 * 0.54, 0.2), (leAt(b2 * 0.4) - teAt(b2 * 0.4)) * 0.2, 0.06, M.body);
    const ail = hinged(hingeAt(b2 * 0.57, 0.22), hingeAt(b2 * 0.94, 0.22), (leAt(b2 * 0.75) - teAt(b2 * 0.75)) * 0.22, 0.05, M.body);
    grpIn.add(flap);
    grpOut.add(ail);
    root.add(grpIn, grpOut);
    parts.wing.push({ inner: grpIn, outer: grpOut, flaps: [flap], ail, spoilers: [], side, tip: B(t.x - t.c * 0.5, side * b2, t.z), mid: B(leAt(b2 * 0.5) - cAt(b2 * 0.5) * 0.5, side * b2 * 0.5, g.wingZ) });
  }
  // twin canted fins (or one centreline fin, g.tails === 'single') + all-moving stabilators
  parts.tail = [];
  const vH = g.vtail, vCr = L * 0.17, vCt = vCr * 0.38, vs = Math.tan(42 * D2R);
  for (const side of g.tails === 'single' ? [0] : [-1, 1]) {
    const yb = side * W * 0.36;
    const fg = new THREE.Group();
    fg.position.copy(B(tx + hCr * 0.9 + vCr, yb, -Hh * 0.35));
    fg.rotation.z = -side * (g.cant || 0) * D2R;
    const finM = new THREE.Mesh(surface({ x: 0, y: 0, z: 0, c: vCr }, { x: -vH * vs, y: 0, z: -vH, c: vCt }, 0.06, true), M.tail);
    fg.add(finM);
    // rudder: rotates about the fin's hinge line
    const ra = B(-vCr * 0.75, 0, -0.15), rb = B(-vH * vs - vCt * 0.72, 0, -vH * 0.85);
    const rAxis = new THREE.Group();
    rAxis.position.copy(ra);
    rAxis.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rb.clone().sub(ra).normalize());
    const rm = new THREE.Mesh(new THREE.BoxGeometry(0.08, ra.distanceTo(rb), vCr * 0.22), M.tail);
    rm.position.set(0, ra.distanceTo(rb) / 2, vCr * 0.11);
    rAxis.add(rm);
    fg.add(rAxis);
    root.add(fg);
    parts.tail.push(fg);
    (parts.rudders || (parts.rudders = [])).push(rAxis);
  }
  parts.stabs = [];
  const hS = g.htail / 2;
  for (const side of [-1, 1]) {
    const pg = new THREE.Group();
    // canards: smaller all-moving foreplanes just behind the cockpit
    const sc = g.canard ? hCr * 0.6 : hCr;
    pg.position.copy(g.canard ? B(nx - L * 0.28, side * W * 0.42, -0.1) : B(stabPivot, side * W * 0.42, 0.15));
    const m = new THREE.Mesh(panel(side < 0 ? { x: -sc * 0.5 - (hS - W * 0.42) * 0.8, y: -(hS - W * 0.42), z: 0, c: sc * 0.35 } : { x: sc * 0.5, y: 0, z: 0, c: sc },
      side < 0 ? { x: sc * 0.5, y: 0, z: 0, c: sc } : { x: sc * 0.5 - (hS - W * 0.42) * 0.8, y: hS - W * 0.42, z: 0, c: sc * 0.35 }, 0.05), M.tail);
    m.position.z = -sc * 0.1;
    pg.add(m);
    root.add(pg);
    parts.stabs.push({ g: pg, side, canard: !!g.canard });
    parts.tail.push(pg);
  }
  // engines: nozzles + afterburner flames
  parts.engines = [];
  for (const p of g.eng) {
    const grp = new THREE.Group();
    grp.position.copy(B(tx + 0.4, p[1], p[2]));
    const r = g.engD / 2;
    let noz;
    if (g.nozzle === '2d') { noz = new THREE.Mesh(new THREE.BoxGeometry(r * 2.1, r * 1.3, 1.6), M.hot); }
    else { noz = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 1.05, 1.6, 20, 1, true), M.hot); noz.rotation.x = Math.PI / 2; }
    grp.add(noz);
    const hole = new THREE.Mesh(g.nozzle === '2d' ? new THREE.PlaneGeometry(r * 1.8, r * 1.05) : new THREE.CircleGeometry(r * 0.85, 20), new THREE.MeshBasicMaterial({ color: 0x2a1408 }));
    hole.position.z = 0.75;
    grp.add(hole);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(r * 0.85, 6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    flame.rotation.x = -Math.PI / 2;
    flame.position.z = 0.8 + 3;
    grp.add(flame);
    const core = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, 3.5, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.rotation.x = -Math.PI / 2;
    core.position.z = 0.8 + 1.75;
    grp.add(core);
    root.add(grp);
    parts.engines.push({ group: grp, flame, core, nozzle: B(tx - 0.6, p[1], p[2]), r });
  }
  const gear = buildGear(g, M, { noseTop: Hh * 0.35, mainTop: Hh * 0.4 });
  root.add(gear.group);
  parts.gear = gear;
  const tipX = leAt(b2) - cAt(b2) * 0.4;
  void xLEr;
  return {
    navL: B(tipX, -b2 - 0.05, g.wingZ), navR: B(tipX, b2 + 0.05, g.wingZ), tail: B(tx, 0, 0),
    beacon: B(nx - L * 0.55, 0, -Hh * 0.5), beaconLow: B(nx - L * 0.55, 0, Hh * 0.5),
    strobeL: B(tipX, -b2, g.wingZ), strobeR: B(tipX, b2, g.wingZ),
    landing: B(g.wheelbase - g.mainAft, 0.3, g.cg * 0.5), taxi: B(g.wheelbase - g.mainAft, -0.3, g.cg * 0.5),
  };
}

// ---------------------------------------------------------------------------
// Flying wing: surface grid over a sawtooth planform with a thickness hump.
function buildFlyingWing(f, root, M, parts) {
  const g = f.g;
  const b2 = g.b / 2, ax = g.noseX;
  const sw = Math.tan(g.sweep * D2R);
  const le = (y) => ax - y * sw;
  // trailing edge: double-W sawtooth (body x as a function of |y|)
  const tePts = [[0, -11.5], [5.2, -6.6], [11.6, -12.6], [17.8, -7.0], [b2, -8.4]];
  const te = (y) => {
    for (let i = 0; i < tePts.length - 1; i++) {
      const [y0, x0] = tePts[i], [y1, x1] = tePts[i + 1];
      if (y <= y1) return x0 + (x1 - x0) * (y - y0) / (y1 - y0);
    }
    return tePts[tePts.length - 1][1];
  };
  const NY = 48, NX = 18;
  const build = (ySign, mat) => {
    const pos = [], idx = [];
    for (let j = 0; j <= NY; j++) {
      const y = (j / NY) * b2;
      const x0 = le(y), x1 = Math.min(te(y), x0 - 0.6);
      const chord = x0 - x1;
      const hump = Math.max(0, 1 - (y / 4.2) ** 2);
      const tMax = Math.max(0.09 * chord, 2.4 * hump);
      for (let i = 0; i <= NX; i++) {
        const t = i / NX;
        const xc = 1 - Math.cos(t * Math.PI / 2) ** 1.0;
        const shape = Math.sqrt(Math.max(xc, 0)) * (1 - xc) * 1.9;
        const top = -tMax * shape * 0.62 - 0.2 * hump, bot = tMax * shape * 0.38;
        const vT = B(x0 - xc * chord, ySign * y, top), vB = B(x0 - xc * chord, ySign * y, bot);
        pos.push(vT.x, vT.y, vT.z, vB.x, vB.y, vB.z);
      }
    }
    const row = (NX + 1) * 2;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = j * row + i * 2, b = a + 2, c = a + row, d = c + 2;
      if (ySign > 0) { idx.push(a, c, b, b, c, d); idx.push(a + 1, b + 1, c + 1, b + 1, d + 1, c + 1); }
      else { idx.push(a, b, c, b, d, c); idx.push(a + 1, c + 1, b + 1, b + 1, c + 1, d + 1); }
    }
    // tip cap
    const j = NY * row;
    for (let i = 0; i < NX; i++) { const a = j + i * 2; ySign > 0 ? idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1) : idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  };
  parts.wing = [];
  for (const side of [-1, 1]) {
    const grp = new THREE.Group(), outer = new THREE.Group();
    grp.add(build(side, M.body));
    // elevons (2 per side) and split drag rudders at the tips
    const el1 = hinged([te(13.5) + 1.3, side * 13.5, 0.05], [te(17) + 1.3, side * 17, 0.05], 1.3, 0.12, M.body);
    const el2 = hinged([te(19) + 1.2, side * 19, 0.05], [te(24) + 1.2, side * 24, 0.05], 1.2, 0.12, M.body);
    const drUp = hinged([te(24.3) + 1.4, side * 24.3, -0.02], [te(25.9) + 1.4, side * 25.9, -0.02], 1.4, 0.05, M.body);
    const drDn = hinged([te(24.3) + 1.4, side * 24.3, 0.04], [te(25.9) + 1.4, side * 25.9, 0.04], 1.4, 0.05, M.body);
    outer.add(el1, el2, drUp, drDn);
    root.add(grp, outer);
    parts.wing.push({ inner: grp, outer, flaps: [], ail: el2, elevons: [el1, el2], drag: [drUp, drDn], spoilers: [], side, tip: B(le(b2) - 1.5, side * b2, 0), mid: B(le(b2 * 0.5) - 3, side * b2 * 0.5, 0) });
  }
  // cockpit windows & engine intakes/exhausts on the upper surface
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), M.glass);
    win.position.copy(B(ax - 1.8, side * 0.55, -2.5));
    win.rotation.x = -1.0;
    win.rotation.y = side * 0.25;
    root.add(win);
    for (const yy of [2.8, 5.0]) {
      const inl = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 2.4), M.body);
      inl.position.copy(B(-0.5, side * yy, -1.6));
      root.add(inl);
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.25), M.dark);
      mouth.position.copy(B(0.72, side * yy, -1.62));
      mouth.rotation.y = Math.PI;
      root.add(mouth);
    }
    const ex = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 2.0), M.hot);
    ex.position.copy(B(-6.5, side * 3.9, -0.9));
    root.add(ex);
  }
  parts.engines = g.eng.map((p) => ({ group: null, nozzle: B(-7.5, p[1], -0.9), r: 0.5 }));
  parts.tail = [];
  const gear = buildGear(g, M, { noseTop: 0.8, mainTop: 0.9 });
  root.add(gear.group);
  parts.gear = gear;
  return {
    navL: B(le(b2) - 1, -b2, 0), navR: B(le(b2) - 1, b2, 0), tail: B(-11.5, 0, 0),
    beacon: B(-2, 0, -1.6), beaconLow: B(-2, 0, 1.0), strobeL: B(le(b2) - 1.4, -b2, 0), strobeR: B(le(b2) - 1.4, b2, 0),
    landing: B(g.wheelbase - g.mainAft, 0.4, g.cg * 0.6), taxi: B(g.wheelbase - g.mainAft, -0.4, g.cg * 0.6),
  };
}

// ---------------------------------------------------------------------------
// Aerobatic monoplane (low wing, bubble canopy, tailwheel, 3-blade prop)
function buildAerobatic(f, root, M, parts) {
  const lv = f.livery;
  const fus = new THREE.Mesh(loft([
    { x: 2.25, w: 0.3, h: 0.3, zc: 0.0 }, { x: 2.0, w: 0.86, h: 0.82, zc: 0.0 }, { x: 1.2, w: 0.98, h: 0.95, zc: -0.05 },
    { x: 0.0, w: 0.9, h: 0.95, zc: -0.1 }, { x: -1.2, w: 0.7, h: 0.8, zc: -0.16 }, { x: -3.0, w: 0.34, h: 0.5, zc: -0.22 },
    { x: -4.5, w: 0.12, h: 0.3, zc: -0.26 },
  ], 22, 2.4), M.body);
  fus.userData.exterior = true;
  root.add(fus);
  parts.fuselage = fus;
  const stripe = new THREE.Mesh(loft([{ x: 1.9, w: 0.88, h: 0.16, zc: 0.15 }, { x: -1.0, w: 0.74, h: 0.14, zc: 0.08 }, { x: -4.0, w: 0.2, h: 0.1, zc: -0.1 }], 16, 2.2), M.accent);
  root.add(stripe);
  const can = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.glass);
  can.scale.set(0.42, 0.42, 1.2);
  can.position.copy(B(-0.5, 0, -0.45));
  root.add(can);
  parts.wing = [];
  const navy = new THREE.MeshStandardMaterial({ color: lv.stripe, roughness: 0.4 });
  for (const side of [-1, 1]) {
    const grpIn = new THREE.Group(), grpOut = new THREE.Group();
    const r0 = { x: 0.9, y: 0, z: 0.3, c: 1.85 }, t = { x: 0.55, y: side * 4.0, z: 0.22, c: 0.95 };
    grpIn.add(new THREE.Mesh(panel(side < 0 ? t : r0, side < 0 ? r0 : t, 0.15), M.body));
    const ail = hinged([0.9 - 1.85 * 0.7, side * 0.9, 0.3], [0.55 - 0.95 * 0.7, side * 3.9, 0.22], 0.62, 0.06, navy);
    grpOut.add(ail);
    root.add(grpIn, grpOut);
    parts.wing.push({ inner: grpIn, outer: grpOut, flaps: [], ail, spoilers: [], side, tip: B(0.4, side * 4, 0.2), mid: B(0.3, side * 2, 0.25) });
  }
  parts.tail = [];
  const fin = new THREE.Mesh(surface({ x: -3.7, y: 0, z: -0.2, c: 1.0 }, { x: -4.2, y: 0, z: -1.2, c: 0.6 }, 0.1, true), M.tail);
  root.add(fin);
  parts.tail.push(fin);
  const rg = new THREE.Group();
  rg.position.copy(B(-4.65, 0, -0.2));
  const rm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.5), M.tail);
  rm.position.set(0, 0.5, 0.25);
  rg.add(rm);
  root.add(rg);
  parts.rudder = rg;
  parts.tail.push(rg);
  parts.elevators = [];
  for (const side of [-1, 1]) {
    const a = { x: -3.75, y: side * 0.15, z: -0.2, c: 0.75 }, bb = { x: -3.9, y: side * 1.5, z: -0.2, c: 0.55 };
    const stab = new THREE.Mesh(panel(side < 0 ? bb : a, side < 0 ? a : bb, 0.08), M.body);
    root.add(stab);
    const el = hinged([-4.45, side * 0.15, -0.2], [-4.45, side * 1.5, -0.2], 0.4, 0.05, navy);
    root.add(el);
    parts.elevators.push(el);
    parts.tail.push(stab, el);
  }
  // spring-steel mains and tailwheel
  const gear = { group: new THREE.Group(), legs: [] };
  const wheel = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14).rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    const top = B(0.5, side * 0.35, 0.45), axle = B(0.45, side * 0.9, 0.95);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, top.distanceTo(axle), 0.14), M.body);
    leg.position.copy(top).lerp(axle, 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axle.clone().sub(top).normalize());
    gear.group.add(leg);
    const w = new THREE.Mesh(wheel, M.tire);
    w.position.copy(axle);
    gear.group.add(w);
    const pant = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8), M.body);
    pant.scale.set(0.5, 0.75, 1.6);
    pant.position.copy(axle);
    gear.group.add(pant);
  }
  const tw = new THREE.Group();
  tw.position.copy(B(-4.6, 0, 0.95));
  const tWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10).rotateZ(Math.PI / 2), M.tire);
  tw.add(tWheel);
  gear.group.add(tw);
  gear.tailwheel = tw;
  root.add(gear.group);
  parts.gear = gear;
  // three-blade prop
  const prop = new THREE.Group();
  prop.position.copy(B(2.35, 0, 0.0));
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 16), M.accent);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.12;
  prop.add(spinner);
  const blades = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.92, 0.025), M.dark);
    bl.position.y = 0.48;
    const holder = new THREE.Group();
    holder.rotation.z = (i * Math.PI * 2) / 3;
    bl.rotation.y = 0.3;
    holder.add(bl);
    blades.add(holder);
  }
  prop.add(blades);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 40), new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  prop.add(disc);
  root.add(prop);
  parts.prop = { group: prop, blades, disc };
  return {
    navL: B(0.4, -4.05, 0.2), navR: B(0.4, 4.05, 0.2), tail: B(-4.7, 0, -0.25), beacon: B(-4.2, 0, -1.25),
    strobeL: B(0.3, -4.05, 0.2), strobeR: B(0.3, 4.05, 0.2), landing: B(0.9, -1.5, 0.3), taxi: B(0.9, 1.5, 0.3),
  };
}

// ---------------------------------------------------------------------------
export function createAircraftModel(f) {
  const root = new THREE.Group();
  root.name = f.key;
  const M = mats(f.livery);
  const parts = {};
  const builder = { airliner: buildAirliner, fighter: buildFighter, flyingwing: buildFlyingWing, aerobatic: buildAerobatic }[f.style];
  const lights = builder(f, root, M, parts);
  const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(f.style === 'aerobatic' ? 0.05 : 0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0x661111 }));
  beaconMesh.position.copy(lights.beacon);
  root.add(beaconMesh);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (o.userData.exterior === undefined) o.userData.exterior = true; } });
  root.userData.fuselage = parts.fuselage;
  const seams = f.style === 'airliner' ? panelTexture(f.g.L, { nose: f.g.fusD * 1.75, tail: f.g.fusD * 2.9 }) : null;
  applyMaterialKit(root, { panel: seams, matte: f.style === 'fighter' || f.style === 'flyingwing' });
  return { root, parts, lights, beaconMesh, fleet: f, prop: parts.prop, fanAngle: 0 };
}

// Animate control surfaces, gear, engines from core outputs.
export function poseAircraft(m, o, dt) {
  const P = m.parts, f = m.fleet;
  const flapMax = f.style === 'fighter' ? 30 : 40;
  const ff = Math.min(1, (o.flapsDeg || 0) / flapMax);
  const ail = o.ail || 0, el = o.elev || 0, rud = o.rud || 0;
  const sb = o.speedbrake || 0;
  for (const w of P.wing || []) {
    for (const fl of w.flaps) {
      fl.rotation.x = ff * 0.6;
      fl.userData.mesh.position.z = fl.userData.mesh.geometry.parameters.depth / 2 + ff * fl.userData.mesh.geometry.parameters.depth * 0.45;
    }
    if (w.ail) w.ail.rotation.x = (w.side < 0 ? -ail : ail) * 0.35;
    if (w.elevons) {
      const mix = (w.side < 0 ? -ail : ail) * 0.3 - el * 0.32;
      for (const e of w.elevons) e.rotation.x = mix;
      const dr = Math.max(0, w.side < 0 ? -rud : rud) * 0.7 + sb * 0.6 + 0.04;
      w.drag[0].rotation.x = -dr;
      w.drag[1].rotation.x = dr;
    }
    // spoilers: speed brake, ground spoilers, roll spoilers on the up-aileron wing
    const rollUp = Math.max(0, (w.side < 0 ? ail : -ail) - 0.2) * 1.2;
    for (const s of w.spoilers) s.rotation.x = -Math.min(0.85, sb * 0.85 + rollUp * 0.6);
  }
  for (const e of P.elevators || []) e.rotation.x = -el * 0.4;
  for (const s of P.stabs || []) s.g.rotation.x = s.canard ? el * 0.3 : -el * 0.35 + (s.side < 0 ? -ail : ail) * 0.12;
  if (P.rudder) P.rudder.rotation.y = -rud * 0.45;
  for (const r of P.rudders || []) r.rotation.y = -rud * 0.4;
  // gear
  const gp = o.gearPos ?? 1;
  if (P.gear) {
    for (const leg of P.gear.legs || []) {
      leg.pivot.visible = gp > 0.02;
      leg.pivot.rotation.x = leg.nose ? -(1 - gp) * 1.6 : 0;
      leg.pivot.rotation.z = leg.nose ? 0 : -leg.fold * (1 - gp) * 1.55;
      if (leg.nose) leg.steer.rotation.y = -(o.steer || 0);
    }
    if (P.gear.tailwheel) P.gear.tailwheel.rotation.y = (o.steer || 0);
  }
  // engines
  const n1 = [o.n1_0, o.n1_1, o.n1_2, o.n1_3];
  m.fanAngle = (m.fanAngle || 0);
  (P.engines || []).forEach((e, i) => {
    const n = n1[i] || 0;
    if (e.fan) e.fan.rotation.z += (n / 100) * 70 * dt * (0.25 + 0.75 * Math.random() * 0 + 0.75);
    if (e.sleeve) { const rv = o.reverser ? 1 : 0; e.rev = (e.rev || 0) + (rv - (e.rev || 0)) * Math.min(1, dt * 1.5); e.sleeve.position.z = e.len * (0.2 + 0.18 * e.rev); e.cascade.visible = e.rev > 0.05; }
    if (e.flame) {
      const ab = o.afterburner ? 1 : 0;
      const target = ab ? 0.55 + 0.45 * Math.max(0, ((o.atThr || 0) - 0.92) / 0.08) : 0;
      e.ab = (e.ab || 0) + (target - (e.ab || 0)) * Math.min(1, dt * 6);
      const flick = 0.92 + Math.random() * 0.16;
      e.flame.material.opacity = e.ab * 0.75 * flick;
      e.core.material.opacity = e.ab * 0.9;
      e.flame.scale.set(1, (0.5 + e.ab * 0.6) * flick, 1);
      e.flame.visible = e.core.visible = e.ab > 0.01;
    }
  });
  // propeller (aerobatic)
  if (m.prop) {
    const rpm = o.rpm || 0;
    m.prop.blades.rotation.z = -(o.propAngle || 0);
    const blur = THREE.MathUtils.smoothstep(rpm, 500, 1300);
    m.prop.disc.material.opacity = blur * (o.inside ? 0.035 : 0.22);
    m.prop.blades.visible = blur < 0.98;
  }
}
