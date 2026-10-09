"""Builds the offline global base layer: web/data/global/dem.png
(equirectangular 4096 x 2048, ~9.8 km/px at the equator).

Pixel encoding (8-bit grey): 0 = water (ocean / large lake, from Natural
Earth 1:10m), 1..255 = land with height h = -450 + ((v-1)/254)^2 * 9350 m.
Heights come from the AWS Terrain Tiles (Terrarium, zoom 4), coastlines from
Natural Earth (public domain). This layer is the fallback used when no
higher-resolution terrain (bundled region tiles or online tiles) is
available; it is deliberately coarse and labelled as such in the UI."""
import io
import json
import math
import os
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..")
CACHE = os.path.join(ROOT, ".cache")
OUT = os.path.join(ROOT, "web", "data", "global", "dem.png")
Z = 4
W, H = 4096, 2048
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"


def tile(x, y):
    path = os.path.join(CACHE, "terrarium", str(Z), str(x), f"{y}.png")
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        r = requests.get(URL.format(z=Z, x=x, y=y), timeout=60)
        r.raise_for_status()
        open(path, "wb").write(r.content)
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    return x, y, a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768


def mosaic():
    n = 1 << Z
    m = np.zeros((n * 256, n * 256), np.float32)
    with ThreadPoolExecutor(16) as ex:
        for x, y, h in ex.map(lambda xy: tile(*xy), [(x, y) for x in range(n) for y in range(n)]):
            m[y * 256 : (y + 1) * 256, x * 256 : (x + 1) * 256] = h
    return m


def resample(m):
    size = m.shape[0]
    lon = (np.arange(W) + 0.5) / W * 360 - 180
    lat = 90 - (np.arange(H) + 0.5) / H * 180
    lat = np.clip(lat, -85.05, 85.05)
    px = (lon + 180) / 360 * size - 0.5
    lr = np.radians(lat)
    py = (1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / math.pi) / 2 * size - 0.5
    X, Y = np.meshgrid(px, py)
    x0 = np.floor(X).astype(int) % size
    y0 = np.clip(np.floor(Y).astype(int), 0, size - 2)
    fx, fy = X - np.floor(X), Y - np.floor(Y)
    x1 = (x0 + 1) % size
    return (m[y0, x0] * (1 - fx) * (1 - fy) + m[y0, x1] * fx * (1 - fy) + m[y0 + 1, x0] * (1 - fx) * fy + m[y0 + 1, x1] * fx * fy)


def rasterize(paths, value, img):
    d = ImageDraw.Draw(img)
    for p in paths:
        g = json.load(open(p))
        for feat in g["features"]:
            geom = feat["geometry"]
            polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
            for poly in polys:
                for ri, ring in enumerate(poly):
                    pts = [((lo + 180) / 360 * W, (90 - la) / 180 * H) for lo, la in ring]
                    if len(pts) >= 3:
                        d.polygon(pts, fill=value if ri == 0 else (0 if value else 255))


def main():
    m = mosaic()
    h = resample(m)
    mask = Image.new("L", (W, H), 0)
    ne = os.path.join(CACHE, "ne")
    rasterize([os.path.join(ne, "ne_10m_land.geojson"), os.path.join(ne, "ne_10m_minor_islands.geojson")], 255, mask)
    rasterize([os.path.join(ne, "ne_10m_lakes.geojson")], 0, mask)
    land = np.asarray(mask) > 127
    v = 1 + np.round(np.sqrt(np.clip((h + 450) / 9350, 0, 1)) * 254)
    v = np.where(land, np.clip(v, 1, 255), 0).astype(np.uint8)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    Image.fromarray(v, "L").save(OUT, optimize=True)
    print("wrote", OUT, os.path.getsize(OUT) / 1e6, "MB; land fraction", land.mean())


if __name__ == "__main__":
    main()
