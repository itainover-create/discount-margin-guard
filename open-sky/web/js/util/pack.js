// Reader for "OSKP" data packs (see tools/pack_data.py): one HTTP request
// fetches a spatial block of tiles; entries are sliced out on demand.
import { fetchBytes } from './net.js';

export class PackStore {
  constructor(maxPacks = 48) {
    this.packs = new Map(); // url -> Promise<Map<key, Uint8Array>>
    this.order = [];
    this.maxPacks = maxPacks;
    this.bytesLoaded = 0;
  }
  load(url) {
    let p = this.packs.get(url);
    if (!p) {
      p = fetchBytes(url).then((bytes) => {
        this.bytesLoaded += bytes.byteLength;
        const buf = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
        return parsePack(buf);
      });
      p.catch(() => this.packs.delete(url));
      this.packs.set(url, p);
      this.order.push(url);
      while (this.order.length > this.maxPacks) this.packs.delete(this.order.shift());
    }
    return p;
  }
  async get(url, key) {
    const m = await this.load(url);
    return m.get(key) || null;
  }
}

export function parsePack(buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'OSKP') throw new Error('bad pack');
  const n = dv.getUint32(8, true);
  let off = 12;
  const dec = new TextDecoder();
  const map = new Map();
  for (let i = 0; i < n; i++) {
    const kl = dv.getUint16(off, true);
    const key = dec.decode(new Uint8Array(buf, off + 2, kl));
    const o = dv.getUint32(off + 2 + kl, true);
    const len = dv.getUint32(off + 6 + kl, true);
    map.set(key, new Uint8Array(buf, o, len));
    off += 2 + kl + 8;
  }
  return map;
}
