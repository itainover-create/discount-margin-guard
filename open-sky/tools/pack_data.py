"""Packs many small data files into spatial bundles so the game can be hosted
with a small number of files (and fewer HTTP requests).

    python3 pack_data.py            # all regions + terrain

Pack format "OSKP" (little-endian):
    magic 'OSKP', u32 version=1, u32 count
    count x { u16 keyLen, key (utf-8), u32 offset, u32 length }
    blobs (offsets are relative to the start of the file)

Region tiles  -> web/data/regions/<id>/packs/<px>_<py>.pack (8 x 8 km blocks)
Terrain tiles -> web/data/terrain/packs/<z>_<px>_<py>.pack  (8 x 8 tiles)
and web/data/terrain/index.json lists which pack holds each tile."""
import json
import os
import shutil
import struct
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "web", "data")
BLOCK = 8


def write_pack(path, entries):
    head = struct.pack("<4sII", b"OSKP", 1, len(entries))
    index_size = sum(2 + len(k.encode()) + 8 for k, _ in entries)
    off = len(head) + index_size
    idx, blobs = b"", b""
    for k, blob in entries:
        kb = k.encode()
        idx += struct.pack("<H", len(kb)) + kb + struct.pack("<II", off, len(blob))
        blobs += blob
        off += len(blob)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(head + idx + blobs)


def pack_region(rid):
    rdir = os.path.join(DATA, "regions", rid)
    tdir = os.path.join(rdir, "tiles")
    man_path = os.path.join(rdir, "manifest.json")
    man = json.load(open(man_path))
    if not os.path.isdir(tdir):
        print(rid, "already packed")
        return
    groups = defaultdict(list)
    for key in man["tiles"]:
        tx, ty = map(int, key.split(","))
        groups[(tx // BLOCK, ty // BLOCK)].append((key, open(os.path.join(tdir, f"{tx}_{ty}.bin.gz"), "rb").read()))
    packs = {}
    for (px, py), entries in groups.items():
        name = f"{px}_{py}.pack"
        write_pack(os.path.join(rdir, "packs", name), entries)
        packs[f"{px},{py}"] = name
    man["packBlock"] = BLOCK
    man["packs"] = packs
    json.dump(man, open(man_path, "w"), indent=1)
    shutil.rmtree(tdir)
    print(rid, len(packs), "packs")


def pack_terrain():
    tdir = os.path.join(DATA, "terrain")
    groups = defaultdict(list)
    for z in os.listdir(tdir):
        if not z.isdigit():
            continue
        for x in os.listdir(os.path.join(tdir, z)):
            for f in os.listdir(os.path.join(tdir, z, x)):
                y = int(f.split(".")[0])
                groups[(int(z), int(x) // BLOCK, y // BLOCK)].append((f"{z}/{x}/{y}", open(os.path.join(tdir, z, x, f), "rb").read()))
    index_path = os.path.join(tdir, "index.json")
    index = json.load(open(index_path)) if os.path.exists(index_path) else {"block": BLOCK, "tiles": {}}
    for (z, px, py), entries in groups.items():
        name = f"{z}_{px}_{py}.pack"
        path = os.path.join(tdir, "packs", name)
        if os.path.exists(path):  # merge with an existing pack
            entries = merge_existing(path, entries)
        write_pack(path, entries)
        for k, _ in entries:
            index["tiles"][k] = name
    json.dump(index, open(index_path, "w"), separators=(",", ":"))
    for z in os.listdir(tdir):
        if z.isdigit():
            shutil.rmtree(os.path.join(tdir, z))
    print("terrain", len(index["tiles"]), "tiles in", len(set(index["tiles"].values())), "packs")


def merge_existing(path, entries):
    b = open(path, "rb").read()
    _, _, n = struct.unpack_from("<4sII", b, 0)
    off = 12
    have = {}
    for _ in range(n):
        kl = struct.unpack_from("<H", b, off)[0]
        k = b[off + 2 : off + 2 + kl].decode()
        o, ln = struct.unpack_from("<II", b, off + 2 + kl)
        off += 2 + kl + 8
        have[k] = b[o : o + ln]
    for k, blob in entries:
        have[k] = blob
    return sorted(have.items())


if __name__ == "__main__":
    for rid in sorted(os.listdir(os.path.join(DATA, "regions"))):
        if os.path.isdir(os.path.join(DATA, "regions", rid)):
            pack_region(rid)
    pack_terrain()
