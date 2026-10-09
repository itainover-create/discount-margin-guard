// OPEN SKY core — aircraft simulation: 6-DOF rigid body flight dynamics,
// powerplant, electrical, fuel, landing gear contact, instruments, assists
// and autopilot. Internal frames: world NED (x north, y east, z down) with
// z = -MSL altitude; body FRD (x forward, y right, z down).
#pragma once
#include "aircraft.h"
#include "api.h"
#include "atmosphere.h"

namespace osk {

struct GroundPlane {
  double h = 0.0;           // terrain height MSL at reference point, m
  Vec3 nNed{0, 0, -1};      // surface normal (NED, pointing up = -z)
  double refN = 0, refE = 0;
  int surface = SURF_ASPHALT;
  // Height of the plane at a NED horizontal position.
  double heightAt(double n, double e) const {
    double nu = -nNed.z;
    if (nu < 0.2) nu = 0.2;
    return h - (nNed.x * (n - refN) + nNed.y * (e - refE)) / nu;
  }
};

struct EngineState {
  double rpm = 0, omega = 0, propAngle = 0;
  double map = P0_ISA, power = 0, thrust = 0, torqueProp = 0;
  double fuelFlow = 0, egt = 290, oilT = 288, oilP = 0, far = 0;
  bool running = false, starter = false;
  double crankTime = 0, catchTime = 1.5;
  double prime = 0;          // seconds of priming
  double starve = 0;         // seconds without fuel
  double rough = 0;          // roughness 0..1 for sound/vibration
};

struct ElecState {
  double busV = 0, battA = 0, soc = 0.92;
  bool avionics = false;
  double lowVoltTimer = 0;
};

struct InstrumentState {
  double ias = 0, alt = 0, vs = 0, altPrev = 0;
  double aiPitch = 0, aiRoll = 0, aiErrP = 0, aiErrR = 0;
  double hi = 0, hiDrift = 0, compass = 0, compassRate = 0;
  double turnRate = 0, ball = 0;
  double suction = 0, gyroSpin = 0;
};

struct AutopilotState {
  bool engaged = false;
  int lat = 0, vert = 0;
  double vsTarget = 0;
  double iPitch = 0, iRoll = 0;
  double overrideTimer = 0;
  int discCount = 0;
  bool prevMaster = false;
};

struct AssistState {
  double thetaHold = 0, phiHold = 0, iTheta = 0;
  bool pitchHolding = false, rollHolding = false;
  double groundHdgHold = 0;
  bool groundHolding = false;
};

struct TouchdownState {
  double airTime = 0;
  int count = 0;
  double vs = 0, nz = 0, x = 0, y = 0, bank = 0, pitch = 0, ias = 0, crab = 0, hdg = 0;
  double nzWindow = 0;
  double lastTdTime = -100;
};

class Sim {
 public:
  double in[IN_COUNT];
  double out[OUT_COUNT];

  void init(int aircraftId);
  // Reset to a position (ENU metres, z = MSL of the *ground* when onGround),
  // true heading (rad), true airspeed (m/s).
  void reset(double e, double n, double z, double hdg, double tas, bool onGround, bool engineRunning);
  void setGround(double h, double nE, double nN, double nU, int surface);
  void setWeather(double qnh, double dT, double windFromRad, double wind10, double gust, double turb, unsigned seed);
  void setPayload(double pilotKg, double paxKg, double baggageKg);
  void setFuel(double leftKg, double rightKg);
  void setFailure(int id, bool on) { if (id >= 0 && id < FAIL_COUNT) fail[id] = on; }
  void setTrim(double t) { trim = clamp(t, -1, 1); }
  void alignHeadingIndicator() { ins.hiDrift = 0; ins.hi = magHeading(); }
  void crash(int reason);
  void clearEvents() { events = 0; }
  void setPaused(bool p) { paused = p; }
  void setSimMode(bool sim) { simMode = sim; }
  // Move the aircraft (ENU metres) keeping velocity/attitude: floating-origin rebase.
  void setPosition(double e, double n, double up) {
    double dn = n - pos.x, de = e - pos.y;
    pos = {n, e, -up};
    ground.refN += dn;
    ground.refE += de;
    for (int i = 0; i < 12; i++) { anchorN[i] += dn; anchorE[i] += de; }
  }
  // Set ground speed along the current heading (used for runway-roll tests).
  void setGroundSpeed(double v) {
    double phi, theta, psi;
    qToEuler(q, phi, theta, psi);
    vel = {v * cos(psi), v * sin(psi), vel.z};
  }
  // Advance by dt seconds using fixed internal sub-steps.
  void advance(double dt);

  const AircraftDef* def = nullptr;
  Vec3 dbgFaero{0, 0, 0}, dbgMaero{0, 0, 0}, dbgFgear{0, 0, 0};
  double dbgCL = 0, dbgCD = 0, dbgSigma = 0;

 private:
  // state
  Vec3 pos{0, 0, 0};      // NED
  Vec3 vel{0, 0, 0};      // NED
  Quat q;                 // body -> NED
  Vec3 w{0, 0, 0};        // body rates
  double mass = 1000, fuelKg[2] = {0, 0}, payloadKg = 85;
  Vec3 inertia{1, 1, 1};
  double Ixz = 0;
  double flapDeg = 0, trim = 0;
  double elev = 0, ail = 0, rud = 0, steer = 0;   // normalised surface positions
  double brakeL = 0, brakeR = 0, mixture = 1;
  double alpha = 0, beta = 0, alphaPrev = 0, alphaDot = 0;
  double tas = 0, ias = 0, qbar = 0, mach = 0;
  Vec3 accelBody{0, 0, 0};
  Vec3 windNed{0, 0, 0};
  double simTime = 0, accum = 0;
  bool onGround = false, crashed = false, paused = false, simMode = false;
  int crashReason = 0;
  int events = 0;
  bool stalled = false, stallWarn = false, overspeed = false;
  double stallAsym = 0;
  double gearComp[12] = {0};
  bool anchorSet[12] = {false};
  double anchorN[12] = {0}, anchorE[12] = {0};
  double wheelSpeed = 0, skid = 0, scrape = 0;
  bool fail[FAIL_COUNT] = {false};

  Atmosphere atm;
  WindField wind;
  GroundPlane ground;
  EngineState eng;
  ElecState elec;
  InstrumentState ins;
  AutopilotState ap;
  AssistState as;
  TouchdownState td;
  Rng rng;

  void step(double dt);
  void updateMass();
  void updateElectrical(double dt, const AirData& air);
  void updateEngine(double dt, const AirData& air, double axialSpeed);
  void updateFuel(double dt);
  void updateInstruments(double dt, const AirData& air);
  void computeControls(double dt);
  void autopilot(double dt, double& pitchCmd, double& rollCmd);
  void aero(const AirData& air, const Vec3& vAirBody, Vec3& F, Vec3& M);
  void contacts(double dt, Vec3& Fned, Vec3& Mbody);
  void writeOutputs();
  double magHeading() const;
  double groundAgl() const;
  double stallAngle() const;
  bool assist(int bit) const { return ((int)in[IN_ASSISTS] & bit) != 0; }
};

}  // namespace osk
