// GLOBAL SKIES core — aircraft simulation implementation.
// See include/osk/sim.h for frames and docs/FLIGHT_MODEL.md for the model
// description, simplifications and calibration results.
#include "osk/sim.h"

namespace osk {

static constexpr double DT = 1.0 / 240.0;  // fixed physics step

static double tanh_(double x) {
  if (x > 20) return 1.0;
  if (x < -20) return -1.0;
  double e = exp(2.0 * x);
  return (e - 1.0) / (e + 1.0);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
void Sim::init(int id) {
  def = &aircraftDef(id);
  aircraftId = (id > 0 && id < AC_COUNT) ? id : 0;
  for (int i = 0; i < IN_COUNT; i++) in[i] = 0;
  for (int i = 0; i < OUT_COUNT; i++) out[i] = 0;
  in[IN_BARO] = P0_ISA;
  in[IN_GEAR_LEVER] = 1;
  for (int i = 0; i < FAIL_COUNT; i++) fail[i] = false;
  fuelKg[0] = def->fuel.capacityKg[0] * 0.75;
  fuelKg[1] = def->fuel.capacityKg[1] * 0.75;
  payloadKg = 85.0;
  rng.seed(12345);
  wind.rng.seed(777);
  updateMass();
  reset(0, 0, 0, 0, 0, true, false);
}

void Sim::updateMass() {
  mass = def->mass.emptyKg + payloadKg + fuelKg[0] + fuelKg[1];
  double s = mass / def->mass.refMassKg;
  double fuelRoll = (fuelKg[0] * sq(def->fuel.tankY[0]) + fuelKg[1] * sq(def->fuel.tankY[1]));
  inertia = {def->mass.Ixx * s * 0.85 + fuelRoll, def->mass.Iyy * s, def->mass.Izz * s * 0.9 + fuelRoll};
  Ixz = def->mass.Ixz * s;
}

void Sim::setPayload(double pilotKg, double paxKg, double baggageKg) {
  payloadKg = clamp(pilotKg + paxKg + baggageKg, 0, maxf(600.0, def->mass.mtowKg - def->mass.emptyKg));
  updateMass();
}

void Sim::setFuel(double l, double r) {
  fuelKg[0] = clamp(l, 0, def->fuel.capacityKg[0]);
  fuelKg[1] = clamp(r, 0, def->fuel.capacityKg[1]);
  updateMass();
}

void Sim::setWeather(double qnh, double dT, double windFrom, double wind10, double gust, double turb, unsigned seed) {
  atm.qnh = qnh;
  atm.dT = dT;
  wind.dirFrom = windFrom;
  wind.speed10 = maxf(0, wind10);
  wind.gust = maxf(0, gust);
  wind.turbulence = clamp(turb, 0, 3);
  if (seed) wind.rng.seed(seed);
}

void Sim::setGround(double h, double nE, double nN, double nU, int surface) {
  ground.h = h;
  Vec3 n = normalize(Vec3{nN, nE, -nU});  // ENU -> NED
  if (n.z > -0.2) n = {0, 0, -1};
  ground.nNed = n;
  ground.refN = pos.x;
  ground.refE = pos.y;
  ground.surface = surface;
}

void Sim::crash(int reason) {
  if (crashed) return;
  crashed = true;
  crashReason = reason;
  eng.running = false;
  eng.starter = false;
  for (int i = 0; i < 4; i++) jets[i].running = false;
}

void Sim::damage(int part, double amount) {
  if (crashed || amount <= 0) return;
  events |= EV_DAMAGE;
  if (part == PART_WING_L || part == PART_WING_R) dmg.wing[part] += amount;
  else if (part == PART_TAIL) dmg.tail += amount;
  else if (part == PART_FUSELAGE) dmg.fuselage += amount;
  else if (part >= PART_ENGINE_0 && part <= PART_ENGINE_3) {
    int k = part - PART_ENGINE_0;
    double before = dmg.eng[k];
    dmg.eng[k] = minf(1.0, dmg.eng[k] + amount);
    if (before < 0.6 && dmg.eng[k] >= 0.6 && isJet() && k < def->jet.count) { jets[k].fire = true; events |= EV_ENGINE_FIRE; }
  }
}

// Structural contact with the ground: damage depends on the impact
// (vertical speed into the surface) and the sliding speed.
void Sim::hitPart(int tag, int index, double impact, double speed) {
  const GearPointDef& g = def->gear[index];
  int side = g.pos.y < 0 ? 0 : 1;
  switch (tag) {
    case 1: damage(PART_TAIL, 0.02 * impact); damage(PART_FUSELAGE, 0.04 * impact); break;
    case 2: damage(side == 0 ? PART_WING_L : PART_WING_R, 0.12 * impact + 0.004 * speed); break;
    case 3: break;  // propeller strike handled by the engine
    case 5: {
      // nearest engine on that side
      int best = 0;
      double bd = 1e9;
      for (int k = 0; k < def->jet.count; k++) {
        double d = fabs(def->jet.pos[k].y - g.pos.y);
        if (d < bd) { bd = d; best = k; }
      }
      damage(PART_ENGINE_0 + best, 0.12 * impact + 0.0015 * speed);
      damage(side == 0 ? PART_WING_L : PART_WING_R, 0.04 * impact);
      break;
    }
    default: damage(PART_FUSELAGE, 0.07 * impact); break;
  }
}

double Sim::stallAngle() const {
  double ff = def->flaps.maxDeg > 0 ? flapDeg / def->flaps.maxDeg : 0.0;
  if (def->flaps.liftExp > 0) ff = pow(ff, def->flaps.liftExp);
  return def->aero.alphaStall - def->aero.alphaStallFlapDelta * ff;
}

double Sim::magHeading() const {
  double phi, theta, psi;
  qToEuler(q, phi, theta, psi);
  return wrap2Pi(psi - in[IN_MAG_VAR]);
}

double Sim::groundAgl() const {
  return -pos.z - ground.heightAt(pos.x, pos.y) - def->gear[1].pos.z;
}

void Sim::reset(double e, double n, double z, double hdg, double tasIn, bool onGnd, bool running) {
  const AeroDef& a = def->aero;
  crashed = false;
  crashReason = 0;
  events = 0;
  stalled = stallWarn = overspeed = false;
  accum = 0;
  nzFilt = 1.0;
  w = {0, 0, 0};
  elev = ail = rud = steer = 0;
  alphaDot = 0;
  eng = EngineState();
  elec = ElecState();
  ins = InstrumentState();
  ap = AutopilotState();
  as = AssistState();
  td = TouchdownState();
  dmg = DamageState();
  for (int i = 0; i < 4; i++) jets[i] = JetState();
  sb = 0;
  reverser = false;
  fbwNormal = true;
  fbwI = fbwRollI = 0;
  fbwRollHolding = fbwPathHolding = false;
  for (int i = 0; i < 12; i++) gearComp[i] = 0;
  updateMass();
  if (onGnd || !def->gearSys.retractable) in[IN_GEAR_LEVER] = 1;
  gearPos = in[IN_GEAR_LEVER] > 0.5 ? 1.0 : 0.0;

  double theta = 0;
  if (onGnd) {
    double staticComp = isJet() ? clamp(0.46 * mass * G0 / def->gear[1].k, 0.02, 0.35) : 0.07;
    pos = {n, e, -(z + def->gear[1].pos.z - staticComp)};
    vel = {0, 0, 0};
    flapDeg = 0;
    trim = 0.0;
    ground.h = z;
    ground.nNed = {0, 0, -1};
    ground.refN = n;
    ground.refE = e;
    onGround = true;
    td.airTime = 0;
  } else {
    pos = {n, e, -z};
    AirData air = atm.at(z);
    // air start in the configuration the host selected (flap lever), trimmed
    int lever = (int)clamp(in[IN_FLAPS_LEVER], 0, def->flaps.detents - 1);
    flapDeg = def->flaps.angleDeg[lever];
    double ff = def->flaps.maxDeg > 0 ? flapDeg / def->flaps.maxDeg : 0.0;
    double CL0e = a.CL0 + a.CLflapFull * pow(ff, def->flaps.liftExp > 0 ? def->flaps.liftExp : 0.85);
    double qb = 0.5 * air.rho * tasIn * tasIn;
    double CLreq = mass * G0 / maxf(qb * a.S, 1.0);
    double alphaTrim = clamp((CLreq - CL0e) / a.CLa, -0.05, 0.2);
    theta = alphaTrim;
    vel = {tasIn * cos(hdg) * cos(theta - alphaTrim), tasIn * sin(hdg), 0};
    vel += wind.mean(maxf(10.0, z - ground.h));  // airspeed is relative to the air mass
    double cmNoElev = a.Cm0 + a.Cma * alphaTrim + a.CmFlapFull * ff;
    trim = clamp(-cmNoElev / a.CmTrimMax, -1, 1);
    onGround = false;
    td.airTime = 10;
  }
  q = qFromEuler(0, theta, hdg);

  if (running) {
    in[IN_MAGNETOS] = 3; in[IN_BATTERY] = 1; in[IN_ALTERNATOR] = 1; in[IN_AVIONICS] = 1;
    in[IN_FUEL_SHUTOFF] = 1; in[IN_FUEL_SELECTOR] = 2; in[IN_MIXTURE] = 1;
    in[IN_BEACON] = 1; in[IN_NAV_LIGHTS] = 1;
    in[IN_THROTTLE] = onGnd ? 0.0 : 0.72;
    if (!onGnd) { in[IN_STROBE] = 1; in[IN_LANDING_LIGHT] = 1; }
    eng.running = true;
    eng.rpm = onGnd ? def->prop.rpmIdle : 2350;
    if (isJet()) {
      const JetDef& J = def->jet;
      double thr = in[IN_THROTTLE];
      double mil = J.abThrustN > 0 ? clamp(thr / 0.92, 0, 1) : thr;
      for (int i = 0; i < J.count; i++) {
        jets[i].running = true;
        jets[i].n1 = J.idleN1 + (100.0 - J.idleN1) * mil;
        jets[i].n2 = 58.0 + 42.0 * mil;
        jets[i].egt = 773.0 + 400.0 * mil;
      }
      eng.rpm = jets[0].n1;
    }
    eng.omega = eng.rpm * 2 * PI / 60;
    eng.oilT = 345; eng.oilP = 60;
    ins.gyroSpin = 1;
  } else {
    in[IN_MAGNETOS] = 0; in[IN_BATTERY] = 0; in[IN_ALTERNATOR] = 0; in[IN_AVIONICS] = 0;
    in[IN_FUEL_PUMP] = 0; in[IN_FUEL_SHUTOFF] = 1; in[IN_FUEL_SELECTOR] = 2;
    in[IN_MIXTURE] = 0; in[IN_THROTTLE] = 0;
    in[IN_BEACON] = in[IN_NAV_LIGHTS] = in[IN_STROBE] = in[IN_TAXI_LIGHT] = in[IN_LANDING_LIGHT] = 0;
    in[IN_PARK_BRAKE] = 1;
  }
  atThr = in[IN_THROTTLE];
  iasPrev = 0;
  in[IN_AT_ENGAGED] = 0;
  in[IN_REVERSE] = 0;
  in[IN_SPEEDBRAKE] = 0;
  in[IN_FIRE_HANDLES] = 0;
  if (onGnd) in[IN_FLAPS_LEVER] = 0;
  in[IN_AP_MASTER] = 0;
  mixture = in[IN_MIXTURE];
  ins.hi = magHeading();
  ins.compass = ins.hi;
  AirData air = atm.at(-pos.z);
  ins.alt = indicatedAltitude(air.p, in[IN_BARO] > 0 ? in[IN_BARO] : P0_ISA);
  ins.altPrev = ins.alt;
  writeOutputs();
}

void Sim::advance(double dt) {
  if (!def) return;
  if (!paused) {
    accum += minf(maxf(dt, 0.0), 0.1);
    int n = 0;
    while (accum >= DT && n < 48) {
      step(DT);
      accum -= DT;
      n++;
    }
  }
  writeOutputs();
}

// ---------------------------------------------------------------------------
// Controls, assists and autopilot
// ---------------------------------------------------------------------------
void Sim::autopilot(double dt, double& pitchCmd, double& rollCmd) {
  bool master = in[IN_AP_MASTER] > 0.5;
  bool powered = elec.avionics;
  double phi, theta, psi;
  qToEuler(q, phi, theta, psi);
  if (master && !ap.prevMaster) {
    if (powered && !onGround && groundAgl() > 30.0) {
      ap.engaged = true;
      // Capture the current vertical speed, rounded to 100 ft/min.
      ap.vsTarget = floor((-vel.z) / FPM / 100.0 + 0.5) * 100.0 * FPM;
      ap.iPitch = elev;
      ap.iRoll = 0;
      ap.overrideTimer = 0;
    }
  }
  if (!master) ap.engaged = false;
  ap.prevMaster = master;
  if (ap.engaged && (!powered || onGround)) {
    ap.engaged = false;
    ap.discCount++;
    events |= EV_AP_DISCONNECT;
  }
  if (!ap.engaged) return;

  // Pilot override disconnects.
  if (fabs(in[IN_PITCH]) > 0.35 || fabs(in[IN_ROLL]) > 0.35) {
    ap.overrideTimer += dt;
    if (ap.overrideTimer > 0.4) {
      ap.engaged = false;
      ap.discCount++;
      events |= EV_AP_DISCONNECT;
      return;
    }
  } else {
    ap.overrideTimer = 0;
  }

  ap.lat = (int)in[IN_AP_LAT_MODE];
  ap.vert = (int)in[IN_AP_VERT_MODE];

  // Lateral
  double phiCmd = 0;
  if (ap.lat == 1) {
    double err = wrapPi(in[IN_AP_HDG] - magHeading());
    phiCmd = clamp(1.6 * err, -20 * DEG, 20 * DEG);
  } else if (ap.lat == 2 && in[IN_NAV_VALID] > 0.5) {
    double trk = atan2(vel.y, vel.x);
    double cmdTrk = in[IN_NAV_TRACK] + clamp(-in[IN_NAV_XTE] * 0.0035, -35 * DEG, 35 * DEG);
    double err = wrapPi(cmdTrk - trk);
    phiCmd = clamp(1.8 * err, -20 * DEG, 20 * DEG);
  }
  if (isJet()) phiCmd = clamp(phiCmd * 1.25, -25 * DEG, 25 * DEG);
  apPhiCmd = phiCmd;
  ap.iRoll = clamp(ap.iRoll + 0.3 * (phiCmd - phi) * dt, -0.15, 0.15);
  rollCmd = clamp(2.2 * (phiCmd - phi) - 0.5 * w.x + ap.iRoll, -0.6, 0.6);

  // Vertical
  double vs = -vel.z;
  double vsCmd = ap.vsTarget;
  if (ap.vert == 1) {
    double vsLim = isJet() ? 12.0 : 3.6;
    vsCmd = clamp(0.12 * (in[IN_AP_ALT] - ins.alt), -vsLim, vsLim);
  } else {
    ap.vsTarget = in[IN_AP_VS];
    vsCmd = ap.vsTarget;
  }
  double V = maxf(tas, 20.0);
  double gamma = asin(clamp(vsCmd / V, -0.3, 0.3));
  double thetaCmd = gamma + clamp(alpha, -0.1, 0.25) + 0.6 * (vsCmd - vs) / V;
  apThetaCmd = thetaCmd;
  if (def->law == ControlLaw::FlyByWireG && fbwNormal) return;  // FBW flies the targets, trims itself
  ap.iPitch = clamp(ap.iPitch + 1.0 * (thetaCmd - theta) * dt, -0.8, 0.8);
  pitchCmd = clamp(3.0 * (thetaCmd - theta) - 1.2 * w.y + ap.iPitch, -0.7, 0.7);

  // Trim servo: offload the integrator into the trim tab.
  const AeroDef& a = def->aero;
  double ratio = (-a.Cmde * a.deUp) / a.CmTrimMax;  // trim units per elevator unit
  if (fabs(ap.iPitch) > 0.01) {
    double dTrim = sign(ap.iPitch) * 0.08 * dt;
    double nt = clamp(trim + dTrim, -1, 1);
    ap.iPitch -= (nt - trim) / ratio;
    trim = nt;
  }
}

void Sim::computeControls(double dt) {
  double phi, theta, psi;
  qToEuler(q, phi, theta, psi);
  double pitchIn = clamp(in[IN_PITCH], -1, 1);
  double rollIn = clamp(in[IN_ROLL], -1, 1);
  double yawIn = clamp(in[IN_YAW], -1, 1);
  double agl = groundAgl();
  bool airborne = !onGround && agl > 1.0;

  double apPitch = 0, apRoll = 0;
  autopilot(dt, apPitch, apRoll);
  bool fbwOn = def->law == ControlLaw::FlyByWireG && fbwNormal;
  if (ap.engaged && !fbwOn) {
    pitchIn = apPitch;
    rollIn = apRoll;
  } else if (!ap.engaged) {
    if (assist(AS_ATTITUDE_HOLD) && airborne && !fbwOn) {
      if (fabs(pitchIn) < 0.04) {
        if (!as.pitchHolding) { as.thetaHold = theta; as.pitchHolding = true; }
        double e = as.thetaHold - theta;
        as.iTheta = clamp(as.iTheta + 0.7 * e * dt, -0.6, 0.6);
        pitchIn = 2.6 * e - 0.9 * w.y + as.iTheta;
      } else {
        as.pitchHolding = false;
        pitchIn = pitchIn + as.iTheta;
      }
      if (fabs(rollIn) < 0.04) {
        if (!as.rollHolding) {
          as.phiHold = fabs(phi) < 7 * DEG ? 0.0 : clamp(phi, -35 * DEG, 35 * DEG);
          as.rollHolding = true;
        }
        rollIn = 2.2 * (as.phiHold - phi) - 0.6 * w.x;
      } else {
        as.rollHolding = false;
      }
      pitchIn = clamp(pitchIn, -1, 1);
      rollIn = clamp(rollIn, -1, 1);
    } else {
      as.pitchHolding = as.rollHolding = false;
      as.iTheta = approach(as.iTheta, 0, 2.0, dt);
    }
  }
  if (assist(AS_STALL_PROTECT) && airborne && !fbwOn) {
    // predictive: angle of attack plus its rate (a zoom climb runs out of
    // airspeed with the nose high, and the elevator weakens as it slows)
    double excess = alpha + 0.8 * maxf(0.0, alphaDot) - (stallAngle() - 2.5 * DEG);
    if (excess > -0.06) {
      double lim = maxf(-1.0, -8.0 * excess - 0.5 * w.y);
      if (pitchIn > lim) pitchIn = lim;
    }
    // envelope: load factor below 90 % of the limit, pitch attitude below 30 deg
    double gl = def->limits.gMax * 0.9;
    if (nzFilt > gl - 0.3) pitchIn = minf(pitchIn, elev - 1.5 * (nzFilt - (gl - 0.3)));
    if (theta > 25 * DEG) pitchIn = minf(pitchIn, maxf(-1.0, -3.0 * (theta - 25 * DEG) - 0.6 * w.y));
  }
  if (assist(AS_AUTO_RUDDER) || isJet()) {
    // turn coordination (jets: yaw damper, always on)
    if (airborne) {
      double V = maxf(tas, 20.0);
      double rCoord = G0 * sin(phi) / V;
      double kb = def->category == Category::Bomber ? 6.0 : 3.0;
      yawIn = clamp(yawIn + clamp(kb * beta + 0.6 * (rCoord - w.z), -0.7, 0.7), -1, 1);
    }
  }
  if (fbwOn) fbw(dt, pitchIn, rollIn, airborne, pitchIn, rollIn);
  double gs = sqrt(vel.x * vel.x + vel.y * vel.y);
  if (onGround && (assist(AS_AUTO_RUDDER) || assist(AS_TAXI_ASSIST)) && fabs(in[IN_YAW]) < 0.05 && gs > 12.0) {
    if (!as.groundHolding) { as.groundHdgHold = psi; as.groundHolding = true; }
    yawIn = clamp(3.0 * wrapPi(as.groundHdgHold - psi) - 1.0 * w.z, -1, 1);
  } else {
    as.groundHolding = false;
  }

  // hydraulic jets: surfaces move slowly (or freeze) without pressure
  double hydRate = isJet() ? clamp(dmg.hyd, 0.02, 1.0) : 1.0;
  elev = slew(elev, pitchIn, 5.0 * hydRate, dt);
  ail = slew(ail, rollIn, 5.0 * hydRate, dt);
  rud = slew(rud, yawIn, 4.0 * hydRate, dt);

  // Brakes and steering
  double park = in[IN_PARK_BRAKE] > 0.5 ? 1.0 : 0.0;
  brakeL = slew(brakeL, maxf(clamp(in[IN_BRAKE_L], 0, 1), park), 4.0, dt);
  brakeR = slew(brakeR, maxf(clamp(in[IN_BRAKE_R], 0, 1), park), 4.0, dt);
  double steerMax = def->steerMaxRad;
  if (assist(AS_TAXI_ASSIST)) steerMax = minf(def->casterMaxRad, steerMax * 2.2);
  double s = rud * steerMax;
  if (gs < 10.0) s += (brakeR - brakeL) * (def->casterMaxRad - def->steerMaxRad) * (1.0 - gs / 10.0);
  s /= (1.0 + gs / 25.0);
  steer = clamp(s, -def->casterMaxRad, def->casterMaxRad);

  // Flaps
  int lever = (int)clamp(in[IN_FLAPS_LEVER], 0, def->flaps.detents - 1);
  double target = def->flaps.angleDeg[lever];
  bool flapPower = !def->flaps.electric || elec.busV > 20.0;
  if (isJet()) flapPower = dmg.hyd > 0.3;
  if (flapPower && !fail[FAIL_FLAPS]) flapDeg = slew(flapDeg, target, def->flaps.rateDegPerSec, dt);

  // Landing gear: hydraulic; without pressure it can only free-fall down
  if (def->gearSys.retractable) {
    double lever = in[IN_GEAR_LEVER] > 0.5 ? 1.0 : 0.0;
    if (onGround && gearPos > 0.9) lever = 1.0;  // squat switch
    double rate = 1.0 / maxf(1.0, def->gearSys.transitS);
    if (dmg.hyd < 0.3) { if (lever > gearPos) gearPos = minf(1.0, gearPos + rate * 0.4 * dt); }
    else gearPos = slew(gearPos, lever, rate, dt);
  } else {
    gearPos = 1.0;
  }
  // Speed brake and ground spoilers (armed: deploy on the ground at idle)
  double sbCmd = clamp(in[IN_SPEEDBRAKE], 0, 1);
  if (in[IN_SPOILER_ARM] > 0.5 && onGround && gs > 15.0 && (in[IN_THROTTLE] < 0.15 || in[IN_REVERSE] > 0.5)) sbCmd = 1.0;  // stay out with reverse thrust
  if (def->spoiler.cdBrake <= 0) sbCmd = 0;
  sb = slew(sb, sbCmd, 1.5 * hydRate, dt);
  // Thrust reversers: on the ground only
  bool mainsDown = gearComp[1] > 0 || gearComp[2] > 0;
  reverser = isJet() && def->jet.reverseFrac > 0 && in[IN_REVERSE] > 0.5 && (onGround || mainsDown);
  // Autothrottle: speed hold on the throttle (velocity-form PI)
  if (isJet() && in[IN_AT_ENGAGED] > 0.5 && eng.running && !reverser) {
    if (iasPrev <= 0.1) iasPrev = ias;  // first step after a reset
    double err = in[IN_AT_SPEED] - ias;
    double accel = clamp((ias - iasPrev) / maxf(dt, 1e-4), -5.0, 5.0);
    double maxT = def->jet.abThrustN > 0 ? 0.92 : 1.0;
    double rate = clamp(0.012 * err - 0.08 * accel, -0.15, 0.15);  // thrust levers move at most 15 %/s
    atThr = clamp(atThr + rate * dt, 0.0, maxT);
  } else {
    atThr = clamp(in[IN_THROTTLE], 0, 1);
  }
  iasPrev = ias;

  // Trim wheel
  trim = clamp(trim + clamp(in[IN_TRIM_RATE], -1, 1) * 0.2 * dt, -1, 1);

  // Mixture
  if (in[IN_MIXTURE] < 0.04) {
    mixture = 0;
  } else if (assist(AS_AUTO_MIXTURE)) {
    AirData air = atm.at(-pos.z);
    double sigma = air.rho / RHO0_ISA;
    mixture = clamp(0.0785 * sqrt(sigma) / 0.083, 0.3, 1.0);
  } else {
    mixture = clamp(in[IN_MIXTURE], 0, 1);
  }
}

// Fly-by-wire: the stick commands load factor (pitch) and roll rate; hands
// off holds the flight path and the bank angle. Protections: load factor,
// angle of attack, bank (where defined), overspeed. Direct law on the
// ground and below 8 m in the flare. The autopilot flies pitch/bank targets.
void Sim::fbw(double dt, double pitchIn, double rollIn, bool airborne, double& pitchOut, double& rollOut) {
  const FbwDef& f = def->fbw;
  const AeroDef& a = def->aero;
  double phi, theta, psi;
  qToEuler(q, phi, theta, psi);
  if (!airborne || groundAgl() < 8.0) {
    fbwI = approach(fbwI, 0.0, 1.5, dt);
    fbwRollI = 0;
    fbwRollHolding = false;
    fbwPathHolding = false;
    pitchOut = clamp(pitchIn + fbwI, -1, 1);
    rollOut = rollIn;
    return;
  }
  double V = maxf(tas, 40.0);
  double cphi = cos(phi), cth = cos(theta);
  double gamma = asin(clamp(-vel.z / maxf(length(vel), 1.0), -1, 1));
  // Elevator needed per g at this flight condition (static stability and
  // pitch damping against the elevator power) -> loop gains are normalised,
  // so the law feels the same from the approach to Mach 2.
  double elevPow = maxf(-a.Cmde * a.deUp, 1e-3);
  double CLg = mass * G0 / maxf(qbar * a.S, 50.0);
  double cmPerG = -a.Cma * CLg / a.CLa - a.Cmq * (a.c / (2.0 * V)) * (G0 / V);
  double elevPerQ = clamp(maxf(cmPerG, 0.002) / elevPow, 0.005, 2.0) * V / G0;  // elevator per rad/s of steady pitch rate
  // ---- pitch: load-factor demand (C*), flight path held hands-off
  double cgam = cos(gamma);
  double nzNeutral = (fabs(phi) < 33 * DEG ? 1.0 / maxf(cphi, 0.5) : 1.0) * cgam;
  double qBase = G0 * (nzNeutral - cgam * cphi) / V;  // turn compensation
  double qCmd;
  if (ap.engaged) {
    fbwPathHolding = false;
    qCmd = clamp(0.9 * (apThetaCmd - theta), -0.08, 0.08) + qBase;
  } else {
    double nzCmd;
    if (fabs(pitchIn) < 0.03) {
      if (!fbwPathHolding && fabs(w.y) < 0.02) { fbwGammaHold = gamma; fbwPathHolding = true; }
      nzCmd = nzNeutral;
      if (fbwPathHolding) nzCmd += clamp(0.35 * (fbwGammaHold - gamma) * V / G0, -0.3, 0.3);
    } else {
      fbwPathHolding = false;
      nzCmd = nzNeutral + (pitchIn >= 0 ? pitchIn * (f.nzMax - 1.0) : pitchIn * (1.0 - f.nzMin));
    }
    nzCmd = clamp(nzCmd, f.nzMin, f.nzMax);
    // pitch rate for that load factor, plus load-factor feedback (C*)
    qCmd = G0 * (nzCmd - cgam * cphi) / V + 0.6 * G0 * (nzCmd - nzFilt) / V;
  }
  (void)cth;
  // pitch attitude protection (Airbus-style laws): +30 / -15 deg
  if (f.bankMax > 0) {
    if (theta > 25 * DEG) qCmd = minf(qCmd, 0.6 * (30 * DEG - theta));
    if (theta < -10 * DEG) qCmd = maxf(qCmd, 0.6 * (-15 * DEG - theta));
  }
  // angle-of-attack protection (fighters with thrust vectoring may go beyond the stall)
  double aMax = def->jet.tvc > 0 ? f.alphaMax : minf(f.alphaMax, stallAngle() - 1.0 * DEG);
  double aLim = aMax - 3.0 * DEG;
  if (alpha > aLim) {
    // alpha rate = q - flight path rate: limit q relative to the path
    double gammaDot = G0 * (nzFilt - cgam * cphi) / V;
    qCmd = minf(qCmd, gammaDot + 2.0 * (aMax - alpha) - 0.4 * alphaDot);
  }
  // overspeed protection: gentle nose-up demand beyond VMO / MMO
  double vmo = def->limits.vnoKias * KT;
  double over = maxf(ias / vmo - 1.02, def->machDef.mmo > 0 ? mach / def->machDef.mmo - 1.01 : 0.0);
  if (over > 0) qCmd = maxf(qCmd, minf(0.05, 0.8 * over));
  double qErr = qCmd - w.y;
  fbwI = clamp(fbwI + 1.5 * elevPerQ * qErr * dt, -1.0, 1.0);
  double ff = elevPerQ * (qCmd - qBase);
  pitchOut = clamp(fbwI + ff + 2.0 * elevPerQ * qErr, -1, 1);
  // auto-trim: offload the integrator into the stabiliser trim (no nose-up
  // trim inside the alpha protection range, limited travel)
  double ratio = elevPow / maxf(a.CmTrimMax, 1e-3);
  bool inhibit = fbwI > 0 && alpha > aLim;
  if (fabs(fbwI) > 0.02 && !inhibit) {
    double nt = clamp(trim + sign(fbwI) * 0.05 * dt, -0.6, 0.6);
    fbwI -= (nt - trim) / ratio;
    trim = nt;
  }
  // ---- roll: rate demand, bank held hands-off, bank angle protection
  double pCmd;
  double bmax = f.bankMax;
  if (ap.engaged) {
    pCmd = clamp(1.2 * (apPhiCmd - phi), -0.15, 0.15);
    fbwRollHolding = false;
  } else if (fabs(rollIn) < 0.03) {
    if (!fbwRollHolding) { fbwPhiHold = fabs(phi) < 3 * DEG ? 0.0 : phi; fbwRollHolding = true; }
    if (bmax > 0 && fabs(fbwPhiHold) > 33 * DEG) fbwPhiHold = sign(fbwPhiHold) * 33 * DEG;  // spiral stability
    double rmax = minf(f.rollRateMax, 0.35);
    pCmd = clamp(1.5 * (fbwPhiHold - phi), -rmax, rmax);
  } else {
    fbwRollHolding = false;
    pCmd = rollIn * f.rollRateMax;
    if (bmax > 0 && sign(pCmd) == sign(phi)) {
      double room = (bmax - fabs(phi) - 0.8 * fabs(w.x)) / (15.0 * DEG);
      if (room < 1.0) pCmd *= maxf(room, 0.0);
      if (fabs(phi) > bmax) pCmd = -sign(phi) * 0.5 * (fabs(phi) - bmax);
    }
  }
  double rollPow = a.Clda * a.daMax + def->spoiler.rollCl;
  double pEff = maxf(0.1, -rollPow / minf(a.Clp, -0.05) * 2.0 * V / a.b);
  double pErr = pCmd - w.x;
  fbwRollI = clamp(fbwRollI + 0.8 * pErr / pEff * dt, -0.3, 0.3);
  rollOut = clamp((pCmd + 1.2 * pErr) / pEff + fbwRollI, -1, 1);
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------
void Sim::updateElectrical(double dt, const AirData&) {
  const ElectricalDef& E = def->elec;
  bool batt = in[IN_BATTERY] > 0.5;
  if (!batt || dmg.elecDead) {
    elec.busV = 0;
    elec.battA = 0;
    elec.avionics = false;
    elec.lowVoltTimer = 0;
    return;
  }
  double loads = 2.0;
  if (in[IN_AVIONICS] > 0.5) loads += 6.5;
  if (in[IN_BEACON] > 0.5) loads += 1.5;
  if (in[IN_NAV_LIGHTS] > 0.5) loads += 1.6;
  if (in[IN_STROBE] > 0.5) loads += 2.5;
  if (in[IN_TAXI_LIGHT] > 0.5) loads += 4.0;
  if (in[IN_LANDING_LIGHT] > 0.5) loads += 6.5;
  if (in[IN_FUEL_PUMP] > 0.5) loads += 3.0;
  if (in[IN_PITOT_HEAT] > 0.5) loads += 7.5;
  int lever = (int)clamp(in[IN_FLAPS_LEVER], 0, def->flaps.detents - 1);
  if (fabs(def->flaps.angleDeg[lever] - flapDeg) > 0.2 && !fail[FAIL_FLAPS]) loads += 9.0;
  if (eng.starter) loads += 140.0;

  double altMax = 0;
  if (in[IN_ALTERNATOR] > 0.5 && !fail[FAIL_ALTERNATOR]) {
    if (isJet()) {
      int gens = 0;
      for (int i = 0; i < def->jet.count; i++) if (jets[i].running && jets[i].n2 > 50.0) gens++;
      altMax = E.altAmps * minf(1.0, gens);
    } else {
      altMax = E.altAmps * smoothstep(E.altMinRpm * 0.85, E.altMinRpm + 700.0, eng.rpm);
    }
  }
  if (altMax > loads + 0.5) {
    elec.busV = E.altVolts;
    double charge = minf(altMax - loads, 2.0 + 30.0 * (1.0 - elec.soc));
    elec.battA = charge;
    elec.soc = minf(1.0, elec.soc + charge * dt / (E.battAh * 3600.0));
  } else {
    double deficit = loads - altMax;
    double ocv = (E.battVolts - 0.8) + 2.0 * elec.soc;
    double v = ocv - deficit * 0.012;
    if (elec.soc < 0.08) v *= elec.soc / 0.08;
    elec.busV = maxf(0, v);
    elec.battA = -deficit;
    elec.soc = maxf(0.0, elec.soc - deficit * dt / (E.battAh * 3600.0));
  }
  elec.avionics = in[IN_AVIONICS] > 0.5 && elec.busV > 20.0;
  if (elec.busV < 24.5) elec.lowVoltTimer += dt; else elec.lowVoltTimer = 0;
  if (elec.busV < 22.0 && !onGround) events |= EV_LOW_VOLTAGE;
}

void Sim::updateFuel(double dt) {
  if (isJet()) {
    for (int i = 0; i < def->jet.count; i++) {
      double burn = jets[i].ff * dt;
      double y = def->jet.pos[i].y;
      int t = y < -0.3 ? 0 : (y > 0.3 ? 1 : (fuelKg[0] >= fuelKg[1] ? 0 : 1));
      if (fuelKg[t] <= 0.0) t = 1 - t;
      fuelKg[t] -= burn;
    }
    fuelKg[0] = maxf(0, fuelKg[0]);
    fuelKg[1] = maxf(0, fuelKg[1]);
    return;
  }
  int sel = (int)in[IN_FUEL_SELECTOR];
  double burn = eng.fuelFlow * dt;
  if (burn > 0) {
    if (sel == 2) {
      bool l = fuelKg[0] > 0.0, r = fuelKg[1] > 0.0;
      if (l && r) { fuelKg[0] -= burn * 0.5; fuelKg[1] -= burn * 0.5; }
      else if (l) fuelKg[0] -= burn;
      else if (r) fuelKg[1] -= burn;
    } else if (sel == 1) {
      fuelKg[0] -= burn;
    } else if (sel == 3) {
      fuelKg[1] -= burn;
    }
  }
  if (fail[FAIL_FUEL_LEAK_L]) fuelKg[0] -= 0.006 * dt;
  fuelKg[0] = maxf(0, fuelKg[0]);
  fuelKg[1] = maxf(0, fuelKg[1]);
}

// Turbofans. N1 follows the throttle with spool-up lag (slow off idle);
// thrust = static thrust x spool fraction x lapse(density, Mach); fuel from
// TSFC. Start: starter (magnetos START) spins N2 to ~25 %, fuel lever on ->
// light-off. Afterburner above the 92 % throttle detent where fitted.
void Sim::updateJets(double dt, const AirData& air) {
  const JetDef& J = def->jet;
  double sigma = air.rho / RHO0_ISA;
  double thr = atThr;
  bool abCap = J.abThrustN > 0;
  double mil = abCap ? clamp(thr / 0.92, 0, 1) : clamp(thr, 0, 1);
  double abFrac = abCap && thr > 0.92 ? clamp((thr - 0.92) / 0.08, 0, 1) : 0.0;
  int mags = (int)in[IN_MAGNETOS];
  bool fuelLever = in[IN_MIXTURE] > 0.04;
  bool tankFuel = fuelKg[0] > 0.3 || fuelKg[1] > 0.3;
  bool power = elec.busV > 18.0;
  bool easy = assist(AS_EASY_START);
  // high-bypass fans lose thrust quickly with speed at first (ram drag),
  // then flatten (ram recovery); low-bypass engines gain from ram pressure
  double mLapse = J.lapseM < 0 ? 1.0 + 2.0 * J.lapseM * mach - 1.2 * J.lapseM * mach * mach : 1.0 + J.lapseM * mach;
  double lapse = maxf(0.05, pow(sigma, J.densExp) * mLapse);
  double lapseAb = maxf(0.05, pow(sigma, 0.7) * (1.0 + 0.5 * mach));
  double wmN = clamp(ias / KT * 0.07, 0.0, 22.0);  // windmilling
  double total = 0, ff = 0, n1s = 0, n2s = 0, egts = 0;
  int running = 0;
  for (int i = 0; i < J.count; i++) {
    JetState& e = jets[i];
    bool handle = (((int)in[IN_FIRE_HANDLES]) >> i) & 1;
    bool failed = dmg.eng[i] >= 0.55 || (i == 0 && fail[FAIL_ENGINE]);
    bool fuel = fuelLever && tankFuel && !handle && !failed;
    if (!e.running) {
      // pneumatic starter motors N2 to ~25 % (max motoring), fuel lever on -> light-off
      bool starting = mags == 4 && power && !failed;
      if (starting) e.n2 = minf(28.0, e.n2 + (easy ? 2.6 : 1.15) * clamp((29.0 - e.n2) / 7.0, 0.12, 1.0) * dt);
      else e.n2 = approach(e.n2, wmN, 5.0, dt);
      e.n1 = approach(e.n1, starting ? 0.3 * e.n2 : wmN, 2.5, dt);
      if (starting && fuel && e.n2 > 20.0) { e.running = true; e.lit = true; }
    } else if (!fuel || mags == 0) {
      e.running = false;
      e.lit = false;
      if (failed && i == 0 && fail[FAIL_ENGINE]) events |= EV_ENGINE_FAIL;
      if (!tankFuel) events |= EV_FUEL_STARVATION;
    }
    if (e.running && e.lit) {
      // light-off to stabilised idle (~25 s): starter assisted until ~56 % N2
      e.n2 = minf(58.0, e.n2 + (easy ? 3.0 : 1.4) * dt);
      e.n1 = approach(e.n1, J.idleN1 * clamp((e.n2 - 18.0) / 40.0, 0, 1), 1.0, dt);
      e.egt = approach(e.egt, 960.0, 4.0, dt);
      e.thrust = J.thrustN * J.idleFrac * lapse * clamp((e.n2 - 20.0) / 38.0, 0, 1);
      e.ff = J.tsfc * J.thrustN * 0.05 * sigma * clamp((e.n2 - 15.0) / 43.0, 0.3, 1);
      e.ab = false;
      if (e.n2 >= 58.0) e.lit = false;
      running++;
    } else if (e.running) {
      double target = J.idleN1 + (100.0 - J.idleN1) * (reverser ? clamp(thr, 0, 1) : mil);
      if (dmg.eng[i] > 0.25) target = minf(target, 100.0 - 70.0 * dmg.eng[i]);
      double x0 = clamp((e.n1 - J.idleN1) / (100.0 - J.idleN1), 0, 1);
      double up = target > e.n1;
      double tau = (up ? J.spoolUp * (1.0 + 1.5 * (1.0 - x0) * (1.0 - x0)) : J.spoolDown) / 3.0;
      e.n1 += (target - e.n1) * clamp(dt / tau, 0, 1);
      double x = clamp((e.n1 - J.idleN1) / (100.0 - J.idleN1), 0, 1.05);
      e.n2 = approach(e.n2, 58.0 + 42.0 * x, 0.5, dt);
      double frac = J.idleFrac + (1.0 - J.idleFrac) * pow(x, 1.6);
      double T = J.thrustN * frac * lapse;
      double Tab = 0;
      e.ab = abFrac > 0 && e.n1 > 95.0 && !reverser;
      if (e.ab) Tab = (J.abThrustN - J.thrustN) * abFrac * lapseAb;
      e.thrust = reverser ? -J.reverseFrac * T : T + Tab;
      e.ff = J.tsfc * (1.0 + 0.6 * mach) * maxf(T, J.thrustN * 0.05 * sigma) + J.abTsfc * Tab;
      e.egt = approach(e.egt, 773.0 + 400.0 * x + (e.ab ? 150.0 : 0.0) + (e.fire ? 350.0 : 0.0), 2.0, dt);
      running++;
    } else {
      e.thrust = -0.0015 * J.thrustN * sq(tas / 100.0);
      e.ff = 0;
      e.ab = false;
      e.egt = approach(e.egt, air.T + (e.fire ? 600.0 : 0.0), 6.0, dt);
    }
    // engine fire: damage spreads to the engine and the wing; the fire handle
    // cuts fuel and fires the bottle (out after ~2 s)
    if (e.fire) {
      events |= EV_ENGINE_FIRE;
      dmg.eng[i] = minf(1.0, dmg.eng[i] + 0.03 * dt);
      int side = J.pos[i].y < 0 ? 0 : 1;
      if (fabs(J.pos[i].y) > 0.5) dmg.wing[side] += 0.004 * dt;
      else dmg.fuselage += 0.002 * dt;
      if (handle) { e.fireTimer += dt; if (e.fireTimer > 2.0) e.fire = false; }
    }
    total += e.thrust;
    ff += e.ff;
    n1s += e.n1;
    n2s += e.n2;
    egts += e.egt;
  }
  int n = maxf(1, J.count);
  eng.thrust = total;
  eng.fuelFlow = ff;
  eng.rpm = n1s / n;
  eng.running = running > 0;
  eng.egt = egts / n;
  eng.oilP = approach(eng.oilP, running ? 45.0 : 0.0, 2.0, dt);
  eng.oilT = approach(eng.oilT, running ? 360.0 : air.T, 120.0, dt);
  eng.starter = false;
  for (int i = 0; i < J.count; i++) if (mags == 4 && (!jets[i].running || jets[i].lit)) eng.starter = true;
  eng.power = total * tas;
  eng.propAngle = 0;
}

void Sim::updateDamage(double dt) {
  for (int s = 0; s < 2; s++) {
    if (!dmg.wingLost[s] && dmg.wing[s] >= 1.0) { dmg.wingLost[s] = true; events |= EV_PART_LOST; }
  }
  if (!dmg.tailLost && dmg.tail >= 1.0) { dmg.tailLost = true; events |= EV_PART_LOST; }
  if (dmg.fuselage >= 1.0) { crash(CR_BREAKUP); return; }
  double engMax = 0;
  for (int i = 0; i < 4; i++) engMax = maxf(engMax, dmg.eng[i]);
  // hydraulics: engine pumps or the ram-air turbine; leaks from damage
  bool pumps = eng.running || tas > 55.0;
  double leak = clamp(0.9 * maxf(dmg.wing[0], dmg.wing[1]) + 0.7 * dmg.tail + 0.4 * engMax, 0, 1);
  dmg.hyd = approach(dmg.hyd, pumps ? 1.0 - leak : 0.0, 1.5, dt);
  // fuel leaks from damaged wing tanks
  double rate = isJet() ? 3.0 : 0.05;
  dmg.fuelLeak = rate * (minf(1.0, dmg.wing[0]) + minf(1.0, dmg.wing[1])) * (dmg.wing[0] > 0.15 || dmg.wing[1] > 0.15 ? 1.0 : 0.0);
  fuelKg[0] = maxf(0.0, fuelKg[0] - rate * (dmg.wing[0] > 0.15 ? minf(1.0, dmg.wing[0]) : 0.0) * dt);
  fuelKg[1] = maxf(0.0, fuelKg[1] - rate * (dmg.wing[1] > 0.15 ? minf(1.0, dmg.wing[1]) : 0.0) * dt);
  // electrical: wiring in the fuselage
  dmg.elecDead = dmg.fuselage > 0.65;
  // without hydraulics or with the tail gone, fly-by-wire degrades to direct law
  if (def->law == ControlLaw::FlyByWireG && (dmg.hyd < 0.3 || dmg.tailLost || dmg.elecDead)) fbwNormal = false;
}

void Sim::updateEngine(double dt, const AirData& air, double axial) {
  const PropEngineDef& P = def->prop;
  int mags = (int)in[IN_MAGNETOS];
  bool ignition = mags >= 1;
  double magFactor = (mags >= 3) ? 1.0 : (mags >= 1 ? 0.965 : 0.0);

  int sel = (int)in[IN_FUEL_SELECTOR];
  bool tankFuel = (sel == 2 && (fuelKg[0] > 0.05 || fuelKg[1] > 0.05)) ||
                  (sel == 1 && fuelKg[0] > 0.05) || (sel == 3 && fuelKg[1] > 0.05);
  // The engine-driven pump turns whenever the crankshaft does (also while cranking).
  bool pump = (in[IN_FUEL_PUMP] > 0.5 && elec.busV > 20.0) || eng.rpm > 100.0;
  bool fuelOK = tankFuel && in[IN_FUEL_SHUTOFF] > 0.5 && pump;
  // Lines only run dry while the engine draws fuel (running or cranking).
  if (fuelOK || (!eng.running && !eng.starter)) eng.starve = 0; else eng.starve += dt;
  bool fuelAvail = eng.starve < 4.0 && tankFuel && in[IN_FUEL_SHUTOFF] > 0.5;

  double sigma = air.rho / RHO0_ISA;
  eng.far = mixture < 0.04 ? 0.0 : mixture * 0.083 / sqrt(sigma);
  bool farOK = eng.far > 0.048 && eng.far < 0.135;
  bool easy = assist(AS_EASY_START);

  // Priming (fuel-injected engine: aux pump with mixture rich).
  if (!eng.running && in[IN_FUEL_PUMP] > 0.5 && elec.busV > 20.0 && fuelAvail && mixture > 0.5 && !eng.starter)
    eng.prime += dt;
  else if (!eng.running)
    eng.prime = maxf(0.0, eng.prime - 0.01 * dt);

  // Starter
  eng.starter = (mags == 4) && elec.busV > 18.0 && !eng.running;
  if (mags == 4 && eng.running) eng.starter = false;
  if (eng.starter) {
    bool warm = eng.oilT > 320.0;
    bool flooded = eng.prime > 14.0;
    if (flooded && mixture < 0.1 && in[IN_THROTTLE] > 0.8) eng.prime = maxf(0.0, eng.prime - 2.0 * dt);
    bool primed = easy || warm ? true : (eng.prime >= 1.5 && !flooded);
    if (warm && flooded) primed = false;
    if (ignition && fuelAvail && farOK && eng.rpm > 120.0 && primed && !fail[FAIL_ENGINE]) {
      eng.crankTime += dt;
      if (eng.crankTime > eng.catchTime) {
        eng.running = true;
        eng.crankTime = 0;
        eng.catchTime = 0.8 + 1.4 * rng.uniform();
        eng.prime = 0;
      }
    }
  } else {
    eng.crankTime = 0;
  }

  // Shutdown conditions
  if (eng.running) {
    if (!ignition) eng.running = false;
    else if (!farOK) eng.running = false;
    else if (!fuelAvail) { eng.running = false; events |= EV_FUEL_STARVATION; }
    else if (fail[FAIL_ENGINE]) { eng.running = false; events |= EV_ENGINE_FAIL; }
    else if (eng.rpm < 200.0 && !eng.starter) eng.running = false;
  }

  // Manifold pressure & power.
  // Indicated power ~ MAP x rpm (charge mass flow); losses = mechanical
  // friction (~rpm^2) + pumping work across the throttle plate.
  double rpmFrac = eng.rpm / P.rpmRated;
  double t = clamp(in[IN_THROTTLE], 0, 1);
  double rFull = 0.97 - 0.03 * rpmFrac;
  double rIdle = 0.40 - 0.10 * rpmFrac;
  // Intake vacuum builds with air flow: near ambient while cranking.
  double vac = smoothstep(150.0, 700.0, eng.rpm);
  double mapRatio = 1.0 - (1.0 - (rFull - (rFull - rIdle) * pow(1.0 - t, 1.7))) * vac;
  eng.map = air.p * mapRatio;
  double pIndMax = (P.pMaxW + P.frictionW + P.pumpW * 0.06) / 0.94;
  double tempCorr = sqrt(T0_ISA / air.T);
  double dev = eng.far - 0.0785;
  double mix = dev > 0 ? 1.0 - 0.7 * sq(dev / 0.06) : 1.0 - 2.5 * sq(dev / 0.06);
  mix = clamp(mix, 0, 1);
  double roughF = fail[FAIL_ENGINE_ROUGH] ? 0.62 + 0.12 * sin(simTime * 23.0) * sin(simTime * 7.0) : 1.0;
  double pInd = eng.running ? pIndMax * (eng.map / P0_ISA) * rpmFrac * tempCorr * mix * magFactor * roughF : 0.0;
  eng.rough = eng.running ? clamp((1.0 - roughF) * 2.0 + (1.0 - magFactor) * 4.0 + (1.0 - mix) * 2.0, 0, 1) : 0.0;

  double omega = eng.rpm * 2.0 * PI / 60.0;
  double n = eng.rpm / 60.0;
  double D = P.propD;
  double Va = maxf(0.0, axial);
  double J = n > 0.5 ? Va / (n * D) : 3.0;
  double Ct = P.ct0 + P.ct1 * J + P.ct2 * J * J;
  double Cp = P.cp0 + P.cp1 * J + P.cp2 * J * J;
  double D4 = D * D * D * D, D5 = D4 * D;
  eng.thrust = Ct * air.rho * n * n * D4;
  double qProp = Cp * air.rho * n * n * D5 / (2.0 * PI);
  if (n < 2.0) qProp -= 0.0004 * air.rho * Va * Va * D * D * D;  // windmill start torque
  double omegaRated = P.rpmRated * 2.0 * PI / 60.0;
  double pumpQ = (P.pumpW / omegaRated) * maxf(0.0, (air.p - eng.map) / P0_ISA);
  double qFric = (P.frictionW / omegaRated) * rpmFrac + pumpQ + (eng.running ? 0.0 : 14.0);
  if (omega < 0.5) qFric = (eng.running ? 0.0 : 14.0);
  double qInd = omega > 1.0 ? pInd / omega : pInd / 1.0;
  double qSt = 0;
  if (eng.starter) qSt = maxf(0.0, 120.0 * (1.0 - omega / 36.0)) * clamp((elec.busV - 16.0) / 8.0, 0, 1);
  double net = qInd + qSt - qProp - (omega > 0.05 ? qFric : minf(qFric, qInd + qSt - qProp));
  omega = maxf(0.0, omega + net / P.inertia * dt);
  if (!eng.running && !eng.starter && omega < 2.0 && net <= 0) omega = maxf(0.0, omega - 4.0 * dt);
  eng.omega = omega;
  eng.rpm = omega * 60.0 / (2.0 * PI);
  eng.torqueProp = qProp;
  eng.power = pInd - P.frictionW * rpmFrac * rpmFrac - pumpQ * omega;
  eng.propAngle = wrap2Pi(eng.propAngle + omega * dt);

  // Fuel flow (air mass flow x fuel/air ratio)
  eng.fuelFlow = eng.running ? 0.1307 * (eng.map / P0_ISA) * rpmFrac * tempCorr * eng.far : 0.0;
  if (eng.starter && eng.prime > 0) eng.fuelFlow += 0.0005;

  // Temperatures / pressures
  double egtTarget = eng.running ? (650.0 + 520.0 * sqrt(clamp(pInd / pIndMax, 0, 1)) * (0.55 + 0.45 * exp(-sq((eng.far - 0.067) / 0.02)))) : air.T;
  eng.egt = approach(eng.egt, egtTarget, eng.running ? 6.0 : 40.0, dt);
  double oilTarget = eng.running ? 335.0 + 40.0 * clamp(pInd / pIndMax, 0, 1) : air.T;
  eng.oilT = approach(eng.oilT, oilTarget, 240.0, dt);
  double oilPTarget = eng.running ? 22.0 + 55.0 * smoothstep(500.0, 1800.0, eng.rpm) - 0.04 * (eng.oilT - 345.0) : 0.0;
  eng.oilP = approach(eng.oilP, oilPTarget, 1.5, dt);
}

// ---------------------------------------------------------------------------
// Aerodynamics (body-axis forces and moments)
// ---------------------------------------------------------------------------
void Sim::aero(const AirData& air, const Vec3& vb, Vec3& F, Vec3& M) {
  const AeroDef& a = def->aero;
  F = {0, 0, 0};
  M = {0, 0, 0};
  double V = length(vb);
  double ff = def->flaps.maxDeg > 0 ? flapDeg / def->flaps.maxDeg : 0.0;

  // Propeller slipstream increases dynamic pressure over the tail.
  double qSlip = 0;
  if (def->prop.propD > 0) qSlip = a.tailSlipstream * maxf(0.0, eng.thrust) / (PI * sq(def->prop.propD) * 0.25);
  double qTail = qbar + qSlip;
  // Damage: a damaged or missing tail loses stability and control power;
  // a damaged wing loses lift on its side (rolling moment) and its aileron.
  double kTail = dmg.tailLost ? 0.0 : 1.0 - 0.5 * minf(1.0, dmg.tail);
  double lossL = dmg.wingLost[0] ? 0.42 : 0.25 * minf(1.0, dmg.wing[0]);
  double lossR = dmg.wingLost[1] ? 0.42 : 0.25 * minf(1.0, dmg.wing[1]);
  double kAil = 1.0 - 0.5 * ((dmg.wingLost[0] ? 1.0 : 0.3 * minf(1.0, dmg.wing[0])) + (dmg.wingLost[1] ? 1.0 : 0.3 * minf(1.0, dmg.wing[1])));
  double de = elev > 0 ? -elev * a.deUp : -elev * a.deDown;  // TE down positive
  double da = ail * a.daMax;
  double dr = rud * a.drMax;

  // Control surface forces that also work at zero airspeed (prop wash).
  // Elevator + trim moment, saturating as the horizontal tail approaches its own stall.
  double cmCtl = a.Cmde * de + a.CmTrimMax * trim;
  cmCtl = cmCtl > 0 ? a.CmElevMaxUp * tanh_(cmCtl / a.CmElevMaxUp) : a.CmElevMaxDown * tanh_(cmCtl / a.CmElevMaxDown);
  M.y += qTail * a.S * a.c * cmCtl * kTail;
  F.z -= qTail * a.S * a.CLde * de * kTail;
  F.y += qTail * a.S * a.CYdr * dr * kTail;
  M.z += qTail * a.S * a.b * a.Cndr * dr * kTail;
  M.x += qTail * a.S * a.b * a.Cldr * dr * kTail;

  stallWarn = false;
  if (V < 0.5) { stalled = false; return; }

  double alphaS = stallAngle();
  double alphaSN = -14.0 * DEG;
  double CL0e = a.CL0 + a.CLflapFull * pow(ff, def->flaps.liftExp > 0 ? def->flaps.liftExp : 0.85);
  const double rnd = 4.0 * DEG;
  auto CLlin = [&](double al) { return CL0e + a.CLa * al; };
  double CLatt;
  if (alpha > alphaS - rnd) {
    double x = minf(alpha, alphaS) - (alphaS - rnd);
    CLatt = CLlin(alphaS - rnd) + a.CLa * x - a.CLa * x * x / (2 * rnd);
  } else if (alpha < alphaSN + rnd) {
    double x = (alphaSN + rnd) - maxf(alpha, alphaSN);
    CLatt = CLlin(alphaSN + rnd) - a.CLa * x + a.CLa * x * x / (2 * rnd);
  } else {
    CLatt = CLlin(alpha);
  }
  const double blend = 8.0 * DEG;
  double sigma = alpha >= 0 ? smoothstep(alphaS, alphaS + blend, alpha)
                            : smoothstep(-alphaSN, -alphaSN + blend, -alpha);
  double CLfp = a.CLpostScale * sin(2.0 * alpha);

  // Ground effect
  double hw = maxf(0.1, groundAgl() + a.wingHeight);
  double r16 = 16.0 * hw / a.b;
  double ge = r16 * r16 / (1.0 + r16 * r16);

  double CLw = ((1.0 - sigma) * CLatt + sigma * CLfp) * (1.0 + 0.6 * (1.0 - ge) * (1.0 - sigma));
  double pHat = w.x * a.b / (2.0 * V), qHat = w.y * a.c / (2.0 * V), rHat = w.z * a.b / (2.0 * V);
  double adHat = alphaDot * a.c / (2.0 * V);
  double CL = CLw + (a.CLq * qHat + a.CLadot * adHat) * (1.0 - sigma);
  // spoilers / speed brake: lift dump (full on the ground), drag
  double dump = def->spoiler.clDump * sb * (onGround ? 1.0 : 0.3);
  CL *= 1.0 - dump;
  // damaged wings
  double ClDmg = 0.15 * CL * (lossR - lossL);
  CL *= 1.0 - 0.5 * (lossL + lossR);

  // Compressibility: wave drag beyond the critical Mach number (Lock's
  // 20 (M - Mcrit)^4, capped at the transonic peak, falling off supersonic).
  double CDwave = 0, kInd = a.kInduced;
  const MachDef& md = def->machDef;
  if (md.cdWave > 0 && mach > md.mcrit) {
    double Mp = 1.05;
    if (mach < Mp) CDwave = minf(md.cdWave, 20.0 * sq(sq(mach - md.mcrit)) + md.cdWave * sq(smoothstep(0.95, Mp, mach)));
    else CDwave = md.cdWave * pow(Mp / mach, 1.2);
    if (mach > 0.95) kInd *= 1.0 + 0.8 * (mach - 0.95);
  }

  double flapDrag = a.CDflapFull * pow(ff, 1.6);
  double extraDrag = def->gearSys.cdGear * gearPos + def->spoiler.cdBrake * sb + CDwave +
                     0.03 * (minf(1.0, dmg.wing[0]) + minf(1.0, dmg.wing[1])) + 0.02 * minf(1.0, dmg.fuselage) +
                     (dmg.gearLost[0] || dmg.gearLost[1] || dmg.gearLost[2] ? 0.01 : 0.0);
  double CDatt = a.CD0 + kInd * ge * CLw * CLw + flapDrag;
  double CDpost = a.CD0 + a.CDpostScale * sq(sin(alpha)) + flapDrag + 0.2 * kInd * CLw * CLw;
  double CD = (1.0 - sigma) * CDatt + sigma * CDpost + 0.25 * sq(sin(beta)) + extraDrag;

  // stability with a damaged tail (the wing-body alone is unstable in pitch and yaw)
  double Cma = a.Cma * kTail + 0.25 * (1.0 - kTail);
  double Cmq = a.Cmq * (0.15 + 0.85 * kTail);
  double Cnb = a.Cnb * kTail - 0.02 * (1.0 - kTail);
  double Cnr = a.Cnr * (0.2 + 0.8 * kTail);
  double CY = a.CYb * beta + a.CYp * pHat + a.CYr * rHat;
  double hydAil = isJet() ? clamp(dmg.hyd * 1.5, 0, 1) : 1.0;
  double Cl = a.Clb * beta * (1.0 + 2.0 * sigma) + a.Clp * pHat * (1.0 - 0.85 * sigma) +
              (a.Clr + a.ClrPerCL * CL) * rHat + (a.Clda * da * kAil + def->spoiler.rollCl * ail * hydAil) * (1.0 - 0.5 * sigma) +
              sigma * stallAsym + ClDmg;
  double Cn = Cnb * beta + (a.Cnp + a.CnpPerCL * CL) * pHat + Cnr * rHat + a.Cnda * da * kAil;
  double Cm = a.Cm0 * (1.0 - sigma) + Cma * sin(alpha) + Cmq * qHat + a.Cmadot * adHat * kTail +
              a.CmFlapFull * ff + a.CmStallBreak * sigma;

  dbgCL = CL; dbgCD = CD; dbgSigma = sigma;
  Vec3 vhat = vb / V;
  Vec3 lift = normalize(Vec3{vhat.z, 0.0, -vhat.x});
  double qs = qbar * a.S;
  F += lift * (qs * CL) - vhat * (qs * CD) + Vec3{0, qs * CY, 0};
  M += Vec3{qs * a.b * Cl, qs * a.c * Cm, qs * a.b * Cn};

  bool wasStalled = stalled;
  stalled = sigma > 0.25 && !onGround;
  if (stalled && !wasStalled) {
    stallAsym = (rng.uniform() - 0.5) * (simMode ? 0.05 : 0.012);
    events |= EV_STALL;
  }
  stallWarn = alpha > alphaS - a.stallWarnMargin && (!onGround || ias > 20.0) && V > 8.0;
}

// ---------------------------------------------------------------------------
// Gear and structural contact with the ground plane
// ---------------------------------------------------------------------------
void Sim::contacts(double dt, Vec3& Fned, Vec3& Mb) {
  (void)dt;
  Fned = {0, 0, 0};
  Mb = {0, 0, 0};
  bool anyWheel = false;
  double skidAcc = 0, scrapeAcc = 0, wheelV = 0;
  double tol = assist(AS_CRASH_TOLERANT) ? 1.7 : 1.0;
  int surf = ground.surface;
  double muRoll = 0.02, muLat = 0.85, muBrake = 0.40;
  if (surf == SURF_GRASS) { muRoll = 0.06; muLat = 0.55; muBrake = 0.28; }
  Vec3 n = ground.nNed;  // up-pointing normal in NED

  bool retract = def->gearSys.retractable != 0;
  for (int i = 0; i < def->nGear; i++) {
    const GearPointDef& g = def->gear[i];
    // retracted or separated gear legs, separated wing tips and tail
    bool gone = false;
    if (g.isWheel && i < 3) gone = dmg.gearLost[i] || (retract && gearPos < 0.3);
    if (g.tag == 2) gone = dmg.wingLost[g.pos.y < 0 ? 0 : 1];
    if (g.tag == 1) gone = dmg.tailLost;
    if (gone) { gearComp[i] = 0; anchorSet[i] = false; continue; }
    Vec3 rw = qrot(q, g.pos);
    Vec3 P = pos + rw;
    double hg = ground.heightAt(P.x, P.y);
    double pen = hg - (-P.z);
    if (pen <= 0) { gearComp[i] = 0; anchorSet[i] = false; continue; }
    double d = pen * (-n.z);
    Vec3 vP = vel + qrot(q, cross(w, g.pos));
    double dd = -dot(vP, n);
    bool firstContact = gearComp[i] <= 0.0;
    gearComp[i] = d;

    if (surf == SURF_WATER) { crash(CR_WATER); return; }

    double k = g.k, c = g.c;
    if (d > g.travel) k *= 12.0;
    double Fn = k * d + c * dd;
    if (Fn < 0) Fn = 0;

    if (g.isWheel) {
      // A leg fails (separates) beyond its design sink rate or when it is not
      // down and locked; the airframe then lands on its belly / nacelles.
      // Only a far harder impact destroys the aircraft outright.
      double vc = def->limits.vsGearCollapse * tol;
      bool unlocked = retract && gearPos < 0.98;
      bool overload = ((firstContact || dd > 0) && dd > vc) || (d > g.travel * 1.6 && dd > 1.5 * tol);
      if (overload || (unlocked && firstContact)) {
        if (dd > vc * 2.2) { crash(CR_GEAR_COLLAPSE); return; }
        if (i < 3) {
          dmg.gearLost[i] = true;
          events |= EV_PART_LOST | EV_DAMAGE;
          damage(PART_FUSELAGE, 0.06 + 0.05 * maxf(0.0, dd - vc));
          if (i == 0 && !isJet() && eng.rpm > 100) { events |= EV_PROP_STRIKE; fail[FAIL_ENGINE] = true; }
          gearComp[i] = 0;
          continue;
        }
      }
      anyWheel = true;
      double s = g.steer ? steer : 0.0;
      Vec3 fwd = qrot(q, Vec3{cos(s), sin(s), 0.0});
      fwd = normalize(fwd - n * dot(fwd, n));
      Vec3 lat = cross(n, fwd);
      double vLong = dot(vP, fwd), vLat = dot(vP, lat);
      double b = g.brake == 1 ? brakeL : (g.brake == 2 ? brakeR : 0.0);
      double mu = muRoll + b * muBrake;
      double fLong = -mu * Fn * clamp(vLong / 0.25, -1, 1);
      // Static friction for a held brake: spring anchor until it breaks away.
      if (b > 0.3 && fabs(vLong) < 0.3) {
        if (!anchorSet[i]) { anchorSet[i] = true; anchorN[i] = P.x; anchorE[i] = P.y; }
        double disp = (P.x - anchorN[i]) * fwd.x + (P.y - anchorE[i]) * fwd.y;
        double fs = -60000.0 * disp - 6000.0 * vLong;
        double cap = (muRoll + b * muBrake * 1.6) * Fn;  // static > sliding friction
        if (fabs(fs) > cap) anchorSet[i] = false;
        else fLong = fs;
      } else {
        anchorSet[i] = false;
      }
      double latSat = maxf(0.25, 0.12 * fabs(vLong));
      double fLat = -muLat * Fn * clamp(vLat / latSat, -1, 1);
      if (fabs(vLat) > latSat * 1.3 && fabs(vLong) > 3) skidAcc += minf(1.0, fabs(vLat) / 6.0);
      if (b > 0.6 && fabs(vLong) > 4) skidAcc += 0.3 * b;
      if (!g.steer) wheelV += fabs(vLong) * 0.5;
      Vec3 F = n * Fn + fwd * fLong + lat * fLat;
      Fned += F;
      Mb += cross(g.pos, qrotInv(q, F));
    } else {
      // Structure on the ground: damage from the impact and from sliding;
      // only a violent impact is an immediate crash.
      double speed = length(vP);
      double impact = maxf(0.0, dd);
      int side = g.pos.y < 0 ? 0 : 1;
      if (g.tag == 1) {
        events |= EV_TAIL_STRIKE;
        if (impact > 6.0 * tol) { crash(CR_TERRAIN); return; }
        if (speed > 2.0) damage(PART_TAIL, 0.0008 * speed * dt);
      } else if (g.tag == 2) {
        events |= EV_WINGTIP_STRIKE;
        if (impact > 5.0 * tol || (speed > 45.0 * tol && impact > 2.5 * tol)) { crash(CR_WING_STRIKE); return; }
        if (speed > 2.0) damage(side == 0 ? PART_WING_L : PART_WING_R, 0.004 * speed * dt / tol);
      } else if (g.tag == 3) {
        if (eng.rpm > 100) { events |= EV_PROP_STRIKE; fail[FAIL_ENGINE] = true; }
        if (impact > 7.0 * tol) { crash(CR_TERRAIN); return; }
      } else if (g.tag == 5) {
        if (impact > 5.0 * tol) { crash(CR_TERRAIN); return; }
        if (speed > 2.0) hitPart(5, i, 0.0, 0.12 * speed * dt / tol);
      } else {
        if (impact > 6.0 * tol) { crash(CR_TERRAIN); return; }
        if (speed > 2.0) damage(PART_FUSELAGE, 0.0006 * speed * dt / tol);
      }
      if (firstContact && (impact > 0.6 || speed > 8.0)) hitPart(g.tag, i, impact / tol, speed / tol);
      if (crashed) return;
      scrapeAcc += minf(1.0, speed / 10.0);
      Vec3 vt = vP - n * dot(vP, n);
      double vtl = length(vt);
      Vec3 fr = vtl > 1e-6 ? vt * (-0.5 * Fn * clamp(vtl / 0.3, 0, 1) / vtl) : Vec3{0, 0, 0};
      Vec3 F = n * Fn + fr;
      Fned += F;
      Mb += cross(g.pos, qrotInv(q, F));
    }
  }
  onGround = anyWheel;
  skid = minf(1.0, skidAcc);
  scrape = minf(1.0, scrapeAcc);
  wheelSpeed = wheelV;
}

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------
void Sim::updateInstruments(double dt, const AirData& air) {
  double phi, theta, psi;
  qToEuler(q, phi, theta, psi);
  double alt = -pos.z;
  bool perfect = !simMode || assist(AS_PERFECT_GYROS) || isJet();

  // Pitot-static
  if (fail[FAIL_PITOT]) {
    double altInd = indicatedAltitude(air.p, in[IN_BARO]);
    ins.ias = maxf(0.0, ins.ias + 0.01 * (altInd - ins.altPrev));
  } else {
    ins.ias = approach(ins.ias, ias, 0.12, dt);
  }
  double altInd = indicatedAltitude(air.p, in[IN_BARO] > 50000 ? in[IN_BARO] : P0_ISA);
  ins.alt = approach(ins.alt, altInd, 0.15, dt);
  double vsRaw = (ins.alt - ins.altPrev) / dt;
  ins.altPrev = ins.alt;
  ins.vs = approach(ins.vs, vsRaw, 1.1, dt);
  (void)alt;

  // Vacuum & gyros
  ins.suction = isJet() ? 5.0 : (fail[FAIL_VACUUM] ? 0.0 : 5.0 * smoothstep(450.0, 1300.0, eng.rpm));
  if (perfect) {
    ins.gyroSpin = 1.0;
  } else {
    double tgt = clamp(ins.suction / 3.8, 0, 1);
    ins.gyroSpin = approach(ins.gyroSpin, tgt, tgt > ins.gyroSpin ? 20.0 : 90.0, dt);
  }
  if (ins.gyroSpin > 0.75) {
    ins.aiErrP = approach(ins.aiErrP, 0, 40.0, dt);
    ins.aiErrR = approach(ins.aiErrR, 0, 40.0, dt);
  } else {
    double k = (0.75 - ins.gyroSpin) * 5.0 * DEG;
    ins.aiErrP = clamp(ins.aiErrP + (rng.uniform() - 0.45) * k * dt * 4.0, -60 * DEG, 60 * DEG);
    ins.aiErrR = clamp(ins.aiErrR + (rng.uniform() - 0.35) * k * dt * 6.0, -90 * DEG, 90 * DEG);
  }
  ins.aiPitch = theta + ins.aiErrP;
  ins.aiRoll = phi + ins.aiErrR;

  double mag = magHeading();
  if (perfect) {
    ins.hiDrift = 0;
  } else {
    ins.hiDrift += (0.0035 * DEG + (ins.gyroSpin < 0.6 ? (0.6 - ins.gyroSpin) * 3.0 * DEG : 0.0)) * dt;
  }
  ins.hi = wrap2Pi(mag + ins.hiDrift);

  // Magnetic compass: damped second-order follower.
  double cerr = wrapPi(mag - ins.compass);
  ins.compassRate += (4.0 * cerr - 2.4 * ins.compassRate) * dt;
  ins.compass = wrap2Pi(ins.compass + ins.compassRate * dt);

  // Turn coordinator (electric) and inclinometer ball.
  if (elec.busV > 18.0) {
    double cth = maxf(cos(theta), 0.2);
    double yawRate = (w.y * sin(phi) + w.z * cos(phi)) / cth;
    ins.turnRate = approach(ins.turnRate, yawRate + 0.25 * w.x, 0.35, dt);
  } else {
    ins.turnRate = approach(ins.turnRate, 0, 3.0, dt);
  }
  double nzv = maxf(-accelBody.z / G0, 0.3);
  double ballT = clamp(-(accelBody.y / G0) / nzv * 5.0, -1, 1);
  ins.ball = approach(ins.ball, ballT, 0.25, dt);
}

// ---------------------------------------------------------------------------
// One fixed physics step
// ---------------------------------------------------------------------------
void Sim::step(double dt) {
  simTime += dt;
  if (crashed) {
    vel = {0, 0, 0};
    w = {0, 0, 0};
    eng.rpm = approach(eng.rpm, 0, 0.5, dt);
    return;
  }
  updateMass();
  double alt = -pos.z;
  AirData air = atm.at(alt);
  double agl = groundAgl();

  wind.update(dt, maxf(agl, 0.0), tas);
  windNed = wind.total(maxf(agl, 0.0));
  Vec3 vAir = vel - windNed;
  Vec3 vb = qrotInv(q, vAir);
  tas = length(vb);
  double newAlpha = tas > 0.5 ? atan2(vb.z, vb.x) : 0.0;
  beta = tas > 0.5 ? asin(clamp(vb.y / tas, -1, 1)) : 0.0;
  double ad = wrapPi(newAlpha - alphaPrev) / dt;
  alphaDot = approach(alphaDot, clamp(ad, -3, 3), 0.05, dt);
  alphaPrev = newAlpha;
  alpha = newAlpha;
  qbar = 0.5 * air.rho * tas * tas;
  ias = sqrt(2.0 * qbar / RHO0_ISA);
  mach = tas / air.a;

  computeControls(dt);
  updateElectrical(dt, air);
  if (isJet()) updateJets(dt, air);
  else updateEngine(dt, air, vb.x);
  updateFuel(dt);

  Vec3 Fb, Mb;
  aero(air, vb, Fb, Mb);
  dbgFaero = Fb;
  dbgMaero = Mb;

  // Thrust & propeller effects
  const PropEngineDef& P = def->prop;
  if (isJet()) {
    // each engine at its own position: asymmetric thrust yaws the aircraft
    const JetDef& J = def->jet;
    double Tsum = 0;
    for (int i = 0; i < J.count; i++) {
      double Ti = jets[i].thrust;
      Fb.x += Ti;
      Mb.y += J.pos[i].z * Ti;
      Mb.z -= J.pos[i].y * Ti;
      Tsum += Ti;
    }
    if (J.tvc > 0 && !onGround) Mb.y += J.tvc * elev * maxf(Tsum, 0.0) * 0.5;  // pitch vectoring nozzles
  } else {
    double T = eng.thrust;
    Fb.x += T;
    Mb.y += P.thrustLineZ * T;
    Mb.x -= eng.torqueProp;
    Mb.z -= P.pFactor * maxf(T, 0.0) * clamp(sin(alpha), -0.4, 0.4);
    Mb.z -= P.swirl * maxf(T, 0.0) * (30.0 / (30.0 + tas));
  }

  Vec3 Fc, Mc;
  contacts(dt, Fc, Mc);
  if (crashed) return;
  updateDamage(dt);
  if (crashed) return;

  Vec3 gravity{0, 0, mass * G0};
  Vec3 Fn = qrot(q, Fb) + Fc + gravity;
  Vec3 acc = Fn / mass;
  accelBody = qrotInv(q, Fn - gravity) / mass;

  // Fuel lateral imbalance moment (weight acting at tank arms)
  Vec3 gBody = qrotInv(q, Vec3{0, 0, G0});
  Vec3 Mfuel{0, 0, 0};
  for (int i = 0; i < def->fuel.tanks; i++) Mfuel += cross(Vec3{0, def->fuel.tankY[i], 0}, gBody * fuelKg[i]);

  // Rotational dynamics (with propeller gyroscopic coupling)
  Vec3 M = Mb + Mc + Mfuel;
  Vec3 h{P.inertia * eng.omega * 0.7, 0, 0};
  double Ix = inertia.x, Iy = inertia.y, Iz = inertia.z;
  Vec3 Iw{Ix * w.x - Ixz * w.z, Iy * w.y, Iz * w.z - Ixz * w.x};
  Vec3 rhs = M - cross(w, Iw + h);
  double G = Ix * Iz - Ixz * Ixz;
  Vec3 wdot{(Iz * rhs.x + Ixz * rhs.z) / G, rhs.y / Iy, (Ixz * rhs.x + Ix * rhs.z) / G};

  vel += acc * dt;
  pos += vel * dt;
  w += wdot * dt;
  Quat dq = qmul(q, Quat{0, w.x, w.y, w.z});
  q = qnormalize(Quat{q.w + 0.5 * dq.w * dt, q.x + 0.5 * dq.x * dt, q.y + 0.5 * dq.y * dt, q.z + 0.5 * dq.z * dt});

  updateInstruments(dt, air);

  // Limits & events
  double nz = -accelBody.z / G0;
  nzFilt += (nz - nzFilt) * clamp(dt / 0.08, 0, 1);
  double tol = assist(AS_CRASH_TOLERANT) ? 1.6 : 1.0;
  double vne = def->limits.vneKias * KT;
  double mmo = def->machDef.mmo > 0 ? def->machDef.mmo : 10.0;
  overspeed = ias > vne || (isJet() && mach > mmo + 0.01);
  if (overspeed) events |= EV_VNE;
  // Overspeed beyond the demonstrated margin: flutter / control-surface
  // failure tears the tail and the wings progressively.
  double over = maxf(ias / vne - 1.12 * tol, mach / (mmo + 0.06) - tol);
  if (over > 0) {
    double r = 2.0 * over + 0.05;
    damage(PART_TAIL, r * dt);
    damage(PART_WING_L, r * (0.8 + 0.4 * rng.uniform()) * 0.7 * dt);
    damage(PART_WING_R, r * (0.8 + 0.4 * rng.uniform()) * 0.7 * dt);
  }
  if (!onGround && (nz > def->limits.gMax || nz < def->limits.gMin)) events |= EV_G_LIMIT;
  // Load factor: permanent deformation above the limit load, failure beyond
  // the ultimate load (1.5 x limit). Separation is a few tenths of a second.
  bool touching = onGround;
  for (int i = 0; i < def->nGear; i++) if (gearComp[i] > 0) touching = true;
  if (!touching) {
    double gx = maxf(nzFilt / (def->limits.gMax * 1.5 * tol), nzFilt / (def->limits.gMin * 1.5 * tol));
    if (gx > 1.0) {
      double r = 20.0 * (gx - 1.0) + 1.0;
      damage(PART_WING_L, r * (0.85 + 0.3 * rng.uniform()) * dt);
      damage(PART_WING_R, r * (0.85 + 0.3 * rng.uniform()) * dt);
      damage(PART_TAIL, 0.4 * r * dt);
    } else if (gx > 0.77) {
      for (int s = 0; s < 2; s++) if (dmg.wing[s] < 0.35) dmg.wing[s] += 0.02 * dt;
    }
  }
  // Gear limits and the landing-gear warning
  if (def->gearSys.retractable) {
    if (gearPos > 0.05 && ias > def->gearSys.vleKias * KT * 1.15) { dmg.fuselage += 0.01 * dt; events |= EV_DAMAGE; }
    double flapF = def->flaps.maxDeg > 0 ? flapDeg / def->flaps.maxDeg : 0;
    if (!onGround && gearPos < 0.95 && agl < 250.0 && vel.z > 0.5 && (flapF > 0.6 || atThr < 0.1)) events |= EV_GEAR_WARN;
  }
  if (flapDeg > 1.0) {
    int idx = 0;
    for (int i = 0; i < def->flaps.detents; i++) if (def->flaps.angleDeg[i] <= flapDeg + 0.5) idx = i;
    if (idx < 1) idx = 1;
    double vfe = def->flaps.vfeKias[idx];
    if (vfe > 0 && ias > vfe * KT * 1.03) {
      events |= EV_FLAP_OVERSPEED;
      if (simMode && ias > vfe * KT * 1.25) fail[FAIL_FLAPS] = true;
    }
  }

  // Touchdown recording
  double phi, theta, psi;
  qToEuler(q, phi, theta, psi);
  bool mainContact = gearComp[1] > 0 || gearComp[2] > 0;
  if (!onGround) {
    td.airTime += dt;
  } else {
    if (mainContact && td.airTime > 1.0) {
      if (simTime - td.lastTdTime < 6.0 && td.count > 0) events |= EV_BOUNCE;
      td.count++;
      td.lastTdTime = simTime;
      td.vs = -vel.z;
      td.nz = nzFilt;
      td.nzWindow = 0.3;
      td.x = pos.y;
      td.y = pos.x;
      td.bank = phi;
      td.pitch = theta;
      td.ias = ias;
      double trk = atan2(vel.y, vel.x);
      td.crab = wrapPi(psi - trk);
      td.hdg = psi;
      if (-td.vs > 2.5) events |= EV_HARD_LANDING;
    }
    td.airTime = 0;
  }
  if (td.nzWindow > 0) {
    td.nzWindow -= dt;
    if (nzFilt > td.nz) td.nz = nzFilt;
  }
}

// ---------------------------------------------------------------------------
void Sim::writeOutputs() {
  double phi, theta, psi;
  qToEuler(q, phi, theta, psi);
  double* o = out;
  o[OUT_X] = pos.y; o[OUT_Y] = pos.x; o[OUT_Z] = -pos.z;
  o[OUT_VE] = vel.y; o[OUT_VN] = vel.x; o[OUT_VU] = -vel.z;
  o[OUT_PHI] = phi; o[OUT_THETA] = theta; o[OUT_PSI] = wrap2Pi(psi);
  o[OUT_P] = w.x; o[OUT_Q] = w.y; o[OUT_R] = w.z;
  o[OUT_ALPHA] = alpha; o[OUT_BETA] = beta;
  o[OUT_IAS] = ias; o[OUT_TAS] = tas; o[OUT_GS] = sqrt(vel.x * vel.x + vel.y * vel.y); o[OUT_MACH] = mach;
  o[OUT_ALT_MSL] = -pos.z;
  o[OUT_AGL] = maxf(0.0, groundAgl() + 0.07);
  o[OUT_VS] = -vel.z;
  o[OUT_NX] = accelBody.x / G0; o[OUT_NY] = accelBody.y / G0; o[OUT_NZ] = nzFilt;
  o[OUT_IND_IAS] = ins.ias; o[OUT_IND_ALT] = ins.alt; o[OUT_IND_VS] = ins.vs;
  o[OUT_AI_PITCH] = ins.aiPitch; o[OUT_AI_ROLL] = ins.aiRoll;
  o[OUT_HI_HDG] = ins.hi; o[OUT_COMPASS] = ins.compass;
  o[OUT_TURN_RATE] = ins.turnRate; o[OUT_SLIP_BALL] = ins.ball;
  o[OUT_RPM] = eng.rpm; o[OUT_MAP] = eng.map; o[OUT_FUEL_FLOW] = eng.fuelFlow; o[OUT_EGT] = eng.egt;
  o[OUT_OIL_T] = eng.oilT; o[OUT_OIL_P] = eng.oilP; o[OUT_ENGINE_RUNNING] = eng.running ? 1 : 0;
  o[OUT_STARTER] = eng.starter ? 1 : 0; o[OUT_THRUST] = eng.thrust; o[OUT_POWER] = eng.power;
  o[OUT_VACUUM] = ins.suction; o[OUT_PROP_ANGLE] = eng.propAngle;
  o[OUT_FUEL_L] = fuelKg[0]; o[OUT_FUEL_R] = fuelKg[1];
  o[OUT_BUS_V] = elec.busV; o[OUT_BATT_A] = elec.battA; o[OUT_BATT_SOC] = elec.soc;
  o[OUT_AVIONICS_POWERED] = elec.avionics ? 1 : 0; o[OUT_GYRO_SPIN] = ins.gyroSpin;
  o[OUT_FLAPS_DEG] = flapDeg; o[OUT_TRIM] = trim; o[OUT_ELEV] = elev; o[OUT_AIL] = ail; o[OUT_RUD] = rud;
  o[OUT_STEER] = steer; o[OUT_BRAKE_L] = brakeL; o[OUT_BRAKE_R] = brakeR; o[OUT_MIXTURE] = mixture;
  o[OUT_ON_GROUND] = onGround ? 1 : 0;
  o[OUT_GEAR0] = gearComp[0]; o[OUT_GEAR1] = gearComp[1]; o[OUT_GEAR2] = gearComp[2];
  o[OUT_WHEEL_SPEED] = wheelSpeed; o[OUT_SKID] = skid; o[OUT_SCRAPE] = scrape;
  o[OUT_STALL_WARN] = stallWarn ? 1 : 0; o[OUT_STALLED] = stalled ? 1 : 0; o[OUT_OVERSPEED] = overspeed ? 1 : 0;
  o[OUT_CRASHED] = crashed ? 1 : 0; o[OUT_CRASH_REASON] = crashReason;
  o[OUT_TD_COUNT] = td.count; o[OUT_TD_VS] = td.vs; o[OUT_TD_NZ] = td.nz; o[OUT_TD_X] = td.x; o[OUT_TD_Y] = td.y;
  o[OUT_TD_BANK] = td.bank; o[OUT_TD_PITCH] = td.pitch; o[OUT_TD_IAS] = td.ias; o[OUT_TD_CRAB] = td.crab;
  o[OUT_TD_HDG] = td.hdg;
  o[OUT_EVENTS] = events;
  o[OUT_AP_ENGAGED] = ap.engaged ? 1 : 0; o[OUT_AP_LAT] = ap.lat; o[OUT_AP_VERT] = ap.vert;
  o[OUT_AP_VS_TARGET] = ap.vsTarget; o[OUT_AP_DISC_COUNT] = ap.discCount;
  o[OUT_MASS] = mass; o[OUT_SIM_TIME] = simTime;
  o[OUT_WIND_E] = windNed.y; o[OUT_WIND_N] = windNed.x; o[OUT_WIND_U] = -windNed.z;
  o[OUT_PRIME] = eng.prime;
  o[OUT_LOW_VOLTS] = (in[IN_BATTERY] > 0.5 && elec.lowVoltTimer > 1.0) ? 1 : 0;
  o[OUT_LOW_FUEL_L] = fuelKg[0] < 8.0 ? 1 : 0;
  o[OUT_LOW_FUEL_R] = fuelKg[1] < 8.0 ? 1 : 0;
  o[OUT_OIL_WARN] = (in[IN_BATTERY] > 0.5 && eng.oilP < 20.0) ? 1 : 0;
  // jets & systems
  o[OUT_AIRCRAFT] = aircraftId;
  int engMask = 0, fireMask = 0;
  double n2 = 0;
  bool ab = false;
  int nj = isJet() ? def->jet.count : 0;
  for (int i = 0; i < 4; i++) {
    o[OUT_N1_0 + i] = i < nj ? jets[i].n1 : 0.0;
    if (i < nj && jets[i].running) engMask |= 1 << i;
    if (i < nj && jets[i].fire) fireMask |= 1 << i;
    if (i < nj) { n2 += jets[i].n2; ab = ab || jets[i].ab; }
  }
  if (!isJet() && eng.running) engMask = 1;
  o[OUT_N2_AVG] = nj ? n2 / nj : 0.0;
  o[OUT_ENG_MASK] = engMask;
  o[OUT_FIRE_MASK] = fireMask;
  o[OUT_GEAR_POS] = gearPos;
  o[OUT_SPEEDBRAKE] = sb;
  o[OUT_REVERSER] = reverser ? 1 : 0;
  o[OUT_AFTERBURNER] = ab ? 1 : 0;
  o[OUT_AT_THR] = atThr;
  o[OUT_FBW] = def->law == ControlLaw::FlyByWireG ? (fbwNormal ? 1 : 2) : 0;
  // damage
  o[OUT_DMG_WING_L] = minf(1.0, dmg.wing[0]);
  o[OUT_DMG_WING_R] = minf(1.0, dmg.wing[1]);
  o[OUT_DMG_TAIL] = minf(1.0, dmg.tail);
  o[OUT_DMG_FUS] = minf(1.0, dmg.fuselage);
  for (int i = 0; i < 4; i++) o[OUT_DMG_ENG_0 + i] = dmg.eng[i];
  o[OUT_PARTS_LOST] = (dmg.wingLost[0] ? 1 : 0) | (dmg.wingLost[1] ? 2 : 0) | (dmg.tailLost ? 4 : 0) |
                      (dmg.gearLost[0] ? 8 : 0) | (dmg.gearLost[1] ? 16 : 0) | (dmg.gearLost[2] ? 32 : 0);
  o[OUT_HYD] = isJet() ? dmg.hyd : 1.0;
  o[OUT_FUEL_LEAK] = dmg.fuelLeak;
  o[OUT_ELEC_FAIL] = dmg.elecDead ? 1 : 0;
}

}  // namespace osk
