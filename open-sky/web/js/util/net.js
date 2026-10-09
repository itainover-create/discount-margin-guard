// Network helpers: gzip-aware fetch and a persistent cache for online tiles.

export async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

// Fetch a .gz file and return the decompressed bytes. Handles servers that
// already applied Content-Encoding (bytes no longer start with 1f 8b).
export async function fetchGz(url) {
  const bytes = await fetchBytes(url);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function fetchJsonGz(url) {
  const bytes = await fetchGz(url);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// Decode an image URL/blob to RGBA pixels.
export async function decodeImage(src) {
  const blob = src instanceof Blob ? src : await (await fetch(src)).blob();
  const bmp = await createImageBitmap(blob);
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const data = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close && bmp.close();
  return data;
}

// Persistent cache (Cache Storage) for tiles fetched from the internet, so
// places flown once stay available offline. Falls back to no caching.
export class TileCache {
  constructor(name) {
    this.name = name;
    this.ready = (typeof caches !== 'undefined' ? caches.open(name) : Promise.reject(new Error('no caches')))
      .catch(() => null);
    this.hits = 0;
    this.misses = 0;
  }
  async get(url, timeoutMs = 8000) {
    const cache = await this.ready;
    if (cache) {
      try {
        const hit = await cache.match(url);
        if (hit) { this.hits++; return await hit.blob(); }
      } catch { /* ignore */ }
    }
    this.misses++;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctl.signal, mode: 'cors' });
      if (!res.ok) throw new Error(String(res.status));
      if (cache) { try { await cache.put(url, res.clone()); } catch { /* quota */ } }
      return await res.blob();
    } finally {
      clearTimeout(t);
    }
  }
}
