# Test report — v1.0 prototype

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
