// GLOBAL SKIES: Infinite Horizon (ORION GAMES). Game orchestrator.
// Developed by ALON NOVITARGER. All Rights Reserved.
import * as THREE from 'three';
import { loadCore } from './core/core.js';
import { World } from './world/world.js';
import { PRESETS } from './world/weather.js';
import { PlayerAircraft } from './sim/player.js';
import { CameraRig, VIEWS, VIEW_NAMES } from './camera/cameras.js';
import { Input } from './input/input.js';
import { AudioEngine } from './audio/audio.js';
import { ATC } from './sim/atc.js';
import { TrafficView, Vehicles } from './sim/traffic.js';
import { MISSIONS, MissionRuntime, Scorer } from './sim/missions.js';
import { Hud } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { Intro } from './ui/intro.js';
import { loadEmblem, lockup, gameTitle, badge } from './ui/brand.js';
import { haversine } from './world/geo.js';
import { OskIn } from './core/layout.js';
import { fleetEntry, displayName, FLEET_OPTIONS } from './aircraft/fleet.js';
import { DamageFX } from './aircraft/fx.js';
import { Windshield } from './ui/windshield.js';
import { SkyEnvironment } from './world/envmap.js';
import { EnrouteTraffic } from './sim/enroute.js';
import { CloudSave } from './net/cloud.js';

const D2R = Math.PI / 180;
const $ = (id) => document.getElementById(id);

import { QUALITY } from './config.js';

class Events {
  constructor() { this.h = {}; }
  on(k, f) { (this.h[k] || (this.h[k] = [])).push(f); }
  emit(k, v) { (this.h[k] || []).forEach((f) => f(v)); }
}

class Game {
  constructor() {
    this.events = new Events();
    this.state = 'boot';
    this.paused = false;
    this.settings = Object.assign({
      quality: 'high', trafficDensity: null, carDensity: null, atcVoice: true, hebrew: false, hud: true, online: true,
      volume: 0.8, music: 0.7, intro: true, mode: 'accessible', units: 'aviation', aircraft: 0, realNames: true, dock: true,
    }, this._loadSettings());
    // v2.1: real aircraft type names are shown by default (older saves stored false)
    if (!this.settings.v21) { this.settings.realNames = true; this.settings.v21 = true; }
    FLEET_OPTIONS.realNames = !!this.settings.realNames;
    this.cloud = new CloudSave(this.settings);
    this.audio = new AudioEngine();  // created early: the intro plays music before the world has loaded
    this.fps = { frames: 0, t: 0, value: 0, hist: [] };
  }

  _loadSettings() { try { return JSON.parse(localStorage.getItem('globalskies.settings') || '{}'); } catch { return {}; } }
  saveSettings() { try { localStorage.setItem('globalskies.settings', JSON.stringify(this.settings)); } catch { /* ignore */ } }

  progress(msg, frac) {
    $('progress-text').textContent = msg;
    if (frac !== undefined) $('progress-bar').style.width = `${Math.round(frac * 100)}%`;
  }

  async boot() {
    await loadEmblem();
    $('loading-brand').append(lockup({ slogan: true }), gameTitle());
    $('menu-brand').append(badge(), gameTitle('menu'));
    this.progress('Starting renderer', 0.05);
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // PBR objects (aircraft, cockpit) use filmic tone mapping; the world's own
    // shaders tone-map themselves and are unaffected
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    $('view').appendChild(renderer.domElement);
    this.renderer = renderer;
    this.applyQuality(false);
    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.05, 400000);
    addEventListener('resize', () => {
      renderer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      if (this.menu) this.menu.resize();
    });
    this.progress('Loading flight core (C++ / WebAssembly)', 0.12);
    this.core = await loadCore('./wasm/');
    this.progress('Loading world data', 0.2);
    this.world = new World(renderer, { dataBase: './data/', online: this.settings.online });
    await this.world.init((m) => this.progress(m, 0.4));
    this.progress('Preparing aircraft', 0.7);
    this.env = new SkyEnvironment(renderer, this.world.scene);
    this.world.sky.hemiK = 0.45;   // image-based light from the sky replaces most of the hemisphere fill
    this.setupSunShadow();
    this.player = new PlayerAircraft(this.core, this.world);
    this.fx = new DamageFX(this.world);
    this.windshield = new Windshield($('windshield'));
    this.enroute = new EnrouteTraffic(this);
    this.world.weather.onThunder = (delay, k) => this.audio.thunder(delay, k);
    this.player.root.visible = false;
    this.rig = new CameraRig(this.camera, this.world);
    this.input = new Input(renderer.domElement);
    this.atc = new ATC(this);
    this.traffic = new TrafficView(this);
    this.vehicles = new Vehicles(this.world);
    this.hud = new Hud(this);
    this.menu = new Menu(this);
    this.raycaster = new THREE.Raycaster();
    this.guides = new THREE.Group();
    this.world.scene.add(this.guides);
    this.world.towerNear = (x, y) => this.towerNear(x, y);
    await this.menu.init();
    this.progress('Ready', 1);
    $('loading').classList.remove('show');
    this.showMenu();
    this.last = performance.now();
    renderer.setAnimationLoop(() => this.frame());
    window.__game = this;
    window.__ready = true;
  }

  applyQuality(rebuild = true) {
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    this.q = q;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2) * q.pixelRatio);
    this.renderer.shadowMap.enabled = (q.shadows || 0) > 0;
    if (this.world && this.world.sky) {
      const L = this.world.sky.sunLight;
      if (q.shadows && L.shadow.mapSize.x !== q.shadows) { L.shadow.mapSize.set(q.shadows, q.shadows); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } }
    }
    if (!this.world) return;
    this.world.terrain.setQuality(q.terrain, q.view);
    for (const r of this.world.regions) Object.assign(r.settings, { nearKm: q.near, midKm: q.mid, farKm: q.far, trees: q.trees });
    this.world.weather.clouds.quality = q.clouds;
    this.core.tfcSetDensity(this.settings.trafficDensity ?? q.traffic, 0);
    this.vehicles.setDensity(this.settings.carDensity ?? q.cars);
    this.camera.far = Math.max(60000, q.view * 1.6);
    this.camera.updateProjectionMatrix();
    if (this.world.lightMaterial) this.world.lightMaterial.uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
    void rebuild;
  }

  // ---------------------------------------------------------------------
  showMenu() {
    this.state = 'menu';
    if (this.windshield) this.windshield.update(0, false, 0, 0, false);
    if (this.world) this.world.shared.uFlash.value = 0;
    $('menu').classList.add('show');
    $('hud').classList.add('hidden');
    ['pause', 'debrief', 'help'].forEach((id) => $(id).classList.add('hidden'));
    this.audio.setPaused(true);
    this.menu.show();
    if (this.music && !this.introRunning && (this.settings.music ?? 0.7) > 0) { this.music.resume(this.settings.music); this.music.startAmbient(); }
  }

  // Opening sequence (logo, music, title); also replayable from the About tab.
  async playIntro(gate = true) {
    if (this.introRunning) return;
    this.introRunning = true;
    if (this.music) this.music.stopAll(0.3);
    try { await new Intro(this).run({ gate }); } finally { this.introRunning = false; }
  }

  // spec: { icao?, lat?, lon?, start, mode, hour, weather, missionId?, dest?, save? }
  async startFlight(spec) {
    this.state = 'loading';
    if (this.music) this.music.stopAll(1.2);
    $('menu').classList.remove('show');
    $('loading').classList.add('show');
    this.audio.start();
    this.audio.setPaused(false);
    try {
      this.spec = spec;
      this.mission = null;
      this.traffic.clear();
      this.vehicles.clear();
      this.clearGuides();
      this.atc.log.length = 0;
      this.atc.violations.length = 0;
      this.progress('Loading place', 0.1);
      await this.world.loadPlace({ icao: spec.icao, lat: spec.lat, lon: spec.lon }, (m) => this.progress(m, 0.4));
      this.applyQuality();
      // weather & time
      this.world.weather.set(PRESETS[spec.weather] || PRESETS.clear);
      this.setTime(spec.hour);
      // airport for ATC/traffic: nearest one to the start
      const ap = this.nearestAirport(spec.icao);
      this.airport = ap;
      this.atc.setAirport(ap);
      if (ap) {
        ap.loadTraffic(this.core);
        this.atc.selectRunway();
        this.traffic.attach(ap);
        this.core.tfcSetDensity(this.settings.trafficDensity ?? this.q.traffic, 4242);
      }
      // aircraft
      this.player.root.visible = true;
      this.player.simMode = (spec.mode || this.settings.mode) === 'simulation';
      const def = spec.missionId ? MISSIONS.find((m) => m.id === spec.missionId) : null;
      if (def && def.runway && ap) this.atc.forceRunway(def.runway);
      const acId = spec.save && spec.save.aircraft !== undefined ? spec.save.aircraft : (def && def.aircraft !== undefined ? def.aircraft : (spec.aircraft ?? this.settings.aircraft ?? 0));
      const fl = fleetEntry(acId);
      const start = spec.save ? this.startFromSave(spec.save) : this.computeStart(spec.start, ap, fl);
      start.aircraft = fl.id;
      // starts far from the region anchor (e.g. Burbank, Newark): move the
      // floating origin there first and load its terrain behind the loading
      // screen, instead of re-basing under a parked aircraft on frame one
      const moved = await this.recenterOn(start.x, start.y);
      if (moved) { start.x = moved.x; start.y = moved.y; }
      if (def && def.pax && fl.id === 0) start.payload = [80, 75 * def.pax, 10];
      this.progress('Engine & systems', 0.8);
      this.player.spawn(start);
      this.fx.reset();
      this.enroute.reset();
      if (start.runway && ap) this.atc.startOnRunway();
      if (spec.save && spec.save.sw) Object.assign(this.player.sw, spec.save.sw);
      this.missionDef = def;
      this.mission = new MissionRuntime(this, def);
      this.scorer = new Scorer(this, def);
      if (def && def.waypoints) this.updateRouteGuide();
      if (spec.dest) this.setDestination(spec.dest);
      this.rig.setView(start.onGround ? 'cockpit' : 'chase', this.player);
      this.simTime = 0;
      this.crashShown = false;
      $('loading').classList.remove('show');
      $('hud').classList.remove('hidden');
      this.hud.start();
      this.state = 'flight';
      this.paused = false;
      this.toast(`${this.world.status.place}`, '');
      if (this.world.placeTier === 'G') this.toast('Global tier: real runways, generic surroundings. Terrain: ' + this.world.terrainProvider.status(), '');
    } catch (e) {
      console.error(e);
      this.progress('Error: ' + e.message, 1);
      setTimeout(() => { $('loading').classList.remove('show'); this.showMenu(); }, 4000);
    }
  }

  // Sun shadows for the player's aircraft only (self-shadowing: wings on the
  // fuselage, the cockpit frame on the panel); the ground keeps its soft blob.
  setupSunShadow() {
    const L = this.world.sky.sunLight;
    L.castShadow = true;
    L.shadow.mapSize.set(this.q.shadows || 1024, this.q.shadows || 1024);
    L.shadow.bias = -0.0004;
    L.shadow.camera.near = 1;
    this.renderer.shadowMap.enabled = (this.q.shadows || 0) > 0;
  }

  updateSunShadow() {
    const L = this.world.sky.sunLight, S = this.world.shared;
    const on = this.renderer.shadowMap.enabled && S.uNight.value < 0.6 && S.uSunDir.value.y > 0.03;
    L.castShadow = on;
    if (!on) return;
    const p = this.player, cockpit = this.rig.view === 'cockpit';
    const center = cockpit ? p.eyeWorld(this._shC || (this._shC = new THREE.Vector3())) : p.root.position;
    const ext = cockpit ? 2.2 : Math.max(3, p.size * 0.62);
    L.target.position.copy(center);
    L.position.copy(center).addScaledVector(S.uSunDir.value, ext * 3 + 20);
    L.target.updateMatrixWorld();
    const c = L.shadow.camera;
    if (c.right !== ext) {
      c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.far = ext * 6 + 40;
      c.updateProjectionMatrix();
      L.shadow.normalBias = ext * 0.004;
    }
  }

  // Move the world's floating origin to (x, y) when it is far from it, and
  // wait for the terrain around the new origin. Returns the point in the new
  // frame, or null when no move was needed.
  async recenterOn(x, y, limit = 15000) {
    const a = this.world.maybeRebase(x, y, limit);
    if (!a) return null;
    const ll = this.world.frame.toLatLon(0, 0);
    this.progress('Loading terrain', 0.75);
    await this.world._prefetchTerrain(ll.lat, ll.lon);
    this.world.terrain.invalidate();
    return { x: a.sx * x + a.tx, y: y + a.ty };
  }

  nearestAirport(icao) {
    const list = this.world.airports;
    if (!list.length) return null;
    return list.find((a) => a.icao === icao) || list[0];
  }

  computeStart(type, ap, f = fleetEntry(0)) {
    const jet = f.style !== 'trainer' && f.style !== 'aerobatic';
    const fighter = f.cat === 'Fighter';
    if (!ap) return { x: 0, y: 0, hdgDeg: 0, onGround: false, altM: jet ? 3000 : 600, iasKt: jet ? (fighter ? 350 : 250) : 100 };
    const w = {};
    if (type === 'stand' || !type) {
      let st = (ap.data.stands || [])[0] || (ap.data.gates || [])[0];
      if (!st) {
        const n = ap.data.graph.nodes.find((nn) => nn[2] === 0) || [ap.rw[0].le.x + 200, ap.rw[0].le.y, 0];
        st = { x: n[0], y: n[1], hdg: ap.rw[0].hdgT };
      }
      ap.owner.toWorld(st.x, st.y, w);
      return { x: w.x, y: w.y, hdgDeg: st.hdg, onGround: true, engine: false };
    }
    const end = this.atc.activeEnd;
    const r = ap.rw[end.rw];
    const ux = end.dir === 0 ? r.ux : -r.ux, uy = end.dir === 0 ? r.uy : -r.uy;
    if (type === 'runway') {
      ap.owner.toWorld(end.tx + ux * 25, end.ty + uy * 25, w);
      return { x: w.x, y: w.y, hdgDeg: end.hdgTrue, onGround: true, engine: true, runway: true };
    }
    if (type === 'cruise') {
      // 40 km out, at the type's cruise level, Mach / speed (TAS for the core, IAS for the A/T)
      ap.owner.toWorld(end.tx - ux * 40000, end.ty - uy * 40000, w);
      const ft = f.cruise.ft, altM = ap.elev + ft * 0.3048;
      const T = 288.15 - 0.0065 * Math.min(altM, 11000), a = Math.sqrt(1.4 * 287.05 * T);
      const sigma = Math.pow(T / 288.15, 4.256) * (altM > 11000 ? Math.exp(-(altM - 11000) / 6341.6) : 1);
      const tasKt = f.cruise.mach ? f.cruise.mach * a / 0.514444 : f.cruise.kt / Math.sqrt(sigma);
      return { x: w.x, y: w.y, hdgDeg: end.hdgTrue, onGround: false, altM, iasKt: tasKt, atKt: Math.round(tasKt * Math.sqrt(sigma)), flaps: 0 };
    }
    if (type === 'airHigh') {
      ap.owner.toWorld(end.tx - ux * 6000, end.ty - uy * 6000, w);
      return { x: w.x, y: w.y, hdgDeg: end.hdgTrue, onGround: false, altM: ap.elev + (jet ? 1200 : 900), iasKt: jet ? (fighter ? 300 : 220) : 100, flaps: 0 };
    }
    // 5 nm final on a 3 degree path (jets: 8 nm, landing configuration)
    const d = jet ? 15000 : 9000;
    ap.owner.toWorld(end.tx - ux * d, end.ty - uy * d, w);
    if (jet) return { x: w.x, y: w.y, hdgDeg: end.hdgTrue, onGround: false, altM: end.z + d * Math.tan(3 * D2R) + 15, iasKt: f.vref + 5, flaps: f.flaps.length - 1, gearDown: true };
    return { x: w.x, y: w.y, hdgDeg: end.hdgTrue, onGround: false, altM: end.z + d * Math.tan(3 * D2R) + 15, iasKt: f.id === 13 ? 90 : 80, flaps: f.id === 0 ? 1 : 0 };
  }

  startFromSave(s) {
    const p = this.world.frame.toXY(s.lat, s.lon);
    return { x: p.x, y: p.y, hdgDeg: s.hdg, onGround: s.onGround, altM: s.alt, iasKt: s.ias, engine: true, fuel: s.fuel, aircraft: s.aircraft, gearDown: s.gearDown, flaps: s.sw ? s.sw.flaps : 0 };
  }

  setTime(hour) {
    const now = new Date();
    if (hour === 'now' || hour === undefined) { this.baseDate = now; return; }
    // approximate local solar time from longitude (no timezone database)
    const lon = this.world.frame.lon0;
    const utcHour = hour - lon / 15;
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    this.baseDate = new Date(d.getTime() + utcHour * 3600000);
  }
  date() { return new Date(this.baseDate.getTime() + (this.simTime || 0) * 1000); }
  simClock() { return this.simTime || 0; }
  atcSituation() { return this.atc.situation() || { onRw: -1, onFinal: false }; }

  // ---------------------------------------------------------------------
  frame() {
    const now = performance.now();
    let dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fps.frames++;
    this.fps.t += dt;
    if (this.fps.t >= 0.5) { this.fps.value = this.fps.frames / this.fps.t; this.fps.frames = 0; this.fps.t = 0; }
    if (this.state === 'menu') { this.menu.frame(dt); return; }
    if (this.qaFrozen && this.state === 'flight') { if (!this.qaDrawn) { this.render(); this.qaDrawn = true; } return; }  // QA screenshot freeze: one fresh frame, no sim
    if (this.state !== 'flight' || this.debugHold) return;  // debugHold: automated tests drive update/render themselves
    const input = this.input.poll(dt, this.rig.view === 'free' ? 'free' : 'flight');
    this.handleEvents(input);
    if (!this.paused) this.update(dt, input);
    this.render();
  }

  // One simulation/update step (everything except rendering).
  update(dt, input) {
    this.simTime += dt;
    const p = this.player, sw = p.sw;
    this.cockpitInteraction(input, dt);
    this.runAuto(dt);
    // levers from keys / joystick
    if (input.throttleAbs !== null) sw.throttle = input.throttleAbs;
    sw.throttle = Math.min(1, Math.max(0, sw.throttle + input.throttleDelta));
    if (input.mixtureAbs !== null) sw.mixture = input.mixtureAbs;
    sw.mixture = Math.min(1, Math.max(0, sw.mixture + input.mixtureDelta));
    const ctl = { pitch: input.pitch, roll: input.roll, yaw: input.yaw, brakeL: input.brakeL, brakeR: input.brakeR, trimRate: input.trimRate };
    if (this.rig.view === 'free') { ctl.pitch = 0; ctl.roll = 0; ctl.yaw = 0; }
    this.navUpdate();
    this.displayData(dt);
    p.update(dt, ctl);
    // floating origin
    const a = this.world.maybeRebase(p.o.x, p.o.y);
    if (a) {
      p.rebase(a);
      this.fx.rebase(a);
      this.enroute.rebase(a);
      if (this.rig.free) { this.rig.free.pos.x = a.sx * this.rig.free.pos.x + a.tx; this.rig.free.pos.z -= a.ty; }
      this.rig.first = true;
      this.updateRouteGuide();
    }
    this.atc.update(dt);
    const camThree = this.camera.position;
    this.traffic.update(dt, camThree);
    this.mission.update(dt);
    this.scorer.update(dt);
    this.rig.update(dt, p, input);
    const camWorld = this.rig.worldPos();
    this.vehicles.update(dt, camWorld);
    this.world.update(dt, this.camera, camWorld, this.date());
    this.env.update(dt, this.world.sky, this.world.shared, this.world.urbanGlow || 0);
    this.updateSunShadow();
    const toCam = camThree.clone().sub(p.root.position);
    const dist = toCam.length();
    const closing = dist > 1 ? new THREE.Vector3(p.o.ve, p.o.vu, -p.o.vn).dot(toCam.normalize()) : 0;
    p.ui.gpws = this.audio.update(dt, p.o, sw, this.rig.view, { dist, closing }, this.traffic.agents, p.fleet) || '';
    this.enroute.update(dt);
    this.fx.update(dt, p, this.camera, this.renderer);
    const inCockpit = this.rig.view === 'cockpit' && !this.paused;
    this.windshield.update(dt, inCockpit, this.world.weather.rainAt(p.o.z), p.o.ias / 0.514444, p.isJet, inCockpit ? this.windowClip() : null);
    this.hud.update(dt);
    if (p.o.crashed && !this.crashShown) {
      this.crashShown = true;
      this.toast('CRASH — press Esc for the debrief or restart', 'bad');
      setTimeout(() => { if (this.state === 'flight') this.endFlight(); }, 4500);
    }
    this.autosave(dt);
  }

  // Screen-space outlines of the cockpit's window openings (CSS px) so rain
  // stays on the glass; null when the cockpit defines none or a window is behind the eye.
  windowClip() {
    const ck = this.player.cockpit;
    if (!ck || !ck.windowPolys) return null;
    // fresh matrices: this runs before the frame is rendered
    ck.group.updateWorldMatrix(true, false);
    this.camera.updateMatrixWorld();
    const v = this._clipV || (this._clipV = new THREE.Vector3());
    const out = [];
    for (const poly of ck.windowPolys) {
      const pts = [];
      let ok = true;
      for (const q of poly) {
        v.set(q[0], q[1], q[2]).applyMatrix4(ck.group.matrixWorld).project(this.camera);
        if (v.z > 1) { ok = false; break; }
        pts.push([(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]);
      }
      if (ok) out.push(pts);
    }
    return out.length ? out : null;
  }

  // Data the glass cockpit shows besides the core outputs (route, TCAS traffic)
  displayData(dt) {
    const p = this.player, ui = p.ui;
    ui.atOn = p.sw.at;
    ui.nav = this.nav;
    ui.magVar = this.world.magVar || 0;
    this._tcasT = (this._tcasT || 0) - dt;
    if (this._tcasT <= 0 && p.isJet) {
      this._tcasT = 0.5;
      ui.traffic = this.traffic.agents.filter((a) => a.z !== undefined).concat(this.enroute.list()).map((a) => {
        const dx = a.x - p.o.x, dy = a.y - p.o.y;
        return { brg: ((Math.atan2(dx, dy) / D2R - ui.magVar) + 360) % 360, distNm: Math.hypot(dx, dy) / 1852, dAltFt: (a.z - p.o.z) / 0.3048 };
      }).filter((t) => t.distNm < 40);
    }
  }

  blankInput() {
    return { pitch: 0, roll: 0, yaw: 0, brakeL: 0, brakeR: 0, trimRate: 0, throttleDelta: 0, mixtureDelta: 0, throttleAbs: null, mixtureAbs: null,
      events: [], lookDX: 0, lookDY: 0, wheel: 0, freeMove: { x: 0, y: 0, z: 0 }, fast: false, resetLook: false, hat: { x: 0, y: 0 },
      click: null, mouse: { x: 0, y: 0, drag: false, button: -1 }, digits: [], gamepad: false };
  }

  // Automated testing: advance n fixed steps without rendering; an optional
  // controller(input, game) fills pilot inputs (scripted test pilot).
  debugStep(dt, n, controller) {
    for (let i = 0; i < n && this.state === 'flight'; i++) {
      const input = this.blankInput();
      if (controller) controller(input, this);
      this.handleEvents(input);
      this.update(dt, input);
    }
    return this.player.o;
  }

  render() {
    this.renderer.render(this.world.scene, this.camera);
  }

  // ---------------------------------------------------------------------
  handleEvents(input) {
    const p = this.player, sw = p.sw;
    if (this.hud.atcOpen && input.digits.length) {
      this.hud.atcSelect(input.digits[0] - 1);
      input.events = input.events.filter((e) => !/^view[1-6]$/.test(e));
    }
    for (const ev of input.events) {
      switch (ev) {
        case 'menu':
          if (this.hud.atcOpen) this.hud.toggleAtc(false);
          else if (!$('help').classList.contains('hidden')) $('help').classList.add('hidden');
          else this.setPaused(!this.paused);
          break;
        case 'pause': this.setPaused(!this.paused); break;
        case 'view1': case 'view2': case 'view3': case 'view4': case 'view5': case 'view6':
          this.rig.setView(VIEWS[+ev.slice(4) - 1], p);
          if (this.mission) this.mission.viewsSeen.add(this.rig.view);
          this.toast(VIEW_NAMES[this.rig.view]);
          break;
        case 'viewNext': this.rig.next(p, 1); this.mission && this.mission.viewsSeen.add(this.rig.view); this.toast(VIEW_NAMES[this.rig.view]); break;
        case 'viewPrev': this.rig.next(p, -1); this.toast(VIEW_NAMES[this.rig.view]); break;
        case 'parkBrake': sw.parkBrake = !sw.parkBrake; this.audio.oneShot('click'); this.toast(sw.parkBrake ? 'Parking brake SET' : 'Parking brake RELEASED'); break;
        case 'flapsDown': sw.flaps = Math.min(p.fleet.flaps.length - 1, sw.flaps + 1); this.toast(`Flaps ${p.fleet.flaps[sw.flaps]}`); break;
        case 'flapsUp': sw.flaps = Math.max(0, sw.flaps - 1); this.toast(`Flaps ${p.fleet.flaps[sw.flaps]}`); break;
        case 'gear':
          if (!p.fleet.gearRetract) { this.toast('Fixed landing gear'); break; }
          sw.gear = !sw.gear; this.audio.oneShot('click'); this.toast(sw.gear ? 'Gear DOWN' : 'Gear UP'); break;
        case 'speedbrake':
          if (!p.isJet) break;
          sw.speedbrake = sw.speedbrake > 0.05 ? 0 : (p.fleet.cat === 'Fighter' ? 1 : 0.6); this.toast(sw.speedbrake ? 'Speed brake EXTENDED' : 'Speed brake RETRACTED'); break;
        case 'spoilerArm': if (p.isJet) { sw.spoilerArm = !sw.spoilerArm; this.toast(sw.spoilerArm ? 'Ground spoilers ARMED' : 'Ground spoilers DISARMED'); } break;
        case 'reverse': if (p.isJet && p.fleet.cat === 'Airliner') { sw.reverse = !sw.reverse; this.toast(sw.reverse ? 'Reverse thrust' : 'Reverse stowed'); } break;
        case 'autothrottle':
          if (!p.isJet) break;
          sw.at = !sw.at; if (sw.at && p.o.ias > 30) p.ui.atSpdKt = Math.round(p.o.ias / 0.514444); this.toast(sw.at ? `Autothrottle ON ${p.ui.atSpdKt} kt` : 'Autothrottle OFF'); break;
        case 'atSpdUp': p.ui.atSpdKt = (p.ui.atSpdKt || 0) + 5; this.toast(`Speed ${p.ui.atSpdKt} kt`); break;
        case 'atSpdDown': p.ui.atSpdKt = Math.max(100, (p.ui.atSpdKt || 0) - 5); this.toast(`Speed ${p.ui.atSpdKt} kt`); break;
        case 'fireHandle': {
          const m = p.o.fireMask | 0;
          if (m) { sw.fireHandles = (sw.fireHandles | 0) | m; this.toast('Fire handle pulled: fuel off, bottle discharged', 'bad'); }
          else this.toast('No engine fire');
          break;
        }
        case 'autoStart': this.autoStartStop(); break;
        case 'apToggle': sw.apMaster = !sw.apMaster; if (sw.apMaster) { p.ui.apAltFt = Math.round(p.o.indAlt / 0.3048 / 100) * 100; p.ui.hdgBug = p.o.hi; p.ui.hdgBugDeg = p.o.hi / D2R; } this.toast(sw.apMaster ? 'Autopilot ON' : 'Autopilot OFF'); break;
        case 'apHdg': sw.apLat = sw.apLat === 1 ? 0 : 1; this.toast(`AP lateral: ${['ROL', 'HDG', 'NAV'][sw.apLat]}`); break;
        case 'apAlt': sw.apVert = sw.apVert === 1 ? 0 : 1; if (sw.apVert === 1) p.ui.apAltFt = Math.round(p.o.indAlt / 0.3048 / 100) * 100; else p.ui.apVsFpm = Math.round(p.o.vs / 0.00508 / 100) * 100; this.toast(`AP vertical: ${['VS', 'ALT'][sw.apVert]}`); break;
        case 'hdgBugLeft': this.bumpHdg(-5); break;
        case 'hdgBugRight': this.bumpHdg(5); break;
        case 'apAltDown': p.ui.apAltFt -= 100; if (sw.apVert === 0) p.ui.apVsFpm -= 100; break;
        case 'apAltUp': p.ui.apAltFt += 100; if (sw.apVert === 0) p.ui.apVsFpm += 100; break;
        case 'landingLight': sw.landing = !sw.landing; this.audio.oneShot('click'); this.toast(`Landing light ${sw.landing ? 'ON' : 'OFF'}`); break;
        case 'extLights': { const on = !(sw.nav && sw.beacon && sw.strobe); sw.nav = sw.beacon = sw.strobe = on; this.audio.oneShot('click'); this.toast(`Nav/beacon/strobe ${on ? 'ON' : 'OFF'}`); break; }
        case 'atc': this.hud.toggleAtc(); break;
        case 'hud': this.settings.hud = !this.settings.hud; this.hud.applyVisibility(); break;
        case 'map': this.hud.toggleMap(); break;
        case 'checklist': this.hud.toggleChecklist(); break;
        case 'save': this.saveNow(); break;
        case 'help': this.hud.showHelp(); break;
        case 'diag': this.settings.diag = !this.settings.diag; break;
        default: break;
      }
    }
  }

  bumpHdg(d) {
    const p = this.player;
    p.ui.hdgBugDeg = ((Math.round(p.ui.hdgBug / D2R) + d) % 360 + 360) % 360;
    p.ui.hdgBug = p.ui.hdgBugDeg * D2R;
  }

  setPaused(on) {
    this.paused = on;
    this.core.setPaused(on);
    this.audio.setPaused(on);
    $('pause').classList.toggle('hidden', !on);
  }

  // ---------------------------------------------------------------------
  // Mouse interaction with cockpit controls
  cockpitInteraction(input, dt) {
    const tip = $('tooltip');
    if (this.rig.view !== 'cockpit') { tip.classList.add('hidden'); this.hoverObj = null; return; }
    const ndc = new THREE.Vector2((input.mouse.x / innerWidth) * 2 - 1, -(input.mouse.y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.player.cockpit.interactives, false);
    const h = hits[0] && hits[0].distance < 1.5 ? hits[0] : null;
    const p = this.player, sw = p.sw;
    if (h) {
      const ud = h.object.userData;
      this.hoverIndex = ud.index | 0;
      tip.textContent = `${ud.label}${this._ctlValue(ud.action)}`;
      tip.style.left = `${input.mouse.x + 14}px`;
      tip.style.top = `${input.mouse.y + 10}px`;
      tip.classList.remove('hidden');
      // wheel over controls
      if (input.wheel) {
        const d = -Math.sign(input.wheel);
        input.wheel = 0; // consume (no zoom)
        this._wheelControl(ud.action, d);
      }
    } else {
      tip.classList.add('hidden');
    }
    // dragging levers
    if (input.mouse.drag && input.mouse.button === 0 && (this.dragging || (h && ['throttle', 'mixture', 'trim', 'speedbrake'].includes(h.object.userData.action)))) {
      if (!this.dragging) this.dragging = h.object.userData.action;
      const dv = -input.lookDY * 0.004;
      if (this.dragging === 'throttle') { sw.throttle = Math.min(1, Math.max(0, sw.throttle + dv)); if (sw.at && Math.abs(dv) > 0.02) sw.at = false; }
      if (this.dragging === 'speedbrake') sw.speedbrake = Math.min(1, Math.max(0, (sw.speedbrake || 0) - dv));
      if (this.dragging === 'mixture') sw.mixture = Math.min(1, Math.max(0, sw.mixture + dv));
      if (this.dragging === 'trim') this.core.setTrim(p.o.trim + dv * 0.5);
      input.lookDX = input.lookDY = 0; // don't move the view while dragging a lever
    } else {
      this.dragging = null;
    }
    // ignition START is held with the right button on the key
    if (input.mouse.drag && input.mouse.button === 2 && h && h.object.userData.action === 'mags') { sw.mags = 4; this.holdingStart = true; input.lookDX = input.lookDY = 0; }
    else if (this.holdingStart && !input.mouse.drag) { this.holdingStart = false; sw.mags = 3; }
    if (input.click && h) {
      const a = h.object.userData.action;
      this.audio.oneShot('click');
      switch (a) {
        case 'mags': if (input.click.button === 0) sw.mags = (sw.mags + 1) % 4; break;
        case 'fuelSelector': sw.fuelSelector = (sw.fuelSelector + 1) % 4; break;
        case 'parkBrake': sw.parkBrake = !sw.parkBrake; break;
        case 'flaps': { const upper = h.point.y > h.object.getWorldPosition(new THREE.Vector3()).y; sw.flaps = Math.max(0, Math.min(p.fleet.flaps.length - 1, sw.flaps + (upper ? -1 : 1))); break; }
        case 'ap': sw.apMaster = !sw.apMaster; if (sw.apMaster) { p.ui.apAltFt = Math.round(p.o.indAlt / 0.3048 / 100) * 100; } break;
        case 'apHdg': sw.apLat = sw.apLat === 1 ? 0 : 1; break;
        case 'apNav': sw.apLat = sw.apLat === 2 ? 0 : 2; break;
        case 'apAlt': sw.apVert = 1; p.ui.apAltFt = Math.round(p.o.indAlt / 0.3048 / 100) * 100; break;
        case 'apVs': sw.apVert = 0; p.ui.apVsFpm = Math.round(p.o.vs / 0.00508 / 100) * 100; break;
        case 'apUp': if (sw.apVert === 0) p.ui.apVsFpm += 100; else p.ui.apAltFt += 100; break;
        case 'apDn': if (sw.apVert === 0) p.ui.apVsFpm -= 100; else p.ui.apAltFt -= 100; break;
        case 'hdgBug': p.ui.hdgBug = p.o.hi; p.ui.hdgBugDeg = p.o.hi / D2R; break;
        case 'alignHI': this.core.alignHI(); break;
        case 'baro': p.ui.baroHpa = Math.round(this.world.weather.state.qnh); break;
        case 'comTune': this.hud.toggleAtc(true); break;
        case 'throttle': case 'mixture': case 'trim': break;
        case 'gear': if (p.fleet.gearRetract) sw.gear = !sw.gear; break;
        case 'jflaps': {
          if (p.fleet.cat === 'Fighter') { sw.flaps = (sw.flaps + 1) % p.fleet.flaps.length; break; }
          const fwd = h.point.z < h.object.getWorldPosition(new THREE.Vector3()).z;  // nearer the panel = retract
          sw.flaps = Math.max(0, Math.min(p.fleet.flaps.length - 1, sw.flaps + (fwd ? -1 : 1)));
          break;
        }
        case 'speedbrake':
          if (p.fleet.cat === 'Fighter') sw.speedbrake = sw.speedbrake > 0.05 ? 0 : 1;
          else if ((sw.speedbrake || 0) < 0.05) sw.spoilerArm = !sw.spoilerArm;
          else sw.speedbrake = 0;
          break;
        case 'reverse': sw.reverse = !sw.reverse; break;
        case 'at': sw.at = !sw.at; if (sw.at && p.o.ias > 30 && !p.ui.atSpdKt) p.ui.atSpdKt = Math.round(p.o.ias / 0.514444); break;
        case 'atSpd': p.ui.atSpdKt = Math.round(p.o.ias / 0.514444); break;
        case 'apAltKnob': p.ui.apAltFt = Math.round(p.o.indAlt / 0.3048 / 100) * 100; break;
        case 'ndRange': p.ui.ndRange = { 10: 20, 20: 40, 40: 80, 80: 160, 160: 10 }[p.ui.ndRange || 20]; break;
        case 'fire': sw.fireHandles = (sw.fireHandles | 0) ^ (1 << (h.object.userData.index | 0)); break;
        case 'fuelCtl': sw.mixture = sw.mixture > 0.5 ? 0 : 1; break;
        case 'engStart': sw.mags = sw.mags === 0 ? 3 : sw.mags === 3 ? 4 : 0; break;
        default:
          if (a in sw) sw[a] = !sw[a];
      }
    }
  }

  _ctlValue(a) {
    const sw = this.player.sw, o = this.player.o;
    if (a in sw && typeof sw[a] === 'boolean') return ` — ${sw[a] ? 'ON' : 'OFF'}`;
    if (a === 'throttle') return ` — ${Math.round(sw.throttle * 100)}%`;
    if (a === 'mixture') return ` — ${Math.round(sw.mixture * 100)}%`;
    if (a === 'mags') return ` — ${['OFF', 'R', 'L', 'BOTH', 'START'][sw.mags]}`;
    if (a === 'fuelSelector') return ` — ${['OFF', 'LEFT', 'BOTH', 'RIGHT'][sw.fuelSelector]}`;
    if (a === 'flaps' || a === 'jflaps') return ` — ${this.player.fleet.flaps[sw.flaps]}`;
    if (a === 'gear') return ` — ${sw.gear ? 'DOWN' : 'UP'}`;
    if (a === 'speedbrake') return ` — ${sw.speedbrake > 0.05 ? Math.round(sw.speedbrake * 100) + '%' : sw.spoilerArm ? 'ARMED' : 'DOWN'}`;
    if (a === 'reverse') return ` — ${sw.reverse ? 'REVERSE' : 'STOWED'}`;
    if (a === 'at') return ` — ${sw.at ? 'ON' : 'OFF'}`;
    if (a === 'atSpd') return ` — ${this.player.ui.atSpdKt || 0} kt`;
    if (a === 'apAltKnob') return ` — ${this.player.ui.apAltFt} ft`;
    if (a === 'ndRange') return ` — ${this.player.ui.ndRange || 20} nm`;
    if (a === 'fire') return ` — ${((sw.fireHandles | 0) >> (this.hoverIndex | 0)) & 1 ? 'PULLED' : 'IN'}`;
    if (a === 'fuelCtl') return ` — ${sw.mixture > 0.5 ? 'RUN' : 'CUTOFF'}`;
    if (a === 'engStart') return ` — ${{ 0: 'OFF', 3: 'NORM', 4: 'START' }[sw.mags] || sw.mags}`;
    if (a === 'trim') return ` — ${Math.round(o.trim * 100)}`;
    if (a === 'baro') return ` — ${this.player.ui.baroHpa} hPa`;
    if (a === 'hdgBug') return ` — ${String(Math.round(this.player.ui.hdgBugDeg)).padStart(3, '0')}°`;
    return '';
  }

  _wheelControl(a, d) {
    const p = this.player, sw = p.sw;
    if (a === 'throttle') sw.throttle = Math.min(1, Math.max(0, sw.throttle + d * 0.04));
    else if (a === 'mixture') sw.mixture = Math.min(1, Math.max(0, sw.mixture + d * 0.04));
    else if (a === 'trim') this.core.setTrim(p.o.trim + d * 0.03);
    else if (a === 'hdgBug') this.bumpHdg(d);
    else if (a === 'baro') p.ui.baroHpa += d;
    else if (a === 'apUp' || a === 'apDn') { if (sw.apVert === 0) p.ui.apVsFpm += d * 100; else p.ui.apAltFt += d * 100; }
    else if (a === 'atSpd') p.ui.atSpdKt = Math.max(100, (p.ui.atSpdKt || 0) + d);
    else if (a === 'apAltKnob') p.ui.apAltFt = Math.max(0, p.ui.apAltFt + d * (this.input.down.has('ShiftLeft') ? 1000 : 100));
    else if (a === 'ndRange') p.ui.ndRange = Math.max(10, Math.min(160, (p.ui.ndRange || 20) * (d > 0 ? 2 : 0.5)));
    else if (a === 'speedbrake') sw.speedbrake = Math.min(1, Math.max(0, (sw.speedbrake || 0) + d * 0.1));
  }

  // ---------------------------------------------------------------------
  // Auto start / shutdown: performs the actual switch sequence over time.
  autoStartStop() {
    const p = this.player, sw = p.sw;
    if (this.auto) return;
    const steps = [];
    const wait = (s) => steps.push({ t: s });
    const set = (k, v) => steps.push({ fn: () => { sw[k] = v; this.audio.oneShot('click'); } });
    if (p.isJet) {
      const all = (1 << p.fleet.engines) - 1;
      if ((p.o.engMask & all) !== all) {
        this.toast('Auto-start: battery, ignition START, fuel control RUN at 22 % N2');
        set('parkBrake', true); wait(0.4); set('battery', true); wait(0.4); set('avionics', true); set('beacon', true); wait(0.4);
        set('mixture', 0); set('throttle', 0); set('mags', 3); wait(0.4); set('mags', 4);
        steps.push({ fn: () => {}, until: () => p.o.n2Avg > 22, max: 40 });
        set('mixture', 1);
        steps.push({ fn: () => {}, until: () => (p.o.engMask & all) === all && p.o.n2Avg > 55, max: 60 });
        set('mags', 3); set('alternator', true); set('nav', true); wait(0.3);
      } else {
        this.toast('Auto-shutdown');
        set('throttle', 0); set('at', false); wait(0.6); set('landing', false); set('taxi', false); set('strobe', false); wait(0.4);
        set('mixture', 0);
        steps.push({ fn: () => {}, until: () => p.o.engMask === 0, max: 20 });
        set('mags', 0); set('alternator', false); set('beacon', false); set('nav', false); set('avionics', false); wait(0.3); set('battery', false); set('parkBrake', true);
      }
      this.auto = { steps, i: 0, t: 0 };
      return;
    }
    if (!p.o.engineRunning) {
      this.toast('Auto-start: running the start checklist');
      set('parkBrake', true); wait(0.4); set('battery', true); wait(0.4); set('beacon', true); wait(0.3);
      set('fuelSelector', 2); set('mixture', 1); set('throttle', 0.1); wait(0.4);
      if (p.simMode) { set('fuelPump', true); wait(3.2); set('fuelPump', false); wait(0.4); }
      steps.push({ fn: () => { sw.mags = 4; }, until: () => p.o.engineRunning > 0.5, max: 8 });
      set('mags', 3); wait(0.5); set('alternator', true); set('avionics', true); set('nav', true); wait(0.3); set('throttle', 0.08);
    } else {
      this.toast('Auto-shutdown');
      set('throttle', 0); wait(0.6); set('avionics', false); set('landing', false); set('taxi', false); set('strobe', false); wait(0.4);
      set('mixture', 0);
      steps.push({ fn: () => {}, until: () => p.o.rpm < 50, max: 12 });
      set('mags', 0); set('alternator', false); set('beacon', false); set('nav', false); wait(0.3); set('battery', false); set('parkBrake', true);
    }
    this.auto = { steps, i: 0, t: 0 };
  }

  runAuto(dt) {
    const A = this.auto;
    if (!A) return;
    const s = A.steps[A.i];
    if (!s) { this.auto = null; return; }
    A.t += dt;
    if (s.fn && !s.started) { s.fn(); s.started = true; }
    const doneWait = s.t !== undefined ? A.t >= s.t : true;
    const doneUntil = s.until ? s.until() || A.t > (s.max || 10) : true;
    if (doneWait && doneUntil) { A.i++; A.t = 0; }
  }

  // ---------------------------------------------------------------------
  // GPS navigation: destination or mission waypoints -> AP NAV inputs
  setDestination(code) {
    const row = this.world.airportIndex.get(code.toUpperCase()) || this.world.airportDb.rows.find((r) => r[1] === code.toUpperCase());
    if (!row) { this.toast(`Destination ${code} not found`, 'bad'); return; }
    this.dest = { name: `${row[0]} ${row[2]}`, lat: row[6], lon: row[7] };
    this.updateRouteGuide();
  }

  navTarget() {
    const wp = this.mission && this.mission.currentWaypoint();
    if (wp) return { lat: wp.lat, lon: wp.lon, name: wp.name };
    if (this.dest) return this.dest;
    return null;
  }

  navUpdate() {
    const t = this.navTarget(), core = this.core, p = this.player;
    const I = OskIn;
    if (!t) { core.in[I.IN_NAV_VALID] = 0; this.nav = null; return; }
    const ll = this.world.frame.toLatLon(p.o.x, p.o.y);
    const dist = haversine(ll.lat, ll.lon, t.lat, t.lon);
    const tp = this.world.frame.toXY(t.lat, t.lon);
    const brg = Math.atan2(tp.x - p.o.x, tp.y - p.o.y);
    core.in[I.IN_NAV_TRACK] = brg;
    core.in[I.IN_NAV_XTE] = 0;
    core.in[I.IN_NAV_VALID] = 1;
    this.nav = { name: t.name, distNm: dist / 1852, brgMag: ((brg / D2R - (this.world.magVar || 0)) % 360 + 360) % 360, eteMin: dist / Math.max(p.o.gs, 30) / 60 };
  }

  // ---------------------------------------------------------------------
  // Guidance visuals: taxi route ribbon, pattern rings, waypoint beacons
  clearGuides() {
    for (const c of [...this.guides.children]) { this.guides.remove(c); c.geometry && c.geometry.dispose(); }
    this.rings = null;
    this.routeMesh = null;
  }

  showRoute(route) {
    this.hideRoute();
    const ap = this.atc.airport;
    if (!ap || !route) return;
    const accessible = !this.player.simMode || this.settings.routeInSim;
    if (!accessible) return;
    const nodes = ap.data.graph.nodes;
    const pts = route.path.map((i) => { const w = ap.owner.toWorld(nodes[i][0], nodes[i][1], {}); return new THREE.Vector3(w.x, this.world.heightAt(w.x, w.y) + 0.35, -w.y); });
    const pos = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const d = b.clone().sub(a).normalize();
      const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.9);
      pos.push(pts[i].x - n.x, pts[i].y, pts[i].z - n.z, pts[i].x + n.x, pts[i].y, pts[i].z + n.z);
    }
    const idx = [];
    for (let i = 0; i < pts.length - 1; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x29ff6a, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 6;
    this.routeMesh = m;
    this.guides.add(m);
  }
  hideRoute() { if (this.routeMesh) { this.guides.remove(this.routeMesh); this.routeMesh.geometry.dispose(); this.routeMesh = null; } }

  showRings(points) {
    if (this.rings) for (const r of this.rings) this.guides.remove(r);
    this.rings = points.map((p, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(70, 4, 8, 32), new THREE.MeshBasicMaterial({ color: i === 0 ? 0xff38d0 : 0x9a3a8a, transparent: true, opacity: 0.8 }));
      ring.position.set(p.x, p.z, -p.y);
      const nxt = points[Math.min(points.length - 1, i + 1)];
      ring.lookAt(nxt.x, nxt.z, -nxt.y);
      if (i === points.length - 1) ring.lookAt(p.x + (p.x - points[i - 1].x), p.z, -(p.y + (p.y - points[i - 1].y)));
      this.guides.add(ring);
      return ring;
    });
  }
  highlightRing(i) {
    if (!this.rings) return;
    this.rings.forEach((r, k) => { r.material.color.setHex(k === i ? 0xff38d0 : 0x9a3a8a); r.visible = k >= i; });
  }

  updateRouteGuide() {
    if (this.wpMarkers) for (const m of this.wpMarkers) this.guides.remove(m);
    this.wpMarkers = [];
    const list = this.missionDef && this.missionDef.waypoints ? this.missionDef.waypoints.slice(this.mission ? this.mission.wpIndex : 0) : [];
    list.forEach((wp, i) => {
      const p = this.world.frame.toXY(wp.lat, wp.lon);
      const z = wp.altFt ? (wp.altFt[0] + wp.altFt[1]) / 2 * 0.3048 : 400;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, z, 8, 1, true), new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffb000 : 0x8a6a20, transparent: true, opacity: 0.35, depthWrite: false }));
      col.position.set(p.x, z / 2, -p.y);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(wp.r * 0.25, 6, 8, 40), new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffb000 : 0x8a6a20, transparent: true, opacity: 0.7 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(p.x, z, -p.y);
      this.guides.add(col, ring);
      this.wpMarkers.push(col, ring);
    });
  }

  towerNear(x, y) {
    let best = null, bd = 1e12;
    for (const a of this.world.airports) {
      if (!a.towerPos) continue;
      const w = a.owner.toWorld(a.towerPos.x, a.towerPos.y, {});
      const d = (w.x - x) ** 2 + (w.y - y) ** 2;
      if (d < bd) { bd = d; best = { x: w.x, y: w.y, z: a.towerPos.z }; }
    }
    return best && bd < 25000 * 25000 ? best : null;
  }

  // ---------------------------------------------------------------------
  toast(text, kind = '') { this.hud.toast(text, kind); }

  saveNow() {
    const snap = this.player.snapshot();
    const data = { v: 1, spec: { ...this.spec, save: undefined }, snap, mission: this.missionDef ? this.missionDef.id : null, wp: this.mission ? this.mission.wpIndex : 0, time: this.date().toISOString(), weather: this.world.weather.state, at: Date.now() };
    try { localStorage.setItem('opensky.save', JSON.stringify(data)); this.toast('Save point stored', 'good'); } catch { this.toast('Could not save (storage unavailable)', 'bad'); }
    if (this.cloud && this.cloud.signedIn) this.cloud.save(data).then(() => this.toast('Saved to your Google Drive (app data)', 'good')).catch((e) => this.toast('Cloud save failed: ' + e.message, 'bad'));
  }
  autosave(dt) {
    this.saveTimer = (this.saveTimer || 0) + dt;
    if (this.saveTimer > 60 && !this.player.o.crashed && !this.player.o.onGround) { this.saveTimer = 0; try { this.saveNow(); } catch { /* ignore */ } }
  }
  loadSave() { try { return JSON.parse(localStorage.getItem('opensky.save') || 'null'); } catch { return null; } }

  endFlight() {
    if (this.state !== 'flight') return;
    const res = this.scorer.result();
    this.state = 'debrief';
    this.setPaused(false);
    $('pause').classList.add('hidden');
    this.hud.showDebrief(res);
    try {
      if (this.missionDef) {
        const best = JSON.parse(localStorage.getItem('opensky.best') || '{}');
        if (!best[this.missionDef.id] || best[this.missionDef.id] < res.total) best[this.missionDef.id] = res.total;
        localStorage.setItem('opensky.best', JSON.stringify(best));
      }
    } catch { /* ignore */ }
  }
}

const game = new Game();
// QA hooks for automated browsers only; they wait for boot before acting
if (navigator.webdriver || /[?&]qa\b/.test(location.search)) import('./qa/hooks.js').then((m) => m.installQaHooks(game));
if (Intro.wanted(game)) game.playIntro(true);
game.boot().catch((e) => {
  console.error(e);
  $('progress-text').textContent = 'Failed to start: ' + e.message + ' — WebGL 2 is required.';
  window.__error = String(e && e.stack);
});
export default game;
