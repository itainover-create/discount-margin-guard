// Interactive 3D cockpit for the Skylark T1: panel with live instruments,
// switches, levers, yokes, magneto key, fuel selector, trim wheel, flap
// lever, autopilot & radio stack, annunciators and a wet compass. Every
// control is a real input to the C++ core (no cosmetic-only buttons).
// Model space: x right, y up, z aft; the pilot eye is at (-0.28, 0.62, -0.22).
import * as THREE from 'three';
import { InstrumentAtlas } from './instruments.js';

export const EYE = new THREE.Vector3(-0.28, 0.66, -0.20);

function labelTex(text, w = 256, h = 64, bg = '#141619', fg = '#e9e9e9', size = 30) {
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

export class Cockpit {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'cockpit';
    this.group.position.y = -0.06; // panel top ~20 cm below eye level (C172-class sight line)
    this.interactives = [];
    this.atlas = new InstrumentAtlas();
    this.tex = new THREE.CanvasTexture(this.atlas.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.gaugeMat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.radio = document.createElement('canvas');
    this.radio.width = 512; this.radio.height = 512;
    this.radioTex = new THREE.CanvasTexture(this.radio);
    this.radioTex.colorSpace = THREE.SRGBColorSpace;
    this.anim = {};
    this.build();
    this.drawTimer = 0;
  }

  _mat(color, rough = 0.8, metal = 0) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); }

  _gauge(name, x, y, size) {
    const uv = this.atlas.uv(name);
    const g = new THREE.CircleGeometry(size / 2, 40);
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, uv.u0 + a.getX(i) * (uv.u1 - uv.u0), uv.v0 + a.getY(i) * (uv.v1 - uv.v0));
    const m = new THREE.Mesh(g, this.gaugeMat);
    m.position.set(x, y, this.panelZ + 0.004);
    this.group.add(m);
    // bezel
    const bz = new THREE.Mesh(new THREE.RingGeometry(size / 2, size / 2 + 0.006, 40), this._mat(0x0d0d0e, 0.6));
    bz.position.set(x, y, this.panelZ + 0.005);
    this.group.add(bz);
    return m;
  }

  _interactive(mesh, action, label, kind = 'toggle') {
    mesh.userData.action = action;
    mesh.userData.label = label;
    mesh.userData.kind = kind;
    this.interactives.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  build() {
    const G = this.group;
    const panelZ = -0.95;
    this.panelZ = panelZ;
    const panelMat = this._mat(0x2b2e33, 0.85);
    const trim = this._mat(0x3c4047, 0.6);
    const black = this._mat(0x101112, 0.7);
    const leather = this._mat(0x4a3a2e, 0.9);
    // panel
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.46, 0.03), panelMat);
    panel.position.set(-0.02, 0.24, panelZ - 0.015);
    G.add(panel);
    // glare shield
    const gs = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.02, 0.12), this._mat(0x18191b, 0.95));
    gs.position.set(-0.02, 0.475, panelZ + 0.05);
    gs.rotation.x = -0.18;
    G.add(gs);
    // lower panel / sub-panel
    const sub = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.12, 0.08), trim);
    sub.position.set(-0.02, -0.02, panelZ + 0.02);
    G.add(sub);
    // floor, sidewalls, roof, pillars
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.02, 1.6), this._mat(0x2a2a2c, 1));
    floor.position.set(0, -0.42, -0.2);
    G.add(floor);
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.45, 1.5), this._mat(0x5b5d61, 0.9));
      wall.position.set(sx * 0.565, -0.2, -0.2);
      G.add(wall);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.4), trim);
      sill.position.set(sx * 0.55, 0.32, -0.2);
      G.add(sill);
      const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.6, 0.035), this._mat(0x5b5d61, 0.8));
      aPillar.position.set(sx * 0.545, 0.72, -0.84);
      aPillar.rotation.x = 0.55;
      aPillar.rotation.z = -sx * 0.04;
      G.add(aPillar);
      const doorPost = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.06), black);
      doorPost.position.set(sx * 0.56, 0.62, 0.42);
      G.add(doorPost);
      // seat
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.48), leather);
      seat.position.set(sx * 0.28, -0.12, 0.08);
      G.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.08), leather);
      back.position.set(sx * 0.28, 0.2, 0.36);
      back.rotation.x = -0.18;
      G.add(back);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.02, 1.25), this._mat(0x8b8c8f, 1));
    roof.position.set(0, 0.98, -0.1);
    G.add(roof);
    // windshield header (top frame) hides the wing root from inside
    const header = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.22), this._mat(0x6e7075, 0.9));
    header.position.set(0, 0.95, -0.74);
    G.add(header);
    // wet compass hanging from the header
    this.compassCanvas = document.createElement('canvas');
    this.compassCanvas.width = 256; this.compassCanvas.height = 64;
    this.compassTex = new THREE.CanvasTexture(this.compassCanvas);
    const comp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), [black, black, black, black, new THREE.MeshBasicMaterial({ map: this.compassTex }), black]);
    comp.position.set(0.02, 0.885, -0.76);
    G.add(comp);

    // ----- instruments (six pack in front of the left seat)
    const S = 0.088, x0 = -0.28, y1 = 0.37, y2 = 0.27;
    this._gauge('asi', x0 - 0.097, y1, S);
    this._gauge('ai', x0, y1, S);
    this._gauge('alt', x0 + 0.097, y1, S);
    this._gauge('tc', x0 - 0.097, y2, S);
    this._gauge('hi', x0, y2, S);
    this._gauge('vsi', x0 + 0.097, y2, S);
    this._gauge('tach', x0 + 0.02, 0.165, 0.075);
    const e = 0.062;
    this._gauge('fuel', -0.5, 0.39, e);
    this._gauge('oil', -0.5, 0.315, e);
    this._gauge('egt', -0.5, 0.24, e);
    this._gauge('vac', -0.5, 0.165, e);
    this._gauge('amp', 0.42, 0.39, e);

    // annunciator strip
    this.annCanvas = document.createElement('canvas');
    this.annCanvas.width = 512; this.annCanvas.height = 48;
    this.annTex = new THREE.CanvasTexture(this.annCanvas);
    const ann = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.019), new THREE.MeshBasicMaterial({ map: this.annTex, toneMapped: false }));
    ann.position.set(x0, 0.432, panelZ + 0.004);
    G.add(ann);

    // ----- radio stack (COM, XPDR, autopilot) in the centre
    const radio = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: this.radioTex, toneMapped: false }));
    radio.position.set(0.06, 0.32, panelZ + 0.004);
    G.add(radio);
    const btn = (x, y, action, label, w = 0.026) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, 0.008), this._mat(0x30343a, 0.5));
      b.position.set(x, y, panelZ + 0.008);
      return this._interactive(b, action, label, 'button');
    };
    // autopilot buttons under the AP display line
    const apY = 0.218;
    btn(-0.02, apY, 'ap', 'Autopilot master (AP)');
    btn(0.012, apY, 'apHdg', 'AP heading mode (HDG)');
    btn(0.044, apY, 'apNav', 'AP NAV/GPS mode');
    btn(0.076, apY, 'apAlt', 'AP altitude hold (ALT)');
    btn(0.108, apY, 'apVs', 'AP vertical speed mode (VS)');
    btn(0.14, apY, 'apUp', 'AP VS/ALT target UP', 0.02);
    btn(0.14, apY - 0.016, 'apDn', 'AP VS/ALT target DOWN', 0.02);
    // knobs: heading bug, baro, HI align, COM tune
    const knob = (x, y, action, label) => {
      const k = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.015, 16), this._mat(0x1a1a1a, 0.5));
      k.rotation.x = Math.PI / 2;
      k.position.set(x, y, panelZ + 0.012);
      return this._interactive(k, action, label, 'knob');
    };
    knob(x0 + 0.045, y2 - 0.047, 'hdgBug', 'Heading bug (scroll / click: sync)');
    knob(x0 - 0.045, y2 - 0.047, 'alignHI', 'Heading indicator: align to compass');
    knob(x0 + 0.142, y1 - 0.047, 'baro', 'Altimeter setting (scroll / click: field QNH)');
    knob(0.16, 0.405, 'comTune', 'COM frequency (scroll)');

    // ----- switch row (rockers)
    const sw = [
      ['battery', 'BAT', 'Master battery'], ['alternator', 'ALT', 'Master alternator'], ['avionics', 'AVN', 'Avionics master'],
      ['fuelPump', 'PUMP', 'Fuel pump (prime)'], ['beacon', 'BCN', 'Beacon'], ['landing', 'LAND', 'Landing light'],
      ['taxi', 'TAXI', 'Taxi light'], ['nav', 'NAV', 'Navigation lights (+ panel lights)'], ['strobe', 'STRB', 'Strobes'], ['pitot', 'PITOT', 'Pitot heat'],
    ];
    this.switchMeshes = {};
    sw.forEach(([id, txt, label], i) => {
      const x = -0.42 + i * 0.046;
      const red = id === 'battery' || id === 'alternator';
      const rock = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.034, 0.012), this._mat(red ? 0xa82020 : 0x111111, 0.5));
      rock.position.set(x, 0.07, panelZ + 0.01);
      this._interactive(rock, id, label, 'toggle');
      this.switchMeshes[id] = rock;
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.01), new THREE.MeshBasicMaterial({ map: labelTex(txt, 128, 32, '#2b2e33', '#ddd', 22) }));
      lab.position.set(x, 0.098, panelZ + 0.003);
      G.add(lab);
    });
    // magneto / ignition key
    const keyBase = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 24), this._mat(0x777777, 0.4, 0.8));
    keyBase.rotation.x = Math.PI / 2;
    keyBase.position.set(-0.505, 0.075, panelZ + 0.006);
    G.add(keyBase);
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.02), this._mat(0xb8b8b8, 0.3, 0.9));
    key.position.set(-0.505, 0.075, panelZ + 0.018);
    this._interactive(key, 'mags', 'Ignition: OFF-R-L-BOTH (click) / hold START (right-click or hold)', 'mags');
    this.anim.key = key;
    const magLab = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.012), new THREE.MeshBasicMaterial({ map: labelTex('OFF R L BOTH START', 256, 32, '#2b2e33', '#ddd', 18) }));
    magLab.position.set(-0.505, 0.105, panelZ + 0.003);
    G.add(magLab);
    // parking brake handle
    const pb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.015, 0.03), this._mat(0xb02020, 0.6));
    pb.position.set(-0.47, -0.04, panelZ + 0.05);
    this._interactive(pb, 'parkBrake', 'Parking brake', 'toggle');
    this.anim.parkBrake = pb;

    // ----- throttle & mixture (push-pull), flap lever, trim wheel, fuel selector
    const plunger = (x, color, action, label) => {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 8), this._mat(0x999999, 0.3, 0.8));
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = 0.06;
      const knobM = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.018, 16), this._mat(color, 0.5));
      knobM.rotation.x = Math.PI / 2;
      knobM.position.z = 0.12;
      knobM.userData.action = action;
      knobM.userData.label = label;
      knobM.userData.kind = 'drag';
      this.interactives.push(knobM);
      g.add(shaft, knobM);
      g.position.set(x, 0.11, panelZ);
      G.add(g);
      return g;
    };
    this.anim.throttle = plunger(-0.02, 0x111111, 'throttle', 'Throttle (drag / wheel)');
    this.anim.mixture = plunger(0.04, 0xb01818, 'mixture', 'Mixture (drag / wheel)');
    const flapSlot = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.006), black);
    flapSlot.position.set(0.2, 0.12, panelZ + 0.004);
    G.add(flapSlot);
    const flapLever = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.03), this._mat(0xeeeeee, 0.6));
    flapLever.position.set(0.2, 0.16, panelZ + 0.02);
    this._interactive(flapLever, 'flaps', 'Flap lever: click upper/lower half (UP / DOWN one notch)', 'flaps');
    this.anim.flapLever = flapLever;
    const flapLab = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.09), new THREE.MeshBasicMaterial({ map: labelTex('0 10 20 FULL', 64, 192, '#2b2e33', '#ddd', 14) }));
    flapLab.position.set(0.235, 0.12, panelZ + 0.003);
    G.add(flapLab);
    const trimWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.018, 24), this._mat(0x1a1a1a, 0.7));
    trimWheel.rotation.z = Math.PI / 2;
    trimWheel.position.set(0, -0.2, -0.62);
    this._interactive(trimWheel, 'trim', 'Elevator trim wheel (wheel / drag)', 'trim');
    this.anim.trimWheel = trimWheel;
    const sel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.03), this._mat(0x991111, 0.6));
    sel.position.set(0, -0.39, -0.45);
    this._interactive(sel, 'fuelSelector', 'Fuel selector: OFF / LEFT / BOTH / RIGHT', 'cycle');
    this.anim.fuelSel = sel;
    const selBase = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), new THREE.MeshBasicMaterial({ map: labelTex('L   BOTH   R', 256, 64, '#1d1f22', '#ddd', 24) }));
    selBase.rotation.x = -Math.PI / 2;
    selBase.position.set(0, -0.398, -0.45);
    G.add(selBase);

    // ----- yokes (pilot and passenger), animated from control positions
    this.yokes = [];
    for (const sx of [-0.28, 0.28]) {
      const yoke = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 10), this._mat(0x888888, 0.3, 0.8));
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = -0.1;
      const hub = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.03), black);
      const horns = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 8, 24, Math.PI), black);
      horns.rotation.z = Math.PI;
      horns.position.y = 0.02;
      const roll = new THREE.Group();
      roll.add(hub, horns);
      yoke.add(shaft, roll);
      yoke.position.set(sx, 0.2, -0.72);
      yoke.userData.roll = roll;
      G.add(yoke);
      this.yokes.push(yoke);
    }
    // rudder pedals
    this.pedals = [];
    for (const sx of [-0.28, 0.28]) for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.02), black);
      p.position.set(sx + s * 0.08, -0.32, -0.78);
      p.rotation.x = -0.6;
      G.add(p);
      this.pedals.push({ mesh: p, side: s, z0: -0.78 });
    }
  }

  // ---- per-frame update: controls animation and gauge drawing
  update(dt, o, sw, ui) {
    for (const y of this.yokes) {
      y.position.z = -0.72 + (o.elev || 0) * 0.07;
      y.userData.roll.rotation.z = -(o.ail || 0) * 0.9;
    }
    for (const p of this.pedals) p.mesh.position.z = p.z0 + (o.rud || 0) * 0.04 * p.side;
    this.anim.throttle.position.z = this.panelZ - 0.06 + (1 - (sw.throttle || 0)) * 0.07 - 0.0;
    this.anim.mixture.position.z = this.panelZ - 0.06 + (1 - (sw.mixture || 0)) * 0.07;
    this.anim.flapLever.position.y = 0.16 - (sw.flaps || 0) * 0.027;
    this.anim.trimWheel.rotation.x = (o.trim || 0) * 6;
    this.anim.fuelSel.rotation.y = [Math.PI / 2, 0.8, 0, -0.8][sw.fuelSelector ?? 2];
    this.anim.key.rotation.z = -[(-0.9), (-0.45), 0, 0.45, 0.9][sw.mags ?? 0];
    this.anim.parkBrake.position.z = this.panelZ + (sw.parkBrake ? 0.09 : 0.05);
    for (const [id, m] of Object.entries(this.switchMeshes)) m.rotation.x = sw[id] ? -0.35 : 0.35;
    // instrument lighting with the nav-light switch (panel lights)
    const night = ui.night || 0;
    const backlight = sw.nav && o.busV > 18 ? 1.0 : 0.35 + 0.65 * (1 - night);
    this.gaugeMat.color.setScalar(backlight);

    // Canvas redraws only when visible, at most 30 Hz and once per rendered frame.
    this.drawTimer -= dt;
    if (this.drawTimer > 0 || !this.group.visible) return;
    if (ui.frame !== undefined && ui.frame === this._drawnFrame) return;
    this._drawnFrame = ui.frame;
    this.drawTimer = 1 / 30;
    this.atlas.draw({ ...o, hdgBug: ui.hdgBug || 0, baroHpa: ui.baroHpa || 1013, hobbs: ui.hobbs || 0 });
    this.tex.needsUpdate = true;
    this._drawRadio(o, sw, ui);
    this._drawAnnunciators(o, sw);
    this._drawCompass(o);
  }

  _drawRadio(o, sw, ui) {
    const g = this.radio.getContext('2d');
    const W = 512, H = 512;
    g.fillStyle = '#121417';
    g.fillRect(0, 0, W, H);
    const on = o.avionicsPowered;
    const seg = (y, h) => { g.fillStyle = '#05070a'; g.fillRect(16, y, W - 32, h); };
    seg(20, 130); seg(170, 120); seg(310, 180);
    g.textBaseline = 'middle';
    if (on) {
      g.fillStyle = '#7fff8a';
      g.font = 'bold 44px monospace';
      g.fillText(`COM1 ${ui.comFreq || '121.900'}`, 34, 62);
      g.font = '28px monospace';
      g.fillStyle = '#58c9ff';
      g.fillText(`${ui.comStation || ''}`.slice(0, 26), 34, 118);
      g.fillStyle = '#ffd36b';
      g.font = 'bold 40px monospace';
      g.fillText(`XPDR ${ui.squawk || '1200'}  ${o.onGround ? 'GND' : 'ALT'}`, 34, 230);
      g.font = 'bold 34px monospace';
      g.fillStyle = o.apEngaged ? '#7fff8a' : '#666';
      const lat = ['ROL', 'HDG', 'NAV'][o.apLat || 0], vert = ['VS', 'ALT'][o.apVert || 0];
      g.fillText(o.apEngaged ? `AP  ${lat}  ${vert}` : 'AP  ---', 34, 350);
      g.fillStyle = '#ffd36b';
      g.font = '30px monospace';
      g.fillText(`HDG ${String(Math.round(ui.hdgBugDeg || 0)).padStart(3, '0')}`, 34, 405);
      g.fillText(`ALT ${Math.round(ui.apAltFt || 0)}`, 220, 405);
      g.fillText(`VS ${Math.round(ui.apVsFpm || 0)}`, 34, 455);
      g.fillStyle = '#9aa';
      g.font = '22px monospace';
      g.fillText('AP  HDG  NAV  ALT  VS  ▲▼', 34, 488);
    } else {
      g.fillStyle = '#333';
      g.font = '28px monospace';
      g.fillText('AVIONICS OFF', 150, 250);
    }
    this.radioTex.needsUpdate = true;
  }

  _drawAnnunciators(o, sw) {
    const g = this.annCanvas.getContext('2d');
    g.fillStyle = '#0b0b0c';
    g.fillRect(0, 0, 512, 48);
    const items = [['LOW VOLTS', o.lowVolts], ['OIL PRESS', o.oilWarn], ['L FUEL', o.lowFuelL], ['R FUEL', o.lowFuelR], ['VAC', sw.battery && o.vacuum < 3.5]];
    g.font = 'bold 18px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    items.forEach(([t, on], i) => {
      const x = 52 + i * 102;
      g.fillStyle = on && sw.battery ? (i === 4 || i === 0 ? '#ff3b30' : '#ffb000') : '#222';
      g.fillText(t, x, 25);
    });
    this.annTex.needsUpdate = true;
  }

  _drawCompass(o) {
    const g = this.compassCanvas.getContext('2d');
    g.fillStyle = '#e8e2d0';
    g.fillRect(0, 0, 256, 64);
    const h = (o.compass || 0) * 180 / Math.PI;
    g.fillStyle = '#111';
    g.font = 'bold 22px Arial';
    g.textAlign = 'center';
    for (let d = -60; d <= 60; d += 5) {
      const v = Math.round(h + d);
      const deg = ((Math.round(v / 5) * 5) % 360 + 360) % 360;
      const x = 128 + (deg - h + 540) % 360 * 0 + (Math.round(v / 5) * 5 - h) * 3.2;
      g.fillRect(x, 4, 2, deg % 30 === 0 ? 16 : 8);
      if (deg % 30 === 0) g.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[deg] || String(deg / 10), x, 44);
    }
    g.fillStyle = '#d00';
    g.fillRect(127, 0, 3, 64);
    this.compassTex.needsUpdate = true;
  }
}
