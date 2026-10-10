// En-route traffic: airliners cruising between real large airports through
// the player's airspace (flight levels by the semicircular rule, Mach ~0.8,
// contrails high up). They appear on TCAS / ND. Airport traffic (taxi,
// takeoff, landing) is the C++ runway authority's job (sim/traffic.js).
import * as THREE from 'three';
import { createAIAircraft } from '../aircraft/models.js';
import { haversine } from '../world/geo.js';

const D2R = Math.PI / 180;
const AIRLINES = ['ORN', 'GSK', 'HZN', 'MRD', 'AUR', 'TTN', 'ZPH', 'VGA'];

export class EnrouteTraffic {
  constructor(game) {
    this.g = game;
    this.flights = [];
    this.max = 6;
    this.t = 0;
    this.hubs = null;
  }

  reset() {
    for (const f of this.flights) this.g.world.scene.remove(f.obj);
    this.flights.length = 0;
    this.hubs = null;
  }

  rebase(a) { for (const f of this.flights) { f.x = a.sx * f.x + a.tx; f.y += a.ty; } }

  // traffic for TCAS / ND
  list() { return this.flights.map((f) => ({ x: f.x, y: f.y, z: f.z, callsign: f.callsign })); }

  _hubs() {
    if (this.hubs) return this.hubs;
    const w = this.g.world, ll = w.frame.toLatLon(this.g.player.o.x, this.g.player.o.y);
    const rows = w.airportDb.rows.filter((r) => r[9] === 'L' && r[10]);
    this.hubs = rows.map((r) => ({ r, d: haversine(ll.lat, ll.lon, r[6], r[7]) })).filter((h) => h.d < 3000000).sort((a, b) => a.d - b.d).slice(0, 80);
    return this.hubs;
  }

  spawn() {
    const g = this.g, w = g.world, o = g.player.o;
    const hubs = this._hubs();
    if (hubs.length < 4) return;
    // a point in the player's airspace and a far destination; the origin lies behind it
    const a = Math.random() * Math.PI * 2, r = 30000 + Math.random() * 80000;
    const x = o.x + Math.cos(a) * r, y = o.y + Math.sin(a) * r;
    const far = hubs.filter((h) => h.d > 250000);
    const dest = far[Math.floor(Math.random() * far.length)];
    if (!dest) return;
    const dp = w.frame.toXY(dest.r[6], dest.r[7]);
    const brg = Math.atan2(dp.x - x, dp.y - y);
    let origin = null, best = -1e9;
    for (const h of far) {
      if (h === dest) continue;
      const hp = w.frame.toXY(h.r[6], h.r[7]);
      const back = Math.cos(Math.atan2(hp.x - x, hp.y - y) - brg + Math.PI);  // 1 = straight behind
      if (back > best) { best = back; origin = h; }
    }
    // semicircular rule: eastbound odd levels, westbound even
    const hdgDeg = ((brg / D2R) + 360) % 360;
    const east = hdgDeg < 180;
    const levels = east ? [290, 310, 330, 350, 370, 390] : [280, 300, 320, 340, 360, 380];
    const fl = levels[Math.floor(Math.random() * levels.length)];
    const type = Math.random() < 0.35 ? 2 : 0;
    const obj = createAIAircraft(type, Math.floor(Math.random() * 6));
    if (obj.userData.gear) obj.userData.gear.visible = false;
    w.scene.add(obj);
    const al = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
    this.flights.push({
      obj, type, x, y, z: fl * 100 * 0.3048, hdg: brg, tas: 225 + Math.random() * 25,
      dest, origin, callsign: `${al}${100 + Math.floor(Math.random() * 899)}`, fl,
      route: `${origin ? (origin.r[1] || origin.r[0]) : '???'} → ${dest.r[1] || dest.r[0]}`, trail: 0,
      span: type === 2 ? 60 : 35,
    });
  }

  update(dt) {
    const g = this.g, o = g.player.o;
    if (!g.world.airportDb) return;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 1.5;
      if (this.flights.length < this.max) this.spawn();
    }
    const fx = g.fx;
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      // steer toward the destination (great circle ≈ local bearing at these ranges)
      const dp = g.world.frame.toXY(f.dest.r[6], f.dest.r[7]);
      const want = Math.atan2(dp.x - f.x, dp.y - f.y);
      let d = want - f.hdg;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      f.hdg += Math.max(-0.02, Math.min(0.02, d)) * dt;
      f.x += Math.sin(f.hdg) * f.tas * dt;
      f.y += Math.cos(f.hdg) * f.tas * dt;
      const dist = Math.hypot(f.x - o.x, f.y - o.y);
      if (dist > 140000) { g.world.scene.remove(f.obj); this.flights.splice(i, 1); continue; }
      f.obj.position.set(f.x, f.z, -f.y);
      f.obj.rotation.set(0, -f.hdg, 0, 'YXZ');
      // contrails (cold, moist air above ~26,000 ft)
      f.trail -= dt;
      if (fx && f.z > 7900 && f.trail <= 0) {
        f.trail = 0.35;
        const back = new THREE.Vector3(-Math.sin(f.hdg), 0, Math.cos(f.hdg));
        const side = new THREE.Vector3(Math.cos(f.hdg), 0, Math.sin(f.hdg));
        for (const s of [-1, 1]) {
          const p = f.obj.position.clone().addScaledVector(back, f.span * 0.4).addScaledVector(side, s * f.span * 0.17);
          fx.smoke.emit(p, new THREE.Vector3(0, 0, 0), 45, 5, 2.2, [0.95, 0.96, 0.98], 0.42, 0.0, 0);
        }
      }
    }
  }
}
