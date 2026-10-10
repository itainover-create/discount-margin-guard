// The player's aircraft: binds the C++ flight core to the 3D model, the
// cockpit, aircraft lights, ground queries, obstacle collisions and the
// floating-origin rebase. Switch/lever state lives here and is written to
// the core inputs every frame.
import * as THREE from 'three';
import { OskIn as I, OskOut as O, OskAssist as A } from '../core/layout.js';
import { createTrainer, poseTrainer } from '../aircraft/models.js';
import { Cockpit, EYE } from '../aircraft/cockpit.js';
import { LightBatch } from '../world/lights.js';

const D2R = Math.PI / 180;
export const OUT_NAMES = {};
for (const [k, v] of Object.entries(O)) OUT_NAMES[v] = k;

// camelCase view over the core output block
const FIELDS = {
  x: O.OUT_X, y: O.OUT_Y, z: O.OUT_Z, ve: O.OUT_VE, vn: O.OUT_VN, vu: O.OUT_VU, phi: O.OUT_PHI, theta: O.OUT_THETA, psi: O.OUT_PSI,
  p: O.OUT_P, q: O.OUT_Q, r: O.OUT_R, alpha: O.OUT_ALPHA, beta: O.OUT_BETA, ias: O.OUT_IAS, tas: O.OUT_TAS, gs: O.OUT_GS,
  alt: O.OUT_ALT_MSL, agl: O.OUT_AGL, vs: O.OUT_VS, nx: O.OUT_NX, ny: O.OUT_NY, nz: O.OUT_NZ,
  indIas: O.OUT_IND_IAS, indAlt: O.OUT_IND_ALT, indVs: O.OUT_IND_VS, aiPitch: O.OUT_AI_PITCH, aiRoll: O.OUT_AI_ROLL,
  hi: O.OUT_HI_HDG, compass: O.OUT_COMPASS, turnRate: O.OUT_TURN_RATE, ball: O.OUT_SLIP_BALL,
  rpm: O.OUT_RPM, map: O.OUT_MAP, fuelFlow: O.OUT_FUEL_FLOW, egt: O.OUT_EGT, oilT: O.OUT_OIL_T, oilP: O.OUT_OIL_P,
  engineRunning: O.OUT_ENGINE_RUNNING, starter: O.OUT_STARTER, thrust: O.OUT_THRUST, power: O.OUT_POWER, vacuum: O.OUT_VACUUM,
  propAngle: O.OUT_PROP_ANGLE, fuelL: O.OUT_FUEL_L, fuelR: O.OUT_FUEL_R, busV: O.OUT_BUS_V, battA: O.OUT_BATT_A, soc: O.OUT_BATT_SOC,
  avionicsPowered: O.OUT_AVIONICS_POWERED, gyroSpin: O.OUT_GYRO_SPIN, flapsDeg: O.OUT_FLAPS_DEG, trim: O.OUT_TRIM,
  elev: O.OUT_ELEV, ail: O.OUT_AIL, rud: O.OUT_RUD, steer: O.OUT_STEER, brakeL: O.OUT_BRAKE_L, brakeR: O.OUT_BRAKE_R, mixtureAct: O.OUT_MIXTURE,
  onGround: O.OUT_ON_GROUND, gear0: O.OUT_GEAR0, gear1: O.OUT_GEAR1, gear2: O.OUT_GEAR2, wheelSpeed: O.OUT_WHEEL_SPEED, skid: O.OUT_SKID, scrape: O.OUT_SCRAPE,
  stallWarn: O.OUT_STALL_WARN, stalled: O.OUT_STALLED, overspeed: O.OUT_OVERSPEED, crashed: O.OUT_CRASHED, crashReason: O.OUT_CRASH_REASON,
  tdCount: O.OUT_TD_COUNT, tdVs: O.OUT_TD_VS, tdNz: O.OUT_TD_NZ, tdX: O.OUT_TD_X, tdY: O.OUT_TD_Y, tdBank: O.OUT_TD_BANK, tdPitch: O.OUT_TD_PITCH,
  tdIas: O.OUT_TD_IAS, tdCrab: O.OUT_TD_CRAB, tdHdg: O.OUT_TD_HDG, events: O.OUT_EVENTS,
  apEngaged: O.OUT_AP_ENGAGED, apLat: O.OUT_AP_LAT, apVert: O.OUT_AP_VERT, apVsTarget: O.OUT_AP_VS_TARGET, apDisc: O.OUT_AP_DISC_COUNT,
  mass: O.OUT_MASS, simTime: O.OUT_SIM_TIME, windE: O.OUT_WIND_E, windN: O.OUT_WIND_N, windU: O.OUT_WIND_U, prime: O.OUT_PRIME,
  lowVolts: O.OUT_LOW_VOLTS, lowFuelL: O.OUT_LOW_FUEL_L, lowFuelR: O.OUT_LOW_FUEL_R, oilWarn: O.OUT_OIL_WARN,
};

export const ASSISTS_ACCESSIBLE = A.AS_AUTO_RUDDER | A.AS_STALL_PROTECT | A.AS_ATTITUDE_HOLD | A.AS_AUTO_MIXTURE | A.AS_PERFECT_GYROS | A.AS_EASY_START | A.AS_CRASH_TOLERANT | A.AS_TAXI_ASSIST;

export class PlayerAircraft {
  constructor(core, world) {
    this.core = core;
    this.world = world;
    this.o = {};
    for (const k of Object.keys(FIELDS)) this.o[k] = 0;
    this.model = createTrainer();
    this.root = this.model.root;
    this.cockpit = new Cockpit();
    this.root.add(this.cockpit.group);
    world.scene.add(this.root);
    this.exterior = [];
    this.root.traverse((c) => { if (c.userData.exterior) this.exterior.push(c); });
    this.lights = new LightBatch(world, 'aircraft-lights', 16);
    this.root.add(this.lights.points);
    const L = this.model.lights;
    this.lightIds = {
      navL: this.lights.add([[L.navL.x, L.navL.y, L.navL.z, 0.8, 0, 0, [1, 0.1, 0.08]]]),
      navR: this.lights.add([[L.navR.x, L.navR.y, L.navR.z, 0.8, 0, 0, [0.1, 1, 0.25]]]),
      tail: this.lights.add([[L.tail.x, L.tail.y, L.tail.z, 0.6, 0, 0, [1, 1, 1]]]),
      beacon: this.lights.add([[L.beacon.x, L.beacon.y, L.beacon.z, 1.4, 2, 0.2, [1, 0.1, 0.05]]]),
      strobe: this.lights.add([[L.strobeL.x, L.strobeL.y, L.strobeL.z, 2.5, 2, 0.0, [1, 1, 1]], [L.strobeR.x, L.strobeR.y, L.strobeR.z, 2.5, 2, 0.0, [1, 1, 1]]]),
      landing: this.lights.add([[L.landing.x, L.landing.y, L.landing.z, 2.6, 0, 0, [1, 0.97, 0.9]]]),
      taxi: this.lights.add([[L.taxi.x, L.taxi.y, L.taxi.z, 1.6, 0, 0, [1, 0.97, 0.9]]]),
    };
    // blob shadow
    const sc = document.createElement('canvas');
    sc.width = sc.height = 128;
    const g = sc.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8 }));
    this.shadow.renderOrder = 4;
    world.scene.add(this.shadow);
    this.sw = this.defaultSwitches(false);
    this.ui = { hdgBug: 0, hdgBugDeg: 0, apAltFt: 3000, apVsFpm: 0, baroHpa: 1013, comFreq: '121.900', squawk: '1200', hobbs: 0, night: 0 };
    this.simMode = false;
    this.cockpitView = false;
    this.buildingCheckTimer = 0;
  }

  defaultSwitches(running) {
    return {
      battery: running, alternator: running, avionics: running, fuelPump: false, beacon: running, landing: false, taxi: false,
      nav: running, strobe: false, pitot: false, mags: running ? 3 : 0, fuelSelector: 2, fuelShutoff: true,
      parkBrake: !running, flaps: 0, throttle: running ? 0.0 : 0.0, mixture: running ? 1 : 0,
      apMaster: false, apLat: 1, apVert: 1,
    };
  }

  setMode(simulation) {
    this.simMode = simulation;
    this.core.setSimMode(simulation);
    this.core.in[I.IN_ASSISTS] = simulation ? 0 : ASSISTS_ACCESSIBLE;
  }
  setAssists(mask) { this.core.in[I.IN_ASSISTS] = mask; }

  // start: {x, y (world frame), hdgDeg (true), onGround, altM, iasKt, engine}
  spawn(start) {
    const core = this.core;
    core.init(0);
    this.setMode(this.simMode);
    if (start.fuel) core.setFuel(start.fuel[0], start.fuel[1]);
    if (start.payload) core.setPayload(...start.payload);
    const hdg = start.hdgDeg * D2R;
    if (start.onGround) {
      const gr = this.world.groundAt(start.x, start.y);
      core.reset(start.x, start.y, gr.h, hdg, 0, true, !!start.engine);
      core.setGround(gr.h, gr.nE, gr.nN, gr.nU, gr.surface);
    } else {
      core.reset(start.x, start.y, start.altM, hdg, (start.iasKt || 100) * 0.514444, false, true);
    }
    this.sw = this.defaultSwitches(!!start.engine || !start.onGround);
    if (!start.onGround) { this.sw.strobe = true; this.sw.landing = start.altM - this.world.heightAt(start.x, start.y) < 600; this.sw.throttle = 0.68; this.sw.parkBrake = false; }
    if (start.onGround && start.engine) { this.sw.parkBrake = true; this.sw.throttle = 0; }  // lined up or parked: brake set
    if (start.flaps) this.sw.flaps = start.flaps;
    this.ui.hdgBug = Math.round(start.hdgDeg - (this.world.magVar || 0)) * D2R;
    this.ui.baroHpa = this.world.weather.state.qnh;
    this.world.weather.applyToCore(core, 1234);
    core.in[I.IN_MAG_VAR] = (this.world.magVar || 0) * D2R;
    core.in[I.IN_BARO] = this.ui.baroHpa * 100;
    core.alignHI();
    this.pushInputs({ pitch: 0, roll: 0, yaw: 0, brakeL: 0, brakeR: 0 });
    core.advance(1 / 60);  // a few core steps so outputs (bus, avionics, gear loads) reflect the switches
    this.readOutputs();
    this.lastPos = { x: this.o.x, y: this.o.y };
  }

  pushInputs(ctl) {
    const i = this.core.in, s = this.sw;
    i[I.IN_PITCH] = ctl.pitch;
    i[I.IN_ROLL] = ctl.roll;
    i[I.IN_YAW] = ctl.yaw;
    i[I.IN_BRAKE_L] = ctl.brakeL;
    i[I.IN_BRAKE_R] = ctl.brakeR;
    i[I.IN_TRIM_RATE] = ctl.trimRate || 0;
    i[I.IN_THROTTLE] = s.throttle;
    i[I.IN_MIXTURE] = s.mixture;
    i[I.IN_PARK_BRAKE] = s.parkBrake ? 1 : 0;
    i[I.IN_FLAPS_LEVER] = s.flaps;
    i[I.IN_MAGNETOS] = s.mags;
    i[I.IN_BATTERY] = s.battery ? 1 : 0;
    i[I.IN_ALTERNATOR] = s.alternator ? 1 : 0;
    i[I.IN_AVIONICS] = s.avionics ? 1 : 0;
    i[I.IN_FUEL_PUMP] = s.fuelPump ? 1 : 0;
    i[I.IN_FUEL_SELECTOR] = s.fuelSelector;
    i[I.IN_FUEL_SHUTOFF] = s.fuelShutoff ? 1 : 0;
    i[I.IN_BEACON] = s.beacon ? 1 : 0;
    i[I.IN_NAV_LIGHTS] = s.nav ? 1 : 0;
    i[I.IN_STROBE] = s.strobe ? 1 : 0;
    i[I.IN_TAXI_LIGHT] = s.taxi ? 1 : 0;
    i[I.IN_LANDING_LIGHT] = s.landing ? 1 : 0;
    i[I.IN_PITOT_HEAT] = s.pitot ? 1 : 0;
    i[I.IN_AP_MASTER] = s.apMaster ? 1 : 0;
    i[I.IN_AP_LAT_MODE] = s.apLat;
    i[I.IN_AP_VERT_MODE] = s.apVert;
    i[I.IN_AP_HDG] = this.ui.hdgBug;
    i[I.IN_AP_ALT] = this.ui.apAltFt * 0.3048;
    i[I.IN_AP_VS] = this.ui.apVsFpm * 0.00508;
    i[I.IN_BARO] = this.ui.baroHpa * 100;
    i[I.IN_MAG_VAR] = (this.world.magVar || 0) * D2R;
  }

  readOutputs() {
    const out = this.core.out, o = this.o;
    for (const k in FIELDS) o[k] = out[FIELDS[k]];
    o.hdgMag = (((o.psi / D2R) - (this.world.magVar || 0)) % 360 + 360) % 360;
    return o;
  }

  // Building collision (cheap: only below 600 m AGL, tile under the aircraft)
  checkBuildings() {
    const o = this.o;
    if (o.agl > 600 || o.crashed) return false;
    for (const r of this.world.regions) {
      if (!r.containsWorld(o.x, o.y)) continue;
      const loc = r.toRegion(o.x, o.y);
      const T = r.manifest.tileSize;
      const t = r.tiles.get(`${Math.floor(loc.x / T)},${Math.floor(loc.y / T)}`);
      if (!t || !t.data) continue;
      const base = this.world.heightAt(o.x, o.y);
      for (const b of t.data.buildings) {
        const ring = b.rings[0];
        let inside = false;
        const n = ring.length / 2;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const xi = ring[i * 2], yi = ring[i * 2 + 1], xj = ring[j * 2], yj = ring[j * 2 + 1];
          if ((yi > loc.y) !== (yj > loc.y) && loc.x < ((xj - xi) * (loc.y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside && o.z - 0.8 < base + b.h && o.z + 1 > base + (b.minH || 0)) return true;
      }
    }
    return false;
  }

  update(dt, ctl) {
    const core = this.core;
    this.pushInputs(ctl);
    // ground plane under the aircraft
    const gr = this.world.groundAt(this.o.x, this.o.y);
    core.setGround(gr.h, gr.nE, gr.nN, gr.nU, gr.surface);
    this.surface = gr.surface;
    core.advance(dt);
    const o = this.readOutputs();
    // building / obstacle collision
    this.buildingCheckTimer -= dt;
    if (this.buildingCheckTimer <= 0) {
      this.buildingCheckTimer = 0.1;
      if (this.checkBuildings()) core.crash(5);
    }
    // AP master follows the core (disconnects)
    if (this.sw.apMaster && !o.apEngaged && o.simTime > 0.5) {
      if (this._apSeenOn) { this.sw.apMaster = false; this._apSeenOn = false; }
    }
    if (o.apEngaged) this._apSeenOn = true;
    if (o.engineRunning) this.ui.hobbs += dt / 360;
    this.ui.night = this.world.shared.uNight.value;
    this.ui.frame = this.world.renderer ? this.world.renderer.info.render.frame : undefined;
    this.pose(dt);
  }

  pose(dt) {
    const o = this.o;
    this.root.position.set(o.x, o.z, -o.y);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.set(o.theta, -o.psi, -o.phi);
    this.root.updateMatrixWorld(true);
    poseTrainer(this.model, { flapsDeg: o.flapsDeg, ail: o.ail, elev: o.elev, rud: o.rud, steer: o.steer, rpm: o.rpm, propAngle: o.propAngle }, dt);
    this.cockpit.update(dt, o, this.sw, this.ui);
    // lights
    const pw = o.busV > 18;
    const L = this.lights;
    L.setVisible(this.lightIds.navL, pw && this.sw.nav);
    L.setVisible(this.lightIds.navR, pw && this.sw.nav);
    L.setVisible(this.lightIds.tail, pw && this.sw.nav);
    L.setVisible(this.lightIds.beacon, pw && this.sw.beacon);
    L.setVisible(this.lightIds.strobe, pw && this.sw.strobe);
    L.setVisible(this.lightIds.landing, pw && this.sw.landing);
    L.setVisible(this.lightIds.taxi, pw && this.sw.taxi);
    L.flush();
    this.model.beaconMesh.material.color.setHex(pw && this.sw.beacon && (performance.now() % 1100) < 160 ? 0xff2020 : 0x551111);
    // landing light into world shaders
    const S = this.world.shared;
    const on = pw && (this.sw.landing || this.sw.taxi);
    S.uLandOn.value = on ? (this.sw.landing ? 1 : 0.6) : 0;
    if (on) {
      const lp = this.model.lights.landing.clone().applyMatrix4(this.root.matrixWorld);
      S.uLandPos.value.copy(lp);
      const d = new THREE.Vector3(0, -0.12, -1).applyQuaternion(this.root.quaternion).normalize();
      S.uLandDir.value.copy(d);
    }
    // blob shadow
    const g = this.world.heightAt(o.x, o.y);
    const hAbove = o.z - g;
    this.shadow.visible = hAbove < 120;
    this.shadow.position.set(o.x, g + 0.05, -o.y);
    const s = 10 + hAbove * 0.15;
    this.shadow.scale.set(s, 1, s * 0.75);
    this.shadow.rotation.y = -o.psi;
    this.shadow.material.opacity = Math.max(0, 1 - hAbove / 120) * (1 - this.world.shared.uNight.value);
  }

  setCockpitView(on) {
    this.cockpitView = on;
    for (const c of this.exterior) c.visible = !on;
    this.cockpit.group.visible = on;  // wings, struts and propeller stay visible from inside
  }

  eyeWorld(out = new THREE.Vector3()) { return out.copy(EYE).applyMatrix4(this.root.matrixWorld); }

  // Called after World.maybeRebase(): convert the aircraft to the new frame.
  rebase(a) {
    const o = this.o;
    const x = a.sx * o.x + a.tx, y = o.y + a.ty;
    this.core.setPosition(x, y, o.z);
    this.readOutputs();
  }

  // Serializable state for save points.
  snapshot() {
    const ll = this.world.frame.toLatLon(this.o.x, this.o.y);
    return { lat: ll.lat, lon: ll.lon, alt: this.o.z, hdg: this.o.psi / D2R, ias: this.o.ias / 0.514444, onGround: !!this.o.onGround, sw: { ...this.sw }, fuel: [this.o.fuelL, this.o.fuelR] };
  }
}
