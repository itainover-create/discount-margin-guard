// Image-based lighting for the PBR objects (player and AI aircraft, cockpit):
// a tiny scene holding the current sky (zenith/horizon gradient, sun disc and
// halo, ground below the horizon) is prefiltered with PMREM into
// scene.environment. Re-baked only when the sun or sky colours move enough,
// so metal, clearcoat paint and glass reflect the real sky at that moment.
// The world's own shaders (terrain, buildings, water) do their own lighting.
import * as THREE from 'three';

const VS = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = /* glsl */ `
uniform vec3 uZenith, uHorizon, uGround, uSunCol, uSunDir; uniform float uNight; uniform float uCity;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  // ground: darker than the horizon, a soft band of haze at the horizon line
  vec3 gnd = mix(uHorizon * 0.55, uGround, smoothstep(0.0, -0.35, h));
  vec3 col = h >= 0.0 ? sky : gnd;
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  // sun disc (bright enough to give a specular highlight) and a warm halo
  col += uSunCol * (pow(s, 1800.0) * 60.0 + pow(s, 24.0) * 0.6 + pow(s, 4.0) * 0.12) * step(-0.02, h);
  col *= 1.0 - uNight * 0.6;
  // at night a lit city below washes the underside of the aircraft in warm light
  col += vec3(0.11, 0.075, 0.045) * uCity * uNight * smoothstep(0.1, -0.5, h);
  col += vec3(0.012, 0.015, 0.024) * uNight;
  gl_FragColor = vec4(col, 1.0);
}`;

export class SkyEnvironment {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.target = scene;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.scene = new THREE.Scene();
    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 }, uCity: { value: 0 },
    };
    const m = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false }));
    this.scene.add(m);
    this.rt = null;
    this.last = null;
    this.cooldown = 0;
    this.enabled = true;
  }

  // sky: Sky instance (its uniforms carry the current colours); shared: world uniforms
  update(dt, sky, shared, city = 0) {
    if (!this.enabled) return;
    this.uniforms.uCity.value = city;
    this.cooldown -= dt;
    const u = this.uniforms;
    u.uZenith.value.copy(sky.uniforms.uZenith.value);
    u.uHorizon.value.copy(sky.uniforms.uHorizon.value);
    u.uGround.value.copy(shared.uGroundAmb.value).multiplyScalar(0.9);
    u.uSunCol.value.copy(shared.uSunColor.value);
    u.uSunDir.value.copy(shared.uSunDir.value);
    u.uNight.value = shared.uNight.value;
    // signature of what the environment shows; re-bake when it moved enough
    const sig = [u.uSunDir.value.x, u.uSunDir.value.y, u.uSunDir.value.z, u.uZenith.value.r, u.uZenith.value.g, u.uZenith.value.b,
      u.uHorizon.value.r, u.uHorizon.value.g, u.uHorizon.value.b, u.uSunCol.value.r, u.uNight.value, city];
    let delta = Infinity;
    if (this.last) { delta = 0; for (let i = 0; i < sig.length; i++) delta = Math.max(delta, Math.abs(sig[i] - this.last[i])); }
    if (delta < 0.015 || (this.cooldown > 0 && delta < 0.2)) return;
    this.last = sig;
    this.cooldown = 2.0;
    const rt = this.pmrem.fromScene(this.scene, 0, 0.1, 100, { size: 128 });
    if (this.rt) this.rt.dispose();
    this.rt = rt;
    this.target.environment = rt.texture;
  }

  dispose() {
    if (this.rt) this.rt.dispose();
    this.pmrem.dispose();
    this.target.environment = null;
  }
}
