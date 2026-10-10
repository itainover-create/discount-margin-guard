// GLOBAL SKIES core — fleet calibration tests (included by test_main.cpp).
// A scripted test pilot flies each aircraft through a takeoff at MTOW, a
// cruise on autopilot + autothrottle, a stabilised approach and type
// specific checks (engine start, fly-by-wire, fighter performance, damage).
// Reference figures are public class figures for the real type each design
// is modelled on (docs/FLIGHT_MODEL.md lists them).

struct FleetRef {
  int id;
  const char* name;
  double toflM;        // takeoff field length at MTOW, SL ISA (m) — reference
  double cruiseFt;     // cruise altitude
  double cruiseMach;
  double cruiseMassFrac;
  double ffKgH;        // total cruise fuel flow at that weight (kg/h) — reference
};

static const FleetRef kFleetRefs[] = {
    {AC_NB738, "Meridian 738 (737-800 class)", 2400, 35000, 0.785, 0.80, 2450},
    {AC_A320, "Aurora 320 (A320 class)", 2100, 35000, 0.78, 0.80, 2400},
    {AC_B789, "Horizon 789 (787-9 class)", 2900, 39000, 0.85, 0.78, 5600},
    {AC_B77W, "Titan 77W (777-300ER class)", 3100, 35000, 0.84, 0.78, 7800},
    {AC_B744, "Monarch 744 (747-400 class)", 3200, 35000, 0.85, 0.80, 11000},
    {AC_A359, "Zephyr 359 (A350-900 class)", 2600, 39000, 0.85, 0.78, 5800},
    {AC_A388, "Colossus 388 (A380 class)", 2900, 35000, 0.85, 0.80, 12000},
    {AC_G650, "Vega 650 (G650 class)", 1800, 45000, 0.85, 0.75, 1400},
    {AC_F15, "Talon 15 (F-15C class)", 0, 30000, 0.90, 0.0, 3500},
    {AC_F22, "Specter 22 (F-22 class)", 0, 30000, 0.90, 0.0, 3500},
    {AC_F35, "Arrow 35 (F-35A class)", 0, 30000, 0.90, 0.0, 3000},
    {AC_B2, "Nightwing 2 (B-2 class)", 3000, 40000, 0.80, 0.80, 6000},
};

static bool fleetVerbose = false;

// Load to a mass fraction of MTOW (fuel first, then payload). frac 0 =
// operating empty + 90 % internal fuel (fighters, clean).
static void fleetSetup(int id, double frac) {
  sim.init(id);
  sim.setSimMode(true);
  sim.setWeather(P0_ISA, 0, 0, 0, 0, 0, 1);
  sim.in[IN_ASSISTS] = 0;
  sim.in[IN_BARO] = P0_ISA;
  const AircraftDef& d = *sim.def;
  double cap = d.fuel.capacityKg[0] + d.fuel.capacityKg[1];
  double fuel, payload;
  if (frac <= 0) {
    fuel = 0.9 * cap;
    payload = 300;
  } else {
    double avail = d.mass.mtowKg * frac - d.mass.emptyKg;
    fuel = minf(cap, avail * 0.75);
    payload = maxf(0.0, avail - fuel);
  }
  sim.setFuel(fuel * 0.5, fuel * 0.5);
  sim.setPayload(payload, 0, 0);
}

// Takeoff at MTOW: full thrust, rotate at Vr (scaled with weight) at ~2.5
// deg/s to the target attitude, then speed on pitch; gear up when climbing.
static void fleetTakeoff(const FleetRef& r) {
  bool fighter = aircraftDef(r.id).category == Category::Fighter;
  fleetSetup(r.id, fighter ? 0.0 : 1.0);  // fighters: clean, 90 % internal fuel
  const AircraftDef& d = *sim.def;
  sim.reset(0, 0, 0, 0, 0, true, true);
  double mass = o(OUT_MASS);
  sim.in[IN_FLAPS_LEVER] = d.takeoffDetent;
  sim.in[IN_PARK_BRAKE] = 0;
  sim.in[IN_SPOILER_ARM] = 0;
  for (int i = 0; i < 300; i++) sim.advance(FDT);  // flaps out
  sim.in[IN_THROTTLE] = fighter ? 1.0 : (d.jet.abThrustN > 0 ? 0.92 : 1.0);
  Pid rud{2.5, 0.2, 0.0}, ailp{1.2, 0.1, 0}, pitch{5.0, 2.0, 0.0};
  pitch.lo = -0.4;
  pitch.hi = 0.4;
  double vr = d.rotateKias * KT * (fighter ? 1.0 : osk::sqrt(mass / d.mass.mtowKg));
  double rotRate = fighter ? 6.0 * DEG : 2.5 * DEG;
  double thetaMax = fighter ? 12.0 * DEG : 7.5 * DEG;  // attitude for lift-off (tail clearance)
  double t = 0, liftoffDist = -1, dist35 = -1, liftoffIas = 0, maxTheta = 0;
  double x0 = o(OUT_Y), thetaCmd = 0;
  bool rotating = false;
  while (t < 150) {
    holdLateral(0, FDT, rud, ailp);
    if (o(OUT_IAS) > vr) rotating = true;
    if (rotating) {
      double tgt = thetaMax;
      // airborne: initial climb attitude, lowered only if the speed falls below V2
      if (liftoffDist > 0) tgt = clamp((fighter ? 15.0 : 12.5) * DEG + 0.8 * DEG * (o(OUT_IAS) - (vr + 12 * KT)) / KT, 6 * DEG, 18 * DEG);
      thetaCmd = thetaCmd < tgt ? minf(tgt, thetaCmd + rotRate * FDT) : maxf(tgt, thetaCmd - rotRate * FDT);
      // firm initial pull to break the nose wheel off, then follow the attitude
      double ff = liftoffDist < 0 ? (fighter ? 0.45 : 0.3) : 0.0;
      sim.in[IN_PITCH] = clamp(ff + pitch.step(thetaCmd - o(OUT_THETA), FDT) - 1.5 * o(OUT_Q), -1, 1);
    } else {
      sim.in[IN_PITCH] = 0.0;
    }
    sim.advance(FDT);
    t += FDT;
    maxTheta = maxf(maxTheta, o(OUT_THETA));
    if (liftoffDist < 0 && o(OUT_ON_GROUND) < 0.5 && o(OUT_AGL) > 0.5) {
      liftoffDist = o(OUT_Y) - x0;
      liftoffIas = o(OUT_IAS);
    }
    if (o(OUT_AGL) > 10) sim.in[IN_GEAR_LEVER] = 0;
    if (dist35 < 0 && o(OUT_AGL) > 35 * FT) dist35 = o(OUT_Y) - x0;
    if (dist35 > 0 && o(OUT_AGL) > 400 * FT) break;
  }
  double vs = o(OUT_VS);
  char name[160];
  if (fleetVerbose)
    std::printf("[%s] mass %.0f vr %.0f lo %.0f m @ %.0f kt, 35ft %.0f m, maxTheta %.1f, vs %.0f fpm gear %.2f crashed %g\n", r.name,
                mass, vr / KT, liftoffDist, liftoffIas / KT, dist35, maxTheta * RAD, vs / FPM, o(OUT_GEAR_POS), o(OUT_CRASHED));
  if (r.toflM > 0) {
    std::snprintf(name, sizeof name, "%s: takeoff distance to 35 ft x1.15 (MTOW, SL ISA)", r.name);
    check(name, dist35 * 1.15, r.toflM, r.toflM * 0.72, r.toflM * 1.25, "m", "ref: published TOFL (usually engine-out governed, longer)");
  } else {
    std::snprintf(name, sizeof name, "%s: takeoff ground roll (clean, AB)", r.name);
    check(name, liftoffDist, 450, 150, 900, "m");
  }
  std::snprintf(name, sizeof name, "%s: lift-off speed / Vr", r.name);
  check(name, liftoffIas / vr, 1.05, 0.97, fighter ? 1.35 : 1.2, "", fighter ? "afterburner: fast acceleration during rotation" : "");
  std::snprintf(name, sizeof name, "%s: takeoff without tail strike, crash or damage", r.name);
  int bad = ((int)o(OUT_EVENTS) & EV_TAIL_STRIKE ? 1 : 0) + (o(OUT_CRASHED) > 0.5 ? 1 : 0) + (o(OUT_DMG_FUS) > 0 ? 1 : 0);
  check(name, bad, 0, 0, 0, "");
}

static double iasForMach(double altM, double mach) {
  Atmosphere atm;
  AirData air = atm.at(altM);
  double tas = mach * air.a;
  return tas * osk::sqrt(air.rho / RHO0_ISA);
}

// Engage AP (ALT + HDG) and autothrottle at the current state.
static void engageAp(double altM, double iasMs) {
  sim.in[IN_AP_MASTER] = 0;
  sim.advance(FDT);
  sim.in[IN_AP_VERT_MODE] = 1;
  sim.in[IN_AP_ALT] = altM;
  sim.in[IN_AP_LAT_MODE] = 1;
  sim.in[IN_AP_HDG] = 0;
  sim.in[IN_AP_MASTER] = 1;
  sim.in[IN_AT_ENGAGED] = 1;
  sim.in[IN_AT_SPEED] = iasMs;
}

static void fleetCruise(const FleetRef& r) {
  fleetSetup(r.id, r.cruiseMassFrac);
  const AircraftDef& d = *sim.def;
  double alt = r.cruiseFt * FT;
  Atmosphere atm;
  double tas = r.cruiseMach * atm.at(alt).a;
  sim.in[IN_GEAR_LEVER] = 0;
  sim.reset(0, 0, alt, 0, tas, false, true);
  sim.in[IN_THROTTLE] = 0.8;
  engageAp(alt, iasForMach(alt, r.cruiseMach));
  double altErr = 0, machErr = 0, n1 = 0, ff = 0, maxBank = 0;
  int n = 0;
  for (int i = 0; i < 60 * 300; i++) {
    sim.advance(FDT);
    if (i > 60 * 200) {
      altErr = maxf(altErr, osk::fabs(o(OUT_ALT_MSL) - alt));
      machErr = maxf(machErr, osk::fabs(o(OUT_MACH) - r.cruiseMach));
      maxBank = maxf(maxBank, osk::fabs(o(OUT_PHI)));
      n1 += o(OUT_N1_0);
      ff += o(OUT_FUEL_FLOW);
      n++;
    }
  }
  n1 /= maxf(1, n);
  ff = ff / maxf(1, n) * 3600.0;
  char name[160];
  if (fleetVerbose)
    std::printf("[%s] cruise mass %.0f alt err %.0f ft mach err %.3f n1 %.1f ff %.0f kg/h ap %g bank %.1f alpha %.1f theta %.1f\n", r.name,
                o(OUT_MASS), altErr / FT, machErr, n1, ff, o(OUT_AP_ENGAGED), maxBank * RAD, o(OUT_ALPHA) * RAD,
                o(OUT_THETA) * RAD);
  std::snprintf(name, sizeof name, "%s: cruise M%.2f FL%.0f on AP+AT, altitude hold", r.name, r.cruiseMach, r.cruiseFt / 100);
  check(name, altErr / FT, 0, 0, 100, "ft");
  std::snprintf(name, sizeof name, "%s: cruise Mach hold (autothrottle)", r.name);
  check(name, machErr, 0, 0, 0.012, "");
  std::snprintf(name, sizeof name, "%s: cruise N1 (thrust margin)", r.name);
  check(name, n1, 85, 70, 97, "%");
  std::snprintf(name, sizeof name, "%s: cruise fuel flow", r.name);
  check(name, ff, r.ffKgH, r.ffKgH * 0.7, r.ffKgH * 1.35, "kg/h", "ref: typical block fuel / time at that weight");
  (void)d;
}

// Stabilised 3-degree approach on AP (V/S) + autothrottle at Vref, landing
// flaps, gear down: attitude, thrust and margin to the stall.
static void fleetApproach(const FleetRef& r) {
  fleetSetup(r.id, r.cruiseMassFrac > 0 ? 0.70 : 0.0);
  const AircraftDef& d = *sim.def;
  double v = d.approachKias * KT;
  sim.in[IN_GEAR_LEVER] = 1;
  sim.reset(0, 0, 1500 * FT, 0, v, false, true);
  sim.in[IN_FLAPS_LEVER] = d.flaps.detents - 1;
  sim.in[IN_THROTTLE] = 0.5;
  for (int i = 0; i < 10; i++) sim.advance(FDT);
  sim.in[IN_AP_MASTER] = 0;
  sim.advance(FDT);
  sim.in[IN_AP_VERT_MODE] = 0;
  sim.in[IN_AP_VS] = -v * osk::tan(3.0 * DEG);
  sim.in[IN_AP_LAT_MODE] = 1;
  sim.in[IN_AP_HDG] = 0;
  sim.in[IN_AP_MASTER] = 1;
  sim.in[IN_AT_ENGAGED] = 1;
  sim.in[IN_AT_SPEED] = v;
  double theta = 0, n1 = 0, iasErr = 0, alphaMax = 0;
  int n = 0;
  for (int i = 0; i < 60 * 70; i++) {
    sim.advance(FDT);
    if (i > 60 * 40) {
      theta += o(OUT_THETA);
      n1 += o(OUT_N1_0);
      iasErr = maxf(iasErr, osk::fabs(o(OUT_IAS) - v));
      alphaMax = maxf(alphaMax, o(OUT_ALPHA));
      n++;
    }
  }
  theta /= maxf(1, n);
  n1 /= maxf(1, n);
  char name[160];
  if (fleetVerbose)
    std::printf("[%s] approach theta %.1f n1 %.1f ias err %.1f kt alpha %.1f vs %.0f fpm stallwarn %g ap %g\n", r.name, theta * RAD, n1,
                iasErr / KT, alphaMax * RAD, o(OUT_VS) / FPM, o(OUT_STALL_WARN), o(OUT_AP_ENGAGED));
  bool fighter = d.category == Category::Fighter;
  std::snprintf(name, sizeof name, "%s: 3-deg approach pitch attitude at Vref", r.name);
  check(name, theta * RAD, fighter ? 8 : 2.5, fighter ? 2 : -1.0, fighter ? 14 : 6.0, "deg");
  std::snprintf(name, sizeof name, "%s: approach N1 (AT, landing config)", r.name);
  check(name, n1, 55, 35, 82, "%");
  std::snprintf(name, sizeof name, "%s: approach speed hold (AT)", r.name);
  check(name, iasErr / KT, 0, 0, 6, "kt");
  std::snprintf(name, sizeof name, "%s: approach without stall warning", r.name);
  check(name, o(OUT_STALL_WARN), 0, 0, 0, "");
}

// Cold & dark turbofan start: battery, generators, ignition START, fuel
// levers on at N2 > 22 % (as the checklist says).
static void testJetStart() {
  fleetSetup(AC_NB738, 0.7);
  sim.reset(0, 0, 0, 0, 0, true, false);
  for (int i = 0; i < 60; i++) sim.advance(FDT);
  check("738: cold & dark, engines stopped", o(OUT_ENG_MASK), 0, 0, 0, "");
  sim.in[IN_BATTERY] = 1;
  sim.in[IN_ALTERNATOR] = 1;
  sim.in[IN_AVIONICS] = 1;
  sim.in[IN_MAGNETOS] = 4;
  double t = 0, egtPeak = 0;
  bool fuelOn = false;
  while (t < 120 && !((int)o(OUT_ENG_MASK) == 3 && o(OUT_N1_0) > 19.0 && o(OUT_N1_1) > 19.0)) {
    if (!fuelOn && o(OUT_N2_AVG) > 22.0) { sim.in[IN_MIXTURE] = 1; fuelOn = true; }
    sim.advance(FDT);
    t += FDT;
    egtPeak = maxf(egtPeak, o(OUT_EGT));
  }
  sim.in[IN_MAGNETOS] = 3;
  for (int i = 0; i < 60 * 20; i++) sim.advance(FDT);
  check("738: engine start, starter to stable idle", t, 40, 15, 70, "s", "ref: ~40-60 s per engine");
  check("738: idle N1", o(OUT_N1_0), 21, 18, 24, "%");
  check("738: generators on line (bus volts)", o(OUT_BUS_V), 28, 27.5, 28.5, "V");
  check("738: idle fuel flow (both engines)", o(OUT_FUEL_FLOW) * 3600, 500, 250, 800, "kg/h");
  sim.in[IN_THROTTLE] = 1.0;
  double tt = 0;
  while (tt < 30 && o(OUT_N1_0) < 95) { sim.advance(FDT); tt += FDT; }
  check("738: spool-up idle -> 95 % N1", tt, 6, 3, 9, "s", "ref: ~5-8 s (certification: < 5 s to go-around thrust from approach idle)");
  for (int i = 0; i < 60 * 8; i++) sim.advance(FDT);
  check("738: static takeoff thrust (2 engines)", o(OUT_THRUST) / 1000, 242, 220, 250, "kN");
  sim.in[IN_THROTTLE] = 0.0;
  sim.in[IN_MIXTURE] = 0;
  for (int i = 0; i < 60 * 30; i++) sim.advance(FDT);
  check("738: fuel levers cut-off stops both engines", o(OUT_ENG_MASK), 0, 0, 0, "");
}

static void cruiseAt(int id, double ft, double mach, double frac, bool ap) {
  fleetSetup(id, frac);
  double alt = ft * FT;
  Atmosphere atm;
  sim.in[IN_GEAR_LEVER] = 0;
  sim.reset(0, 0, alt, 0, mach * atm.at(alt).a, false, true);
  sim.in[IN_THROTTLE] = 0.8;
  sim.in[IN_AT_ENGAGED] = 1;
  sim.in[IN_AT_SPEED] = iasForMach(alt, mach);
  if (ap) engageAp(alt, iasForMach(alt, mach));
  for (int i = 0; i < 60 * 40; i++) sim.advance(FDT);
}

// Fly-by-wire behaviour (A320 class, normal law).
static void testFbw() {
  cruiseAt(AC_A320, 35000, 0.78, 0.75, false);
  double alt0 = o(OUT_ALT_MSL), maxBank = 0;
  sim.setWeather(P0_ISA, 0, 250 * DEG, 0, 0, 0.6, 5);  // light turbulence
  for (int i = 0; i < 60 * 60; i++) {
    sim.advance(FDT);
    maxBank = maxf(maxBank, osk::fabs(o(OUT_PHI)));
  }
  check("A320 FBW: hands off 60 s in light turbulence, max bank", maxBank * RAD, 0, 0, 3, "deg");
  check("A320 FBW: hands off 60 s, altitude change", osk::fabs(o(OUT_ALT_MSL) - alt0) / FT, 0, 0, 150, "ft",
        "flight path held, auto-trim");
  sim.setWeather(P0_ISA, 0, 0, 0, 0, 0, 5);
  double nzMax = 0;
  sim.in[IN_PITCH] = 0.5;
  for (int i = 0; i < 60 * 3; i++) { sim.advance(FDT); nzMax = maxf(nzMax, o(OUT_NZ)); }
  sim.in[IN_PITCH] = 0;
  check("A320 FBW: half stick pull -> load factor", nzMax, 1.75, 1.5, 2.0, "g", "C* law: stick = load factor demand");
  for (int i = 0; i < 60 * 10; i++) sim.advance(FDT);
  sim.in[IN_PITCH] = 1.0;
  nzMax = 0;
  for (int i = 0; i < 60 * 3; i++) { sim.advance(FDT); nzMax = maxf(nzMax, o(OUT_NZ)); }
  sim.in[IN_PITCH] = 0;
  check("A320 FBW: full stick, load factor protection", nzMax, 2.5, 2.2, 2.65, "g");
  for (int i = 0; i < 60 * 15; i++) sim.advance(FDT);
  double pMax = 0, phiMax = 0;
  sim.in[IN_ROLL] = 1.0;
  for (int i = 0; i < 60 * 12; i++) {
    sim.advance(FDT);
    pMax = maxf(pMax, osk::fabs(o(OUT_P)));
    phiMax = maxf(phiMax, osk::fabs(o(OUT_PHI)));
  }
  check("A320 FBW: full roll stick, roll rate", pMax * RAD, 15, 12, 17.5, "deg/s");
  check("A320 FBW: bank angle protection", phiMax * RAD, 67, 60, 70, "deg");
  sim.in[IN_ROLL] = 0;
  for (int i = 0; i < 60 * 15; i++) sim.advance(FDT);
  check("A320 FBW: stick released beyond 33 deg -> rolls back to 33", osk::fabs(o(OUT_PHI)) * RAD, 33, 28, 36, "deg");
  sim.in[IN_ROLL] = -0.5;
  for (int i = 0; i < 60 * 3; i++) sim.advance(FDT);
  sim.in[IN_ROLL] = 0;
  while (osk::fabs(o(OUT_PHI)) > 2 * DEG) { sim.in[IN_ROLL] = -sign(o(OUT_PHI)) * 0.4; sim.advance(FDT); }
  sim.in[IN_ROLL] = 0;
  // alpha protection: idle, full aft stick, slowing down
  sim.in[IN_AT_ENGAGED] = 0;
  sim.in[IN_THROTTLE] = 0;
  sim.in[IN_PITCH] = 1.0;
  double aMax = 0;
  int stalledFrames = 0;
  for (int i = 0; i < 60 * 60; i++) {
    sim.advance(FDT);
    aMax = maxf(aMax, o(OUT_ALPHA));
    if (o(OUT_STALLED) > 0.5) stalledFrames++;
  }
  sim.in[IN_PITCH] = 0;
  check("A320 FBW: full aft stick at idle, max alpha (protection)", aMax * RAD, 15, 11, 16.5, "deg");
  check("A320 FBW: ... no stall", stalledFrames, 0, 0, 0, "frames");
}

static void testFighters() {
  // F-15 class: level acceleration in full afterburner at FL300
  cruiseAt(AC_F15, 30000, 0.9, 0.0, true);
  sim.in[IN_AT_ENGAGED] = 0;
  sim.in[IN_THROTTLE] = 1.0;
  double t = 0, tM14 = -1;
  for (int i = 0; i < 60 * 150; i++) {
    sim.advance(FDT);
    t += FDT;
    if (tM14 < 0 && o(OUT_MACH) > 1.4) tM14 = t;
  }
  check("F-15 class: M0.9 -> M1.4 at FL300, full afterburner", tM14, 60, 20, 120, "s");
  check("F-15 class: Mach after 150 s full AB at FL300", o(OUT_MACH), 1.9, 1.6, 2.3, "", "ref: Vmax M2.5 at 40,000+ ft");
  check("F-15 class: afterburner flag", o(OUT_AFTERBURNER), 1, 1, 1, "");
  // 9 g pull at 450 KIAS, 15,000 ft
  fleetSetup(AC_F15, 0.0);
  sim.in[IN_GEAR_LEVER] = 0;
  Atmosphere atm;
  double alt = 15000 * FT;
  double tas = 450 * KT / osk::sqrt(atm.at(alt).rho / RHO0_ISA);
  sim.reset(0, 0, alt, 0, tas, false, true);
  sim.in[IN_THROTTLE] = 0.92;
  for (int i = 0; i < 60 * 2; i++) sim.advance(FDT);
  sim.in[IN_PITCH] = 1.0;
  double nzMax = 0;
  for (int i = 0; i < 60 * 3; i++) { sim.advance(FDT); nzMax = maxf(nzMax, o(OUT_NZ)); }
  check("F-15 class: full aft stick 450 KIAS, g limiter", nzMax, 9.0, 8.3, 9.4, "g");
  check("F-15 class: 9 g pull, no structural damage", o(OUT_DMG_WING_L) + o(OUT_DMG_WING_R), 0, 0, 0.001, "");
  sim.in[IN_PITCH] = 0;
  // F-22 class supercruise: military power holds > M1.4 at FL400
  cruiseAt(AC_F22, 40000, 1.5, 0.0, true);
  sim.in[IN_AT_ENGAGED] = 0;
  sim.in[IN_THROTTLE] = 0.92;
  for (int i = 0; i < 60 * 120; i++) sim.advance(FDT);
  check("F-22 class: supercruise, military power, FL400, Mach after 120 s", o(OUT_MACH), 1.55, 1.4, 1.8, "", "no afterburner");
  check("F-22 class: supercruise without afterburner", o(OUT_AFTERBURNER), 0, 0, 0, "");
  // Aerobatic monoplane roll rate
  sim.init(AC_EXTRA);
  sim.setSimMode(true);
  sim.setWeather(P0_ISA, 0, 0, 0, 0, 0, 1);
  sim.in[IN_ASSISTS] = 0;
  sim.setFuel(25, 25);
  sim.setPayload(80, 0, 0);
  sim.reset(0, 0, 3000 * FT, 0, 150 * KT, false, true);
  sim.in[IN_THROTTLE] = 1.0;
  for (int i = 0; i < 60; i++) sim.advance(FDT);
  sim.in[IN_ROLL] = 1.0;
  double pMax = 0;
  for (int i = 0; i < 60 * 2; i++) { sim.advance(FDT); pMax = maxf(pMax, o(OUT_P)); }
  sim.in[IN_ROLL] = 0;
  check("Stinger 330 (Extra 330 class): full aileron roll rate at 150 KIAS", pMax * RAD, 400, 320, 460, "deg/s", "ref: ~400 deg/s");
}

static void testDamage() {
  // Engine fire -> engine fails, fire handle extinguishes; yaw to the dead side
  cruiseAt(AC_NB738, 35000, 0.78, 0.8, true);
  sim.damage(PART_ENGINE_0, 0.7);
  for (int i = 0; i < 60 * 2; i++) sim.advance(FDT);
  check("738 damage: engine 1 hit -> fire warning", (int)o(OUT_FIRE_MASK) & 1, 1, 1, 1, "");
  for (int i = 0; i < 60 * 20; i++) sim.advance(FDT);
  check("738 damage: damaged engine runs down (N1)", o(OUT_N1_0), 10, 0, 30, "%");
  check("738 damage: AP holds heading on one engine", osk::fabs(wrapPi(o(OUT_PSI))) * RAD, 0, 0, 5, "deg");
  sim.in[IN_FIRE_HANDLES] = 1;
  for (int i = 0; i < 60 * 5; i++) sim.advance(FDT);
  check("738 damage: fire handle -> fire out", (int)o(OUT_FIRE_MASK) & 1, 0, 0, 0, "");
  check("738 damage: other engine still running", ((int)o(OUT_ENG_MASK) >> 1) & 1, 1, 1, 1, "");
  // Left wing separation: uncontrollable roll
  cruiseAt(AC_NB738, 20000, 0.6, 0.7, false);
  sim.damage(PART_WING_L, 1.0);
  double phiMax = 0;
  for (int i = 0; i < 60 * 10 && o(OUT_CRASHED) < 0.5; i++) {
    sim.advance(FDT);
    phiMax = maxf(phiMax, -o(OUT_PHI));
  }
  check("738 damage: left wing separation -> parts lost flag", (int)o(OUT_PARTS_LOST) & 1, 1, 1, 1, "");
  check("738 damage: left wing separation -> rolls left", phiMax * RAD, 90, 45, 180, "deg");
  // Fuel leak from a damaged wing
  cruiseAt(AC_A320, 30000, 0.75, 0.7, true);
  double l0 = o(OUT_FUEL_L), r0 = o(OUT_FUEL_R);
  sim.damage(PART_WING_R, 0.5);
  for (int i = 0; i < 60 * 60; i++) sim.advance(FDT);
  check("A320 damage: right wing hit -> fuel leak rate", o(OUT_FUEL_LEAK), 1.5, 0.5, 4.0, "kg/s");
  check("A320 damage: right tank loses more fuel than left (kg in 60 s)", (r0 - o(OUT_FUEL_R)) - (l0 - o(OUT_FUEL_L)), 90, 30, 250, "kg");
  // Hydraulics: heavy wing + tail damage -> FBW reverts to direct law
  sim.damage(PART_WING_L, 0.6);
  sim.damage(PART_TAIL, 0.7);
  for (int i = 0; i < 60 * 10; i++) sim.advance(FDT);
  check("A320 damage: hydraulic pressure after heavy damage", o(OUT_HYD), 0.1, 0.0, 0.3, "");
  check("A320 damage: FBW degraded to direct law", o(OUT_FBW), 2, 2, 2, "");
  // Overstress: full aft stick at 330 KIAS in the conventional-control 738
  fleetSetup(AC_NB738, 0.7);
  sim.in[IN_GEAR_LEVER] = 0;
  Atmosphere atm;
  double alt = 15000 * FT;
  sim.reset(0, 0, alt, 0, 330 * KT / osk::sqrt(atm.at(alt).rho / RHO0_ISA), false, true);
  sim.in[IN_PITCH] = 1.0;
  double nzMax = 0;
  for (int i = 0; i < 60 * 4 && o(OUT_CRASHED) < 0.5; i++) { sim.advance(FDT); nzMax = maxf(nzMax, o(OUT_NZ)); }
  sim.in[IN_PITCH] = 0;
  check("738 overstress: full aft stick 330 KIAS, load factor reached", nzMax, 4.5, 3.75, 8, "g", "limit 2.5 g, ultimate 3.75 g");
  check("738 overstress: wing failure (parts lost)", ((int)o(OUT_PARTS_LOST) & 3) ? 1 : 0, 1, 1, 1, "");
}

// Stabilised approach to the runway on AP (V/S) + autothrottle: level at
// 60 m while the flaps run out, then descend at vsTarget until contact.
static void flyToGround(double vsTarget, int gearLever, bool* gearWarn, double impactVs = 0) {
  const AircraftDef& d = *sim.def;
  sim.in[IN_GEAR_LEVER] = gearLever;
  sim.reset(0, 0, 60, 0, d.approachKias * KT, false, true);
  sim.setGround(0, 0, 0, 1, SURF_ASPHALT);
  sim.in[IN_FLAPS_LEVER] = d.flaps.detents - 1;
  sim.in[IN_THROTTLE] = 0.5;
  sim.in[IN_AT_ENGAGED] = 1;
  sim.in[IN_AT_SPEED] = d.approachKias * KT;
  sim.in[IN_AP_MASTER] = 0;
  sim.advance(FDT);
  sim.in[IN_AP_VERT_MODE] = 0;
  sim.in[IN_AP_VS] = 0;
  sim.in[IN_AP_LAT_MODE] = 1;
  sim.in[IN_AP_HDG] = 0;
  sim.in[IN_AP_MASTER] = 1;
  for (int i = 0; i < 60 * 25; i++) sim.advance(FDT);
  sim.in[IN_AP_VS] = vsTarget;
  for (int i = 0; i < 60 * 90; i++) {
    sim.clearEvents();
    sim.advance(FDT);
    if (gearWarn && ((int)o(OUT_EVENTS) & EV_GEAR_WARN)) *gearWarn = true;
    if (impactVs < 0 && o(OUT_AGL) < 1.2) { sim.setVerticalSpeed(impactVs); impactVs = 0; }
    bool contact = o(OUT_ON_GROUND) > 0.5 || o(OUT_SCRAPE) > 0 || o(OUT_CRASHED) > 0.5 || o(OUT_DMG_FUS) > 0 ||
                   ((int)o(OUT_PARTS_LOST)) != 0;
    if (contact) break;
  }
  sim.in[IN_AP_MASTER] = 0;
  sim.in[IN_AT_ENGAGED] = 0;
  sim.in[IN_THROTTLE] = 0;
  sim.in[IN_PITCH] = 0;
}

static void testLandingSystems() {
  // Landing roll at Vref: ground spoilers (armed), reversers, max manual braking
  fleetSetup(AC_NB738, 0.70);
  const AircraftDef& d = *sim.def;
  sim.reset(0, 0, 0, 0, 0, true, true);
  sim.in[IN_PARK_BRAKE] = 0;
  sim.in[IN_FLAPS_LEVER] = d.flaps.detents - 1;
  for (int i = 0; i < 60 * 15; i++) sim.advance(FDT);
  sim.setGroundSpeed(d.approachKias * KT * 0.97);
  sim.advance(FDT);
  sim.in[IN_SPOILER_ARM] = 1;
  sim.in[IN_THROTTLE] = 0;
  double y0 = o(OUT_Y), t = 0, sbMax = 0;
  Pid rud{2.5, 0.2, 0.0}, ailp{1.2, 0.1, 0};
  while (t < 90 && o(OUT_GS) > 0.5) {
    holdLateral(0, FDT, rud, ailp);
    if (t > 1.0) sim.in[IN_REVERSE] = o(OUT_GS) > 60 * KT ? 1 : 0;
    if (t > 1.5) sim.in[IN_BRAKE_L] = sim.in[IN_BRAKE_R] = 1.0;
    if (o(OUT_GS) < 60 * KT && sim.in[IN_REVERSE] < 0.5) sim.in[IN_THROTTLE] = 0;
    else if (sim.in[IN_REVERSE] > 0.5) sim.in[IN_THROTTLE] = 0.8;
    sim.advance(FDT);
    t += FDT;
    sbMax = maxf(sbMax, o(OUT_SPEEDBRAKE));
  }
  check("738 landing roll: ground spoilers deployed", sbMax, 1, 0.95, 1, "");
  check("738 landing roll: Vref -> stop, spoilers + reversers + max braking", o(OUT_Y) - y0, 850, 600, 1300, "m",
        "ref: ~800-1000 m max manual braking, dry");
  // Gear-up (belly) landing: survivable, structural damage, no break-up
  fleetSetup(AC_NB738, 0.65);
  bool warned = false;
  flyToGround(-1.2, 0, &warned);
  for (int i = 0; i < 60 * 60; i++) sim.advance(FDT);
  check("738 gear-up landing: gear warning sounded", warned ? 1 : 0, 1, 1, 1, "");
  check("738 gear-up landing: survivable (no crash)", o(OUT_CRASHED), 0, 0, 0, "");
  check("738 gear-up landing: nacelle / belly damage", maxf(o(OUT_DMG_FUS), maxf(o(OUT_DMG_ENG_0), o(OUT_DMG_ENG_1))), 0.5, 0.1, 0.95, "",
        "737 nacelles hang lowest and take the slide");
  check("738 gear-up landing: slides to a stop", o(OUT_GS), 0, 0, 1, "m/s");
  // Hard landing: 5 m/s -> gear legs fail, airframe survives; 10 m/s -> destroyed
  for (int k = 0; k < 2; k++) {
    fleetSetup(AC_NB738, 0.65);
    flyToGround(-1.0, 1, nullptr, k == 0 ? -5.0 : -10.0);
    for (int i = 0; i < 60 * 3; i++) sim.advance(FDT);
    if (k == 0) {
      check("738 hard landing 5 m/s: main gear legs fail", ((int)o(OUT_PARTS_LOST) & (16 | 32)) ? 1 : 0, 1, 1, 1, "");
      check("738 hard landing 5 m/s: airframe survives", o(OUT_CRASHED), 0, 0, 0, "");
    } else {
      check("738 impact 10 m/s: destroyed", o(OUT_CRASHED), 1, 1, 1, "");
    }
  }
}

static void testFleet() {
  for (const FleetRef& r : kFleetRefs) {
    fleetTakeoff(r);
    fleetCruise(r);
    fleetApproach(r);
  }
  testJetStart();
  testFbw();
  testFighters();
  testDamage();
  testLandingSystems();
}
