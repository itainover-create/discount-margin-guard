# Performance

## Reference PC and targets

| | Reference PC | Minimum |
|---|---|---|
| CPU | 6-core desktop (e.g. Ryzen 5 5600 / Core i5-12400) | 4-core laptop |
| GPU | RTX 3060-class (desktop) | Integrated (Iris Xe / Radeon 680M) |
| RAM | 16 GB | 8 GB |
| Browser | Chrome or Edge (current), 1920×1080 | same |
| **Target** | **60 fps on High** at JFK and over Manhattan | **30 fps on Low** |

Measure it on the player's machine: **Settings → Run benchmark** flies a scripted camera
path over Manhattan for 60 s and reports average and 5th-percentile fps, triangles and draw
calls for the selected preset.

## What could be measured in this delivery environment

The development container has **no GPU** (4 vCPU Xeon 2.8 GHz, Chromium with the SwiftShader
CPU rasteriser). GPU frame rates therefore **could not be measured here** and the targets
above are design targets until the benchmark is run on real hardware. What was measured:

### Simulation core (C++)
60 s of flight (14,400 steps at 240 Hz), Node.js on the same container:

| Build | Time for 60 s | Per 60 Hz frame |
|---|---|---|
| WebAssembly | 29 ms | **8 µs** |
| JS fallback (wasm2js) | 269 ms | 75 µs |

### Whole game update per frame (everything except GPU rendering)
Physics, ATC, AI traffic, cars, world streaming, terrain LOD, HUD, audio. Headless Chromium,
`tests/flight_e2e.mjs perf` (40 frames after warm-up):

| Scene | Median | 95th percentile | Triangles | Draw calls |
|---|---|---|---|---|
| JFK GA ramp, day | 4.0 ms | 69 ms | 0.82 M | 243 |
| Manhattan at 1500 ft, day | 4.7 ms | 55 ms | 1.81 M | 147 |
| JFK 5 nm final, night | 2.7 ms | 18 ms | 0.41 M | 118 |

The 95th-percentile spikes are frames in which a new city or terrain tile is built while the
camera moves into new areas. Since this delivery a dense tile is built over three frames
(buildings, then roads and lights, then trees) with a 6 ms budget per frame; before that change
the median was 12–22 ms. Moving tile decoding and geometry building to a Web Worker is the
next step (ROADMAP stage 2).

## Quality presets (`web/js/config.js`)

| Preset | Pixel ratio | Terrain detail | View distance | City detail rings (km) | Trees/tile | AI aircraft | Cars | MSAA |
|---|---|---|---|---|---|---|---|---|
| Low | 0.75 | 0.7 | 45 km | 1.4 / 3.5 / 10 | 600 | 6 | 60 | off |
| Medium | 1.0 | 0.9 | 70 km | 2.0 / 5 / 16 | 1200 | 10 | 120 | on |
| High | 1.0 | 1.1 | 95 km | 2.6 / 6.5 / 24 | 1800 | 14 | 180 | on |
| Ultra | 1.5 | 1.35 | 130 km | 3.2 / 8 / 32 | 2500 | 20 | 220 | on |

AI traffic and car density can also be set separately in Settings.

## How the world stays fast
* **Terrain**: quadtree from zoom 7 to 13, split by screen-space error. Chunks have 96/64/40/24
  vertices per side by depth, with skirts to hide cracks.
* **Cities**: 1 km tiles with four levels:
  * Near: detailed buildings, roads, street lights, trees and towers.
  * Mid: buildings and roads.
  * Far: simplified buildings.
  * Skyline: only tiles with towers above 45 m.

  Tiles load from 8×8 km packs (gzip) and are released when far away.
* **Lights**: all point lights (runway, taxiway, street, obstruction, aircraft) are batched
  per area into one draw call with a custom shader. PAPI colour, flashing and sequenced lights
  are computed on the GPU.
* **Instruments**: the cockpit instrument atlas (2048² canvas) is redrawn only while the cockpit
  is visible, at most 30 times per second and once per rendered frame.
* **Floating origin**: the world origin moves every ~22 km, so precision does not degrade
  far from the start. Logarithmic depth covers a range from 5 cm to 400 km.

## Slow or missing connection
* All six detailed regions, the airport index and the coarse global terrain ship with the game.
  They load from the game's own server, and nothing needs the internet.
* Elsewhere, detailed terrain tiles come from the internet and are stored in the browser's
  Cache Storage, so a place flown once stays available offline.
* Each tile request times out after 8 s. After 3 failures, online loading pauses for 60 s and
  the game uses the coarse global layer, so flying is never blocked. The status line shows the
  current terrain source.
