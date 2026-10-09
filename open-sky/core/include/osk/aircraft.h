// OPEN SKY core — data-driven aircraft definition.
// Each aircraft supplies its own aerodynamics, mass, gear, powerplant and
// systems parameters; the flight model never swaps only the visual model.
#pragma once
#include "math.h"

namespace osk {

enum class EngineType : int { PistonProp = 0, Turbofan = 1 };
enum class ControlLaw : int { Direct = 0, FlyByWireG = 1 };

struct AeroDef {
  double S, b, c;                       // wing area m^2, span m, MAC m
  double wingHeight;                    // wing MAC height above ground at rest, m (ground effect)
  // Lift
  double CL0, CLa, CLq, CLadot, CLde;
  double alphaStall;                    // rad, clean stall onset (blend centre)
  double stallSharpness;                // sigmoid sharpness (1/rad)
  double CLflapFull;                    // CL increment at full flaps
  double alphaStallFlapDelta;           // rad, stall angle reduction at full flaps
  double CLpostScale;                   // flat-plate lift scale after stall
  // Drag
  double CD0, kInduced, CDflapFull, CDgearDown, CDpostScale;
  // Pitch
  double Cm0, Cma, Cmq, Cmadot, Cmde, CmTrimMax, CmFlapFull, CmStallBreak;
  double CmElevMaxUp, CmElevMaxDown;    // horizontal-tail stall limits of the control moment
  // Lateral-directional
  double CYb, CYp, CYr, CYdr;
  double Clb, Clp, Clr, ClrPerCL, Clda, Cldr;
  double Cnb, Cnp, CnpPerCL, Cnr, Cnda, Cndr;
  // Control throws (rad)
  double deUp, deDown, daMax, drMax;
  double tailSlipstream;                // fraction of prop slipstream dyn. pressure on tail
  double stallWarnMargin;               // rad below stall angle when warning sounds
};

struct FlapDef {
  int detents;                          // number of positions (incl. 0)
  double angleDeg[6];                   // angle per detent
  double maxDeg;
  double rateDegPerSec;
  double vfeKias[6];                    // max speed per detent (0 = n/a)
  bool electric;
};

struct GearPointDef {
  Vec3 pos;           // uncompressed contact point, body FRD relative to CG, m
  double k, c;        // spring N/m, damper N s/m
  double travel;      // max compression m
  int steer;          // 1 = steerable nose/tail wheel
  int brake;          // 0 none, 1 left, 2 right
  int isWheel;        // 0 = structural contact point (scrape / crash)
  int tag;            // structural tag: 0 wheel, 1 tail, 2 wingtip, 3 prop, 4 belly/nose
};

struct PropEngineDef {
  double pMaxW;          // rated brake power, W
  double rpmRated;       // rpm at rated power
  double rpmIdle;        // ground idle rpm target
  double frictionW;      // friction power at rated rpm, W
  double pumpW;          // pumping-loss power per unit (p_amb - MAP)/p0 at rated rpm, W
  double propD;          // prop diameter, m
  double inertia;        // engine + prop polar inertia, kg m^2
  double ct0, ct1, ct2;  // Ct(J) = ct0 + ct1 J + ct2 J^2
  double cp0, cp1, cp2;  // Cp(J)
  double thrustLineZ;    // m (body z of thrust line)
  double pFactor;        // m, effective thrust offset per rad of alpha (yaw)
  double swirl;          // m, slipstream swirl yaw arm
  double bsfc;           // kg/(W s) brake specific fuel consumption
  double starterW;       // starter motor power, W
};

struct FuelDef {
  int tanks;
  double capacityKg[2];
  double tankY[2];        // lateral arm of each tank, m
  double densityKgL;
};

struct MassDef {
  double emptyKg;
  double Ixx, Iyy, Izz, Ixz;  // at reference mass
  double refMassKg;
  double mtowKg;
};

struct LimitsDef {
  double vneKias, vnoKias, vaKias;
  double gMax, gMin;
  double vsGearCollapse;   // m/s vertical speed at which gear fails
};

struct ElectricalDef {
  double battVolts, battAh, altVolts, altAmps, altMinRpm;
};

struct AircraftDef {
  const char* id;
  EngineType engineType;
  ControlLaw law;
  AeroDef aero;
  FlapDef flaps;
  MassDef mass;
  FuelDef fuel;
  PropEngineDef prop;
  ElectricalDef elec;
  LimitsDef limits;
  int nGear;
  GearPointDef gear[12];
  Vec3 eye;                 // pilot eye point, body FRD, m
  double steerMaxRad;       // nose wheel steering via pedals
  double casterMaxRad;      // with differential braking
};

// Built-in aircraft catalogue.
enum AircraftId : int { AC_TRAINER = 0, AC_COUNT = 1 };
const AircraftDef& aircraftDef(int id);

}  // namespace osk
