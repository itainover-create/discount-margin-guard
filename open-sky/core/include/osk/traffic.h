// OPEN SKY core — airport traffic: taxi network, A* routing, runway
// occupancy / sequencing (the authority ATC uses for clearances) and
// computer-controlled aircraft that taxi, take off, fly and land.
// Coordinates: ENU metres in the current world frame (x east, y north, z up).
#pragma once
#include "math.h"

namespace osk {

enum NodeType { NODE_TAXI = 0, NODE_HOLD = 1, NODE_RUNWAY = 2, NODE_GATE = 3 };
enum ReqKind { REQ_TAKEOFF = 0, REQ_LANDING = 1, REQ_CROSS = 2, REQ_LINEUP = 3 };
enum AgentPhase {
  PH_NONE = 0, PH_PARKED, PH_PUSHBACK, PH_TAXI_OUT, PH_HOLD_SHORT, PH_LINEUP, PH_TAKEOFF,
  PH_CLIMB, PH_APPROACH, PH_LANDING, PH_ROLLOUT, PH_TAXI_IN, PH_GO_AROUND, PH_ARRIVED
};

constexpr int MAX_NODES = 6000;
constexpr int MAX_EDGES = 12000;
constexpr int MAX_RUNWAYS = 16;
constexpr int MAX_AGENTS = 40;
constexpr int MAX_PATH = 320;
constexpr int AGENT_STRIDE = 16;
constexpr int PLAYER_ID = 0;   // runway-manager id of the human pilot

struct TNode { double x, y; int type, runway, firstEdge, nEdges; };
struct TEdge { int a, b, name; double len; };
struct TRunway {
  double ax, ay, az, bx, by, bz, width, len, hdgAB;
  int occupant;            // agent id + 1 (0 = free); player = PLAYER_ID + 1
  int occKind;
  int arrivalAgent;        // agent with landing reservation (id + 1)
  double arrivalEta;       // seconds until that arrival reaches the threshold
  int activeDir;           // 0: A->B, 1: B->A
  int playerOn;            // player physically on the runway
};

struct AgentType { double vr, vapp, taxi, accel, decel, climb, wingspan; };

struct Agent {
  int active = 0, phase = PH_NONE, type = 0, callsign = 0;
  double x = 0, y = 0, z = 0, hdg = 0, pitch = 0, roll = 0, speed = 0, vs = 0;
  int path[MAX_PATH];
  int pathLen = 0, pathIdx = 0;
  int runway = -1, gate = -1, dir = 0;
  double timer = 0, along = 0;
  int lights = 0, gear = 1, waiting = 0;
};

class TrafficSystem {
 public:
  void reset();
  int addNode(double x, double y, int type, int runway);
  int addEdge(int a, int b, int nameId);
  int addRunway(double ax, double ay, double az, double bx, double by, double bz, double width, int unused);
  void finalize();   // builds adjacency (call after all nodes & edges)

  // A* over the taxi graph; runway edges other than those of `allowRunway`
  // cost more (crossings) — never used as long taxi routes.
  int findPath(int from, int to, int* out, int maxLen, int allowRunway);
  int nearestNode(double x, double y, int typeMask, double maxDist) const;
  int holdNodeFor(int runway, int dir, double fromX, double fromY) const;
  int bestRunway(double windFromRad, double windSpeed) const;  // returns rw*2+dir

  // Runway authority. Returns 1 if cleared, 0 if the requester must wait.
  int requestRunway(int agent, int rw, int kind, double eta);
  void releaseRunway(int agent, int rw);
  void reserveArrival(int agent, int rw, double eta);
  void cancelArrival(int agent, int rw);
  int runwayOccupant(int rw) const { return rw >= 0 && rw < nRunways ? runways[rw].occupant - 1 : -1; }
  double arrivalEta(int rw) const { return rw >= 0 && rw < nRunways && runways[rw].arrivalAgent ? runways[rw].arrivalEta : -1; }
  int arrivalAgent(int rw) const { return rw >= 0 && rw < nRunways ? runways[rw].arrivalAgent - 1 : -1; }
  void setActive(int rw, int dir) { if (rw >= 0 && rw < nRunways) { activeRw = rw; runways[rw].activeDir = dir; } }

  void setPlayer(double x, double y, double hdg, double speed, int onRunway, double agl);
  void setDensity(int maxAgents, int seed) { targetAgents = maxAgents; if (seed) rng.seed(seed); }
  void update(double dt);
  int spawnDeparture(int gate, int type);
  int spawnArrival(int rw, int dir, double dist, int type);

  // Exported state: AGENT_STRIDE doubles per agent slot.
  double state[MAX_AGENTS * AGENT_STRIDE];
  int pathOut[MAX_PATH];

  TNode nodes[MAX_NODES];
  TEdge edges[MAX_EDGES];
  int adj[MAX_EDGES * 2];
  TRunway runways[MAX_RUNWAYS];
  Agent agents[MAX_AGENTS];
  int nNodes = 0, nEdges = 0, nRunways = 0;
  int activeRw = -1;
  double time = 0;

 private:
  int targetAgents = 0;
  double spawnTimer = 0;
  double playerX = 1e9, playerY = 1e9, playerHdg = 0, playerSpeed = 0, playerAgl = 0;
  int playerRunway = -1;
  Rng rng;
  int nextCallsign = 1;

  bool runwayFree(int rw, int except) const;
  double runwayAlong(int rw, int dir, double x, double y, double* lateral) const;
  void runwayPoint(int rw, int dir, double along, double& x, double& y, double& z) const;
  void followPath(Agent& a, double dt, double cruise);
  bool blockedAhead(const Agent& a, double range) const;
  int pickGate();
  int pickExit(const Agent& a) const;
  void exportState();
};

const AgentType& agentType(int t);

}  // namespace osk
