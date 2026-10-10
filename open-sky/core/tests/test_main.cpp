// OPEN SKY core — native calibration & regression tests.
// A scripted "test pilot" flies standard profiles and compares the results
// with reference figures for the aircraft class. Output is a table used in
// docs/FLIGHT_MODEL.md; exit code is non-zero if any check fails.
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "osk/sim.h"
#include "osk/traffic.h"

using namespace osk;

struct Result {
  std::string name, unit;
  double value, ref, lo, hi;
  bool pass;
  std::string note;
};
static std::vector<Result> results;

static void check(const char* name, double v, double ref, double lo, double hi, const char* unit, const char* note = "") {
  bool ok = v >= lo && v <= hi;
  results.push_back({name, unit, v, ref, lo, hi, ok, note});
}

struct Pid {
  double kp, ki, kd, i = 0, prev = 0, lo = -1, hi = 1;
  bool first = true;
  double step(double err, double dt) {
    i += err * dt * ki;
    i = clamp(i, lo, hi);
    double d = first ? 0 : (err - prev) / dt;
    first = false;
    prev = err;
    return clamp(kp * err + i + kd * d, lo, hi);
  }
};

static Sim sim;
static const double FDT = 1.0 / 60.0;

static double o(int k) { return sim.out[k]; }

static void baseSetup(bool simMode = true) {
  sim.init(AC_TRAINER);
  sim.setSimMode(simMode);
  sim.setWeather(P0_ISA, 0, 0, 0, 0, 0, 1);
  sim.in[IN_ASSISTS] = 0;
  sim.in[IN_BARO] = P0_ISA;
}

static void mtow() {
  // 767 empty + 248 payload + 142 fuel = 1157 kg
  sim.setFuel(71, 71);
  sim.setPayload(170, 78, 0);
}

// Hold heading with rudder and wings level with aileron (simple test pilot).
static void holdLateral(double hdg, double dt, Pid& rud, Pid& ailp) {
  double herr = wrapPi(hdg - o(OUT_PSI));
  sim.in[IN_YAW] = rud.step(herr, dt) - 0.3 * o(OUT_R);
  sim.in[IN_ROLL] = ailp.step(-o(OUT_PHI), dt) - 0.15 * o(OUT_P);
}

// --- Tests -----------------------------------------------------------------

static void testStaticAndStart() {
  baseSetup(true);
  sim.reset(0, 0, 0, 0, 0, true, false);
  for (int i = 0; i < 600; i++) sim.advance(FDT);
  double x0 = o(OUT_X), y0 = o(OUT_Y);
  for (int i = 0; i < 600; i++) sim.advance(FDT);
  double drift = osk::sqrt(sq(o(OUT_X) - x0) + sq(o(OUT_Y) - y0));
  check("Parked drift over 10 s (brake set)", drift, 0, 0, 0.05, "m");
  check("Main gear static compression", o(OUT_GEAR1), 0.07, 0.03, 0.12, "m");
  check("Nose gear static compression", o(OUT_GEAR0), 0.06, 0.02, 0.12, "m");

  // Cold-start procedure (simulation mode, no assists).
  sim.in[IN_BATTERY] = 1;
  sim.in[IN_BEACON] = 1;
  sim.in[IN_FUEL_SELECTOR] = 2;
  sim.in[IN_FUEL_SHUTOFF] = 1;
  sim.in[IN_THROTTLE] = 0.1;
  sim.in[IN_MIXTURE] = 1.0;
  sim.in[IN_FUEL_PUMP] = 1;
  for (int i = 0; i < 180; i++) sim.advance(FDT);  // prime 3 s
  sim.in[IN_FUEL_PUMP] = 0;
  bool noStartWithoutMags = true;
  sim.in[IN_MAGNETOS] = 4;
  double t = 0;
  while (t < 10 && o(OUT_ENGINE_RUNNING) < 0.5) { sim.advance(FDT); t += FDT; }
  sim.in[IN_MAGNETOS] = 3;
  check("Engine start: crank time to catch", t, 2.0, 0.5, 6.0, "s", "battery, prime 3 s, mixture rich");
  (void)noStartWithoutMags;
  sim.in[IN_ALTERNATOR] = 1;
  sim.in[IN_THROTTLE] = 0.0;
  for (int i = 0; i < 1200; i++) sim.advance(FDT);
  check("Ground idle rpm (throttle closed)", o(OUT_RPM), 650, 550, 900, "rpm");
  sim.in[IN_THROTTLE] = 0.12;
  for (int i = 0; i < 600; i++) sim.advance(FDT);
  check("Alternator charging bus volts (~1000+ rpm)", o(OUT_BUS_V), 28.5, 27.5, 29.0, "V");
  sim.in[IN_THROTTLE] = 1.0;
  for (int i = 0; i < 600; i++) sim.advance(FDT);
  check("Static full-throttle rpm (brakes)", o(OUT_RPM), 2350, 2200, 2500, "rpm", "C172S-class static ~2300-2400");
  check("Static thrust", o(OUT_THRUST), 2700, 2200, 3300, "N");
  check("Parked with full power: no creep", osk::sqrt(sq(o(OUT_X) - x0) + sq(o(OUT_Y) - y0)), 0, 0, 0.3, "m");
  double ffGph = o(OUT_FUEL_FLOW) / 0.72 * 3600 / 3.785;
  check("Fuel flow full throttle static", ffGph, 13, 10, 16, "gal/h");
  // Mixture cut-off shuts down
  sim.in[IN_THROTTLE] = 0.1;
  sim.in[IN_MIXTURE] = 0.0;
  for (int i = 0; i < 300; i++) sim.advance(FDT);
  check("Mixture idle cut-off stops engine (running flag)", o(OUT_ENGINE_RUNNING), 0, 0, 0, "");
}

// Regression: start after sitting parked (battery on) for a minute, without
// the aux fuel pump. Accessible mode must start; the engine-driven pump
// supplies fuel while cranking.
static void testStartAfterWait() {
  baseSetup(false);
  sim.in[IN_ASSISTS] = AS_EASY_START | AS_AUTO_MIXTURE;
  sim.reset(0, 0, 0, 0, 0, true, false);
  sim.in[IN_BATTERY] = 1;
  sim.in[IN_FUEL_SELECTOR] = 2;
  sim.in[IN_FUEL_SHUTOFF] = 1;
  sim.in[IN_MIXTURE] = 1.0;
  sim.in[IN_THROTTLE] = 0.1;
  for (int i = 0; i < 60 * 60; i++) sim.advance(FDT);
  sim.in[IN_MAGNETOS] = 4;
  double t = 0;
  while (t < 10 && o(OUT_ENGINE_RUNNING) < 0.5) { sim.advance(FDT); t += FDT; }
  sim.in[IN_MAGNETOS] = 3;
  for (int i = 0; i < 600; i++) sim.advance(FDT);
  check("Start after 60 s parked (no aux pump, easy start)", t, 2.0, 0.5, 6.0, "s");
  check("  ... keeps running at idle", o(OUT_ENGINE_RUNNING), 1, 1, 1, "");
}

static void testBatteryDrain() {
  baseSetup(true);
  sim.reset(0, 0, 0, 0, 0, true, false);
  sim.in[IN_BATTERY] = 1;
  sim.in[IN_AVIONICS] = 1;
  sim.in[IN_LANDING_LIGHT] = 1;
  sim.in[IN_TAXI_LIGHT] = 1;
  double v0 = 0;
  for (int i = 0; i < 60; i++) sim.advance(FDT);
  v0 = o(OUT_BUS_V);
  for (int i = 0; i < 60 * 60 * 20; i++) sim.advance(FDT);  // 20 min
  check("Battery only: bus volts at start", v0, 24.2, 23.5, 25.2, "V");
  check("Battery only: SOC after 20 min, 20 A load", o(OUT_BATT_SOC), 0.73, 0.6, 0.85, "");
}

// Takeoff at MTOW, sea level ISA, no wind, flaps 0: rotate at 55 KIAS to
// ~9 deg, then climb at 62 KIAS (speed on pitch) until 50 ft.
static void testTakeoff() {
  baseSetup(true);
  sim.reset(0, 0, 0, 0, 0, true, true);
  mtow();
  sim.in[IN_PARK_BRAKE] = 0;
  sim.in[IN_THROTTLE] = 1.0;
  sim.in[IN_MIXTURE] = 1.0;
  Pid rud{2.5, 0.2, 0.0}, ailp{1.2, 0.1, 0};
  Pid pitch{4.0, 2.0, 0.0};
  double t = 0, liftoffDist = -1, dist50 = -1, liftoffIas = 0;
  double x0 = o(OUT_Y);
  bool rotating = false;
  double thetaCmd = 9.0 * DEG;
  while (t < 60) {
    holdLateral(0, FDT, rud, ailp);
    if (o(OUT_IAS) > 55 * KT) rotating = true;
    if (rotating) {
      if (liftoffDist > 0) {
        double rate = clamp(0.006 * (o(OUT_IAS) - 62 * KT), -0.03, 0.03);
        thetaCmd = clamp(thetaCmd + rate * FDT, 0.0, 0.25);
      }
      sim.in[IN_PITCH] = pitch.step(thetaCmd - o(OUT_THETA), FDT) - 0.6 * o(OUT_Q);
    } else {
      sim.in[IN_PITCH] = 0.0;
    }
    sim.advance(FDT);
    t += FDT;
    if (liftoffDist < 0 && o(OUT_ON_GROUND) < 0.5 && o(OUT_IAS) > 40 * KT) {
      liftoffDist = o(OUT_Y) - x0;
      liftoffIas = o(OUT_IAS);
    }
    if (dist50 < 0 && o(OUT_AGL) > 50 * FT) { dist50 = o(OUT_Y) - x0; break; }
  }
  check("Takeoff ground roll (MTOW, SL, ISA, flaps 0)", liftoffDist / FT, 960, 760, 1250, "ft", "ref 960 ft (C172S-class POH)");
  check("Lift-off speed", liftoffIas / KT, 55, 50, 62, "KIAS");
  check("Takeoff distance over 50 ft obstacle", dist50 / FT, 1630, 1250, 2100, "ft", "ref 1630 ft");
  check("Takeoff: crashed flag", o(OUT_CRASHED), 0, 0, 0, "");
  check("Takeoff: no tail strike", (int)o(OUT_EVENTS) & EV_TAIL_STRIKE, 0, 0, 0, "");
}

// Fly speed-hold with pitch attitude (slow outer loop like a pilot);
// returns avg vertical speed (m/s) over the second half of the window.
static double flySpeedHold(double kias, double throttle, double seconds, double* tasOut = nullptr, double* rpmOut = nullptr) {
  Pid rud{2.0, 0.1, 0}, ailp{1.2, 0.1, 0};
  Pid pit{3.0, 0.8, 0};
  sim.in[IN_THROTTLE] = throttle;
  double hdg = o(OUT_PSI);
  double t = 0, vsSum = 0, tasSum = 0, rpmSum = 0;
  int n = 0;
  double thetaCmd = o(OUT_THETA), prevIas = o(OUT_IAS), acc = 0;
  while (t < seconds) {
    double ias = o(OUT_IAS);
    acc = 0.95 * acc + 0.05 * (ias - prevIas) / FDT;
    prevIas = ias;
    double rate = clamp(0.006 * (ias - kias * KT) + 0.03 * acc, -0.03, 0.03);
    thetaCmd = clamp(thetaCmd + rate * FDT, -0.4, 0.4);
    sim.in[IN_PITCH] = pit.step(thetaCmd - o(OUT_THETA), FDT) - 0.5 * o(OUT_Q);
    holdLateral(hdg, FDT, rud, ailp);
    sim.advance(FDT);
    t += FDT;
    if (t > seconds * 0.5) {
      vsSum += o(OUT_VS);
      tasSum += o(OUT_TAS);
      rpmSum += o(OUT_RPM);
      n++;
    }
  }
  if (tasOut) *tasOut = tasSum / n;
  if (rpmOut) *rpmOut = rpmSum / n;
  return vsSum / n;
}

// Hold altitude with pitch; returns average TAS.
static double flyAltHold(double altM, double throttle, double seconds, double* rpmOut = nullptr, double* ffOut = nullptr) {
  Pid alt{0.004, 0.0004, 0.0};
  alt.lo = -0.2; alt.hi = 0.25;
  Pid pit{3.0, 0.8, 0};
  Pid rud{2.0, 0.1, 0}, ailp{1.2, 0.1, 0};
  sim.in[IN_THROTTLE] = throttle;
  double hdg = o(OUT_PSI);
  double t = 0, tasSum = 0, rpmSum = 0, ffSum = 0;
  int n = 0;
  while (t < seconds) {
    double vsCmd = clamp((altM - o(OUT_ALT_MSL)) * 0.1, -3, 3);
    double thetaCmd = alt.step(0, FDT) + o(OUT_ALPHA) + (vsCmd - o(OUT_VS)) / maxf(o(OUT_TAS), 20) * 2.0 +
                      osk::asin(clamp(vsCmd / maxf(o(OUT_TAS), 20), -0.3, 0.3));
    sim.in[IN_PITCH] = pit.step(thetaCmd - o(OUT_THETA), FDT) - 0.5 * o(OUT_Q);
    holdLateral(hdg, FDT, rud, ailp);
    sim.advance(FDT);
    t += FDT;
    if (t > seconds * 0.6) {
      tasSum += o(OUT_TAS);
      rpmSum += o(OUT_RPM);
      ffSum += o(OUT_FUEL_FLOW);
      n++;
    }
  }
  if (rpmOut) *rpmOut = rpmSum / n;
  if (ffOut) *ffOut = ffSum / n;
  return tasSum / n;
}

static void testClimbCruise() {
  baseSetup(true);
  sim.reset(0, 0, 300, 0, 74 * KT, false, true);
  mtow();
  sim.in[IN_MIXTURE] = 1.0;
  double vs = flySpeedHold(74, 1.0, 90);
  check("Max rate of climb at Vy 74 KIAS (MTOW, ~1000 ft)", vs / FPM, 730, 600, 880, "ft/min", "ref 730 fpm at SL");

  baseSetup(true);
  sim.reset(0, 0, 300, 0, 110 * KT, false, true);
  mtow();
  double rpm;
  double tas = flyAltHold(300, 1.0, 180, &rpm);
  check("Max level speed ~1000 ft (full throttle)", tas / KT, 124, 117, 131, "KTAS", "ref ~124 KTAS at SL");
  check("RPM at max level speed", rpm, 2700, 2550, 2800, "rpm");

  baseSetup(true);
  sim.reset(0, 0, 8000 * FT, 0, 115 * KT, false, true);
  mtow();
  sim.in[IN_ASSISTS] = AS_AUTO_MIXTURE;
  sim.in[IN_MIXTURE] = 1.0;
  double ff;
  tas = flyAltHold(8000 * FT, 1.0, 200, &rpm, &ff);
  check("Full throttle at 8000 ft (best-power mixture)", tas / KT, 122, 114, 130, "KTAS", "ref ~122 KTAS (75% power)");
  check("Fuel flow at 8000 ft full throttle", ff / 0.72 * 3600 / 3.785, 9.5, 8.0, 11.5, "gal/h");
}

// Power-off stall entry at ~1 kt/s deceleration holding altitude, MTOW.
static double stallSpeed(int flapLever) {
  baseSetup(true);
  sim.reset(0, 0, 1500, 0, 70 * KT, false, true);
  mtow();
  sim.in[IN_FLAPS_LEVER] = flapLever;
  flySpeedHold(68, 0.0, 15);
  Pid rud{2.0, 0.1, 0}, ailp{1.2, 0.1, 0};
  Pid pit{4.0, 2.0, 0};
  double hdg = o(OUT_PSI);
  double minIas = 1e9, t = 0;
  double thetaCmd = o(OUT_THETA), prevIas = o(OUT_IAS), acc = 0;
  while (t < 120) {
    double ias = o(OUT_IAS);
    acc = 0.95 * acc + 0.05 * (ias - prevIas) / FDT;
    prevIas = ias;
    // target deceleration 0.5 m/s^2 (~1 kt/s): too slow decel -> raise nose
    double rate = clamp(0.02 * (acc + 0.5) + 0.004 * o(OUT_VS) * 0.0, -0.02, 0.02);
    thetaCmd = clamp(thetaCmd + rate * FDT, -0.3, 0.5);
    sim.in[IN_PITCH] = pit.step(thetaCmd - o(OUT_THETA), FDT) - 0.5 * o(OUT_Q);
    holdLateral(hdg, FDT, rud, ailp);
    sim.advance(FDT);
    t += FDT;
    if (o(OUT_IAS) < minIas) minIas = o(OUT_IAS);
    if (o(OUT_STALLED) > 0.5 || o(OUT_ALPHA) > 17.5 * DEG) break;
  }
  return minIas;
}

static void testStall() {
  double vs1 = stallSpeed(0);
  check("Stall speed clean, idle (Vs1, MTOW)", vs1 / KT, 48, 45, 54, "KCAS", "POH-class 48 KIAS; model IAS = CAS (no pitot position error)");
  double vs0 = stallSpeed(3);
  check("Stall speed flaps 30, idle (Vso, MTOW)", vs0 / KT, 40, 37, 46, "KCAS", "POH-class 40 KIAS");
  // Stall warning margin
  baseSetup(true);
  sim.reset(0, 0, 1500, 0, 60 * KT, false, true);
  mtow();
  sim.in[IN_THROTTLE] = 0.0;
  double warnIas = 0;
  Pid pit{3.0, 0.8, 0};
  double thetaCmd = o(OUT_THETA);
  for (int i = 0; i < 60 * 60; i++) {
    thetaCmd = clamp(thetaCmd + 0.004 * FDT * 10, -0.3, 0.45);
    sim.in[IN_PITCH] = pit.step(thetaCmd - o(OUT_THETA), FDT) - 0.5 * o(OUT_Q);
    sim.advance(FDT);
    if (warnIas == 0 && o(OUT_STALL_WARN) > 0.5) warnIas = o(OUT_IAS);
    if (o(OUT_STALLED) > 0.5) break;
  }
  check("Stall warning activation speed (clean)", warnIas / KT, 55, 50, 62, "KIAS", "horn 5-10 kt above stall");
}

static void testGlide() {
  baseSetup(true);
  sim.reset(0, 0, 2000, 0, 68 * KT, false, true);
  mtow();
  sim.in[IN_MIXTURE] = 0.0;  // engine off
  double tas;
  flySpeedHold(68, 0.0, 20);
  double vs = flySpeedHold(68, 0.0, 60, &tas);
  double ratio = o(OUT_GS) / -vs;
  check("Glide ratio at 68 KIAS, engine off, prop windmilling", ratio, 9.0, 7.8, 10.5, ":1", "ref 1.5 nm / 1000 ft");
  check("Windmilling rpm at 68 KIAS", o(OUT_RPM), 900, 300, 1400, "rpm");
}

static void testLandingRoll() {
  baseSetup(true);
  sim.reset(0, 0, 0, 0, 0, true, true);
  mtow();
  sim.in[IN_PARK_BRAKE] = 0;
  sim.in[IN_FLAPS_LEVER] = 3;
  for (int i = 0; i < 60 * 12; i++) sim.advance(FDT);
  sim.setGroundSpeed(48 * KT);
  sim.in[IN_THROTTLE] = 0;
  sim.in[IN_BRAKE_L] = sim.in[IN_BRAKE_R] = 1.0;
  sim.in[IN_PITCH] = 0.3;
  Pid rud{2.5, 0.2, 0.0}, ailp{1.2, 0.1, 0};
  double y0 = o(OUT_Y), t = 0;
  while (t < 40 && o(OUT_GS) > 0.3) {
    holdLateral(0, FDT, rud, ailp);
    sim.advance(FDT);
    t += FDT;
  }
  check("Landing ground roll from 48 kt, max braking, flaps 30", (o(OUT_Y) - y0) / FT, 575, 420, 760, "ft", "ref 575 ft");
}

static void testHandling() {
  // Roll rate at 90 KIAS, full aileron.
  baseSetup(true);
  sim.reset(0, 0, 1500, 0, 90 * KT, false, true);
  sim.in[IN_THROTTLE] = 0.6;
  for (int i = 0; i < 120; i++) sim.advance(FDT);
  sim.in[IN_ROLL] = 1.0;
  double maxP = 0;
  for (int i = 0; i < 90; i++) {
    sim.advance(FDT);
    if (o(OUT_P) > maxP) maxP = o(OUT_P);
    if (o(OUT_PHI) > 60 * DEG) break;
  }
  check("Roll rate, full aileron at 90 KIAS", maxP * RAD, 45, 30, 70, "deg/s");

  // Short-period: pitch doublet, check it settles (no divergence)
  baseSetup(true);
  sim.reset(0, 0, 1500, 0, 100 * KT, false, true);
  sim.in[IN_THROTTLE] = 0.65;
  for (int i = 0; i < 60 * 5; i++) sim.advance(FDT);
  sim.in[IN_PITCH] = 0.3;
  for (int i = 0; i < 30; i++) sim.advance(FDT);
  sim.in[IN_PITCH] = 0.0;
  double qmax = 0;
  for (int i = 0; i < 60 * 3; i++) { sim.advance(FDT); }
  for (int i = 0; i < 60 * 2; i++) { sim.advance(FDT); qmax = maxf(qmax, osk::fabs(o(OUT_Q))); }
  check("Short period: |q| 3-5 s after doublet", qmax * RAD, 0, 0, 2.0, "deg/s", "should be damped");

  // Phugoid: hands-off after a pitch pulse; period from IAS peaks (1 Hz samples).
  baseSetup(true);
  sim.reset(0, 0, 1500, 0, 95 * KT, false, true);
  sim.in[IN_THROTTLE] = 0.62;
  for (int i = 0; i < 60 * 20; i++) sim.advance(FDT);
  sim.in[IN_PITCH] = 0.25;
  for (int i = 0; i < 60 * 2; i++) sim.advance(FDT);
  sim.in[IN_PITCH] = 0.0;
  std::vector<double> ias;
  for (int i = 0; i < 60 * 150; i++) {
    sim.advance(FDT);
    if (i % 60 == 0) ias.push_back(o(OUT_IAS) / KT);
  }
  std::vector<int> peaks;
  for (size_t i = 3; i + 3 < ias.size(); i++) {
    bool isMax = true;
    for (int k = -3; k <= 3; k++) if (k && ias[i + k] > ias[i]) isMax = false;
    if (isMax) peaks.push_back((int)i);
  }
  double period = peaks.size() >= 2 ? (double)(peaks.back() - peaks.front()) / (peaks.size() - 1) : 0;
  check("Phugoid period (hands off)", period, 30, 15, 50, "s", "light-aircraft typical 20-40 s");
  check("Hands-off: no crash/divergence in 120 s", o(OUT_CRASHED) + (osk::fabs(o(OUT_PHI)) > 60 * DEG ? 1 : 0), 0, 0, 0, "");
}

static void testAutopilot() {
  baseSetup(true);
  sim.reset(0, 0, 3000 * FT, 0, 100 * KT, false, true);
  sim.setWeather(P0_ISA, 0, 270 * DEG, 8, 3, 1.0, 42);
  sim.in[IN_THROTTLE] = 0.68;
  sim.in[IN_MAG_VAR] = -13 * DEG;
  sim.in[IN_AP_LAT_MODE] = 1;
  sim.in[IN_AP_VERT_MODE] = 1;
  sim.in[IN_AP_HDG] = 90 * DEG;
  sim.in[IN_AP_ALT] = 3000 * FT;
  for (int i = 0; i < 60; i++) sim.advance(FDT);
  sim.in[IN_AP_MASTER] = 1;
  double maxDev = 0;
  for (int i = 0; i < 60 * 120; i++) {
    sim.advance(FDT);
    if (i > 60 * 40) maxDev = maxf(maxDev, osk::fabs(o(OUT_IND_ALT) - 3000 * FT));
  }
  double hdgErr = osk::fabs(wrapPi(o(OUT_HI_HDG) - 90 * DEG)) * RAD;
  check("AP engaged after 120 s", o(OUT_AP_ENGAGED), 1, 1, 1, "");
  check("AP ALT hold deviation (light turbulence)", maxDev / FT, 0, 0, 80, "ft");
  check("AP HDG capture error", hdgErr, 0, 0, 3, "deg");
  // Override disconnects
  sim.in[IN_PITCH] = 0.6;
  for (int i = 0; i < 60; i++) sim.advance(FDT);
  sim.in[IN_PITCH] = 0.0;
  check("AP disconnects on pilot override", o(OUT_AP_ENGAGED), 0, 0, 0, "");
}

static void testAssists() {
  // Accessible mode: attitude hold keeps level flight hands-off with gusts.
  baseSetup(false);
  sim.reset(0, 0, 2000 * FT, 0, 95 * KT, false, true);
  sim.setWeather(P0_ISA, 0, 200 * DEG, 10, 5, 1.5, 9);
  sim.in[IN_ASSISTS] = AS_AUTO_RUDDER | AS_STALL_PROTECT | AS_ATTITUDE_HOLD | AS_AUTO_MIXTURE;
  sim.in[IN_THROTTLE] = 0.62;
  double maxBank = 0;
  for (int i = 0; i < 60 * 60; i++) {
    sim.advance(FDT);
    maxBank = maxf(maxBank, osk::fabs(o(OUT_PHI)));
  }
  check("Accessible: max bank hands-off in turbulence", maxBank * RAD, 0, 0, 12, "deg");
  // Stall protection (calm air): full aft stick at idle must not stall
  sim.setWeather(P0_ISA, 0, 0, 0, 0, 0, 9);
  sim.in[IN_THROTTLE] = 0;
  sim.in[IN_PITCH] = 1.0;
  int stalledFrames = 0;
  for (int i = 0; i < 60 * 30; i++) {
    sim.advance(FDT);
    if (o(OUT_STALLED) > 0.5) stalledFrames++;
  }
  check("Accessible: stall protection, frames stalled with full aft stick", stalledFrames, 0, 0, 30, "frames");
}

static void testCrosswindAndCrash() {
  // Crosswind taxi weathervaning & control at 15 kt direct crosswind.
  baseSetup(true);
  sim.reset(0, 0, 0, 0, 0, true, true);
  sim.setWeather(P0_ISA, 0, 90 * DEG, 7.7, 0, 0, 3);
  sim.in[IN_PARK_BRAKE] = 0;
  sim.in[IN_THROTTLE] = 1.0;
  Pid rud{2.5, 0.3, 0.0}, ailp{1.2, 0.1, 0};
  double maxDev = 0, t = 0;
  while (t < 14) {
    holdLateral(0, FDT, rud, ailp);
    sim.in[IN_ROLL] = 0.4;  // aileron into wind
    sim.in[IN_PITCH] = -0.05;
    sim.advance(FDT);
    t += FDT;
    maxDev = maxf(maxDev, osk::fabs(wrapPi(o(OUT_PSI))) * RAD);
    if (o(OUT_IAS) > 50 * KT) break;
  }
  check("15 kt crosswind takeoff roll: max heading deviation", maxDev, 0, 0, 6, "deg");

  // Hard landing: 900 fpm onto runway -> gear collapse
  baseSetup(true);
  sim.reset(0, 0, 3, 0, 55 * KT, false, true);
  sim.setGround(0, 0, 0, 1, SURF_ASPHALT);
  for (int i = 0; i < 60 * 3 && o(OUT_CRASHED) < 0.5; i++) {
    sim.in[IN_PITCH] = -0.6;
    sim.advance(FDT);
  }
  // the gear legs fail (the airframe survives on its belly) or it is destroyed
  bool collapsed = ((int)o(OUT_PARTS_LOST) & (8 | 16 | 32)) != 0;
  check("Steep impact: gear collapse or crash", (collapsed || o(OUT_CRASHED) > 0.5) ? 1 : 0, 1, 1, 1, "");
}

#include "test_fleet.h"

static void testTrafficCore() {
  TrafficSystem ts;
  ts.reset();
  // simple airport: one runway 0-3000 m north, taxiway parallel at x=200
  int rw = ts.addRunway(0, 0, 0, 0, 3000, 0, 45, 0);
  int n0 = ts.addNode(200, 0, NODE_TAXI, -1);
  int n1 = ts.addNode(200, 1500, NODE_TAXI, -1);
  int n2 = ts.addNode(200, 3000, NODE_TAXI, -1);
  int h0 = ts.addNode(90, 0, NODE_HOLD, rw);
  int h2 = ts.addNode(90, 3000, NODE_HOLD, rw);
  int r0 = ts.addNode(0, 0, NODE_RUNWAY, rw);
  int r2 = ts.addNode(0, 3000, NODE_RUNWAY, rw);
  int g0 = ts.addNode(400, 1500, NODE_GATE, -1);
  ts.addEdge(n0, n1, 0); ts.addEdge(n1, n2, 0); ts.addEdge(n0, h0, 0); ts.addEdge(h0, r0, 0);
  ts.addEdge(n2, h2, 0); ts.addEdge(h2, r2, 0); ts.addEdge(n1, g0, 0);
  ts.addEdge(r0, r2, 0);
  ts.finalize();
  int path[64];
  int len = ts.findPath(g0, h0, path, 64, -1);
  check("Taxi A*: path gate->hold short", len, 4, 4, 4, "nodes");
  len = ts.findPath(g0, h2, path, 64, -1);
  check("Taxi A*: avoids runway as taxi route", len, 4, 4, 4, "nodes");
  int a = ts.requestRunway(0, rw, REQ_TAKEOFF, 0);
  int b = ts.requestRunway(1, rw, REQ_TAKEOFF, 0);
  check("Runway lock: first takeoff cleared", a, 1, 1, 1, "");
  check("Runway lock: second must hold", b, 0, 0, 0, "");
  ts.releaseRunway(0, rw);
  b = ts.requestRunway(1, rw, REQ_TAKEOFF, 0);
  check("Runway lock: released then cleared", b, 1, 1, 1, "");
}

int main(int argc, char** argv) {
  bool verbose = argc > 1 && std::strcmp(argv[1], "-v") == 0;
  fleetVerbose = verbose;
  bool fleetOnly = argc > 2 && std::strcmp(argv[2], "fleet") == 0;
  if (!fleetOnly) {
  testStaticAndStart();
  testStartAfterWait();
  testBatteryDrain();
  testTakeoff();
  testClimbCruise();
  testStall();
  testGlide();
  testLandingRoll();
  testHandling();
  testAutopilot();
  testAssists();
  testCrosswindAndCrash();
  testTrafficCore();
  }
  testFleet();

  int fails = 0;
  std::printf("| Test | Result | Reference | Accepted range | Status |\n|---|---|---|---|---|\n");
  for (auto& r : results) {
    std::printf("| %s | %.2f %s | %.1f | %.1f – %.1f | %s |%s%s\n", r.name.c_str(), r.value, r.unit.c_str(), r.ref,
                r.lo, r.hi, r.pass ? "PASS" : "**FAIL**", r.note.empty() ? "" : " ", r.note.c_str());
    if (!r.pass) fails++;
  }
  std::printf("\n%d / %zu checks passed\n", (int)results.size() - fails, results.size());
  return fails ? 1 : 0;
}
