// Decoder for baked region tiles ("OSKT", see tools/bake_region.py).
// Coordinates are returned in the region frame (metres).

export function decodeTile(bytes, tx, ty, tileSize, quant) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'OSKT') throw new Error('bad tile');
  const ox = tx * tileSize + tileSize / 2, oy = ty * tileSize + tileSize / 2;
  const out = { tx, ty, buildings: [], lines: [], polys: [], points: [] };
  let off = 8;
  while (off < bytes.length) {
    const kind = dv.getUint8(off);
    const len = dv.getUint32(off + 4, true);
    off += 8;
    const end = off + len;
    if (kind === 1) readBuildings(dv, off, out.buildings, ox, oy, quant);
    else if (kind === 2) readLines(dv, off, out.lines, ox, oy, quant);
    else if (kind === 3) readPolys(dv, off, out.polys, ox, oy, quant);
    else if (kind === 4) readPoints(dv, off, out.points, ox, oy, quant);
    off = end;
  }
  return out;
}

function readRings(dv, off, ox, oy, q) {
  const nr = dv.getUint8(off);
  off += 1;
  const rings = [];
  for (let r = 0; r < nr; r++) {
    const n = dv.getUint16(off, true);
    off += 2;
    const pts = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      pts[i * 2] = ox + dv.getInt16(off, true) * q;
      pts[i * 2 + 1] = oy + dv.getInt16(off + 2, true) * q;
      off += 4;
    }
    rings.push(pts);
  }
  return { rings, off };
}

function readBuildings(dv, off, list, ox, oy, q) {
  const n = dv.getUint32(off, true);
  off += 4;
  for (let i = 0; i < n; i++) {
    const b = {
      sub: dv.getUint8(off), roof: dv.getUint8(off + 1), flags: dv.getUint16(off + 2, true),
      h: dv.getFloat32(off + 4, true), minH: dv.getFloat32(off + 8, true),
      color: dv.getUint32(off + 12, true), roofColor: dv.getUint32(off + 16, true),
      roofH: dv.getFloat32(off + 20, true), hash: dv.getUint32(off + 24, true),
    };
    off += 28;
    const r = readRings(dv, off, ox, oy, q);
    b.rings = r.rings;
    off = r.off;
    list.push(b);
  }
}

function readLines(dv, off, list, ox, oy, q) {
  const n = dv.getUint32(off, true);
  off += 4;
  for (let i = 0; i < n; i++) {
    const cls = dv.getUint8(off), flags = dv.getUint8(off + 1), level = dv.getInt8(off + 2);
    const np = dv.getUint16(off + 4, true);
    off += 6;
    const pts = new Float64Array(np * 2);
    for (let k = 0; k < np; k++) {
      pts[k * 2] = ox + dv.getInt16(off, true) * q;
      pts[k * 2 + 1] = oy + dv.getInt16(off + 2, true) * q;
      off += 4;
    }
    list.push({ cls, flags, level, pts });
  }
}

function readPolys(dv, off, list, ox, oy, q) {
  const n = dv.getUint32(off, true);
  off += 4;
  for (let i = 0; i < n; i++) {
    const layer = dv.getUint8(off), code = dv.getUint8(off + 1);
    off += 4;
    const r = readRings(dv, off, ox, oy, q);
    off = r.off;
    list.push({ layer, code, rings: r.rings });
  }
}

function readPoints(dv, off, list, ox, oy, q) {
  const n = dv.getUint32(off, true);
  off += 4;
  for (let i = 0; i < n; i++) {
    list.push({ kind: dv.getUint8(off), x: ox + dv.getInt16(off + 2, true) * q, y: oy + dv.getInt16(off + 4, true) * q, h: dv.getUint16(off + 6, true) / 10 });
    off += 8;
  }
}
