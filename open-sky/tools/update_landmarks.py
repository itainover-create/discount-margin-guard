"""Refresh the landmark list of an already baked region from tools/regions.json
without re-baking buildings, roads or terrain.

    python3 tools/update_landmarks.py nyc
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from bake_region import DATA, ROOT, Proj, build_landmarks, load_airports  # noqa: E402


def main():
    rid = sys.argv[1]
    cfg = json.load(open(os.path.join(ROOT, "tools", "regions.json")))[rid]
    anchor = load_airports()[cfg["anchor"]]
    proj = Proj(anchor[6], anchor[7])
    path = os.path.join(DATA, "regions", rid, "manifest.json")
    man = json.load(open(path))
    man["landmarks"] = build_landmarks(cfg, proj)
    with open(path, "w") as f:
        json.dump(man, f, separators=(",", ":"))
    print(rid, "landmarks:", ", ".join(l["id"] for l in man["landmarks"]))


if __name__ == "__main__":
    main()
