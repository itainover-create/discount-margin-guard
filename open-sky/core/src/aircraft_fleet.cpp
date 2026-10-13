// GLOBAL SKIES — fleet. Each aircraft is defined by its own geometry, mass,
// engines, gear and flight-control law; aerodynamic derivatives are
// class-typical non-dimensional values (airliner / fighter / flying wing /
// business jet / aerobatic) applied to that geometry, then checked by
// tests/test_main.cpp against published performance figures of the class.
// Each design has an original internal name; the real type it is modelled on
// (shown by default in the client) is given in the comment above its Spec
// (see docs/FLIGHT_MODEL.md).
#include "osk/aircraft.h"

namespace osk {

const AircraftDef& trainerDef();

namespace {

struct Spec {
  const char* id;
  Category cat;
  ControlLaw law;
  // mass, kg
  double mtow, oew, fuelCap;
  // geometry, m / m^2 / deg
  double S, b, c, L, sweepDeg;
  // aerodynamics
  double CL0, CD0, e, CLmaxClean, CLmaxLand, CDflapFull, cdGear;
  // flaps (detents, angles, vfe)
  int detents;
  double flapDeg[6], vfe[6];
  double flapRate;
  // engines
  int engines;
  double thrustN, abThrustN, idleN1, idleFrac, spoolUp, spoolDown, tsfc, abTsfc, lapseM, densExp, reverseFrac, tvc;
  Vec3 enginePos[4];
  // gear
  int retractable;
  double wheelbase, track, cgHeight, mainAft, gearTransit, vle;
  int tailwheel;
  // structural points
  double tailX, tailStrikeDeg, nacelleY, nacelleZ, nacelleX;
  // limits & speeds
  double vmo, mmo, mcrit, cdWave, gMax, gMin, vsCollapse;
  double rotate, approach;
  // control law
  double nzMax, nzMin, rollRateMaxDeg, alphaMaxDeg, bankMaxDeg;
  // handling class: 0 airliner, 1 fighter, 2 flying wing, 3 bizjet, 4 aerobatic
  int handling;
  Vec3 eye;
  double steerMaxDeg, casterMaxDeg;
  double spoilerCd, spoilerClDump, spoilerRoll;
  int toDetent;  // takeoff flaps (0 = detent closest to 10 deg)
};

// Lift-curve slope (per rad) from aspect ratio and sweep (DATCOM / Helmbold).
double liftSlope(double A, double sweepDeg) {
  double t = tan(sweepDeg * DEG);
  return 2.0 * PI * A / (2.0 + sqrt(4.0 + A * A * (1.0 + t * t))) * 1.07;
}

AircraftDef make(const Spec& s) {
  AircraftDef d{};
  d.id = s.id;
  d.engineType = EngineType::Turbofan;
  d.law = s.law;
  d.category = s.cat;
  double A = s.b * s.b / s.S;
  double CLa = liftSlope(A, s.sweepDeg);
  // fighters: fuselage / chine and leading-edge vortex lift on top of the
  // wing's own lift slope (reference area = wing)
  if (s.handling == 1) CLa *= 1.45;
  AeroDef& a = d.aero;
  a.S = s.S; a.b = s.b; a.c = s.c;
  a.wingHeight = s.cgHeight * 0.9;
  a.CL0 = s.CL0;
  a.CLa = CLa;
  a.CLq = 5.0; a.CLadot = 2.0; a.CLde = 0.32;
  a.alphaStall = (s.CLmaxClean - s.CL0) / CLa + 2.5 * DEG;
  a.stallSharpness = 32.0;
  // High-lift system: about half of the CLmax gain is a shift of the lift
  // curve (flaps), the rest comes from a higher stall angle (slats).
  double dCLmax = s.CLmaxLand - s.CLmaxClean;
  a.CLflapFull = 0.5 * dCLmax + 0.05;
  a.alphaStallFlapDelta = -((dCLmax - a.CLflapFull) / CLa - 0.5 * DEG);
  a.CLpostScale = 1.0;
  a.CD0 = s.CD0;
  a.kInduced = 1.0 / (PI * A * s.e);
  a.CDflapFull = s.CDflapFull;
  a.CDgearDown = 0.0;  // gear drag applied with the gear position
  a.CDpostScale = 1.3;
  a.stallWarnMargin = 2.5 * DEG;
  a.tailSlipstream = 0.0;
  switch (s.handling) {
    case 1:  // fighter (stability augmented)
      a.Cm0 = 0.0; a.Cma = -0.25; a.Cmq = -5.5; a.Cmadot = -1.5; a.Cmde = -0.85;
      a.CmTrimMax = 0.08; a.CmFlapFull = 0.0; a.CmStallBreak = -0.05;
      a.CmElevMaxUp = 0.45; a.CmElevMaxDown = 0.45;
      a.CYb = -1.0; a.CYp = 0.0; a.CYr = 0.5; a.CYdr = -0.18;
      a.Clb = -0.08; a.Clp = -0.28; a.Clr = 0.05; a.ClrPerCL = 0.15; a.Clda = 0.075; a.Cldr = -0.01;
      a.Cnb = 0.18; a.Cnp = 0.0; a.CnpPerCL = -0.05; a.Cnr = -0.35; a.Cnda = -0.002; a.Cndr = 0.07;
      a.deUp = 25 * DEG; a.deDown = 20 * DEG; a.daMax = 20 * DEG; a.drMax = 30 * DEG;
      break;
    case 2:  // flying wing: no vertical tail, drag rudders for yaw
      a.Cm0 = 0.02; a.Cma = -0.35; a.Cmq = -8.0; a.Cmadot = -2.0; a.Cmde = -0.6;
      a.CmTrimMax = 0.12; a.CmFlapFull = 0.0; a.CmStallBreak = -0.1;
      a.CmElevMaxUp = 0.3; a.CmElevMaxDown = 0.3;
      a.CYb = -0.15; a.CYp = 0.0; a.CYr = 0.05; a.CYdr = -0.02;
      a.Clb = -0.10; a.Clp = -0.45; a.Clr = 0.08; a.ClrPerCL = 0.2; a.Clda = 0.09; a.Cldr = 0.0;
      a.Cnb = 0.015; a.Cnp = -0.01; a.CnpPerCL = -0.05; a.Cnr = -0.12; a.Cnda = -0.004; a.Cndr = 0.035;
      a.deUp = 25 * DEG; a.deDown = 25 * DEG; a.daMax = 25 * DEG; a.drMax = 45 * DEG;
      break;
    case 4:  // aerobatic monoplane (handled as a piston aircraft below)
      break;
    default:  // airliner / business jet (conventional tail, yaw damper)
      a.Cm0 = 0.02; a.Cma = -1.1; a.Cmq = -24.0; a.Cmadot = -6.0; a.Cmde = -1.3;
      a.CmTrimMax = 0.30; a.CmFlapFull = -0.10; a.CmStallBreak = -0.2;
      a.CmElevMaxUp = 0.65; a.CmElevMaxDown = 0.65;
      a.CYb = -0.9; a.CYp = 0.0; a.CYr = 0.35; a.CYdr = -0.18;
      a.Clb = -0.15; a.Clp = -0.38; a.Clr = 0.12; a.ClrPerCL = 0.25; a.Clda = 0.085; a.Cldr = -0.006;
      a.Cnb = 0.16; a.Cnp = -0.02; a.CnpPerCL = -0.1; a.Cnr = -0.30; a.Cnda = -0.004; a.Cndr = 0.10;
      a.deUp = 25 * DEG; a.deDown = 20 * DEG; a.daMax = 20 * DEG; a.drMax = 27 * DEG;
      break;
  }
  // flaps
  d.flaps.detents = s.detents;
  for (int i = 0; i < 6; i++) { d.flaps.angleDeg[i] = s.flapDeg[i]; d.flaps.vfeKias[i] = s.vfe[i]; }
  d.flaps.maxDeg = s.flapDeg[s.detents - 1];
  d.flaps.rateDegPerSec = s.flapRate;
  d.flaps.electric = false;  // hydraulic
  d.flaps.liftExp = s.handling == 1 ? 0.6 : 0.3;
  // mass & inertia from typical radii of gyration
  d.mass.emptyKg = s.oew;
  d.mass.mtowKg = s.mtow;
  d.mass.refMassKg = s.mtow * 0.85;
  double m = d.mass.refMassKg;
  double rx = s.handling == 1 ? 0.22 : (s.handling == 2 ? 0.30 : 0.29);
  d.mass.Ixx = m * sq(rx * s.b * 0.5);
  d.mass.Iyy = m * sq(0.38 * s.L * 0.5);
  d.mass.Izz = m * sq(0.46 * (s.b + s.L) * 0.25);
  d.mass.Ixz = 0.02 * d.mass.Izz;
  // fuel: two wing groups (centre tank shared)
  d.fuel.tanks = 2;
  d.fuel.capacityKg[0] = d.fuel.capacityKg[1] = s.fuelCap * 0.5;
  d.fuel.tankY[0] = -0.22 * s.b; d.fuel.tankY[1] = 0.22 * s.b;
  d.fuel.densityKgL = 0.80;
  // engines
  JetDef& j = d.jet;
  j.count = s.engines;
  j.thrustN = s.thrustN; j.abThrustN = s.abThrustN; j.idleN1 = s.idleN1; j.idleFrac = s.idleFrac;
  j.spoolUp = s.spoolUp; j.spoolDown = s.spoolDown; j.tsfc = s.tsfc; j.abTsfc = s.abTsfc;
  j.lapseM = s.lapseM; j.densExp = s.densExp; j.reverseFrac = s.reverseFrac; j.tvc = s.tvc;
  for (int i = 0; i < 4; i++) j.pos[i] = s.enginePos[i];
  d.prop = PropEngineDef{};  // no propeller
  d.elec = {28.0, 48.0, 28.0, 200.0, 0.0};
  d.limits = {s.vmo * 1.1, s.vmo, s.vmo * 0.85, s.gMax, s.gMin, s.vsCollapse};
  d.gearSys = {s.retractable, s.gearTransit, s.vle, s.cdGear};
  d.spoiler = {s.spoilerCd, s.spoilerClDump, s.spoilerRoll};
  d.fbw = {s.nzMax, s.nzMin, s.rollRateMaxDeg * DEG, s.alphaMaxDeg * DEG, s.bankMaxDeg * DEG};
  d.machDef = {s.mcrit, s.cdWave, s.mmo};
  d.rotateKias = s.rotate;
  d.approachKias = s.approach;
  int to = 0;
  for (int i = 0; i < s.detents; i++)
    if (fabs(s.flapDeg[i] - 10.0) < fabs(s.flapDeg[to] - 10.0)) to = i;
  d.takeoffDetent = s.toDetent > 0 ? s.toDetent : to;
  d.eye = s.eye;
  d.steerMaxRad = s.steerMaxDeg * DEG;
  d.casterMaxRad = s.casterMaxDeg * DEG;
  // ---- contact points (body FRD from CG)
  double mg = s.mtow * G0;
  double compMain = 0.20, compNose = 0.14;
  double kMain = 0.46 * mg / compMain, kNose = 0.08 * mg / compNose;
  double cMain = 2.0 * 0.55 * sqrt(kMain * 0.46 * s.mtow), cNose = 2.0 * 0.55 * sqrt(kNose * 0.08 * s.mtow);
  double z = s.cgHeight;
  int n = 0;
  if (!s.tailwheel) {
    d.gear[n++] = {{s.wheelbase - s.mainAft, 0.0, z}, kNose, cNose, 0.30, 1, 0, 1, 0};
  } else {
    d.gear[n++] = {{-s.wheelbase + s.mainAft, 0.0, z}, kNose, cNose, 0.15, 1, 0, 1, 0};
  }
  d.gear[n++] = {{-s.mainAft, -s.track * 0.5, z}, kMain, cMain, 0.40, 0, 1, 1, 0};
  d.gear[n++] = {{-s.mainAft, s.track * 0.5, z}, kMain, cMain, 0.40, 0, 2, 1, 0};
  double kS = 0.5 * kMain, cS = 0.5 * cMain;
  double tailZ = z - (fabs(s.tailX) - s.mainAft) * tan(s.tailStrikeDeg * DEG);   // strikes at that pitch
  d.gear[n++] = {{s.tailX, 0.0, tailZ}, kS, cS, 0.10, 0, 0, 0, 1};                                  // tail
  double tipZ = z - (s.handling == 1 ? 0.14 : 0.12) * s.b;                                          // wingtip clearance
  d.gear[n++] = {{-0.1 * s.L, -s.b * 0.5, tipZ}, kS, cS, 0.10, 0, 0, 0, 2};
  d.gear[n++] = {{-0.1 * s.L, s.b * 0.5, tipZ}, kS, cS, 0.10, 0, 0, 0, 2};
  if (s.nacelleY > 0) {
    d.gear[n++] = {{s.nacelleX, -s.nacelleY, s.nacelleZ}, kS, cS, 0.10, 0, 0, 0, 5};       // engine pods
    d.gear[n++] = {{s.nacelleX, s.nacelleY, s.nacelleZ}, kS, cS, 0.10, 0, 0, 0, 5};
  }
  d.gear[n++] = {{0.0, 0.0, z - 0.45 * s.cgHeight}, 2.0 * kMain, 2.0 * cMain, 0.20, 0, 0, 0, 4};   // belly
  d.gear[n++] = {{s.wheelbase - s.mainAft + 1.0, 0.0, z - 0.5 * s.cgHeight}, kS, cS, 0.10, 0, 0, 0, 4};  // nose
  d.nGear = n;
  return d;
}

// ---- the fleet ---------------------------------------------------------
// Spec field order: id, cat, law | mtow, oew, fuel | S, b, c, L, sweep |
// CL0, CD0, e, CLmaxClean, CLmaxLand, CDflapFull, cdGear | detents, flaps, vfe, rate |
// engines, thrust, AB, idleN1, idleFrac, spoolUp, spoolDown, tsfc, abTsfc, lapseM, densExp, rev, tvc, pos |
// retractable, wheelbase, track, cgHeight, mainAft, transit, vle, tailwheel |
// tailX, tailStrikeDeg, nacelleY, nacelleZ, nacelleX | vmo, mmo, mcrit, cdWave, gMax, gMin, vsCollapse | rotate, approach |
// nzMax, nzMin, rollRate, alphaMax, bankMax | handling, eye, steer, caster | spoiler cd, clDump, roll

const Spec kSpecs[] = {
    // Meridian 738 — 737-800-class narrowbody twin (conventional controls + yaw damper)
    {"meridian-738", Category::Airliner, ControlLaw::Direct,
     79010, 41413, 20894, 124.6, 35.8, 4.17, 39.5, 25,
     0.22, 0.0205, 0.80, 1.45, 2.65, 0.085, 0.018,
     6, {0, 1, 5, 15, 30, 40}, {0, 250, 250, 200, 175, 162}, 2.0,
     2, 121400, 0, 21, 0.045, 3.2, 2.5, 1.05e-5, 0, -0.45, 0.75, 0.42, 0,
     {{2.5, -4.9, 1.6}, {2.5, 4.9, 1.6}, {}, {}},
     1, 15.6, 5.72, 3.0, 1.3, 10, 270, 0,
     -18.0, 11.0, 4.9, 2.35, 2.5, 340, 0.82, 0.76, 0.06, 2.5, -1.0, 3.7, 145, 145,
     0, 0, 0, 0, 0, 0, {16.3, -0.55, -1.05}, 7, 60, 0.07, 0.50, 0.04, 0},
    // Aurora 320 — A320-class narrowbody twin, fly-by-wire with protections
    {"aurora-320", Category::Airliner, ControlLaw::FlyByWireG,
     78000, 42600, 18730, 122.6, 35.8, 4.19, 37.6, 25,
     0.22, 0.0200, 0.82, 1.45, 2.75, 0.080, 0.018,
     5, {0, 10, 15, 20, 35, 0}, {0, 230, 215, 200, 177, 0}, 2.0,
     2, 120100, 0, 20, 0.045, 3.2, 2.5, 1.0e-5, 0, -0.45, 0.75, 0.42, 0,
     {{2.6, -5.75, 1.5}, {2.6, 5.75, 1.5}, {}, {}},
     1, 12.6, 7.6, 2.9, 1.2, 10, 280, 0,
     -17.0, 11.7, 5.75, 2.3, 2.6, 350, 0.82, 0.77, 0.06, 2.5, -1.0, 3.7, 140, 135,
     2.5, -1.0, 15, 15.0, 67, 0, {14.0, -0.55, -1.1}, 7, 70, 0.07, 0.50, 0.04, 0},
    // Horizon 789 — 787-9-class widebody twin, fly-by-wire
    {"horizon-789", Category::Airliner, ControlLaw::FlyByWireG,
     254011, 128850, 101300, 377.0, 60.1, 7.0, 62.8, 32,
     0.22, 0.0170, 0.85, 1.40, 2.55, 0.075, 0.016,
     6, {0, 1, 5, 15, 20, 30}, {0, 255, 235, 215, 205, 180}, 1.6,
     2, 320300, 0, 21, 0.04, 4.5, 3.0, 0.85e-5, 0, -0.50, 0.75, 0.40, 0,
     {{4.0, -9.4, 2.4}, {4.0, 9.4, 2.4}, {}, {}},
     1, 25.6, 9.8, 4.6, 1.8, 12, 270, 0,
     -30.0, 9.5, 9.4, 3.9, 4.0, 330, 0.90, 0.81, 0.06, 2.5, -1.0, 3.7, 160, 148,
     2.5, -1.0, 15, 14.0, 0, 0, {27.5, -0.6, -1.5}, 7, 70, 0.07, 0.50, 0.04, 3},
    // Titan 77W — 777-300ER-class long-range twin, fly-by-wire
    {"titan-77w", Category::Airliner, ControlLaw::FlyByWireG,
     351534, 167829, 145538, 436.8, 64.8, 7.5, 73.9, 31.6,
     0.22, 0.0175, 0.84, 1.40, 2.55, 0.075, 0.016,
     6, {0, 1, 5, 15, 20, 30}, {0, 255, 235, 215, 205, 180}, 1.6,
     2, 513000, 0, 21, 0.04, 5.0, 3.2, 0.9e-5, 0, -0.50, 0.75, 0.40, 0,
     {{4.5, -9.6, 2.6}, {4.5, 9.6, 2.6}, {}, {}},
     1, 31.2, 10.9, 4.9, 2.0, 14, 270, 0,
     -36.0, 9.5, 9.6, 4.1, 4.5, 330, 0.89, 0.80, 0.06, 2.5, -1.0, 3.7, 170, 150,
     2.5, -1.0, 15, 14.0, 0, 0, {33.0, -0.6, -1.6}, 7, 70, 0.07, 0.50, 0.04, 3},
    // Monarch 744 — 747-400-class four-engine jumbo (conventional controls + yaw damper)
    {"monarch-744", Category::Airliner, ControlLaw::Direct,
     396890, 178756, 173000, 541.2, 64.4, 8.3, 70.6, 37.5,
     0.22, 0.0180, 0.80, 1.40, 2.55, 0.080, 0.018,
     5, {0, 1, 5, 10, 20, 25}, {0, 280, 260, 240, 230, 205}, 1.4,
     4, 282000, 0, 22, 0.04, 5.5, 3.5, 1.0e-5, 0, -0.50, 0.75, 0.40, 0,
     {{6.0, -12.0, 2.3}, {6.0, 12.0, 2.3}, {1.0, -21.0, 1.6}, {1.0, 21.0, 1.6}},
     1, 25.6, 11.0, 5.0, 1.9, 14, 270, 0,
     -35.0, 11.0, 12.0, 4.0, 6.0, 365, 0.92, 0.82, 0.06, 2.5, -1.0, 3.7, 165, 150,
     0, 0, 0, 0, 0, 0, {26.0, -0.6, -2.4}, 7, 70, 0.07, 0.50, 0.04, 0},
    // Zephyr 359 — A350-900-class widebody twin, fly-by-wire with protections
    {"zephyr-359", Category::Airliner, ControlLaw::FlyByWireG,
     283000, 142400, 110523, 442.0, 64.75, 7.0, 66.8, 31.9,
     0.22, 0.0168, 0.86, 1.42, 2.60, 0.075, 0.016,
     5, {0, 10, 15, 20, 35, 0}, {0, 255, 220, 212, 186, 0}, 1.6,
     2, 374000, 0, 21, 0.04, 4.8, 3.0, 0.83e-5, 0, -0.50, 0.75, 0.40, 0,
     {{4.2, -10.0, 2.5}, {4.2, 10.0, 2.5}, {}, {}},
     1, 28.7, 10.6, 4.8, 1.9, 12, 280, 0,
     -32.0, 10.0, 10.0, 4.0, 4.2, 340, 0.89, 0.81, 0.06, 2.5, -1.0, 3.7, 155, 140,
     2.5, -1.0, 15, 14.0, 67, 0, {29.0, -0.6, -1.5}, 7, 70, 0.07, 0.50, 0.04, 0},
    // Colossus 388 — A380-class double-deck four-engine, fly-by-wire with protections
    {"colossus-388", Category::Airliner, ControlLaw::FlyByWireG,
     575000, 277000, 253983, 845.0, 79.75, 11.0, 72.7, 33.5,
     0.22, 0.0170, 0.84, 1.40, 2.45, 0.075, 0.016,
     5, {0, 10, 15, 20, 35, 0}, {0, 263, 222, 220, 182, 0}, 1.4,
     4, 340000, 0, 22, 0.04, 5.5, 3.5, 0.9e-5, 0, -0.50, 0.75, 0.40, 0,
     {{5.0, -15.5, 2.6}, {5.0, 15.5, 2.6}, {0.0, -25.5, 1.9}, {0.0, 25.5, 1.9}},
     1, 33.6, 14.3, 5.6, 2.2, 14, 250, 0,
     -35.0, 11.0, 15.5, 4.4, 5.0, 340, 0.89, 0.81, 0.06, 2.5, -1.0, 3.7, 165, 140,
     2.5, -1.0, 15, 14.0, 67, 0, {34.0, -0.7, -4.4}, 7, 70, 0.07, 0.50, 0.04, 2},
    // Talon 15 — F-15C-class twin-engine air superiority fighter (stability augmented)
    {"talon-15", Category::Fighter, ControlLaw::FlyByWireG,
     30845, 12700, 6100, 56.5, 13.05, 4.86, 19.43, 45,
     0.05, 0.0210, 0.75, 1.60, 1.90, 0.03, 0.020,
     2, {0, 30, 0, 0, 0, 0}, {0, 250, 0, 0, 0, 0}, 15,
     2, 64900, 105700, 65, 0.06, 1.5, 1.2, 2.1e-5, 5.5e-5, 0.15, 0.80, 0, 0,
     {{-7.0, -0.6, 0.1}, {-7.0, 0.6, 0.1}, {}, {}},
     1, 5.42, 2.75, 2.0, 0.7, 5, 250, 0,
     -8.5, 15.0, 0, 0, 0, 800, 2.5, 0.92, 0.035, 9.0, -3.0, 4.5, 125, 150,
     9.0, -3.0, 220, 32, 0, 1, {5.6, 0.0, -1.0}, 10, 45, 0.06, 0.0, 0.0, 0},
    // Specter 22 — F-22-class stealth air superiority fighter (FBW, pitch thrust vectoring)
    {"specter-22", Category::Fighter, ControlLaw::FlyByWireG,
     38000, 19700, 8200, 78.04, 13.56, 6.6, 18.9, 42,
     0.04, 0.0195, 0.75, 1.70, 2.00, 0.03, 0.020,
     2, {0, 20, 0, 0, 0, 0}, {0, 250, 0, 0, 0, 0}, 15,
     2, 116000, 156000, 65, 0.06, 1.4, 1.1, 2.0e-5, 5.0e-5, 0.25, 0.80, 0, 2.8,
     {{-7.5, -0.6, 0.0}, {-7.5, 0.6, 0.0}, {}, {}},
     1, 6.0, 3.3, 2.1, 0.7, 5, 250, 0,
     -8.5, 15.0, 0, 0, 0, 800, 2.25, 0.93, 0.030, 9.0, -3.0, 4.5, 130, 145,
     9.0, -3.0, 240, 60, 0, 1, {5.3, 0.0, -1.0}, 10, 45, 0.06, 0.0, 0.0, 0},
    // Arrow 35 — F-35A-class single-engine stealth multirole fighter (FBW)
    {"arrow-35", Category::Fighter, ControlLaw::FlyByWireG,
     31800, 13290, 8278, 42.7, 10.7, 4.6, 15.7, 35,
     0.05, 0.0230, 0.75, 1.60, 1.95, 0.03, 0.020,
     2, {0, 20, 0, 0, 0, 0}, {0, 250, 0, 0, 0, 0}, 15,
     1, 125000, 191000, 65, 0.06, 1.5, 1.2, 2.2e-5, 5.5e-5, 0.15, 0.80, 0, 0,
     {{-6.0, 0.0, 0.1}, {}, {}, {}},
     1, 5.1, 3.4, 2.0, 0.7, 5, 250, 0,
     -7.0, 15.0, 0, 0, 0, 700, 1.6, 0.92, 0.045, 9.0, -3.0, 4.5, 145, 150,
     9.0, -3.0, 200, 50, 0, 1, {4.2, 0.0, -1.0}, 10, 45, 0.06, 0.0, 0.0, 0},
    // Nightwing 2 — B-2-class flying-wing strategic bomber (FBW, drag rudders)
    {"nightwing-2", Category::Bomber, ControlLaw::FlyByWireG,
     170600, 71700, 75750, 478.0, 52.4, 9.0, 21.0, 33,
     0.14, 0.0110, 0.85, 1.15, 1.25, 0.0, 0.016,
     1, {0, 0, 0, 0, 0, 0}, {0, 0, 0, 0, 0, 0}, 1,
     4, 77000, 0, 22, 0.05, 4.0, 3.0, 1.6e-5, 0, -0.15, 0.75, 0, 0,
     {{-2.0, -5.0, -0.3}, {-2.0, -2.8, -0.3}, {-2.0, 2.8, -0.3}, {-2.0, 5.0, -0.3}},
     1, 11.0, 12.2, 3.6, 1.0, 12, 250, 0,
     -10.0, 12.0, 0, 0, 0, 350, 0.95, 0.82, 0.05, 2.5, -1.0, 3.5, 140, 140,
     2.5, -1.0, 40, 16, 0, 2, {7.5, -0.5, -1.4}, 7, 60, 0.12, 0.30, 0.0, 0},
    // Vega 650 — G650-class long-range business jet (FBW), rear engines, T-tail
    {"vega-650", Category::Bizjet, ControlLaw::FlyByWireG,
     45178, 24494, 20049, 119.2, 30.4, 4.3, 30.4, 33,
     0.20, 0.0185, 0.83, 1.40, 2.40, 0.070, 0.016,
     4, {0, 10, 20, 39, 0, 0}, {0, 250, 220, 180, 0, 0}, 2.5,
     2, 75200, 0, 25, 0.05, 3.0, 2.2, 1.0e-5, 0, -0.40, 0.75, 0.35, 0,
     {{-8.8, -2.4, -1.1}, {-8.8, 2.4, -1.1}, {}, {}},
     1, 13.5, 4.9, 2.4, 1.0, 9, 250, 0,
     -14.0, 13.0, 0, 0, 0, 340, 0.925, 0.85, 0.05, 2.5, -1.0, 3.7, 140, 125,
     2.5, -1.0, 20, 15, 0, 3, {11.3, -0.5, -0.9}, 7, 65, 0.06, 0.45, 0.03, 0},

    // ---- v2.1 fleet extension: ids 14-25 (AC_CJ4 ... AC_EF2000), published type figures
    // Swiftlet 4 — Cessna Citation CJ4: light jet, 2 x FJ44-4A (16.1 kN), no reversers,
    // conventional controls + yaw damper, rear engines, cruciform tail
    {"swiftlet-4", Category::Bizjet, ControlLaw::Direct,
     7761, 4663, 2644, 30.66, 15.49, 2.10, 16.26, 12.5,
     0.20, 0.0220, 0.80, 1.45, 2.10, 0.070, 0.018,
     3, {0, 15, 35, 0, 0, 0}, {0, 200, 161, 0, 0, 0}, 3.0,
     2, 16110, 0, 24, 0.05, 2.8, 2.0, 1.45e-5, 0, -0.40, 0.75, 0, 0,
     {{-4.6, -1.35, -0.55}, {-4.6, 1.35, -0.55}, {}, {}},
     1, 6.5, 4.2, 1.45, 0.6, 7, 250, 0,
     -8.4, 14.0, 0, 0, 0, 305, 0.77, 0.73, 0.05, 3.0, -1.2, 3.7, 110, 105,
     0, 0, 0, 0, 0, 3, {5.6, -0.42, -0.55}, 7, 60, 0.06, 0.40, 0.03, 0},
    // Petrel 300 — Embraer Phenom 300E: light jet, 2 x PW535E1 (15.5 kN), no reversers,
    // conventional controls + yaw damper, rear engines, T-tail, winglets
    {"petrel-300", Category::Bizjet, ControlLaw::Direct,
     8415, 5425, 2428, 28.5, 15.91, 1.95, 15.64, 23,
     0.20, 0.0215, 0.82, 1.45, 2.45, 0.070, 0.018,
     5, {0, 9, 15, 26, 36, 0}, {0, 180, 170, 160, 150, 0}, 3.0,
     2, 15470, 0, 24, 0.05, 2.8, 2.0, 1.45e-5, 0, -0.40, 0.75, 0, 0,
     {{-4.2, -1.4, -0.7}, {-4.2, 1.4, -0.7}, {}, {}},
     1, 6.3, 3.75, 1.4, 0.6, 7, 250, 0,
     -8.0, 13.0, 0, 0, 0, 320, 0.80, 0.75, 0.05, 3.0, -1.2, 3.7, 112, 110,
     0, 0, 0, 0, 0, 3, {5.4, -0.42, -0.55}, 7, 60, 0.06, 0.40, 0.03, 0},
    // Borealis 75 — Bombardier Global 7500: ultra-long-range business jet, 2 x Passport
    // (84.2 kN), fly-by-wire with a control column, leading-edge slats, T-tail
    {"borealis-75", Category::Bizjet, ControlLaw::FlyByWireG,
     52096, 25764, 23360, 110.0, 31.7, 4.0, 33.88, 33,
     0.20, 0.0180, 0.84, 1.45, 2.70, 0.070, 0.016,
     4, {0, 6, 16, 30, 0, 0}, {0, 230, 210, 175, 0, 0}, 2.5,
     2, 84160, 0, 24, 0.05, 3.2, 2.3, 1.15e-5, 0, -0.45, 0.75, 0.35, 0,
     {{-11.0, -2.6, -1.2}, {-11.0, 2.6, -1.2}, {}, {}},
     1, 15.3, 4.3, 2.5, 1.0, 9, 250, 0,
     -17.5, 12.0, 0, 0, 0, 340, 0.925, 0.86, 0.05, 2.5, -1.0, 3.7, 138, 115,
     2.5, -1.0, 20, 15, 0, 3, {13.2, -0.5, -0.95}, 7, 65, 0.06, 0.45, 0.03, 0},
    // Lumen 223 — Airbus A220-300: narrowbody twin, 2 x PW1524G geared turbofans
    // (103.6 kN), fly-by-wire sidestick with protections
    {"lumen-223", Category::Airliner, ControlLaw::FlyByWireG,
     70900, 37081, 17440, 112.3, 35.1, 3.7, 38.7, 26,
     0.22, 0.0200, 0.83, 1.45, 2.65, 0.080, 0.018,
     5, {0, 10, 15, 20, 35, 0}, {0, 230, 210, 190, 165, 0}, 2.0,
     2, 103640, 0, 20, 0.045, 3.2, 2.5, 0.92e-5, 0, -0.48, 0.75, 0.40, 0,
     {{2.3, -5.3, 1.45}, {2.3, 5.3, 1.45}, {}, {}},
     1, 16.3, 6.7, 2.8, 1.2, 10, 250, 0,
     -18.0, 12.0, 5.3, 2.2, 2.3, 330, 0.82, 0.77, 0.06, 2.5, -1.0, 3.7, 140, 130,
     2.5, -1.0, 15, 15.0, 67, 0, {15.6, -0.55, -1.05}, 7, 70, 0.07, 0.50, 0.04, 0},
    // Egret 295 — Embraer E195-E2: regional twin, 2 x PW1900G geared turbofans (102 kN),
    // closed-loop fly-by-wire with control columns
    {"egret-295", Category::Airliner, ControlLaw::FlyByWireG,
     62500, 35700, 13690, 103.0, 35.12, 3.4, 41.5, 26,
     0.22, 0.0205, 0.82, 1.45, 2.60, 0.080, 0.018,
     6, {0, 7, 10, 20, 25, 37}, {0, 230, 215, 200, 180, 165}, 2.0,
     2, 102300, 0, 20, 0.045, 3.2, 2.5, 0.92e-5, 0, -0.48, 0.75, 0.40, 0,
     {{2.0, -5.6, 1.4}, {2.0, 5.6, 1.4}, {}, {}},
     1, 17.5, 6.2, 2.8, 1.2, 10, 250, 0,
     -20.0, 10.5, 5.6, 2.2, 2.0, 320, 0.82, 0.77, 0.06, 2.5, -1.0, 3.7, 145, 130,
     2.5, -1.0, 15, 15.0, 67, 0, {17.6, -0.55, -1.0}, 7, 70, 0.07, 0.50, 0.04, 0},
    // Meridian 8M — Boeing 737 MAX 8: narrowbody twin, 2 x LEAP-1B (130 kN), split-tip
    // winglets, conventional controls + yaw damper
    {"meridian-8m", Category::Airliner, ControlLaw::Direct,
     82191, 45070, 20730, 127.0, 35.92, 4.17, 39.52, 25,
     0.22, 0.0200, 0.82, 1.45, 2.65, 0.085, 0.018,
     6, {0, 1, 5, 15, 30, 40}, {0, 250, 250, 200, 175, 162}, 2.0,
     2, 130410, 0, 21, 0.045, 3.4, 2.6, 0.93e-5, 0, -0.48, 0.75, 0.40, 0,
     {{3.0, -4.9, 1.45}, {3.0, 4.9, 1.45}, {}, {}},
     1, 15.6, 5.72, 3.1, 1.3, 10, 270, 0,
     -18.0, 11.0, 4.9, 2.3, 3.0, 340, 0.82, 0.77, 0.06, 2.5, -1.0, 3.7, 150, 145,
     0, 0, 0, 0, 0, 0, {16.3, -0.55, -1.05}, 7, 60, 0.07, 0.50, 0.04, 0},
    // Aurora 321N — Airbus A321neo: long narrowbody twin, 2 x LEAP-1A / PW1100G (147 kN),
    // fly-by-wire sidestick with protections
    {"aurora-321n", Category::Airliner, ControlLaw::FlyByWireG,
     97000, 50100, 18860, 122.6, 35.8, 4.29, 44.51, 25,
     0.22, 0.0200, 0.83, 1.45, 2.80, 0.085, 0.018,
     5, {0, 10, 15, 20, 35, 0}, {0, 235, 225, 215, 190, 0}, 2.0,
     2, 147000, 0, 20, 0.045, 3.4, 2.6, 0.93e-5, 0, -0.48, 0.75, 0.40, 0,
     {{2.8, -5.75, 1.5}, {2.8, 5.75, 1.5}, {}, {}},
     1, 16.91, 7.59, 2.9, 1.3, 10, 280, 0,
     -21.0, 11.2, 5.75, 2.3, 2.8, 350, 0.82, 0.77, 0.06, 2.5, -1.0, 3.7, 155, 140,
     2.5, -1.0, 15, 15.0, 67, 0, {19.0, -0.55, -1.1}, 7, 70, 0.07, 0.50, 0.04, 2},
    // Vista 763 — Boeing 767-300ER: semi-widebody long-haul twin, 2 x CF6-80C2 / PW4000
    // (276 kN), conventional controls + yaw damper
    {"vista-763", Category::Airliner, ControlLaw::Direct,
     186880, 90011, 73100, 283.3, 47.57, 6.0, 54.94, 31.5,
     0.22, 0.0185, 0.80, 1.40, 2.55, 0.080, 0.018,
     6, {0, 1, 5, 15, 20, 30}, {0, 250, 230, 205, 195, 170}, 1.6,
     2, 276000, 0, 21, 0.04, 4.5, 3.0, 1.0e-5, 0, -0.45, 0.75, 0.40, 0,
     {{4.3, -7.6, 2.2}, {4.3, 7.6, 2.2}, {}, {}},
     1, 22.76, 9.3, 4.2, 1.6, 12, 270, 0,
     -27.0, 10.0, 7.6, 3.6, 4.3, 360, 0.86, 0.79, 0.06, 2.5, -1.0, 3.7, 160, 142,
     0, 0, 0, 0, 0, 0, {23.8, -0.55, -1.3}, 7, 70, 0.07, 0.50, 0.04, 3},
    // Solstice 339 — Airbus A330-900: widebody long-haul twin, 2 x Trent 7000 (324 kN),
    // fly-by-wire sidestick with protections
    {"solstice-339", Category::Airliner, ControlLaw::FlyByWireG,
     251000, 132000, 111270, 465.0, 64.0, 7.3, 63.66, 30,
     0.22, 0.0172, 0.86, 1.42, 2.60, 0.075, 0.016,
     5, {0, 10, 15, 20, 32, 0}, {0, 240, 215, 205, 186, 0}, 1.6,
     2, 324000, 0, 21, 0.04, 4.8, 3.0, 0.85e-5, 0, -0.50, 0.75, 0.40, 0,
     {{4.2, -9.4, 2.3}, {4.2, 9.4, 2.3}, {}, {}},
     1, 25.37, 10.68, 4.6, 1.9, 12, 250, 0,
     -30.0, 10.0, 9.4, 3.9, 4.2, 330, 0.86, 0.80, 0.06, 2.5, -1.0, 3.7, 155, 137,
     2.5, -1.0, 15, 14.0, 67, 0, {28.4, -0.6, -1.5}, 7, 70, 0.07, 0.50, 0.04, 0},
    // Ocelot 16 — Lockheed Martin F-16C Block 50/52: single-engine multirole fighter,
    // F110-GE-129 (76.3 / 131 kN), first production fly-by-wire fighter, sidestick
    {"ocelot-16", Category::Fighter, ControlLaw::FlyByWireG,
     19187, 8570, 3175, 27.87, 9.96, 3.45, 15.06, 40,
     0.04, 0.0200, 0.78, 1.55, 1.75, 0.03, 0.020,
     2, {0, 20, 0, 0, 0, 0}, {0, 250, 0, 0, 0, 0}, 15,
     1, 76300, 131000, 65, 0.06, 1.4, 1.1, 2.15e-5, 5.6e-5, 0.15, 0.80, 0, 0,
     {{-6.0, 0.0, 0.0}, {}, {}, {}},
     1, 4.0, 2.36, 1.7, 0.6, 5, 300, 0,
     -7.0, 15.0, 0, 0, 0, 800, 2.05, 0.92, 0.045, 9.0, -3.0, 4.5, 140, 145,
     9.0, -3.0, 300, 25, 0, 1, {4.0, 0.0, -1.05}, 10, 45, 0.06, 0.0, 0.0, 0},
    // Corvid 18 — Boeing F/A-18E Super Hornet: twin-engine carrier multirole fighter,
    // 2 x F414-GE-400 (62.3 / 97.9 kN), fly-by-wire, 7.5 g, carrier-strength gear
    {"corvid-18", Category::Fighter, ControlLaw::FlyByWireG,
     29937, 14552, 6531, 46.45, 13.62, 3.9, 18.31, 28,
     0.05, 0.0230, 0.75, 1.65, 2.05, 0.04, 0.020,
     3, {0, 30, 40, 0, 0, 0}, {0, 250, 250, 0, 0, 0}, 15,
     2, 62300, 97900, 65, 0.06, 1.5, 1.2, 2.2e-5, 5.6e-5, 0.12, 0.80, 0, 0,
     {{-7.5, -0.55, 0.1}, {-7.5, 0.55, 0.1}, {}, {}},
     1, 5.85, 3.11, 2.0, 0.8, 6, 250, 0,
     -9.0, 15.0, 0, 0, 0, 750, 1.6, 0.90, 0.05, 7.5, -3.0, 7.0, 150, 140,
     7.5, -3.0, 200, 35, 0, 1, {5.6, 0.0, -1.1}, 10, 45, 0.06, 0.0, 0.0, 0},
    // Monsoon 2K — Eurofighter Typhoon: canard-delta twin-engine fighter, 2 x EJ200
    // (60 / 90 kN), unstable airframe with quadruplex fly-by-wire, supercruise
    {"monsoon-2k", Category::Fighter, ControlLaw::FlyByWireG,
     23500, 11000, 4996, 51.2, 10.95, 5.5, 15.96, 53,
     0.02, 0.0195, 0.70, 1.55, 1.65, 0.02, 0.020,
     2, {0, 15, 0, 0, 0, 0}, {0, 250, 0, 0, 0, 0}, 15,
     2, 60000, 90000, 65, 0.06, 1.4, 1.1, 2.15e-5, 5.0e-5, 0.25, 0.80, 0, 0,
     {{-6.8, -0.45, 0.1}, {-6.8, 0.45, 0.1}, {}, {}},
     1, 4.9, 3.4, 1.9, 0.7, 5, 250, 0,
     -7.8, 15.0, 0, 0, 0, 750, 2.0, 0.93, 0.030, 9.0, -3.0, 4.5, 140, 150,
     9.0, -3.0, 250, 30, 0, 1, {4.6, 0.0, -1.1}, 10, 45, 0.06, 0.0, 0.0, 0},
};

AircraftDef gFleet[sizeof(kSpecs) / sizeof(kSpecs[0])];
static_assert(sizeof(kSpecs) / sizeof(kSpecs[0]) == AC_COUNT - 2, "one Spec per fleet id (trainer and Stinger are built separately)");
AircraftDef gExtra;
bool gBuilt = false;

// Stinger 330 — Extra 330-class aerobatic monoplane: piston engine, tailwheel,
// very high roll rate, +-10 g airframe. Built from the trainer's structure.
AircraftDef makeExtra() {
  AircraftDef d = trainerDef();
  d.id = "stinger-330";
  d.category = Category::Aerobatic;
  AeroDef& a = d.aero;
  a.S = 10.7; a.b = 8.0; a.c = 1.4; a.wingHeight = 1.2;
  a.CL0 = 0.0;  // symmetric section
  a.CLa = 4.6; a.alphaStall = 17.0 * DEG; a.CLflapFull = 0.0;
  a.CD0 = 0.028; a.kInduced = 0.085;
  a.Cm0 = 0.0; a.Cma = -0.45; a.Cmq = -9.0; a.Cmadot = -3.0; a.Cmde = -1.25; a.CmTrimMax = 0.06;
  a.CmElevMaxUp = 0.40; a.CmElevMaxDown = 0.40;
  a.Clb = -0.02; a.Clp = -0.40; a.Clda = 0.27;  // huge ailerons (~400 deg/s)
  a.Cnb = 0.06; a.Cnr = -0.10; a.Cndr = 0.080; a.Cnda = -0.006;
  a.deUp = 30 * DEG; a.deDown = 30 * DEG; a.daMax = 30 * DEG; a.drMax = 30 * DEG;
  a.tailSlipstream = 0.35;
  d.flaps = {1, {0, 0, 0, 0, 0, 0}, 0.0, 1.0, {0, 0, 0, 0, 0, 0}, true, 0.0};
  d.mass = {650.0, 950.0, 1100.0, 1250.0, 0.0, 820.0, 950.0};
  d.fuel = {2, {33.0, 33.0}, {-0.8, 0.8}, 0.72};
  PropEngineDef& p = d.prop;
  p.pMaxW = 235000.0; p.rpmRated = 2700.0; p.frictionW = 22000.0; p.pumpW = 90000.0;
  p.propD = 1.9; p.inertia = 2.2;
  p.ct0 = 0.150; p.ct1 = -0.035; p.ct2 = -0.075;  // constant-speed prop approximated
  p.cp0 = 0.080; p.cp1 = 0.010; p.cp2 = -0.045;
  d.limits = {220.0, 180.0, 158.0, 10.0, -10.0, 3.6};
  d.nGear = 7;
  d.gear[0] = {{-4.6, 0.0, 0.95}, 12000.0, 1200.0, 0.10, 1, 0, 1, 0};   // tail wheel (steerable)
  d.gear[1] = {{0.45, -0.9, 1.15}, 30000.0, 3500.0, 0.15, 0, 1, 1, 0};
  d.gear[2] = {{0.45, 0.9, 1.15}, 30000.0, 3500.0, 0.15, 0, 2, 1, 0};
  d.gear[3] = {{1.75, 0.0, 0.90}, 50000.0, 5000.0, 0.05, 0, 0, 0, 3};    // prop tip
  d.gear[4] = {{-0.1, -4.0, 0.2}, 40000.0, 4000.0, 0.05, 0, 0, 0, 2};
  d.gear[5] = {{-0.1, 4.0, 0.2}, 40000.0, 4000.0, 0.05, 0, 0, 0, 2};
  d.gear[6] = {{0.1, 0.0, 0.6}, 80000.0, 8000.0, 0.10, 0, 0, 0, 4};
  d.eye = {-0.6, 0.0, -0.75};
  d.steerMaxRad = 25 * DEG;
  d.casterMaxRad = 45 * DEG;
  d.rotateKias = 60;
  d.approachKias = 80;
  d.machDef = {0.6, 0.0, 0.4};
  return d;
}

void build() {
  if (gBuilt) return;
  for (unsigned i = 0; i < sizeof(kSpecs) / sizeof(kSpecs[0]); i++) gFleet[i] = make(kSpecs[i]);
  gExtra = makeExtra();
  gBuilt = true;
}

}  // namespace

const AircraftDef& aircraftDef(int id) {
  build();
  if (id <= AC_TRAINER || id >= AC_COUNT) return trainerDef();
  if (id == AC_EXTRA) return gExtra;
  // kSpecs: ids 1..12 then (after the aerobatic Stinger, id 13) ids 14..
  return gFleet[id < AC_EXTRA ? id - 1 : id - 2];
}

}  // namespace osk
