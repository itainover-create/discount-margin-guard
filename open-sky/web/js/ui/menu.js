// Main menu: home, free flight (globe, search, place details, start setup,
// destination planning), missions, settings (+ benchmark), controls
// (rebinding, joystick axes, sensitivity) and the About & Data page.
import { Globe } from './globe.js';
import { MISSIONS } from '../sim/missions.js';
import { PRESETS } from '../world/weather.js';
import { ACTIONS, AXES, keyLabel } from '../input/input.js';
import { haversine } from '../world/geo.js';
import { QUALITY } from '../config.js';

const $ = (id) => document.getElementById(id);
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export class Menu {
  constructor(game) {
    this.g = game;
    this.sel = null;
    this.destRow = null;
  }

  async init() {
    const g = this.g;
    document.querySelectorAll('.menu-tabs button').forEach((b) => b.addEventListener('click', () => this.tab(b.dataset.tab)));
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => this.tab(b.dataset.goto)));
    $('lang-toggle').onclick = () => { g.settings.hebrew = !g.settings.hebrew; g.saveSettings(); this.renderAll(); };
    $('btn-quick').onclick = () => g.startFlight({ icao: 'KJFK', start: 'stand', mode: g.settings.mode, hour: 12, weather: 'fair' });
    $('btn-continue').onclick = () => {
      const s = g.loadSave();
      if (!s) return;
      g.startFlight({ ...s.spec, save: s.snap, weather: s.spec.weather, hour: s.spec.hour });
    };
    const wsel = $('weather');
    wsel.innerHTML = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('');
    wsel.value = 'fair';
    $('mode').value = g.settings.mode;
    this.rows = g.world.airportDb.rows;
    this.countries = g.world.airportDb.countries;
    this.globe = new Globe($('globe'), g.world);
    this.globe.on('pick', (ll) => {
      const n = g.world.nearestAirports(ll.lat, ll.lon, 1)[0];
      if (n) this.select(n[1]);
    });
    $('search').addEventListener('input', () => this.search($('search').value));
    $('dest').addEventListener('change', () => this.setDest($('dest').value));
    $('btn-fly').onclick = () => this.fly();
    this.renderAll();
    this.select(g.world.airportIndex.get('KJFK'));
  }

  renderAll() {
    document.body.classList.toggle('he-on', !!this.g.settings.hebrew);
    this.renderFeatured();
    this.renderMissions();
    this.renderSettings();
    this.renderControls();
    this.renderAbout();
    const s = this.g.loadSave();
    $('btn-continue').disabled = !s;
    if (s) $('btn-continue').textContent = `Continue: ${s.spec.missionId || s.spec.icao || 'flight'} (${new Date(s.at).toLocaleString()})`;
    $('home-status').textContent = `Flight core: ${this.g.core.backend === 'wasm' ? 'C++ compiled to WebAssembly' : 'C++ (JS fallback build)'} · ${this.g.world.catalog.regions.length} detailed real-world regions · ${this.rows.length.toLocaleString()} flyable airports worldwide · terrain: ${this.g.world.terrainProvider.status()}`;
  }

  show() { this.renderAll(); this.resize(); }
  resize() { this.globe && this.globe.resize(); }
  frame(dt) { this.globe && this.globe.frame(dt); }

  tab(name) {
    document.querySelectorAll('.menu-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('show', t.id === 'tab-' + name));
    if (name === 'free') setTimeout(() => this.resize(), 30);
  }

  // ---------------------------------------------------------------------
  tierOf(row) {
    const reg = this.g.world.regionForAirport(row[0]);
    return reg ? reg.tier : 'G';
  }

  renderFeatured() {
    const g = this.g;
    $('featured').innerHTML = g.world.catalog.regions.map((r) => `<div class="feat" data-icao="${r.anchor.icao}"><b>${esc(r.name)}</b><small>${esc(r.character)}${g.settings.hebrew ? ` · <span dir="rtl">${esc(r.characterHe)}</span>` : ''}</small><br><span class="tier ${r.tier}">${r.tier === 'A' ? 'Detailed' : 'Regional'}</span> <small>${r.anchor.icao}</small></div>`).join('');
    const planned = g.world.catalog.planned || [];
    if (planned.length) {
      $('featured').innerHTML += `<div class="feat-head">In development · flyable now at the global tier${g.settings.hebrew ? ' · <span dir="rtl">בפיתוח — טיסים כבר עכשיו בשכבה הגלובלית</span>' : ''}</div>` +
        planned.map((r) => `<div class="feat planned" data-icao="${r.anchor.icao}"><b>${esc(r.name)}</b><small>${esc(r.character)}${g.settings.hebrew ? ` · <span dir="rtl">${esc(r.characterHe)}</span>` : ''}</small><br><span class="tier G">Global now</span> <span class="tier dev">${r.status === 'in development' ? 'Detailed: in development' : 'Detailed: planned'}</span> <small>${r.anchor.icao}</small></div>`).join('');
    }
    $('featured').querySelectorAll('.feat').forEach((el) => el.onclick = () => this.select(g.world.airportIndex.get(el.dataset.icao)));
  }

  search(q) {
    q = q.trim().toLowerCase();
    const out = [];
    if (q.length >= 2) {
      const cc = Object.entries(this.countries).filter(([, n]) => n.toLowerCase().includes(q)).map(([c]) => c);
      for (const r of this.rows) {
        const hit = r[0].toLowerCase() === q || r[1].toLowerCase() === q ? 3 :
          r[0].toLowerCase().startsWith(q) || r[1].toLowerCase().startsWith(q) ? 2 :
            r[2].toLowerCase().includes(q) || r[3].toLowerCase().includes(q) || r[5].toLowerCase().includes(q) || cc.includes(r[4]) ? 1 : 0;
        if (hit) out.push([hit + (r[9] === 'L' ? 0.5 : r[9] === 'M' ? 0.25 : 0) + (this.tierOf(r) !== 'G' ? 1 : 0), r]);
      }
    }
    out.sort((a, b) => b[0] - a[0]);
    $('search-results').innerHTML = out.slice(0, 30).map(([, r]) => `<div class="result" data-icao="${r[0]}"><span><b>${esc(r[0])}</b>${r[1] ? ' / ' + esc(r[1]) : ''} · ${esc(r[2])}<br><small>${esc(r[3])}, ${esc(this.countries[r[4]] || r[4])}</small></span><span class="tier ${this.tierOf(r)}">${this.tierOf(r) === 'A' ? 'Detailed' : this.tierOf(r) === 'B' ? 'Regional' : 'Global'}</span></div>`).join('') || (q.length >= 2 ? '<div class="note">No airport found.</div>' : '');
    $('search-results').querySelectorAll('.result').forEach((el) => el.onclick = () => this.select(this.g.world.airportIndex.get(el.dataset.icao)));
  }

  select(row) {
    if (!row) return;
    const g = this.g;
    this.sel = row;
    const tier = this.tierOf(row);
    const reg = g.world.regionForAirport(row[0]);
    this.globe.flyTo(row[6], row[7], 1.6);
    this.globe.select(row[6], row[7]);
    const rws = row[11].map((r) => `${r[0]}/${r[1]} ${Math.round(r[6] * 0.3048)} m`).join(' · ');
    let detail;
    if (reg) {
      const s = reg.stats;
      detail = `<b>${tier === 'A' ? 'Detailed region' : 'Regional detail'}:</b> ${esc(reg.name)} — ${s.buildings.toLocaleString()} real building footprints (${s.buildingHeightsMeasuredPct}% with measured heights, the rest estimated), ${s.roads.toLocaleString()} road segments, coastline & land use from map data, terrain from elevation data. ${tier === 'A' ? 'Landmark models and a detailed airport with gates, signs and full lighting.' : ''}`;
    } else {
      detail = '<b>Global base:</b> the runways are at their real position, heading and length (OurAirports). Terrain streams from online elevation tiles when available (else a coarse ~10 km offline layer). Taxiways, apron and buildings are generic; no city buildings.';
    }
    $('place-info').innerHTML = `<h3>${esc(row[2])}</h3><div>${esc(row[0])}${row[1] ? ' / ' + esc(row[1]) : ''} · ${esc(row[3])}, ${esc(this.countries[row[4]] || row[4])} · elevation ${row[8]} ft</div><div class="note">Runways: ${esc(rws)}</div><div class="note"><span class="tier ${tier}">${tier === 'A' ? 'Detailed' : tier === 'B' ? 'Regional' : 'Global'}</span> ${detail}</div>`;
    $('btn-fly').disabled = false;
    this.updateRoute();
  }

  setDest(code) {
    code = code.trim().toUpperCase();
    this.destRow = code ? (this.g.world.airportIndex.get(code) || this.rows.find((r) => r[1] === code) || this.rows.find((r) => r[2].toUpperCase().includes(code))) : null;
    this.updateRoute();
  }

  updateRoute() {
    const a = this.sel, b = this.destRow;
    if (!a || !b) { $('route-info').textContent = b === undefined ? '' : ''; this.globe.setArc(null); return; }
    const d = haversine(a[6], a[7], b[6], b[7]) / 1852;
    const ete = d / 110 * 60;
    const fuel = (ete / 60) * 9.5 + 10;
    const sameRegion = this.g.world.regionForAirport(a[0]) && this.g.world.regionForAirport(a[0]) === this.g.world.regionForAirport(b[0]);
    $('route-info').innerHTML = `Route ${esc(a[0])} → ${esc(b[0])}: ${d.toFixed(0)} nm great-circle, about ${Math.floor(ete / 60)} h ${Math.round(ete % 60)} min at 110 KTAS, ~${fuel.toFixed(0)} gal fuel incl. reserve${fuel > 50 ? ' — <b style="color:#ff8a8a">beyond the trainer\'s fuel (53 gal)</b>' : ''}. ${sameRegion ? 'Both airports are inside the same detailed region.' : 'Continuous flight: the world streams along the way; detail drops to the global tier outside real regions.'} The GPS/AP NAV mode will guide you.`;
    this.globe.setArc({ lat: a[6], lon: a[7] }, { lat: b[6], lon: b[7] });
  }

  fly() {
    const g = this.g, r = this.sel;
    if (!r) return;
    g.settings.mode = $('mode').value;
    g.saveSettings();
    const t = $('time').value;
    g.startFlight({ icao: r[0], start: $('start-pos').value, mode: g.settings.mode, hour: t === 'now' ? 'now' : parseFloat(t), weather: $('weather').value, dest: this.destRow ? this.destRow[0] : null });
  }

  // ---------------------------------------------------------------------
  renderMissions() {
    const g = this.g;
    let best = {};
    try { best = JSON.parse(localStorage.getItem('opensky.best') || '{}'); } catch { /* none */ }
    $('mission-list').innerHTML = MISSIONS.map((m) => `<div class="mission"><div class="meta">${esc(m.kind)} · ${esc(m.icao)} · ${esc(PRESETS[m.weather].label)}</div><h3>${esc(m.title)}</h3>${g.settings.hebrew ? `<h3 dir="rtl" class="he" style="font-size:16px;color:#cdd6e4">${esc(m.titleHe)}</h3>` : ''}<p>${esc(m.desc)}</p>${g.settings.hebrew ? `<p dir="rtl" class="he">${esc(m.descHe)}</p>` : ''}${best[m.id] !== undefined ? `<div class="best">Best score: ${best[m.id]}/100</div>` : ''}<div style="display:flex;gap:8px;margin-top:auto"><button class="big-btn primary" data-m="${m.id}" data-mode="accessible">Fly (accessible)</button><button class="big-btn" data-m="${m.id}" data-mode="simulation">Simulation</button></div></div>`).join('') +
      `<div class="mission"><div class="meta">Planned for the next versions</div><h3>Airliner and fighter training</h3><p>Airliner (737-class twinjet) and fighter (F-16-class) aircraft with their own flight models, systems and missions are on the roadmap. They will be added after the core flight system is validated (see docs/ROADMAP.md).</p></div>`;
    $('mission-list').querySelectorAll('button[data-m]').forEach((b) => b.onclick = () => {
      const m = MISSIONS.find((x) => x.id === b.dataset.m);
      g.settings.mode = b.dataset.mode;
      g.startFlight({ icao: m.icao, start: m.start, mode: b.dataset.mode, hour: m.hour, weather: m.weather, missionId: m.id });
    });
  }

  renderSettings() {
    const g = this.g, s = g.settings;
    const q = QUALITY[s.quality];
    $('settings-form').innerHTML = `<div class="form-grid">
      <fieldset><legend>GRAPHICS</legend>
        <div class="row">Preset <select id="set-q">${Object.keys(QUALITY).map((k) => `<option ${k === s.quality ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div class="note">View distance ${(q.view / 1000).toFixed(0)} km · buildings full detail within ${q.near} km, simplified to ${q.mid} km, skyline to ${q.far} km · up to ${q.trees} trees per km².</div>
        <div class="row">Online terrain tiles <input type="checkbox" id="set-online" ${s.online ? 'checked' : ''}></div>
        <div class="row">HUD <input type="checkbox" id="set-hud" ${s.hud ? 'checked' : ''}></div>
        <button class="big-btn" id="bench">Run benchmark (60 s over New York)</button>
        <div id="bench-out" class="note"></div>
      </fieldset>
      <fieldset><legend>TRAFFIC</legend>
        <div class="row">AI aircraft (max) <input type="range" id="set-ai" min="0" max="30" value="${s.trafficDensity ?? q.traffic}"><span id="ai-v">${s.trafficDensity ?? q.traffic}</span></div>
        <div class="row">Road vehicles <input type="range" id="set-cars" min="0" max="220" value="${s.carDensity ?? q.cars}"><span id="cars-v">${s.carDensity ?? q.cars}</span></div>
      </fieldset>
      <fieldset><legend>FLIGHT</legend>
        <div class="row">Default mode <select id="set-mode"><option value="accessible" ${s.mode === 'accessible' ? 'selected' : ''}>Accessible</option><option value="simulation" ${s.mode === 'simulation' ? 'selected' : ''}>Simulation</option></select></div>
        <div class="note">Accessible: auto-rudder, stall protection, attitude hold when the stick is centred, auto mixture, perfect gyros, easy engine start, more crash tolerance, taxi steering assist. Simulation: none of these; priming, mixture, vacuum gyros and heading-indicator drift are modelled.</div>
        <div class="row">Taxi route line in simulation mode <input type="checkbox" id="set-route" ${s.routeInSim ? 'checked' : ''}></div>
      </fieldset>
      <fieldset><legend>AUDIO &amp; LANGUAGE</legend>
        <div class="row">Master volume <input type="range" id="set-vol" min="0" max="1" step="0.05" value="${s.volume}"></div>
        <div class="row">Music volume <input type="range" id="set-music" min="0" max="1" step="0.05" value="${s.music ?? 0.7}"></div>
        <div class="row">ATC voice (English, browser speech) <input type="checkbox" id="set-voice" ${s.atcVoice ? 'checked' : ''}></div>
        <div class="row">Hebrew explanations (optional) <input type="checkbox" id="set-he" ${s.hebrew ? 'checked' : ''}></div>
        <div class="row">Play the opening at start <input type="checkbox" id="set-intro" ${s.intro !== false ? 'checked' : ''}></div>
        <button class="big-btn" id="replay-intro">Replay the ORION GAMES opening</button>
      </fieldset></div>`;
    const save = () => { g.saveSettings(); };
    $('set-q').onchange = (e) => { s.quality = e.target.value; s.trafficDensity = null; s.carDensity = null; save(); g.applyQuality(); this.renderSettings(); };
    $('set-online').onchange = (e) => { s.online = e.target.checked; g.world.terrainProvider.onlineEnabled = s.online; save(); };
    $('set-hud').onchange = (e) => { s.hud = e.target.checked; save(); };
    $('set-ai').oninput = (e) => { s.trafficDensity = +e.target.value; $('ai-v').textContent = e.target.value; save(); g.core.tfcSetDensity(s.trafficDensity, 0); };
    $('set-cars').oninput = (e) => { s.carDensity = +e.target.value; $('cars-v').textContent = e.target.value; save(); g.vehicles.setDensity(s.carDensity); };
    $('set-mode').onchange = (e) => { s.mode = e.target.value; $('mode').value = s.mode; save(); };
    $('set-route').onchange = (e) => { s.routeInSim = e.target.checked; save(); };
    $('set-vol').oninput = (e) => { s.volume = +e.target.value; g.audio.volume.master = s.volume; if (g.audio.master) g.audio.master.gain.value = s.volume; save(); };
    $('set-voice').onchange = (e) => { s.atcVoice = e.target.checked; save(); };
    $('set-he').onchange = (e) => { s.hebrew = e.target.checked; save(); this.renderAll(); };
    $('set-music').oninput = (e) => { s.music = +e.target.value; save(); if (g.music) { g.music.resume(s.music); if (s.music > 0) g.music.startAmbient(); else g.music.stopAll(0.3); } };
    $('set-intro').onchange = (e) => { s.intro = e.target.checked; save(); };
    $('replay-intro').onclick = () => g.playIntro(false);
    $('bench').onclick = () => this.benchmark();
  }

  async benchmark() {
    const g = this.g;
    $('bench-out').textContent = 'Loading…';
    await g.startFlight({ icao: 'KJFK', start: 'airHigh', mode: 'accessible', hour: 12, weather: 'fair' });
    // scripted camera path over Manhattan, measure frame times
    g.rig.setView('free', g.player);
    const f = g.world.frame;
    const a = f.toXY(40.69, -74.03), b = f.toXY(40.80, -73.96);
    const times = [];
    const t0 = performance.now();
    await new Promise((res) => {
      const step = () => {
        const t = (performance.now() - t0) / 60000;
        if (t >= 1 || g.state !== 'flight') return res();
        g.rig.free.pos.set(a.x + (b.x - a.x) * t, 450, -(a.y + (b.y - a.y) * t));
        g.rig.free.yaw = -0.4; g.rig.free.pitch = -0.25;
        times.push(g.fps.value);
        setTimeout(step, 250);
      };
      step();
    });
    const v = times.filter((x) => x > 0).sort((x, y) => x - y);
    const avg = v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
    const low = v[Math.floor(v.length * 0.05)] || 0;
    const info = g.renderer.info.render;
    const res = { avgFps: avg.toFixed(1), p5Fps: low.toFixed(1), triangles: info.triangles, drawCalls: info.calls, preset: g.settings.quality, at: new Date().toISOString(), ua: navigator.userAgent };
    try { localStorage.setItem('opensky.bench', JSON.stringify(res)); } catch { /* ignore */ }
    g.state = 'menu';
    g.showMenu();
    this.tab('settings');
    $('bench-out').innerHTML = `Benchmark (${res.preset}): average <b>${res.avgFps} fps</b>, 5th percentile ${res.p5Fps} fps, ${res.triangles.toLocaleString()} triangles, ${res.drawCalls} draw calls. Target on the reference PC: 60 fps (High). See docs/PERFORMANCE.md.`;
  }

  renderControls() {
    const g = this.g, inp = g.input, s = inp.settings;
    const rows = Object.entries(ACTIONS).filter(([, v]) => !v.freeOnly).map(([k, v]) => `<tr><td>${esc(v.label)}</td><td dir="rtl" class="he">${g.settings.hebrew ? esc(v.he) : ''}</td><td><span class="keycap" data-bind="${k}">${(s.keys[k] || []).map((c) => esc(keyLabel(c))).join(' / ') || '—'}</span></td></tr>`).join('');
    const pads = inp.gamepads();
    const axisRows = AXES.map((a) => `<div class="row">${a} <span class="keycap" data-axis="${a}">${s.joystick[a] && s.joystick[a].axis >= 0 ? 'axis ' + s.joystick[a].axis : 'not bound'}</span> invert <input type="checkbox" data-inv="${a}" ${s.joystick[a] && s.joystick[a].invert ? 'checked' : ''}></div>`).join('');
    $('controls-form').innerHTML = `<div class="form-grid">
      <fieldset><legend>KEYBOARD — click a key to rebind</legend><table class="keys">${rows}</table><button class="big-btn" id="keys-reset">Reset all controls to defaults</button></fieldset>
      <fieldset><legend>SENSITIVITY &amp; DEAD ZONE</legend>
        ${['pitch', 'roll', 'yaw'].map((a) => `<div class="row">${a} sensitivity <input type="range" min="0.2" max="1" step="0.05" value="${s.sensitivity[a]}" data-sens="${a}"></div><div class="row">${a} curve (expo) <input type="range" min="0" max="0.9" step="0.05" value="${s.expo[a]}" data-expo="${a}"></div>`).join('')}
        <div class="row">Dead zone <input type="range" min="0" max="0.3" step="0.01" value="${s.deadzone}" id="dz"></div>
        <div class="row">Invert pitch <input type="checkbox" id="inv-pitch" ${s.invertPitch ? 'checked' : ''}></div>
      </fieldset>
      <fieldset><legend>JOYSTICK / THROTTLE (non-standard devices)</legend>
        <div class="note">Detected: ${pads.length ? pads.map((p) => `${esc(p.id)} (${p.mapping || 'generic'})`).join('; ') : 'none — connect a device and press a button'}.<br>Standard gamepads work without setup. For flight sticks and throttles, click an axis then move the control.</div>
        ${axisRows}
      </fieldset></div>`;
    $('controls-form').querySelectorAll('[data-bind]').forEach((el) => el.onclick = () => {
      el.textContent = 'press a key…';
      inp.startBind(el.dataset.bind, () => this.renderControls());
    });
    $('controls-form').querySelectorAll('[data-axis]').forEach((el) => el.onclick = () => {
      el.textContent = 'move the axis…';
      inp.startBind('axis:' + el.dataset.axis, null);
      const t0 = performance.now();
      const poll = () => {
        const d = inp.detectAxis();
        if (d) { s.joystick[el.dataset.axis] = { axis: d.axis, invert: false }; s.joystick.index = d.pad; inp.binding = null; inp.save(); this.renderControls(); return; }
        if (performance.now() - t0 < 8000) requestAnimationFrame(poll); else { inp.binding = null; this.renderControls(); }
      };
      poll();
    });
    $('controls-form').querySelectorAll('[data-inv]').forEach((el) => el.onchange = () => { const a = el.dataset.inv; s.joystick[a] = s.joystick[a] || { axis: -1 }; s.joystick[a].invert = el.checked; inp.save(); });
    $('controls-form').querySelectorAll('[data-sens]').forEach((el) => el.oninput = () => { s.sensitivity[el.dataset.sens] = +el.value; inp.save(); });
    $('controls-form').querySelectorAll('[data-expo]').forEach((el) => el.oninput = () => { s.expo[el.dataset.expo] = +el.value; inp.save(); });
    $('dz').oninput = (e) => { s.deadzone = +e.target.value; inp.save(); };
    $('inv-pitch').onchange = (e) => { s.invertPitch = e.target.checked; inp.save(); };
    $('keys-reset').onclick = () => inp.resetDefaults();
  }

  renderAbout() {
    const g = this.g;
    const regions = g.world.catalog.regions.map((r) => `<tr><td><b>${esc(r.name)}</b><br><span class="tier ${r.tier}">${r.tier === 'A' ? 'Detailed' : 'Regional'}</span></td><td>${esc(r.airports.map((a) => a.icao).join(', '))}</td><td>${r.stats.buildings.toLocaleString()} buildings (${r.stats.buildingHeightsMeasuredPct}% measured heights), ${r.stats.roads.toLocaleString()} roads, ${r.stats.trees.toLocaleString()} mapped trees · ${r.stats.sizeMB} MB</td></tr>`).join('');
    $('about').innerHTML = `
      <h2>GLOBAL SKIES: Infinite Horizon</h2>
      <p>An ORION GAMES production. <i>Where vision becomes reality.</i></p>
      <p><b>Developed by ALON NOVITARGER. All Rights Reserved.</b> © 2026 ALON NOVITARGER. Lead developer and IP owner: ALON NOVITARGER.</p>
      <p>Version 2.0. The flight model, aircraft systems, autopilot, runway control and AI traffic are written in C++ and run in the browser as WebAssembly; rendering, world streaming and the interface use WebGL 2 (three.js).</p>
      <h2>What is real and what is reconstructed</h2>
      <table><tr><th>Place</th><th>Airports</th><th>Real data used</th></tr>${regions}${(g.world.catalog.planned || []).map((r) => `<tr><td><b>${esc(r.name)}</b><br><span class="tier dev">${r.status}</span></td><td>${r.anchor.icao}</td><td>Flyable now at the global tier (real runways, streamed terrain). Detailed city data: ${r.status === 'in development' ? 'next region in the data pipeline' : 'on the roadmap'}.</td></tr>`).join('')}</table>
      <p class="note">Everywhere else (${this.rows.length.toLocaleString()} airports): runways at their real coordinates, headings, lengths and widths; terrain from online elevation tiles when reachable (cached locally) or a coarse built-in global layer; generic taxiway, apron, terminal and tower; no city buildings. Building heights without data are estimated from footprint and type. Statue of Liberty and suspension-bridge towers/cables are hand-built approximations from public dimensions.</p>
      <h2>Data sources and licences</h2>
      <ul>
        <li>Buildings, roads, rail, water, land use, land cover, airport taxiways, aprons and gates: <b>Overture Maps Foundation</b> (release ${esc('2026-09-23.1')}), derived mainly from <b>© OpenStreetMap contributors</b> (ODbL) and ESA WorldCover (CC BY 4.0).</li>
        <li>Airports and runways: <b>OurAirports</b> (public domain).</li>
        <li>Elevation: <b>Terrain Tiles on AWS</b> (Mapzen/Tilezen, sources incl. SRTM, USGS 3DEP, GMTED, ETOPO1 — attribution per their terms).</li>
        <li>Coastlines for the global layer: <b>Natural Earth</b> (public domain).</li>
        <li>3D engine: three.js (MIT). Fonts: Exo 2, Heebo, Cinzel, Montserrat, Great Vibes (SIL OFL) via Google Fonts. Music and sound effects: original, synthesised in the game.</li>
      </ul>
      <p class="note">Aircraft: the "Skylark T1" is an original design calibrated to the performance class of a 180 hp four-seat trainer; it is not a licensed replica. Real aircraft names (e.g. Boeing 737/787, F-16, F/A-18) are trademarks of their owners and will only be used with appropriate rights; until then the roadmap uses generic class names. Radio frequencies are for simulation only.</p>
      <h2>Performance</h2>
      <p class="note">Reference PC: 6-core desktop CPU (e.g. Intel i5-12400 / Ryzen 5 5600), 16 GB RAM, NVIDIA RTX 3060-class GPU, Chrome, 1920×1080. Targets: 60 fps on the High preset at JFK/Manhattan; 30 fps on Low with integrated graphics. Use Settings → Run benchmark to measure your machine.</p>`;
  }
}
