// OPEN SKY core — airport traffic implementation.
#include "osk/traffic.h"

namespace osk {

static const AgentType kTypes[4] = {
    // vr, vapp, taxi, accel, decel, climb, span
    {72.0, 70.0, 9.0, 2.0, 2.2, 11.0, 35.0},   // narrow-body twinjet
    {65.0, 66.0, 9.0, 2.2, 2.4, 12.0, 26.0},   // regional jet
    {80.0, 74.0, 8.0, 1.6, 2.0, 9.0, 60.0},    // wide-body twin
    {29.0, 34.0, 6.0, 1.6, 2.0, 3.5, 11.0},    // light single
};
const AgentType& agentType(int t) { return kTypes[t < 0 || t > 3 ? 0 : t]; }

static double hdgOf(double dx, double dy) { return wrap2Pi(atan2(dx, dy)); }

void TrafficSystem::reset() {
  nNodes = nEdges = nRunways = 0;
  activeRw = -1;
  time = 0;
  targetAgents = 0;
  spawnTimer = 3.0;
  nextCallsign = 1;
  playerRunway = -1;
  playerX = playerY = 1e9;
  for (int i = 0; i < MAX_AGENTS; i++) agents[i] = Agent();
  for (int i = 0; i < MAX_AGENTS * AGENT_STRIDE; i++) state[i] = 0;
}

int TrafficSystem::addNode(double x, double y, int type, int runway) {
  if (nNodes >= MAX_NODES) return -1;
  nodes[nNodes] = {x, y, type, runway, 0, 0};
  return nNodes++;
}

int TrafficSystem::addEdge(int a, int b, int nameId) {
  if (nEdges >= MAX_EDGES || a < 0 || b < 0 || a >= nNodes || b >= nNodes || a == b) return -1;
  double len = sqrt(sq(nodes[a].x - nodes[b].x) + sq(nodes[a].y - nodes[b].y));
  edges[nEdges] = {a, b, nameId, len};
  return nEdges++;
}

int TrafficSystem::addRunway(double ax, double ay, double az, double bx, double by, double bz, double width, int) {
  if (nRunways >= MAX_RUNWAYS) return -1;
  TRunway& r = runways[nRunways];
  r.ax = ax; r.ay = ay; r.az = az; r.bx = bx; r.by = by; r.bz = bz; r.width = width;
  r.len = sqrt(sq(bx - ax) + sq(by - ay));
  r.hdgAB = hdgOf(bx - ax, by - ay);
  r.occupant = 0; r.occKind = 0; r.arrivalAgent = 0; r.arrivalEta = 0; r.activeDir = 0; r.playerOn = 0;
  if (activeRw < 0) activeRw = nRunways;
  return nRunways++;
}

void TrafficSystem::finalize() {
  for (int i = 0; i < nNodes; i++) nodes[i].nEdges = 0;
  for (int e = 0; e < nEdges; e++) { nodes[edges[e].a].nEdges++; nodes[edges[e].b].nEdges++; }
  int off = 0;
  for (int i = 0; i < nNodes; i++) { nodes[i].firstEdge = off; off += nodes[i].nEdges; nodes[i].nEdges = 0; }
  for (int e = 0; e < nEdges; e++) {
    TNode& A = nodes[edges[e].a];
    TNode& B = nodes[edges[e].b];
    adj[A.firstEdge + A.nEdges++] = e;
    adj[B.firstEdge + B.nEdges++] = e;
  }
}

// --- A* ---------------------------------------------------------------------
static double gScore[MAX_NODES], fScore[MAX_NODES];
static int cameFrom[MAX_NODES], heap[MAX_NODES * 4], heapN;
static unsigned char closedSet[MAX_NODES];

static void heapPush(int n) {
  int i = heapN++;
  heap[i] = n;
  while (i > 0) {
    int p = (i - 1) / 2;
    if (fScore[heap[p]] <= fScore[heap[i]]) break;
    int t = heap[p]; heap[p] = heap[i]; heap[i] = t;
    i = p;
  }
}
static int heapPop() {
  int top = heap[0];
  heap[0] = heap[--heapN];
  int i = 0;
  for (;;) {
    int l = 2 * i + 1, r = l + 1, m = i;
    if (l < heapN && fScore[heap[l]] < fScore[heap[m]]) m = l;
    if (r < heapN && fScore[heap[r]] < fScore[heap[m]]) m = r;
    if (m == i) break;
    int t = heap[m]; heap[m] = heap[i]; heap[i] = t;
    i = m;
  }
  return top;
}

int TrafficSystem::findPath(int from, int to, int* out, int maxLen, int allowRunway) {
  if (from < 0 || to < 0 || from >= nNodes || to >= nNodes) return 0;
  for (int i = 0; i < nNodes; i++) { gScore[i] = 1e18; fScore[i] = 1e18; cameFrom[i] = -1; closedSet[i] = 0; }
  heapN = 0;
  auto h = [&](int n) { return sqrt(sq(nodes[n].x - nodes[to].x) + sq(nodes[n].y - nodes[to].y)); };
  gScore[from] = 0;
  fScore[from] = h(from);
  heapPush(from);
  while (heapN > 0) {
    int cur = heapPop();
    if (cur == to) break;
    if (closedSet[cur]) continue;
    closedSet[cur] = 1;
    const TNode& N = nodes[cur];
    for (int k = 0; k < N.nEdges; k++) {
      const TEdge& E = edges[adj[N.firstEdge + k]];
      int nb = E.a == cur ? E.b : E.a;
      if (closedSet[nb]) continue;
      const TNode& M = nodes[nb];
      if (M.type == NODE_GATE && nb != to) continue;  // never taxi through a parking stand
      double cost = E.len;
      bool rwEdge = N.type == NODE_RUNWAY && M.type == NODE_RUNWAY;
      if (rwEdge && !(allowRunway >= 0 && N.runway == allowRunway)) cost *= 8.0;
      if (M.type == NODE_RUNWAY && N.type != NODE_RUNWAY) cost += 150.0;  // prefer fewer crossings
      double g = gScore[cur] + cost;
      if (g < gScore[nb]) {
        gScore[nb] = g;
        fScore[nb] = g + h(nb);
        cameFrom[nb] = cur;
        if (heapN < MAX_NODES * 4 - 1) heapPush(nb);
      }
    }
  }
  if (cameFrom[to] < 0 && from != to) return 0;
  int tmp[MAX_PATH];
  int n = 0;
  for (int c = to; c >= 0 && n < MAX_PATH; c = cameFrom[c]) tmp[n++] = c;
  if (n > maxLen) return 0;
  for (int i = 0; i < n; i++) out[i] = tmp[n - 1 - i];
  return n;
}

int TrafficSystem::nearestNode(double x, double y, int typeMask, double maxDist) const {
  int best = -1;
  double bd = maxDist * maxDist;
  for (int i = 0; i < nNodes; i++) {
    if (!((1 << nodes[i].type) & typeMask)) continue;
    double d = sq(nodes[i].x - x) + sq(nodes[i].y - y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

double TrafficSystem::runwayAlong(int rw, int dir, double x, double y, double* lateral) const {
  const TRunway& r = runways[rw];
  double tx = dir == 0 ? r.ax : r.bx, ty = dir == 0 ? r.ay : r.by;
  double ux = (r.bx - r.ax) / r.len, uy = (r.by - r.ay) / r.len;
  if (dir == 1) { ux = -ux; uy = -uy; }
  double dx = x - tx, dy = y - ty;
  if (lateral) *lateral = dx * uy - dy * ux;  // + = right of centreline
  return dx * ux + dy * uy;
}

void TrafficSystem::runwayPoint(int rw, int dir, double along, double& x, double& y, double& z) const {
  const TRunway& r = runways[rw];
  double t = along / r.len;
  if (dir == 1) t = 1.0 - t;
  x = r.ax + (r.bx - r.ax) * t;
  y = r.ay + (r.by - r.ay) * t;
  z = r.az + (r.bz - r.az) * clamp(t, 0, 1);
}

int TrafficSystem::holdNodeFor(int rw, int dir, double, double) const {
  int best = -1;
  double bestAlong = 1e18;
  for (int i = 0; i < nNodes; i++) {
    if (nodes[i].type != NODE_HOLD || nodes[i].runway != rw) continue;
    double along = runwayAlong(rw, dir, nodes[i].x, nodes[i].y, nullptr);
    if (along < -150) continue;
    if (along < bestAlong) { bestAlong = along; best = i; }
  }
  return best;
}

int TrafficSystem::bestRunway(double windFrom, double windSpeed) const {
  int best = 0;
  double bestScore = -1e18;
  for (int r = 0; r < nRunways; r++) {
    for (int d = 0; d < 2; d++) {
      double hdg = wrap2Pi(runways[r].hdgAB + (d ? PI : 0));
      double head = windSpeed * cos(windFrom - hdg);
      double score = (windSpeed > 2.5 ? head * 100.0 : 0.0) + runways[r].len * 0.01 - (d ? 0.001 : 0.0);
      if (score > bestScore) { bestScore = score; best = r * 2 + d; }
    }
  }
  return best;
}

// --- Runway authority --------------------------------------------------------
bool TrafficSystem::runwayFree(int rw, int except) const {
  const TRunway& r = runways[rw];
  if (r.occupant != 0 && r.occupant != except + 1) return false;
  if (r.playerOn && except != PLAYER_ID) return false;
  return true;
}

int TrafficSystem::requestRunway(int agent, int rw, int kind, double eta) {
  if (rw < 0 || rw >= nRunways) return 0;
  TRunway& r = runways[rw];
  int id = agent + 1;
  if (kind == REQ_LANDING) {
    if (r.arrivalAgent != 0 && r.arrivalAgent != id) return 0;
    if (!runwayFree(rw, agent)) return 0;
    r.arrivalAgent = id;
    r.arrivalEta = eta;
    return 1;
  }
  if (r.occupant == id) return 1;
  if (!runwayFree(rw, agent)) return 0;
  double margin = kind == REQ_CROSS ? 40.0 : 75.0;
  if (r.arrivalAgent != 0 && r.arrivalAgent != id && r.arrivalEta < margin) return 0;
  r.occupant = id;
  r.occKind = kind;
  return 1;
}

void TrafficSystem::releaseRunway(int agent, int rw) {
  if (rw < 0 || rw >= nRunways) return;
  TRunway& r = runways[rw];
  if (r.occupant == agent + 1) { r.occupant = 0; r.occKind = 0; }
  if (r.arrivalAgent == agent + 1) { r.arrivalAgent = 0; r.arrivalEta = 0; }
}

void TrafficSystem::reserveArrival(int agent, int rw, double eta) {
  if (rw < 0 || rw >= nRunways) return;
  TRunway& r = runways[rw];
  if (r.arrivalAgent == 0 || r.arrivalAgent == agent + 1) { r.arrivalAgent = agent + 1; r.arrivalEta = eta; }
}

void TrafficSystem::cancelArrival(int agent, int rw) {
  if (rw < 0 || rw >= nRunways) return;
  if (runways[rw].arrivalAgent == agent + 1) runways[rw].arrivalAgent = 0;
}

void TrafficSystem::setPlayer(double x, double y, double hdg, double speed, int onRunway, double agl) {
  playerX = x; playerY = y; playerHdg = hdg; playerSpeed = speed; playerAgl = agl;
  playerRunway = onRunway;
  for (int r = 0; r < nRunways; r++) runways[r].playerOn = (r == onRunway) ? 1 : 0;
}

// --- Agents -------------------------------------------------------------------
int TrafficSystem::pickGate() {
  int candidates[512];
  int n = 0;
  for (int i = 0; i < nNodes && n < 512; i++) {
    if (nodes[i].type != NODE_GATE) continue;
    bool used = false;
    for (int k = 0; k < MAX_AGENTS; k++)
      if (agents[k].active && agents[k].gate == i) { used = true; break; }
    if (used) continue;
    if (sq(nodes[i].x - playerX) + sq(nodes[i].y - playerY) < 90.0 * 90.0) continue;
    candidates[n++] = i;
  }
  if (!n) return -1;
  return candidates[(int)(rng.uniform() * n) % n];
}

static int freeSlot(Agent* agents) {
  for (int i = 0; i < MAX_AGENTS; i++)
    if (!agents[i].active) return i;
  return -1;
}

int TrafficSystem::spawnDeparture(int gate, int type) {
  int s = freeSlot(agents);
  if (s < 0 || gate < 0) return -1;
  Agent& a = agents[s];
  a = Agent();
  a.active = 1;
  a.type = type;
  a.callsign = nextCallsign++;
  a.phase = PH_PARKED;
  a.gate = gate;
  a.x = nodes[gate].x;
  a.y = nodes[gate].y;
  a.z = nRunways ? runways[0].az : 0;
  const TNode& G = nodes[gate];
  a.hdg = 0;
  if (G.nEdges > 0) {
    const TEdge& E = edges[adj[G.firstEdge]];
    int nb = E.a == gate ? E.b : E.a;
    a.hdg = hdgOf(G.x - nodes[nb].x, G.y - nodes[nb].y);  // nose in
  }
  a.timer = 15.0 + rng.uniform() * 150.0;
  a.lights = 1;
  return s;
}

int TrafficSystem::spawnArrival(int rw, int dir, double dist, int type) {
  int s = freeSlot(agents);
  if (s < 0 || rw < 0 || rw >= nRunways) return -1;
  Agent& a = agents[s];
  a = Agent();
  a.active = 1;
  a.type = type;
  a.callsign = nextCallsign++;
  a.phase = PH_APPROACH;
  a.runway = rw;
  a.dir = dir;
  a.along = -dist;
  double x, y, z;
  runwayPoint(rw, dir, a.along, x, y, z);
  a.x = x; a.y = y;
  a.z = runways[rw].az + 15.0 + dist * 0.0524;
  a.hdg = wrap2Pi(runways[rw].hdgAB + (dir ? PI : 0));
  a.speed = agentType(type).vapp + 12.0;
  a.lights = 1 | 2 | 4 | 8;
  a.gear = dist < 9000 ? 1 : 0;
  return s;
}

bool TrafficSystem::blockedAhead(const Agent& a, double range) const {
  double sh = sin(a.hdg), ch = cos(a.hdg);
  int self = (int)(&a - agents);
  auto test = [&](double ox, double oy, double oh, int otherId, bool otherIsAgent) {
    double dx = ox - a.x, dy = oy - a.y;
    double d = sqrt(dx * dx + dy * dy);
    if (d > range || d < 0.01) return false;
    double fwd = dx * sh + dy * ch;
    double lat = fabs(dx * ch - dy * sh);
    if (fwd <= 0 || lat > 30.0 + fwd * 0.15) return false;
    if (otherIsAgent) {
      // Mutual block: the lower slot index has priority to break deadlocks.
      double bx = -dx, by = -dy;
      double ofwd = bx * sin(oh) + by * cos(oh);
      double olat = fabs(bx * cos(oh) - by * sin(oh));
      bool mutual = ofwd > 0 && olat < 30.0 + ofwd * 0.15;
      if (mutual && self < otherId) return false;
    }
    return true;
  };
  for (int k = 0; k < MAX_AGENTS; k++) {
    if (k == self || !agents[k].active) continue;
    const Agent& o = agents[k];
    if (o.phase == PH_APPROACH || o.phase == PH_CLIMB || o.phase == PH_GO_AROUND || o.phase == PH_TAKEOFF) continue;
    if (test(o.x, o.y, o.hdg, k, true)) return true;
  }
  if (playerAgl < 5.0 && test(playerX, playerY, playerHdg, -1, false)) return true;
  return false;
}

void TrafficSystem::followPath(Agent& a, double dt, double cruise) {
  if (a.pathIdx >= a.pathLen) { a.speed = approach(a.speed, 0, 0.5, dt); return; }
  // Runway crossings: request at the hold node before a foreign runway.
  int cur = a.path[a.pathIdx];
  const TNode& T = nodes[cur];
  double dx = T.x - a.x, dy = T.y - a.y;
  double dist = sqrt(dx * dx + dy * dy);
  if (T.type == NODE_RUNWAY && T.runway != a.runway && a.pathIdx > 0) {
    int prev = a.path[a.pathIdx - 1];
    if (nodes[prev].type == NODE_HOLD && dist < 140.0) {
      if (!requestRunway(a.callsign + 1000, T.runway, REQ_CROSS, 0)) {
        a.waiting = 1;
        a.speed = approach(a.speed, 0, 0.4, dt);
        if (dist < 100.0) return;
      } else {
        a.waiting = 0;
      }
    }
  }
  if (T.type == NODE_HOLD && a.pathIdx > 0) {
    int prev = a.path[a.pathIdx - 1];
    if (nodes[prev].type == NODE_RUNWAY && nodes[prev].runway != a.runway && dist < 3.0)
      releaseRunway(a.callsign + 1000, nodes[prev].runway);
  }
  if (dist < 3.0) { a.pathIdx++; return; }

  // Speed: slow before sharp turns and at the end of the route.
  double desired = cruise;
  if (a.pathIdx + 1 < a.pathLen) {
    const TNode& N = nodes[a.path[a.pathIdx + 1]];
    double h1 = hdgOf(dx, dy), h2 = hdgOf(N.x - T.x, N.y - T.y);
    double turn = fabs(wrapPi(h2 - h1));
    if (turn > 0.5 && dist < 60.0) desired = minf(desired, 4.0);
  } else {
    desired = minf(desired, maxf(1.0, dist * 0.25));
  }
  if (blockedAhead(a, 75.0)) { desired = 0; a.waiting = 1; } else if (!a.waiting || dist > 0) a.waiting = 0;
  a.speed = slew(a.speed, desired, desired > a.speed ? 0.8 : 2.0, dt);
  double want = hdgOf(dx, dy);
  double err = wrapPi(want - a.hdg);
  double maxRate = a.speed > 0.5 ? a.speed / 22.0 : 0.25;
  a.hdg = wrap2Pi(a.hdg + clamp(err, -maxRate * dt, maxRate * dt));
  double fwd = fabs(err) > 1.2 ? 0.2 : 1.0;  // nearly stop while turning sharply
  a.x += sin(a.hdg) * a.speed * fwd * dt;
  a.y += cos(a.hdg) * a.speed * fwd * dt;
}

int TrafficSystem::pickExit(const Agent& a) const {
  const AgentType& T = agentType(a.type);
  double stop = maxf(0.0, (a.speed * a.speed - 144.0) / (2.0 * T.decel));
  int best = -1, last = -1;
  double bestAlong = 1e18, lastAlong = -1e18;
  for (int i = 0; i < nNodes; i++) {
    const TNode& N = nodes[i];
    if (N.type != NODE_RUNWAY || N.runway != a.runway) continue;
    bool hasTaxi = false;
    for (int k = 0; k < N.nEdges; k++) {
      const TEdge& E = edges[adj[N.firstEdge + k]];
      int nb = E.a == i ? E.b : E.a;
      if (nodes[nb].type != NODE_RUNWAY) { hasTaxi = true; break; }
    }
    if (!hasTaxi) continue;
    double al = runwayAlong(a.runway, a.dir, N.x, N.y, nullptr);
    if (al > lastAlong) { lastAlong = al; last = i; }
    if (al >= a.along + stop && al < bestAlong) { bestAlong = al; best = i; }
  }
  return best >= 0 ? best : last;
}

void TrafficSystem::update(double dt) {
  time += dt;
  if (nRunways == 0) { exportState(); return; }
  int active = 0;
  for (int i = 0; i < MAX_AGENTS; i++) active += agents[i].active;

  // Scheduler
  spawnTimer -= dt;
  if (active < targetAgents && spawnTimer <= 0 && activeRw >= 0) {
    int type = rng.uniform() < 0.15 ? 2 : (rng.uniform() < 0.35 ? 1 : 0);
    if (time < 5.0) {
      // initial population: mostly parked aircraft
      int g = pickGate();
      if (g >= 0) spawnDeparture(g, type);
      spawnTimer = 0.05;
    } else if (rng.uniform() < 0.5) {
      int g = pickGate();
      if (g >= 0) spawnDeparture(g, type);
      spawnTimer = 30.0 + rng.uniform() * 40.0;
    } else {
      const TRunway& r = runways[activeRw];
      bool clearSky = true;
      for (int k = 0; k < MAX_AGENTS; k++)
        if (agents[k].active && agents[k].phase == PH_APPROACH && agents[k].along < -12000) clearSky = false;
      if (clearSky) spawnArrival(activeRw, r.activeDir, 16000.0 + rng.uniform() * 3000.0, type);
      spawnTimer = 35.0 + rng.uniform() * 45.0;
    }
  }

  for (int i = 0; i < MAX_AGENTS; i++) {
    Agent& a = agents[i];
    if (!a.active) continue;
    const AgentType& T = agentType(a.type);
    int myId = a.callsign + 1000;  // runway-manager id (player is 0)
    double elev = runways[0].az;
    switch (a.phase) {
      case PH_PARKED: {
        a.speed = 0;
        a.timer -= dt;
        if (a.timer <= 0 && activeRw >= 0) {
          int dir = runways[activeRw].activeDir;
          int hold = holdNodeFor(activeRw, dir, a.x, a.y);
          a.pathLen = hold >= 0 ? findPath(a.gate, hold, a.path, MAX_PATH, -1) : 0;
          if (a.pathLen > 1) {
            a.runway = activeRw;
            a.dir = dir;
            a.pathIdx = 1;
            a.phase = PH_PUSHBACK;
            a.timer = 0;
            a.lights = 1 | 2;
          } else {
            a.timer = 60.0;
          }
        }
        break;
      }
      case PH_PUSHBACK: {
        // Tug pushes the aircraft tail-first toward the first taxi node, then turns it.
        const TNode& N = nodes[a.path[1]];
        double dx = N.x - a.x, dy = N.y - a.y;
        double d = sqrt(dx * dx + dy * dy);
        a.timer += dt;
        if (d > 4.0 && a.timer < 90.0) {
          double back = hdgOf(-dx, -dy);
          a.hdg = wrap2Pi(a.hdg + clamp(wrapPi(back - a.hdg), -0.15 * dt, 0.15 * dt));
          a.speed = -1.4;
          a.x += dx / d * 1.4 * dt;
          a.y += dy / d * 1.4 * dt;
        } else {
          a.speed = 0;
          a.gate = -1;
          a.pathIdx = a.pathLen > 2 ? 2 : 1;
          a.phase = PH_TAXI_OUT;
          a.lights = 1 | 2 | 16;
        }
        break;
      }
      case PH_TAXI_OUT: {
        followPath(a, dt, T.taxi);
        if (a.pathIdx >= a.pathLen) { a.phase = PH_HOLD_SHORT; a.timer = 8.0 + rng.uniform() * 10.0; }
        break;
      }
      case PH_HOLD_SHORT: {
        a.speed = 0;
        a.timer -= dt;
        if (a.timer <= 0 && requestRunway(myId, a.runway, REQ_TAKEOFF, 0)) {
          a.phase = PH_LINEUP;
          a.lights = 1 | 2 | 4 | 8;
          double lat;
          double al = runwayAlong(a.runway, a.dir, a.x, a.y, &lat);
          a.along = maxf(al, 30.0);
          a.timer = 0;
        } else if (a.timer <= 0) {
          a.timer = 2.0;
        }
        break;
      }
      case PH_LINEUP: {
        double x, y, z;
        runwayPoint(a.runway, a.dir, a.along, x, y, z);
        double dx = x - a.x, dy = y - a.y, d = sqrt(dx * dx + dy * dy);
        double rwh = wrap2Pi(runways[a.runway].hdgAB + (a.dir ? PI : 0));
        if (d > 3.0) {
          double want = hdgOf(dx, dy);
          a.hdg = wrap2Pi(a.hdg + clamp(wrapPi(want - a.hdg), -0.35 * dt, 0.35 * dt));
          a.speed = slew(a.speed, 5.0, 1.0, dt);
          a.x += sin(a.hdg) * a.speed * dt;
          a.y += cos(a.hdg) * a.speed * dt;
        } else {
          double err = wrapPi(rwh - a.hdg);
          a.hdg = wrap2Pi(a.hdg + clamp(err, -0.3 * dt, 0.3 * dt));
          a.speed = slew(a.speed, 2.0, 1.0, dt);
          if (fabs(err) < 0.03) { a.phase = PH_TAKEOFF; a.timer = 0; a.along = runwayAlong(a.runway, a.dir, a.x, a.y, nullptr); }
        }
        break;
      }
      case PH_TAKEOFF: {
        double rwh = wrap2Pi(runways[a.runway].hdgAB + (a.dir ? PI : 0));
        a.hdg = rwh;
        a.speed += T.accel * dt;
        a.along += a.speed * dt;
        double x, y, z;
        runwayPoint(a.runway, a.dir, a.along, x, y, z);
        a.x = x; a.y = y;
        if (a.speed > T.vr) {
          a.pitch = approach(a.pitch, 9.0 * DEG, 1.2, dt);
          if (a.pitch > 6.5 * DEG) {
            a.vs = approach(a.vs, T.climb, 2.0, dt);
          }
        }
        a.z = maxf(z, a.z + a.vs * dt);
        if (a.z - z > 2.0) a.gear = a.z - z < 120 ? 1 : 0;
        if (a.along > runways[a.runway].len + 400.0 || a.z - elev > 150.0) {
          releaseRunway(myId, a.runway);
          a.phase = PH_CLIMB;
          a.timer = 0;
          a.gear = 0;
        }
        break;
      }
      case PH_CLIMB:
      case PH_GO_AROUND: {
        a.timer += dt;
        a.speed = approach(a.speed, 95.0, 20.0, dt);
        a.vs = approach(a.vs, T.climb, 3.0, dt);
        a.pitch = approach(a.pitch, 7.0 * DEG, 2.0, dt);
        a.z += a.vs * dt;
        if (a.timer > 25.0) {
          double turn = (a.callsign % 2 ? 1 : -1) * 0.04;
          a.hdg = wrap2Pi(a.hdg + turn * dt);
          a.roll = approach(a.roll, (a.callsign % 2 ? 1 : -1) * 18.0 * DEG, 2.0, dt);
        }
        a.x += sin(a.hdg) * a.speed * dt;
        a.y += cos(a.hdg) * a.speed * dt;
        double cx = (runways[0].ax + runways[0].bx) * 0.5, cy = (runways[0].ay + runways[0].by) * 0.5;
        if (sq(a.x - cx) + sq(a.y - cy) > 16000.0 * 16000.0 || a.z - elev > 2500.0) a.active = 0;
        break;
      }
      case PH_APPROACH: {
        TRunway& r = runways[a.runway];
        a.speed = approach(a.speed, T.vapp, 40.0, dt);
        a.along += a.speed * dt;
        double x, y, z;
        runwayPoint(a.runway, a.dir, a.along, x, y, z);
        a.x = x; a.y = y;
        double thrZ = a.dir == 0 ? r.az : r.bz;
        double target = thrZ + 15.0 + maxf(0.0, -a.along) * 0.0524;
        if (a.along > 0) {
          double t = clamp(a.along / 380.0, 0, 1);
          target = thrZ + 15.0 * sq(1.0 - t);
        }
        a.vs = (target - a.z) / maxf(dt, 1e-3);
        a.z = target;
        a.vs = clamp(a.vs, -8, 8);
        a.pitch = approach(a.pitch, (a.along > 0 ? 5.5 : 2.5) * DEG, 1.0, dt);
        a.hdg = wrap2Pi(r.hdgAB + (a.dir ? PI : 0));
        if (a.along > -9000) a.gear = 1;
        double eta = maxf(0.0, -a.along) / maxf(a.speed, 1.0);
        reserveArrival(myId, a.runway, eta);
        // timer >= 1 marks "cleared to land"
        if (a.along > -4000 && a.timer < 1.0) {
          if (requestRunway(myId, a.runway, REQ_LANDING, eta)) a.timer = 1.0;
        }
        bool cleared = a.timer >= 1.0;
        if ((!cleared && a.along > -900) || (a.along > -300 && !runwayFree(a.runway, myId))) {
          cancelArrival(myId, a.runway);
          a.phase = PH_GO_AROUND;
          a.timer = 0;
          a.gear = 1;
          break;
        }
        if (a.along >= 0 && r.occupant == 0) { r.occupant = myId + 1; r.occKind = REQ_LANDING; }
        if (a.along >= 380.0) {
          a.phase = PH_ROLLOUT;
          a.z = thrZ;
          a.vs = 0;
          a.timer = 0;
          a.gate = -1;
          int ex = pickExit(a);
          a.pathLen = 0;
          a.pathIdx = 0;
          a.path[0] = ex;
        }
        break;
      }
      case PH_ROLLOUT: {
        TRunway& r = runways[a.runway];
        a.pitch = approach(a.pitch, 0.0, 1.5, dt);
        int ex = a.path[0];
        double exAlong = ex >= 0 ? runwayAlong(a.runway, a.dir, nodes[ex].x, nodes[ex].y, nullptr) : r.len;
        double remain = exAlong - a.along;
        double vt = remain > 30 ? sqrt(maxf(144.0, 2.0 * T.decel * remain * 0.8 + 100.0)) : 7.0;
        a.speed = slew(a.speed, minf(vt, a.speed), T.decel, dt);
        a.along += a.speed * dt;
        double x, y, z;
        runwayPoint(a.runway, a.dir, a.along, x, y, z);
        a.x = x; a.y = y; a.z = z;
        a.lights = 1 | 2 | 4 | 16;
        if (remain < 8.0 || a.along > r.len - 20) {
          int g = pickGate();
          int start = ex >= 0 ? ex : nearestNode(a.x, a.y, 1 << NODE_RUNWAY, 400);
          a.pathLen = (g >= 0 && start >= 0) ? findPath(start, g, a.path, MAX_PATH, a.runway) : 0;
          a.gate = g;
          a.pathIdx = 1;
          a.phase = PH_TAXI_IN;
          a.speed = minf(a.speed, 8.0);
          if (a.pathLen < 2) { releaseRunway(myId, a.runway); a.active = 0; }
        }
        break;
      }
      case PH_TAXI_IN: {
        followPath(a, dt, T.taxi);
        double lat;
        runwayAlong(a.runway, a.dir, a.x, a.y, &lat);
        if (fabs(lat) > runways[a.runway].width * 0.5 + 45.0) releaseRunway(myId, a.runway);
        if (a.pathIdx >= a.pathLen) {
          releaseRunway(myId, a.runway);
          a.phase = PH_ARRIVED;
          a.timer = 90.0 + rng.uniform() * 200.0;
          a.lights = 1;
          a.speed = 0;
        }
        break;
      }
      case PH_ARRIVED: {
        a.timer -= dt;
        if (a.timer <= 0) { a.phase = PH_PARKED; a.timer = 30.0 + rng.uniform() * 90.0; }
        break;
      }
      default:
        break;
    }
    if (a.phase != PH_CLIMB && a.phase != PH_GO_AROUND) a.roll = approach(a.roll, 0, 1.0, dt);
  }
  exportState();
}

void TrafficSystem::exportState() {
  for (int i = 0; i < MAX_AGENTS; i++) {
    const Agent& a = agents[i];
    double* s = &state[i * AGENT_STRIDE];
    s[0] = a.active; s[1] = a.x; s[2] = a.y; s[3] = a.z; s[4] = a.hdg; s[5] = a.pitch; s[6] = a.roll;
    s[7] = a.speed; s[8] = a.phase; s[9] = a.type; s[10] = a.lights; s[11] = a.callsign; s[12] = a.gear;
    s[13] = a.runway; s[14] = a.vs; s[15] = a.waiting;
  }
}

}  // namespace osk
