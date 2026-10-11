// Shared shading for the world: one lighting/fog model (sun + sky ambient +
// exponential fog + Earth curvature relative to the camera) used by terrain,
// water, buildings, roads and light points.
import * as THREE from 'three';

export function createSharedUniforms() {
  return {
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
    uSunColor: { value: new THREE.Color(1, 0.96, 0.9) },
    uSkyAmb: { value: new THREE.Color(0.45, 0.55, 0.7) },
    uGroundAmb: { value: new THREE.Color(0.25, 0.22, 0.2) },
    uFogColor: { value: new THREE.Color(0.7, 0.78, 0.88) },
    uFogDensity: { value: 0.000025 },
    uZenith: { value: new THREE.Color(0.2, 0.4, 0.8) },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uWetness: { value: 0 },
    uRegionTex: { value: null },
    uRegionInfo: { value: new THREE.Vector4(0, 0, 1, 0) },   // minx, maxy, res, enabled
    uRegionSize: { value: new THREE.Vector2(1, 1) },
    uRegionAffine: { value: new THREE.Vector3(1, 0, 0) },   // sx, tx, ty (region -> world frame)
    uStyle: { value: 0 },
    uLat: { value: 40 },
    uSnowLine: { value: 3200 },
    uExposure: { value: 1 },
    uLandPos: { value: new THREE.Vector3() },
    uLandDir: { value: new THREE.Vector3(0, 0, -1) },
    uLandOn: { value: 0 },
    uFlash: { value: 0 },   // lightning flash 0..1
  };
}


// Inject three.js logarithmic depth chunks (renderer uses logarithmicDepthBuffer
// so the cockpit can use a 5 cm near plane with a 400 km far plane).
export function logDepth(vs, fs) {
  vs = '#include <common>\n#include <logdepthbuf_pars_vertex>\n' + vs.replace(/(gl_Position\s*=[^;]*;)/, '$1\n  #include <logdepthbuf_vertex>');
  fs = '#include <logdepthbuf_pars_fragment>\n' + fs.replace(/void main\(\)\s*\{/, 'void main(){\n  #include <logdepthbuf_fragment>');
  return { vertexShader: vs, fragmentShader: fs };
}

export const COMMON = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyAmb; uniform vec3 uGroundAmb;
uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uZenith; uniform float uNight; uniform float uTime;
uniform vec3 uCamPos; uniform float uWetness; uniform float uExposure;
uniform vec3 uLandPos; uniform vec3 uLandDir; uniform float uLandOn; uniform float uFlash;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
vec3 applyFog(vec3 col, vec3 wpos){
  float d = length(wpos - uCamPos);
  float f = 1.0 - exp(-pow(d * uFogDensity, 1.35));
  // aerial perspective: distant land turns bluish even in clear air
  float a = 1.0 - exp(-d * 0.000012);
  col = mix(col, uFogColor * 0.9 + uZenith * 0.1, a * 0.35 * (1.0 - uNight));
  return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}
vec3 lightDiffuse(vec3 n){
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 amb = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
  return uSunColor * ndl + amb + vec3(0.85, 0.9, 1.0) * uFlash * 1.4;
}
// aircraft landing/taxi light (spot) for ground, runway and buildings
vec3 landLight(vec3 wpos, vec3 n){
  if (uLandOn < 0.01) return vec3(0.0);
  vec3 to = wpos - uLandPos;
  float d = length(to);
  vec3 dir = to / max(d, 0.001);
  float spot = smoothstep(0.90, 0.985, dot(dir, uLandDir));
  float att = 1.0 / (1.0 + d * d / 3000.0);
  return vec3(1.0, 0.95, 0.85) * spot * att * max(dot(n, -dir), 0.15) * uLandOn * 6.0;
}
vec3 tonemap(vec3 c){ c *= uExposure; return c / (1.0 + c * 0.15); }
`;

export const CURVE = /* glsl */ `
vec3 curved(vec3 w){ vec2 d = w.xz - uCamPos.xz; w.y -= dot(d, d) / 12742000.0; return w; }
`;

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------
const TERRAIN_VS = /* glsl */ `
${COMMON}
${CURVE}
varying vec3 vW; varying vec3 vN; varying vec3 vWc;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vec3 c = curved(w.xyz);
  vWc = c;
  gl_Position = projectionMatrix * viewMatrix * vec4(c, 1.0);
}`;

const TERRAIN_FS = /* glsl */ `
${COMMON}
uniform sampler2D uRegionTex; uniform vec4 uRegionInfo; uniform vec2 uRegionSize; uniform vec3 uRegionAffine;
uniform int uStyle; uniform float uLat; uniform float uSnowLine;
varying vec3 vW; varying vec3 vN; varying vec3 vWc;

vec3 styleLand(){
  if (uStyle == 1) return vec3(0.55, 0.52, 0.36);   // mediterranean
  if (uStyle == 2) return vec3(0.62, 0.52, 0.40);   // desert
  if (uStyle == 3) return vec3(0.36, 0.50, 0.26);   // alpine
  if (uStyle == 4) return vec3(0.28, 0.45, 0.22);   // tropical
  return vec3(0.40, 0.46, 0.32);                     // temperate / nyc
}
// returns colour and sets isWater
vec3 classColor(int c, vec2 p, out float water, out float emis){
  water = 0.0; emis = 0.0;
  float n1 = vnoise(p * 0.05), n2 = vnoise(p * 0.31), n3 = fbm(p * 0.012);
  if (c >= 1 && c <= 4) { water = 1.0; return c == 4 ? vec3(0.25, 0.6, 0.75) : vec3(0.05, 0.16, 0.24); }
  if (c == 46) { water = 0.6; return vec3(0.15, 0.45, 0.5); }
  if (c == 10 || c == 12) { emis = 0.6; return mix(vec3(0.42,0.41,0.40), vec3(0.55,0.53,0.50), n2) * (0.85 + 0.3*n1); }
  if (c == 11) { emis = 0.45; vec3 g = vec3(0.33,0.42,0.27); return mix(mix(vec3(0.50,0.47,0.44), g, step(0.62, n2)), vec3(0.45,0.43,0.40), n1*0.4); }
  if (c == 13) { emis = 0.5; return mix(vec3(0.40,0.38,0.36), vec3(0.50,0.46,0.40), n2); }
  if (c == 20) { float t = vnoise(p * 0.45); return mix(vec3(0.10,0.20,0.08), vec3(0.20,0.32,0.13), t) * (0.8 + 0.4*n1); }
  if (c == 21) return mix(vec3(0.30,0.34,0.20), vec3(0.42,0.42,0.26), n2);
  if (c == 22 || c == 50) return mix(vec3(0.33,0.45,0.22), vec3(0.45,0.52,0.28), n2 * 0.7 + n3 * 0.3);
  if (c == 23 || c == 27) return mix(vec3(0.24,0.44,0.18), vec3(0.34,0.52,0.24), n2);
  if (c == 24 || c == 25) return mix(vec3(0.30,0.55,0.22), vec3(0.38,0.62,0.28), n2);
  if (c == 26) return mix(vec3(0.30,0.42,0.24), vec3(0.50,0.50,0.46), step(0.7, vnoise(p*0.8)));
  if (c == 30) { float f = hash12(floor(p / vec2(140.0, 90.0))); vec3 a = vec3(0.55,0.52,0.30), b = vec3(0.38,0.48,0.22), d = vec3(0.50,0.40,0.28);
                 return (f < 0.33 ? a : (f < 0.66 ? b : d)) * (0.9 + 0.15 * vnoise(p * 0.2)); }
  if (c == 31) return mix(vec3(0.28,0.40,0.18), vec3(0.42,0.40,0.26), step(0.5, vnoise(p * 0.5)));
  if (c == 40) return mix(vec3(0.82,0.76,0.60), vec3(0.90,0.84,0.68), n2);
  if (c == 41 || c == 61) return mix(vec3(0.45,0.42,0.38), vec3(0.58,0.55,0.50), n2);
  if (c == 42) return mix(vec3(0.52,0.50,0.47), vec3(0.62,0.60,0.56), n2);
  if (c == 43) return vec3(0.92, 0.94, 0.97);
  if (c == 44 || c == 45) return mix(vec3(0.24,0.34,0.24), vec3(0.20,0.28,0.26), n2);
  if (c == 51 || c == 53) return mix(vec3(0.55,0.55,0.53), vec3(0.62,0.62,0.60), n1);
  if (c == 52 || c == 55) { emis = 0.3; return vec3(0.27,0.27,0.28) * (0.9 + 0.2*n2); }
  if (c == 54) return vec3(0.17,0.17,0.18) * (0.9 + 0.2*n2);
  if (c == 60 || c == 62) return mix(vec3(0.50,0.42,0.32), vec3(0.42,0.38,0.32), n2);
  if (c == 63 || c == 74) return vec3(0.38,0.34,0.30);
  if (c >= 70 && c <= 72) { emis = c == 70 ? 1.0 : 0.8; return vec3(0.24,0.24,0.25) * (0.95 + 0.1*n2); }
  if (c == 73) return vec3(0.52,0.44,0.34);
  return styleLand() * (0.85 + 0.3 * n3) * (0.9 + 0.2 * n2);
}

vec3 biome(vec3 n, float h, vec2 p, out float water){
  water = 0.0;
  float lat = abs(uLat);
  vec3 g = lat > 55.0 ? vec3(0.30,0.36,0.24) : (lat < 32.0 && lat > 15.0 ? vec3(0.66,0.56,0.40) : vec3(0.34,0.44,0.24));
  if (lat < 12.0) g = vec3(0.22,0.38,0.16);
  g *= 0.85 + 0.3 * fbm(p * 0.0007) ;
  g = mix(g, vec3(0.20,0.30,0.14), smoothstep(0.55, 0.75, fbm(p * 0.0021)) * (lat > 32.0 || lat < 12.0 ? 0.7 : 0.15));
  return g;
}

void main(){
  vec3 n = normalize(vN);
  vec2 p = vec2(vW.x, -vW.z);
  float h = vW.y;
  float slope = 1.0 - n.y;
  vec3 col; float water = 0.0; float emis = 0.0;
  bool inRegion = false;
  if (uRegionInfo.w > 0.5) {
    vec2 rp = vec2((p.x - uRegionAffine.y) / uRegionAffine.x, p.y - uRegionAffine.z);
    vec2 tc = vec2((rp.x - uRegionInfo.x) / uRegionInfo.z, (uRegionInfo.y - rp.y) / uRegionInfo.z) - 0.5;
    if (tc.x >= 0.0 && tc.y >= 0.0 && tc.x < uRegionSize.x - 1.0 && tc.y < uRegionSize.y - 1.0) {
      inRegion = true;
      ivec2 i0 = ivec2(floor(tc)); vec2 f = fract(tc);
      // sharpen class boundaries with a noisy threshold (avoids blurry blends up close)
      f = clamp((f - 0.5) * 2.4 + 0.5 + (vec2(vnoise(p * 0.21), vnoise(p * 0.21 + 17.0)) - 0.5) * 0.9, 0.0, 1.0);
      f = f * f * (3.0 - 2.0 * f);
      float w0, w1, w2, w3, e0, e1, e2, e3;
      vec3 c0 = classColor(int(texelFetch(uRegionTex, i0, 0).r * 255.0 + 0.5), p, w0, e0);
      vec3 c1 = classColor(int(texelFetch(uRegionTex, i0 + ivec2(1,0), 0).r * 255.0 + 0.5), p, w1, e1);
      vec3 c2 = classColor(int(texelFetch(uRegionTex, i0 + ivec2(0,1), 0).r * 255.0 + 0.5), p, w2, e2);
      vec3 c3 = classColor(int(texelFetch(uRegionTex, i0 + ivec2(1,1), 0).r * 255.0 + 0.5), p, w3, e3);
      col = mix(mix(c0, c1, f.x), mix(c2, c3, f.x), f.y);
      water = mix(mix(w0, w1, f.x), mix(w2, w3, f.x), f.y);
      emis = mix(mix(e0, e1, f.x), mix(e2, e3, f.x), f.y);
    }
  }
  if (!inRegion) col = biome(n, h, p, water);
  // rock on steep slopes, snow above the snow line
  float rock = smoothstep(0.28, 0.5, slope) * (1.0 - water);
  col = mix(col, mix(vec3(0.40,0.38,0.35), vec3(0.52,0.50,0.47), vnoise(p * 0.08)), rock);
  float snow = smoothstep(uSnowLine - 150.0, uSnowLine + 250.0, h + 300.0 * (vnoise(p*0.004) - 0.5)) * (1.0 - smoothstep(0.45, 0.7, slope));
  col = mix(col, vec3(0.93,0.95,0.98), snow);
  // beaches near sea level without data
  if (!inRegion) col = mix(col, vec3(0.80,0.74,0.58), smoothstep(4.0, 0.5, h) * (1.0 - snow));
  vec3 lit = col * (lightDiffuse(n) + landLight(vW, n));
  // wet ground darkens
  lit *= 1.0 - 0.25 * uWetness;
  if (water > 0.01) {
    vec3 v = normalize(uCamPos - vWc);
    float fres = 0.04 + 0.96 * pow(1.0 - max(v.y, 0.0), 5.0);
    vec3 refl = mix(uFogColor, uZenith, 0.5);
    vec3 hv = normalize(v + uSunDir);
    float spec = pow(max(dot(vec3(0,1,0), hv), 0.0), 120.0) * 2.0;
    vec3 wc = mix(col * (uSkyAmb + uSunColor * 0.4), refl, fres) + uSunColor * spec;
    lit = mix(lit, wc, water);
  }
  // city lights at night (procedural, only where data says built-up/roads)
  if (emis > 0.0 && uNight > 0.01) {
    float grid = step(0.55, vnoise(p * 0.11)) * vnoise(p * 0.9);
    vec3 warm = mix(vec3(1.0, 0.62, 0.30), vec3(0.95, 0.90, 0.80), vnoise(p * 0.01));
    lit += warm * emis * grid * uNight * 0.9;
  }
  gl_FragColor = vec4(tonemap(applyFog(lit, vWc)), 1.0);
}`;

export function terrainMaterial(shared) {
  return new THREE.ShaderMaterial({ uniforms: shared, ...logDepth(TERRAIN_VS, TERRAIN_FS) });
}

// ---------------------------------------------------------------------------
// Ocean
// ---------------------------------------------------------------------------
const WATER_VS = /* glsl */ `
${COMMON}
${CURVE}
varying vec3 vW; varying vec3 vWc;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec3 c = curved(w.xyz);
  vWc = c;
  gl_Position = projectionMatrix * viewMatrix * vec4(c, 1.0);
}`;
const WATER_FS = /* glsl */ `
${COMMON}
varying vec3 vW; varying vec3 vWc;
void main(){
  vec2 p = vec2(vW.x, -vW.z);
  float t = uTime;
  vec2 g1 = vec2(vnoise(p * 0.035 + vec2(t*0.05, t*0.03)), vnoise(p * 0.035 + vec2(-t*0.04, t*0.05) + 13.0)) - 0.5;
  vec2 g2 = vec2(vnoise(p * 0.21 + vec2(t*0.18, -t*0.1)), vnoise(p * 0.21 + vec2(-t*0.13, t*0.17) + 7.0)) - 0.5;
  float d = length(vWc - uCamPos);
  float detail = 1.0 / (1.0 + d * 0.0006);
  vec3 n = normalize(vec3((g1.x * 0.6 + g2.x * 0.5 * detail) * 0.5, 1.0, (g1.y * 0.6 + g2.y * 0.5 * detail) * 0.5));
  vec3 v = normalize(uCamPos - vWc);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uFogColor, uZenith, clamp(r.y * 1.6, 0.0, 1.0));
  vec3 deep = vec3(0.02, 0.09, 0.13) * (uSkyAmb + uSunColor * 0.5);
  vec3 hv = normalize(v + uSunDir);
  float spec = pow(max(dot(n, hv), 0.0), 220.0) * 3.5 * (1.0 - uNight);
  vec3 col = mix(deep, sky, fres) + uSunColor * spec;
  gl_FragColor = vec4(tonemap(applyFog(col, vWc)), 1.0);
}`;
export function waterMaterial(shared) {
  return new THREE.ShaderMaterial({ uniforms: shared, ...logDepth(WATER_VS, WATER_FS), depthWrite: true });
}

// ---------------------------------------------------------------------------
// Buildings: procedural facades (windows per floor, night lighting)
// attributes: position, normal, uv (u along wall m / roof x, v height m / roof y),
//             aInfo (x: 0 wall 1 roof, y: class, z: seed 0..1, w: height of building)
//             color (facade rgb)
// ---------------------------------------------------------------------------
const BLD_VS = /* glsl */ `
${COMMON}
${CURVE}
attribute vec4 aInfo; attribute vec3 color;
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec4 vInfo; varying vec3 vCol; varying vec3 vWc;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vInfo = aInfo; vCol = color;
  vec3 c = curved(w.xyz); vWc = c;
  gl_Position = projectionMatrix * viewMatrix * vec4(c, 1.0);
}`;
const BLD_FS = /* glsl */ `
${COMMON}
varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying vec4 vInfo; varying vec3 vCol; varying vec3 vWc;
void main(){
  vec3 n = normalize(vN);
  float d = length(vWc - uCamPos);
  vec3 base = vCol;
  vec3 col; vec3 emit = vec3(0.0);
  float seed = vInfo.z;
  int cls = int(vInfo.y + 0.5);
  if (vInfo.x > 0.5) {
    // roof
    float g = vnoise(vUv * 0.7) * 0.15 + vnoise(vUv * 0.07) * 0.1;
    col = base * (0.8 + g);
    // rooftop details: AC units / skylights as darker spots on big roofs
    col *= 1.0 - 0.18 * step(0.82, vnoise(vUv * 0.35 + seed * 40.0));
    gl_FragColor = vec4(tonemap(applyFog(col * lightDiffuse(n), vWc)), 1.0);
    return;
  }
  bool tall = vInfo.w > 45.0;
  float floorH = (cls == 2 || cls == 8 || tall) ? 3.9 : 3.2;
  float bayW = tall ? 2.6 : 3.4;
  float u = vUv.x, v = vUv.y;
  float fl = floor(v / floorH), bay = floor(u / bayW);
  vec2 cell = vec2(fract(u / bayW), fract(v / floorH));
  float glassFrac = tall ? 0.78 : (cls == 3 || cls == 11 ? 0.25 : 0.5);
  float winW = glassFrac, winH = tall ? 0.72 : 0.55;
  float inWin = step(0.5 - winW*0.5, cell.x) * step(cell.x, 0.5 + winW*0.5) * step(0.25, cell.y) * step(cell.y, 0.25 + winH);
  if (cls == 3 || cls == 11) inWin *= step(0.6, hash12(vec2(bay, fl) + seed * 91.0)); // sparse windows on sheds/industrial
  inWin *= step(1.5, v); // ground band
  float fade = clamp(1.0 - (d - 600.0) / 3000.0, 0.0, 1.0);
  vec3 glassDay = mix(vec3(0.16, 0.20, 0.26), mix(uFogColor, uZenith, 0.6) * 0.75, tall ? 0.55 : 0.25);
  vec3 wall = base * (0.92 + 0.12 * hash12(vec2(fl, seed * 17.0)));
  vec3 avg = mix(wall, glassDay, glassFrac * winH * 0.8);
  col = mix(avg, mix(wall, glassDay, inWin), fade);
  // ambient-occlusion-like darkening at the base, slight top highlight
  col *= 0.78 + 0.22 * clamp(v / 8.0, 0.0, 1.0);
  vec3 lit = col * (lightDiffuse(n) + landLight(vW, n));
  // glass: fresnel reflection of the sky (ground below the horizon) and the sun;
  // each pane is tilted by a hair so a curtain wall does not look like one mirror
  vec3 vdir = normalize(uCamPos - vWc);
  vec3 pn = normalize(n + vec3(hash12(vec2(bay, fl) + seed) - 0.5, 0.0, hash12(vec2(fl, bay) + seed * 3.0) - 0.5) * 0.035);
  vec3 r = reflect(-vdir, pn);
  vec3 skyR = mix(uFogColor, uZenith, smoothstep(-0.02, 0.55, r.y));
  skyR = mix(skyR, uGroundAmb * 0.8 + vec3(0.06), smoothstep(0.0, -0.25, r.y));
  skyR *= 1.0 - uNight * 0.85;
  float fres = 0.06 + 0.94 * pow(1.0 - max(dot(pn, vdir), 0.0), 5.0);
  float glassK = inWin * fade * (tall ? 0.85 : 0.35);
  lit = mix(lit, skyR + (vec3(0.85, 0.9, 1.0) * uFlash), clamp(fres * glassK + glassK * 0.25, 0.0, 0.9));
  vec3 hv = normalize(vdir + uSunDir);
  lit += uSunColor * (pow(max(dot(pn, hv), 0.0), 60.0) * 0.4 + pow(max(dot(r, uSunDir), 0.0), 900.0) * 6.0) * glassK;
  // night: lit windows (stable random per window), brighter shopfronts
  if (uNight > 0.01) {
    float r = hash13(vec3(bay, fl, seed * 113.0));
    float on = step(tall ? 0.45 : 0.62, r);
    vec3 wc = mix(vec3(1.0, 0.78, 0.45), vec3(0.85, 0.9, 1.0), step(0.75, hash12(vec2(fl, seed))));
    float far = 1.0 - fade;
    emit = wc * (inWin * on * fade + far * glassFrac * 0.18 * (tall ? 1.3 : 0.6)) * 0.9;
    if (v < 4.0 && (cls == 2 || cls == 12)) emit += vec3(1.0, 0.85, 0.6) * 0.6 * step(0.3, cell.x) * fade;
    emit *= uNight;
  }
  gl_FragColor = vec4(tonemap(applyFog(lit + emit, vWc)), 1.0);
}`;
export function buildingMaterial(shared) {
  return new THREE.ShaderMaterial({ uniforms: shared, ...logDepth(BLD_VS, BLD_FS) });
}

// ---------------------------------------------------------------------------
// Roads / runways / taxiways: ribbons with uv (u across 0..1, v along m)
// aInfo: x = class code, y = width m, z = flags
// ---------------------------------------------------------------------------
const ROAD_VS = /* glsl */ `
${COMMON}
${CURVE}
attribute vec3 aInfo;
varying vec3 vW; varying vec2 vUv; varying vec3 vInfo; varying vec3 vWc; varying vec3 vN;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vUv = uv; vInfo = aInfo; vN = normalize(mat3(modelMatrix) * normal);
  vec3 c = curved(w.xyz); vWc = c;
  gl_Position = projectionMatrix * viewMatrix * vec4(c, 1.0);
}`;
const ROAD_FS = /* glsl */ `
${COMMON}
varying vec3 vW; varying vec2 vUv; varying vec3 vInfo; varying vec3 vWc; varying vec3 vN;
void main(){
  int cls = int(vInfo.x + 0.5);
  float w = vInfo.y;
  float u = vUv.x, v = vUv.y;
  float d = length(vWc - uCamPos);
  vec2 p = vec2(vW.x, -vW.z);
  vec3 asphalt = vec3(0.20, 0.20, 0.21) * (0.9 + 0.2 * vnoise(p * 0.6));
  vec3 col = asphalt;
  float fade = clamp(1.0 - d / 2500.0, 0.0, 1.0);
  if (cls >= 80) {
    // airport pavement: taxiway (80), taxilane (81), painted line (82), apron concrete (90)
    if (cls == 82) {
      col = vec3(0.80, 0.64, 0.12);
    } else if (cls == 90) {
      vec2 j = abs(fract(p / 7.5) - 0.5);
      col = vec3(0.56, 0.56, 0.54) * (0.92 + 0.12 * vnoise(p * 0.3)) * (1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.012, min(j.x, j.y))) * fade);
      col *= 1.0 - 0.15 * step(0.7, vnoise(p * 0.05));
    } else {
      col = vec3(0.24, 0.24, 0.245) * (0.9 + 0.15 * vnoise(p * 0.4));
      float x = abs(u - 0.5) * w;
      float cl = 1.0 - smoothstep(0.12, 0.22, x);
      float edge = (1.0 - smoothstep(0.1, 0.2, abs(x - (w * 0.5 - 1.2)))) * (cls == 80 ? 1.0 : 0.0);
      col = mix(col, vec3(0.80, 0.64, 0.12), max(cl, edge * 0.8) * clamp(fade * 1.5, 0.0, 1.0));
    }
  } else if (cls >= 20) {
    // rail: ballast with two dark rails
    col = vec3(0.36, 0.33, 0.30) * (0.85 + 0.3 * vnoise(p * 3.0));
    float x = abs(u - 0.5) * w;
    col = mix(col, vec3(0.22, 0.20, 0.19), (1.0 - smoothstep(0.03, 0.08, abs(x - 0.72))) * fade);
  } else if (cls == 9) {
    col = vec3(0.50, 0.42, 0.33) * (0.85 + 0.3 * vnoise(p * 0.8));
  } else if (cls <= 7) {
    float x = u * w;
    // edge lines
    float edge = (1.0 - smoothstep(0.08, 0.16, abs(x - 0.35))) + (1.0 - smoothstep(0.08, 0.16, abs(x - (w - 0.35))));
    // centre line: double yellow on two-way majors, dashed white on others
    float c = abs(x - w * 0.5);
    float centre = 0.0;
    if (cls >= 3 && cls <= 5) centre = (1.0 - smoothstep(0.06, 0.12, abs(c - 0.15)));
    float lanes = 0.0;
    if (cls <= 2) {
      float lw = 3.6;
      float lx = fract(x / lw);
      lanes = (1.0 - smoothstep(0.015, 0.035, abs(lx - 0.0))) * step(0.5, fract(v / 12.0)) * step(lw*0.5, x) * step(x, w - lw*0.5);
    }
    vec3 yellow = vec3(0.75, 0.62, 0.18), white = vec3(0.8, 0.8, 0.78);
    if (cls <= 6) {
      col = mix(col, white, clamp(edge, 0.0, 1.0) * 0.7 * fade * (cls <= 4 ? 1.0 : 0.0));
      col = mix(col, yellow, centre * fade);
      col = mix(col, white, lanes * fade);
    }
  }
  vec3 n = normalize(vN);
  vec3 lit = col * (lightDiffuse(n) + landLight(vW, n));
  // wet roads: sky reflection
  if (uWetness > 0.0) {
    vec3 vdir = normalize(uCamPos - vWc);
    float fres = pow(1.0 - max(vdir.y, 0.0), 4.0);
    lit = mix(lit * 0.7, mix(uFogColor, uZenith, 0.4), fres * 0.5 * uWetness);
  }
  gl_FragColor = vec4(tonemap(applyFog(lit, vWc)), 1.0);
}`;
export function roadMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: shared, ...logDepth(ROAD_VS, ROAD_FS),
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
}

// ---------------------------------------------------------------------------
// Light points: runway/taxiway/approach lights, street lights, beacons, PAPI.
// attributes: position, color, aLight: x size(m-ish intensity), y mode, z phase, w dirAngle
// modes: 0 omni steady, 1 directional (dir in aDir), 2 flashing (phase), 3 PAPI (aDir.w = angle),
//        4 sequenced flasher ("rabbit"), 5 night-only street light, 6 obstruction red (night-only, blink)
// ---------------------------------------------------------------------------
const LIGHT_VS = /* glsl */ `
${COMMON}
${CURVE}
attribute vec4 aLight; attribute vec4 aDir; attribute vec3 color;
uniform float uPixelRatio; uniform float uLightScale;
varying vec3 vCol; varying float vI;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec3 c = curved(w.xyz);
  vec3 toCam = uCamPos - c;
  float d = length(toCam);
  int mode = int(aLight.y + 0.5);
  float inten = aLight.x;
  vec3 col = color;
  if (mode == 1 || mode == 4) {
    vec3 dir = normalize(aDir.xyz);
    float k = dot(normalize(toCam), dir);
    inten *= smoothstep(-0.05, 0.35, k);
  }
  if (mode == 2) inten *= step(0.86, fract(uTime * 0.9 + aLight.z));
  if (mode == 4) inten *= step(0.93, fract(uTime * 2.0 - aLight.z));
  if (mode == 3) {
    vec3 dir = normalize(aDir.xyz);      // horizontal approach direction (toward approaching aircraft)
    float horiz = length(toCam.xz);
    float elev = degrees(atan(toCam.y, horiz));
    float k = smoothstep(-0.2, 0.5, dot(normalize(toCam.xz), normalize(dir.xz)));
    col = elev > aDir.w ? vec3(1.0, 0.97, 0.92) : vec3(1.0, 0.12, 0.08);
    inten *= k;
  }
  if (mode == 5) inten *= uNight;
  if (mode == 6) inten *= max(uNight, 0.25) * (0.35 + 0.65 * step(0.5, fract(uTime * 0.5 + aLight.z)));
  // daylight washes out small lights
  float day = 1.0 - uNight;
  if (mode != 6) inten *= mix(1.0, 0.35, day);
  vCol = col;
  vI = inten;
  float size = inten * uLightScale * 900.0 / max(d, 1.0);
  gl_PointSize = clamp(size, 0.0, 28.0) * uPixelRatio;
  if (inten < 0.01) gl_PointSize = 0.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(c, 1.0);
}`;
const LIGHT_FS = /* glsl */ `
varying vec3 vCol; varying float vI;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  if (r > 1.0) discard;
  // core + halo, windowed to zero at the sprite edge (no visible square)
  float a = (exp(-r * r * 4.0) + 0.25 * exp(-r * r * 0.8)) * (1.0 - smoothstep(0.6, 1.0, r));
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol * (1.2 + vI * 0.3), a);
}`;
export function lightMaterial(shared, renderer) {
  const u = Object.assign({}, shared, {
    uPixelRatio: { value: renderer ? renderer.getPixelRatio() : 1 },
    uLightScale: { value: 1.0 },
  });
  return new THREE.ShaderMaterial({
    uniforms: u, ...logDepth(LIGHT_VS, LIGHT_FS),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

// ---------------------------------------------------------------------------
// Runways: markings computed procedurally from (u lateral m, v along m).
// aRw: x width, y length, z leDisp, w heDisp
// ---------------------------------------------------------------------------
const RWY_VS = /* glsl */ `
${COMMON}
${CURVE}
attribute vec4 aRw;
varying vec3 vW; varying vec2 vUv; varying vec4 vRw; varying vec3 vWc;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vUv = uv; vRw = aRw;
  vec3 c = curved(w.xyz); vWc = c;
  gl_Position = projectionMatrix * viewMatrix * vec4(c, 1.0);
}`;
const RWY_FS = /* glsl */ `
${COMMON}
varying vec3 vW; varying vec2 vUv; varying vec4 vRw; varying vec3 vWc;
float box(float x, float a, float b){ return step(a, x) * step(x, b); }
// markings measured from one threshold: s = distance from threshold along runway, x = |lateral|
float endMarks(float s, float x, float W, float L){
  float m = 0.0;
  // threshold bar
  m += box(s, -3.0, 0.0) * step(x, W * 0.5 - 1.0);
  // piano keys: 6..51 m
  float nStr = W >= 55.0 ? 8.0 : (W >= 43.0 ? 6.0 : (W >= 28.0 ? 4.0 : (W >= 22.0 ? 3.0 : 2.0)));
  float hw = W * 0.5 - 1.5;
  float gap = 3.0;
  float k = (x - gap) / ((hw - gap) / nStr);
  float key = step(0.0, x - gap) * step(x, hw) * step(fract(k), 0.55);
  m += box(s, 6.0, 51.0) * key;
  if (L > 1200.0) {
    // aiming point at 300 m (two wide bars), touchdown zone pairs
    float aw = W >= 43.0 ? 9.0 : 6.0;
    float ac = W * 0.22;
    m += box(s, 306.0, 351.0) * box(x, ac - aw * 0.5, ac + aw * 0.5);
    if (L > 2000.0) {
      for (int i = 0; i < 6; i++) {
        float s0 = i == 0 ? 150.0 : (i == 1 ? 450.0 : (i == 2 ? 600.0 : (i == 3 ? 750.0 : (i == 4 ? 900.0 : 0.0))));
        float bars = i == 0 ? 3.0 : (i <= 2 ? 2.0 : 1.0);
        if (s0 < 1.0) continue;
        float bx = (x - ac + 4.0) / 3.0;
        float inBars = step(0.0, bx) * step(bx, bars) * step(fract(bx), 0.6);
        m += box(s, s0, s0 + 22.5) * inBars;
      }
    }
  }
  return m;
}
void main(){
  float W = vRw.x, L = vRw.y, d1 = vRw.z, d2 = vRw.w;
  float u = vUv.x, v = vUv.y;
  float x = abs(u);
  vec2 p = vec2(vW.x, -vW.z);
  float dist = length(vWc - uCamPos);
  vec3 asphalt = vec3(0.17, 0.17, 0.175) * (0.88 + 0.22 * vnoise(p * 0.35)) * (0.95 + 0.1 * vnoise(p * 0.02));
  // rubber deposits in touchdown zones
  float s1 = v - d1, s2 = (L - v) - d2;
  float rubber = (box(s1, 120.0, 900.0) + box(s2, 120.0, 900.0)) * (1.0 - smoothstep(4.0, 9.0, x)) * vnoise(vec2(x * 0.6, v * 0.08));
  asphalt *= 1.0 - 0.45 * clamp(rubber, 0.0, 1.0);
  if (x > W * 0.5) {
    // paved shoulder (lighter, no markings)
    vec3 sh = vec3(0.30, 0.30, 0.29) * (0.9 + 0.2 * vnoise(p * 0.5));
    vec3 l2 = sh * lightDiffuse(vec3(0.0, 1.0, 0.0));
    gl_FragColor = vec4(tonemap(applyFog(l2, vWc)), 1.0);
    return;
  }
  float m = 0.0;
  // edge stripes
  m += box(x, W * 0.5 - 1.0, W * 0.5 - 0.1);
  // centreline: 36 m stripe, 24 m gap, between the designators
  float cl = step(x, 0.45) * step(fract((v - d1 - 120.0) / 60.0), 0.6) * step(d1 + 120.0, v) * step(v, L - d2 - 120.0);
  m += cl;
  m += endMarks(s1, x, W, L) + endMarks(s2, x, W, L);
  // displaced threshold arrows (simplified chevrons along the centreline)
  float arrow1 = step(s1, -8.0) * step(-d1, s1) * step(x, 1.0 + 3.0 * fract(-s1 / 40.0)) * step(fract(-s1 / 40.0), 0.6);
  float arrow2 = step(s2, -8.0) * step(-d2, s2) * step(x, 1.0 + 3.0 * fract(-s2 / 40.0)) * step(fract(-s2 / 40.0), 0.6);
  m += (arrow1 + arrow2);
  float fade = clamp(1.0 - dist / 9000.0, 0.25, 1.0);
  // weathered paint: grainy coverage, scuffed by tyres in the touchdown zones
  float wear = 0.86 + 0.14 * vnoise(p * 3.1) - 0.08 * smoothstep(0.6, 0.9, vnoise(p * 0.7));
  float paintK = clamp(m, 0.0, 1.0) * clamp(wear - rubber * 0.35, 0.45, 1.0);
  vec3 paint = vec3(0.80, 0.79, 0.76);
  vec3 col = mix(asphalt, paint, paintK * fade);
  // tyre streaks along the centreline in the touchdown zones
  col *= 1.0 - 0.25 * (box(s1, 60.0, 700.0) + box(s2, 60.0, 700.0)) * (1.0 - smoothstep(2.0, 10.0, x)) * step(0.55, vnoise(vec2(x * 3.0, v * 0.015)));
  vec3 lit = col * (lightDiffuse(vec3(0.0, 1.0, 0.0)) + landLight(vW, vec3(0.0, 1.0, 0.0)));
  if (uWetness > 0.0) {
    vec3 vdir = normalize(uCamPos - vWc);
    float fres = pow(1.0 - max(vdir.y, 0.0), 4.0);
    lit = mix(lit * 0.75, mix(uFogColor, uZenith, 0.4), fres * 0.55 * uWetness);
  }
  gl_FragColor = vec4(tonemap(applyFog(lit, vWc)), 1.0);
}`;
export function runwayMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: shared, ...logDepth(RWY_VS, RWY_FS),
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
  });
}

// ---------------------------------------------------------------------------
// Ground decals (runway designators, hold-short lines): alpha texture, lit
// ---------------------------------------------------------------------------
const DECAL_VS = /* glsl */ `
${COMMON}
${CURVE}
varying vec2 vUv; varying vec3 vWc;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vUv = uv;
  vec3 c = curved(w.xyz); vWc = c;
  gl_Position = projectionMatrix * viewMatrix * vec4(c, 1.0);
}`;
const DECAL_FS = /* glsl */ `
${COMMON}
uniform sampler2D map;
varying vec2 vUv; varying vec3 vWc;
void main(){
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.35) discard;
  vec3 lit = t.rgb * lightDiffuse(vec3(0.0, 1.0, 0.0));
  gl_FragColor = vec4(tonemap(applyFog(lit, vWc)), t.a);
}`;
export function decalMaterial(shared, texture) {
  const u = Object.assign({}, shared, { map: { value: texture } });
  return new THREE.ShaderMaterial({
    uniforms: u, ...logDepth(DECAL_VS, DECAL_FS), transparent: false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -10,
  });
}
