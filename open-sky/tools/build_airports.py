"""Builds web/data/airports.json.gz — the global airport index used by the
location search and by the generic (global-tier) airport generator.

Source: OurAirports (public domain). An airport is included only when at
least one open runway has both end coordinates, so every searchable airport
can actually be loaded as a flyable place (runways at their real position,
heading, length and width)."""
import csv
import gzip
import json
import math
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, ".cache", "ourairports")
OUT = os.path.join(ROOT, "web", "data", "airports.json.gz")

TYPES = {"large_airport": "L", "medium_airport": "M", "small_airport": "S"}
PAVED = ("ASP", "CON", "PEM", "BIT", "TAR", "MAC", "PAV", "ASF")


def f(v, d=None):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def surface_code(s):
    s = (s or "").upper()
    if any(p in s for p in PAVED):
        return "P"
    if "WATER" in s:
        return "W"
    if any(k in s for k in ("GRS", "GRASS", "TURF")):
        return "G"
    return "U"


def main():
    countries = {r["code"]: r["name"] for r in csv.DictReader(open(os.path.join(SRC, "countries.csv"), encoding="utf-8"))}
    regions = {r["code"]: r["name"] for r in csv.DictReader(open(os.path.join(SRC, "regions.csv"), encoding="utf-8"))}
    rwys = {}
    for r in csv.DictReader(open(os.path.join(SRC, "runways.csv"), encoding="utf-8")):
        if r["closed"] == "1":
            continue
        la1, lo1, la2, lo2 = f(r["le_latitude_deg"]), f(r["le_longitude_deg"]), f(r["he_latitude_deg"]), f(r["he_longitude_deg"])
        if None in (la1, lo1, la2, lo2):
            continue
        length = f(r["length_ft"], 0)
        # sanity: coordinates must agree with the stated length (within 25 %)
        dx = (lo2 - lo1) * math.cos(math.radians((la1 + la2) / 2)) * 111320
        dy = (la2 - la1) * 110574
        geo_len = math.hypot(dx, dy) / 0.3048
        if geo_len < 600 or (length > 0 and abs(geo_len - length) / length > 0.25):
            continue
        rwys.setdefault(r["airport_ident"], []).append([
            r["le_ident"], r["he_ident"], round(la1, 6), round(lo1, 6), round(la2, 6), round(lo2, 6),
            int(length or geo_len), int(f(r["width_ft"], 100) or 100), surface_code(r["surface"]), int(r["lighted"] == "1"),
            int(f(r["le_elevation_ft"], -9999)), int(f(r["he_elevation_ft"], -9999)),
            int(f(r["le_displaced_threshold_ft"], 0) or 0), int(f(r["he_displaced_threshold_ft"], 0) or 0),
            round(f(r["le_heading_degT"], -1) or -1, 1),
        ])
    rows = []
    for a in csv.DictReader(open(os.path.join(SRC, "airports.csv"), encoding="utf-8")):
        t = TYPES.get(a["type"])
        if not t or a["ident"] not in rwys:
            continue
        rw = rwys[a["ident"]]
        if t == "S" and max(r[6] for r in rw) < 1800:
            continue
        rows.append([
            a["ident"], a["iata_code"] or "", a["name"], a["municipality"] or "", a["iso_country"],
            regions.get(a["iso_region"], ""),
            round(float(a["latitude_deg"]), 5), round(float(a["longitude_deg"]), 5), int(f(a["elevation_ft"], 0) or 0),
            t, int(a["scheduled_service"] == "yes"), rw,
        ])
    rows.sort(key=lambda r: ({"L": 0, "M": 1, "S": 2}[r[9]], r[0]))
    data = {
        "source": "OurAirports (https://ourairports.com/data/), public domain",
        "fields": ["ident", "iata", "name", "city", "country", "region", "lat", "lon", "elevFt", "type", "scheduled", "runways"],
        "runwayFields": ["le", "he", "leLat", "leLon", "heLat", "heLon", "lengthFt", "widthFt", "surface", "lighted",
                          "leElevFt", "heElevFt", "leDispFt", "heDispFt", "leHdgTrue"],
        "countries": countries,
        "rows": rows,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    raw = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    with gzip.open(OUT, "wb", compresslevel=9) as fh:
        fh.write(raw)
    by = {}
    for r in rows:
        by[r[9]] = by.get(r[9], 0) + 1
    print(f"airports: {len(rows)} {by}  raw {len(raw)/1e6:.1f} MB  gz {os.path.getsize(OUT)/1e6:.2f} MB")


if __name__ == "__main__":
    sys.exit(main())
