"""Writes web/data/catalog.json: the list of real places the menu offers,
with their tier, data statistics and accuracy notes (shown to the player)."""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "web", "data")


def size_of(path):
    tot = 0
    for dp, _, fs in os.walk(path):
        tot += sum(os.path.getsize(os.path.join(dp, f)) for f in fs)
    return tot


PLANNED = [
    ("KLAX", "Los Angeles", "United States", "Coastal megacity, LAX, Hollywood hills", "מטרופולין חופי, LAX וגבעות הוליווד", "in development"),
    ("EGLL", "London", "United Kingdom", "Historic capital, Thames, Heathrow", "בירה היסטורית, התמזה והית'רו", "planned"),
    ("RJTT", "Tokyo", "Japan", "Dense megacity on Tokyo Bay, Haneda", "מגה-עיר צפופה על מפרץ טוקיו, הנדה", "planned"),
    ("OMDB", "Dubai", "United Arab Emirates", "Desert skyline, Palm islands", "קו רקיע מדברי ואיי הדקל", "planned"),
    ("YSSY", "Sydney", "Australia", "Harbour city, Opera House", "עיר נמל, בית האופרה", "planned"),
    ("SBGL", "Rio de Janeiro", "Brazil", "Mountains meet the sea", "הרים שנפגשים בים", "planned"),
    ("FACT", "Cape Town", "South Africa", "Table Mountain and two oceans", "הר השולחן ושני אוקיינוסים", "planned"),
    ("VHHH", "Hong Kong", "China", "Vertical city, harbour, mountains", "עיר אנכית, נמל והרים", "planned"),
]


def main():
    regions = []
    for rid in sorted(os.listdir(os.path.join(DATA, "regions"))):
        mp = os.path.join(DATA, "regions", rid, "manifest.json")
        if not os.path.exists(mp):
            continue
        m = json.load(open(mp))
        s = m["stats"]
        nb = s.get("buildings", 0)
        measured = s.get("buildings_height_from_data", 0) + s.get("buildings_height_from_floors", 0)
        regions.append({
            "id": rid, "name": m["name"], "country": m["country"], "countryCode": m["countryCode"],
            "character": m["character"], "characterHe": m.get("characterHe", ""), "tier": m["tier"],
            "bbox": m["bbox"], "anchor": m["anchor"], "airports": m["airports"], "magVar": m["magVar"],
            "style": m["style"],
            "stats": {"buildings": nb, "buildingHeightsMeasuredPct": round(100 * measured / max(1, nb)),
                      "roads": s.get("roads", 0), "rail": s.get("rail", 0), "trees": s.get("trees", 0),
                      "sizeMB": round(size_of(os.path.dirname(mp)) / 1e6, 1)},
        })
    # Places in development: flyable today at the global tier (real runways,
    # streamed terrain); detailed city data is the next pipeline run.
    import gzip
    db = json.load(gzip.open(os.path.join(DATA, "airports.json.gz")))
    fi = {f: i for i, f in enumerate(db["fields"])}
    rows = {r[fi["ident"]]: r for r in db["rows"]}
    planned = []
    baked = {a["icao"] for reg in regions for a in reg["airports"]} | {reg["anchor"]["icao"] for reg in regions}
    for icao, name, country, character, characterHe, stage in PLANNED:
        if icao in baked:  # already a detailed region: do not list it twice
            continue
        r = rows[icao]
        planned.append({"name": name, "country": country, "character": character, "characterHe": characterHe,
                        "status": stage, "anchor": {"icao": icao, "lat": r[fi["lat"]], "lon": r[fi["lon"]]}})
    cat = {
        "version": 1,
        "regions": regions,
        "planned": planned,
        "tiers": {
            "A": "Detailed: real buildings with measured heights, roads, coastline, land use, detailed airport (taxiways, gates, lights, signs), landmarks.",
            "B": "Regional: real buildings (heights partly estimated), roads, coastline and land use; airport layout from map data.",
            "G": "Global base: real runway positions/headings for 10,000+ airports; terrain from online elevation tiles (or a coarse ~10 km offline layer); generic airport buildings; no city buildings.",
        },
    }
    json.dump(cat, open(os.path.join(DATA, "catalog.json"), "w"), indent=1)
    print("catalog:", [(r["id"], r["stats"]) for r in regions])


if __name__ == "__main__":
    main()
