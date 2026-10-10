// GLOBAL SKIES core — shared layout of the input / output blocks exchanged with
// the JS host. tools/gen_layout.mjs parses these enums and writes
// web/js/core/layout.js, so the two sides never drift apart.
#pragma once

// Pilot / switch inputs written by the host before each advance().
enum OskIn {
  IN_PITCH = 0,        // -1..1, +1 = pull (nose up)
  IN_ROLL,             // -1..1, +1 = right
  IN_YAW,              // -1..1, +1 = right pedal
  IN_THROTTLE,         // 0..1
  IN_MIXTURE,          // 0 (idle cut-off) .. 1 (full rich)
  IN_BRAKE_L,          // 0..1
  IN_BRAKE_R,          // 0..1
  IN_PARK_BRAKE,       // 0/1
  IN_FLAPS_LEVER,      // detent index
  IN_TRIM_RATE,        // -1..1 (nose down .. nose up)
  IN_MAGNETOS,         // 0 OFF, 1 R, 2 L, 3 BOTH, 4 START
  IN_BATTERY,          // 0/1
  IN_ALTERNATOR,       // 0/1
  IN_AVIONICS,         // 0/1
  IN_FUEL_PUMP,        // 0/1
  IN_FUEL_SELECTOR,    // 0 OFF, 1 LEFT, 2 BOTH, 3 RIGHT
  IN_FUEL_SHUTOFF,     // 1 = valve open
  IN_BEACON,
  IN_NAV_LIGHTS,
  IN_STROBE,
  IN_TAXI_LIGHT,
  IN_LANDING_LIGHT,
  IN_PITOT_HEAT,
  IN_AP_MASTER,        // 0/1
  IN_AP_LAT_MODE,      // 0 ROL, 1 HDG, 2 NAV
  IN_AP_VERT_MODE,     // 0 VS, 1 ALT
  IN_AP_HDG,           // heading bug, rad (magnetic)
  IN_AP_ALT,           // target indicated altitude, m
  IN_AP_VS,            // target vertical speed, m/s
  IN_NAV_TRACK,        // desired track, rad true (host GPS)
  IN_NAV_XTE,          // cross-track error, m (+ = right of course)
  IN_NAV_VALID,        // 0/1
  IN_BARO,             // altimeter setting, Pa
  IN_MAG_VAR,          // magnetic variation, rad (east positive)
  IN_ASSISTS,          // bitmask, see OskAssist
  IN_GEAR_LEVER,       // 1 down, 0 up (retractable gear)
  IN_SPEEDBRAKE,       // 0..1 speed brake / spoiler lever
  IN_SPOILER_ARM,      // 0/1 ground spoilers armed (deploy at touchdown)
  IN_REVERSE,          // 0/1 thrust reversers (on the ground)
  IN_AT_ENGAGED,       // 0/1 autothrottle
  IN_AT_SPEED,         // autothrottle target indicated airspeed, m/s
  IN_FIRE_HANDLES,     // bitmask of pulled engine fire handles (cut fuel, discharge bottle)
  IN_COUNT
};

enum OskAssist {
  AS_AUTO_RUDDER = 1,
  AS_STALL_PROTECT = 2,
  AS_ATTITUDE_HOLD = 4,
  AS_AUTO_MIXTURE = 8,
  AS_PERFECT_GYROS = 16,
  AS_EASY_START = 32,
  AS_CRASH_TOLERANT = 64,
  AS_TAXI_ASSIST = 128,
};

enum OskOut {
  // State, ENU world frame (x east, y north, z up = MSL), SI units
  OUT_X = 0, OUT_Y, OUT_Z,
  OUT_VE, OUT_VN, OUT_VU,
  OUT_PHI, OUT_THETA, OUT_PSI,          // roll, pitch, true heading (rad)
  OUT_P, OUT_Q, OUT_R,                  // body rates rad/s
  OUT_ALPHA, OUT_BETA,
  OUT_IAS, OUT_TAS, OUT_GS, OUT_MACH,   // m/s
  OUT_ALT_MSL, OUT_AGL, OUT_VS,         // m, m (lowest wheel), m/s
  OUT_NX, OUT_NY, OUT_NZ,               // body load factors (g)
  // Instruments as displayed (lags, failures, gyro errors applied)
  OUT_IND_IAS, OUT_IND_ALT, OUT_IND_VS,
  OUT_AI_PITCH, OUT_AI_ROLL, OUT_HI_HDG, OUT_COMPASS,
  OUT_TURN_RATE, OUT_SLIP_BALL,
  // Powerplant
  OUT_RPM, OUT_MAP, OUT_FUEL_FLOW, OUT_EGT, OUT_OIL_T, OUT_OIL_P,
  OUT_ENGINE_RUNNING, OUT_STARTER, OUT_THRUST, OUT_POWER, OUT_VACUUM,
  OUT_PROP_ANGLE,
  // Fuel / electrical
  OUT_FUEL_L, OUT_FUEL_R, OUT_BUS_V, OUT_BATT_A, OUT_BATT_SOC, OUT_AVIONICS_POWERED,
  OUT_GYRO_SPIN,
  // Controls actual
  OUT_FLAPS_DEG, OUT_TRIM, OUT_ELEV, OUT_AIL, OUT_RUD, OUT_STEER,
  OUT_BRAKE_L, OUT_BRAKE_R, OUT_MIXTURE,
  // Ground contact
  OUT_ON_GROUND, OUT_GEAR0, OUT_GEAR1, OUT_GEAR2, OUT_WHEEL_SPEED, OUT_SKID, OUT_SCRAPE,
  // Warnings & events
  OUT_STALL_WARN, OUT_STALLED, OUT_OVERSPEED, OUT_CRASHED, OUT_CRASH_REASON,
  OUT_TD_COUNT, OUT_TD_VS, OUT_TD_NZ, OUT_TD_X, OUT_TD_Y, OUT_TD_BANK, OUT_TD_PITCH,
  OUT_TD_IAS, OUT_TD_CRAB, OUT_TD_HDG,
  OUT_EVENTS,
  OUT_AP_ENGAGED, OUT_AP_LAT, OUT_AP_VERT, OUT_AP_VS_TARGET, OUT_AP_DISC_COUNT,
  OUT_MASS, OUT_SIM_TIME,
  OUT_WIND_E, OUT_WIND_N, OUT_WIND_U,
  OUT_PRIME, OUT_LOW_VOLTS, OUT_LOW_FUEL_L, OUT_LOW_FUEL_R, OUT_OIL_WARN,
  // Jets & systems
  OUT_AIRCRAFT,                                   // aircraft id
  OUT_N1_0, OUT_N1_1, OUT_N1_2, OUT_N1_3,         // % per engine
  OUT_N2_AVG, OUT_ENG_MASK, OUT_FIRE_MASK,        // running engines / engine fires (bit per engine)
  OUT_GEAR_POS, OUT_SPEEDBRAKE, OUT_REVERSER, OUT_AFTERBURNER, OUT_AT_THR, OUT_FBW,
  // Damage (0 intact .. 1 destroyed)
  OUT_DMG_WING_L, OUT_DMG_WING_R, OUT_DMG_TAIL, OUT_DMG_FUS,
  OUT_DMG_ENG_0, OUT_DMG_ENG_1, OUT_DMG_ENG_2, OUT_DMG_ENG_3,
  OUT_PARTS_LOST,                                 // bits: 1 L wing, 2 R wing, 4 tail, 8/16/32 gear legs
  OUT_HYD, OUT_FUEL_LEAK, OUT_ELEC_FAIL,
  OUT_COUNT
};

enum OskEvent {
  EV_TAIL_STRIKE = 1,
  EV_PROP_STRIKE = 2,
  EV_WINGTIP_STRIKE = 4,
  EV_FLAP_OVERSPEED = 8,
  EV_VNE = 16,
  EV_G_LIMIT = 32,
  EV_STALL = 64,
  EV_HARD_LANDING = 128,
  EV_ENGINE_FAIL = 256,
  EV_FUEL_STARVATION = 512,
  EV_LOW_VOLTAGE = 1024,
  EV_AP_DISCONNECT = 2048,
  EV_BOUNCE = 4096,
  EV_DAMAGE = 8192,          // structural damage taken this frame
  EV_ENGINE_FIRE = 16384,
  EV_PART_LOST = 32768,      // a wing section, the tail or a gear leg separated
  EV_GEAR_WARN = 65536,      // landing configuration with the gear up
};

enum OskCrash {
  CR_NONE = 0,
  CR_GEAR_COLLAPSE = 1,
  CR_TERRAIN = 2,
  CR_WING_STRIKE = 3,
  CR_WATER = 4,
  CR_OBSTACLE = 5,
  CR_OVERSTRESS = 6,
  CR_BREAKUP = 7,            // fuselage destroyed (impact, fire)
};

enum OskFailure {
  FAIL_ENGINE = 0,
  FAIL_ENGINE_ROUGH,
  FAIL_VACUUM,
  FAIL_ALTERNATOR,
  FAIL_PITOT,
  FAIL_FLAPS,
  FAIL_FUEL_LEAK_L,
  FAIL_COUNT
};

// Parts that the host can damage (building / obstacle collisions).
enum OskPart { PART_WING_L = 0, PART_WING_R, PART_TAIL, PART_FUSELAGE, PART_ENGINE_0, PART_ENGINE_1, PART_ENGINE_2, PART_ENGINE_3 };

enum OskSurface { SURF_NONE = 0, SURF_ASPHALT = 1, SURF_GRASS = 2, SURF_WATER = 3, SURF_CONCRETE = 4 };
