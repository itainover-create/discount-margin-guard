// Visual consequences of damage and engines: fire, smoke, fuel vapour,
// sparks, contrails, crash fireball, and debris (separated wing / tail
// sections tumbling to the ground). Particles live in world space (three
// coordinates) and follow the floating-origin rebase.
import * as THREE from 'three';
import { logDepth } from '../world/shaders.js';

const MAX = 6000;

function particleMaterial(additive) {
  const sh = logDepth(`
      attribute vec4 aColor; attribute float aSize; attribute float aSeed;
      varying vec4 vColor; varying float vSeed;
      uniform float uScale;
      void main() {
        vColor = aColor; vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uScale / max(0.5, -mv.z), 0.0, 512.0);
        gl_Position = projectionMatrix * mv;
      }`, `
      varying vec4 vColor; varying float vSeed;
      uniform float uSoft; uniform vec3 uSunDir; uniform vec3 uLight;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d) * 4.0;
        if (r > 1.0) discard;
        float a = vColor.a * (1.0 - r) * (1.0 - r);
        vec3 col = vColor.rgb;
        if (uSoft > 0.5) {
          // billowy edge: noise eats into the disc, rotated per particle
          float ang = vSeed * 6.2831;
          vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d;
          float n = vn(q * 5.0 + vSeed * 17.0) * 0.6 + vn(q * 11.0 - vSeed * 9.0) * 0.4;
          a *= smoothstep(0.15, 0.75, n + (1.0 - r) * 0.55);
          // lit from above: the sunward side of each puff is brighter
          float top = clamp(0.5 - d.y * 1.6, 0.0, 1.0);
          col = col * (0.75 + 0.5 * top) + uLight * top * 0.12 * (1.0 - vColor.r);
        }
        gl_FragColor = vec4(col, a);
      }`);
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 }, uSoft: { value: additive ? 0 : 1 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uLight: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: sh.vertexShader,
    fragmentShader: sh.fragmentShader,
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

class Pool {
  constructor(scene, additive, name) {
    this.n = 0;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4);
    this.size = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.age = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);
    this.rgb = new Float32Array(MAX * 3);
    this.a0 = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.lift = new Float32Array(MAX);
    this.seed = new Float32Array(MAX);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.points = new THREE.Points(g, particleMaterial(additive));
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 8 : 7;
    this.points.name = name;
    this.soft = !additive;
    scene.add(this.points);
  }
  emit(p, v, life, size, grow, rgb, alpha, drag = 0.5, lift = 0) {
    let i = this.n;
    if (i >= MAX) { i = Math.floor(Math.random() * MAX); } else this.n++;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life; this.age[i] = 0; this.size[i] = size; this.grow[i] = grow;
    this.rgb.set(rgb, i * 3); this.a0[i] = alpha; this.drag[i] = drag; this.lift[i] = lift; this.seed[i] = Math.random();
  }
  update(dt) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const age = this.age[i] + dt;
      if (age >= this.life[i]) continue;
      if (w !== i) {
        this.pos.copyWithin(w * 3, i * 3, i * 3 + 3); this.vel.copyWithin(w * 3, i * 3, i * 3 + 3); this.rgb.copyWithin(w * 3, i * 3, i * 3 + 3);
        this.life[w] = this.life[i]; this.size[w] = this.size[i]; this.grow[w] = this.grow[i]; this.a0[w] = this.a0[i]; this.drag[w] = this.drag[i]; this.lift[w] = this.lift[i]; this.seed[w] = this.seed[i];
      }
      this.age[w] = age;
      const k = Math.exp(-this.drag[w] * dt);
      this.vel[w * 3] *= k; this.vel[w * 3 + 1] = this.vel[w * 3 + 1] * k + this.lift[w] * dt; this.vel[w * 3 + 2] *= k;
      this.pos[w * 3] += this.vel[w * 3] * dt; this.pos[w * 3 + 1] += this.vel[w * 3 + 1] * dt; this.pos[w * 3 + 2] += this.vel[w * 3 + 2] * dt;
      this.size[w] += this.grow[w] * dt;
      const t = age / this.life[w];
      const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      if (this.soft) {
        // smoke disperses: dark soot greys out and thins as it ages
        const k2 = Math.min(1, t * 1.3);
        this.col[w * 4] = this.rgb[w * 3] + (0.46 - this.rgb[w * 3]) * k2 * 0.7;
        this.col[w * 4 + 1] = this.rgb[w * 3 + 1] + (0.46 - this.rgb[w * 3 + 1]) * k2 * 0.7;
        this.col[w * 4 + 2] = this.rgb[w * 3 + 2] + (0.48 - this.rgb[w * 3 + 2]) * k2 * 0.7;
        this.col[w * 4 + 3] = this.a0[w] * fade * (1 - t * 0.45);
      } else {
        this.col[w * 4] = this.rgb[w * 3]; this.col[w * 4 + 1] = this.rgb[w * 3 + 1]; this.col[w * 4 + 2] = this.rgb[w * 3 + 2];
        this.col[w * 4 + 3] = this.a0[w] * fade;
      }
      w++;
    }
    this.n = w;
    this.geo.setDrawRange(0, w);
    for (const a of ['position', 'aColor', 'aSize', 'aSeed']) this.geo.attributes[a].needsUpdate = true;
  }
  shift(sx, tx, tz) {
    for (let i = 0; i < this.n; i++) { this.pos[i * 3] = sx * this.pos[i * 3] + tx; this.pos[i * 3 + 2] += tz; }
  }
}

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

export class DamageFX {
  constructor(world) {
    this.world = world;
    this.glow = new Pool(world.scene, true, 'fx-fire');
    this.smoke = new Pool(world.scene, false, 'fx-smoke');
    this.debris = [];
    this.acc = 0;
    this.lastLost = 0;
    this.crashed = false;
  }

  reset() {
    this.glow.n = this.smoke.n = 0;
    for (const d of this.debris) this.world.scene.remove(d.obj);
    this.debris.length = 0;
    this.lastLost = 0;
    this.crashed = false;
  }

  rebase(a) {
    this.glow.shift(a.sx, a.tx, -a.ty);
    this.smoke.shift(a.sx, a.tx, -a.ty);
    for (const d of this.debris) { d.obj.position.x = a.sx * d.obj.position.x + a.tx; d.obj.position.z -= a.ty; }
  }

  // player: PlayerAircraft (model parts, outputs)
  update(dt, player, camera, renderer) {
    const o = player.o, m = player.model, P = m.parts || {}, root = player.root;
    const vel = tmp2.set(o.ve, o.vu, -o.vn);
    const scale = Math.max(0.4, (player.size || 11) / 35);
    this.smoke.points.material.uniforms.uLight.value.copy(this.world.shared.uSunColor.value);
    this.acc += dt;
    const step = 1 / 40;
    const n = Math.min(4, Math.floor(this.acc / step));
    this.acc -= n * step;
    const world = (local) => tmp.copy(local).applyMatrix4(root.matrixWorld);
    const jitter = (s) => new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    for (let k = 0; k < n; k++) {
      const engines = P.engines || [];
      engines.forEach((e, i) => {
        const fire = (o.fireMask >> i) & 1;
        const dmg = o['dmgEng' + i] || 0;
        const p = world(e.nozzle).clone();
        if (fire) {
          for (let j = 0; j < 3; j++) this.glow.emit(p.clone().add(jitter(1.2 * scale)), vel.clone().multiplyScalar(0.55).add(jitter(4)), 0.35 + Math.random() * 0.3, 2.2 * scale, 5 * scale, [1, 0.45 + Math.random() * 0.2, 0.08], 0.85, 1.5, 3);
          this.smoke.emit(p.clone().add(jitter(0.6 * scale)), vel.clone().multiplyScalar(0.4).add(jitter(2.5)), 6, 2.2 * scale, 6.5 * scale, [0.1, 0.1, 0.1], 0.38, 0.8, 2.5);
        } else if (dmg > 0.3 && !o.crashed) {
          this.smoke.emit(p.clone(), vel.clone().multiplyScalar(0.5).add(jitter(1)), 4, 1.5 * scale, 3 * scale, [0.35, 0.35, 0.36], 0.35 * Math.min(1, dmg), 0.8, 1);
        }
        // contrails: cold air high up, engines running
        if (!fire && ((o.engMask >> i) & 1) && o.alt > 7900 && player.isJet && k === 0) {
          this.smoke.emit(p.clone(), vel.clone().multiplyScalar(0.9), 14, 0.9 * scale, 1.4 * scale, [0.95, 0.96, 0.98], 0.32, 0.05, 0);
        }
      });
      // wingtip vortices made visible: condensation in hard pulls, and on a
      // humid approach with the flaps out (wisps that trail and fade fast)
      const L = m.lights;
      if (L && L.navL && L.navR && !o.crashed && o.tas > 55 && k % 2 === 0) {
        const humid = this.world.weather ? Math.min(1, (this.world.weather.state.precip || 0) + (this.world.weather.overcastFactor ? this.world.weather.overcastFactor() * 0.6 : 0)) : 0;
        const pull = Math.max(0, (o.nz || 1) - 1.7) / 2.5;
        const flaps = Math.min(1, (o.flapsDeg || 0) / 25) * (o.alpha || 0) > 0.08 ? humid * 0.8 : 0;
        const vap = Math.min(1, pull * (0.5 + humid) + flaps);
        if (vap > 0.08) {
          for (const tip of [L.navL, L.navR]) {
            this.smoke.emit(world(tip).clone(), vel.clone().multiplyScalar(0.92), 0.9 + vap, 0.25 * scale + 0.15, 0.9 * scale, [0.96, 0.97, 0.99], 0.35 * vap, 0.1, 0);
          }
        }
      }
      // fuel vapour from leaking wings
      if (o.fuelLeak > 0.05 && P.wing && !o.crashed) for (const w of P.wing) {
        const d = w.side < 0 ? o.dmgWingL : o.dmgWingR;
        if (d > 0.15) this.smoke.emit(world(w.mid).clone(), vel.clone().multiplyScalar(0.75).add(jitter(1)), 3, 1.2 * scale, 3 * scale, [0.92, 0.94, 0.96], 0.4, 0.6, 0);
      }
      // sparks while metal scrapes the runway
      if (o.scrape > 0.05 && o.gs > 5) {
        const p = new THREE.Vector3(o.x, this.world.heightAt(o.x, o.y) + 0.2, -o.y);
        for (let j = 0; j < 4; j++) this.glow.emit(p.clone().add(jitter(player.size * 0.3)), new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 4, (Math.random() - 0.5) * 8).add(vel.clone().multiplyScalar(0.6)), 0.3 + Math.random() * 0.3, 0.35, 0, [1, 0.8, 0.4], 1, 2, -9);
      }
      // a wing root on fire after separation
      if (P.wing) for (const w of P.wing) {
        if (!(o.partsLost & (w.side < 0 ? 1 : 2)) || o.crashed) continue;
        const p = world(w.mid).clone().lerp(root.position, 0.45);
        this.glow.emit(p.clone().add(jitter(2 * scale)), vel.clone().multiplyScalar(0.5).add(jitter(3)), 0.5, 3 * scale, 5 * scale, [1, 0.5, 0.1], 0.8, 1.2, 2);
        this.smoke.emit(p.clone(), vel.clone().multiplyScalar(0.4), 7, 3 * scale, 5 * scale, [0.07, 0.07, 0.07], 0.5, 0.6, 2);
      }
      // wreck burning after a crash
      if (o.crashed) {
        const p = root.position.clone();
        this.glow.emit(p.clone().add(jitter(player.size * 0.4)), new THREE.Vector3(0, 6 + Math.random() * 6, 0), 0.8, 4 * scale, 6 * scale, [1, 0.45, 0.08], 0.8, 0.6, 2);
        this.smoke.emit(p.clone().add(jitter(player.size * 0.3)), new THREE.Vector3(0, 8, 0), 14, 5 * scale, 6 * scale, [0.06, 0.06, 0.06], 0.6, 0.15, 3);
      }
    }
    // crash fireball (once)
    if (o.crashed && !this.crashed) {
      this.crashed = true;
      const p = root.position.clone();
      for (let j = 0; j < 160; j++) this.glow.emit(p.clone().add(jitter(player.size * 0.5)), jitter(30 * scale), 1 + Math.random(), 6 * scale, 10 * scale, [1, 0.4 + Math.random() * 0.3, 0.05], 0.9, 1.4, 4);
      for (let j = 0; j < 60; j++) this.smoke.emit(p.clone().add(jitter(player.size * 0.4)), jitter(12 * scale).add(new THREE.Vector3(0, 6, 0)), 18, 8 * scale, 8 * scale, [0.05, 0.05, 0.05], 0.7, 0.4, 2);
    }
    if (!o.crashed) this.crashed = false;
    // separated parts become debris
    const lost = o.partsLost | 0, fresh = lost & ~this.lastLost;
    this.lastLost = lost;
    if (fresh && P.wing) {
      for (const w of P.wing) if (fresh & (w.side < 0 ? 1 : 2)) this.spawnDebris(w.outer, root, vel, w.side);
      if ((fresh & 4) && P.tail) for (const t of P.tail) if (t.isGroup || t.isMesh) this.spawnDebris(t, root, vel, 0);
      for (let j = 0; j < 40; j++) this.glow.emit(root.position.clone().add(jitter(player.size * 0.5)), jitter(20).add(vel.clone().multiplyScalar(0.7)), 0.5, 0.5, 0, [1, 0.85, 0.5], 1, 1.5, -9);
    }
    // debris physics
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      if (!d.rest) {
        d.v.y -= 9.81 * dt;
        d.v.multiplyScalar(Math.exp(-0.15 * dt));
        d.obj.position.addScaledVector(d.v, dt);
        d.obj.rotation.x += d.w.x * dt; d.obj.rotation.y += d.w.y * dt; d.obj.rotation.z += d.w.z * dt;
        const g = this.world.heightAt(d.obj.position.x, -d.obj.position.z);
        if (d.obj.position.y < g + 0.5) { d.obj.position.y = g + 0.5; d.rest = true; }
        if (d.t < 6) this.smoke.emit(d.obj.position.clone(), new THREE.Vector3(0, 1, 0), 5, 2, 3, [0.1, 0.1, 0.1], 0.4, 0.5, 1);
      }
      if (d.t > 90) { this.world.scene.remove(d.obj); this.debris.splice(i, 1); }
    }
    this.glow.update(dt);
    this.smoke.update(dt);
    if (camera && renderer) {
      const s = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
      this.glow.points.material.uniforms.uScale.value = s;
      this.smoke.points.material.uniforms.uScale.value = s;
    }
  }

  spawnDebris(part, root, vel, side) {
    root.updateMatrixWorld(true);
    const obj = part.clone(true);
    obj.visible = true;
    obj.traverse((c) => { c.visible = true; });
    // bake the part's world transform into the debris object
    part.updateMatrixWorld(true);
    part.matrixWorld.decompose(obj.position, obj.quaternion, obj.scale);
    this.world.scene.add(obj);
    const v = vel.clone().multiplyScalar(0.85).add(new THREE.Vector3(side * 6, 4, 0).applyQuaternion(root.quaternion));
    this.debris.push({ obj, v, w: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, side * 2.5 + (Math.random() - 0.5)), t: 0, rest: false });
  }
}
