// OPEN SKY — World Flight Simulator (ORION GAMES). Game orchestrator.
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
import { haversine } from './world/geo.js';
import { OskIn } from './core/layout.js';

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
      quality: 'high', trafficDensity: null, carDensity: null, atcVoice: false, hebrew: true, hud: true, online: true,
      volume: 0.8, mode: 'accessible', units: 'aviation',
    }, this._loadSettings());
    this.fps = { frames: 0, t: 0, value: 0, hist: [] };
  }

  _loadSettings() { try { return JSON.parse(localStorage.getItem('opensky.settings') || '{}'); } catch { return {}; } }
  saveSettings() { try { localStorage.setItem('opensky.settings', JSON.stringify(this.settings)); } catch { /* ignore */ } }

  progress(msg, frac) {
    $('progress-text').textContent = msg;
    if (frac !== undefined) $('progress-bar').style.width = `${Math.round(frac * 100)}%`;
  }

  async boot() {
    this.progress('Starting renderer', 0.05);
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    this.player = new PlayerAircraft(this.core, this.world);
    this.player.root.visible = false;
    this.rig = new CameraRig(this.camera, this.world);
    this.input = new Input(renderer.domElement);
    this.audio = new AudioEngine();
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
    $('menu').classList.add('show');
    $('hud').classList.add('hidden');
    ['pause', 'debrief', 'help'].forEach((id) => $(id).classList.add('hidden'));
    this.audio.setPaused(true);
    this.menu.show();
  }

  // spec: { icao?, lat?, lon?, start, mode, hour, weather, missionId?, dest?, save? }
  async startFlight(spec) {
    this.state = 'loading';
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
      const start = spec.save ? this.startFromSave(spec.save) : this.computeStart(spec.start, ap);
      const def = spec.missionId ? MISSIONS.find((m) => m.id === spec.missionId) : null;
      if (def && def.pax) start.payload = [80, 75 * def.pax, 10];
      this.progress('Engine & systems', 0.8);
      this.player.spawn(start);
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

  nearestAirport(icao) {
    const list = this.world.airports;
    if (!list.length) return null;
    return list.find((a) => a.icao === icao) || list[0];
  }

  computeStart(type, ap) {
    if (!ap) return { x: 0, y: 0, hdgDeg: 0, onGround: false, altM: 600, iasKt: 100 };
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
    if (type === 'airHigh') {
      ap.owner.toWorld(end.tx - ux * 6000, end.ty - uy * 6000, w);
      return { x: w.x, y: w.y, hdgDeg: end.hdgTrue, onGround: false, altM: ap.elev + 900, iasKt: 100 };
    }
    // 5 nm final on a 3 degree path
    const d = 9000;
    ap.owner.toWorld(end.tx - ux * d, end.ty - uy * d, w);
    return { x: w.x, y: w.y, hdgDeg: end.hdgTrue, onGround: false, altM: end.z + d * Math.tan(3 * D2R) + 15, iasKt: 80, flaps: 1 };
  }

  startFromSave(s) {
    const p = this.world.frame.toXY(s.lat, s.lon);
    return { x: p.x, y: p.y, hdgDeg: s.hdg, onGround: s.onGround, altM: s.alt, iasKt: s.ias, engine: true, fuel: s.fuel };
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
    p.update(dt, ctl);
    // floating origin
    const a = this.world.maybeRebase(p.o.x, p.o.y);
    if (a) {
      p.rebase(a);
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
    const toCam = camThree.clone().sub(p.root.position);
    const dist = toCam.length();
    const closing = dist > 1 ? new THREE.Vector3(p.o.ve, p.o.vu, -p.o.vn).dot(toCam.normalize()) : 0;
    this.audio.update(dt, p.o, sw, this.rig.view, { dist, closing }, this.traffic.agents);
    this.hud.update(dt);
    if (p.o.crashed && !this.crashShown) {
      this.crashShown = true;
      this.toast('CRASH — press Esc for the debrief or restart', 'bad');
      setTimeout(() => { if (this.state === 'flight') this.endFlight(); }, 4500);
    }
    this.autosave(dt);
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
        case 'flapsDown': sw.flaps = Math.min(3, sw.flaps + 1); this.toast(`Flaps ${[0, 10, 20, 30][sw.flaps]}°`); break;
        case 'flapsUp': sw.flaps = Math.max(0, sw.flaps - 1); this.toast(`Flaps ${[0, 10, 20, 30][sw.flaps]}°`); break;
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
    if (input.mouse.drag && input.mouse.button === 0 && (this.dragging || (h && ['throttle', 'mixture', 'trim'].includes(h.object.userData.action)))) {
      if (!this.dragging) this.dragging = h.object.userData.action;
      const dv = -input.lookDY * 0.004;
      if (this.dragging === 'throttle') sw.throttle = Math.min(1, Math.max(0, sw.throttle + dv));
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
        case 'flaps': { const upper = h.point.y > h.object.getWorldPosition(new THREE.Vector3()).y; sw.flaps = Math.max(0, Math.min(3, sw.flaps + (upper ? -1 : 1))); break; }
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
    if (a === 'flaps') return ` — ${[0, 10, 20, 30][sw.flaps]}°`;
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
  }

  // ---------------------------------------------------------------------
  // Auto start / shutdown: performs the actual switch sequence over time.
  autoStartStop() {
    const p = this.player, sw = p.sw;
    if (this.auto) return;
    const steps = [];
    const wait = (s) => steps.push({ t: s });
    const set = (k, v) => steps.push({ fn: () => { sw[k] = v; this.audio.oneShot('click'); } });
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
game.boot().catch((e) => {
  console.error(e);
  $('progress-text').textContent = 'Failed to start: ' + e.message + ' — WebGL 2 is required.';
  window.__error = String(e && e.stack);
});
export default game;
