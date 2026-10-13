// Hand-built landmark models that map data does not describe in 3D:
// the Statue of Liberty, suspension-bridge towers/cables, skyscraper crowns
// (Empire State, Chrysler, One WTC), and in Los Angeles the Hollywood Sign,
// LAX Theme Building, Griffith Observatory and the Santa Monica pier wheel (decks come from
// the road data and follow the deck profile defined here). Positions and
// dimensions are from public sources and are approximate (documented in
// docs/DATA_SOURCES.md).
import * as THREE from 'three';

export class Landmarks {
  constructor(world) {
    this.world = world;
    this.bridges = new Map(); // regionId -> [{ax, ay, bx, by, len, ux, uy, deck, towerFrac}]
    this.nightMats = [];
    this.spinners = [];
  }

  addRegion(region) {
    const list = region.manifest.landmarks || [];
    const bridges = [];
    for (const lm of list) {
      if (lm.kind === 'statue') this._liberty(region, lm);
      if (lm.kind === 'suspension') bridges.push(this._bridge(region, lm));
      if (lm.kind === 'spire') this._spire(region, lm);
      if (lm.kind === 'sign') this._sign(region, lm);
      if (lm.kind === 'theme') this._theme(region, lm);
      if (lm.kind === 'observatory') this._observatory(region, lm);
      if (lm.kind === 'wheel') this._wheel(region, lm);
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

  // ground height (m) under a landmark given in region coordinates
  _ground(region, x, y) {
    const w = region.toWorld(x, y);
    return region.world.heightAt(w.x, w.y);
  }

  _std(color, rough = 0.6, metal = 0, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  }

  // Skyline crowns the footprint data cannot describe: the Empire State mooring
  // mast and antenna, the Chrysler terraced arches and needle, One WTC's spire.
  _spire(region, lm) {
    const g = new THREE.Group();
    g.name = 'landmark:' + lm.id;
    const gz = this._ground(region, lm.x, lm.y);
    const lights = [];
    const top = gz + lm.top;
    if (lm.style === 'chrysler') {
      const steel = this._std(0x8f959c, 0.32, 1.0, { envMapIntensity: 0.85 });
      const glow = this._std(0x2a3038, 0.3, 0.2, { emissive: 0x000000 });   // the triangular windows
      this.nightMats.push({ mat: glow, color: new THREE.Color(0xfff2d0) });
      // seven terraces of arches, each smaller, with a band of triangular "sunburst" windows
      let y = gz + lm.base, r = 10.5;
      for (let i = 0; i < 6; i++) {
        const h = 6.2;
        const tier = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r, h, 4, 1), steel);
        tier.rotation.y = Math.PI / 4;
        tier.position.y = y + h / 2;
        g.add(tier);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.95, 1.6, 4, 1, true), glow);
        band.rotation.y = Math.PI / 4;
        band.position.y = y + h * 0.55;
        g.add(band);
        y += h; r *= 0.78;
      }
      const needle = new THREE.Mesh(new THREE.ConeGeometry(r * 0.8, top - y, 8), steel);
      needle.position.y = y + (top - y) / 2;
      g.add(needle);
    } else if (lm.style === 'esb') {
      const lime = this._std(0xc8c0ae, 0.7);
      const lit = this._std(0xd8d4cc, 0.6, 0, { emissive: 0x000000 });
      this.nightMats.push({ mat: lit, color: new THREE.Color(0xdfe8ff) });   // the tower lights
      // observation setbacks and the art-deco mooring mast (from the 86th floor)
      const y0 = gz + lm.base - 53;
      const steps = [[11, 9, 8], [8.6, 7, 12], [6.6, 5.2, 16], [5, 3.6, 17]];
      let y = y0;
      steps.forEach(([r0, r1, h], i) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 8), i >= 2 ? lit : lime);
        m.rotation.y = Math.PI / 8;
        m.position.y = y + h / 2;
        g.add(m);
        y += h;
      });
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.3, top - y, 6), this._std(0xb9bec4, 0.4, 0.8));
      ant.position.y = y + (top - y) / 2;
      g.add(ant);
    } else {
      // slender mast with maintenance rings (One World Trade Center)
      const white = this._std(0xe9ecef, 0.35, 0.4);
      const h = lm.top - lm.base, y0 = gz + lm.base;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, h, 10), white);
      mast.position.y = y0 + h / 2;
      g.add(mast);
      for (let k = 1; k <= 6; k++) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.2 - k * 0.3, 3.2 - k * 0.3, 1.2, 12), white);
        ring.position.y = y0 + h * (k / 7) * 0.8;
        g.add(ring);
      }
    }
    lights.push([lm.x, top + 0.8, -lm.y, 1.8, 2, Math.random(), [1, 0.12, 0.05]]);
    g.position.set(lm.x, 0, -lm.y);
    region.group.add(g);
    region.lights.add(lights);
  }

  // Hollywood Sign: nine 13.7 m letters on the slope of Mount Lee
  _sign(region, lm) {
    const g = new THREE.Group();
    g.name = 'landmark:' + lm.id;
    const text = lm.text || 'HOLLYWOOD';
    const H = lm.letterHeight || 13.7, W = lm.width || 110;
    const step = W / text.length;
    const face = ((lm.headingDeg || 180) * Math.PI) / 180;   // direction the letters face (true, from north)
    // along-sign axis (to the reader's right) and facing direction, in region x (east) / y (north)
    const fx = Math.sin(face), fy = Math.cos(face);
    const rx = -fy, ry = fx;
    const mats = new Map();
    const letterMat = (ch) => {
      if (mats.has(ch)) return mats.get(ch);
      const c = document.createElement('canvas');
      c.width = 128; c.height = 160;
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.font = 'bold 150px Arial, Helvetica, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      x.fillText(ch, 64, 150);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, emissive: 0x000000, emissiveMap: t });
      this.nightMats.push({ mat: m, color: new THREE.Color(0x9a9a9a) });
      mats.set(ch, m);
      return m;
    };
    const plane = new THREE.PlaneGeometry(step * 0.92, H * 1.15);
    for (let i = 0; i < text.length; i++) {
      const off = (i - (text.length - 1) / 2) * step;
      const x = lm.x + rx * off, y = lm.y + ry * off;
      const gz = this._ground(region, x, y);
      const m = new THREE.Mesh(plane, letterMat(text[i]));
      // letters lean back slightly into the hill; staggered a little like the real sign
      m.position.set(x, gz + H * 0.55 + (i % 2) * 1.2, -y);
      m.rotation.set(0, Math.atan2(fx, -fy), 0, 'YXZ');
      m.rotateX(-0.12);
      g.add(m);
      // support frame behind each letter
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, H * 0.9, 0.4), this._std(0x6d6d6a, 0.8, 0.3));
      post.position.set(x - fx * 1.2, gz + H * 0.45, -(y - fy * 1.2));
      g.add(post);
    }
    region.group.add(g);
  }

  // LAX Theme Building: two crossed parabolic arches over a raised saucer
  _theme(region, lm) {
    const g = new THREE.Group();
    g.name = 'landmark:' + lm.id;
    const gz = this._ground(region, lm.x, lm.y);
    const white = this._std(0xf1f1ee, 0.45, 0.05, { emissive: 0x000000 });
    this.nightMats.push({ mat: white, color: new THREE.Color(0x6b4cff) });   // lit in blue/purple at night
    const H = 41, span = 28;
    for (const rot of [0.6, 0.6 + Math.PI / 2]) {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24 * 2 - 1;
        pts.push(new THREE.Vector3(t * span, H * (1 - t * t), 0));
      }
      const arch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 1.3, 8, false), white);
      arch.rotation.y = rot;
      g.add(arch);
    }
    const core = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 22, 16), white);
    core.position.y = 11;
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(13, 8, 4.5, 32), white);
    saucer.position.y = 22;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(12.2, 12.2, 2.2, 32, 1, true), this._std(0x3a5068, 0.08, 0.6, { emissive: 0x000000 }));
    glass.position.y = 23;
    this.nightMats.push({ mat: glass.material, color: new THREE.Color(0xffd9a0) });
    g.add(core, saucer, glass);
    g.position.set(lm.x, gz, -lm.y);
    region.group.add(g);
    region.lights.add([[lm.x, gz + H + 1, -lm.y, 1.4, 2, 0.3, [1, 0.1, 0.05]]]);
  }

  // Griffith Observatory: white art-deco hall with the copper planetarium dome
  // in the middle and two telescope domes at the ends
  _observatory(region, lm) {
    const g = new THREE.Group();
    g.name = 'landmark:' + lm.id;
    const gz = this._ground(region, lm.x, lm.y);
    const white = this._std(0xe9e4d8, 0.75);
    const copper = this._std(0x6f8f86, 0.5, 0.6);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(58, 10, 18), white);
    hall.position.y = 5;
    const center = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 9, 24), white);
    center.position.y = 7;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), copper);
    dome.position.y = 11.5;
    g.add(hall, center, dome);
    for (const sx of [-1, 1]) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 6, 20), white);
      drum.position.set(sx * 27, 12, 0);
      const d = new THREE.Mesh(new THREE.SphereGeometry(5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), copper);
      d.position.set(sx * 27, 15, 0);
      g.add(drum, d);
    }
    g.position.set(lm.x, gz - 1, -lm.y);
    g.rotation.y = -((lm.headingDeg || 180) * Math.PI) / 180 + Math.PI;
    region.group.add(g);
    region.lights.add([[lm.x, gz + 24, -lm.y, 1.6, 0, 0, [1, 0.95, 0.85]]]);
  }

  // Pacific Park wheel on the Santa Monica Pier: turns slowly, LED rim at night
  _wheel(region, lm) {
    const g = new THREE.Group();
    g.name = 'landmark:' + lm.id;
    const D = lm.diameter || 26, R = D / 2;
    const deck = Math.max(this._ground(region, lm.x, lm.y), 0) + 8;
    const steel = this._std(0xe8e8e8, 0.4, 0.6);
    const spin = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.35, 6, 48), steel);
    spin.add(rim);
    const spokes = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      spokes.push(0, 0, 0, Math.cos(a) * R, Math.sin(a) * R, 0);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.6), this._std(i % 2 ? 0xd8402f : 0xf2c230, 0.6));
      cab.position.set(Math.cos(a) * R, Math.sin(a) * R - 1.1, 0);
      spin.add(cab);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(spokes, 3));
    spin.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xcfcfcf })));
    spin.position.y = deck + R + 2;
    g.add(spin);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, R + 3, 8), steel);
      leg.position.set(sx * 5, deck + (R + 2) / 2, 1.5);
      leg.rotation.z = sx * 0.2;
      g.add(leg);
    }
    g.position.set(lm.x, 0, -lm.y);
    g.rotation.y = -((lm.headingDeg || 0) * Math.PI) / 180;
    region.group.add(g);
    this.spinners.push(spin);
    // LED rim lights (they turn with the wheel only in spirit: placed on the static rim circle)
    const lights = [];
    const ang = g.rotation.y;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const lx = Math.cos(a) * R, ly = Math.sin(a) * R;
      const wx = lm.x + Math.cos(-ang) * lx, wz = -lm.y + Math.sin(-ang) * lx;
      lights.push([wx, deck + R + 2 + ly, wz, 0.7, 0, 0, [[1, 0.3, 0.6], [0.3, 0.8, 1], [1, 0.85, 0.3]][i % 3]]);
    }
    region.lights.add(lights);
  }

  update() {
    const night = this.world.shared.uNight.value;
    for (const m of this.nightMats) m.mat.emissive.copy(m.color).multiplyScalar(night * 0.9);
    const t = performance.now() / 1000;
    for (const sp of this.spinners) sp.rotation.z = t * 0.12;
  }
}
