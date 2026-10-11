// Glass flight deck for the jets: PFD / ND / EICAS / status displays, mode
// control panel, overhead panel, pedestal (thrust levers, speed brake, flap
// lever, reversers, fuel control), gear lever, engine fire handles; and a
// single-seat fighter cockpit (HUD, MFDs, stick, throttle). Every control is
// a real input to the C++ core — none is cosmetic.
// Group space = eye point (x right, y up, z aft).
import * as THREE from 'three';
import { B } from './models.js';
import { drawPFD, drawND, drawEICAS, drawSystems, drawHUD } from './displays.js';

function labelTex(text, w = 256, h = 64, bg = '#1c2026', fg = '#e9e9e9', size = 28) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = `bold ${size}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


// ---- flight deck surface kit: canvas textures shared by every glass deck ----
let deckTex = null;
function grainCanvas(size, base, amp, seed0, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  let seed = seed0;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < size * size; i++) {
    const n = (rnd() - 0.5) * amp;
    img.data[i * 4] = Math.max(0, Math.min(255, base[0] + n));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, base[1] + n));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, base[2] + n));
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (draw) draw(g, size, rnd);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function deckTextures() {
  if (deckTex) return deckTex;
  // instrument panel: fine-textured charcoal paint, panel seams and Dzus fasteners
  const panel = grainCanvas(512, [58, 63, 71], 10, 3, (g, S) => {
    g.strokeStyle = 'rgba(10,12,15,0.85)'; g.lineWidth = 3;
    for (const v of [0, S / 2]) { g.strokeRect(4 + v * 0, 4 + v, S - 8, S / 2 - 8); }
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
    for (const v of [0, S / 2]) { g.strokeRect(6, 6 + v, S - 12, S / 2 - 12); }
    const dzus = (x, y) => {
      const gr = g.createRadialGradient(x - 2, y - 2, 1, x, y, 7);
      gr.addColorStop(0, '#c9ccd0'); gr.addColorStop(1, '#4b5056');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1d2024'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.stroke();
    };
    for (const v of [0, S / 2]) for (const [x, y] of [[16, 16], [S - 16, 16], [16, S / 2 - 16], [S - 16, S / 2 - 16]]) dzus(x, y + v);
  });
  // glareshield: dark, slightly pebbled anti-glare finish
  const glare = grainCanvas(256, [30, 32, 36], 16, 5);
  // cabin lining for pillars, ceiling and side walls: light warm grey with a soft weave
  const lining = grainCanvas(256, [98, 106, 116], 10, 9, (g, S) => {
    g.strokeStyle = 'rgba(0,0,0,0.05)';
    for (let i = 0; i < S; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); }
  });
  deckTex = { panel, glare, lining };
  return deckTex;
}
function deckMat(kind, repeat = null) {
  const t = deckTextures();
  if (kind === 'panel') {
    let map = t.panel;
    if (repeat) { map = t.panel.clone(); map.repeat.set(repeat[0], repeat[1]); map.needsUpdate = true; }
    return new THREE.MeshStandardMaterial({ map, roughness: 0.78, metalness: 0.05, envMapIntensity: 0.3 });
  }
  if (kind === 'glare') return new THREE.MeshStandardMaterial({ map: t.glare, roughness: 0.92, metalness: 0, envMapIntensity: 0.2 });
  if (kind === 'lining') return new THREE.MeshStandardMaterial({ map: t.lining, roughness: 0.95, metalness: 0, envMapIntensity: 0.2 });
  return new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.45, metalness: 0.2, envMapIntensity: 0.5 });   // bezel
}
// rounded glareshield: a lipped profile extruded across the deck
function glareshieldGeometry(width, depth) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(depth, 0); s.lineTo(depth, 0.035);
  s.quadraticCurveTo(depth * 0.4, 0.075, 0.02, 0.06);
  s.quadraticCurveTo(-0.025, 0.045, -0.02, 0.0);
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, curveSegments: 10 });
  g.rotateY(Math.PI / 2);                   // extrude along +x; the lip (shape x = 0) faces aft (+z)
  g.translate(-width / 2, 0, 0);
  return g;
}

class Screen {
  constructor(w = 512, h = 512, transparent = false) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, transparent, depthWrite: !transparent });
  }
  mesh(w, h) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat); }
}

export class GlassCockpit {
  constructor(f) {
    this.f = f;
    this.group = new THREE.Group();
    this.group.name = 'glass-cockpit';
    const e = f.g.eye;
    this.eye = B(e[0], e[1], e[2]);
    this.group.position.copy(this.eye);
    this.interactives = [];
    this.anim = {};
    this.fighter = f.cockpit === 'fighter';
    this.screens = {};
    this.drawTimer = 0;
    if (this.fighter) this.buildFighter(); else this.buildAirliner();
  }

  _mat(color, rough = 0.8, metal = 0) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); }

  _interactive(mesh, action, label, kind = 'toggle', extra = {}) {
    Object.assign(mesh.userData, { action, label, kind }, extra);
    this.interactives.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  _label(text, x, y, z, w = 0.05, h = 0.012, rotX = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: labelTex(text, 256, 64, '#1c2026', '#d8dde3', 26), toneMapped: false }));
    m.position.set(x, y, z);
    m.rotation.x = rotX;
    this.group.add(m);
    return m;
  }

  _switch(id, label, x, y, z, rotX = 0, txt = null) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.022, 0.012), this._mat(0xd0d4d8, 0.4, 0.6));
    s.position.set(x, y, z);
    s.rotation.x = rotX;
    this._interactive(s, id, label, 'toggle');
    (this.anim.switches || (this.anim.switches = [])).push({ mesh: s, id, rot0: rotX });
    if (txt) this._label(txt, x, y + 0.022, z + 0.001, 0.045, 0.011, rotX);
    return s;
  }

  _button(action, label, x, y, z, txt, w = 0.028, extra = {}) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.014, 0.008), new THREE.MeshBasicMaterial({ map: labelTex(txt, 128, 64, '#2a3038', '#e6e6e6', 30), toneMapped: false }));
    b.position.set(x, y, z);
    this._interactive(b, action, label, 'button', extra);
    return b;
  }

  _knob(action, label, x, y, z, r = 0.009) {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, 0.014, 18), this._mat(0x15171a, 0.5));
    k.rotation.x = Math.PI / 2;
    k.position.set(x, y, z);
    return this._interactive(k, action, label, 'knob');
  }

  // -------------------------------------------------------------------------
  buildAirliner() {
    const G = this.group, f = this.f;
    const cxOff = -f.g.eye[1];   // aircraft centreline, model x relative to the eye
    const pz = -0.78;
    const dark = deckMat('glare'), panelMat = deckMat('panel', [Math.max(2, Math.round((cxOff * 2 + 0.9) / 0.45)), 1]), black = this._mat(0x0e1013, 0.7), bezel = deckMat('bezel');
    // main instrument panel and glareshield
    const panel = new THREE.Mesh(new THREE.BoxGeometry(cxOff * 2 + 0.9, 0.5, 0.03), panelMat);
    panel.position.set(cxOff, -0.33, pz - 0.02);
    panel.rotation.x = -0.12;
    G.add(panel);
    const gs = new THREE.Mesh(glareshieldGeometry(cxOff * 2 + 0.95, 0.2), dark);
    gs.position.set(cxOff, -0.09, pz + 0.115);
    G.add(gs);
    // window frames (inside view has no exterior fuselage): lined like the cabin
    const frame = deckMat('lining');
    const post = (x, rz) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.06), frame); p.position.set(x, 0.14, pz - 0.05); p.rotation.z = rz; p.rotation.x = 0.35; G.add(p); };
    post(cxOff, 0); post(-0.42, 0.12); post(cxOff * 2 + 0.42, -0.12);
    // window openings (group space) for the rain overlay: windscreen, left and right side windows
    const xr = cxOff * 2 + 0.62;
    this.windowPolys = [
      [[-0.62, -0.03, pz + 0.12], [xr, -0.03, pz + 0.12], [xr, 0.3, pz + 0.04], [-0.62, 0.3, pz + 0.04]],
      [[-0.6, -0.1, pz + 0.12], [-0.6, -0.1, 0.45], [-0.6, 0.27, 0.45], [-0.6, 0.3, pz + 0.04]],
      [[xr - 0.02, -0.1, pz + 0.12], [xr - 0.02, -0.1, 0.45], [xr - 0.02, 0.27, 0.45], [xr - 0.02, 0.3, pz + 0.04]],
    ];
    post(-0.55, 0.5); post(cxOff * 2 + 0.55, -0.5);
    const top = new THREE.Mesh(new THREE.BoxGeometry(cxOff * 2 + 1.2, 0.05, 0.5), frame);
    top.position.set(cxOff, 0.36, pz + 0.12);
    G.add(top);
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 1.3), frame);
      wall.position.set(cxOff + s * (cxOff + 0.62), -0.42, -0.2);
      G.add(wall);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 1.3), frame);
      sill.position.set(cxOff + s * (cxOff + 0.6), -0.12, -0.2);
      G.add(sill);
    }
    // displays (captain + first officer share the same images)
    const S = 0.205;
    const scr = this.screens;
    scr.pfd = new Screen(); scr.nd = new Screen(); scr.eicas = new Screen(); scr.sys = new Screen();
    const place = (sc, x, y) => {
      const m = sc.mesh(S, S); m.position.set(x, y, pz + 0.004); m.rotation.x = -0.12; G.add(m);
      // display unit bezel with a slight frame, proud of the panel
      const bz = new THREE.Mesh(new THREE.BoxGeometry(S + 0.026, S + 0.03, 0.014), bezel);
      bz.position.set(x, y - 0.002, pz - 0.004); bz.rotation.x = -0.12; G.add(bz);
      return m;
    };
    place(scr.pfd, -0.12, -0.27); place(scr.nd, 0.11, -0.27);
    place(scr.eicas, cxOff, -0.24); place(scr.sys, cxOff, -0.47);
    place(scr.nd, cxOff * 2 - 0.11, -0.27); place(scr.pfd, cxOff * 2 + 0.12, -0.27);
    // mode control panel on the glareshield
    scr.mcp = new Screen(1024, 128);
    const mcp = scr.mcp.mesh(0.62, 0.078);
    mcp.position.set(cxOff, -0.055, pz + 0.141);
    mcp.rotation.x = -0.35;
    G.add(mcp);
    const mz = pz + 0.15, my = -0.085;
    const bx = cxOff - 0.27;
    this._button('at', 'Autothrottle A/T (arm / disconnect)', bx, my, mz, 'A/T');
    this._knob('atSpd', 'Speed select (wheel ±1 kt, click: sync to current speed)', bx + 0.05, my, mz);
    this._knob('hdgBug', 'Heading select (wheel ±1°, click: sync)', bx + 0.13, my, mz);
    this._button('apHdg', 'HDG SEL mode', bx + 0.17, my, mz, 'HDG');
    this._button('apNav', 'LNAV (to destination / waypoint)', bx + 0.205, my, mz, 'LNAV');
    this._knob('apAltKnob', 'Altitude select (wheel ±100 ft, shift-wheel ±1000)', bx + 0.27, my, mz);
    this._button('apAlt', 'ALT HOLD', bx + 0.31, my, mz, 'ALT');
    this._button('apVs', 'V/S mode', bx + 0.345, my, mz, 'V/S');
    this._button('apUp', 'V/S or ALT target up', bx + 0.38, my + 0.009, mz, '▲', 0.02);
    this._button('apDn', 'V/S or ALT target down', bx + 0.38, my - 0.009, mz, '▼', 0.02);
    this._button('ap', 'Autopilot CMD (engage / disconnect)', bx + 0.43, my, mz, 'CMD', 0.034);
    this._knob('baro', 'Baro setting (wheel, click: QNH)', -0.32, -0.095, pz + 0.12);
    this._knob('ndRange', 'ND range (wheel)', 0.25, -0.095, pz + 0.12);
    // gear lever (centre panel, left of the EICAS)
    const gearBase = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.01), black);
    gearBase.position.set(cxOff - 0.17, -0.32, pz + 0.004);
    G.add(gearBase);
    const gearH = new THREE.Group();
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.028, 16), this._mat(0xe9e9e9, 0.5));
    knob.rotation.x = Math.PI / 2;
    knob.position.z = 0.03;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.03), this._mat(0x888888, 0.4, 0.7));
    arm.position.z = 0.015;
    gearH.add(arm, knob);
    gearH.position.set(cxOff - 0.17, -0.32, pz + 0.01);
    G.add(gearH);
    this.anim.gearH = gearH;
    knob.userData = { action: 'gear', label: 'Landing gear lever (UP / DOWN)', kind: 'toggle' };
    this.interactives.push(knob);
    this._label('GEAR', cxOff - 0.17, -0.245, pz + 0.006, 0.05, 0.012);
    // engine fire handles (above the EICAS)
    for (let i = 0; i < f.engines; i++) {
      const x = cxOff - 0.09 + (i + 0.5) * (0.18 / f.engines);
      // T-handle in a dark recess (pull = fuel off + extinguisher)
      const well = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.026, 0.01), this._mat(0x0f1114, 0.7));
      well.position.set(x, -0.115, pz + 0.006);
      G.add(well);
      const h = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.022, 6, 10), this._mat(0xc41212, 0.42));
      h.rotation.z = Math.PI / 2;
      h.position.set(x, -0.115, pz + 0.02);
      this._interactive(h, 'fire', `Engine ${i + 1} fire handle: pull = fuel off + extinguisher`, 'toggle', { index: i });
      (this.anim.fire || (this.anim.fire = [])).push(h);
    }
    // overhead panel
    const oh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.5), panelMat);
    oh.position.set(cxOff, 0.33, -0.2);
    oh.rotation.x = 0.35;
    G.add(oh);
    const ohSw = [['battery', 'BAT', 'Battery master'], ['alternator', 'GEN', 'Engine generators'], ['avionics', 'AVION', 'Avionics / displays'],
      ['beacon', 'BCN', 'Beacon'], ['nav', 'NAV', 'Navigation & logo lights'], ['strobe', 'STRB', 'Strobes'], ['landing', 'LAND', 'Landing lights'], ['taxi', 'TAXI', 'Taxi / runway turnoff lights'],
      ['pitot', 'ANTI-ICE', 'Probe & window heat']];
    ohSw.forEach(([id, t, l], i) => {
      const x = cxOff - 0.22 + (i % 5) * 0.11, zz = -0.32 + Math.floor(i / 5) * 0.12;
      this._switch(id, l, x, 0.322 - (zz + 0.2) * Math.tan(0.35) * 0.0, zz, Math.PI / 2 + 0.35, t);
    });
    // engine start (ignition) selector on the overhead
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 16), this._mat(0x15171a, 0.5));
    st.position.set(cxOff + 0.22, 0.32, -0.08);
    this._interactive(st, 'engStart', 'Engine start / ignition: OFF → NORM → START (click to cycle)', 'cycle');
    this.anim.engStart = st;
    this._label('ENG START  OFF·NORM·START', cxOff + 0.22, 0.3, -0.02, 0.1, 0.012, Math.PI / 2 + 0.35);
    // pedestal
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.62), dark);
    ped.position.set(cxOff, -0.62, -0.32);
    G.add(ped);
    const pedTop = -0.5;
    // thrust levers (one per engine)
    this.anim.thrust = [];
    for (let i = 0; i < f.engines; i++) {
      const lg = new THREE.Group();
      const x = cxOff - 0.05 + (i + 0.5) * (0.1 / f.engines);
      lg.position.set(x, pedTop, -0.42);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.007, 0.12, 12), this._mat(0x9aa0a6, 0.3, 0.8));
      shaft.position.y = 0.06;
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 14), this._mat(0x2a2d31, 0.5, 0.3));
      collar.position.y = 0.012;
      lg.add(collar);
      // knob: a rounded bar with a dark rubber grip (capsule across the lever)
      const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.016, 6, 12), this._mat(0x1b1d21, 0.62));
      grip.rotation.z = Math.PI / 2;
      grip.position.y = 0.127;
      grip.userData = { action: 'throttle', label: 'Thrust levers (drag / wheel; > 92 % = takeoff thrust)', kind: 'drag' };
      this.interactives.push(grip);
      const rev = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.02), this._mat(0xb7bcc2, 0.4, 0.6));
      rev.position.set(0, 0.105, -0.016);
      rev.userData = { action: 'reverse', label: 'Reverse thrust levers (on the ground)', kind: 'toggle' };
      this.interactives.push(rev);
      lg.add(shaft, grip, rev);
      G.add(lg);
      this.anim.thrust.push(lg);
    }
    // speed brake lever (left), flap lever (right)
    const sbg = new THREE.Group();
    sbg.position.set(cxOff - 0.11, pedTop, -0.42);
    const sbh = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.03, 6, 10), this._mat(0xdcdcd8, 0.45));
    sbh.rotation.z = Math.PI / 2;
    sbh.position.y = 0.082;
    sbh.userData = { action: 'speedbrake', label: 'Speed brake: drag to extend; click retracted lever = ARM ground spoilers', kind: 'drag' };
    this.interactives.push(sbh);
    const sbs = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.08, 10), this._mat(0x9aa0a6, 0.3, 0.8));
    sbs.position.y = 0.04;
    sbg.add(sbs, sbh);
    G.add(sbg);
    this.anim.sb = sbg;
    const flg = new THREE.Group();
    flg.position.set(cxOff + 0.11, pedTop, -0.42);
    const fShape = new THREE.Shape();
    fShape.moveTo(-0.015, 0); fShape.quadraticCurveTo(-0.017, 0.016, 0.0, 0.017); fShape.quadraticCurveTo(0.012, 0.012, 0.016, 0.0); fShape.lineTo(-0.015, 0);
    const flGeo = new THREE.ExtrudeGeometry(fShape, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0015, bevelSegments: 2 });
    flGeo.translate(0, -0.008, -0.013);
    const flh = new THREE.Mesh(flGeo, this._mat(0xe9e9e6, 0.45));
    flh.position.y = 0.08;
    flh.userData = { action: 'jflaps', label: 'Flap lever: click front half = retract one detent, rear half = extend', kind: 'flaps' };
    this.interactives.push(flh);
    const fls = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.08, 10), this._mat(0x9aa0a6, 0.3, 0.8));
    fls.position.y = 0.04;
    flg.add(fls, flh);
    G.add(flg);
    this.anim.flap = flg;
    this._label(`FLAPS ${f.flaps.join(' ')}`, cxOff + 0.11, pedTop + 0.002, -0.28, 0.12, 0.015, -Math.PI / 2);
    this._label('SPEED BRAKE', cxOff - 0.11, pedTop + 0.002, -0.28, 0.08, 0.013, -Math.PI / 2);
    // fuel control switches (all engines)
    const fc = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.018, 0.02), this._mat(0x8a1010, 0.5));
    fc.position.set(cxOff, pedTop + 0.01, -0.16);
    this._interactive(fc, 'fuelCtl', 'Fuel control switches (all engines): RUN / CUTOFF', 'toggle');
    this.anim.fuelCtl = fc;
    this._label('FUEL CONTROL  RUN/CUTOFF', cxOff, pedTop + 0.002, -0.12, 0.11, 0.013, -Math.PI / 2);
    // parking brake
    const pb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 0.025), this._mat(0xb02020, 0.6));
    pb.position.set(cxOff - 0.1, pedTop + 0.01, -0.12);
    this._interactive(pb, 'parkBrake', 'Parking brake', 'toggle');
    this.anim.parkBrake = pb;
    // yoke or sidestick
    if (f.cockpit === 'sidestick') {
      const st2 = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.12, 10), black);
      stick.position.y = 0.06;
      st2.add(stick);
      st2.position.set(-0.42, -0.5, -0.25);
      G.add(st2);
      this.anim.stick = st2;
    } else {
      const yoke = new THREE.Group();
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), black);
      col.position.y = -0.2;
      const wheel = new THREE.Group();
      const hub = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.03), black);
      const horns = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.013, 8, 24, Math.PI), black);
      horns.rotation.z = Math.PI;
      horns.position.y = 0.03;
      wheel.add(hub, horns);
      yoke.add(col, wheel);
      yoke.position.set(0, -0.38, -0.52);
      G.add(yoke);
      this.anim.yoke = yoke;
      this.anim.wheel = wheel;
    }
  }

  // -------------------------------------------------------------------------
  buildFighter() {
    const G = this.group, f = this.f;
    const dark = deckMat('panel'), black = this._mat(0x0d0f12, 0.7), grey = this._mat(0x4a5058, 0.45, 0.4), bezel = deckMat('bezel');
    const pz = -0.62;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.32, 0.03), dark);
    panel.position.set(0, -0.36, pz - 0.02);
    panel.rotation.x = -0.15;
    G.add(panel);
    // canopy above the panel coaming and the side rails (rain overlay)
    this.windowPolys = [
      [[-0.55, -0.19, -0.5], [0.55, -0.19, -0.5], [0.7, 0.8, -0.45], [-0.7, 0.8, -0.45]],
      [[-0.42, -0.18, -0.5], [-0.42, -0.18, 0.5], [-0.42, 0.8, 0.5], [-0.42, 0.8, -0.45]],
      [[0.42, -0.18, -0.5], [0.42, -0.18, 0.5], [0.42, 0.8, 0.5], [0.42, 0.8, -0.45]],
    ];
    // canopy bow / frame
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 8, 24, Math.PI), grey);
    bow.position.set(0, -0.12, -0.5);
    G.add(bow);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 1.2), dark);
      rail.position.set(s * 0.4, -0.2, -0.1);
      G.add(rail);
      const con = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.6), dark);
      con.position.set(s * 0.3, -0.42, -0.1);
      G.add(con);
    }
    // HUD combiner (transparent canvas) and MFDs
    const scr = this.screens;
    scr.hud = new Screen(512, 512, true);
    const hud = scr.hud.mesh(0.17, 0.17);
    hud.position.set(0, -0.06, -0.5);
    hud.renderOrder = 10;
    G.add(hud);
    const hudFrame = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.02, 0.06), black);
    hudFrame.position.set(0, -0.155, -0.52);
    G.add(hudFrame);
    scr.mfdL = new Screen(); scr.mfdR = new Screen(); scr.mfdC = new Screen();
    const place = (sc, x, y, s = 0.15) => {
      const m = sc.mesh(s, s); m.position.set(x, y, pz + 0.004); m.rotation.x = -0.15; G.add(m);
      const bz = new THREE.Mesh(new THREE.BoxGeometry(s + 0.03, s + 0.03, 0.014), bezel);
      bz.position.set(x, y, pz - 0.004); bz.rotation.x = -0.15; G.add(bz);
    };
    place(scr.mfdL, -0.17, -0.35); place(scr.mfdC, 0, -0.38, 0.13); place(scr.mfdR, 0.17, -0.35);
    // stick (centre) and throttle (left console)
    const stick = new THREE.Group();
    const sm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.32, 10), black);
    sm.position.y = 0.16;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.04), black);
    grip.position.y = 0.33;
    stick.add(sm, grip);
    stick.position.set(0, -0.78, -0.32);
    G.add(stick);
    this.anim.stick = stick;
    const thr = new THREE.Group();
    const th = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.05), black);
    th.position.y = 0.04;
    th.userData = { action: 'throttle', label: 'Throttle (drag / wheel; > 92 % = afterburner)', kind: 'drag' };
    this.interactives.push(th);
    thr.add(th);
    thr.position.set(-0.3, -0.42, -0.1);
    G.add(thr);
    this.anim.thrust = [thr];
    // left console: gear handle, flaps, speed brake; right console: power, start
    const gearH = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.04, 10), this._mat(0xe9e9e9, 0.5));
    gearH.rotation.x = Math.PI / 2;
    gearH.position.set(-0.24, -0.3, pz + 0.02);
    this._interactive(gearH, 'gear', 'Landing gear handle (UP / DOWN)', 'toggle');
    this.anim.gearH = gearH;
    this._label('GEAR', -0.24, -0.27, pz + 0.004, 0.04, 0.01);
    this._switch('jflaps', 'Flaps UP / DOWN', -0.32, -0.4, 0.02, Math.PI / 2, 'FLAPS');
    this._switch('speedbrake', 'Speed brake (toggle)', -0.26, -0.4, 0.02, Math.PI / 2, 'SPD BRK');
    this._switch('parkBrake', 'Parking brake', -0.32, -0.4, 0.12, Math.PI / 2, 'P BRK');
    this._switch('battery', 'Battery', 0.25, -0.4, -0.05, Math.PI / 2, 'BATT');
    this._switch('alternator', 'Generators', 0.31, -0.4, -0.05, Math.PI / 2, 'GEN');
    this._switch('avionics', 'Avionics / displays', 0.37, -0.4, -0.05, Math.PI / 2, 'AVION');
    this._switch('fuelCtl', 'Throttle cutoff / fuel (OFF / IDLE)', 0.25, -0.4, 0.06, Math.PI / 2, 'FUEL');
    this._switch('nav', 'Position lights', 0.31, -0.4, 0.06, Math.PI / 2, 'LIGHTS');
    this._switch('landing', 'Landing / taxi light', 0.37, -0.4, 0.06, Math.PI / 2, 'LDG LT');
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 14), this._mat(0x15171a, 0.5));
    st.position.set(0.31, -0.395, 0.16);
    this._interactive(st, 'engStart', 'Engine start: OFF → NORM → START (click to cycle)', 'cycle');
    this.anim.engStart = st;
    for (let i = 0; i < f.engines; i++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, 0.02), this._mat(0xb01010, 0.5));
      h.position.set(0.2 + i * 0.04, -0.22, pz + 0.02);
      this._interactive(h, 'fire', `Engine ${i + 1} fire: fuel off + extinguisher`, 'toggle', { index: i });
      (this.anim.fire || (this.anim.fire = [])).push(h);
    }
    this._button('ap', 'Autopilot (attitude / altitude hold)', -0.06, -0.19, pz + 0.03, 'A/P');
    this._button('apAlt', 'AP altitude hold', -0.02, -0.19, pz + 0.03, 'ALT');
    this._button('apHdg', 'AP heading select', 0.02, -0.19, pz + 0.03, 'HDG');
    this._button('at', 'Autothrottle', 0.06, -0.19, pz + 0.03, 'A/T');
  }

  // -------------------------------------------------------------------------
  update(dt, o, sw, ui) {
    const A = this.anim, f = this.f;
    // levers & handles
    for (const t of A.thrust || []) t.rotation.x = -((o.atThr ?? sw.throttle) - 0.5) * 0.9;
    if (A.sb) A.sb.rotation.x = -(sw.speedbrake || 0) * 0.8 + (sw.spoilerArm ? -0.08 : 0);
    if (A.flap) A.flap.rotation.x = -0.4 + (sw.flaps / Math.max(1, f.flaps.length - 1)) * 0.9;
    if (A.gearH) A.gearH.position.y = (this.fighter ? -0.3 : 0) + (sw.gear ? -0.025 : 0.025) + (this.fighter ? 0 : -0.32);
    if (A.fuelCtl) A.fuelCtl.rotation.x = sw.mixture > 0.5 ? -0.4 : 0.4;
    if (A.engStart) A.engStart.rotation.y = [0, 0, 0, 0.8, 1.6][sw.mags] || 0;
    if (A.parkBrake) A.parkBrake.position.z = (this.fighter ? A.parkBrake.position.z : (sw.parkBrake ? -0.1 : -0.12));
    (A.fire || []).forEach((h, i) => { const on = ((sw.fireHandles || 0) >> i) & 1; if (h.userData.z0 === undefined) h.userData.z0 = h.position.z; h.position.z = h.userData.z0 + (on ? 0.025 : 0); h.material.emissive && h.material.emissive.setHex(((o.fireMask >> i) & 1) ? 0xff2000 : 0x000000); });
    for (const s of A.switches || []) s.mesh.rotation.x = s.rot0 + (sw[s.id] ? -0.35 : 0.35);
    if (A.yoke) { A.yoke.position.z = -0.52 + (o.elev || 0) * 0.06; A.wheel.rotation.z = -(o.ail || 0) * 1.2; }
    if (A.stick) { A.stick.rotation.x = -(o.elev || 0) * 0.25; A.stick.rotation.z = -(o.ail || 0) * 0.25; }

    // displays: redraw when visible, ~20 Hz, once per rendered frame
    this.drawTimer -= dt;
    if (this.drawTimer > 0 || !this.group.visible) return;
    if (ui.frame !== undefined && ui.frame === this._drawnFrame) return;
    this._drawnFrame = ui.frame;
    this.drawTimer = 1 / 20;
    const S = this.screens, fl = this.f;
    const ext = { ...ui, vmo: undefined };
    if (this.fighter) {
      drawHUD(S.hud.g, 512, o, ext);
      drawEICAS(S.mfdL.g, 512, o, sw, ext, fl);
      drawND(S.mfdR.g, 512, o, ext);
      drawSystems(S.mfdC.g, 512, o, sw, fl);
    } else {
      drawPFD(S.pfd.g, 512, o, ext, fl);
      drawND(S.nd.g, 512, o, ext);
      drawEICAS(S.eicas.g, 512, o, sw, ext, fl);
      drawSystems(S.sys.g, 512, o, sw, fl);
      this._drawMCP(S.mcp.g, o, sw, ui);
      S.mcp.tex.needsUpdate = true;
    }
    for (const k in S) S[k].tex.needsUpdate = true;
  }

  _drawMCP(g, o, sw, ui) {
    g.fillStyle = '#20252c'; g.fillRect(0, 0, 1024, 128);
    if (!o.avionicsPowered || o.elecFail) return;
    const box = (x, label, value, on) => {
      g.fillStyle = '#05080c'; g.fillRect(x, 40, 150, 60);
      g.fillStyle = on ? '#ffb000' : '#b0b6bd'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText(label, x + 75, 28);
      g.fillStyle = '#ffb000'; g.font = 'bold 40px monospace'; g.fillText(value, x + 75, 86);
    };
    box(20, ui.atOn ? 'A/T ARM' : 'IAS', String(Math.round(ui.atSpdKt || 0)), ui.atOn);
    box(250, sw.apLat === 1 && o.apEngaged ? 'HDG SEL' : 'HDG', String(Math.round(ui.hdgBugDeg || 0)).padStart(3, '0'), o.apEngaged && sw.apLat === 1);
    box(520, sw.apVert === 1 && o.apEngaged ? 'ALT HOLD' : 'ALT', String(Math.round(ui.apAltFt || 0)), o.apEngaged && sw.apVert === 1);
    box(720, 'V/S', String(Math.round(ui.apVsFpm || 0)), o.apEngaged && sw.apVert === 0);
    g.fillStyle = o.apEngaged ? '#38e86a' : '#555'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.fillText(o.apEngaged ? 'CMD' : 'A/P', 950, 80);
  }
}
