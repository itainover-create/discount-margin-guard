// Weather: wind, gusts, turbulence, visibility, cloud layers, precipitation,
// temperature and pressure; presets; METAR text; cloud and rain rendering.
import * as THREE from 'three';
import { logDepth } from './shaders.js';

export const PRESETS = {
  clear: { label: 'Clear', labelHe: 'בהיר', windDir: 270, windKt: 6, gustKt: 0, turb: 0.2, visM: 40000, clouds: [], precip: 0, tempC: 18, qnh: 1018 },
  fair: { label: 'Fair weather cumulus', labelHe: 'עננות קלה', windDir: 240, windKt: 10, gustKt: 0, turb: 0.6, visM: 30000, clouds: [{ cover: 2, baseFt: 3500, topFt: 5500 }], precip: 0, tempC: 22, qnh: 1015 },
  scattered: { label: 'Scattered clouds', labelHe: 'עננות חלקית', windDir: 200, windKt: 12, gustKt: 0, turb: 0.8, visM: 20000, clouds: [{ cover: 4, baseFt: 2800, topFt: 5000 }, { cover: 2, baseFt: 9000, topFt: 10500 }], precip: 0, tempC: 16, qnh: 1012 },
  overcast: { label: 'Overcast', labelHe: 'מעונן', windDir: 60, windKt: 14, gustKt: 0, turb: 1.0, visM: 12000, clouds: [{ cover: 8, baseFt: 1800, topFt: 4500 }], precip: 0, tempC: 9, qnh: 1006 },
  rain: { label: 'Rain, low ceiling', labelHe: 'גשם ותקרה נמוכה', windDir: 40, windKt: 16, gustKt: 24, turb: 1.4, visM: 5000, clouds: [{ cover: 6, baseFt: 1200, topFt: 3500 }, { cover: 8, baseFt: 3800, topFt: 9000 }], precip: 1, tempC: 8, qnh: 999 },
  fog: { label: 'Fog / low visibility', labelHe: 'ערפל / ראות נמוכה', windDir: 0, windKt: 2, gustKt: 0, turb: 0, visM: 1200, clouds: [{ cover: 8, baseFt: 300, topFt: 1100 }], precip: 0, tempC: 6, qnh: 1021 },
  crosswind: { label: 'Strong gusty crosswind', labelHe: 'רוח צד חזקה ומשבית', windDir: 220, windKt: 22, gustKt: 32, turb: 1.8, visM: 25000, clouds: [{ cover: 3, baseFt: 4000, topFt: 6000 }], precip: 0, tempC: 14, qnh: 1009 },
};

export class Weather {
  constructor(world) {
    this.world = world;
    this.set(PRESETS.clear);
    this.group = new THREE.Group();
    this.group.name = 'weather';
    this.clouds = new CloudLayers(world);
    this.group.add(this.clouds.group);
    this.rain = new Rain(world);
    this.group.add(this.rain.mesh);
  }

  set(p) {
    this.state = JSON.parse(JSON.stringify(p));
    this.state.clouds = this.state.clouds || [];
    this.dirty = true;
  }
  get windDir() { return this.state.windDir; }
  get windKt() { return this.state.windKt; }

  overcastFactor() {
    let o = 0;
    for (const c of this.state.clouds) o = Math.max(o, (c.cover - 3) / 5);
    return Math.max(0, Math.min(1, o + this.state.precip * 0.25));
  }

  // visibility (m) at an altitude MSL (fog layers are near the ground)
  visibilityAt(altM) {
    const v = this.state.visM;
    const elev = this.world.fieldElevation || 0;
    if (v < 5000 && altM - elev > 600) return Math.min(40000, v * (1 + (altM - elev - 600) / 120));
    return v;
  }

  // 0..1 how deep the camera is inside a cloud layer
  inCloud(altM) {
    const elev = this.world.fieldElevation || 0;
    let k = 0;
    for (const c of this.state.clouds) {
      if (c.cover < 5) continue;
      const b = elev + c.baseFt * 0.3048, t = elev + c.topFt * 0.3048;
      if (altM > b - 30 && altM < t + 30) {
        const e = Math.min(altM - (b - 30), (t + 30) - altM);
        k = Math.max(k, Math.min(1, e / 60) * (c.cover >= 7 ? 1 : 0.75));
      }
    }
    return k;
  }

  ceilingFt() {
    let c = 99999;
    for (const l of this.state.clouds) if (l.cover >= 5) c = Math.min(c, l.baseFt);
    return c;
  }

  // METAR-style string for ATIS (e.g. "22016G24KT 5000 -RA BKN012 OVC038 08/06 Q0999")
  metar(icao, date) {
    const s = this.state;
    const dd = String(date.getUTCDate()).padStart(2, '0'), hh = String(date.getUTCHours()).padStart(2, '0');
    const wind = s.windKt < 3 ? '00000KT' : `${String(Math.round(s.windDir / 10) * 10 % 360 || 360).padStart(3, '0')}${String(Math.round(s.windKt)).padStart(2, '0')}${s.gustKt ? 'G' + Math.round(s.gustKt) : ''}KT`;
    const vis = s.visM >= 9999 ? '9999' : String(Math.round(s.visM / 100) * 100).padStart(4, '0');
    const wx = s.precip > 0 ? (s.precip > 1 ? '+RA' : '-RA') : s.visM < 1000 ? 'FG' : s.visM < 5000 ? 'BR' : '';
    const cov = (o) => (o <= 2 ? 'FEW' : o <= 4 ? 'SCT' : o <= 7 ? 'BKN' : 'OVC');
    const cl = s.clouds.length ? s.clouds.map((c) => cov(c.cover) + String(Math.round(c.baseFt / 100)).padStart(3, '0')).join(' ') : 'SKC';
    const t = Math.round(s.tempC), dp = Math.round(s.tempC - (s.precip || s.visM < 3000 ? 1 : 6));
    const fmt = (v) => (v < 0 ? 'M' : '') + String(Math.abs(v)).padStart(2, '0');
    return `${icao} ${dd}${hh}50Z ${wind} ${vis} ${wx ? wx + ' ' : ''}${cl} ${fmt(t)}/${fmt(dp)} Q${Math.round(s.qnh)}`;
  }

  // Push to the flight core (wind in m/s at 10 m, gust increment, turbulence)
  applyToCore(core, seed = 1) {
    const s = this.state;
    const kt = 0.514444;
    core.setWeather(s.qnh * 100, s.tempC - 15, s.windDir * Math.PI / 180, s.windKt * kt, Math.max(0, (s.gustKt || 0) - s.windKt) * kt, s.turb, seed);
  }

  update(dt, camWorld, camThree, sky) {
    this.clouds.update(this, camWorld, camThree, sky, dt);
    this.rain.update(dt, this.state.precip, camThree);
    this.world.shared.uWetness.value = THREE.MathUtils.lerp(this.world.shared.uWetness.value, this.state.precip > 0 ? 1 : 0, Math.min(1, dt * 0.05));
    this.dirty = false;
  }
}

// ---------------------------------------------------------------------------
// Clouds: clusters of soft billboard puffs placed on a world-anchored grid so
// they do not move with the camera; overcast layers add a continuous deck.
// ---------------------------------------------------------------------------
function puffTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const blobs = [];
  for (let i = 0; i < 14; i++) blobs.push([0.5 + (rnd() - 0.5) * 0.45, 0.55 + (rnd() - 0.5) * 0.35, 0.16 + rnd() * 0.18]);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let a = 0;
      for (const b of blobs) {
        const d = Math.hypot(u - b[0], v - b[1]) / b[2];
        a += Math.max(0, 1 - d * d);
      }
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      a = Math.min(1, a * 0.75) * Math.max(0, 1 - r * r);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  return t;
}

const CLOUD_VS = /* glsl */ `
attribute vec4 aPuff; // xyz offset (three coords, relative to layer origin), w = size
attribute float aShade;
uniform vec3 uCamPos;
varying vec2 vUv; varying float vShade; varying float vDist;
void main(){
  vec3 center = (modelMatrix * vec4(aPuff.xyz, 1.0)).xyz;
  vec2 d = center.xz - uCamPos.xz;
  center.y -= dot(d, d) / 12742000.0;
  vec4 mv = viewMatrix * vec4(center, 1.0);
  mv.xy += position.xy * aPuff.w;
  vUv = uv; vShade = aShade + position.y * 0.25; vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const CLOUD_FS = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uLit; uniform vec3 uShadow; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uOpacity;
varying vec2 vUv; varying float vShade; varying float vDist;
void main(){
  float a = texture2D(uMap, vUv).a * uOpacity;
  if (a < 0.02) discard;
  vec3 col = mix(uShadow, uLit, clamp(vShade, 0.0, 1.0));
  float f = 1.0 - exp(-pow(vDist * uFogDensity * 0.6, 1.35));
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  a *= 1.0 - smoothstep(25.0, 4.0, vDist) * 0.9;
  gl_FragColor = vec4(col, a);
}`;

class CloudLayers {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.tex = puffTexture();
    this.layers = [];
    this.key = '';
    this.uniforms = {
      uMap: { value: this.tex }, uLit: { value: new THREE.Color(1, 1, 1) }, uShadow: { value: new THREE.Color(0.6, 0.62, 0.66) },
      uFogColor: world.shared.uFogColor, uFogDensity: world.shared.uFogDensity, uCamPos: world.shared.uCamPos, uOpacity: { value: 0.92 },
    };
    this.quality = 1;
  }

  rebuild(weather) {
    for (const l of this.layers) { this.group.remove(l.mesh); l.mesh.geometry.dispose(); if (l.deck) { this.group.remove(l.deck); l.deck.geometry.dispose(); } }
    this.layers = [];
    const elev = this.world.fieldElevation || 0;
    weather.state.clouds.forEach((c, li) => {
      const base = elev + c.baseFt * 0.3048, top = elev + Math.max(c.topFt, c.baseFt + 600) * 0.3048;
      const cell = 1400, R = 22;          // grid cells around the camera (+-R)
      const prob = Math.min(1, c.cover / 8 + 0.05);
      const puffsPer = Math.round((c.cover >= 7 ? 14 : 10) * this.quality);
      const quad = new THREE.PlaneGeometry(1, 1);
      const g = new THREE.InstancedBufferGeometry();
      g.index = quad.index;
      g.attributes.position = quad.attributes.position;
      g.attributes.uv = quad.attributes.uv;
      const max = (2 * R + 1) ** 2 * puffsPer;
      const aPuff = new Float32Array(max * 4), aShade = new Float32Array(max);
      g.setAttribute('aPuff', new THREE.InstancedBufferAttribute(aPuff, 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aShade', new THREE.InstancedBufferAttribute(aShade, 1).setUsage(THREE.DynamicDrawUsage));
      g.instanceCount = 0;
      const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, ...logDepth(CLOUD_VS, CLOUD_FS), transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      let deck = null;
      if (c.cover >= 7) {
        const dg = new THREE.PlaneGeometry(1, 1, 1, 1);
        dg.rotateX(Math.PI / 2);
        deck = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ color: 0x9aa0a8, side: THREE.DoubleSide, fog: true }));
        deck.renderOrder = 2;
        this.group.add(deck);
      }
      this.layers.push({ c, base, top, cell, R, prob, puffsPer, mesh, aPuff, aShade, deck, li, lastCell: '' });
    });
  }

  update(weather, camWorld, camThree, sky, dt) {
    const key = JSON.stringify(weather.state.clouds) + (this.world.fieldElevation || 0) + this.quality;
    if (key !== this.key) { this.key = key; this.rebuild(weather); }
    const night = this.world.shared.uNight.value;
    const sunC = this.world.shared.uSunColor.value;
    this.uniforms.uLit.value.setRGB(0.95, 0.95, 0.96).multiplyScalar(1 - night * 0.93).add(sunC.clone().multiplyScalar(0.25));
    this.uniforms.uShadow.value.copy(this.world.shared.uSkyAmb.value).multiplyScalar(0.85).lerp(new THREE.Color(0.35, 0.36, 0.40).multiplyScalar(1 - night * 0.9), 0.5);
    for (const L of this.layers) {
      const cx = Math.floor(camWorld.x / L.cell), cy = Math.floor(camWorld.y / L.cell);
      const ck = cx + ',' + cy;
      if (L.deck) {
        L.deck.position.set(camThree.x, (L.base + L.top) / 2, camThree.z);
        L.deck.scale.set(L.cell * L.R * 2.4, 1, L.cell * L.R * 2.4);
        L.deck.material.color.copy(this.uniforms.uShadow.value).lerp(this.uniforms.uLit.value, camWorld.z > (L.base + L.top) / 2 ? 0.8 : 0.1);
      }
      if (ck === L.lastCell) continue;
      L.lastCell = ck;
      let n = 0;
      const thick = L.top - L.base;
      for (let j = -L.R; j <= L.R; j++) {
        for (let i = -L.R; i <= L.R; i++) {
          const gx = cx + i, gy = cy + j;
          let h = Math.sin(gx * 127.1 + gy * 311.7 + L.li * 17.3) * 43758.5453;
          h -= Math.floor(h);
          if (h > L.prob) continue;
          let seed = Math.floor(h * 1e6) + 1;
          const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
          const ox = (gx + 0.2 + rnd() * 0.6) * L.cell, oy = (gy + 0.2 + rnd() * 0.6) * L.cell;
          const size = 280 + rnd() * 500 * (L.c.cover >= 5 ? 1.3 : 1);
          for (let k = 0; k < L.puffsPer; k++) {
            const px = ox + (rnd() - 0.5) * size * 1.6, py = oy + (rnd() - 0.5) * size * 1.6;
            const pz = L.base + rnd() * thick * 0.75 + (k / L.puffsPer) * thick * 0.25;
            const s = size * (0.45 + rnd() * 0.6);
            aPuffSet(L.aPuff, n, px, pz, -py, s);
            L.aShade[n] = (pz - L.base) / Math.max(thick, 1) * 0.8 + 0.25;
            n++;
          }
        }
      }
      L.mesh.geometry.instanceCount = n;
      L.mesh.geometry.attributes.aPuff.needsUpdate = true;
      L.mesh.geometry.attributes.aShade.needsUpdate = true;
    }
  }
}
function aPuffSet(a, n, x, y, z, s) { a[n * 4] = x; a[n * 4 + 1] = y; a[n * 4 + 2] = z; a[n * 4 + 3] = s; }

// ---------------------------------------------------------------------------
class Rain {
  constructor() {
    const N = 6000;
    this.N = N;
    const pos = new Float32Array(N * 6);
    this.vel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 120, y = Math.random() * 80 - 20, z = (Math.random() - 0.5) * 120;
      pos.set([x, y, z, x, y - 1.2, z], i * 6);
      this.vel[i] = 8 + Math.random() * 3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.35, depthWrite: false }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }
  update(dt, precip, camThree) {
    this.mesh.visible = precip > 0;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(camThree);
    const p = this.mesh.geometry.attributes.position.array;
    const n = Math.round(this.N * Math.min(1, precip));
    for (let i = 0; i < this.N; i++) {
      let y = p[i * 6 + 1] - this.vel[i] * dt;
      if (y < -40) y += 80;
      const len = 1.0 + precip * 0.6;
      p[i * 6 + 1] = i < n ? y : -1000;
      p[i * 6 + 4] = (i < n ? y : -1000) - len;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}
