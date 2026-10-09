// OPEN SKY — "Skylark T1": original four-seat high-wing piston trainer.
// Geometry, mass and powerplant are in the class of a 180 hp four-seat
// trainer (C172S-class). Coefficients are textbook-typical values for this
// class, tuned by tests/test_main.cpp against published C172S-class
// performance figures (see docs/FLIGHT_MODEL.md for the reference table and
// the measured deviations). It is not a certified or exact replica.
#include "osk/aircraft.h"

namespace osk {

static const AircraftDef kTrainer = {
    "skylark-t1",
    EngineType::PistonProp,
    ControlLaw::Direct,
    // ---- Aerodynamics -------------------------------------------------
    {
        /*S*/ 16.17, /*b*/ 11.0, /*c*/ 1.49,
        /*wingHeight*/ 2.3,
        /*CL0*/ 0.30, /*CLa*/ 5.0, /*CLq*/ 3.9, /*CLadot*/ 1.7, /*CLde*/ 0.35,
        /*alphaStall*/ 18.0 * DEG, /*stallSharpness*/ 32.0,
        /*CLflapFull*/ 0.78, /*alphaStallFlapDelta*/ 2.0 * DEG,
        /*CLpostScale*/ 1.05,
        /*CD0*/ 0.0335, /*kInduced*/ 0.057, /*CDflapFull*/ 0.052, /*CDgearDown*/ 0.0,
        /*CDpostScale*/ 1.25,
        /*Cm0*/ 0.06, /*Cma*/ -0.90, /*Cmq*/ -12.4, /*Cmadot*/ -5.2, /*Cmde*/ -1.10,
        /*CmTrimMax*/ 0.085, /*CmFlapFull*/ 0.015, /*CmStallBreak*/ -0.30,
        /*CmElevMaxUp*/ 0.26, /*CmElevMaxDown*/ 0.40,
        /*CYb*/ -0.31, /*CYp*/ -0.037, /*CYr*/ 0.21, /*CYdr*/ -0.187,
        /*Clb*/ -0.089, /*Clp*/ -0.47, /*Clr*/ 0.030, /*ClrPerCL*/ 0.25, /*Clda*/ 0.13, /*Cldr*/ -0.0147,
        /*Cnb*/ 0.065, /*Cnp*/ -0.01, /*CnpPerCL*/ -0.07, /*Cnr*/ -0.099, /*Cnda*/ -0.012, /*Cndr*/ 0.0645,
        /*deUp*/ 28.0 * DEG, /*deDown*/ 23.0 * DEG, /*daMax*/ 17.5 * DEG, /*drMax*/ 16.0 * DEG,
        /*tailSlipstream*/ 0.28,
        /*stallWarnMargin*/ 3.0 * DEG,
    },
    // ---- Flaps (electric, 0/10/20/30) ----------------------------------
    {4, {0, 10, 20, 30, 0, 0}, 30.0, 3.4, {0, 110, 85, 85, 0, 0}, true},
    // ---- Mass -----------------------------------------------------------
    {/*empty*/ 767.0, /*Ixx*/ 1285.0, /*Iyy*/ 1825.0, /*Izz*/ 2667.0, /*Ixz*/ 0.0,
     /*ref*/ 1043.0, /*mtow*/ 1157.0},
    // ---- Fuel: two wing tanks, 100 L usable each (avgas) ----------------
    {2, {72.0, 72.0}, {-1.6, 1.6}, 0.72},
    // ---- Powerplant: 180 hp four-cylinder, fixed-pitch 76 in prop -------
    {
        /*pMaxW*/ 134200.0, /*rpmRated*/ 2700.0, /*rpmIdle*/ 650.0, /*frictionW*/ 14500.0,
        /*pumpW*/ 64000.0,
        /*propD*/ 1.93, /*inertia*/ 1.9,
        /*ct*/ 0.112, -0.040, -0.0706,
        /*cp*/ 0.0620, 0.010, -0.0484,
        /*thrustLineZ*/ -0.05, /*pFactor*/ 0.35, /*swirl*/ 0.07,
        /*bsfc (0.45 lb/hp/h)*/ 7.6e-8, /*starterW*/ 2600.0,
    },
    // ---- Electrical: 24 V battery, 28 V 60 A alternator ------------------
    {24.0, 35.0, 28.5, 60.0, 900.0},
    // ---- Limits ----------------------------------------------------------
    {/*Vne*/ 163.0, /*Vno*/ 129.0, /*Va*/ 105.0, /*gMax*/ 3.8, /*gMin*/ -1.52,
     /*vsGearCollapse*/ 3.6},
    // ---- Contact points ---------------------------------------------------
    8,
    {
        {{1.35, 0.0, 1.05}, 30000.0, 2900.0, 0.18, 1, 0, 1, 0},     // nose wheel
        {{-0.30, -1.27, 1.05}, 57000.0, 6000.0, 0.20, 0, 1, 1, 0},  // left main
        {{-0.30, 1.27, 1.05}, 57000.0, 6000.0, 0.20, 0, 2, 1, 0},   // right main
        {{-4.60, 0.0, 0.05}, 90000.0, 9000.0, 0.05, 0, 0, 0, 1},    // tail
        {{-0.10, -5.50, -0.95}, 60000.0, 6000.0, 0.05, 0, 0, 0, 2}, // left wingtip
        {{-0.10, 5.50, -0.95}, 60000.0, 6000.0, 0.05, 0, 0, 0, 2},  // right wingtip
        {{1.95, 0.0, 0.75}, 60000.0, 6000.0, 0.05, 0, 0, 0, 3},     // propeller tip (lowest)
        {{0.20, 0.0, 0.55}, 120000.0, 12000.0, 0.10, 0, 0, 0, 4},   // belly
    },
    /*eye*/ {0.22, -0.28, -0.62},
    /*steerMax*/ 10.0 * DEG,
    /*casterMax*/ 30.0 * DEG,
};

const AircraftDef& aircraftDef(int id) {
  (void)id;
  return kTrainer;
}

}  // namespace osk
