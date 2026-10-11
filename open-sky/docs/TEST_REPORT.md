# Test report — v2.0 (GLOBAL SKIES: Infinite Horizon)

Two automated suites, both run on this delivery's build:

1. **Native C++ calibration suite** (`cd core && make test`): **227 / 227 pass**
   (48 trainer / traffic checks from v1 + 179 fleet, systems and damage checks).
   Full tables in `FLIGHT_MODEL.md`.
2. **Browser end-to-end suite** (`node tests/flight_e2e.mjs <url> <outdir>`): the real game in
   headless Chromium; scripted test pilots fly through `Game.debugStep` (physics, ATC, runway
   authority, AI and en-route traffic, missions, scoring). **18 / 18 pass, 0 console errors.**

## Graphics / UI pass with threejs-game-skills

* Canvas inspector over 9 fixed scenes, before and after. All pass with 0 console errors.
* Scorecard average went from 1.30 to 1.95; the cockpit-controls category is still below the premium bar.
* Details, metrics and budget tradeoffs: [artifacts/final-evidence.md](../artifacts/final-evidence.md).
* After the pass: native suite 227/227, browser e2e 18/18 (0 console errors).

## Browser end-to-end results (v2 additions)

| # | Scenario | Result | Key numbers |
|---|---|---|---|
| 13 | All 14 aircraft spawn on the JFK runway | PASS | engines running, standing still (< 0.3 m/s), no damage, models and cockpits render |
| 14 | 737-800-class takeoff, simulation mode, scripted pilot | PASS | lift-off 153 KIAS, gear up, flaps up, 1500 ft, no tail strike |
| 15 | A320-class approach and landing: AP V/S + A/T, manual flare, reversers, brakes | PASS | touchdown −282 fpm, 1.17 g, 2.2 m from centreline, 415 m past threshold, landing score 90, ground spoilers fully deployed, roll-out 636 m |
| 16 | Engine fire on departure mission (737-class) | PASS | fire at 800 ft, fire handle → fire out, engine 1 shut down, flight continues on engine 2 to 1500 ft+ |
| 17 | Cruise FL390, A350-class, A/T Mach hold; en-route traffic; radio wheel | PASS | M 0.84 at N1 83 %; 6 en-route airliners (e.g. ZPH374 FL340 YYT → TUL) and 13 TCAS contacts; radio wheel opens with the available calls |
| 18 | Sign in with Google → cloud save → sign-out (Google endpoints mocked) | PASS | userinfo + Drive appDataFolder multipart upload with the bearer token; sign-out revokes the token at Google, clears it from memory; token never written to storage |

Scenarios 1–12 (trainer start, ATC taxi with runway crossing, takeoff clearance, sim-mode
takeoff, two landings incl. gusty crosswind, 15 min of AI traffic with 0 runway conflicts, six
camera views, three performance samples) all still pass — see the appendix.

## Defects found by the v2 tests and fixed
* **FBW pitch response** too slow (half stick gave 1.35 g instead of 1.75 g): the law was
  rewritten with gains normalised to elevator effectiveness and nz feedback (C*).
* **Alpha protection** let a zoom climb reach 18° α: the limit is now relative to the flight
  path, nose-up auto-trim is inhibited inside the protection, and an Airbus-style pitch
  attitude limit was added.
* **Accessible-mode stall protection** for the trainer: v1 passed only because the airframe
  broke up at 5 g. With the damage model the aircraft survives, so the protection now also
  limits load factor and pitch attitude.
* **Altimeter** used the troposphere formula above 11 km (384 ft error at FL450).
* **Autothrottle** slammed to idle on the first step after an air start (previous IAS 0).
* **Latched warnings**: core events were never cleared, so a warning (e.g. the gear horn)
  stayed on; events are now per frame.
* **Ground spoilers** retracted when the reversers were spooled up.
* **Particles** were invisible (logarithmic depth buffer not in the particle shader).
* Fighter planform / stabilator overlap, B-2 colour, flap-lift curves of slatted wings,
  fighter body/vortex lift, A380/B-2 thrust data — all calibration-driven fixes.

## What works / what is missing (v2.0)

**Works**
* 14 aircraft with their own flight models, engines, systems and control laws; glass flight
  decks (PFD, ND with TCAS, EICAS, status/damage page, MCP, overhead, pedestal) and fighter
  HUD/MFDs where every control is a real core input.
* Consequential damage (parts, fires, hydraulics, fuel leaks, electrical blackout, gear
  collapse, belly slides, structural failure from over-g / flutter / building strikes) with
  visual effects and debris.
* Thunderstorms with lightning and distance-delayed thunder, rain on the windshield with
  wipers, sky reflections on glass towers, contrails, en-route traffic, radio wheel.
* Google sign-in with cloud save to the Drive app-data folder (needs the owner's OAuth client
  ID; verified against mocked endpoints).

**Missing / limits**
* No ray tracing or photogrammetric 3D cities in the browser build (WebGL 2); Google
  Photorealistic 3D Tiles would need the owner's API key.
* Los Angeles is not yet built (pipeline ready; next region).
* Cockpits are functional, not complete replicas: no FMS/VNAV, APU, pressurisation, ILS radio.
* Real Google sign-in not exercised end-to-end here (no client ID; the artifact sandbox's CSP
  blocks the Google script).

---

## Appendix — v1.0 report (trainer)

Two automated suites, both run on this delivery's build:

1. **Native C++ calibration suite** (`cd core && make test`): **48 / 48 pass**. Full table in
   `FLIGHT_MODEL.md`.
2. **Browser end-to-end suite** (`node tests/flight_e2e.mjs <url> <outdir>`): runs the real
   game in headless Chromium. Scripted test pilots fly through `Game.debugStep`, the same
   update path the game uses: physics, ATC, runway authority, AI traffic, missions and
   scoring. Result: **12 / 12 pass, 0 console errors**.

## Browser end-to-end results

| # | Scenario | Result | Key numbers |
|---|---|---|---|
| 1 | Engine auto-start at the JFK GA ramp runs the real switch sequence | PASS | catch at ~3 s, idle 1073 rpm, oil 47 psi; battery, alternator, avionics, beacon, nav on; brake set |
| 2 | ATC start-up and taxi clearance with A* over the real JFK taxiway graph | PASS | "runway 22R, taxi via Q5, Q, A, E, EE, hold short of runway 13L" (123 graph nodes) |
| 3 | Scripted taxi to the departure hold, including a **runway crossing** | PASS | stopped at "hold short 13L", crossed on "cross runway 13L" from the runway authority, joined the departure queue behind an AI regional jet; 15 kt max, 0 violations, 0 collisions |
| 4 | Takeoff clearance from the runway authority with live traffic | PASS | cleared after 124 s, once the AI departure ahead had gone |
| 5 | Simulation-mode takeoff from a runway start to 1000 ft AGL | PASS | lift-off 62 KIAS, climb to 1007 ft, no tail strike, no violations |
| 6 | 5 nm final to landing, JFK 22R, accessible mode, wind 240/10 | PASS | touchdown −347 fpm, 1.21 g, 5.0 m from centreline, 688 m past the threshold; landing score 73 |
| 7 | 5 nm final to landing, Ben Gurion 26, **simulation mode, wind 220/22 G32** (crosswind mission) | PASS | touchdown −495 fpm, 1.61 g, 10 m from centreline, crab 3.9°; landing score 50 |
| 8 | AI traffic for 15 simulated minutes at JFK, 16 aircraft | PASS | 2 departures, 2 landings, go-arounds when needed, **0 runway conflicts** |
| 9 | Six camera views (cockpit, chase, wing, tower, fly-by, free) | PASS | screenshots inspected; camera above ground in all views |
| 10–12 | Performance samples (JFK ramp, Manhattan 1500 ft, night final) | PASS | see `PERFORMANCE.md` |

The debrief screen was exercised after both landings (grades, five score categories,
touchdown details, events).

## Defects found by these tests and fixed in this delivery
* **Engine start:** accessible auto-start failed after a few seconds on the ramp. The core's
  fuel-starvation timer ran with the engine stopped. A regression test was added.
* **Taxi crash:** the aircraft was thrown onto a wingtip while taxiing at JFK. The airport
  surface had a 0.18 m step between two runways' elevations. Heights now blend smoothly, and
  the ground normal is sampled over the aircraft's footprint.
* **Slow steps:** the simulation was 50× slower than needed because the cockpit gauges
  redrew on every step.
* **Runway crossings:** ATC gave no crossing clearance, so crossing a runway was always an
  incursion. Implemented hold short, then "cross runway X" from the runway authority.
* **Runway starts:** a runway start flagged an incursion and had the parking brake off. It is
  now cleared to line up and wait, with the brake set.
* **Stale taxi route:** a taxi route left over from the previous airport crashed the minimap.
* **AI traffic:**
  * The scheduler filled every slot with departures, so there were no arrivals.
  * Arrivals could spawn on the player's own final.
  * AI and player aircraft had no collision detection.
* **Air starts:** the requested airspeed was used as groundspeed, so a headwind gave an
  instant flap over-speed.
* **Load factor:** displayed g included raw gear-contact spikes (17 g).
* **Street lights:** every street light had a NaN position and was invisible.
* **Visual defects:**
  * Light sprites rendered as squares.
  * The propeller disc looked like a dark dome from the cockpit.
* **Crosswind mission:** ATC picked the runway into the wind, so there was no crosswind. The
  mission now assigns runway 26.

## What works (verified)
* **Full v1 loop:** choose aircraft and place, cockpit, engine start, ATC, taxi, takeoff, flight,
  landing, debrief. Verified for JFK and Ben Gurion.
* **Flight model and systems:** C++ core in WebAssembly with a JS fallback that gives identical
  results.
* **Modes:** accessible and simulation modes, with assists implemented in the core.
* **World:**
  * Real-world New York with 1.75 M buildings: Manhattan, Lower Manhattan and One WTC,
    bridges, the Statue of Liberty.
  * JFK with real taxiways and names, runway markings and lights, PAPI, approach lights.
  * Five more real regions, and 10,446 flyable airports worldwide.
* **Day and night:** street, window and airport lighting at night, verified in screenshots.
* **ATC:**
  * Start-up, taxi with crossings, takeoff, landing, go-around and vacate.
  * Hebrew explanation on every controller and pilot message.
  * Violation detection.
* **AI traffic:** pushback, taxi with spacing, departures and arrivals with runway arbitration.
  Cars drive on real streets.
* **Missions and scoring:** missions, scoring, debrief, save points and air starts.

## Not verified automatically (implemented, needs a person or real hardware)
* GPU frame rate on real graphics hardware. The container has no GPU; use **Settings → Run
  benchmark** on the reference PC.
* Gamepad and joystick input with physical devices. The mapping, binding UI, dead zone and expo
  code paths exist; no device was available.
* Audio by ear. The WebAudio graph runs, but nobody listened in headless tests.
* Most missions and the tutorial were not played end to end by a script. Covered: the
  crosswind mission flight, and the tutorial's taxi and engine logic through the ground test.
  Not yet scripted: the Liberty tour, low-visibility, engine failure, Saba and Innsbruck
  missions.
* Touch and mobile layout.

## What is missing (not in v1, see ROADMAP.md)
* **Aircraft:** airliner (737-class), fighter (F-16/F-18-class), business and cargo aircraft.
  Fighter-training missions depend on the fighter.
* **Regions:** Los Angeles and the other "in development" cities, which today fly only at the
  global tier.
* **Navigation:**
  * No ILS, VOR or NAV radios; the autopilot NAV mode follows GPS direct-to.
  * No instrument procedures.
  * No approach or departure controller hand-offs.
* **Visuals:**
  * Real-time shadows: only a blob shadow under the aircraft.
  * No satellite imagery.
  * No thunderstorms or icing.
* **Voice ATC:** optional browser speech for ATC messages exists, but there are no recorded or
  neural voices and no speech recognition.
* **Multiplayer.**
* **AI traffic** runs at the departure or arrival airport the ATC is working, not at every
  airport at once.

## How to run the tests
```
cd open-sky/core && make test                       # native, ~5 s
cd open-sky/web && python3 -m http.server 8123 &    # serve the game
node open-sky/tests/flight_e2e.mjs http://localhost:8123/ ./shots   # ~5 min with a GPU-less browser
```
