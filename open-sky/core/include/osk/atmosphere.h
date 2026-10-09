// OPEN SKY core — International Standard Atmosphere with weather offsets,
// plus the wind field (profile, gusts, turbulence).
#pragma once
#include "math.h"

namespace osk {

constexpr double R_AIR = 287.053;     // J/(kg K)
constexpr double GAMMA = 1.4;
constexpr double T0_ISA = 288.15;     // K
constexpr double P0_ISA = 101325.0;   // Pa
constexpr double RHO0_ISA = 1.225;    // kg/m^3
constexpr double LAPSE = 0.0065;      // K/m (troposphere)

struct AirData {
  double T;    // static temperature, K
  double p;    // static pressure, Pa
  double rho;  // density, kg/m^3
  double a;    // speed of sound, m/s
};

// Weather-adjusted atmosphere: sea level pressure (QNH, Pa) and ISA deviation (K).
struct Atmosphere {
  double qnh = P0_ISA;
  double dT = 0.0;

  AirData at(double h) const {
    AirData d;
    double T0 = T0_ISA + dT;
    if (h < 11000.0) {
      d.T = T0 - LAPSE * h;
      d.p = qnh * pow(d.T / T0, G0 / (R_AIR * LAPSE));
    } else {
      double T11 = T0 - LAPSE * 11000.0;
      double p11 = qnh * pow(T11 / T0, G0 / (R_AIR * LAPSE));
      d.T = T11;
      d.p = p11 * exp(-G0 * (h - 11000.0) / (R_AIR * T11));
    }
    d.rho = d.p / (R_AIR * d.T);
    d.a = sqrt(GAMMA * R_AIR * d.T);
    return d;
  }
};

// Altitude an altimeter shows for static pressure p with Kollsman setting pset (Pa).
inline double indicatedAltitude(double p, double pset) {
  return (T0_ISA / LAPSE) * (1.0 - pow(p / pset, R_AIR * LAPSE / G0));
}

// Wind field: steady wind with boundary-layer profile, discrete gusts and
// first-order (Dryden-like) turbulence. Directions are "from", radians true.
struct WindField {
  double dirFrom = 0.0;      // rad, true
  double speed10 = 0.0;      // m/s at 10 m AGL (METAR reference)
  double gust = 0.0;         // m/s, peak gust increment above mean (METAR G - mean)
  double turbulence = 0.0;   // 0 none .. 1 light .. 2 moderate .. 3 severe
  double shearExp = 0.13;    // power-law exponent
  // dynamic state
  Vec3 turbNed{0, 0, 0};
  double gustCur = 0, gustTarget = 0, gustTimer = 0;
  Rng rng;

  // Mean wind vector (NED, m/s, the direction the air moves) at height AGL.
  Vec3 mean(double agl) const {
    double h = clamp(agl, 1.0, 600.0);
    double s = speed10 * pow(h / 10.0, shearExp);
    return {-s * cos(dirFrom), -s * sin(dirFrom), 0.0};
  }

  // Advance gust/turbulence state. airspeed sets the turbulence time scale.
  void update(double dt, double agl, double airspeed) {
    // Discrete gusts: new target every few seconds, smoothed transition.
    gustTimer -= dt;
    if (gustTimer <= 0) {
      gustTimer = 2.5 + 5.0 * rng.uniform();
      gustTarget = gust > 0 ? gust * rng.uniform() * rng.uniform() * 1.6 : 0.0;
      if (gustTarget > gust) gustTarget = gust;
    }
    gustCur = approach(gustCur, gustTarget, 1.2, dt);

    // Turbulence intensity: user setting plus mechanical turbulence near ground.
    double mech = speed10 > 7.0 ? (speed10 - 7.0) * 0.08 * smoothstep(400.0, 20.0, agl) : 0.0;
    double sigma = 0.0;
    if (turbulence > 0) sigma = turbulence <= 1 ? 0.9 * turbulence : (turbulence <= 2 ? 0.9 + 1.4 * (turbulence - 1) : 2.3 + 2.4 * (turbulence - 2));
    sigma += mech;
    if (sigma <= 0) { turbNed = {0, 0, 0}; return; }
    double L = agl < 300 ? maxf(agl, 30.0) * 1.5 : 530.0;  // length scale, m
    double V = maxf(airspeed, 15.0);
    double tau = L / V;
    double k = sqrt(2.0 * dt / tau);
    turbNed.x += (-turbNed.x * dt / tau) + sigma * k * rng.normal();
    turbNed.y += (-turbNed.y * dt / tau) + sigma * k * rng.normal();
    double sw = sigma * (agl < 300 ? 0.5 + 0.5 * agl / 300.0 : 1.0);
    turbNed.z += (-turbNed.z * dt / tau) + sw * 0.8 * k * rng.normal();
  }

  Vec3 total(double agl) const {
    Vec3 m = mean(agl);
    double s = length(m);
    Vec3 dir = s > 0.01 ? m / s : Vec3{0, 0, 0};
    return m + dir * gustCur + turbNed;
  }
};

}  // namespace osk
