"""Adds per-tile max building height ("maxH") to each region manifest so the
client can stream distant skylines (tall buildings) without loading whole
cities. Reads the packed tiles."""
import gzip
import json
import os
import struct
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "web", "data")
sys.path.insert(0, os.path.dirname(__file__))
from bake_landclass import read_tile  # noqa: E402  (reads OSKT from a path)


def read_pack(path):
    b = open(path, "rb").read()
    _, _, n = struct.unpack_from("<4sII", b, 0)
    off, out = 12, {}
    for _ in range(n):
        kl = struct.unpack_from("<H", b, off)[0]
        k = b[off + 2 : off + 2 + kl].decode()
        o, ln = struct.unpack_from("<II", b, off + 2 + kl)
        off += 2 + kl + 8
        out[k] = b[o : o + ln]
    return out


def main():
    for rid in sorted(os.listdir(os.path.join(DATA, "regions"))):
        rdir = os.path.join(DATA, "regions", rid)
        mp = os.path.join(rdir, "manifest.json")
        if not os.path.exists(mp):
            continue
        man = json.load(open(mp))
        maxh = {}
        for name in set(man["packs"].values()):
            for key, blob in read_pack(os.path.join(rdir, "packs", name)).items():
                raw = gzip.decompress(blob)
                off = 8
                h = 0.0
                while off < len(raw):
                    kind, _, _, _, ln = struct.unpack_from("<BBBBI", raw, off)
                    off += 8
                    if kind == 1:
                        n = struct.unpack_from("<I", raw, off)[0]
                        p = off + 4
                        for _ in range(n):
                            bh = struct.unpack_from("<f", raw, p + 4)[0]
                            h = max(h, bh)
                            p += 28
                            nr = raw[p]
                            p += 1
                            for _ in range(nr):
                                nv = struct.unpack_from("<H", raw, p)[0]
                                p += 2 + nv * 4
                    off += ln
                maxh[key] = round(h, 1)
        man["tileMaxH"] = maxh
        json.dump(man, open(mp, "w"), indent=1)
        tall = sum(1 for v in maxh.values() if v > 60)
        print(rid, "tiles", len(maxh), "with buildings > 60 m:", tall, "max", max(maxh.values() or [0]))


if __name__ == "__main__":
    main()
