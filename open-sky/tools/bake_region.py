"""Bakes one real-world region for OPEN SKY.

    python3 bake_region.py nyc [--skip-terrain] [--skip-features]

Inputs : Overture Maps (buildings, building parts, roads/rail, water, land,
         land cover, land use, infrastructure), OurAirports, AWS Terrain
         Tiles (Terrarium). See docs/DATA_SOURCES.md for licences.
Outputs: web/data/regions/<id>/manifest.json
         web/data/regions/<id>/tiles/<tx>_<ty>.bin.gz   (1 km tiles)
         web/data/regions/<id>/airports/<ICAO>.json
         web/data/terrain/<z>/<x>/<y>.png               (shared DEM tiles)

Coordinates in tiles/airports are metres in the region frame: a local
equirectangular projection around the anchor airport (x east, y north),
identical to GeoFrame in web/js/world/geo.js."""
import gzip
import io
import json
import math
import os
import struct
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests
import shapely
from shapely import wkb
from shapely.geometry import LineString, MultiLineString, Point, Polygon, box, mapping
from shapely.ops import unary_union, linemerge

import overture as ov

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "web", "data")
R_EARTH = 6371008.8
TILE = 1000.0
Q = 0.25  # vertex quantisation (m)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ---------------------------------------------------------------------------
# Projection (must match web/js/world/geo.js)
# ---------------------------------------------------------------------------
class Proj:
    def __init__(self, lat0, lon0):
        self.lat0, self.lon0 = lat0, lon0
        self.kx = R_EARTH * math.cos(math.radians(lat0)) * math.pi / 180
        self.ky = R_EARTH * math.pi / 180

    def xy(self, lon, lat):
        return ((lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky)

    def geom(self, g):
        return shapely.transform(g, lambda c: np.column_stack(((c[:, 0] - self.lon0) * self.kx, (c[:, 1] - self.lat0) * self.ky)))


# ---------------------------------------------------------------------------
# Class codes (mirrored in web/js/world/classes.js)
# ---------------------------------------------------------------------------
ROAD = {"motorway": 1, "trunk": 2, "primary": 3, "secondary": 4, "tertiary": 5, "residential": 6, "unclassified": 6,
        "living_street": 6, "service": 7, "pedestrian": 8, "track": 9, "unknown": 7}
RAIL = {"standard_gauge": 20, "rail": 20, "narrow_gauge": 20, "subway": 21, "light_rail": 22, "monorail": 22,
        "funicular": 22, "tram": 23, "unknown": 20}
BLD_SUB = {"residential": 1, "commercial": 2, "industrial": 3, "civic": 4, "religious": 5, "education": 6,
           "transportation": 7, "medical": 8, "entertainment": 9, "agricultural": 10, "outbuilding": 11,
           "service": 12, "military": 13}
ROOF = {"flat": 0, "gabled": 1, "hipped": 2, "half_hipped": 2, "pyramidal": 3, "dome": 4, "onion": 4, "round": 4,
        "skillion": 5, "gambrel": 1, "mansard": 2, "saltbox": 1}
# polygon layer codes for the surface splat map
WATER = {"ocean": 1, "sea": 1, "bay": 1, "strait": 1, "lagoon": 1, "lake": 2, "pond": 2, "reservoir": 2, "basin": 2,
         "water": 2, "dock": 2, "wastewater": 2, "oxbow": 2, "river": 3, "canal": 3, "stream": 3, "fish_pass": 3,
         "swimming_pool": 4, "reflecting_pool": 4, "fountain": 4}
LANDCOVER = {"urban": 10, "forest": 20, "shrub": 21, "grass": 22, "crop": 30, "barren": 41, "snow": 43,
             "wetland": 44, "mangrove": 45, "moss": 22}
LANDUSE = {"residential": 11, "commercial": 12, "retail": 12, "industrial": 13, "brownfield": 60, "construction": 60,
           "greenfield": 22, "park": 23, "dog_park": 23, "garden": 23, "village_green": 23, "grass": 22, "meadow": 22,
           "golf_course": 24, "fairway": 24, "rough": 24, "tee": 25, "green": 25, "bunker": 40, "driving_range": 24,
           "cemetery": 26, "grave_yard": 26, "pitch": 27, "playground": 27, "track": 27, "stadium": 27,
           "recreation_ground": 23, "farmland": 30, "farmyard": 30, "orchard": 31, "vineyard": 31, "allotments": 31,
           "plant_nursery": 31, "quarry": 61, "landfill": 62, "railway": 63, "aerodrome": 50, "military": 13,
           "nature_reserve": 20, "beach": 40, "school": 12, "university": 12, "college": 12, "hospital": 12,
           "religious": 11, "parking": 52, "water_hazard": 2}
LAND = {"forest": 20, "wood": 20, "shrub": 21, "scrub": 21, "heath": 21, "grass": 22, "grassland": 22, "meadow": 22,
        "sand": 40, "beach": 40, "dune": 40, "bare_rock": 41, "rock": 41, "stone": 41, "scree": 42, "shingle": 42,
        "glacier": 43, "wetland": 44, "marsh": 44, "swamp": 44, "mangrove": 45, "reef": 46}
INFRA_POLY = {"apron": 51, "helipad": 51, "parking": 52, "pier": 53, "runway": 51, "taxiway": 51}
PT_TREE, PT_POWER_TOWER, PT_COMM_TOWER, PT_WIND, PT_LIGHTHOUSE = 1, 2, 3, 4, 5


# ---------------------------------------------------------------------------
# Feature fetch
# ---------------------------------------------------------------------------
def fetch(theme, typ, bbox, cols):
    w, s, e, n = bbox
    out = []
    for t in ov.read_bbox(theme, typ, bbox, cols, log=log):
        d = t.to_pydict()
        for i in range(t.num_rows):
            b = d["bbox"][i]
            if b["xmax"] < w or b["xmin"] > e or b["ymax"] < s or b["ymin"] > n:
                continue
            out.append({k: d[k][i] for k in d})
    log(f"{theme}/{typ}: {len(out)} features")
    return out


def tags(f):
    return dict(f.get("source_tags") or [])


def name_of(f):
    n = f.get("names")
    return (n or {}).get("primary") if isinstance(n, dict) else None


# ---------------------------------------------------------------------------
# Binary tile encoding
# ---------------------------------------------------------------------------
def qpt(x, y, ox, oy):
    return (max(-32767, min(32767, int(round((x - ox) / Q)))), max(-32767, min(32767, int(round((y - oy) / Q)))))


def ring_coords(ring, ox, oy):
    cs = list(ring.coords)
    if len(cs) > 1 and cs[0] == cs[-1]:
        cs = cs[:-1]
    out, last = [], None
    for x, y in cs:
        p = qpt(x, y, ox, oy)
        if p != last:
            out.append(p)
            last = p
    return out


def enc_polys(polys, ox, oy, header_fn):
    """polys: list of (Polygon, header_bytes)."""
    buf = io.BytesIO()
    n = 0
    for poly, hdr in polys:
        rings = [poly.exterior] + list(poly.interiors)
        rr = [ring_coords(r, ox, oy) for r in rings]
        rr = [r for r in rr if len(r) >= 3][:255]
        if not rr or len(rr[0]) < 3:
            continue
        buf.write(hdr)
        buf.write(struct.pack("<B", len(rr)))
        for r in rr:
            r = r[:65535]
            buf.write(struct.pack("<H", len(r)))
            buf.write(struct.pack(f"<{len(r) * 2}h", *[v for p in r for v in p]))
        n += 1
    return struct.pack("<I", n) + buf.getvalue()


def enc_lines(lines, ox, oy):
    buf = io.BytesIO()
    n = 0
    for line, cls, flags, level in lines:
        pts = ring_coords(line, ox, oy) if line.coords[0] != line.coords[-1] else ring_coords(line, ox, oy) + [qpt(*line.coords[0], ox, oy)]
        if len(pts) < 2:
            continue
        pts = pts[:65535]
        buf.write(struct.pack("<BBbBH", cls, flags, level, 0, len(pts)))
        buf.write(struct.pack(f"<{len(pts) * 2}h", *[v for p in pts for v in p]))
        n += 1
    return struct.pack("<I", n) + buf.getvalue()


def enc_points(pts, ox, oy):
    buf = io.BytesIO()
    for kind, x, y, h in pts:
        qx, qy = qpt(x, y, ox, oy)
        buf.write(struct.pack("<BBhhH", kind, 0, qx, qy, max(0, min(65535, int(h * 10)))))
    return struct.pack("<I", len(pts)) + buf.getvalue()


def section(kind, payload):
    return struct.pack("<BBBBI", kind, 0, 0, 0, len(payload)) + payload


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def polys_of(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    if g.geom_type in ("MultiPolygon", "GeometryCollection"):
        return [p for p in g.geoms if p.geom_type == "Polygon" and not p.is_empty]
    return []


def lines_of(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "LineString":
        return [g]
    if g.geom_type in ("MultiLineString", "GeometryCollection"):
        return [p for p in g.geoms if p.geom_type == "LineString"]
    return []


def flag_fraction(rules, flag):
    """Fraction of a segment covered by a road flag (Overture 'between' rules)."""
    tot = 0.0
    for r in rules or []:
        if flag in (r.get("values") or []):
            b = r.get("between")
            tot += (b[1] - b[0]) if b else 1.0
    return tot


def stable_hash(s):
    h = 2166136261
    for ch in s.encode():
        h = ((h ^ ch) * 16777619) & 0xFFFFFFFF
    return h


def parse_color(c):
    if not c:
        return 0
    c = c.strip().lower()
    named = {"white": "ffffff", "black": "202020", "grey": "8a8a8a", "gray": "8a8a8a", "red": "9a3b2e", "brown": "6b4a32",
             "beige": "d8c8a8", "yellow": "d8c070", "blue": "4a6a9a", "green": "5a7a4a", "silver": "b8bcc0",
             "orange": "c87a3a", "tan": "c8b088", "cream": "e8dcc0", "maroon": "6a2a2a", "pink": "d8a0a0"}
    c = named.get(c, c).lstrip("#")
    try:
        if len(c) == 3:
            c = "".join(ch * 2 for ch in c)
        if len(c) != 6:
            return 0
        return (int(c, 16) << 8) | 0xFF
    except ValueError:
        return 0


# ---------------------------------------------------------------------------
# Terrain tiles
# ---------------------------------------------------------------------------
def tile_range(bbox, z):
    w, s, e, n = bbox
    def tx(lon):
        return int((lon + 180) / 360 * (1 << z))
    def ty(lat):
        r = math.radians(lat)
        return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * (1 << z))
    return range(tx(w), tx(e) + 1), range(ty(n), ty(s) + 1)


def fetch_terrain(bbox, zooms):
    """zooms: list of (zoom, bbox). Saves Terrarium tiles with the fractional
    channel zeroed (1 m precision) — decodable by the standard decoder."""
    from PIL import Image
    jobs = []
    for z, bb in zooms:
        xs, ys = tile_range(bb, z)
        jobs += [(z, x, y) for x in xs for y in ys]

    def get(job):
        z, x, y = job
        path = os.path.join(DATA, "terrain", str(z), str(x), f"{y}.png")
        if os.path.exists(path):
            return os.path.getsize(path)
        for attempt in range(4):
            try:
                r = requests.get(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", timeout=60)
                r.raise_for_status()
                break
            except Exception:
                time.sleep(2 ** attempt)
        a = np.asarray(Image.open(io.BytesIO(r.content)).convert("RGB")).copy()
        a[:, :, 2] = 0
        os.makedirs(os.path.dirname(path), exist_ok=True)
        Image.fromarray(a).save(path, "PNG", optimize=True)
        return os.path.getsize(path)

    with ThreadPoolExecutor(16) as ex:
        sizes = list(ex.map(get, jobs))
    log(f"terrain: {len(jobs)} tiles, {sum(sizes) / 1e6:.1f} MB")
    return [list(j) for j in jobs]


# ---------------------------------------------------------------------------
# Airport layout
# ---------------------------------------------------------------------------
def load_airports():
    d = json.load(gzip.open(os.path.join(DATA, "airports.json.gz")))
    return {r[0]: r for r in d["rows"]}


def build_airport(icao, ap, proj, infra, buildings, cfg):
    _, iata, name, city, country, region, lat, lon, elev_ft, typ, sched, rws = ap
    field_elev = elev_ft * 0.3048
    runways = []
    for i, r in enumerate(rws):
        le, he, la1, lo1, la2, lo2, len_ft, w_ft, surf, lit, e1, e2, d1, d2, hdg = r
        x1, y1 = proj.xy(lo1, la1)
        x2, y2 = proj.xy(lo2, la2)
        z1 = e1 * 0.3048 if e1 > -9000 else field_elev
        z2 = e2 * 0.3048 if e2 > -9000 else field_elev
        runways.append({
            "id": i, "name": f"{le}/{he}", "width": round(w_ft * 0.3048, 1), "length": round(math.hypot(x2 - x1, y2 - y1), 1),
            "surface": surf, "lighted": lit,
            "le": {"ident": le, "x": round(x1, 2), "y": round(y1, 2), "z": round(z1, 2), "disp": round(d1 * 0.3048, 1)},
            "he": {"ident": he, "x": round(x2, 2), "y": round(y2, 2), "z": round(z2, 2), "disp": round(d2 * 0.3048, 1)},
            "hdgTrue": round(math.degrees(math.atan2(x2 - x1, y2 - y1)) % 360, 2),
        })
    rw_lines = [LineString([(r["le"]["x"], r["le"]["y"]), (r["he"]["x"], r["he"]["y"])]) for r in runways]
    longest = max(r["length"] for r in runways)
    hold = 85.0 if longest > 2400 else (60.0 if longest > 1200 else 45.0)
    area = unary_union([l.buffer(3500) for l in rw_lines])

    taxi, aprons, gates, helipads = [], [], [], []
    for f in infra:
        cls = f["class"]
        if cls not in ("taxiway", "taxilane", "apron", "airport_gate", "helipad", "parking_position"):
            continue
        g = proj.geom(wkb.loads(f["geometry"]))
        if not g.intersects(area):
            continue
        t = tags(f)
        if cls in ("taxiway", "taxilane"):
            for l in lines_of(g):
                taxi.append((l, t.get("ref") or name_of(f) or "", cls))
            for p in polys_of(g):
                aprons.append((p, name_of(f) or ""))
        elif cls == "apron":
            for p in polys_of(g):
                aprons.append((p, name_of(f) or ""))
        elif cls == "helipad":
            for p in polys_of(g):
                helipads.append(p)
        elif cls in ("airport_gate", "parking_position") and g.geom_type == "Point":
            gates.append((g, t.get("ref") or name_of(f) or "", cls))

    # --- taxi graph: node all taxi lines + runway centrelines + hold boxes
    holdboxes = [l.buffer(hold, cap_style="square").exterior for l in rw_lines]
    base = unary_union([l for l, _, _ in taxi] + rw_lines) if taxi else unary_union(rw_lines)
    snapped = [shapely.snap(l, base, 6.0) for l, _, _ in taxi]
    noded = unary_union(snapped + rw_lines + holdboxes)
    segs = lines_of(noded)
    nodes, node_index, edges, names = [], {}, [], [""]
    name_idx = {"": 0}

    def node(x, y):
        k = (round(x, 1), round(y, 1))
        if k not in node_index:
            node_index[k] = len(nodes)
            typ, rwid = 0, -1
            p = Point(x, y)
            for i, l in enumerate(rw_lines):
                if l.distance(p) < 1.0:
                    typ, rwid = 2, i
                    break
            if typ == 0:
                for i, hb in enumerate(holdboxes):
                    if hb.distance(p) < 0.5:
                        typ, rwid = 1, i
                        break
            nodes.append([round(x, 1), round(y, 1), typ, rwid])
        return node_index[k]

    def nm(n):
        if n not in name_idx:
            name_idx[n] = len(names)
            names.append(n)
        return name_idx[n]

    for s in segs:
        mid = s.interpolate(0.5, normalized=True)
        if any(hb.distance(mid) < 0.3 for hb in holdboxes):
            continue  # virtual hold boundary
        on_rw = [i for i, l in enumerate(rw_lines) if l.distance(mid) < 0.5]
        if on_rw:
            ename = runways[on_rw[0]]["name"]
        else:
            best, bd = "", 1e9
            for l, n, _ in taxi:
                d = l.distance(mid)
                if d < bd:
                    best, bd = n, d
            if bd > 8.0:
                continue
            ename = best
        s = s.simplify(1.0)
        if s.length > 60:
            k = int(math.ceil(s.length / 60.0))
            s = LineString([s.interpolate(i / k, normalized=True) for i in range(k + 1)]) if len(s.coords) == 2 else s.segmentize(60.0)
        cs = list(s.coords)
        for a, b in zip(cs[:-1], cs[1:]):
            ia, ib = node(*a), node(*b)
            if ia != ib:
                edges.append([ia, ib, nm(ename)])

    # Keep the largest connected component (drop isolated fragments).
    adj = defaultdict(list)
    for a, b, _ in edges:
        adj[a].append(b)
        adj[b].append(a)
    seen, best = set(), []
    for start in range(len(nodes)):
        if start in seen or start not in adj:
            continue
        comp, stack = [], [start]
        seen.add(start)
        while stack:
            u = stack.pop()
            comp.append(u)
            for v in adj[u]:
                if v not in seen:
                    seen.add(v)
                    stack.append(v)
        if len(comp) > len(best):
            best = comp
    keep = set(best)
    remap = {}
    nodes2 = []
    for i in sorted(keep):
        remap[i] = len(nodes2)
        nodes2.append(nodes[i])
    edges2 = [[remap[a], remap[b], n] for a, b, n in edges if a in keep and b in keep]
    nodes, edges = nodes2, edges2

    # --- gates / stands attached to the graph
    taxi_nodes = [(i, n) for i, n in enumerate(nodes) if n[2] == 0]
    gate_out = []
    for g, ref, cls in gates:
        bi, bd = -1, 1e9
        for i, n in taxi_nodes:
            d = math.hypot(n[0] - g.x, n[1] - g.y)
            if d < bd:
                bi, bd = i, d
        if bi < 0 or bd > 220 or bd < 15:
            continue
        nx, ny = nodes[bi][0], nodes[bi][1]
        ux, uy = (nx - g.x) / bd, (ny - g.y) / bd
        stand = (g.x + ux * min(24.0, bd * 0.4), g.y + uy * min(24.0, bd * 0.4)) if cls == "airport_gate" else (g.x, g.y)
        gi = len(nodes)
        nodes.append([round(stand[0], 1), round(stand[1], 1), 3, -1])
        edges.append([gi, bi, nm("apron")])
        gate_out.append({"ref": ref, "x": nodes[gi][0], "y": nodes[gi][1],
                         "hdg": round(math.degrees(math.atan2(-ux, -uy)) % 360, 1), "node": gi})

    # --- player stands: apron named in config, else gates / taxi nodes nearest a threshold
    stands = []
    want = (cfg.get("playerStands") or {}).get(icao, {})
    named = [p for p, n in aprons if want.get("apronName") and n == want.get("apronName")]
    if named:
        p = max(named, key=lambda q: q.area)
        c = p.representative_point()
        bi = min(taxi_nodes, key=lambda t: math.hypot(t[1][0] - c.x, t[1][1] - c.y))[0] if taxi_nodes else -1
        for k in range(4):
            ang = k * 0.5
            sx, sy = c.x + math.cos(ang) * 18 * k, c.y + math.sin(ang) * 18 * k
            if not p.buffer(-8).contains(Point(sx, sy)):
                sx, sy = c.x, c.y
            si = len(nodes)
            nodes.append([round(sx, 1), round(sy, 1), 3, -1])
            if bi >= 0:
                edges.append([si, bi, nm("apron")])
                hdg = math.degrees(math.atan2(nodes[bi][0] - sx, nodes[bi][1] - sy)) % 360
            else:
                hdg = 0
            stands.append({"name": f"{want['apronName'].title()} {k + 1}", "x": round(sx, 1), "y": round(sy, 1),
                           "hdg": round(hdg, 1), "node": si, "ga": True})
    if not stands:
        for g in gate_out[:6]:
            stands.append({"name": f"Gate {g['ref']}" if g["ref"] else "Stand", "x": g["x"], "y": g["y"],
                           "hdg": g["hdg"], "node": g["node"], "ga": False})

    # --- tower: data (building names), then config, then synthetic
    tower = None
    for b in buildings:
        n = (name_of(b) or "").lower()
        if ("control tower" in n or "atct" in n or "air traffic control" in n):
            g = proj.geom(wkb.loads(b["geometry"]))
            if g.distance(area.centroid) < 6000:
                c = g.centroid
                tower = {"x": round(c.x, 1), "y": round(c.y, 1), "height": float(b.get("height") or 60), "source": "overture"}
                break
    if tower is None and icao in (cfg.get("tower") or {}):
        la, lo, h = cfg["tower"][icao]
        x, y = proj.xy(lo, la)
        tower = {"x": round(x, 1), "y": round(y, 1), "height": h, "source": "config (approximate)"}
    if tower is None:
        c = unary_union([p for p, _ in aprons]).centroid if aprons else area.centroid
        tower = {"x": round(c.x, 1), "y": round(c.y, 1), "height": 30, "source": "synthetic"}

    def ring(r):
        return [[round(x, 1), round(y, 1)] for x, y in list(r.coords)[:-1]]

    out = {
        "icao": icao, "iata": iata, "name": name, "city": city, "country": country,
        "elevation": round(field_elev, 1), "magVar": cfg.get("magVar", 0), "holdDistance": hold,
        "runways": runways,
        "taxiways": [{"name": n, "kind": k, "pts": [[round(x, 1), round(y, 1)] for x, y in l.simplify(0.5).coords]} for l, n, k in taxi],
        "aprons": [{"name": n, "rings": [ring(p.simplify(0.5).exterior)] + [ring(h) for h in p.simplify(0.5).interiors]} for p, n in aprons],
        "helipads": [[ring(p.exterior)] for p in helipads],
        "gates": gate_out,
        "stands": stands,
        "tower": tower,
        "graph": {"nodes": nodes, "edges": edges, "names": names},
        "source": "Runways: OurAirports (public domain). Taxiways/aprons/gates: OpenStreetMap via Overture Maps (ODbL).",
    }
    log(f"airport {icao}: {len(runways)} rwy, {len(taxi)} taxi lines, {len(aprons)} aprons, {len(gate_out)} gates, "
        f"graph {len(nodes)} nodes / {len(edges)} edges, tower {tower['source']}")
    return out


# ---------------------------------------------------------------------------
# Landmark bridges: derive deck from road data where possible
# ---------------------------------------------------------------------------
def build_landmarks(cfg, proj):
    out = []
    for lm in cfg.get("landmarks", []):
        o = dict(lm)
        if "lat" in lm:
            o["x"], o["y"] = [round(v, 1) for v in proj.xy(lm["lon"], lm["lat"])]
        if "towers" in lm:
            o["towersXY"] = [[round(v, 1) for v in proj.xy(lo, la)] for la, lo in lm["towers"]]
            o["endsXY"] = [[round(v, 1) for v in proj.xy(lo, la)] for la, lo in lm["ends"]]
        out.append(o)
    return out


# ---------------------------------------------------------------------------
def main():
    rid = sys.argv[1]
    skip_terrain = "--skip-terrain" in sys.argv
    cfgs = json.load(open(os.path.join(ROOT, "tools", "regions.json")))
    cfg = cfgs[rid]
    airports = load_airports()
    anchor = airports[cfg["anchor"]]
    proj = Proj(anchor[6], anchor[7])
    bbox = cfg["bbox"]
    out_dir = os.path.join(DATA, "regions", rid)
    os.makedirs(os.path.join(out_dir, "tiles"), exist_ok=True)
    os.makedirs(os.path.join(out_dir, "airports"), exist_ok=True)
    region_poly = proj.geom(box(*bbox))
    minx, miny, maxx, maxy = region_poly.bounds
    stats = defaultdict(int)

    tiles = defaultdict(lambda: {"b": [], "r": [], "p": [], "pt": []})

    def tkey(x, y):
        return (int(math.floor(x / TILE)), int(math.floor(y / TILE)))

    # ---------------- buildings (+ parts)
    bcols = ["id", "geometry", "bbox", "height", "min_height", "num_floors", "min_floor", "subtype", "class", "names",
             "roof_shape", "roof_height", "facade_color", "roof_color", "has_parts", "is_underground"]
    blds = fetch("buildings", "building", bbox, bcols)
    parts = fetch("buildings", "building_part", bbox,
                  ["id", "geometry", "bbox", "height", "min_height", "num_floors", "min_floor", "roof_shape", "roof_height",
                   "facade_color", "roof_color", "building_id", "is_underground"])
    with_parts = defaultdict(list)
    for p in parts:
        if p.get("building_id"):
            with_parts[p["building_id"]].append(p)
    min_area = cfg.get("minBuildingArea", 18)
    est_heights = 0
    for b in blds + [dict(p, _part=True) for p in parts]:
        if b.get("is_underground"):
            continue
        if not b.get("_part") and b.get("has_parts") and b["id"] in with_parts:
            continue
        g = proj.geom(wkb.loads(b["geometry"]))
        for poly in polys_of(g):
            if poly.area < min_area and not b.get("_part"):
                continue
            poly = poly.simplify(0.3, preserve_topology=True)
            if poly.is_empty or poly.geom_type != "Polygon":
                continue
            poly = shapely.geometry.polygon.orient(poly, 1.0)
            c = poly.centroid
            if not region_poly.contains(c):
                continue
            h = b.get("height")
            floors = b.get("num_floors")
            est = False
            if not h:
                if floors:
                    h = floors * 3.3 + 1.0
                else:
                    est = True
                    a = poly.area
                    cls = (b.get("class") or "")
                    base = {"house": 7.5, "detached": 7.5, "semidetached_house": 8, "terrace": 9, "garage": 3, "garages": 3,
                            "shed": 3, "hut": 3, "apartments": 14, "commercial": 10, "retail": 7, "industrial": 9,
                            "warehouse": 10, "church": 16, "school": 11, "hospital": 18, "hangar": 16, "roof": 4}.get(cls)
                    if base is None:
                        base = 4 if a < 60 else (7 if a < 200 else (9 if a < 1500 else 12))
                    jitter = ((stable_hash(b["id"]) % 1000) / 1000.0 - 0.5) * 0.3
                    h = base * (1 + jitter)
                    est_heights += 1
            mh = b.get("min_height") or ((b.get("min_floor") or 0) * 3.3)
            if h <= mh + 0.5:
                h = mh + 3
            sub = BLD_SUB.get(b.get("subtype") or "", 0)
            roof = ROOF.get((b.get("roof_shape") or "").lower(), 255)
            flags = (1 if est else 0) | (2 if b.get("_part") else 0)
            color = parse_color(b.get("facade_color"))
            rcolor = parse_color(b.get("roof_color"))
            rh = b.get("roof_height") or 0
            hdr = struct.pack("<BBHffIIfI", sub, roof if roof < 255 else 255, flags, float(h), float(mh), color, rcolor,
                              float(rh), stable_hash(b["id"]))
            tiles[tkey(c.x, c.y)]["b"].append((poly, hdr, h))
            stats["buildings"] += 1
            if b.get("height"):
                stats["buildings_height_from_data"] += 1
            elif floors:
                stats["buildings_height_from_floors"] += 1
    stats["buildings_height_estimated"] = est_heights
    # keep tallest/largest per tile within budget
    cap = cfg.get("maxBuildingsPerTile", 4000)
    for k, t in tiles.items():
        if len(t["b"]) > cap:
            stats["buildings_dropped_budget"] += len(t["b"]) - cap
            t["b"].sort(key=lambda e: -(e[2] * 2 + e[0].area ** 0.5))
            t["b"] = t["b"][:cap]

    # ---------------- roads & rail
    segs = fetch("transportation", "segment", bbox, ["geometry", "bbox", "subtype", "class", "road_flags", "level_rules", "names"])
    for s in segs:
        st, cl = s.get("subtype"), s.get("class") or "unknown"
        if st == "road":
            code = ROAD.get(cl)
        elif st == "rail":
            code = RAIL.get(cl, 20)
        else:
            code = None
        if not code:
            continue
        flags_r = s.get("road_flags")
        if flag_fraction(flags_r, "is_tunnel") > 0.5:
            continue
        fl = 0
        if flag_fraction(flags_r, "is_bridge") > 0.5:
            fl |= 1
        if flag_fraction(flags_r, "is_link") > 0.5:
            fl |= 4
        lvl = 0
        for lr in s.get("level_rules") or []:
            lvl = max(lvl, int(lr.get("value") or 0))
        if st == "rail" and (s.get("class") == "subway") and not (fl & 1) and lvl <= 0:
            continue  # underground subway lines without explicit bridge
        g = proj.geom(wkb.loads(s["geometry"]))
        for l in lines_of(g):
            if code == 7 and l.length < 25:
                continue
            l = l.simplify(0.5)
            m = l.interpolate(0.5, normalized=True)
            if not region_poly.contains(m):
                continue
            tiles[tkey(m.x, m.y)]["r"].append((l, code, fl, max(-5, min(5, lvl))))
            stats["roads" if code < 20 else "rail"] += 1

    # ---------------- polygons: land cover / land use / land / water / infra
    tile_boxes = {}

    def add_poly_clipped(g, layer, code):
        for poly in polys_of(g):
            if poly.area < 40:
                continue
            x0, y0, x1, y1 = poly.bounds
            for tx in range(int(math.floor(x0 / TILE)), int(math.floor(x1 / TILE)) + 1):
                for ty in range(int(math.floor(y0 / TILE)), int(math.floor(y1 / TILE)) + 1):
                    if (tx * TILE + TILE < minx) or (tx * TILE > maxx) or (ty * TILE + TILE < miny) or (ty * TILE > maxy):
                        continue
                    bx = tile_boxes.get((tx, ty))
                    if bx is None:
                        bx = tile_boxes[(tx, ty)] = box(tx * TILE - 2, ty * TILE - 2, tx * TILE + TILE + 2, ty * TILE + TILE + 2)
                    if poly.within(bx):
                        clipped = poly
                    else:
                        try:
                            clipped = poly.intersection(bx)
                        except Exception:
                            continue
                    for cp in polys_of(clipped):
                        if cp.area < 20:
                            continue
                        cp = cp.simplify(1.0, preserve_topology=True)
                        if cp.geom_type != "Polygon" or cp.is_empty:
                            continue
                        tiles[(tx, ty)]["p"].append((cp, struct.pack("<BBH", layer, code, 0)))
                        stats[f"poly_layer{layer}"] += 1

    for f in fetch("base", "land_cover", bbox, ["geometry", "bbox", "subtype"]):
        code = LANDCOVER.get(f.get("subtype"))
        if code:
            add_poly_clipped(proj.geom(wkb.loads(f["geometry"])), 1, code)
    for f in fetch("base", "land_use", bbox, ["geometry", "bbox", "subtype", "class"]):
        code = LANDUSE.get(f.get("class")) or LANDUSE.get(f.get("subtype"))
        if code:
            add_poly_clipped(proj.geom(wkb.loads(f["geometry"])), 2, code)
    land_feats = fetch("base", "land", bbox, ["geometry", "bbox", "subtype", "class"])
    for f in land_feats:
        cls = f.get("class") or f.get("subtype")
        g = proj.geom(wkb.loads(f["geometry"]))
        if cls in ("tree",) and g.geom_type == "Point":
            if region_poly.contains(g):
                tiles[tkey(g.x, g.y)]["pt"].append((PT_TREE, g.x, g.y, 9 + (stable_hash(str(g.x)) % 70) / 10.0))
                stats["trees"] += 1
            continue
        if cls == "tree_row":
            for l in lines_of(g):
                n = max(2, int(l.length / 9))
                for i in range(n):
                    p = l.interpolate(i / (n - 1), normalized=True)
                    if region_poly.contains(p):
                        tiles[tkey(p.x, p.y)]["pt"].append((PT_TREE, p.x, p.y, 10.0))
                        stats["trees"] += 1
            continue
        code = LAND.get(cls)
        if code:
            add_poly_clipped(g, 3, code)
    water_feats = fetch("base", "water", bbox, ["geometry", "bbox", "subtype", "class", "is_intermittent"])
    for f in water_feats:
        cls = f.get("class") or f.get("subtype")
        code = WATER.get(cls) or WATER.get(f.get("subtype"))
        if not code:
            continue
        g = proj.geom(wkb.loads(f["geometry"]))
        if g.geom_type in ("LineString", "MultiLineString"):
            width = {"river": 18, "canal": 10, "stream": 3}.get(cls, 0)
            if not width:
                continue
            g = g.buffer(width / 2, cap_style="flat")
        add_poly_clipped(g, 0, code)
    infra = fetch("base", "infrastructure", bbox, ["geometry", "bbox", "subtype", "class", "names", "source_tags", "height"])
    for f in infra:
        cls = f["class"]
        g = proj.geom(wkb.loads(f["geometry"]))
        if cls in INFRA_POLY and g.geom_type in ("Polygon", "MultiPolygon"):
            add_poly_clipped(g, 4, INFRA_POLY[cls])
        elif cls == "pier" and g.geom_type in ("LineString", "MultiLineString"):
            add_poly_clipped(g.buffer(4, cap_style="flat"), 4, 53)
        elif g.geom_type == "Point" and region_poly.contains(g):
            kind = {"power_tower": PT_POWER_TOWER, "communication_tower": PT_COMM_TOWER, "mobile_phone_tower": PT_COMM_TOWER,
                    "wind_turbine": PT_WIND, "lighthouse": PT_LIGHTHOUSE}.get(cls)
            if kind:
                h = f.get("height") or {PT_POWER_TOWER: 35, PT_COMM_TOWER: 45, PT_WIND: 90, PT_LIGHTHOUSE: 25}[kind]
                tiles[tkey(g.x, g.y)]["pt"].append((kind, g.x, g.y, float(h)))
                stats["towers"] += 1

    # cap trees per tile
    for t in tiles.values():
        trees = [p for p in t["pt"] if p[0] == PT_TREE]
        if len(trees) > 2500:
            other = [p for p in t["pt"] if p[0] != PT_TREE]
            t["pt"] = other + trees[:: int(math.ceil(len(trees) / 2500))]

    # ---------------- write tiles
    index = {}
    total = 0
    for (tx, ty), t in tiles.items():
        ox, oy = tx * TILE + TILE / 2, ty * TILE + TILE / 2
        payload = b"OSKT" + struct.pack("<HH", 1, 4)
        payload += section(1, enc_polys([(p, h) for p, h, _ in t["b"]], ox, oy, None))
        payload += section(2, enc_lines(t["r"], ox, oy))
        payload += section(3, enc_polys(t["p"], ox, oy, None))
        payload += section(4, enc_points(t["pt"], ox, oy))
        data = gzip.compress(payload, 9)
        open(os.path.join(out_dir, "tiles", f"{tx}_{ty}.bin.gz"), "wb").write(data)
        index[f"{tx},{ty}"] = [len(t["b"]), len(t["r"]), len(t["p"]), len(t["pt"]), len(data)]
        total += len(data)
    log(f"tiles: {len(index)} written, {total / 1e6:.1f} MB")

    # ---------------- airports
    ap_out = []
    for icao in cfg["airports"]:
        if icao not in airports:
            continue
        a = build_airport(icao, airports[icao], proj, infra, blds, cfg)
        json.dump(a, open(os.path.join(out_dir, "airports", f"{icao}.json"), "w"), separators=(",", ":"))
        ap_out.append({"icao": icao, "name": a["name"], "iata": a["iata"], "elevation": a["elevation"],
                       "x": round(proj.xy(airports[icao][7], airports[icao][6])[0], 1),
                       "y": round(proj.xy(airports[icao][7], airports[icao][6])[1], 1),
                       "runways": [r["name"] for r in a["runways"]], "graphNodes": len(a["graph"]["nodes"]),
                       "gates": len(a["gates"]), "detail": icao == cfg.get("detailAirport")})

    # ---------------- terrain
    terrain = []
    if not skip_terrain:
        w, s, e, n = bbox
        cx, cy = (w + e) / 2, (s + n) / 2
        dlat = 200 / 111.0
        dlon = 200 / (111.0 * math.cos(math.radians(cy)))
        mid_lat, mid_lon = (n - s) * 0.6, (e - w) * 0.6
        terrain = fetch_terrain(bbox, [
            (cfg.get("terrainZoom", 13), bbox),
            (11, (w - mid_lon, s - mid_lat, e + mid_lon, n + mid_lat)),
            (8, (cx - dlon, cy - dlat, cx + dlon, cy + dlat)),
        ])

    manifest = {
        "id": rid, "name": cfg["name"], "country": cfg["country"], "countryCode": cfg["countryCode"],
        "character": cfg["character"], "characterHe": cfg.get("characterHe", ""), "tier": cfg["tier"],
        "style": cfg["style"], "bbox": bbox, "magVar": cfg["magVar"],
        "anchor": {"icao": cfg["anchor"], "lat": anchor[6], "lon": anchor[7], "elevation": round(anchor[8] * 0.3048, 1)},
        "tileSize": TILE, "quant": Q, "tiles": index,
        "extent": [round(minx), round(miny), round(maxx), round(maxy)],
        "airports": ap_out, "detailAirport": cfg.get("detailAirport"),
        "landmarks": build_landmarks(cfg, proj),
        "terrainTiles": {"zoom": cfg.get("terrainZoom", 13), "count": len(terrain)},
        "stats": dict(stats),
        "overtureRelease": ov.RELEASE,
        "generated": time.strftime("%Y-%m-%d"),
    }
    json.dump(manifest, open(os.path.join(out_dir, "manifest.json"), "w"), indent=1)
    log("stats", json.dumps(dict(stats)))


if __name__ == "__main__":
    main()
