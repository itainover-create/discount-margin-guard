# OPEN SKY — World Flight Simulator · Design specification (v1)

ORION GAMES · developed by **Alon Novitarger** · *Where vision becomes reality*

## 1. Vision

A living, open world built from the real Earth. The player picks a place on a globe,
chooses an aircraft, starts at a gate, on a runway or in the air, and flies freely:
engine start, taxi with ATC, takeoff, free flight, landing elsewhere, debrief. The
inspiration taken from open-world games is the freedom, the detail of the world, the
cameras and the sense of a city that lives — with an original identity, original code
and original or properly licensed assets.

Two ways to play:

| Mode | What it means (implemented in the C++ core, not just UI) |
|---|---|
| **Accessible** | Auto-rudder (coordination + ground heading hold), stall protection (α-limiter), attitude hold when the stick is centred (auto-trim), auto-mixture, perfect gyros, easy engine start, 1.6–1.7× crash tolerance, wider nose-wheel steering, one-key auto-start that runs the real switch sequence. |
| **Simulation** | No assists. Engine priming, mixture/altitude, flooding, starter on battery voltage, alternator, battery discharge, vacuum-driven gyros (spin-up, tumbling), heading-indicator drift, magnetic compass, flap over-speed damage, harder crash thresholds, radio needs avionics power. |

## 2. Engine and architecture (why this stack)

The development environment for this delivery is a cloud Linux container with **no GPU
and no display**. A native engine build (Unreal/Unity/custom OpenGL) could not be run or
tested here, and could not be handed to the player as a runnable build. The chosen stack
makes every stage *runnable and testable*:

* **Simulation core in C++17** (`core/`): flight dynamics, engine, electrical, fuel,
  landing gear, instruments, assists, autopilot, runway authority, taxi pathfinding and
  AI traffic. Compiled **natively** for calibration tests and to **WebAssembly**
  (clang + wasm-ld, freestanding — no libc) for the game. A `wasm2js` build of the same
  code is a fallback when a host blocks WebAssembly (results are bit-identical; ~12× slower,
  still < 0.2 ms per frame). The core is portable to a future native engine unchanged.
* **Renderer and game in the browser** (`web/`): WebGL 2 via three.js r170, custom
  shaders (terrain land-class shading, procedural building facades with night windows,
  runway markings, light points incl. per-viewer PAPI colours), logarithmic depth for a
  5 cm–400 km depth range, floating origin.
* **Data pipeline in Python** (`tools/`): reads Overture Maps GeoParquet straight from S3
  with HTTP range requests, OurAirports, Natural Earth and AWS terrain tiles, and bakes
  compact region packs.

Limitations stated plainly: visual quality is bounded by what a browser + WebGL 2 can do
(no hardware ray tracing, no photogrammetry); performance could only be measured with a
CPU rasteriser (SwiftShader) here, so the GPU frame-rate targets are design targets until
measured on the reference PC (Settings → Run benchmark measures them on the player's
machine).

```
web/js
 ├─ core/        core.js (wasm loader + fallback), layout.js (generated from api.h)
 ├─ world/       geo (frames), terrain (provider + LOD), region (tile streaming),
 │               city (buildings/roads/trees), airport, landmarks, sky, weather,
 │               lights, shaders, world (orchestrator, ground queries, rebase)
 ├─ aircraft/    models (Skylark T1 + AI types), cockpit (interactive), instruments
 ├─ sim/         player (core binding), atc, traffic (AI + vehicles), missions (+scoring)
 ├─ camera/      cameras (6 views)      input/  input (kbd/mouse/gamepad/joystick)
 ├─ audio/       audio (synthesised)    ui/     hud, menu, globe
 └─ main.js      game loop, flight setup, cockpit interaction, guidance, saves
```

### Frames and coordinates
* Physics: NED inside the core, ENU at the API (x east, y north, z = MSL). Body FRD.
* World: a `GeoFrame` (local equirectangular projection, identical in Python and JS).
  Converting between two frames is an exact affine map, so the origin is **rebased**
  every ~22 km (floating origin) and region data, terrain, airports and the aircraft stay
  consistent anywhere on Earth. Earth curvature is applied in the vertex shaders relative
  to the camera (correct horizon/ocean drop).

## 3. The first region: New York (detailed)

* **Bounds:** 40.48°N–40.92°N, 74.28°W–73.68°W (≈ 49 km × 51 km): Manhattan, Brooklyn,
  Queens, Staten Island, the Bronx (south), Jersey City/Hoboken/Newark, Jamaica Bay.
* **Airports:** KJFK (detail airport), KLGA and KEWR (map-data layouts).
* **Geographic accuracy:** positions and footprints come from map data in a local
  projection (sub-metre to a few metres, depending on the source); building heights are
  measured for 94 % of 1.75 M buildings; terrain from USGS-derived elevation tiles
  (~15 m grid, 1 m vertical); coastline from vector water polygons rasterised at 7 m.
* **Hand-built (approximate):** Statue of Liberty, towers and cables of the Verrazzano,
  George Washington, Brooklyn, Manhattan and Williamsburg bridges (decks follow the real
  road geometry).

Other real places (regional tier): Tel Aviv / Ben Gurion (coastal), Honolulu (volcanic
island), Innsbruck (Alpine valley), Las Vegas (desert), Saba (tiny island, 400 m runway).
Everywhere else: global tier (real runways, streamed terrain, generic surroundings).
See `DATA_SOURCES.md` for the per-place breakdown.

## 4. Fleet (modular)

`AircraftDef` (C++) carries aerodynamics, flaps, mass/inertia, fuel, powerplant,
electrical, limits, contact points, eye point and steering — each aircraft has its own
flight model, not a re-skin. v1 ships **Skylark T1**, an original 180 hp four-seat high-wing
trainer calibrated to the C172S performance class (46 automated checks, see
`FLIGHT_MODEL.md`). The roadmap adds a 737-class twinjet and an F-16-class fighter (with a
fly-by-wire control law already reserved in the definition), then business and cargo
aircraft. Real names, logos and liveries are used only with rights.

## 5. Cockpit & cameras

Cockpit with readable instruments (ASI, attitude, altimeter with Kollsman, turn
coordinator + ball, heading indicator with bug, VSI, tachometer, fuel L/R, oil T/P, EGT/fuel
flow, suction/volts, ammeter/trim), annunciators, wet compass, COM/XPDR/AP display, and
interactive controls: 10 rocker switches, ignition key (OFF-R-L-BOTH-START), throttle and
mixture (drag/scroll), flap lever (detents), trim wheel, fuel selector, parking brake, AP
buttons and knobs. Cameras: cockpit (free look, zoom, head motion), chase (orbit/zoom),
wing, tower (auto-zoom), fly-by and free cinematic; cameras never go below terrain.

## 6. ATC

Menu + text in English aviation phraseology, each message with a Hebrew explanation;
optional browser speech. Start-up, taxi (A* route over the real taxiway graph with real
taxiway names, drawn as a guide line), ready for departure (hold / line up / cleared
depending on the runway authority), pattern, inbound/straight-in, final, landing
clearance or go-around, touch-and-go, vacate, taxi to parking, MAYDAY. Active runway from
the wind. Violations (runway incursion, takeoff/landing without clearance) are detected
and scored. AI aircraft use the same runway authority, so ATC answers reflect real traffic.

## 7. Living world

AI airliners/regionals/wide-bodies/light aircraft push back, taxi, hold, line up, take
off, fly out, arrive on a 3° path, roll out, vacate at real exits and taxi to gates;
runway use is arbitrated (no conflicting use); density is adjustable. Cars and service
vehicles drive on real road geometry near the camera, with lights at night.

## 8. Gameplay

Free flight anywhere; missions: tutorial (guided, bilingual), Liberty Harbour Tour (full
passenger mission), gusty crosswind (Ben Gurion), low visibility (JFK), engine failure after
takeoff (Las Vegas), Saba short field, Innsbruck valley. Scoring: landing (sink rate, g,
centreline, touchdown zone, alignment), speed and altitude discipline, procedures
(clearances, lights, checklists), passenger comfort. Save points (manual + autosave), air
starts, live checklists, pattern rings, GPS route with AP NAV.

## 9. Visuals, sound, controls

Physically-motivated sky (real sun/moon positions), day/night, clouds (layers,
overcast decks, in-cloud whiteout), rain, fog, wet surfaces, city lights. Synthesised audio
(no samples): engine and prop follow rpm/load, starter, wind, tyres, skids, touchdown,
stall horn, flap motor, radio, jets; muffled inside, Doppler outside. Keyboard + mouse,
gamepad, and any joystick/throttle (axis binding, sensitivity, expo, dead zone, inversion).

## 10. Performance target

Reference PC: 6-core desktop CPU, 16 GB RAM, RTX 3060-class GPU, Chrome, 1080p.
Target: 60 fps (High) at JFK/Manhattan; 30 fps (Low) on integrated graphics. Measured
CPU cost of the simulation update is reported in `TEST_REPORT.md`; GPU fps is measured
by the in-game benchmark on the player's PC.
