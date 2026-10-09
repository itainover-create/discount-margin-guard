// Hand-built landmark models that map data does not describe in 3D:
// the Statue of Liberty and suspension-bridge towers/cables (decks come from
// the road data and follow the deck profile defined here). Positions and
// dimensions are from public sources and are approximate (documented in
// docs/DATA_SOURCES.md).
import * as THREE from 'three';

export class Landmarks {
  constructor(world) {
    this.world = world;
    this.bridges = new Map(); // regionId -> [{ax, ay, bx, by, len, ux, uy, deck, towerFrac}]
    this.nightMats = [];
  }

  addRegion(region) {
    const list = region.manifest.landmarks || [];
    const bridges = [];
    for (const lm of list) {
      if (lm.kind === 'statue') this._liberty(region, lm);
      if (lm.kind === 'suspension') bridges.push(this._bridge(region, lm));
    }
    this.bridges.set(region.id, bridges);
  }

  // Deck height (m) for a road point near a landmark bridge axis, else null.
  deckHeight(regionId, x, y) {
    const list = this.bridges.get(regionId);
    if (!list) return null;
    for (const b of list) {
      const dx = x - b.ax, dy = y - b.ay;
      const s = dx * b.ux + dy * b.uy;
      const l = Math.abs(-dx * b.uy + dy * b.ux);
      if (l > 45 || s < -30 || s > b.len + 30) continue;
      const t = Math.min(1, Math.max(0, s / b.len));
      const e = Math.abs(t - 0.5) * 2;               // 0 centre .. 1 ends
      const k = Math.max(0, (e - b.towerFrac) / (1 - b.towerFrac));
      const crown = 1 - 0.06 * (e / Math.max(b.towerFrac, 0.01)) * (e < b.towerFrac ? 1 : 0);
      return Math.max(8, b.deck * crown - (b.deck - 10) * Math.pow(k, 1.15));
    }
    return null;
  }

  _bridge(region, lm) {
    const [a, b] = lm.endsXY;
    const [t1, t2] = lm.towersXY;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const span = Math.hypot(t2[0] - t1[0], t2[1] - t1[1]);
    const info = { ax: a[0], ay: a[1], len, ux, uy, deck: lm.deck, towerFrac: Math.min(0.95, span / len) };
    const g = new THREE.Group();
    g.name = 'landmark:' + lm.id;
    const steel = new THREE.MeshLambertMaterial({ color: lm.stone ? 0xb9a98e : 0x9ea4a8 });
    const H = lm.towerHeight;
    const nx = -uy, ny = ux;
    const halfW = lm.stone ? 13 : 17;
    const towers = [t1, t2];
    for (const t of towers) {
      const base = Math.max(region.world.heightAt(...Object.values(region.toWorld(t[0], t[1]))), 0) - 2;
      const ang = -Math.atan2(ux, uy);
      if (lm.stone) {
        // masonry tower with two gothic openings (approximated as three piers)
        for (const k of [-1, 0, 1]) {
          const pier = new THREE.Mesh(new THREE.BoxGeometry(k === 0 ? 6 : 7, H - base, 12), steel);
          pier.position.set(t[0] + nx * k * 10, base + (H - base) / 2, -(t[1] + ny * k * 10));
          pier.rotation.y = ang;
          g.add(pier);
        }
        const top = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 13), steel);
        top.position.set(t[0], H - 7, -t[1]);
        top.rotation.y = ang;
        g.add(top);
      } else {
        for (const side of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(6, H - base, 7), steel);
          leg.position.set(t[0] + nx * side * halfW, base + (H - base) / 2, -(t[1] + ny * side * halfW));
          leg.rotation.y = ang;
          g.add(leg);
        }
        for (const hz of [lm.deck - 4, H * 0.62, H * 0.82, H - 3]) {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 6, 4, 6), steel);
          beam.position.set(t[0], hz, -t[1]);
          beam.rotation.y = ang;
          g.add(beam);
        }
      }
    }
    // main cables (two) and suspenders
    const cablePts = [];
    const lights = [];
    const susp = [];
    const sT1 = (t1[0] - a[0]) * ux + (t1[1] - a[1]) * uy, sT2 = (t2[0] - a[0]) * ux + (t2[1] - a[1]) * uy;
    const cableZ = (s) => {
      if (s <= sT1) return lm.deck + 6 + (H - 4 - lm.deck - 6) * (s / sT1);
      if (s >= sT2) return lm.deck + 6 + (H - 4 - lm.deck - 6) * ((len - s) / (len - sT2));
      const t = (s - sT1) / (sT2 - sT1);
      const sag = 4 * t * (1 - t);
      return H - 4 - (H - 4 - (lm.deck + 4)) * sag;
    };
    for (const side of [-1, 1]) {
      const pts = [];
      for (let s = 0; s <= len; s += 12) {
        const x = a[0] + ux * s + nx * side * halfW, y = a[1] + uy * s + ny * side * halfW;
        const z = cableZ(s);
        pts.push(new THREE.Vector3(x, z, -y));
        if (Math.round(s / 12) % 2 === 0) lights.push([x, z + 0.5, -y, 0.55, 5, 0, [1, 0.95, 0.85]]);
        if (s > sT1 && s < sT2) susp.push(x, z, -y, x, lm.deck + 1, -y);
      }
      cablePts.push(pts);
    }
    const cableMat = new THREE.LineBasicMaterial({ color: 0x777c80 });
    for (const pts of cablePts) {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.6, 5, false), steel);
      g.add(tube);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(susp, 3));
    g.add(new THREE.LineSegments(sg, cableMat));
    // tower top aviation lights
    for (const t of towers) lights.push([t[0], H + 1.5, -t[1], 1.5, 6, Math.random(), [1, 0.1, 0.05]]);
    region.lights.add(lights);
    region.group.add(g);
    return info;
  }

  _liberty(region, lm) {
    const g = new THREE.Group();
    g.name = 'landmark:liberty';
    const granite = new THREE.MeshLambertMaterial({ color: 0xc9c2b4 });
    const stone = new THREE.MeshLambertMaterial({ color: 0xa79f90 });
    const copper = new THREE.MeshLambertMaterial({ color: 0x6fa898, emissive: 0x000000 });
    this.nightMats.push({ mat: copper, color: new THREE.Color(0x2e5a50) });
    const w = region.toWorld(lm.x, lm.y);
    const base = Math.max(region.world.heightAt(w.x, w.y), 1.5);
    // Fort Wood: 11-point star
    const star = new THREE.Shape();
    const pts = 22;
    for (let i = 0; i <= pts; i++) {
      const r = i % 2 ? 30 : 48;
      const a = (i / pts) * Math.PI * 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) star.moveTo(x, y); else star.lineTo(x, y);
    }
    const fort = new THREE.Mesh(new THREE.ExtrudeGeometry(star, { depth: 7, bevelEnabled: false }), stone);
    fort.rotation.x = -Math.PI / 2;
    fort.position.y = base;
    g.add(fort);
    // pedestal (tapered) and plinth
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 14, 27, 4), granite);
    ped.rotation.y = Math.PI / 4;
    ped.position.y = base + 7 + 13.5;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(17, 8, 17), granite);
    plinth.position.y = base + 34 + 4;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(13, 5, 13), granite);
    cap.position.y = base + 42 + 2.5;
    g.add(ped, plinth, cap);
    // statue (46 m): robe, torso, head + crown, raised arm + torch, tablet
    const s0 = base + 47;
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 6.2, 22, 12), copper);
    robe.position.y = s0 + 11;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 8, 12), copper);
    torso.position.y = s0 + 26;
    const head = new THREE.Mesh(new THREE.SphereGeometry(2.7, 12, 10), copper);
    head.position.y = s0 + 32.5;
    g.add(robe, torso, head);
    for (let i = 0; i < 7; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3.2, 4), copper);
      const a = (-0.9 + (i / 6) * 1.8) + Math.PI / 2;
      spike.position.set(Math.cos(a) * 2.6, s0 + 34.2, Math.sin(a) * 2.6);
      spike.rotation.z = -Math.cos(a) * 0.9;
      spike.rotation.x = Math.sin(a) * 0.9;
      g.add(spike);
    }
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 13, 8), copper);
    arm.position.set(2.8, s0 + 34, 0);
    arm.rotation.z = -0.18;
    const torch = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.8, 3, 10), copper);
    torch.position.set(4.0, s0 + 41.5, 0);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.8, 10), new THREE.MeshBasicMaterial({ color: 0xffc04a }));
    flame.position.set(4.0, s0 + 44.4, 0);
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(1.0, 7, 4.2), copper);
    tablet.position.set(-4.2, s0 + 25, 0.5);
    tablet.rotation.z = 0.25;
    g.add(arm, torch, flame, tablet);
    // statue faces south-east (toward the harbour entrance)
    g.position.set(lm.x, 0, -lm.y);
    g.rotation.y = -2.2;
    region.group.add(g);
    region.lights.add([[lm.x, s0 + 45, -lm.y, 2.0, 0, 0, [1, 0.8, 0.4]]]);
  }

  update() {
    const night = this.world.shared.uNight.value;
    for (const m of this.nightMats) m.mat.emissive.copy(m.color).multiplyScalar(night * 0.9);
  }
}
