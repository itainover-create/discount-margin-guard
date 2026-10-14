# Graphics and UI pass with threejs-game-skills: evidence

Skill pack: [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills) (MIT).
Loaded and followed:
- `threejs-game-director` (SKILL.md, evidence-manifest.md)
- `threejs-aaa-graphics-builder` (SKILL.md, visual-scorecard.md, authoring-recipes.md, technical-art.md, shader-cookbook.md)
- `threejs-qa-release` (SKILL.md and its canvas inspector)

Not used:
- The 3D, image and audio generators. Those need paid API keys (Tripo, Gemini, ElevenLabs), and all assets here stay procedural.
- The pack's Vite scaffold. The game already has its own structure.

Before/after contact sheet: [previews/before-after.jpg](previews/before-after.jpg). Single shots are in `previews/`.

## How it was measured

- **Inspector.** `tests/qa/inspect-threejs-canvas.mjs` is a project copy of the pack's inspector, run through `tests/qa/run-inspect.sh`.
  - It adds dependency paths, SwiftShader launch flags and a longer preparation timeout. Each scene streams a whole city before capture.
- **Test hooks.** `web/js/qa/hooks.js` installs `window.__THREE_GAME_TEST_HOOKS__` and `window.__THREE_GAME_DIAGNOSTICS__`.
  - They are active only under `navigator.webdriver` or with `?qa` in the URL.
  - Each of the 8 flight states starts a real flight through `startFlight`, places the camera and runs the simulation a few seconds before freezing.
- **Runs.**
  - Baseline: `artifacts/evidence-baseline.json` and `evidence-baseline-rest.json`.
  - After: `artifacts/evidence.json` (run `pass2`, all 9 scenes) and `artifacts/evidence-pass2d.json`.
    - pass2d recaptures the storm cockpit after the last rain-overlay fix.
- **Results.**
  - All captures pass with 0 console errors and 0 page errors.
  - `check_evidence.py --manifest artifacts/evidence.json`: see the result at the bottom.
- **Renderer.** Rendering was software (SwiftShader) in this container. Pixel metrics and renderer counts are valid. FPS and frame times are not.

## Scorecard (genre mapping for a flight simulator)

The categories map to the flight sim like this:
- **Hero:** the player aircraft and its flight deck.
- **Obstacles:** terrain, city, weather and traffic.
- **Interactables:** cockpit controls, runway and approach guidance, missions.

| Category | Before | After | Evidence |
|---|---|---|---|
| Art direction | 1.5 | 2.0 | ORION gold rule and labels run through the HUD strip, chips, minimap ring and featured cards. Materials take their colour from the live sky. |
| Hero / aircraft | 1.5 | 2.0 | Clearcoat paint reflects the sky through PMREM image-based light. Airliners have a panel-seam bump map; fighters a satin finish and titanium nozzles. Sun self-shadowing. At night, lit cabin windows and a logo light on the fin. Three-quarter chase framing. |
| Obstacles / weather | 1.5 | 2.0 | Cumulus puffs are shaded as spheres toward the sun, with flat bases and a silver lining. Storm, smoke and the city skyline all read clearly. |
| Interactables / cockpit | 1.0 | 1.5 | Textured panels with fasteners, a rounded glareshield, display bezels and cabin lining. Shaped thrust, flap and speed-brake levers and T-handle fire handles. Rain stays on the windows only. Many controls are still simple primitives. |
| World | 2.0 | 2.0 | Dense Manhattan, JFK, water. Clouds improved. The region-edge seam remains. |
| Materials | 1.5 | 2.0 | One role-based material kit (paint, metal, rubber, dark, glass) for the player and AI aircraft. Weathered runway paint and tyre streaks. |
| Lighting / render | 1.0 | 2.0 | ACES tone mapping for PBR objects. Live-sky IBL, sun shadows and city sky glow at night. Night contrast 21.5 → 43.5, entropy 1.62 → 2.48. |
| VFX / motion | 1.5 | 2.0 | Smoke billows, greys and thins with age (was a solid black tube). Rain beads and wipers are clipped to the window openings. Contrails and fire. |
| UI / HUD | 1.0 | 2.0 | A flight strip (IAS, ALT, V/S) replaces the stat card, with state and alert chips. In the cockpit view the strip and minimap are hidden. The minimap has real land and water. Diagnostics moved to F3. The boot card names the right aircraft. Featured flights on the home tab. |
| Performance evidence | 1.0 | 2.0 | Renderer counts for every scene and over-budget rows with their tradeoffs (below). Native and e2e regression suites run. |
| **Average** | **1.30** | **1.95** | |

Verdict against the pack's premium bar (every category at least 2, average at least 2.3): **not met.**
- The cockpit-controls category is at 1.5.
- The automatic failures seen in the baseline are fixed:
  - the stat-card HUD;
  - the UI covering the instrument panel in cockpit view;
  - smoke standing in for geometry.
- Next pass to reach premium:
  - authored cockpit controls (switch guards, knurled knobs) and merged cockpit meshes;
  - a reshaped F-22 intake and fuselage;
  - blending the detailed region's edge into the global terrain.

## Measured metrics (inspector, desktop 1280×720)

| Scene | Entropy before → after | Edges | Contrast | Draw calls | Triangles |
|---|---|---|---|---|---|
| menu | 3.35 → 3.85 | 0.109 → 0.206 | 49 → 135 | – | – |
| jfk-runway-738 | 4.52 → 4.88 | 0.389 → 0.386 | 187 → 172 | 424 → 823 | 1.67 M → 2.60 M |
| hudson-a320 | 5.48 → 5.83 | 0.231 → 0.360 | 156 → 124 | 181 → 301 | 2.33 M → 2.60 M |
| a320-cockpit-final | 4.32 → 4.79 | 0.203 → 0.234 | 165 → 160 | 1856 → 1849 | 4.65 M → 4.65 M |
| storm-cockpit (pass2d) | 3.85 → 4.05 | 0.197 → 0.207 | 213 → 218 | 2390 → 2219 | 4.23 M → 4.25 M |
| f22-manhattan | 5.80 → 6.07 | 0.404 → 0.451 | 178 → 144 | 1215 → 402 | 3.17 M → 2.99 M |
| engine-fire-738 | 6.07 → 6.45 | 0.467 → 0.510 | 189 → 166 | 277 → 528 | 3.67 M → 3.57 M |
| night-manhattan | 1.62 → 2.48 | 0.114 → 0.126 | 21.5 → 43.5 | 309 → 277 | 2.76 M → 2.95 M |
| cruise-a350 | 3.73 → 3.79 | 0.134 → 0.098 | 161 → 158 | 96 → 97 | 42 k → 46 k |

### Budget tradeoffs (documented overruns)

- **Triangles (2.6–4.6 M against a 0.75 M starting budget).**
  - The streamed city uses about 34,000 real building footprints over Manhattan. The game exists to show that city.
  - The Low and Medium quality presets shrink the near, mid and far rings.
- **Draw calls (300–2,400).**
  - Each city tile has its own building, road, tree and light batches.
  - In the cockpit, the many individual control meshes add calls.
  - The sun shadow pass adds about one call per aircraft part on High and Ultra quality. Low quality disables it.
  - Next steps: merge each tile's batches, merge static cockpit meshes, and use texture atlases for labels.
- **Counts vary between runs.** They change with the streaming state at the moment of capture. For example, the baseline F-22 shot caught extra LOD tiles mid-switch.
- **Settings.**
  - Shadow map size: 2048 on High and Ultra, 1024 on Medium, off on Low.
  - DPR cap: 2.
  - No post-processing passes.
  - Image-based light uses one 128-pixel PMREM bake, redone only when the sun or sky changes, at most every 2 s.

## Regression

- **Native C++ core:** `make test` passes 227/227.
- **Browser e2e:** `tests/flight_e2e.mjs` passes 18/18 with 0 console errors, including all six camera views, the fleet, the Google account flow and performance samples.

## v2.1 follow-up pass (run `pass3`, 11 scenes)

What changed:
- Poster emblem, ORION wordmark and signature artwork.
- 26 aircraft.
- Los Angeles region.
- Flight dock.
- Landmark crowns.
- Suburb fade around regions.
- Far-start recentring.

`artifacts/evidence.json` now declares 11 desktop scenes, adding `la-downtown` and `cockpit-cj4`. All 11 pass with 0 console errors and 0 page errors, and `check_evidence.py` confirms 11 artifacts.
- `la-downtown` (dusk over Los Angeles): entropy 4.17, edges 0.30, contrast 55.8. It is over the draw-call (1,585) and triangle (2.45 M) budgets for the same reason as New York: the streamed city.
- `cockpit-cj4`: entropy 5.22, contrast 173.4.

Regression:
- Native suite 368/368. The 141 new checks cover the 12 new aircraft types.
- Browser e2e 18/18 with 0 console errors, including "all 26 aircraft spawn on the runway".

Previews: `previews/v21-la-downtown.jpg`, `previews/v21-cockpit-cj4.jpg`, `previews/v21-menu.jpg`.

## v2.2 performance and bloom pass (run `pass4`, 11 scenes)

Skill pack: [alton47/threejs-skills](https://github.com/alton47/threejs-skills) (MIT).
- **Used:** `threejs-performance` (and PROFILING.md), `threejs-postprocessing`, `threejs-lighting` (SHADOWS.md), `threejs-core`, `threejs-materials`.
- **Not used:**
  - physics: the flight model is the C++ core;
  - React / R3F;
  - XR: not testable without a headset;
  - audio: the game already has a Web Audio engine.

The pass started by measuring which parts of the scene cost draw calls (toggling each part and reading `renderer.info`). In the A320 cockpit on final, airports were 1,305 of 1,850 calls. Airport signs were one 6-group box each; JFK alone had 147 signs, which is 882 calls.

What changed:
- **Airport signs, designators, hold-short lines:** canvas atlas plus baked geometry, 2–3 calls per airport.
- **City:** far-LOD buildings and roads merged per 4×4 km block, with a per-tile fallback while a block rebuilds.
- **AI airliners:** static parts merged per material (21 → 6 meshes).
- **Cockpit:** static parts merged per material. Animated and clickable parts, and every runtime-mutated material, are kept separate.
- **Bloom:** on the finished frame, display-referred, so the tuned tone mapping is unchanged.
- **Shaders:** `compileAsync` precompiles them during loading.
- **Shadows:** `normalBias` added.

| Scene | Draw calls pass3 → pass4 | Triangles | Budget (300 calls) |
|---|---|---|---|
| jfk-runway-738 | 823 → 255 | 2.69 M | calls ok |
| hudson-a320 | 301 → 238 | 2.74 M | calls ok |
| a320-cockpit-final | 1849 → 352 | 4.71 M | over (calls 352) |
| storm-cockpit | 2219 → 356 | 4.29 M | over (calls 356) |
| f22-manhattan | 402 → 285 | 3.16 M | calls ok |
| engine-fire-738 | 528 → 239 | 3.66 M | calls ok |
| night-manhattan | 277 → 246 | 3.03 M | calls ok |
| cruise-a350 | 97 → 83 | 0.04 M | ok |
| la-downtown | 1585 → 256 | 2.39 M | calls ok |
| cockpit-cj4 | – → 334 | 2.62 M | over (calls 334) |

The pass4 counts include the 11 bloom passes.

Results:
- All 11 captures pass with 0 console errors and 0 page errors. `check_evidence.py` confirms 11 artifacts.
- Triangles stay over the 0.75 M starting budget. This is the streamed real-building city, the same documented tradeoff as before.
- The three cockpit scenes are 11–19 % over the call budget.
- Night: entropy 2.48 → 2.75 and edge density 0.126 → 0.155. Nav lights, beacon and lit fan glow; daylight frames without the sun in view are unchanged (mean pixel difference 0.0).

Regression after the pass:
- Native suite 368/368.
- Browser e2e 18/18 with 0 console errors.

Previews: `previews/v22-night-manhattan.jpg`, `previews/v22-jfk-runway-738.jpg`.
