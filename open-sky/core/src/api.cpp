// OPEN SKY core — C ABI exported to the JS host (WebAssembly) and used by
// native tests. All state lives in two static objects; no heap is used.
#include "osk/api.h"
#include "osk/sim.h"
#include "osk/traffic.h"

using namespace osk;

static Sim g_sim;
static TrafficSystem g_tfc;

#if defined(__wasm__)
// Freestanding build: the compiler may emit calls to these.
extern "C" void* memset(void* d, int c, unsigned long n) {
  unsigned char* p = (unsigned char*)d;
  while (n--) *p++ = (unsigned char)c;
  return d;
}
extern "C" void* memcpy(void* d, const void* s, unsigned long n) {
  unsigned char* p = (unsigned char*)d;
  const unsigned char* q = (const unsigned char*)s;
  while (n--) *p++ = *q++;
  return d;
}
extern "C" void* memmove(void* d, const void* s, unsigned long n) {
  unsigned char* p = (unsigned char*)d;
  const unsigned char* q = (const unsigned char*)s;
  if (p < q) { while (n--) *p++ = *q++; }
  else { p += n; q += n; while (n--) *--p = *--q; }
  return d;
}
#endif

// ---- Aircraft simulation ----------------------------------------------------
OSK_EXPORT(osk_layout) int osk_layout() { return IN_COUNT * 1000 + OUT_COUNT; }
OSK_EXPORT(osk_init) void osk_init(int aircraftId) { g_sim.init(aircraftId); }
OSK_EXPORT(osk_in) double* osk_in() { return g_sim.in; }
OSK_EXPORT(osk_out) double* osk_out() { return g_sim.out; }
OSK_EXPORT(osk_reset) void osk_reset(double e, double n, double z, double hdg, double tas, int onGround, int running) {
  g_sim.reset(e, n, z, hdg, tas, onGround != 0, running != 0);
}
OSK_EXPORT(osk_advance) void osk_advance(double dt) { g_sim.advance(dt); }
OSK_EXPORT(osk_set_ground) void osk_set_ground(double h, double nE, double nN, double nU, int surface) {
  g_sim.setGround(h, nE, nN, nU, surface);
}
OSK_EXPORT(osk_set_weather) void osk_set_weather(double qnh, double dT, double windFrom, double wind10, double gust,
                                                 double turb, int seed) {
  g_sim.setWeather(qnh, dT, windFrom, wind10, gust, turb, (unsigned)seed);
}
OSK_EXPORT(osk_set_payload) void osk_set_payload(double pilot, double pax, double bag) { g_sim.setPayload(pilot, pax, bag); }
OSK_EXPORT(osk_set_fuel) void osk_set_fuel(double l, double r) { g_sim.setFuel(l, r); }
OSK_EXPORT(osk_set_failure) void osk_set_failure(int id, int on) { g_sim.setFailure(id, on != 0); }
OSK_EXPORT(osk_set_trim) void osk_set_trim(double t) { g_sim.setTrim(t); }
OSK_EXPORT(osk_align_hi) void osk_align_hi() { g_sim.alignHeadingIndicator(); }
OSK_EXPORT(osk_crash) void osk_crash(int reason) { g_sim.crash(reason); }
OSK_EXPORT(osk_clear_events) void osk_clear_events() { g_sim.clearEvents(); }
OSK_EXPORT(osk_set_paused) void osk_set_paused(int p) { g_sim.setPaused(p != 0); }
OSK_EXPORT(osk_set_sim_mode) void osk_set_sim_mode(int m) { g_sim.setSimMode(m != 0); }
OSK_EXPORT(osk_set_ground_speed) void osk_set_ground_speed(double v) { g_sim.setGroundSpeed(v); }
OSK_EXPORT(osk_set_position) void osk_set_position(double e, double n, double up) { g_sim.setPosition(e, n, up); }

// ---- Airport traffic & runway authority ---------------------------------------
OSK_EXPORT(tfc_reset) void tfc_reset() { g_tfc.reset(); }
OSK_EXPORT(tfc_add_node) int tfc_add_node(double x, double y, int type, int runway) { return g_tfc.addNode(x, y, type, runway); }
OSK_EXPORT(tfc_add_edge) int tfc_add_edge(int a, int b, int name) { return g_tfc.addEdge(a, b, name); }
OSK_EXPORT(tfc_add_runway) int tfc_add_runway(double ax, double ay, double az, double bx, double by, double bz, double w) {
  return g_tfc.addRunway(ax, ay, az, bx, by, bz, w, 0);
}
OSK_EXPORT(tfc_finalize) void tfc_finalize() { g_tfc.finalize(); }
OSK_EXPORT(tfc_find_path) int tfc_find_path(int from, int to, int allowRunway) {
  return g_tfc.findPath(from, to, g_tfc.pathOut, MAX_PATH, allowRunway);
}
OSK_EXPORT(tfc_path) int* tfc_path() { return g_tfc.pathOut; }
OSK_EXPORT(tfc_nearest_node) int tfc_nearest_node(double x, double y, int mask, double maxDist) {
  return g_tfc.nearestNode(x, y, mask, maxDist);
}
OSK_EXPORT(tfc_hold_node) int tfc_hold_node(int rw, int dir) { return g_tfc.holdNodeFor(rw, dir, 0, 0); }
OSK_EXPORT(tfc_best_runway) int tfc_best_runway(double windFrom, double windSpeed) { return g_tfc.bestRunway(windFrom, windSpeed); }
OSK_EXPORT(tfc_request) int tfc_request(int agent, int rw, int kind, double eta) { return g_tfc.requestRunway(agent, rw, kind, eta); }
OSK_EXPORT(tfc_release) void tfc_release(int agent, int rw) { g_tfc.releaseRunway(agent, rw); }
OSK_EXPORT(tfc_reserve_arrival) void tfc_reserve_arrival(int agent, int rw, double eta) { g_tfc.reserveArrival(agent, rw, eta); }
OSK_EXPORT(tfc_cancel_arrival) void tfc_cancel_arrival(int agent, int rw) { g_tfc.cancelArrival(agent, rw); }
OSK_EXPORT(tfc_occupant) int tfc_occupant(int rw) { return g_tfc.runwayOccupant(rw); }
OSK_EXPORT(tfc_arrival_eta) double tfc_arrival_eta(int rw) { return g_tfc.arrivalEta(rw); }
OSK_EXPORT(tfc_arrival_agent) int tfc_arrival_agent(int rw) { return g_tfc.arrivalAgent(rw); }
OSK_EXPORT(tfc_set_active) void tfc_set_active(int rw, int dir) { g_tfc.setActive(rw, dir); }
OSK_EXPORT(tfc_set_player) void tfc_set_player(double x, double y, double hdg, double speed, int onRunway, double agl) {
  g_tfc.setPlayer(x, y, hdg, speed, onRunway, agl);
}
OSK_EXPORT(tfc_set_density) void tfc_set_density(int n, int seed) { g_tfc.setDensity(n, seed); }
OSK_EXPORT(tfc_update) void tfc_update(double dt) { g_tfc.update(dt); }
OSK_EXPORT(tfc_state) double* tfc_state() { return g_tfc.state; }
OSK_EXPORT(tfc_max_agents) int tfc_max_agents() { return MAX_AGENTS; }
OSK_EXPORT(tfc_agent_stride) int tfc_agent_stride() { return AGENT_STRIDE; }
OSK_EXPORT(tfc_agent_path) int tfc_agent_path(int i) {
  if (i < 0 || i >= MAX_AGENTS || !g_tfc.agents[i].active) return 0;
  const Agent& a = g_tfc.agents[i];
  int n = 0;
  for (int k = a.pathIdx; k < a.pathLen && n < MAX_PATH; k++) g_tfc.pathOut[n++] = a.path[k];
  return n;
}
