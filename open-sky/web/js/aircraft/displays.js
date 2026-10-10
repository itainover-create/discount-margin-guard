// Glass cockpit displays drawn on canvases (PFD, ND, EICAS, systems/damage
// page, fighter HUD and MFDs). All values come from the C++ core outputs;
// a display without power is black (electrical failure / impact damage).
const D2R = Math.PI / 180;
const KT = 0.514444, FT = 0.3048, FPM = 0.00508;
const C = { sky: '#2a6fc9', gnd: '#7a4f2a', white: '#f2f4f6', green: '#38e86a', magenta: '#ff4fd8', cyan: '#4fd8ff', amber: '#ffb000', red: '#ff3b30', grey: '#8a939c', bg: '#05080c' };

function fmt(n, w = 3) { return String(Math.round(n)).padStart(w, '0'); }
function txt(g, s, x, y, color = C.white, size = 22, align = 'center', weight = 'bold') {
  g.fillStyle = color; g.font = `${weight} ${size}px "Exo 2", Arial, sans-serif`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
}
function box(g, x, y, w, h, color = C.white, lw = 2) { g.strokeStyle = color; g.lineWidth = lw; g.strokeRect(x, y, w, h); }

// ---------------------------------------------------------------------------
export function drawPFD(g, S, o, ui, f) {
  g.fillStyle = C.bg; g.fillRect(0, 0, S, S);
  if (!o.avionicsPowered || o.elecFail) return;
  const cx = S * 0.5, cy = S * 0.47, R = S * 0.3;
  const pitch = o.theta / D2R, roll = o.phi / D2R;
  const ppd = S / 90;  // pixels per degree
  // attitude sphere (clipped)
  g.save();
  g.beginPath(); g.rect(cx - R, cy - R, R * 2, R * 2); g.clip();
  g.translate(cx, cy);
  g.rotate(-roll * D2R);
  g.fillStyle = C.sky; g.fillRect(-S, -S * 2 + pitch * ppd, S * 2, S * 2);
  g.fillStyle = C.gnd; g.fillRect(-S, pitch * ppd, S * 2, S * 2);
  g.strokeStyle = C.white; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-S, pitch * ppd); g.lineTo(S, pitch * ppd); g.stroke();
  for (let d = -40; d <= 40; d += 2.5) {
    if (d === 0) continue;
    const y = (pitch - d) * ppd;
    if (Math.abs(y) > R * 1.1) continue;
    const w = d % 10 === 0 ? R * 0.42 : d % 5 === 0 ? R * 0.22 : R * 0.1;
    g.beginPath(); g.moveTo(-w / 2, y); g.lineTo(w / 2, y); g.stroke();
    if (d % 10 === 0) { txt(g, String(Math.abs(d)), -w / 2 - 16, y, C.white, 15); txt(g, String(Math.abs(d)), w / 2 + 16, y, C.white, 15); }
  }
  g.restore();
  // bank scale
  g.save(); g.translate(cx, cy);
  g.strokeStyle = C.white; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, R * 0.95, -Math.PI / 2 - 60 * D2R, -Math.PI / 2 + 60 * D2R); g.stroke();
  for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const r0 = R * 0.95, r1 = r0 + (Math.abs(a) % 30 === 0 ? 14 : 8);
    const t = (-90 + a) * D2R;
    g.beginPath(); g.moveTo(Math.cos(t) * r0, Math.sin(t) * r0); g.lineTo(Math.cos(t) * r1, Math.sin(t) * r1); g.stroke();
  }
  g.rotate(-roll * D2R);
  g.fillStyle = Math.abs(roll) > 35 ? C.amber : C.white;
  g.beginPath(); g.moveTo(0, -R * 0.93); g.lineTo(-9, -R * 0.93 + 14); g.lineTo(9, -R * 0.93 + 14); g.closePath(); g.fill();
  // slip indicator
  g.fillRect(-9 + (o.ball || 0) * 14, -R * 0.93 + 17, 18, 5);
  g.restore();
  // aircraft symbol
  g.fillStyle = '#111'; g.strokeStyle = C.amber; g.lineWidth = 3;
  for (const s of [-1, 1]) { g.fillRect(cx + s * R * 0.32 - (s < 0 ? R * 0.28 : 0), cy - 4, R * 0.28, 8); g.strokeRect(cx + s * R * 0.32 - (s < 0 ? R * 0.28 : 0), cy - 4, R * 0.28, 8); }
  g.fillRect(cx - 5, cy - 5, 10, 10); g.strokeRect(cx - 5, cy - 5, 10, 10);
  // flight path vector
  const gam = Math.atan2(o.vs, Math.max(o.gs, 1)) / D2R;
  const drift = Math.atan2(o.ve, o.vn) / D2R - o.psi / D2R;
  const fx = cx + ((drift + 540) % 360 - 180) * ppd, fy = cy + (pitch - gam) * ppd;
  if (Math.abs(fx - cx) < R && Math.abs(fy - cy) < R) {
    g.strokeStyle = C.green; g.lineWidth = 2;
    g.beginPath(); g.arc(fx, fy, 8, 0, Math.PI * 2); g.moveTo(fx - 20, fy); g.lineTo(fx - 8, fy); g.moveTo(fx + 8, fy); g.lineTo(fx + 20, fy); g.moveTo(fx, fy - 8); g.lineTo(fx, fy - 16); g.stroke();
  }
  // speed tape
  const tx = cx - R - S * 0.17, tw = S * 0.13, ias = o.indIas / KT;
  g.fillStyle = 'rgba(40,46,54,0.92)'; g.fillRect(tx, cy - R, tw, R * 2);
  g.save(); g.beginPath(); g.rect(tx, cy - R, tw, R * 2); g.clip();
  const spx = 3.2;
  for (let v = Math.floor((ias - 60) / 10) * 10; v < ias + 60; v += 10) {
    if (v < 30) continue;
    const y = cy - (v - ias) * spx;
    g.strokeStyle = C.white; g.lineWidth = 2; g.beginPath(); g.moveTo(tx + tw - 14, y); g.lineTo(tx + tw, y); g.stroke();
    if (v % 20 === 0) txt(g, String(v), tx + tw - 22, y, C.white, 18, 'right');
  }
  // overspeed barber pole and stall band
  const vmo = (f && f.vmo) || 340;
  for (let v = vmo; v < ias + 80; v += 4) { const y = cy - (v - ias) * spx; g.fillStyle = (Math.floor(v / 4) % 2) ? C.red : '#111'; g.fillRect(tx + tw - 8, y - 6, 8, 6); }
  const vs1 = (f ? f.vref / 1.3 : 50) * (o.flapsDeg > 5 ? 1 : 1.25);
  for (let v = vs1; v > ias - 80; v -= 4) { const y = cy - (v - ias) * spx; g.fillStyle = (Math.floor(v / 4) % 2) ? C.red : '#111'; g.fillRect(tx + tw - 8, y, 8, 6); }
  // bugs: AT target (magenta), Vref (green)
  if (ui.atSpdKt) { const y = cy - (ui.atSpdKt - ias) * spx; g.fillStyle = C.magenta; g.beginPath(); g.moveTo(tx + tw, y); g.lineTo(tx + tw + 10, y - 8); g.lineTo(tx + tw + 10, y + 8); g.fill(); }
  if (f) { const y = cy - (f.vref - ias) * spx; txt(g, 'REF', tx + tw + 4, y, C.green, 13, 'left'); }
  g.restore();
  // speed trend
  const trend = (o.nx || 0) * 9.81 * 10 / KT;
  g.strokeStyle = C.green; g.lineWidth = 3; g.beginPath(); g.moveTo(tx + tw + 2, cy); g.lineTo(tx + tw + 2, cy - trend * spx); g.stroke();
  g.fillStyle = '#000'; g.fillRect(tx - 2, cy - 20, tw + 4, 40); box(g, tx - 2, cy - 20, tw + 4, 40, C.white);
  txt(g, String(Math.round(ias)), tx + tw / 2, cy, o.overspeed ? C.red : C.white, 26);
  if (o.mach > 0.4) txt(g, '.' + String(Math.round(o.mach * 1000)).padStart(3, '0').slice(0, 3), tx + tw / 2, cy + R + 22, C.green, 20);
  if (ui.atSpdKt) txt(g, String(Math.round(ui.atSpdKt)), tx + tw / 2, cy - R - 16, C.magenta, 20);
  // altitude tape
  const ax = cx + R + S * 0.04, aw = S * 0.15, alt = o.indAlt / FT;
  g.fillStyle = 'rgba(40,46,54,0.92)'; g.fillRect(ax, cy - R, aw, R * 2);
  g.save(); g.beginPath(); g.rect(ax, cy - R, aw, R * 2); g.clip();
  const apx = 0.32;
  for (let v = Math.floor((alt - 600) / 100) * 100; v < alt + 600; v += 100) {
    const y = cy - (v - alt) * apx;
    g.strokeStyle = C.white; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, y); g.lineTo(ax + 12, y); g.stroke();
    if (v % 200 === 0) txt(g, String(v), ax + 16, y, C.white, 16, 'left');
  }
  if (ui.apAltFt !== undefined) { const y = cy - (ui.apAltFt - alt) * apx; g.fillStyle = C.magenta; g.fillRect(ax, y - 3, 14, 6); }
  // ground (radio altitude) band
  const raY = cy + o.agl / FT * apx;
  if (raY < cy + R) { g.fillStyle = 'rgba(160,90,20,0.65)'; g.fillRect(ax, raY, aw, cy + R - raY); }
  g.restore();
  g.fillStyle = '#000'; g.fillRect(ax - 2, cy - 20, aw + 4, 40); box(g, ax - 2, cy - 20, aw + 4, 40, C.white);
  txt(g, String(Math.round(alt / 10) * 10), ax + aw / 2, cy, C.white, 24);
  if (ui.apAltFt !== undefined) txt(g, String(Math.round(ui.apAltFt)), ax + aw / 2, cy - R - 16, C.magenta, 20);
  txt(g, `${Math.round(ui.baroHpa || 1013)} hPa`, ax + aw / 2, cy + R + 22, C.cyan, 17);
  // vertical speed
  const vx = ax + aw + 12, vs = o.indVs / FPM;
  g.fillStyle = 'rgba(40,46,54,0.92)'; g.fillRect(vx, cy - R * 0.8, 34, R * 1.6);
  const vsY = (v) => cy - Math.sign(v) * Math.min(1, Math.sqrt(Math.abs(v) / 6000)) * R * 0.78;
  g.strokeStyle = C.white; g.lineWidth = 3; g.beginPath(); g.moveTo(vx + 34, cy); g.lineTo(vx + 6, vsY(vs)); g.stroke();
  if (Math.abs(vs) > 400) txt(g, String(Math.round(vs / 100) * 100), vx + 17, vs > 0 ? cy - R * 0.9 : cy + R * 0.9, C.white, 14);
  // heading
  const hy = cy + R + 58, hdg = o.hdgMag;
  g.save(); g.beginPath(); g.rect(cx - R, hy - 22, R * 2, 44); g.clip();
  g.fillStyle = 'rgba(40,46,54,0.92)'; g.fillRect(cx - R, hy - 22, R * 2, 44);
  for (let d = Math.floor(hdg / 5) * 5 - 40; d <= hdg + 40; d += 5) {
    const x = cx + (d - hdg) * 4.4;
    g.strokeStyle = C.white; g.lineWidth = 2; g.beginPath(); g.moveTo(x, hy - 22); g.lineTo(x, hy - (d % 10 === 0 ? 10 : 15)); g.stroke();
    if (d % 10 === 0) txt(g, String(((d % 360) + 360) % 360 / 10 | 0), x, hy + 8, C.white, 16);
  }
  const bug = ui.hdgBugDeg || 0;
  const bx = cx + ((bug - hdg + 540) % 360 - 180) * 4.4;
  g.fillStyle = C.magenta; g.fillRect(bx - 6, hy - 22, 12, 6);
  g.restore();
  txt(g, fmt(hdg), cx, hy - 34, C.white, 20);
  // FMA (flight mode annunciator)
  g.fillStyle = '#000'; g.fillRect(0, 0, S, 46);
  const at = ui.atOn ? (o.reverser ? 'REV' : o.throttleCmd < 0.05 ? 'IDLE' : 'SPEED') : '';
  const lat = o.apEngaged ? ['ROLL', 'HDG SEL', 'LNAV'][o.apLat | 0] : '';
  const ver = o.apEngaged ? ['V/S', 'ALT HOLD'][o.apVert | 0] : '';
  txt(g, at, S * 0.17, 23, C.green, 22); txt(g, lat, S * 0.5, 23, C.green, 22); txt(g, ver, S * 0.83, 23, C.green, 22);
  for (const x of [S / 3, S * 2 / 3]) { g.strokeStyle = C.grey; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 4); g.lineTo(x, 42); g.stroke(); }
  txt(g, o.apEngaged ? 'CMD' : (o.fbw === 2 ? 'DIRECT LAW' : ''), cx, cy - R - 16, o.fbw === 2 ? C.amber : C.green, 20);
  // radio altitude / minimums
  if (o.agl < 2500 * FT) txt(g, String(Math.round(o.agl / FT)), cx, cy + R - 30, o.agl < 200 * FT ? C.amber : C.white, 26);
  if (o.stallWarn) txt(g, 'STALL', cx, cy + R * 0.55, C.red, 32);
  if (ui.gpws) txt(g, ui.gpws, cx, cy + R * 0.32, C.red, 28);
}

// ---------------------------------------------------------------------------
export function drawND(g, S, o, ui) {
  g.fillStyle = C.bg; g.fillRect(0, 0, S, S);
  if (!o.avionicsPowered || o.elecFail) return;
  const cx = S / 2, cy = S * 0.78, R = S * 0.66, hdg = o.hdgMag;
  const range = ui.ndRange || 20;  // nm
  const trk = ((Math.atan2(o.ve, o.vn) / D2R - (ui.magVar || 0)) + 360) % 360;
  g.save(); g.beginPath(); g.rect(0, 50, S, S - 50); g.clip();
  g.strokeStyle = C.white; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, R, Math.PI, 2 * Math.PI); g.stroke();
  g.setLineDash([6, 8]); g.beginPath(); g.arc(cx, cy, R / 2, Math.PI, 2 * Math.PI); g.stroke(); g.setLineDash([]);
  for (let d = 0; d < 360; d += 5) {
    const a = (d - hdg - 90) * D2R;
    const r1 = R - (d % 10 === 0 ? 14 : 7);
    g.beginPath(); g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    if (d % 30 === 0) txt(g, String(d / 10), cx + Math.cos(a) * (R - 30), cy + Math.sin(a) * (R - 30), C.white, 18);
  }
  // heading bug
  const ba = ((ui.hdgBugDeg || 0) - hdg - 90) * D2R;
  g.fillStyle = C.magenta; g.save(); g.translate(cx + Math.cos(ba) * R, cy + Math.sin(ba) * R); g.rotate(ba + Math.PI / 2); g.fillRect(-8, -4, 16, 8); g.restore();
  // track line
  const ta = (trk - hdg - 90) * D2R;
  g.strokeStyle = C.green; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ta) * R, cy + Math.sin(ta) * R); g.stroke();
  // route / destination
  if (ui.nav) {
    const a = (ui.nav.brgMag - hdg - 90) * D2R;
    const r = Math.min(R, (ui.nav.distNm / range) * R);
    g.strokeStyle = C.magenta; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke();
    g.fillStyle = C.magenta; g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 7, 0, Math.PI * 2); g.fill();
    txt(g, `${ui.nav.name || ''}`.slice(0, 12), S - 12, 70, C.magenta, 18, 'right');
    txt(g, `${ui.nav.distNm.toFixed(1)} NM`, S - 12, 94, C.white, 18, 'right');
  }
  // traffic (TCAS)
  for (const t of ui.traffic || []) {
    const a = (t.brg - hdg - 90) * D2R;
    const r = (t.distNm / range) * R;
    if (r > R) continue;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    const close = t.distNm < 3 && Math.abs(t.dAltFt) < 900;
    g.fillStyle = close ? C.amber : C.cyan;
    g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 7, y); g.lineTo(x, y + 7); g.lineTo(x - 7, y); g.closePath(); g.fill();
    txt(g, `${t.dAltFt >= 0 ? '+' : '-'}${fmt(Math.abs(t.dAltFt) / 100, 2)}`, x, y + (t.dAltFt >= 0 ? -14 : 16), g.fillStyle, 13);
  }
  g.restore();
  // own ship
  g.strokeStyle = C.white; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx, cy - 18); g.lineTo(cx, cy + 14); g.moveTo(cx - 14, cy - 4); g.lineTo(cx + 14, cy - 4); g.moveTo(cx - 6, cy + 12); g.lineTo(cx + 6, cy + 12); g.stroke();
  // header: GS TAS wind
  g.fillStyle = '#000'; g.fillRect(0, 0, S, 50);
  txt(g, `GS ${Math.round(o.gs / KT)}  TAS ${Math.round(o.tas / KT)}`, 10, 18, C.white, 18, 'left');
  const wsp = Math.hypot(o.windE, o.windN) / KT, wdir = ((Math.atan2(-o.windE, -o.windN) / D2R - (ui.magVar || 0)) + 360) % 360;
  txt(g, `${fmt(wdir)}°/${Math.round(wsp)}`, 10, 40, C.white, 16, 'left');
  if (wsp > 1) {
    const wa = (wdir - hdg + 180) * D2R;
    g.save(); g.translate(120, 40); g.rotate(wa); g.strokeStyle = C.white; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -10); g.lineTo(0, 10); g.lineTo(-4, 4); g.moveTo(0, 10); g.lineTo(4, 4); g.stroke(); g.restore();
  }
  txt(g, `HDG ${fmt(hdg)}  MAG`, S / 2, 18, C.green, 20);
  txt(g, `${range}`, cx + R / 2 + 12, cy - 12, C.cyan, 15);
}

// ---------------------------------------------------------------------------
// EICAS / E/WD: engine dials, fuel, configuration and alerts
function dial(g, x, y, r, v, vmax, label, value, red = 0.97, color = C.white) {
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.0;
  g.strokeStyle = C.grey; g.lineWidth = 3;
  g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke();
  g.strokeStyle = C.red; g.beginPath(); g.arc(x, y, r, a0 + (a1 - a0) * red, a1); g.stroke();
  const f = Math.max(0, Math.min(1.02, v / vmax));
  g.fillStyle = 'rgba(160,170,180,0.25)';
  g.beginPath(); g.moveTo(x, y); g.arc(x, y, r - 3, a0, a0 + (a1 - a0) * f); g.closePath(); g.fill();
  g.strokeStyle = color; g.lineWidth = 3;
  const a = a0 + (a1 - a0) * f;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
  g.fillStyle = '#000'; g.fillRect(x - 2, y - 30, r + 6, 26); box(g, x - 2, y - 30, r + 6, 26, C.white, 1.5);
  txt(g, value, x + r / 2 + 2, y - 17, color, 19);
  if (label) txt(g, label, x, y + r * 0.62, C.cyan, 15);
}

export function alertsFor(o, sw, f) {
  const A = [];
  const n = f.engines;
  for (let i = 0; i < n; i++) if ((o.fireMask >> i) & 1) A.push(['red', `ENG ${i + 1} FIRE`]);
  if (o.partsLost & 3) A.push(['red', `${o.partsLost & 1 ? 'L' : 'R'} WING STRUCTURE`]);
  if (o.partsLost & 4) A.push(['red', 'STABILIZER STRUCTURE']);
  if (o.stallWarn) A.push(['red', 'STALL']);
  if (o.overspeed) A.push(['red', 'OVERSPEED']);
  if (o.gearWarn) A.push(['red', 'CONFIG GEAR']);
  if (o.hyd < 0.3) A.push(['amber', 'HYD PRESS (ALL)']);
  else if (o.hyd < 0.75) A.push(['amber', 'HYD PRESS LOW']);
  if (o.fuelLeak > 0.05) A.push(['amber', 'FUEL LEAK']);
  if (o.fbw === 2) A.push(['amber', 'F/CTL DIRECT LAW']);
  for (let i = 0; i < n; i++) if (!((o.engMask >> i) & 1) && o.simTime > 2 && !o.onGround) A.push(['amber', `ENG ${i + 1} FAIL`]);
  if (o.partsLost & 56) A.push(['amber', 'GEAR DISAGREE']);
  if (o.lowFuelL || o.lowFuelR) A.push(['amber', 'FUEL LOW']);
  if (o.lowVolts) A.push(['amber', 'ELEC BUS LOW']);
  if (sw.parkBrake && (sw.throttle || 0) > 0.5) A.push(['amber', 'CONFIG PARKING BRAKE']);
  if (o.dmgFus > 0.2) A.push(['amber', 'FUSELAGE DAMAGE']);
  if (sw.spoilerArm) A.push(['cyan', 'SPOILERS ARMED']);
  if (sw.parkBrake) A.push(['cyan', 'PARK BRK']);
  if (o.speedbrake > 0.05 && !o.onGround) A.push(['cyan', 'SPEEDBRAKE EXTENDED']);
  if (o.afterburner) A.push(['green', 'AFTERBURNER']);
  return A;
}

export function drawEICAS(g, S, o, sw, ui, f) {
  g.fillStyle = C.bg; g.fillRect(0, 0, S, S);
  if (!o.avionicsPowered || o.elecFail) return;
  const n = f.engines;
  const n1 = [o.n1_0, o.n1_1, o.n1_2, o.n1_3];
  const cols = n === 4 ? 4 : n === 2 ? 2 : 1;
  const w = S / Math.max(cols, 2);
  for (let i = 0; i < n; i++) {
    const x = (cols === 1 ? S / 2 : w * (i + 0.5)) - 10, r = Math.min(56, w * 0.36);
    const fire = (o.fireMask >> i) & 1;
    dial(g, x, 80, r, n1[i] || 0, 110, i === 0 ? 'N1' : '', (n1[i] || 0).toFixed(1), 0.95, fire ? C.red : C.white);
    const egt = o.engEgt ? o.engEgt[i] : o.egt;
    dial(g, x, 200, r * 0.8, egt - 273, 1100, i === 0 ? 'EGT' : '', String(Math.round(egt - 273)), 0.9, fire ? C.red : C.white);
  }
  txt(g, `N2 ${o.n2Avg.toFixed(1)}%`, S * 0.25, 272, C.white, 17);
  txt(g, `FF ${(o.fuelFlow * 3600 / n).toFixed(0)} kg/h/eng`, S * 0.68, 272, C.white, 17);
  // fuel, gear, flaps, speedbrake
  const y0 = 300;
  txt(g, `FUEL ${((o.fuelL + o.fuelR) / 1000).toFixed(1)} t`, 12, y0, (o.lowFuelL || o.lowFuelR) ? C.amber : C.white, 20, 'left');
  txt(g, `L ${(o.fuelL / 1000).toFixed(1)}  R ${(o.fuelR / 1000).toFixed(1)}`, 12, y0 + 24, C.white, 16, 'left');
  // gear
  const gp = o.gearPos;
  const gtxt = gp > 0.99 ? 'DN' : gp < 0.01 ? 'UP' : 'TRANSIT';
  const gc = gp > 0.99 ? C.green : gp < 0.01 ? C.white : C.amber;
  const lost = o.partsLost >> 3;
  ['N', 'L', 'R'].forEach((k, i) => {
    const x = S * 0.58 + i * 46, gone = (lost >> i) & 1;
    g.fillStyle = gone ? C.red : (gp > 0.99 ? C.green : gp < 0.01 ? '#222' : C.amber);
    g.fillRect(x, y0 - 14, 38, 26);
    txt(g, gone ? 'X' : k, x + 19, y0 - 1, gone || gp > 0.99 || (gp > 0.01 && gp < 0.99) ? '#000' : C.grey, 16);
  });
  txt(g, `GEAR ${gtxt}`, S * 0.58, y0 + 26, gc, 16, 'left');
  const fl = f.flaps[sw.flaps] || '';
  txt(g, `FLAPS ${fl}  ${Math.round(o.flapsDeg)}°`, 12, y0 + 56, C.white, 18, 'left');
  if (o.speedbrake > 0.02 || sw.spoilerArm) txt(g, o.speedbrake > 0.02 ? `SPD BRK ${Math.round(o.speedbrake * 100)}%` : 'SPD BRK ARMED', S * 0.58, y0 + 56, o.speedbrake > 0.02 ? C.amber : C.green, 16, 'left');
  if (ui.atOn) txt(g, `A/T ${Math.round(ui.atSpdKt || 0)} kt  THR ${Math.round((o.atThr || 0) * 100)}%`, 12, y0 + 82, C.green, 16, 'left');
  // alerts
  const A = alertsFor(o, sw, f);
  g.strokeStyle = C.grey; g.beginPath(); g.moveTo(8, y0 + 98); g.lineTo(S - 8, y0 + 98); g.stroke();
  A.slice(0, 6).forEach(([lvl, t], i) => txt(g, t, 14, y0 + 120 + i * 22, lvl === 'red' ? C.red : lvl === 'amber' ? C.amber : lvl === 'green' ? C.green : C.cyan, 18, 'left'));
}

// ---------------------------------------------------------------------------
// Systems / damage page: aircraft outline coloured by part damage, hydraulics,
// electrics, fuel leak. Shows where the airframe was hit.
export function drawSystems(g, S, o, sw, f) {
  g.fillStyle = C.bg; g.fillRect(0, 0, S, S);
  if (!o.avionicsPowered || o.elecFail) return;
  txt(g, 'STATUS · DAMAGE', S / 2, 22, C.white, 20);
  const col = (d, lost) => (lost ? C.red : d > 0.6 ? '#ff6a3d' : d > 0.25 ? C.amber : d > 0.02 ? '#d8e05a' : C.green);
  const cx = S / 2, cy = S * 0.42;
  const sc = S / 2.6;
  g.lineWidth = 6;
  // fuselage
  g.strokeStyle = col(o.dmgFus, o.dmgFus >= 1);
  g.beginPath(); g.moveTo(cx, cy - sc * 0.55); g.lineTo(cx, cy + sc * 0.6); g.stroke();
  // wings
  g.strokeStyle = col(o.dmgWingL, o.partsLost & 1); g.beginPath(); g.moveTo(cx, cy - sc * 0.05); g.lineTo(cx - sc * 0.95, cy + sc * 0.25); g.stroke();
  g.strokeStyle = col(o.dmgWingR, o.partsLost & 2); g.beginPath(); g.moveTo(cx, cy - sc * 0.05); g.lineTo(cx + sc * 0.95, cy + sc * 0.25); g.stroke();
  // tail
  g.strokeStyle = col(o.dmgTail, o.partsLost & 4); g.beginPath(); g.moveTo(cx - sc * 0.32, cy + sc * 0.62); g.lineTo(cx + sc * 0.32, cy + sc * 0.62); g.stroke();
  // engines
  const n = f.engines, dE = [o.dmgEng0, o.dmgEng1, o.dmgEng2, o.dmgEng3];
  const ey = f.g ? f.g.eng.map((e) => e[1]) : [0];
  const b2 = f.g ? f.g.b / 2 : 5;
  for (let i = 0; i < n; i++) {
    const ex = cx + (ey[i] / b2) * sc * 0.95, eyy = cy + Math.abs(ey[i] / b2) * sc * 0.3 + sc * 0.02;
    g.fillStyle = (o.fireMask >> i) & 1 ? C.red : col(dE[i], false);
    g.fillRect(ex - 9, eyy - 4, 18, 22);
    txt(g, String(i + 1), ex, eyy + 32, C.white, 14);
  }
  const y = S * 0.76;
  const hyd = Math.round(o.hyd * 3000);
  txt(g, `HYD ${hyd} psi`, 14, y, o.hyd < 0.3 ? C.red : o.hyd < 0.75 ? C.amber : C.green, 19, 'left');
  txt(g, `ELEC ${o.busV.toFixed(1)} V`, S - 14, y, o.busV < 24 ? C.amber : C.green, 19, 'right');
  txt(g, `FUEL LEAK ${(o.fuelLeak * 3600).toFixed(0)} kg/h`, 14, y + 28, o.fuelLeak > 0.05 ? C.amber : C.grey, 17, 'left');
  txt(g, `F/CTL ${o.fbw === 1 ? 'NORMAL LAW' : o.fbw === 2 ? 'DIRECT LAW' : 'CONVENTIONAL'}`, S - 14, y + 28, o.fbw === 2 ? C.amber : C.green, 17, 'right');
  txt(g, `GW ${(o.mass / 1000).toFixed(1)} t`, 14, y + 56, C.white, 17, 'left');
  txt(g, `TAT ${Math.round(ui0(o))}°C`, S - 14, y + 56, C.white, 17, 'right');
}
function ui0(o) { return (288.15 - 0.0065 * Math.min(o.alt, 11000)) - 273.15 + (o.tas * o.tas) / 2010; }

// ---------------------------------------------------------------------------
// Fighter head-up display (transparent canvas, green symbology)
export function drawHUD(g, S, o, ui) {
  g.clearRect(0, 0, S, S);
  if (!o.avionicsPowered || o.elecFail) return;
  const col = 'rgba(80,255,140,0.95)';
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.5;
  const cx = S / 2, cy = S * 0.45, ppd = S / 30;
  const pitch = o.theta / D2R, roll = o.phi / D2R;
  // pitch ladder
  g.save(); g.translate(cx, cy); g.rotate(-roll * D2R);
  for (let d = -90; d <= 90; d += 5) {
    const y = (pitch - d) * ppd;
    if (Math.abs(y) > S * 0.4) continue;
    const w = d === 0 ? S * 0.7 : S * 0.22;
    if (d < 0) g.setLineDash([10, 8]);
    g.beginPath(); g.moveTo(-w / 2, y); g.lineTo(-S * 0.06, y); g.moveTo(S * 0.06, y); g.lineTo(w / 2, y); g.stroke();
    g.setLineDash([]);
    if (d !== 0) { txt(g, String(Math.abs(d)), -w / 2 - 18, y, col, 16); txt(g, String(Math.abs(d)), w / 2 + 18, y, col, 16); }
  }
  g.restore();
  // waterline & velocity vector
  g.beginPath(); g.moveTo(cx - 24, cy); g.lineTo(cx - 10, cy); g.lineTo(cx - 5, cy + 6); g.lineTo(cx, cy); g.lineTo(cx + 5, cy + 6); g.lineTo(cx + 10, cy); g.lineTo(cx + 24, cy); g.stroke();
  const gam = Math.atan2(o.vs, Math.max(o.gs, 1)) / D2R;
  const vy = cy + (pitch - gam) * ppd;
  g.beginPath(); g.arc(cx, vy, 9, 0, Math.PI * 2); g.moveTo(cx - 24, vy); g.lineTo(cx - 9, vy); g.moveTo(cx + 9, vy); g.lineTo(cx + 24, vy); g.moveTo(cx, vy - 9); g.lineTo(cx, vy - 18); g.stroke();
  // speed & altitude boxes
  box(g, S * 0.08, cy - 18, 90, 36, col); txt(g, String(Math.round(o.indIas / KT)), S * 0.08 + 45, cy, col, 24);
  box(g, S * 0.92 - 100, cy - 18, 100, 36, col); txt(g, String(Math.round(o.indAlt / FT)), S * 0.92 - 50, cy, col, 24);
  txt(g, `M ${o.mach.toFixed(2)}`, S * 0.08 + 45, cy + 40, col, 18);
  txt(g, `G ${o.nz.toFixed(1)}`, S * 0.08 + 45, cy + 64, Math.abs(o.nz) > 8 ? 'rgba(255,190,60,0.95)' : col, 18);
  txt(g, `α ${(o.alpha / D2R).toFixed(1)}`, S * 0.08 + 45, cy + 88, col, 18);
  txt(g, `${Math.round(o.vs / FPM)}`, S * 0.92 - 50, cy + 40, col, 18);
  if (o.agl < 1500 * FT) txt(g, `R ${Math.round(o.agl / FT)}`, S * 0.92 - 50, cy + 64, col, 18);
  // heading tape
  const hdg = o.hdgMag;
  for (let d = Math.floor(hdg / 5) * 5 - 25; d <= hdg + 25; d += 5) {
    const x = cx + (d - hdg) * 8;
    g.beginPath(); g.moveTo(x, S * 0.08); g.lineTo(x, S * 0.08 + (d % 10 === 0 ? 14 : 8)); g.stroke();
    if (d % 10 === 0) txt(g, fmt(((d % 360) + 360) % 360 / 10, 2), x, S * 0.08 + 28, col, 15);
  }
  g.beginPath(); g.moveTo(cx, S * 0.08 - 4); g.lineTo(cx - 6, S * 0.08 - 14); g.lineTo(cx + 6, S * 0.08 - 14); g.closePath(); g.fill();
  // throttle / AB / gear
  txt(g, o.afterburner ? 'AB' : `${Math.round((o.n1_0 || 0))}%`, S * 0.08 + 45, S * 0.84, col, 20);
  if (o.gearPos > 0.01) txt(g, o.gearPos > 0.99 ? 'GEAR' : 'GEAR ▲▼', cx, S * 0.84, col, 20);
  if (o.stallWarn) txt(g, 'AOA', cx, S * 0.72, 'rgba(255,90,60,0.95)', 26);
  if (ui.gpws) txt(g, ui.gpws, cx, S * 0.66, 'rgba(255,90,60,0.95)', 28);
}
