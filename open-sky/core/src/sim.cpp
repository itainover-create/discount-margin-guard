// OPEN SKY core — aircraft simulation implementation.
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
void Sim::init(int aircraftId) {
  def = &aircraftDef(aircraftId);
  for (int i = 0; i < IN_COUNT; i++) in[i] = 0;
  for (int i = 0; i < OUT_COUNT; i++) out[i] = 0;
  in[IN_BARO] = P0_ISA;
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
  payloadKg = clamp(pilotKg + paxKg + baggageKg, 0, 600);
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
}

double Sim::stallAngle() const {
  double ff = def->flaps.maxDeg > 0 ? flapDeg / def->flaps.maxDeg : 0.0;
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
  w = {0, 0, 0};
  elev = ail = rud = steer = 0;
  alphaDot = 0;
  eng = EngineState();
  elec = ElecState();
  ins = InstrumentState();
  ap = AutopilotState();
  as = AssistState();
  td = TouchdownState();
  for (int i = 0; i < 12; i++) gearComp[i] = 0;
  updateMass();

  double theta = 0;
  if (onGnd) {
    double staticComp = 0.07;
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
    double qb = 0.5 * air.rho * tasIn * tasIn;
    double CLreq = mass * G0 / maxf(qb * a.S, 1.0);
    double alphaTrim = clamp((CLreq - a.CL0) / a.CLa, -0.05, 0.2);
    theta = alphaTrim;
    vel = {tasIn * cos(hdg) * cos(theta - alphaTrim), tasIn * sin(hdg), 0};
    flapDeg = 0;
    double cmNoElev = a.Cm0 + a.Cma * alphaTrim;
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
  in[IN_FLAPS_LEVER] = 0;
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
  ap.iRoll = clamp(ap.iRoll + 0.3 * (phiCmd - phi) * dt, -0.15, 0.15);
  rollCmd = clamp(2.2 * (phiCmd - phi) - 0.5 * w.x + ap.iRoll, -0.6, 0.6);

  // Vertical
  double vs = -vel.z;
  double vsCmd = ap.vsTarget;
  if (ap.vert == 1) {
    vsCmd = clamp(0.12 * (in[IN_AP_ALT] - ins.alt), -3.6, 3.6);
  } else {
    ap.vsTarget = in[IN_AP_VS];
    vsCmd = ap.vsTarget;
  }
  double V = maxf(tas, 20.0);
  double gamma = asin(clamp(vsCmd / V, -0.3, 0.3));
  double thetaCmd = gamma + clamp(alpha, -0.1, 0.25) + 0.6 * (vsCmd - vs) / V;
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
  if (ap.engaged) {
    pitchIn = apPitch;
    rollIn = apRoll;
  } else {
    if (assist(AS_ATTITUDE_HOLD) && airborne) {
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
  if (assist(AS_STALL_PROTECT) && airborne) {
    double excess = alpha - (stallAngle() - 2.5 * DEG);
    if (excess > -0.06) {
      double lim = -8.0 * excess - 0.5 * w.y;
      if (pitchIn > lim) pitchIn = lim;
    }
  }
  if (assist(AS_AUTO_RUDDER)) {
    if (airborne) {
      double V = maxf(tas, 20.0);
      double rCoord = G0 * sin(phi) / V;
      yawIn = clamp(yawIn + clamp(3.0 * beta + 0.6 * (rCoord - w.z), -0.7, 0.7), -1, 1);
    }
  }
  double gs = sqrt(vel.x * vel.x + vel.y * vel.y);
  if (onGround && (assist(AS_AUTO_RUDDER) || assist(AS_TAXI_ASSIST)) && fabs(in[IN_YAW]) < 0.05 && gs > 12.0) {
    if (!as.groundHolding) { as.groundHdgHold = psi; as.groundHolding = true; }
    yawIn = clamp(3.0 * wrapPi(as.groundHdgHold - psi) - 1.0 * w.z, -1, 1);
  } else {
    as.groundHolding = false;
  }

  elev = slew(elev, pitchIn, 5.0, dt);
  ail = slew(ail, rollIn, 5.0, dt);
  rud = slew(rud, yawIn, 4.0, dt);

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
  if (flapPower && !fail[FAIL_FLAPS]) flapDeg = slew(flapDeg, target, def->flaps.rateDegPerSec, dt);

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

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------
void Sim::updateElectrical(double dt, const AirData&) {
  const ElectricalDef& E = def->elec;
  bool batt = in[IN_BATTERY] > 0.5;
  if (!batt) {
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
  if (in[IN_ALTERNATOR] > 0.5 && !fail[FAIL_ALTERNATOR])
    altMax = E.altAmps * smoothstep(E.altMinRpm * 0.85, E.altMinRpm + 700.0, eng.rpm);
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
  double Adisk = PI * sq(def->prop.propD) * 0.25;
  double qSlip = a.tailSlipstream * maxf(0.0, eng.thrust) / Adisk;
  double qTail = qbar + qSlip;
  double de = elev > 0 ? -elev * a.deUp : -elev * a.deDown;  // TE down positive
  double da = ail * a.daMax;
  double dr = rud * a.drMax;

  // Control surface forces that also work at zero airspeed (prop wash).
  // Elevator + trim moment, saturating as the horizontal tail approaches its own stall.
  double cmCtl = a.Cmde * de + a.CmTrimMax * trim;
  cmCtl = cmCtl > 0 ? a.CmElevMaxUp * tanh_(cmCtl / a.CmElevMaxUp) : a.CmElevMaxDown * tanh_(cmCtl / a.CmElevMaxDown);
  M.y += qTail * a.S * a.c * cmCtl;
  F.z -= qTail * a.S * a.CLde * de;
  F.y += qTail * a.S * a.CYdr * dr;
  M.z += qTail * a.S * a.b * a.Cndr * dr;
  M.x += qTail * a.S * a.b * a.Cldr * dr;

  stallWarn = false;
  if (V < 0.5) { stalled = false; return; }

  double alphaS = stallAngle();
  double alphaSN = -14.0 * DEG;
  double CL0e = a.CL0 + a.CLflapFull * pow(ff, 0.85);
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

  double flapDrag = a.CDflapFull * pow(ff, 1.6);
  double CDatt = a.CD0 + a.kInduced * ge * CLw * CLw + flapDrag;
  double CDpost = a.CD0 + a.CDpostScale * sq(sin(alpha)) + flapDrag + 0.2 * a.kInduced * CLw * CLw;
  double CD = (1.0 - sigma) * CDatt + sigma * CDpost + 0.25 * sq(sin(beta));

  double CY = a.CYb * beta + a.CYp * pHat + a.CYr * rHat;
  double Cl = a.Clb * beta * (1.0 + 2.0 * sigma) + a.Clp * pHat * (1.0 - 0.85 * sigma) +
              (a.Clr + a.ClrPerCL * CL) * rHat + a.Clda * da * (1.0 - 0.5 * sigma) + sigma * stallAsym;
  double Cn = a.Cnb * beta + (a.Cnp + a.CnpPerCL * CL) * pHat + a.Cnr * rHat + a.Cnda * da;
  double Cm = a.Cm0 * (1.0 - sigma) + a.Cma * sin(alpha) + a.Cmq * qHat + a.Cmadot * adHat +
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

  for (int i = 0; i < def->nGear; i++) {
    const GearPointDef& g = def->gear[i];
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
      anyWheel = true;
      if (firstContact || dd > 0) {
        if (dd > def->limits.vsGearCollapse * tol) { crash(CR_GEAR_COLLAPSE); return; }
      }
      if (d > g.travel * 1.6 && dd > 1.5 * tol) { crash(CR_GEAR_COLLAPSE); return; }
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
      double speed = length(vP);
      if (g.tag == 1) {
        events |= EV_TAIL_STRIKE;
        if (dd > 2.5 * tol) { crash(CR_TERRAIN); return; }
      } else if (g.tag == 2) {
        events |= EV_WINGTIP_STRIKE;
        if (dd > 2.0 * tol || speed > 18.0 * tol) { crash(CR_WING_STRIKE); return; }
      } else if (g.tag == 3) {
        if (eng.rpm > 100) { events |= EV_PROP_STRIKE; fail[FAIL_ENGINE] = true; }
        if (dd > 3.0 * tol) { crash(CR_TERRAIN); return; }
      } else {
        if (dd > 2.0 * tol || speed > 25.0 * tol) { crash(CR_TERRAIN); return; }
      }
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
  bool perfect = !simMode || assist(AS_PERFECT_GYROS);

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
  ins.suction = fail[FAIL_VACUUM] ? 0.0 : 5.0 * smoothstep(450.0, 1300.0, eng.rpm);
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
  updateEngine(dt, air, vb.x);
  updateFuel(dt);

  Vec3 Fb, Mb;
  aero(air, vb, Fb, Mb);
  dbgFaero = Fb;
  dbgMaero = Mb;

  // Thrust & propeller effects
  const PropEngineDef& P = def->prop;
  double T = eng.thrust;
  Fb.x += T;
  Mb.y += P.thrustLineZ * T;
  Mb.x -= eng.torqueProp;
  Mb.z -= P.pFactor * maxf(T, 0.0) * clamp(sin(alpha), -0.4, 0.4);
  Mb.z -= P.swirl * maxf(T, 0.0) * (30.0 / (30.0 + tas));

  Vec3 Fc, Mc;
  contacts(dt, Fc, Mc);
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
  double tol = assist(AS_CRASH_TOLERANT) ? 1.6 : 1.0;
  overspeed = ias > def->limits.vneKias * KT;
  if (overspeed) events |= EV_VNE;
  if (ias > def->limits.vneKias * KT * 1.25 * tol) { crash(CR_OVERSTRESS); return; }
  if (!onGround && (nz > def->limits.gMax || nz < def->limits.gMin)) events |= EV_G_LIMIT;
  if (!onGround && (nz > def->limits.gMax * 1.5 * tol || nz < def->limits.gMin * 1.5 * tol)) { crash(CR_OVERSTRESS); return; }
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
      td.nz = nz;
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
    if (nz > td.nz) td.nz = nz;
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
  o[OUT_NX] = accelBody.x / G0; o[OUT_NY] = accelBody.y / G0; o[OUT_NZ] = -accelBody.z / G0;
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
}

}  // namespace osk
