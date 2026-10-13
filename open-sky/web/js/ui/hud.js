// In-flight HUD: flight data, warnings, tutorial panel, radio log & menu,
// minimap, live checklists, help and the debrief screen.
import { badge, gameTitle, GAME, RIGHTS } from './brand.js';
import { ACTIONS, keyLabel } from '../input/input.js';
import { VIEW_NAMES } from '../camera/cameras.js';
import { PHASE } from '../sim/traffic.js';
import { alertsFor } from '../aircraft/displays.js';
import { FlightDock } from './dock.js';

const $ = (id) => document.getElementById(id);
const D2R = Math.PI / 180;
const KT = 1 / 0.514444, FT = 1 / 0.3048;

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Checklists: each item auto-checks from the simulation state.
function jetChecklists(g) {
  const p = g.player, sw = p.sw, o = p.o, f = p.fleet;
  const all = (1 << f.engines) - 1;
  const running = () => (o.engMask & all) === all;
  return [
    ['Before start', 'לפני התנעה', [
      ['Parking brake — SET', () => sw.parkBrake], ['Battery — ON', () => sw.battery], ['Avionics / displays — ON', () => sw.avionics],
      ['Beacon — ON', () => sw.beacon], ['Fuel control — CUTOFF', () => sw.mixture < 0.5 || running()], ['Thrust levers — IDLE', () => sw.throttle < 0.05],
    ]],
    ['Engine start', 'התנעת מנועים', [
      ['Ignition — START (overhead)', () => sw.mags === 4 || running()], ['N2 above 22 % → fuel control RUN', () => sw.mixture > 0.5],
      [`All ${f.engines} engines stabilised at idle`, running], ['Generators — ON', () => sw.alternator],
    ]],
    ['Before takeoff', 'לפני המראה', [
      [`Flaps — ${f.flaps[f.toDetent]} (takeoff)`, () => sw.flaps === f.toDetent], ['Speed brake — DOWN', () => (sw.speedbrake || 0) < 0.05],
      ['Strobes & landing lights — ON', () => sw.strobe && sw.landing], ['Transponder / radios — set', () => sw.avionics],
      ['Takeoff clearance — RECEIVED', () => g.atc.clearances.takeoff],
      [`Rotate at ${f.vr} kt, gear UP after positive climb`, () => !o.onGround && !sw.gear],
    ]],
    ['Before landing', 'לפני נחיתה', [
      ['Gear — DOWN, 3 green', () => o.gearPos > 0.99], [`Flaps — ${f.flaps[f.flaps.length - 1]}`, () => sw.flaps === f.flaps.length - 1],
      ['Ground spoilers — ARMED', () => sw.spoilerArm || f.cat === 'Fighter'], [`Speed — Vref ${f.vref} + 5 kt`, () => Math.abs(o.ias / 0.514444 - f.vref - 5) < 8],
      ['Landing clearance — RECEIVED', () => g.atc.clearances.land],
    ]],
    ['After landing / shutdown', 'אחרי נחיתה וכיבוי', [
      ['Reversers — STOWED', () => !sw.reverse], ['Speed brake — DOWN, spoilers disarmed', () => !sw.spoilerArm], ['Flaps — UP', () => sw.flaps === 0],
      ['Parking brake — SET', () => sw.parkBrake], ['Fuel control — CUTOFF', () => sw.mixture < 0.5], ['Battery — OFF', () => !sw.battery],
    ]],
  ];
}

function checklists(g) {
  if (g.player.isJet) return jetChecklists(g);
  const sw = g.player.sw, o = g.player.o;
  return [
    ['Before start', 'לפני התנעה', [
      ['Parking brake — SET', () => sw.parkBrake], ['Fuel selector — BOTH', () => sw.fuelSelector === 2], ['Master battery — ON', () => sw.battery],
      ['Beacon — ON', () => sw.beacon], ['Mixture — RICH', () => sw.mixture > 0.9], ['Throttle — OPEN 1/4"', () => sw.throttle > 0.04 && sw.throttle < 0.25],
    ]],
    ['After start', 'אחרי התנעה', [
      ['Oil pressure — GREEN', () => o.oilP > 25], ['Alternator — ON', () => sw.alternator], ['Avionics — ON', () => sw.avionics],
      ['Ammeter — charging', () => o.battA > -1 && o.engineRunning], ['Heading indicator — SET', () => Math.abs(((o.hi - o.compass) / D2R + 540) % 360 - 180) < 3],
    ]],
    ['Before takeoff', 'לפני המראה', [
      ['Flaps — 0° to 10°', () => sw.flaps <= 1], ['Trim — TAKEOFF', () => Math.abs(o.trim) < 0.25], ['Mixture — RICH (below 3000 ft)', () => sw.mixture > 0.85],
      ['Landing light — ON', () => sw.landing], ['Strobes — ON', () => sw.strobe], ['Takeoff clearance — RECEIVED', () => g.atc.clearances.takeoff],
    ]],
    ['Before landing', 'לפני נחיתה', [
      ['Landing clearance — RECEIVED', () => g.atc.clearances.land], ['Mixture — RICH', () => sw.mixture > 0.85], ['Landing light — ON', () => sw.landing],
      ['Flaps — as required (final: 30°)', () => sw.flaps >= 2], ['Speed 60–70 KIAS on final', () => o.ias * KT > 58 && o.ias * KT < 72],
    ]],
    ['Shutdown', 'כיבוי', [
      ['Parking brake — SET', () => sw.parkBrake], ['Avionics — OFF', () => !sw.avionics], ['Mixture — CUT-OFF', () => sw.mixture < 0.05],
      ['Magnetos — OFF', () => sw.mags === 0], ['Master — OFF', () => !sw.battery],
    ]],
  ];
}

export class Hud {
  constructor(game) {
    this.g = game;
    this.atcOpen = false;
    this.mapOn = true;
    this.checkOn = false;
    this.dock = new FlightDock(game);
    this.t = 0;
    this.mapT = 0;
    $('hud-buttons').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'menu') game.setPaused(!game.paused);
      else game.input.pressed.push(...(game.input.settings.keys[a] || []).slice(0, 1));
    });
    $('btn-resume').onclick = () => game.setPaused(false);
    $('btn-save').onclick = () => game.saveNow();
    $('btn-restart').onclick = () => { game.setPaused(false); game.startFlight(game.spec); };
    $('btn-end').onclick = () => game.endFlight();
    $('btn-exit').onclick = () => { game.setPaused(false); game.state = 'menu'; game.showMenu(); };
    $('help').addEventListener('click', () => $('help').classList.add('hidden'));
    game.atc.on((m) => this.addMsg(m));
    game.events.on('violation', (v) => this.toast(v.text, 'bad'));
  }

  start() {
    $('atc-log').innerHTML = '';
    this.atcOpen = false;
    $('atc-menu').classList.add('hidden');
    this.applyVisibility();
    this.msgCount = 0;
    this.boot();
  }

  // Avionics boot sequence shown when a flight starts (brand + copyright).
  boot() {
    const el = $('hud-boot'), g = this.g;
    clearTimeout(this.bootTimer);
    clearInterval(this.bootTyper);
    el.className = '';
    el.innerHTML = '<div class="boot-head"></div><pre></pre><div class="rights"></div>';
    el.querySelector('.boot-head').append(badge(), gameTitle('boot'));
    el.querySelector('.rights').textContent = RIGHTS;
    const ac = g.player && g.player.fleet ? g.player.fleet.name : 'SKYLARK T1';
    const lines = [
      `GLOBAL SKIES FLIGHT SYSTEM ${GAME.version} · ORION GAMES`,
      `FLIGHT CORE ........ C++ ${g.core.backend === 'wasm' ? 'WEBASSEMBLY' : 'JS'} OK`,
      `AIRCRAFT ........... ${ac.toUpperCase()} OK`,
      `NAV DATABASE ....... ${(g.world.airportDb ? g.world.airportDb.rows.length : 0).toLocaleString('en-US')} AIRPORTS OK`,
      `WORLD .............. ${(g.world.status.place || '').toUpperCase()}`,
      'SYSTEMS READY',
    ];
    const pre = el.querySelector('pre');
    let i = 0, c = 0;
    this.bootTyper = setInterval(() => {
      if (i >= lines.length) { clearInterval(this.bootTyper); return; }
      c += 3;
      if (c >= lines[i].length) { c = 0; i++; }
      pre.textContent = lines.slice(0, i).join('\n') + (i < lines.length ? (i ? '\n' : '') + lines[i].slice(0, c) : '');
    }, 16);
    this.bootTimer = setTimeout(() => { el.classList.add('fade'); this.bootTimer = setTimeout(() => el.classList.add('hidden'), 700); }, 3600);
  }

  applyVisibility() {
    const on = this.g.settings.hud;
    $('hud-data').classList.toggle('hidden', !on);
    $('minimap').classList.toggle('hidden', !on || !this.mapOn);
  }

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('hud-msg').appendChild(el);
    setTimeout(() => el.remove(), 4000);
    while ($('hud-msg').children.length > 4) $('hud-msg').firstChild.remove();
  }

  addMsg(m) {
    const log = $('atc-log');
    const el = document.createElement('div');
    el.className = `msg ${m.who}`;
    const he = this.g.settings.hebrew && m.he ? `<span class="he" dir="rtl">${esc(m.he)}</span>` : '';
    el.innerHTML = `${m.station ? `<span class="st">${esc(m.station)}:</span> ` : ''}${esc(m.text)}${he}`;
    log.appendChild(el);
    while (log.children.length > 40) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  toggleAtc(force) {
    this.atcOpen = force !== undefined ? force : !this.atcOpen;
    if (this.g.settings.radioWheel !== false) { $('atc-menu').classList.add('hidden'); this.showWheel(this.atcOpen); return; }
    const menu = $('atc-menu');
    menu.classList.toggle('hidden', !this.atcOpen);
    if (!this.atcOpen) return;
    const opts = this.g.atc.options();
    this.opts = opts;
    menu.innerHTML = '';
    opts.forEach((o, i) => {
      const b = document.createElement('button');
      b.innerHTML = `${i + 1}. ${esc(o.label)}${this.g.settings.hebrew ? `<small dir="rtl">${esc(o.he)}</small>` : ''}`;
      b.onclick = () => this.atcSelect(i);
      menu.appendChild(b);
    });
  }

  // Radio wheel: the calls that make sense now, around a circle; pick by
  // pointing (mouse direction from the centre), clicking or number keys.
  showWheel(on) {
    const el = $('radio-wheel');
    el.classList.toggle('hidden', !on);
    if (!on) { this.wheelSel = -1; return; }
    const g = this.g, opts = g.atc.options();
    this.opts = opts;
    const n = opts.length, A = g.atc, gnd = g.player.o.onGround && !['lineup', 'cleared', 'takeoff'].includes(A.state);
    const st = A.airport && A.names ? (gnd ? A.names.gnd : A.names.twr) : 'Unicom';
    const fq = A.freq ? (gnd ? A.freq.gnd : A.freq.twr) : '122.800';
    const ui = { comStation: st, comFreq: fq };
    const R = n > 6 ? 205 : 180;
    el.innerHTML = `<div class="rw-ring"></div><div class="rw-center"><div class="rw-st">${esc(ui.comStation)}</div><div class="rw-fq">${esc(ui.comFreq || '')}</div><div class="rw-hint">${n ? `point & click · 1–${n} · Esc` : 'no calls available now'}</div></div>` +
      opts.map((o, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
        return `<button class="rw-opt" data-i="${i}" style="left:calc(50% + ${Math.round(Math.cos(a) * R)}px);top:calc(50% + ${Math.round(Math.sin(a) * R)}px)"><span class="rw-n">${i + 1}</span>${esc(o.label)}${g.settings.hebrew ? `<small dir="rtl">${esc(o.he)}</small>` : ''}</button>`;
      }).join('');
    const btns = [...el.querySelectorAll('.rw-opt')];
    btns.forEach((b) => { b.onclick = (e) => { e.stopPropagation(); this.atcSelect(+b.dataset.i); }; });
    const pick = (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < 60 || !n) { this.wheelSel = -1; } else {
        const a = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 4) % (Math.PI * 2);
        this.wheelSel = Math.round(a / ((2 * Math.PI) / n)) % n;
      }
      btns.forEach((b, i) => b.classList.toggle('sel', i === this.wheelSel));
    };
    el.onmousemove = pick;
    el.onclick = (e) => { pick(e); if (this.wheelSel >= 0) this.atcSelect(this.wheelSel); else this.toggleAtc(false); };
  }

  atcSelect(i) {
    if (!this.opts || !this.opts[i]) return;
    const id = this.opts[i].id;
    this.toggleAtc(false);
    this.g.atc.request(id);
  }

  toggleMap() { this.mapOn = !this.mapOn; this.applyVisibility(); }
  toggleChecklist() { this.checkOn = !this.checkOn; $('checklist').classList.toggle('hidden', !this.checkOn); }

  showHelp() {
    const keys = this.g.input.settings.keys;
    const rows = Object.entries(ACTIONS).filter(([k, v]) => !v.freeOnly).map(([k, v]) => `<tr><td>${esc(v.label)}</td><td dir="rtl" class="he">${esc(v.he)}</td><td>${(keys[k] || []).map((c) => `<span class="keycap">${esc(keyLabel(c))}</span>`).join(' ')}</td></tr>`).join('');
    $('help-body').innerHTML = `<h2>Controls</h2>
      <p class="note">Mouse: hold the right button and drag to look around (cockpit/chase), wheel to zoom; in the cockpit, hover a control for its name, click switches, drag or scroll levers, right-click and hold the key for START. Gamepad: left stick = pitch/roll, triggers = rudder, D-pad = throttle/trim, A = radio, B = brakes, X/Y = flaps, bumpers = views. Joysticks/throttles: bind axes in Menu → Controls.</p>
      <table class="keys">${rows}</table><p class="note">Click anywhere to close.</p>`;
    $('help').classList.remove('hidden');
  }

  // -----------------------------------------------------------------
  update(dt) {
    const g = this.g, o = g.player.o, sw = g.player.sw;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.1;
      if (g.settings.hud) this.drawData(o, sw);
      this.drawTutorial();
      this.drawStatus(o);
      this.dock.update();
      if (this.checkOn) this.drawChecklist();
    }
    this.mapT -= dt;
    if (this.mapT <= 0 && this.mapOn && g.settings.hud) { this.mapT = 0.15; this.drawMap(); }
  }

  // Flight strip: three primary readouts, state chips, then secondary rows.
  // Exterior views only; in the cockpit the aircraft's own instruments show this.
  _strip(prim, chips, rows, warn) {
    const P = prim.map(([l, n, u, sub]) => `<div class="fd-big"><span class="fd-l">${l}</span><span class="fd-n">${n}</span><span class="fd-u">${u}</span><span class="fd-sub">${sub}</span></div>`).join('');
    const C = chips.map(([t, k]) => `<span class="chip ${k || ''}">${t}</span>`).join('');
    const R = rows.map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`).join('');
    $('hud-data').innerHTML = `<div class="fd-primary">${P}</div><div class="fd-chips">${C}</div><div class="fd-rows">${R}</div>${warn.length ? `<div class="fd-warn">${warn.join('')}</div>` : ''}`;
  }

  _vs(vs) {
    const v = Math.round(vs / 10) * 10;
    return `${v > 40 ? '▲' : v < -40 ? '▼' : '•'} ${Math.abs(v).toLocaleString('en-US')}`;
  }

  drawData(o, sw) {
    if (this.g.player.isJet) return this.drawJetData(o, sw);
    const ias = o.indIas * KT, alt = o.indAlt * FT, vs = o.indVs * FT * 60;
    const warn = [];
    if (o.stallWarn) warn.push('<span class="chip bad">STALL</span>');
    if (o.overspeed) warn.push('<span class="chip bad">OVERSPEED</span>');
    if (!o.engineRunning && !o.onGround) warn.push('<span class="chip bad">ENGINE OFF</span>');
    if (sw.parkBrake && o.onGround) warn.push('<span class="chip warn">PARK BRAKE</span>');
    if (o.lowFuelL || o.lowFuelR) warn.push('<span class="chip warn">LOW FUEL</span>');
    if (o.lowVolts) warn.push('<span class="chip warn">LOW VOLTS</span>');
    const w = this.g.world.weather.state, nav = this.g.nav, ui = this.g.player.ui;
    const hdg = String(Math.round(o.hdgMag) % 360).padStart(3, '0');
    const prim = [
      ['IAS', ias.toFixed(0), 'KT', `GS ${(o.gs * KT).toFixed(0)}`],
      ['ALT', (Math.round(alt / 10) * 10).toLocaleString('en-US'), 'FT', `HDG ${hdg}°`],
      ['V/S', this._vs(vs), 'FPM', `TRIM ${Math.round(o.trim * 100)}`],
    ];
    const chips = [
      [`FLAPS ${Math.round(o.flapsDeg)}°`, o.flapsDeg > 0.5 ? 'on' : ''],
      [o.apEngaged ? `AP ${['ROL', 'HDG', 'NAV'][o.apLat]} ${['VS', 'ALT'][o.apVert]}` : 'AP OFF', o.apEngaged ? 'on' : 'off'],
      [`THR ${Math.round(sw.throttle * 100)}%`, ''],
    ];
    const rows = [
      ['RPM', `${Math.round(o.rpm)}`],
      ['WIND', `${String(Math.round(w.windDir)).padStart(3, '0')}° / ${Math.round(w.windKt)}${w.gustKt ? 'G' + w.gustKt : ''} kt`],
      ['FUEL', `${((o.fuelL + o.fuelR) / 0.72 / 3.785).toFixed(1)} gal`],
    ];
    if (o.apEngaged) rows.push(['AP SEL', `${Math.round(ui.hdgBugDeg)}° · ${ui.apAltFt} ft`]);
    if (nav) rows.push(['GPS', `${esc(nav.name.slice(0, 14))} ${nav.distNm.toFixed(1)} nm ${String(Math.round(nav.brgMag)).padStart(3, '0')}°`]);
    this._strip(prim, chips, rows, warn);
  }

  drawJetData(o, sw) {
    const p = this.g.player, f = p.fleet;
    const ias = o.indIas * KT, alt = o.indAlt * FT, vs = o.indVs * FT * 60;
    const n1 = [o.n1_0, o.n1_1, o.n1_2, o.n1_3].slice(0, f.engines).map((v) => Math.round(v)).join(' · ');
    const w = this.g.world.weather.state;
    const hdg = String(Math.round(o.hdgMag) % 360).padStart(3, '0');
    const prim = [
      ['IAS', ias.toFixed(0), 'KT', o.mach > 0.3 ? `M ${o.mach.toFixed(2)}` : `GS ${(o.gs * KT).toFixed(0)}`],
      ['ALT', (Math.round(alt / 10) * 10).toLocaleString('en-US'), 'FT', `HDG ${hdg}°`],
      ['V/S', this._vs(vs), 'FPM', `GS ${(o.gs * KT).toFixed(0)} KT`],
    ];
    const gearK = o.gearPos > 0.99 ? 'good' : o.gearPos < 0.01 ? '' : 'warn';
    const gearT = o.gearPos > 0.99 ? 'GEAR DN' : o.gearPos < 0.01 ? 'GEAR UP' : 'GEAR ⇅';
    const chips = [
      [gearT, gearK],
      [`FLAPS ${f.flaps[sw.flaps]}`, sw.flaps > 0 ? 'on' : ''],
      [o.speedbrake > 0.02 ? `SPD BRK ${Math.round(o.speedbrake * 100)}%` : sw.spoilerArm ? 'SPLR ARM' : 'SPD BRK', o.speedbrake > 0.02 ? 'warn' : sw.spoilerArm ? 'on' : 'off'],
      [o.apEngaged ? `AP ${['ROL', 'HDG', 'NAV'][o.apLat]} ${['VS', 'ALT'][o.apVert]}` : 'AP OFF', o.apEngaged ? 'on' : 'off'],
      [sw.at ? `A/T ${p.ui.atSpdKt}` : 'A/T OFF', sw.at ? 'on' : 'off'],
    ];
    if (o.afterburner) chips.push(['AB', 'warn']);
    if (o.reverser) chips.push(['REV', 'warn']);
    const rows = [
      ['N1 %', n1],
      ['THRUST', `${Math.round((sw.at ? o.atThr : sw.throttle) * 100)}%`],
      ['WIND', `${String(Math.round(w.windDir)).padStart(3, '0')}° / ${Math.round(w.windKt)}${w.gustKt ? 'G' + w.gustKt : ''} kt`],
      ['FUEL', `${((o.fuelL + o.fuelR) / 1000).toFixed(1)} t · ${Math.round(o.fuelFlow * 3600)} kg/h`],
    ];
    if (o.apEngaged) rows.push(['AP SEL', `${Math.round(p.ui.hdgBugDeg)}° · ${p.ui.apAltFt} ft`]);
    if (this.g.nav) rows.push(['GPS', `${esc(this.g.nav.name.slice(0, 14))} ${this.g.nav.distNm.toFixed(1)} nm ${String(Math.round(this.g.nav.brgMag)).padStart(3, '0')}°`]);
    const A = alertsFor(o, sw, f).filter(([lvl]) => lvl === 'red' || lvl === 'amber');
    const warn = A.slice(0, 5).map(([lvl, t]) => `<span class="chip ${lvl === 'red' ? 'bad' : 'warn'}">${esc(t)}</span>`);
    this._strip(prim, chips, rows, warn);
  }

  drawTutorial() {
    const g = this.g, tv = g.mission && g.mission.tutorialView();
    const el = $('tutorial');
    if (!tv) {
      const wp = g.mission && g.mission.currentWaypoint();
      if (wp && g.nav) {
        el.classList.remove('hidden');
        el.innerHTML = `<div class="step">Next: ${esc(wp.name)} — ${g.nav.distNm.toFixed(1)} nm, heading ${String(Math.round(g.nav.brgMag)).padStart(3, '0')}°, ${wp.altFt ? `${wp.altFt[0]}–${wp.altFt[1]} ft` : ''}</div>${g.missionDef && g.settings.hebrew ? `<div class="he" dir="rtl">היעד הבא: ${esc(wp.name)}</div>` : ''}<div class="hint">Tip: autopilot NAV mode (click NAV on the AP panel, then AP) flies toward the next waypoint.</div>`;
      } else el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `<div class="step">${tv.index + 1}/${tv.count} · ${esc(tv.text)}</div>${g.settings.hebrew ? `<div class="he" dir="rtl">${esc(tv.he)}</div>` : ''}${tv.hint ? `<div class="hint">${esc(tv.hint)}</div>` : ''}<div class="bar"><div style="width:${Math.round((100 * tv.index) / (tv.count - 1))}%"></div></div>`;
  }

  drawStatus(o) {
    const g = this.g;
    const st = g.atc.state;
    $('hud').classList.toggle('in-cockpit', g.rig.view === 'cockpit');
    $('atc').classList.toggle('empty', !$('atc-log').children.length && !this.atcOpen);
    const rw = g.atc.activeEnd ? g.atc.activeEnd.ident : '-';
    if (g.settings.diag) {
      $('hud-status').innerHTML = `${esc(VIEW_NAMES[g.rig.view])} · ${g.player.simMode ? 'Simulation' : 'Accessible'} · core: ${g.core.backend.toUpperCase()} · ${Math.round(g.fps.value)} fps<br>${esc(g.world.status.place)} · ATC: ${esc(st)} · runway ${esc(rw)} · AI ${g.traffic.agents.length}<br>Terrain: ${esc(g.world.status.terrain)} · F3 hides diagnostics`;
    } else {
      $('hud-status').innerHTML = `<span class="ctx">${esc(VIEW_NAMES[g.rig.view])}</span><span class="ctx">${g.player.simMode ? 'Simulation' : 'Accessible'}</span><span class="ctx">RWY ${esc(rw)}</span>`;
    }
  }

  drawChecklist() {
    const html = checklists(this.g).map(([t, he, items]) => `<h4>${esc(t)}${this.g.settings.hebrew ? ` · <span dir="rtl" class="he">${esc(he)}</span>` : ''}</h4>${items.map(([txt, fn]) => { const ok = fn(); return `<div class="item ${ok ? 'ok' : ''}"><span>${esc(txt)}</span><span>${ok ? '✓' : '·'}</span></div>`; }).join('')}`).join('');
    $('checklist').innerHTML = html;
  }

  drawMap() {
    const g = this.g, c = $('minimap'), ctx = c.getContext('2d');
    const W = c.width, H = c.height, o = g.player.o;
    const range = o.onGround ? 1500 : Math.min(30000, 3000 + o.agl * 8);
    const k = W / 2 / range;
    const toPx = (x, y) => [W / 2 + (x - o.x) * k, H / 2 - (y - o.y) * k];
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8,14,26,0.88)';
    ctx.fillRect(0, 0, W, H);
    this.drawLand(ctx, W, H, o, range);
    // range ring at half range
    ctx.strokeStyle = 'rgba(212,168,92,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 4, 0, Math.PI * 2); ctx.stroke();
    // airports
    for (const ap of g.world.airports) {
      ctx.strokeStyle = '#5c6b82';
      ctx.lineWidth = 1;
      if (range < 6000) {
        for (const t of ap.data.taxiways) {
          ctx.beginPath();
          t.pts.forEach((p, i) => { const w = ap.owner.toWorld(p[0], p[1], {}); const [x, y] = toPx(w.x, w.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
          ctx.stroke();
        }
      }
      for (const r of ap.rw) {
        const a = ap.owner.toWorld(r.le.x, r.le.y, {}), b = ap.owner.toWorld(r.he.x, r.he.y, {});
        const [x1, y1] = toPx(a.x, a.y), [x2, y2] = toPx(b.x, b.y);
        ctx.strokeStyle = '#e9eef6';
        ctx.lineWidth = Math.max(2, r.W * k);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }
    // taxi route
    const r = g.atc.route, ap0 = g.atc.airport;
    if (r && ap0) {
      ctx.strokeStyle = '#29ff6a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      r.path.forEach((n, i) => { const nn = ap0.data.graph.nodes[n]; const w = ap0.owner.toWorld(nn[0], nn[1], {}); const [x, y] = toPx(w.x, w.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    // waypoints / destination
    const t = g.navTarget();
    if (t) {
      const p = g.world.frame.toXY(t.lat, t.lon);
      let [x, y] = toPx(p.x, p.y);
      const dx = x - W / 2, dy = y - H / 2, m = Math.max(Math.abs(dx), Math.abs(dy));
      if (m > W / 2 - 8) { x = W / 2 + (dx / m) * (W / 2 - 8); y = H / 2 + (dy / m) * (H / 2 - 8); }
      ctx.fillStyle = '#ffb000';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
    // AI traffic
    for (const a of g.traffic.agents) {
      const [x, y] = toPx(a.x, a.y);
      ctx.fillStyle = a.phase >= 6 && a.phase <= 9 ? '#58c9ff' : '#8a96a8';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // ownship
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(o.psi);
    ctx.fillStyle = '#ff8c2a';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#9aa7bb';
    ctx.font = '11px sans-serif';
    ctx.fillText(`N↑  ${(range / 1852).toFixed(1)} nm`, 8, 14);
  }

  // Land, water and built-up areas from the region's land-class raster,
  // sampled on a coarse grid and cached while the view barely moves.
  drawLand(ctx, W, H, o, range) {
    const regs = this.g.world.regions;
    if (!regs.length) return;
    const N = 80, cell = (2 * range) / N;
    const key = `${Math.round(o.x / cell)},${Math.round(o.y / cell)},${Math.round(range)}`;
    if (this._landKey !== key) {
      this._landKey = key;
      if (!this._land) { this._land = document.createElement('canvas'); this._land.width = this._land.height = N; }
      const lx = this._land.getContext('2d'), img = lx.createImageData(N, N);
      const tmp = {};
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const wx = o.x + (i + 0.5 - N / 2) * cell, wy = o.y - (j + 0.5 - N / 2) * cell;
          let c = -1;
          for (const r of regs) { r.toRegion(wx, wy, tmp); c = r.classAt(tmp.x, tmp.y); if (c >= 0) break; }
          let rgb = [24, 34, 44];                                   // land
          if (c < 0) rgb = [14, 22, 34];                            // outside the detailed region
          else if ((c >= 1 && c <= 4) || c === 44 || c === 45 || c === 46) rgb = [12, 38, 66];   // water
          else if (c >= 10 && c <= 13) rgb = [44, 52, 62];          // built up
          else if (c >= 20 && c <= 31) rgb = [22, 46, 34];          // parks, woods, fields
          else if (c >= 50 && c <= 55) rgb = [58, 62, 70];          // airport
          const k = (j * N + i) * 4;
          img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2]; img.data[k + 3] = 255;
        }
      }
      lx.putImageData(img, 0, 0);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.95;
    ctx.filter = 'blur(1.5px)';
    ctx.drawImage(this._land, 0, 0, W, H);
    ctx.filter = 'none';
    ctx.restore();
  }

  // -----------------------------------------------------------------
  showDebrief(res) {
    const g = this.g, he = g.settings.hebrew;
    const part = (k, label, lhe) => `<div class="score"><div class="n">${res.parts[k] === null ? '—' : res.parts[k]}</div><div class="l">${label}${he ? ` · <span dir="rtl">${lhe}</span>` : ''}</div></div>`;
    const L = res.landings.length ? res.landings[res.landings.length - 1] : null;
    $('debrief-body').innerHTML = `
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        <div class="grade">${res.grade}</div>
        <div><h2>Flight debrief${he ? ' · <span dir="rtl" class="he">סיכום ביצוע</span>' : ''}</h2>
        <div class="note">${esc(g.missionDef ? g.missionDef.title : 'Free flight')} · total score <b>${res.total}/100</b> · ${res.flightMin.toFixed(1)} min · ${res.distanceKm.toFixed(1)} km${res.crash ? ` · <span style="color:#ff8a8a">crash: ${esc(res.crash)}</span>` : ''}</div></div>
      </div>
      <div class="score-grid">
        ${part('landing', 'LANDING', 'נחיתה')}${part('speed', 'SPEED CONTROL', 'שמירת מהירות')}${part('altitude', 'ALTITUDE', 'שמירת גובה')}${part('procedures', 'PROCEDURES', 'נהלים')}${part('comfort', 'PASSENGER COMFORT', 'נוחות נוסעים')}
      </div>
      ${L ? `<div class="note">Last touchdown: ${Math.round(-L.vsFpm)} fpm sink, ${L.g.toFixed(2)} g, ${L.centre < 50 ? L.centre.toFixed(1) + ' m from centreline' : 'off runway'}, ${L.along >= 0 ? Math.round(L.along) + ' m past the threshold' : 'before the threshold'}, crab ${L.crab.toFixed(1)}°, bank ${L.bank.toFixed(1)}°.</div>` : '<div class="note">No landing recorded.</div>'}
      <div class="note">Max bank ${res.maxBank.toFixed(0)}° · load factor ${res.minG.toFixed(2)}…${res.maxG.toFixed(2)} g · waypoints ${res.waypointsHit}${g.missionDef && g.missionDef.waypoints ? '/' + g.missionDef.waypoints.length : ''} · ATC violations ${res.violations.length}</div>
      <div class="timeline">${res.timeline.map((e) => `<div class="${e.kind}">${(e.t / 60).toFixed(1)} min — ${esc(e.text)}${he && e.he ? ` · <span dir="rtl" class="he">${esc(e.he)}</span>` : ''}</div>`).join('') || 'No events.'}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="big-btn primary" id="db-again">Fly again</button><button class="big-btn" id="db-menu">Main menu</button></div>`;
    $('debrief').classList.remove('hidden');
    $('db-again').onclick = () => { $('debrief').classList.add('hidden'); g.startFlight(g.spec); };
    $('db-menu').onclick = () => { $('debrief').classList.add('hidden'); g.showMenu(); };
  }
}

export { PHASE };
