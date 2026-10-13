# GLOBAL SKIES: Infinite Horizon — execution plan & roadmap

Each stage ends with a runnable build, control instructions, test results and an exact
list of what works and what is missing. Expansion only happens after the previous stage
passes its checks (control, takeoff, landing, cameras, traffic coordination, performance).

## Stage 1 — v1.0 prototype (this delivery)

Complete loop: aircraft choice → cockpit → engine start → taxi → takeoff → flight in the
area → landing → debrief.

| Area | Delivered |
|---|---|
| Core (C++ → WebAssembly) | 6-DOF flight model, engine/prop, electrical, fuel, gear/brakes/steering, flaps/trim, wind/gusts/turbulence, ground effect, stall/spin tendencies, instruments with lags & failures, 2-axis autopilot (ROL/HDG/NAV, VS/ALT), accessible-mode assists, failures; runway authority, A* taxi routing, AI traffic; 46 native calibration checks |
| World | Global flyable base (10,446 airports, streamed terrain + coarse offline layer, floating origin, continuous flight); 6 real regions (NYC detailed; Tel Aviv, Honolulu, Innsbruck, Las Vegas, Saba); landmarks; day/night; clouds, rain, fog, wind |
| Aircraft | Skylark T1 trainer with interactive cockpit and exterior lights |
| Game | ATC (EN + Hebrew explanations), AI traffic, cars/service vehicles, tutorial + 6 missions, scoring/debrief, save points, air starts, checklists, globe/search/route planning, settings, key/axis binding, benchmark |

## Stage 2 — v1.1 polish (next)
* Calibrate against more reference data (climb/cruise tables at more weights/altitudes).
* Proper TrueType-quality cockpit text & night panel lighting dimmer; hi-res cockpit textures.
* Taxiway signage at every intersection; runway distance-remaining signs; ILS antenna & localizer/glideslope (NAV radio, CDI) for instrument approaches.
* Shadows (cascaded shadow maps for the aircraft and nearby buildings), SSAO.
* Voice ATC with recorded or neural voices (licensed), pilot readback via speech recognition (optional).
* More vehicle types on aprons (tugs, fuel trucks, buses) following airport service roads.

## Stage 2.0 — delivered (this release)
| Area | Delivered |
|---|---|
| Fleet | 26 real aircraft types: Cessna 172, Extra 330; Citation CJ4, Phenom 300E, G650, Global 7500; A220-300, E195-E2, 737-800, 737 MAX 8, A320, A321neo, 767-300ER, 787-9, A330-900, A350-900, 777-300ER, 747-400, A380; F-15C, F-16C, F/A-18E, Typhoon, F-22, F-35A, B-2. Real type names shown (original names optional) |
| Core | Turbofans (spool, lapse, TSFC, afterburner, reversers, start sequence), fly-by-wire normal law with protections, gear/spoilers/autothrottle/generators, wave drag; consequential damage model; 227 native checks |
| Client | Hangar, procedural models, glass flight decks / fighter HUD, jet audio + GPWS, damage effects, storms + lightning, windshield rain, glass reflections, radio wheel, en-route traffic + TCAS, 5 new missions, Google sign-in + Drive cloud save; 18 e2e scenarios |

## Stage 3 — next aircraft work (after stage-2 checks stay green)
* **Narrow-body twinjet (737-class, generic name until licensed):** turbofan engine model
  (spool-up lag, N1/N2, EGT, fuel flow vs thrust), swept-wing aerodynamics with Mach effects,
  retractable gear, slats/flaps, spoilers/speed brakes, autothrottle, 3-axis autopilot with
  LNAV/VNAV-lite, glass cockpit (PFD/ND/EICAS), APU, hydraulics, pressurisation.
  Calibration targets: V-speeds by weight, climb gradients, cruise Mach 0.78, landing distances.
* **Fighter (F-16-class, generic name until licensed):** afterburning turbofan,
  relaxed-stability aero with a fly-by-wire g/roll-rate command law (`ControlLaw::FlyByWireG`
  is already reserved), high-α limiter, HUD, ejection/crash model, training missions
  (formation, aerobatics, low-level navigation, carrier-style landing practice on a runway).
* Later: business jet, turboprop cargo aircraft, heavy freighter.

## Stage 4 — Los Angeles + more cities
* LA region (LAX, Santa Monica, Burbank; Downtown, Hollywood hills, port of LA/LB) with the
  same pipeline: `tools/regions.json` entry → `bake_region.py` → `bake_landclass.py` →
  `pack_data.py` → `annotate_tiles.py` → `build_catalog.py`.
* London, Paris, Tokyo, Dubai, Sydney, Rio, Hong Kong, Cape Town; mountain/island sets.

## Stage 5 — global coverage at scale
* Server-side tiling of Overture for the whole planet (vector tiles per zoom level),
  streamed on demand with the same tile format, plus a CDN cache.
* Satellite/aerial imagery layer where licensing allows (e.g. Sentinel-2 cloudless 2016,
  CC BY 4.0) blended with the land-class shading.
* Global building fill policy: real footprints where mapped; where data is missing, fill
  only with locally-styled generic blocks inside built-up land cover — clearly labelled.

## Stage 6 — multiplayer (evaluation)
Shared world sessions, ATC-aware traffic of other players, spectator/instructor mode.

## Tooling commands
```
cd core && make test        # native calibration tests (46 checks)
cd core && make wasm js     # rebuild WebAssembly + JS fallback
cd core && make layout      # regenerate web/js/core/layout.js from api.h
python3 tools/build_airports.py            # global airport index
python3 tools/build_global_dem.py          # coarse global terrain layer
python3 tools/bake_region.py <id>          # bake one region (see tools/regions.json)
python3 tools/bake_landclass.py <id>       # land-class raster
python3 tools/pack_data.py && python3 tools/annotate_tiles.py && python3 tools/build_catalog.py
node tests/flight_e2e.mjs http://localhost:8123/ ./shots   # browser flight tests
```
