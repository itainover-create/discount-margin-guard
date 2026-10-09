"""Rasterises a region's surface classes into web/data/regions/<id>/landclass.png
(8-bit class ids, one pixel = `res` metres in the region frame), painted in
priority order: land cover < land use < natural land < roads/rail < water <
aprons/piers/runways. The terrain shader samples it for ground texture
(including far away) and the terrain mesher uses it to sharpen coastlines.

Reads the already-baked tiles (so it needs no network)."""
import gzip
import json
import math
import os
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "web", "data")

ROAD_CLASS = {1: 70, 2: 70, 3: 71, 4: 71, 5: 72, 6: 72, 7: 72, 8: 72, 9: 73, 20: 74, 21: 74, 22: 74, 23: 74}
ROAD_W = {1: 22, 2: 18, 3: 14, 4: 12, 5: 10, 6: 8, 7: 5, 8: 6, 9: 4, 20: 6, 21: 6, 22: 5, 23: 5}
LAYER_ORDER = [1, 2, 3, 0, 4]  # landcover, landuse, land, water, infra


def read_tile(path):
    return parse_tile(open(path, "rb").read())


def iter_pack(path):
    b = open(path, "rb").read()
    _, _, n = struct.unpack_from("<4sII", b, 0)
    off = 12
    for _ in range(n):
        kl = struct.unpack_from("<H", b, off)[0]
        k = b[off + 2 : off + 2 + kl].decode()
        o, ln = struct.unpack_from("<II", b, off + 2 + kl)
        off += 2 + kl + 8
        yield k, b[o : o + ln]


def parse_tile(gz_bytes):
    b = gzip.decompress(gz_bytes)
    assert b[:4] == b"OSKT"
    off = 8
    sections = {}
    while off < len(b):
        kind, _, _, _, ln = struct.unpack_from("<BBBBI", b, off)
        off += 8
        sections[kind] = b[off : off + ln]
        off += ln
    return sections


def iter_polys(sec, hdr_size):
    n = struct.unpack_from("<I", sec, 0)[0]
    off = 4
    for _ in range(n):
        hdr = sec[off : off + hdr_size]
        off += hdr_size
        nr = sec[off]
        off += 1
        rings = []
        for _ in range(nr):
            nv = struct.unpack_from("<H", sec, off)[0]
            off += 2
            pts = struct.unpack_from(f"<{nv * 2}h", sec, off)
            off += nv * 4
            rings.append(pts)
        yield hdr, rings


def iter_lines(sec):
    n = struct.unpack_from("<I", sec, 0)[0]
    off = 4
    for _ in range(n):
        cls, flags, level, _, nv = struct.unpack_from("<BBbBH", sec, off)
        off += 6
        pts = struct.unpack_from(f"<{nv * 2}h", sec, off)
        off += nv * 4
        yield cls, flags, level, pts


def main():
    rid = sys.argv[1]
    rdir = os.path.join(DATA, "regions", rid)
    man = json.load(open(os.path.join(rdir, "manifest.json")))
    q = man["quant"]
    T = man["tileSize"]
    minx, miny, maxx, maxy = man["extent"]
    span = max(maxx - minx, maxy - miny)
    res = max(4.0, math.ceil(span / 8000.0))
    W, H = int(math.ceil((maxx - minx) / res)), int(math.ceil((maxy - miny) / res))
    img = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(img)

    def px(tx, ty, rx, ry):
        x = tx * T + T / 2 + rx * q
        y = ty * T + T / 2 + ry * q
        return ((x - minx) / res, (maxy - y) / res)

    tiles = []
    if os.path.isdir(os.path.join(rdir, "tiles")):
        for key in man["tiles"]:
            tx, ty = map(int, key.split(","))
            tiles.append((tx, ty, read_tile(os.path.join(rdir, "tiles", f"{tx}_{ty}.bin.gz"))))
    else:
        for name in sorted(set(man["packs"].values())):
            for key, blob in iter_pack(os.path.join(rdir, "packs", name)):
                tx, ty = map(int, key.split(","))
                tiles.append((tx, ty, parse_tile(blob)))

    polys = {l: [] for l in range(5)}
    for tx, ty, s in tiles:
        if 3 in s:
            for hdr, rings in iter_polys(s[3], 4):
                layer, code = hdr[0], hdr[1]
                polys[layer].append((code, [[px(tx, ty, r[i], r[i + 1]) for i in range(0, len(r), 2)] for r in rings], (tx, ty)))

    def paint(layer):
        for code, rings, _ in polys[layer]:
            if len(rings[0]) >= 3:
                d.polygon(rings[0], fill=code)
            for hole in rings[1:]:
                pass  # holes keep the class (inner details are rare at this scale)

    for layer in (1, 2, 3):
        # big polygons first so small ones stay visible
        polys[layer].sort(key=lambda e: -len(e[1][0]))
        paint(layer)
    # airfield grass around runways and taxiways (land cover data marks
    # airports as generic built-up; the infield is grass in reality)
    aps = [json.load(open(os.path.join(rdir, "airports", ap["icao"] + ".json"))) for ap in man["airports"]]
    for a in aps:
        for r in a["runways"]:
            w = int(round((r["width"] + 260) / res))
            d.line([((r["le"]["x"] - minx) / res, (maxy - r["le"]["y"]) / res), ((r["he"]["x"] - minx) / res, (maxy - r["he"]["y"]) / res)], fill=50, width=w)
        for t in a["taxiways"]:
            w = int(round(120 / res))
            d.line([((x - minx) / res, (maxy - y) / res) for x, y in t["pts"]], fill=50, width=w)
    # roads & rail as lines
    for tx, ty, s in tiles:
        if 2 in s:
            for cls, flags, level, pts in iter_lines(s[2]):
                c = ROAD_CLASS.get(cls)
                if not c or (flags & 1):
                    continue
                w = max(1, int(round(ROAD_W.get(cls, 6) / res)))
                d.line([px(tx, ty, pts[i], pts[i + 1]) for i in range(0, len(pts), 2)], fill=c, width=w)
    paint(0)
    paint(4)
    # runways from airport files
    for ap in man["airports"]:
        a = json.load(open(os.path.join(rdir, "airports", ap["icao"] + ".json")))
        for r in a["runways"]:
            x1, y1, x2, y2, w = r["le"]["x"], r["le"]["y"], r["he"]["x"], r["he"]["y"], r["width"]
            L = math.hypot(x2 - x1, y2 - y1)
            ux, uy = (x2 - x1) / L, (y2 - y1) / L
            nx, ny = -uy * w / 2, ux * w / 2
            pts = [(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)]
            d.polygon([((x - minx) / res, (maxy - y) / res) for x, y in pts], fill=54)
        for t in a["taxiways"]:
            w = max(1, int(round((23 if t["kind"] == "taxiway" else 15) / res)))
            d.line([((x - minx) / res, (maxy - y) / res) for x, y in t["pts"]], fill=55, width=w)
    out = os.path.join(rdir, "landclass.png")
    img.save(out, optimize=True)
    man["landclass"] = {"file": "landclass.png", "res": res, "width": W, "height": H, "origin": [minx, maxy]}
    json.dump(man, open(os.path.join(rdir, "manifest.json"), "w"), indent=1)
    hist = np.bincount(np.asarray(img).ravel(), minlength=256)
    print(rid, f"{W}x{H} @ {res} m", f"{os.path.getsize(out) / 1e6:.2f} MB", {i: int(c) for i, c in enumerate(hist) if c > W * H * 0.01})


if __name__ == "__main__":
    main()
