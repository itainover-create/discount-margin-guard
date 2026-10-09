// Geographic frames. A GeoFrame is a local equirectangular projection around
// an origin (x east, y north, metres) — identical to tools/bake_region.py.
// Converting between two GeoFrames is an exact affine map (x scale + offset),
// which lets the world "rebase" its origin anywhere on Earth while keeping
// baked region data, terrain and physics consistent (floating origin).
export const R_EARTH = 6371008.8;
const D2R = Math.PI / 180;

export class GeoFrame {
  constructor(lat0, lon0) {
    this.lat0 = lat0;
    this.lon0 = lon0;
    this.kx = R_EARTH * Math.cos(lat0 * D2R) * D2R;
    this.ky = R_EARTH * D2R;
  }
  toXY(lat, lon, out = {}) {
    let dl = lon - this.lon0;
    if (dl > 180) dl -= 360;
    if (dl < -180) dl += 360;
    out.x = dl * this.kx;
    out.y = (lat - this.lat0) * this.ky;
    return out;
  }
  toLatLon(x, y, out = {}) {
    out.lat = this.lat0 + y / this.ky;
    let lon = this.lon0 + x / this.kx;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    out.lon = lon;
    return out;
  }
  // Affine map from this frame to `other`: x' = sx*x + tx, y' = y + ty
  affineTo(other) {
    const o = other.toXY(this.lat0, this.lon0);
    return { sx: other.kx / this.kx, tx: o.x, ty: o.y };
  }
}

// Great-circle distance (m) and initial bearing (deg true).
export function haversine(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dp = (lat2 - lat1) * D2R, dl = (lon2 - lon1) * D2R;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}
export function bearing(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / D2R) + 360) % 360;
}
// Intermediate point along a great circle (f in 0..1).
export function gcInterpolate(lat1, lon1, lat2, lon2, f) {
  const p1 = lat1 * D2R, l1 = lon1 * D2R, p2 = lat2 * D2R, l2 = lon2 * D2R;
  const d = haversine(lat1, lon1, lat2, lon2) / R_EARTH;
  if (d < 1e-9) return { lat: lat1, lon: lon1 };
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / D2R, lon: Math.atan2(y, x) / D2R };
}

// Web-Mercator tile helpers (Terrarium terrain tiles).
export function lonToTileX(lon, z) { return ((lon + 180) / 360) * (1 << z); }
export function latToTileY(lat, z) {
  const r = lat * D2R;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z);
}
export function tileXToLon(x, z) { return (x / (1 << z)) * 360 - 180; }
export function tileYToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / (1 << z);
  return Math.atan(Math.sinh(n)) / D2R;
}

// Three.js mapping: X = east, Y = up, Z = -north.
export function enuToThree(x, y, z, v) { v.set(x, z, -y); return v; }
