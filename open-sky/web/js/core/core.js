// Loads the C++ simulation core: WebAssembly when the host allows it,
// otherwise the wasm2js build of the same code (identical results, slower).
import { OskIn, OskOut } from './layout.js';

const MATH_ENV = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos,
  atan2: Math.atan2, exp: Math.exp, log: Math.log, pow: Math.pow,
};

export async function loadCore(base = './wasm/') {
  let exports = null;
  let backend = 'wasm';
  try {
    if (typeof WebAssembly !== 'object') throw new Error('no WebAssembly');
    const res = await fetch(base + 'opensky_core.wasm');
    if (!res.ok) throw new Error('fetch ' + res.status);
    const bytes = await res.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, { env: MATH_ENV });
    exports = instance.exports;
  } catch (err) {
    console.warn('[core] WebAssembly unavailable, using JS fallback:', err.message);
    backend = 'js';
    exports = await import('../../wasm/opensky_core_fallback.js');
  }
  if (exports.__wasm_call_ctors) exports.__wasm_call_ctors();
  const layout = exports.osk_layout();
  const nIn = Math.floor(layout / 1000);
  const nOut = layout % 1000;
  if (nIn !== OskIn.IN_COUNT || nOut !== OskOut.OUT_COUNT) {
    throw new Error(`core layout mismatch: core ${nIn}/${nOut}, js ${OskIn.IN_COUNT}/${OskOut.OUT_COUNT}`);
  }
  return new Core(exports, backend, nIn, nOut);
}

class Core {
  constructor(x, backend, nIn, nOut) {
    this.x = x;
    this.backend = backend;
    this.nIn = nIn;
    this.nOut = nOut;
    this._views();
  }

  // Memory views must be refreshed if memory ever grows.
  _views() {
    const buf = this.x.memory.buffer;
    this._buf = buf;
    this.in = new Float64Array(buf, this.x.osk_in(), this.nIn);
    this.out = new Float64Array(buf, this.x.osk_out(), this.nOut);
    this.tfcState = new Float64Array(buf, this.x.tfc_state(), this.x.tfc_max_agents() * this.x.tfc_agent_stride());
    this.tfcPath = new Int32Array(buf, this.x.tfc_path(), 320);
  }
  check() { if (this.x.memory.buffer !== this._buf) this._views(); }

  // ---- aircraft
  init(aircraftId) { this.x.osk_init(aircraftId); this.check(); }
  reset(e, n, z, hdg, tas, onGround, running) { this.x.osk_reset(e, n, z, hdg, tas, onGround ? 1 : 0, running ? 1 : 0); }
  advance(dt) { this.x.osk_advance(dt); }
  setGround(h, nE, nN, nU, surface) { this.x.osk_set_ground(h, nE, nN, nU, surface); }
  setWeather(qnh, dT, windFromRad, wind10, gust, turb, seed) { this.x.osk_set_weather(qnh, dT, windFromRad, wind10, gust, turb, seed | 0); }
  setPayload(pilot, pax, bag) { this.x.osk_set_payload(pilot, pax, bag); }
  setFuel(l, r) { this.x.osk_set_fuel(l, r); }
  setFailure(id, on) { this.x.osk_set_failure(id, on ? 1 : 0); }
  setTrim(t) { this.x.osk_set_trim(t); }
  alignHI() { this.x.osk_align_hi(); }
  crash(reason) { this.x.osk_crash(reason); }
  clearEvents() { this.x.osk_clear_events(); }
  setPaused(p) { this.x.osk_set_paused(p ? 1 : 0); }
  setSimMode(m) { this.x.osk_set_sim_mode(m ? 1 : 0); }
  setPosition(e, n, up) { this.x.osk_set_position(e, n, up); }
  setGroundSpeed(v) { this.x.osk_set_ground_speed(v); }

  // ---- traffic / runway authority
  tfcReset() { this.x.tfc_reset(); }
  tfcAddNode(x, y, type, rw) { return this.x.tfc_add_node(x, y, type, rw); }
  tfcAddEdge(a, b, name) { return this.x.tfc_add_edge(a, b, name); }
  tfcAddRunway(ax, ay, az, bx, by, bz, w) { return this.x.tfc_add_runway(ax, ay, az, bx, by, bz, w); }
  tfcFinalize() { this.x.tfc_finalize(); }
  tfcFindPath(from, to, allowRunway = -1) {
    const n = this.x.tfc_find_path(from, to, allowRunway);
    this.check();
    return Array.from(this.tfcPath.subarray(0, n));
  }
  tfcAgentPath(i) { const n = this.x.tfc_agent_path(i); this.check(); return Array.from(this.tfcPath.subarray(0, n)); }
  tfcNearestNode(x, y, mask, maxDist) { return this.x.tfc_nearest_node(x, y, mask, maxDist); }
  tfcHoldNode(rw, dir) { return this.x.tfc_hold_node(rw, dir); }
  tfcBestRunway(windFrom, windSpeed) { return this.x.tfc_best_runway(windFrom, windSpeed); }
  tfcRequest(agent, rw, kind, eta) { return this.x.tfc_request(agent, rw, kind, eta); }
  tfcRelease(agent, rw) { this.x.tfc_release(agent, rw); }
  tfcReserveArrival(agent, rw, eta) { this.x.tfc_reserve_arrival(agent, rw, eta); }
  tfcCancelArrival(agent, rw) { this.x.tfc_cancel_arrival(agent, rw); }
  tfcOccupant(rw) { return this.x.tfc_occupant(rw); }
  tfcArrivalEta(rw) { return this.x.tfc_arrival_eta(rw); }
  tfcArrivalAgent(rw) { return this.x.tfc_arrival_agent(rw); }
  tfcSetActive(rw, dir) { this.x.tfc_set_active(rw, dir); }
  tfcSetPlayer(x, y, hdg, speed, onRunway, agl) { this.x.tfc_set_player(x, y, hdg, speed, onRunway, agl); }
  tfcSetDensity(n, seed) { this.x.tfc_set_density(n, seed); }
  tfcUpdate(dt) { this.x.tfc_update(dt); this.check(); }
  get tfcMaxAgents() { return this.x.tfc_max_agents(); }
  get tfcStride() { return this.x.tfc_agent_stride(); }
}

export { OskIn, OskOut };
