"""Minimal Overture Maps reader: HTTP range requests against the public
GeoParquet release on S3 (no AWS SDK / DuckDB extension needed). Uses the
row-group bbox statistics to read only the data intersecting a region."""
import io
import json
import os
import re
import sys
import hashlib
import requests
import pyarrow.parquet as pq

BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com"
RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-09-23.1")
CACHE = os.environ.get("OSK_CACHE", os.path.join(os.path.dirname(__file__), "..", ".cache"))
SESSION = requests.Session()


class HttpRangeFile(io.RawIOBase):
    """Seekable read-only file over HTTP range requests with a block cache."""

    BLOCK = 1 << 20

    def __init__(self, url, size):
        self.url, self.size, self.pos = url, size, 0
        self.blocks = {}

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else (self.pos + off if whence == 1 else self.size + off)
        return self.pos

    def _block(self, i):
        if i not in self.blocks:
            a = i * self.BLOCK
            b = min(self.size, a + self.BLOCK) - 1
            for attempt in range(5):
                try:
                    r = SESSION.get(self.url, headers={"Range": f"bytes={a}-{b}"}, timeout=120)
                    r.raise_for_status()
                    self.blocks[i] = r.content
                    break
                except Exception:
                    if attempt == 4:
                        raise
            if len(self.blocks) > 400:
                self.blocks.pop(next(iter(self.blocks)))
        return self.blocks[i]

    def readinto(self, buf):
        n = min(len(buf), self.size - self.pos)
        if n <= 0:
            return 0
        out = memoryview(buf)
        done = 0
        while done < n:
            i = (self.pos + done) // self.BLOCK
            off = (self.pos + done) % self.BLOCK
            blk = self._block(i)
            k = min(n - done, len(blk) - off)
            out[done : done + k] = blk[off : off + k]
            done += k
        self.pos += n
        return n


def list_files(theme, typ):
    cache = os.path.join(CACHE, "overture", RELEASE, f"{theme}-{typ}-files.json")
    if os.path.exists(cache):
        return json.load(open(cache))
    files, token = [], None
    while True:
        url = f"{BUCKET}/?list-type=2&prefix=release/{RELEASE}/theme={theme}/type={typ}/"
        if token:
            url += "&continuation-token=" + requests.utils.quote(token, safe="")
        x = SESSION.get(url, timeout=60).text
        for key, size in re.findall(r"<Key>([^<]+)</Key>.*?<Size>(\d+)</Size>", x):
            if key.endswith(".parquet"):
                files.append({"key": key, "size": int(size)})
        m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", x)
        if not m:
            break
        token = m.group(1)
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    json.dump(files, open(cache, "w"))
    return files


def _footer_index(f):
    """Row-group bbox index for one file, cached on disk."""
    key = hashlib.md5(f["key"].encode()).hexdigest()
    path = os.path.join(CACHE, "overture", RELEASE, "index", key + ".json")
    if os.path.exists(path):
        return json.load(open(path))
    pf = pq.ParquetFile(HttpRangeFile(f"{BUCKET}/{f['key']}", f["size"]))
    md = pf.metadata
    names = [md.schema.column(i).path for i in range(md.num_columns)]
    idx = {n: i for i, n in enumerate(names)}
    groups = []
    for g in range(md.num_row_groups):
        rg = md.row_group(g)

        def st(col, which):
            s = rg.column(idx[col]).statistics
            return (s.min if which == "min" else s.max) if s is not None and s.has_min_max else None

        groups.append([st("bbox.xmin", "min"), st("bbox.xmax", "max"), st("bbox.ymin", "min"), st("bbox.ymax", "max"), rg.num_rows])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump({"groups": groups, "columns": names}, open(path, "w"))
    return {"groups": groups, "columns": names}


def read_bbox(theme, typ, bbox, columns, log=print):
    """Yield pyarrow tables for row groups whose bbox intersects bbox=(w,s,e,n)."""
    w, s, e, n = bbox
    files = list_files(theme, typ)
    for fi, f in enumerate(files):
        idx = _footer_index(f)
        hits = [g for g, (x0, x1, y0, y1, _) in enumerate(idx["groups"])
                if x0 is not None and not (x1 < w or x0 > e or y1 < s or y0 > n)]
        if not hits:
            continue
        log(f"  {theme}/{typ} file {fi + 1}/{len(files)}: {len(hits)} row groups")
        pf = pq.ParquetFile(HttpRangeFile(f"{BUCKET}/{f['key']}", f["size"]))
        cols = [c for c in columns if c in pf.schema_arrow.names]
        for g in hits:
            yield pf.read_row_group(g, columns=cols)


if __name__ == "__main__":
    theme, typ = sys.argv[1], sys.argv[2]
    fs = list_files(theme, typ)
    print(len(fs), "files", sum(f["size"] for f in fs) / 1e9, "GB")
