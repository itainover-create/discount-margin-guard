// Analogue instrument faces drawn on 2D canvases each frame from the core's
// instrument outputs (lags, failures and gyro errors already applied).
const D2R = Math.PI / 180;
const KT = 1 / 0.514444, FT = 1 / 0.3048;

function face(g, s, label) {
  g.save();
  g.clearRect(0, 0, s, s);
  const c = s / 2;
  const grd = g.createRadialGradient(c, c, s * 0.3, c, c, s * 0.5);
  grd.addColorStop(0, '#16181b');
  grd.addColorStop(1, '#050506');
  g.fillStyle = '#2a2c2f';
  g.beginPath(); g.arc(c, c, s * 0.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = grd;
  g.beginPath(); g.arc(c, c, s * 0.46, 0, Math.PI * 2); g.fill();
  g.restore();
  if (label) {
    g.fillStyle = '#d9d9d9';
    g.font = `${s * 0.055}px Arial`;
    g.textAlign = 'center';
    g.fillText(label, c, c + s * 0.2);
  }
}

function ticks(g, s, a0, a1, n, len, w, color = '#eee', every = 1) {
  const c = s / 2;
  g.strokeStyle = color;
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n - 90) * D2R;
    const l = i % every === 0 ? len : len * 0.55;
    g.lineWidth = i % every === 0 ? w : w * 0.6;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * s * 0.44, c + Math.sin(a) * s * 0.44);
    g.lineTo(c + Math.cos(a) * s * (0.44 - l), c + Math.sin(a) * s * (0.44 - l));
    g.stroke();
  }
}

function needle(g, s, angDeg, len = 0.38, w = 0.03, color = '#f2f2f2') {
  const c = s / 2;
  g.save();
  g.translate(c, c);
  g.rotate(angDeg * D2R);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(-s * w * 0.5, s * 0.06);
  g.lineTo(0, -s * len);
  g.lineTo(s * w * 0.5, s * 0.06);
  g.closePath();
  g.fill();
  g.fillStyle = '#333';
  g.beginPath(); g.arc(0, 0, s * 0.04, 0, Math.PI * 2); g.fill();
  g.restore();
}

function arc(g, s, a0, a1, r, w, color) {
  const c = s / 2;
  g.strokeStyle = color;
  g.lineWidth = w;
  g.beginPath();
  g.arc(c, c, s * r, (a0 - 90) * D2R, (a1 - 90) * D2R);
  g.stroke();
}

function nums(g, s, list, r, size) {
  const c = s / 2;
  g.fillStyle = '#eee';
  g.font = `bold ${s * size}px Arial`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [ang, txt] of list) {
    const a = (ang - 90) * D2R;
    g.fillText(txt, c + Math.cos(a) * s * r, c + Math.sin(a) * s * r);
  }
}

// ---------------------------------------------------------------------------
export const Instruments = {
  // Airspeed: 0..200 kt over ~330 deg, arcs per POH-class limits
  asi(g, s, o) {
    face(g, s, 'KNOTS');
    const ang = (kt) => (kt < 40 ? kt * 0.75 : 30 + (kt - 40) * 1.95);
    arc(g, s, ang(40), ang(85), 0.425, s * 0.025, '#f4f4f4');   // flap range
    arc(g, s, ang(48), ang(129), 0.4, s * 0.025, '#2bb34a');    // normal
    arc(g, s, ang(129), ang(163), 0.4, s * 0.025, '#f2c21b');   // caution
    const a = ang(163);
    arc(g, s, a - 0.6, a + 0.6, 0.41, s * 0.05, '#e02424');     // Vne
    const tl = [];
    for (let k = 40; k <= 200; k += 10) tl.push(k);
    for (const k of tl) {
      const t = (ang(k) - 90) * D2R, c = s / 2;
      g.strokeStyle = '#eee';
      g.lineWidth = k % 20 === 0 ? 3 : 1.5;
      g.beginPath();
      g.moveTo(c + Math.cos(t) * s * 0.44, c + Math.sin(t) * s * 0.44);
      g.lineTo(c + Math.cos(t) * s * (k % 20 === 0 ? 0.37 : 0.40), c + Math.sin(t) * s * (k % 20 === 0 ? 0.37 : 0.40));
      g.stroke();
    }
    nums(g, s, [40, 60, 80, 100, 120, 140, 160, 180].map((k) => [ang(k), String(k)]), 0.29, 0.075);
    needle(g, s, ang(Math.max(0, Math.min(200, o.ias * KT))));
  },

  // Attitude indicator: sky/ground with pitch ladder and bank scale
  ai(g, s, o) {
    const c = s / 2;
    g.save();
    g.clearRect(0, 0, s, s);
    g.beginPath(); g.arc(c, c, s * 0.46, 0, Math.PI * 2); g.clip();
    g.translate(c, c);
    g.rotate(-o.aiRoll);
    const ppd = s * 0.012; // pixels per degree
    const off = (o.aiPitch / D2R) * ppd;
    g.fillStyle = '#2f7fd0';
    g.fillRect(-s, -s * 2 + off, s * 2, s * 2);
    g.fillStyle = '#7a4b25';
    g.fillRect(-s, off, s * 2, s * 2);
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(-s, off); g.lineTo(s, off); g.stroke();
    g.fillStyle = '#fff';
    g.font = `${s * 0.045}px Arial`;
    for (let p = -30; p <= 30; p += 5) {
      if (!p) continue;
      const y = off - p * ppd, w = p % 10 === 0 ? s * 0.14 : s * 0.07;
      g.beginPath(); g.moveTo(-w / 2, y); g.lineTo(w / 2, y); g.stroke();
      if (p % 10 === 0) g.fillText(String(Math.abs(p)), w / 2 + 4, y + 4);
    }
    // bank scale (moves with roll)
    for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const a = (b - 90) * D2R;
      g.lineWidth = Math.abs(b) % 30 === 0 ? 3 : 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * s * 0.44, Math.sin(a) * s * 0.44);
      g.lineTo(Math.cos(a) * s * (b === 0 ? 0.36 : 0.39), Math.sin(a) * s * (b === 0 ? 0.36 : 0.39));
      g.stroke();
    }
    g.restore();
    // fixed aircraft symbol & bank pointer
    g.strokeStyle = '#ffb000';
    g.lineWidth = s * 0.018;
    g.beginPath(); g.moveTo(c - s * 0.2, c); g.lineTo(c - s * 0.07, c); g.lineTo(c, c + s * 0.04); g.lineTo(c + s * 0.07, c); g.lineTo(c + s * 0.2, c); g.stroke();
    g.fillStyle = '#ffb000';
    g.beginPath(); g.moveTo(c, c - s * 0.36); g.lineTo(c - s * 0.025, c - s * 0.32); g.lineTo(c + s * 0.025, c - s * 0.32); g.fill();
    g.strokeStyle = '#2a2c2f';
    g.lineWidth = s * 0.06;
    g.beginPath(); g.arc(c, c, s * 0.48, 0, Math.PI * 2); g.stroke();
    if (o.gyroSpin < 0.6) { g.fillStyle = 'rgba(230,40,40,0.9)'; g.fillRect(c + s * 0.18, c + s * 0.3, s * 0.12, s * 0.06); }
  },

  // Altimeter: 100 ft needle, 1000 ft needle, 10000 ft pointer, Kollsman window
  alt(g, s, o) {
    face(g, s, '');
    ticks(g, s, 0, 360, 50, 0.05, 2, '#eee', 5);
    nums(g, s, [...Array(10).keys()].map((k) => [k * 36, String(k)]), 0.33, 0.09);
    const ft = o.indAlt * FT;
    g.fillStyle = '#111';
    g.fillRect(s * 0.62, s * 0.45, s * 0.2, s * 0.1);
    g.fillStyle = '#eee';
    g.font = `${s * 0.055}px Arial`;
    g.textAlign = 'center';
    g.fillText((o.baroHpa || 1013).toFixed(0), s * 0.72, s * 0.515);
    g.fillText('ALT', s * 0.5, s * 0.7);
    needle(g, s, ((ft / 10000) % 10) * 36, 0.42, 0.012, '#ddd');
    needle(g, s, ((ft / 1000) % 10) * 36, 0.24, 0.05);
    needle(g, s, ((ft / 100) % 10) * 36, 0.38, 0.028);
  },

  // Turn coordinator with standard-rate marks and inclinometer ball
  tc(g, s, o) {
    face(g, s, 'D.C. ELEC');
    const c = s / 2;
    g.fillStyle = '#eee';
    g.font = `bold ${s * 0.07}px Arial`;
    g.textAlign = 'center';
    g.fillText('L', c - s * 0.32, c + s * 0.13);
    g.fillText('R', c + s * 0.32, c + s * 0.13);
    g.fillText('2 MIN', c, c + s * 0.3);
    for (const a of [-20, 20]) {
      const t = (a + 90) * D2R;
      g.strokeStyle = '#eee'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(c - Math.cos(t) * s * 0.42, c + Math.sin(t) * s * 0.42 - s * 0.06); g.lineTo(c - Math.cos(t) * s * 0.34, c + Math.sin(t) * s * 0.34 - s * 0.06); g.stroke();
    }
    // aircraft symbol rolls with rate of turn (std rate 3 deg/s -> 20 deg)
    const rate = (o.turnRate / D2R) / 3;
    g.save();
    g.translate(c, c);
    g.rotate(Math.max(-1.6, Math.min(1.6, rate)) * 20 * D2R);
    g.strokeStyle = '#f0f0f0';
    g.lineWidth = s * 0.025;
    g.beginPath(); g.moveTo(-s * 0.3, 0); g.lineTo(s * 0.3, 0); g.stroke();
    g.beginPath(); g.arc(0, 0, s * 0.05, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(0, -s * 0.05); g.lineTo(0, -s * 0.12); g.stroke();
    g.restore();
    // inclinometer
    g.fillStyle = '#111';
    g.beginPath(); g.ellipse(c, c + s * 0.2, s * 0.2, s * 0.045, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ddd'; g.lineWidth = 1.5;
    for (const dx of [-0.05, 0.05]) { g.beginPath(); g.moveTo(c + dx * s, c + s * 0.155); g.lineTo(c + dx * s, c + s * 0.245); g.stroke(); }
    g.fillStyle = '#e8e8e8';
    g.beginPath(); g.arc(c + o.ball * s * 0.17, c + s * 0.2, s * 0.038, 0, Math.PI * 2); g.fill();
  },

  // Heading indicator (rotating card) with heading bug
  hi(g, s, o) {
    face(g, s, '');
    const c = s / 2;
    g.save();
    g.translate(c, c);
    g.rotate(-o.hi);
    g.strokeStyle = '#eee';
    g.fillStyle = '#eee';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 5) {
      const a = d * D2R;
      g.lineWidth = d % 10 === 0 ? 2 : 1;
      const r1 = s * 0.43, r2 = s * (d % 10 === 0 ? 0.37 : 0.4);
      g.beginPath(); g.moveTo(Math.sin(a) * r1, -Math.cos(a) * r1); g.lineTo(Math.sin(a) * r2, -Math.cos(a) * r2); g.stroke();
      if (d % 30 === 0) {
        g.save();
        g.rotate(a);
        g.font = `bold ${s * 0.08}px Arial`;
        const lbl = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] || String(d / 10);
        g.fillText(lbl, 0, -s * 0.3);
        g.restore();
      }
    }
    // heading bug
    g.save();
    g.rotate(o.hdgBug);
    g.fillStyle = '#ff8c00';
    g.fillRect(-s * 0.035, -s * 0.46, s * 0.07, s * 0.04);
    g.restore();
    g.restore();
    // lubber line & aircraft
    g.fillStyle = '#ffb000';
    g.beginPath(); g.moveTo(c, c - s * 0.44); g.lineTo(c - s * 0.025, c - s * 0.4); g.lineTo(c + s * 0.025, c - s * 0.4); g.fill();
    g.strokeStyle = '#ffb000'; g.lineWidth = s * 0.02;
    g.beginPath(); g.moveTo(c, c - s * 0.16); g.lineTo(c, c + s * 0.14); g.moveTo(c - s * 0.13, c - s * 0.02); g.lineTo(c + s * 0.13, c - s * 0.02); g.moveTo(c - s * 0.06, c + s * 0.12); g.lineTo(c + s * 0.06, c + s * 0.12); g.stroke();
  },

  // Vertical speed: +-2000 fpm
  vsi(g, s, o) {
    face(g, s, '');
    const fpm = Math.max(-2000, Math.min(2000, o.indVs * FT * 60));
    const ang = (v) => 270 + (v / 2000) * 170;
    const c = s / 2;
    for (let v = -2000; v <= 2000; v += 100) {
      const a = (ang(v) - 90) * D2R;
      g.strokeStyle = '#eee';
      g.lineWidth = v % 500 === 0 ? 3 : 1.2;
      g.beginPath(); g.moveTo(c + Math.cos(a) * s * 0.44, c + Math.sin(a) * s * 0.44);
      g.lineTo(c + Math.cos(a) * s * (v % 500 === 0 ? 0.37 : 0.41), c + Math.sin(a) * s * (v % 500 === 0 ? 0.37 : 0.41)); g.stroke();
    }
    nums(g, s, [[ang(0), '0'], [ang(500), '5'], [ang(1000), '10'], [ang(1500), '15'], [ang(2000), '20'], [ang(-500), '5'], [ang(-1000), '10'], [ang(-1500), '15']], 0.3, 0.075);
    g.fillStyle = '#ccc';
    g.font = `${s * 0.05}px Arial`;
    g.textAlign = 'center';
    g.fillText('UP', c - s * 0.12, c - s * 0.1);
    g.fillText('DOWN', c - s * 0.12, c + s * 0.12);
    g.fillText('100 FT/MIN', c + s * 0.06, c + s * 0.22);
    needle(g, s, ang(fpm));
  },

  // Tachometer 0..3500 rpm
  tach(g, s, o) {
    face(g, s, 'RPM x100');
    const ang = (r) => -135 + (r / 3500) * 270;
    arc(g, s, ang(2100), ang(2700), 0.41, s * 0.03, '#2bb34a');
    arc(g, s, ang(2700) - 0.8, ang(2700) + 0.8, 0.41, s * 0.06, '#e02424');
    ticks(g, s, -135, 135, 35, 0.05, 2, '#eee', 5);
    nums(g, s, [0, 5, 10, 15, 20, 25, 30, 35].map((k) => [ang(k * 100), String(k)]), 0.3, 0.08);
    g.fillStyle = '#bbb';
    g.font = `${s * 0.05}px Arial`;
    g.textAlign = 'center';
    g.fillText(String(Math.round(o.hobbs || 0)).padStart(5, '0'), s / 2, s * 0.62);
    needle(g, s, ang(Math.max(0, Math.min(3500, o.rpm))));
  },

  // Dual small gauge (two needles left/right halves)
  dual(g, s, left, right) {
    face(g, s, '');
    const c = s / 2;
    const half = (spec, side) => {
      const a0 = side < 0 ? 210 : 30, a1 = side < 0 ? 330 : 150;
      const t = Math.max(0, Math.min(1, (spec.v - spec.min) / (spec.max - spec.min)));
      for (const [f0, f1, col] of spec.arcs || []) {
        const p0 = side < 0 ? a1 - f1 * 120 : a0 + f0 * 120, p1 = side < 0 ? a1 - f0 * 120 : a0 + f1 * 120;
        arc(g, s, p0, p1, 0.40, s * 0.035, col);
      }
      g.fillStyle = '#ddd';
      g.font = `bold ${s * 0.065}px Arial`;
      g.textAlign = 'center';
      g.fillText(spec.label, c + side * s * 0.2, c + s * 0.03);
      g.font = `${s * 0.055}px Arial`;
      g.fillText(spec.text || '', c + side * s * 0.2, c + s * 0.12);
      const ang = side < 0 ? a1 - t * 120 : a0 + t * 120;
      needle(g, s, ang, 0.36, 0.035);
    };
    half(left, -1);
    half(right, 1);
  },
};

// Layout of the instrument atlas (one canvas texture; uv rects per gauge).
export const ATLAS = { size: 2048, cell: 512 };
export const GAUGES = [
  // name, atlas col,row
  ['asi', 0, 0], ['ai', 1, 0], ['alt', 2, 0], ['tc', 0, 1], ['hi', 1, 1], ['vsi', 2, 1],
  ['tach', 3, 0], ['fuel', 3, 1], ['oil', 0, 2], ['egt', 1, 2], ['vac', 2, 2], ['amp', 3, 2],
];

export class InstrumentAtlas {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = ATLAS.size;
    this.g = this.canvas.getContext('2d');
    this.cells = {};
    for (const [n, cx, cy] of GAUGES) this.cells[n] = { x: cx * ATLAS.cell, y: cy * ATLAS.cell };
  }
  uv(name) {
    const c = this.cells[name], S = ATLAS.size;
    return { u0: c.x / S, v0: 1 - (c.y + ATLAS.cell) / S, u1: (c.x + ATLAS.cell) / S, v1: 1 - c.y / S };
  }
  draw(o) {
    const g = this.g, s = ATLAS.cell;
    const at = (n, fn) => { g.save(); g.translate(this.cells[n].x, this.cells[n].y); fn(g, s); g.restore(); };
    at('asi', (gg) => Instruments.asi(gg, s, o));
    at('ai', (gg) => Instruments.ai(gg, s, o));
    at('alt', (gg) => Instruments.alt(gg, s, o));
    at('tc', (gg) => Instruments.tc(gg, s, o));
    at('hi', (gg) => Instruments.hi(gg, s, o));
    at('vsi', (gg) => Instruments.vsi(gg, s, o));
    at('tach', (gg) => Instruments.tach(gg, s, o));
    const gal = (kg) => kg / 0.72 / 3.785;
    at('fuel', (gg) => Instruments.dual(gg, s,
      { label: 'L', v: gal(o.fuelL), min: 0, max: 26.5, text: 'FUEL', arcs: [[0, 0.06, '#e02424']] },
      { label: 'R', v: gal(o.fuelR), min: 0, max: 26.5, text: 'GAL', arcs: [[0, 0.06, '#e02424']] }));
    const oilF = (o.oilT - 273.15) * 9 / 5 + 32;
    at('oil', (gg) => Instruments.dual(gg, s,
      { label: 'OIL', v: oilF, min: 75, max: 250, text: '°F', arcs: [[0.06, 0.94, '#2bb34a']] },
      { label: 'PSI', v: o.oilP, min: 0, max: 115, text: 'OIL', arcs: [[0.43, 0.78, '#2bb34a']] }));
    at('egt', (gg) => Instruments.dual(gg, s,
      { label: 'EGT', v: o.egt, min: 450, max: 1200, text: '' },
      { label: 'GPH', v: o.fuelFlow / 0.72 * 3600 / 3.785, min: 0, max: 19, text: 'FLOW' }));
    at('vac', (gg) => Instruments.dual(gg, s,
      { label: 'SUCT', v: o.vacuum, min: 3, max: 7, text: 'in Hg', arcs: [[0.38, 0.75, '#2bb34a']] },
      { label: 'VOLT', v: o.busV, min: 16, max: 32, text: 'BUS', arcs: [[0.6, 0.85, '#2bb34a']] }));
    at('amp', (gg) => Instruments.dual(gg, s,
      { label: 'AMP', v: o.battA, min: -60, max: 60, text: 'BATT' },
      { label: 'TRIM', v: o.trim, min: -1, max: 1, text: o.trim > 0.05 ? 'NOSE UP' : o.trim < -0.05 ? 'NOSE DN' : 'TO' }));
  }
}
