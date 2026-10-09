// Sky, sun, moon and stars; drives the shared lighting/fog uniforms and the
// three.js lights used by standard materials (aircraft, cockpit).
import * as THREE from 'three';

const D2R = Math.PI / 180;

// NOAA solar position (accurate to ~0.1 deg). Returns elevation/azimuth (deg).
export function sunPosition(date, lat, lon) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * D2R) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * D2R) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * D2R) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * D2R);
  const decl = Math.asin(Math.sin(eps * D2R) * Math.sin(lambda * D2R)) / D2R;
  const y = Math.tan((eps / 2) * D2R) ** 2;
  const eqTime = 4 / D2R * (y * Math.sin(2 * L0 * D2R) - 2 * e * Math.sin(M * D2R) + 4 * e * y * Math.sin(M * D2R) * Math.cos(2 * L0 * D2R) -
    0.5 * y * y * Math.sin(4 * L0 * D2R) - 1.25 * e * e * Math.sin(2 * M * D2R));
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  let tst = (utcMin + eqTime + 4 * lon) % 1440;
  if (tst < 0) tst += 1440;
  let ha = tst / 4 - 180;
  const zen = Math.acos(Math.sin(lat * D2R) * Math.sin(decl * D2R) + Math.cos(lat * D2R) * Math.cos(decl * D2R) * Math.cos(ha * D2R));
  const elev = 90 - zen / D2R;
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat * D2R) * Math.cos(zen) - Math.sin(decl * D2R)) / (Math.cos(lat * D2R) * Math.sin(zen))))) / D2R;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  return { elevation: elev, azimuth: az };
}

// Approximate moon position (low precision, ~1 deg) and phase (0 new .. 1 full).
export function moonPosition(date, lat, lon) {
  const d = date.getTime() / 86400000 - 10957.5;
  const L = (218.316 + 13.176396 * d) * D2R, M = (134.963 + 13.064993 * d) * D2R, F = (93.272 + 13.22935 * d) * D2R;
  const l = L + 6.289 * D2R * Math.sin(M), b = 5.128 * D2R * Math.sin(F);
  const eps = 23.4397 * D2R;
  const ra = Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l));
  const lst = (280.16 + 360.9856235 * d) * D2R + lon * D2R;
  const H = lst - ra;
  const phi = lat * D2R;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
  const sunL = (280.46 + 0.9856474 * d) * D2R;
  const phase = (1 - Math.cos(l - sunL)) / 2;
  return { elevation: alt / D2R, azimuth: (az / D2R + 360) % 360, phase };
}

function dirFrom(elev, az, v) {
  const e = elev * D2R, a = az * D2R;
  // three: x east, y up, z south
  return v.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunGlow; uniform float uNight;
uniform float uOvercast; uniform vec3 uMoonDir; uniform float uMoonPhase; uniform float uExposure;
varying vec3 vDir;
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 d = normalize(vDir);
  float y = max(d.y, -0.2);
  float t = pow(clamp(y, 0.0, 1.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, t);
  if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.65, clamp(-d.y * 4.0, 0.0, 1.0));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunGlow * (pow(sd, 8.0) * 0.35 + pow(sd, 64.0) * 0.6) * (1.0 - uOvercast * 0.8);
  // sun disc
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9996, 0.99985, sd) * 12.0 * (1.0 - uOvercast) * step(-0.02, uSunDir.y);
  // moon
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.85, 0.88, 0.95) * smoothstep(0.99988, 0.99994, md) * (0.4 + uMoonPhase) * uNight * (1.0 - uOvercast);
  col += vec3(0.15, 0.17, 0.22) * pow(md, 200.0) * uNight * uMoonPhase * (1.0 - uOvercast);
  // stars
  if (uNight > 0.05 && d.y > 0.0) {
    vec3 q = d * 420.0;
    vec2 cell = floor(q.xz / max(q.y, 0.2) * 1.0 + vec2(floor(q.y)));
    float s = h12(cell);
    float tw = 0.7 + 0.3 * sin(s * 300.0 + uExposure);
    float star = step(0.9965, s) * smoothstep(0.0, 0.15, d.y) * tw;
    col += vec3(star) * uNight * (1.0 - uOvercast) * 1.4;
  }
  col = col / (1.0 + col * 0.15);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(world, scene) {
    this.world = world;
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3() }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunGlow: { value: new THREE.Color() }, uNight: { value: 0 }, uOvercast: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) }, uMoonPhase: { value: 0.5 }, uExposure: { value: 1 },
    };
    const geo = new THREE.SphereGeometry(1, 48, 24);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false,
    }));
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    this.mesh.scale.setScalar(1000);
    scene.add(this.mesh);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sunLight.position.set(0, 1, 0);
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);
    this.hemi = new THREE.HemisphereLight(0xa0b8d8, 0x504538, 0.9);
    scene.add(this.hemi);
    this.sun = { elevation: 45, azimuth: 180 };
    this.moon = { elevation: -10, azimuth: 0, phase: 0.5 };
  }

  // date: Date (UTC instant); lat/lon of the camera; weather for overcast/visibility
  update(date, lat, lon, weather, camThree) {
    const s = sunPosition(date, lat, lon);
    const m = moonPosition(date, lat, lon);
    this.sun = s;
    this.moon = m;
    const sunDir = dirFrom(s.elevation, s.azimuth, new THREE.Vector3());
    const moonDir = dirFrom(m.elevation, m.azimuth, new THREE.Vector3());
    const elev = s.elevation;
    const night = THREE.MathUtils.smoothstep(-elev, -1.5, 9.0);   // 0 day .. 1 full night
    const twilight = Math.max(0, 1 - Math.abs(elev - 1) / 9);      // golden hour weight
    const overcast = weather ? weather.overcastFactor() : 0;
    const vis = weather ? weather.visibilityAt(this.world.cameraAlt || 0) : 40000;
    const inCloud = weather ? weather.inCloud(this.world.cameraAlt || 0) : 0;

    // colours
    const dayZen = new THREE.Color(0.20, 0.42, 0.85), dayHor = new THREE.Color(0.70, 0.80, 0.92);
    const setZen = new THREE.Color(0.25, 0.32, 0.55), setHor = new THREE.Color(1.0, 0.58, 0.32);
    const nightZen = new THREE.Color(0.006, 0.010, 0.028), nightHor = new THREE.Color(0.03, 0.045, 0.08);
    const grayZ = new THREE.Color(0.48, 0.52, 0.56), grayH = new THREE.Color(0.66, 0.68, 0.70);
    const zen = dayZen.clone().lerp(setZen, twilight * 0.8).lerp(nightZen, night);
    const hor = dayHor.clone().lerp(setHor, twilight * 0.85).lerp(nightHor, night);
    const k = (1 - night) * overcast;
    zen.lerp(grayZ.clone().multiplyScalar(1 - night * 0.95), k * 0.9);
    hor.lerp(grayH.clone().multiplyScalar(1 - night * 0.95), k * 0.9);
    if (night > 0) { zen.lerp(new THREE.Color(0.02, 0.02, 0.03), overcast * night); }
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uZenith.value.copy(zen);
    this.uniforms.uHorizon.value.copy(hor);
    this.uniforms.uSunGlow.value.setRGB(1.0, 0.75 - twilight * 0.3, 0.45 - twilight * 0.3).multiplyScalar(1 - night);
    this.uniforms.uNight.value = night;
    this.uniforms.uOvercast.value = overcast;
    this.uniforms.uMoonDir.value.copy(moonDir);
    this.uniforms.uMoonPhase.value = m.phase;
    if (camThree) this.mesh.position.copy(camThree);

    // lighting
    const S = this.world.shared;
    const sunUp = THREE.MathUtils.smoothstep(elev, -2, 8);
    const sunCol = new THREE.Color(1.0, 0.95, 0.86).lerp(new THREE.Color(1.0, 0.62, 0.35), twilight * 0.9);
    sunCol.multiplyScalar(sunUp * (1 - overcast * 0.78) * 1.25);
    // moonlight
    const moonUp = THREE.MathUtils.smoothstep(m.elevation, -2, 10) * m.phase * night * (1 - overcast);
    const lightDir = sunUp > 0.02 ? sunDir : moonDir;
    if (sunUp <= 0.02) sunCol.setRGB(0.10, 0.12, 0.17).multiplyScalar(moonUp);
    S.uSunDir.value.copy(lightDir.y > 0 ? lightDir : new THREE.Vector3(lightDir.x, 0.05, lightDir.z).normalize());
    S.uSunColor.value.copy(sunCol);
    const skyAmb = zen.clone().lerp(hor, 0.5).multiplyScalar(0.9 + overcast * 0.4);
    skyAmb.add(new THREE.Color(0.012, 0.014, 0.022)); // night floor
    S.uSkyAmb.value.copy(skyAmb);
    S.uGroundAmb.value.copy(new THREE.Color(0.30, 0.27, 0.23).multiplyScalar((1 - night * 0.93) * (0.6 + 0.4 * (1 - overcast))));
    S.uZenith.value.copy(zen);
    const fog = hor.clone();
    if (inCloud > 0) fog.lerp(new THREE.Color(0.75, 0.76, 0.78).multiplyScalar(1 - night * 0.9), inCloud);
    S.uFogColor.value.copy(fog);
    const visEff = inCloud > 0 ? THREE.MathUtils.lerp(vis, 70, inCloud) : vis;
    S.uFogDensity.value = 2.25 / Math.max(visEff, 30);
    S.uNight.value = night;
    // three.js lights for standard materials
    this.sunLight.color.copy(sunCol);
    this.sunLight.intensity = 2.2;
    this.sunLight.position.copy(S.uSunDir.value).multiplyScalar(1000);
    if (camThree) { this.sunLight.position.add(camThree); this.sunLight.target.position.copy(camThree); }
    this.hemi.color.copy(skyAmb);
    this.hemi.groundColor.copy(S.uGroundAmb.value);
    this.hemi.intensity = 1.6;
    this.world.scene.fog.color.copy(fog);
    this.world.scene.fog.density = S.uFogDensity.value * 0.75;
    this.world.renderer.setClearColor(hor);
    return { night, overcast };
  }
}
