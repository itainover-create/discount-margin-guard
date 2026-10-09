# Data sources, licences and accuracy

## Sources

| Data | Source | Licence / terms | Used for |
|---|---|---|---|
| Buildings & building parts (footprints, heights, floors, roof shape/colour) | Overture Maps Foundation release 2026-09-23.1 (mostly OpenStreetMap, plus other sources listed per feature) | ODbL (OSM-derived), CDLA-Permissive-2.0 (others) — attribution: © OpenStreetMap contributors, Overture Maps Foundation | City geometry |
| Roads, rail, bridges flags | Overture transportation/segment (OSM) | ODbL | Road ribbons, bridges, street lights, vehicles |
| Water, land, land use | Overture base theme (OSM) | ODbL | Coastline, rivers, parks, land-class shading |
| Land cover | Overture base/land_cover (ESA WorldCover 10 m) | CC BY 4.0 (ESA) | Background land classes |
| Airport infrastructure (taxiways with names, aprons, gates, helipads) | Overture base/infrastructure (OSM aeroway) | ODbL | Airport layout, taxi graph, gates |
| Airports & runways (position, ends, heading, length, width, elevation, displaced thresholds, lighting) | OurAirports (ourairports.com/data) | Public domain | Global airport index, runways everywhere |
| Elevation | Terrain Tiles on AWS (Tilezen; SRTM, USGS 3DEP/NED, GMTED2010, ETOPO1, others) | Per source; attribution required | Terrain everywhere (bundled for regions, streamed online elsewhere) |
| Coastlines / lakes for the offline global layer | Natural Earth 1:10m | Public domain | Global coarse land/water mask |

Attribution is shown in the game (About & Data). Bundled region data is a derived
database of OSM data and remains under the ODbL.

## Real vs reconstructed — per place

| Place | Real (from data) | Estimated / reconstructed |
|---|---|---|
| **New York (tier A)** 40.48–40.92°N, 74.28–73.68°W | 1,750,970 building footprints, **94 %** with measured heights (NYC 3D building data in OSM) incl. multi-part landmarks (One WTC spire, Empire State setbacks + antenna, Chrysler crown); 263,628 road segments, 6,320 rail; 71,989 mapped trees; coastline, rivers, parks, land use; terrain (USGS-derived, ~15 m grid); JFK/LGA/EWR runways (OurAirports) and taxiways/aprons/gates (OSM) | Heights for ~6 % of buildings (from footprint/type); building colours & window patterns (style palette); roofs (flat unless tagged); Statue of Liberty model and suspension-bridge towers/cables (public dimensions, approximate positions); JFK/LGA control-tower positions (approximate); tree positions inside parks/forests (scattered) |
| **Tel Aviv / Ben Gurion (tier B)** | 219,575 footprints, 6 % measured heights; 86,997 roads; coastline, Yarkon river, land use; LLBG layout | 94 % of heights estimated (OSM in Israel rarely tags heights) |
| **Honolulu (tier B)** | 154,895 footprints (63 % measured); roads; reef & coast; Ko'olau terrain; PHNL layout incl. reef runway | rest of heights |
| **Innsbruck (tier B)** | 57,944 footprints (13 % measured); Alpine terrain; LOWI runway & taxiways | most heights; gabled roofs assumed for small houses (regional style) |
| **Las Vegas (tier B)** | 470,830 footprints (88 % measured, incl. Strip resorts); roads; KLAS layout | rest of heights; resort facades are generic (no logos) |
| **Saba (tier B)** | 1,482 footprints; terrain; TNCS 400 m runway | almost all heights estimated |
| **Global tier** (10,446 airports) | Runway positions, headings, lengths, widths, elevations; terrain from online tiles (cached) or the 1/11° offline layer; coastlines | Taxiways, apron, terminal, hangar and tower are generic; no city buildings; ground shading by latitude/elevation (no land-cover data); magnetic variation estimated from runway numbers (±5°) |

## Accuracy notes
* Projection: local equirectangular per region (same math in the baker and the client);
  errors < 0.5 % in scale across a region, exact affine re-projection on origin rebase.
* Terrain vertical precision: 1 m in bundled tiles (fraction channel dropped to shrink
  files 5×); bundled zoom 13 (~15 m at NYC), 11 around, 8 to ~200 km.
* Coastlines are sharpened by the water polygons (7 m raster for NYC, 4 m for smaller regions).
* "All buildings in the world" is not promised: only mapped footprints are shown; missing
  data is not replaced by random cities.
