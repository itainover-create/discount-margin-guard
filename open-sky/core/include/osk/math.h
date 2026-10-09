// OPEN SKY core — freestanding math layer.
// Builds both natively (tests, uses <cmath>) and for wasm32 without a libc,
// where transcendental functions are imported from the JS host (Math.*).
#pragma once

#if defined(__wasm__)
#define OSK_IMPORT(name) __attribute__((import_module("env"), import_name(#name)))
#define OSK_EXPORT(name) extern "C" __attribute__((export_name(#name)))
extern "C" {
OSK_IMPORT(sin) double osk_js_sin(double);
OSK_IMPORT(cos) double osk_js_cos(double);
OSK_IMPORT(tan) double osk_js_tan(double);
OSK_IMPORT(asin) double osk_js_asin(double);
OSK_IMPORT(acos) double osk_js_acos(double);
OSK_IMPORT(atan2) double osk_js_atan2(double, double);
OSK_IMPORT(exp) double osk_js_exp(double);
OSK_IMPORT(log) double osk_js_log(double);
OSK_IMPORT(pow) double osk_js_pow(double, double);
}
namespace osk {
inline double sin(double x) { return osk_js_sin(x); }
inline double cos(double x) { return osk_js_cos(x); }
inline double tan(double x) { return osk_js_tan(x); }
inline double asin(double x) { return osk_js_asin(x); }
inline double acos(double x) { return osk_js_acos(x); }
inline double atan2(double y, double x) { return osk_js_atan2(y, x); }
inline double exp(double x) { return osk_js_exp(x); }
inline double log(double x) { return osk_js_log(x); }
inline double pow(double x, double y) { return osk_js_pow(x, y); }
inline double sqrt(double x) { return __builtin_sqrt(x); }
inline double fabs(double x) { return __builtin_fabs(x); }
inline double floor(double x) { return __builtin_floor(x); }
}  // namespace osk
#else
#include <cmath>
#define OSK_EXPORT(name) extern "C"
namespace osk {
inline double sin(double x) { return std::sin(x); }
inline double cos(double x) { return std::cos(x); }
inline double tan(double x) { return std::tan(x); }
inline double asin(double x) { return std::asin(x); }
inline double acos(double x) { return std::acos(x); }
inline double atan2(double y, double x) { return std::atan2(y, x); }
inline double exp(double x) { return std::exp(x); }
inline double log(double x) { return std::log(x); }
inline double pow(double x, double y) { return std::pow(x, y); }
inline double sqrt(double x) { return std::sqrt(x); }
inline double fabs(double x) { return std::fabs(x); }
inline double floor(double x) { return std::floor(x); }
}  // namespace osk
#endif

namespace osk {

constexpr double PI = 3.14159265358979323846;
constexpr double DEG = PI / 180.0;
constexpr double RAD = 180.0 / PI;
constexpr double G0 = 9.80665;
constexpr double KT = 0.514444;    // m/s per knot
constexpr double FT = 0.3048;      // m per foot
constexpr double FPM = 0.00508;    // m/s per ft/min

inline double clamp(double v, double lo, double hi) { return v < lo ? lo : (v > hi ? hi : v); }
inline double minf(double a, double b) { return a < b ? a : b; }
inline double maxf(double a, double b) { return a > b ? a : b; }
inline double lerp(double a, double b, double t) { return a + (b - a) * t; }
inline double sq(double x) { return x * x; }
inline double sign(double x) { return x > 0 ? 1.0 : (x < 0 ? -1.0 : 0.0); }
inline double smoothstep(double e0, double e1, double x) {
  double t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
// Wrap angle to (-pi, pi]
inline double wrapPi(double a) {
  a = a - 2.0 * PI * floor((a + PI) / (2.0 * PI));
  return a;
}
// Wrap angle to [0, 2pi)
inline double wrap2Pi(double a) { return a - 2.0 * PI * floor(a / (2.0 * PI)); }
// First-order low-pass step toward target with time constant tau.
inline double approach(double cur, double target, double tau, double dt) {
  if (tau <= 0) return target;
  double k = dt / (tau + dt);
  return cur + (target - cur) * k;
}
// Move cur toward target at most rate*dt.
inline double slew(double cur, double target, double rate, double dt) {
  double d = target - cur, m = rate * dt;
  if (d > m) return cur + m;
  if (d < -m) return cur - m;
  return target;
}

struct Vec3 {
  double x = 0, y = 0, z = 0;
  Vec3() = default;
  constexpr Vec3(double X, double Y, double Z) : x(X), y(Y), z(Z) {}
  Vec3 operator+(const Vec3& o) const { return {x + o.x, y + o.y, z + o.z}; }
  Vec3 operator-(const Vec3& o) const { return {x - o.x, y - o.y, z - o.z}; }
  Vec3 operator*(double s) const { return {x * s, y * s, z * s}; }
  Vec3 operator/(double s) const { return {x / s, y / s, z / s}; }
  Vec3 operator-() const { return {-x, -y, -z}; }
  Vec3& operator+=(const Vec3& o) { x += o.x; y += o.y; z += o.z; return *this; }
  Vec3& operator-=(const Vec3& o) { x -= o.x; y -= o.y; z -= o.z; return *this; }
  Vec3& operator*=(double s) { x *= s; y *= s; z *= s; return *this; }
};
inline double dot(const Vec3& a, const Vec3& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline Vec3 cross(const Vec3& a, const Vec3& b) {
  return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}
inline double length(const Vec3& a) { return sqrt(dot(a, a)); }
inline Vec3 normalize(const Vec3& a) {
  double l = length(a);
  return l > 1e-12 ? a / l : Vec3{0, 0, 0};
}
inline Vec3 mul(const Vec3& a, const Vec3& b) { return {a.x * b.x, a.y * b.y, a.z * b.z}; }

// Unit quaternion representing rotation body -> world (w, x, y, z).
struct Quat {
  double w = 1, x = 0, y = 0, z = 0;
  Quat() = default;
  constexpr Quat(double W, double X, double Y, double Z) : w(W), x(X), y(Y), z(Z) {}
};
inline Quat qmul(const Quat& a, const Quat& b) {
  return {a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
          a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
          a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
          a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w};
}
inline Quat qnormalize(const Quat& q) {
  double n = sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
  if (n < 1e-12) return {1, 0, 0, 0};
  return {q.w / n, q.x / n, q.y / n, q.z / n};
}
inline Quat qconj(const Quat& q) { return {q.w, -q.x, -q.y, -q.z}; }
// Rotate vector v by q (body -> world).
inline Vec3 qrot(const Quat& q, const Vec3& v) {
  Vec3 u{q.x, q.y, q.z};
  Vec3 t = cross(u, v) * 2.0;
  return v + t * q.w + cross(u, t);
}
// Inverse rotation (world -> body).
inline Vec3 qrotInv(const Quat& q, const Vec3& v) { return qrot(qconj(q), v); }

// Aerospace 3-2-1 Euler (psi yaw, theta pitch, phi roll) for body(FRD) -> NED.
inline Quat qFromEuler(double phi, double theta, double psi) {
  double cr = cos(phi * 0.5), sr = sin(phi * 0.5);
  double cp = cos(theta * 0.5), sp = sin(theta * 0.5);
  double cy = cos(psi * 0.5), sy = sin(psi * 0.5);
  return {cr * cp * cy + sr * sp * sy, sr * cp * cy - cr * sp * sy,
          cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy};
}
inline void qToEuler(const Quat& q, double& phi, double& theta, double& psi) {
  double sinp = 2.0 * (q.w * q.y - q.z * q.x);
  sinp = clamp(sinp, -1.0, 1.0);
  theta = asin(sinp);
  phi = atan2(2.0 * (q.w * q.x + q.y * q.z), 1.0 - 2.0 * (q.x * q.x + q.y * q.y));
  psi = atan2(2.0 * (q.w * q.z + q.x * q.y), 1.0 - 2.0 * (q.y * q.y + q.z * q.z));
}

// Deterministic PRNG (xorshift64*), so test runs and replays are reproducible.
struct Rng {
  unsigned long long s = 0x9E3779B97F4A7C15ull;
  void seed(unsigned long long v) { s = v ? v : 0x9E3779B97F4A7C15ull; }
  unsigned long long next() {
    s ^= s >> 12; s ^= s << 25; s ^= s >> 27;
    return s * 2685821657736338717ull;
  }
  double uniform() { return (double)(next() >> 11) * (1.0 / 9007199254740992.0); }
  // Approximate standard normal (sum of 4 uniforms, scaled).
  double normal() {
    double a = uniform() + uniform() + uniform() + uniform() - 2.0;
    return a * 1.7320508;  // var of sum(4 U) = 1/3
  }
};

}  // namespace osk
