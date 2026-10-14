// Bloom for the finished frame. The world's shaders tone-map themselves and
// the PBR objects are tone-mapped by the renderer, so instead of moving the
// whole scene into a linear HDR composer (which would change every tuned
// look), the displayed frame is copied after it is drawn, its bright parts
// (lights, sun, afterburner, fire, lit screens) are blurred down a small mip
// chain (dual-filter downsample / upsample) and added back on top.
import * as THREE from 'three';

const VS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// bright-pass with a soft knee + first downsample (13 taps)
const PREFILTER = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold, uKnee, uSat;
varying vec2 vUv;
vec3 bright(vec3 c){
  // luminance, so a saturated blue sky does not count as a light source
  // at night the brightest channel, so saturated red / green nav lights glow too
  float l = mix(dot(c, vec3(0.2126, 0.7152, 0.0722)), max(c.r, max(c.g, c.b)), uSat);
  float s = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  s = s * s / (4.0 * uKnee + 1e-4);
  float k = max(s, l - uThreshold) / max(l, 1e-4);
  return c * k;
}
void main(){
  vec2 o = uTexel;
  vec3 c = texture2D(tSrc, vUv).rgb * 0.5;
  c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 0.125;
  c += texture2D(tSrc, vUv + vec2( o.x, -o.y)).rgb * 0.125;
  c += texture2D(tSrc, vUv + vec2(-o.x,  o.y)).rgb * 0.125;
  c += texture2D(tSrc, vUv + vec2( o.x,  o.y)).rgb * 0.125;
  gl_FragColor = vec4(bright(c), 1.0);
}`;

const DOWN = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  vec2 o = uTexel;
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv - o).rgb;
  c += texture2D(tSrc, vUv + o).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb;
  c += texture2D(tSrc, vUv - vec2(o.x, -o.y)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;

const UP = /* glsl */ `
uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 uTexel; uniform float uMix;
varying vec2 vUv;
void main(){
  vec2 o = uTexel;
  vec3 c = vec3(0.0);
  c += texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(tPrev, vUv).rgb * uMix, 1.0);
}`;

// added onto the displayed frame (additive blend); warm tint at night
const COMPOSITE = /* glsl */ `
uniform sampler2D tSrc; uniform float uStrength; uniform vec3 uTint;
varying vec2 vUv;
void main(){
  vec3 b = texture2D(tSrc, vUv).rgb * uStrength * uTint;
  gl_FragColor = vec4(b, 1.0);
}`;

export class Bloom {
  constructor(renderer, { levels = 5 } = {}) {
    this.r = renderer;
    this.levels = levels;
    this.enabled = true;
    this.scale = 0.5;             // prefilter resolution relative to the drawing buffer
    this.params = { threshold: 0.8, knee: 0.25, strength: 0.6, sat: 0, tint: new THREE.Color(1, 1, 1) };
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    const mk = (fs, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, ...extra });
    this.mPre = mk(PREFILTER, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.8 }, uKnee: { value: 0.25 }, uSat: { value: 0 } });
    this.mDown = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = mk(UP, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } });
    this.mOut = mk(COMPOSITE, { tSrc: { value: null }, uStrength: { value: 0.6 }, uTint: { value: new THREE.Color(1, 1, 1) } },
      { blending: THREE.AdditiveBlending, transparent: true });
    this.size = new THREE.Vector2();
    this.src = null;
    this.down = [];
    this.up = [];
  }

  _alloc(w, h) {
    this.dispose(false);
    this.src = new THREE.FramebufferTexture(w, h);
    this.src.minFilter = this.src.magFilter = THREE.LinearFilter;
    const type = this.r.capabilities.isWebGL2 !== false ? THREE.HalfFloatType : THREE.UnsignedByteType;
    let bw = Math.max(1, Math.round(w * this.scale)), bh = Math.max(1, Math.round(h * this.scale));
    for (let i = 0; i < this.levels; i++) {
      const o = { type, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
      this.down.push(new THREE.WebGLRenderTarget(bw, bh, o));
      this.up.push(new THREE.WebGLRenderTarget(bw, bh, o));
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    }
    this.size.set(w, h);
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.camera);
  }

  // night: 0..1 (more glow and a lower threshold after dark)
  update(night = 0) {
    const p = this.params;
    // day: only the sun, glints and sunlit cloud tops; night: every light glows
    p.threshold = 0.9 - 0.52 * night;
    p.knee = 0.1 + 0.1 * night;
    p.strength = 0.35 + 2.05 * night;
    p.sat = night;
    p.tint.setRGB(1, 1 - 0.04 * night, 1 - 0.1 * night);
  }

  // Call right after the scene was rendered to the screen.
  render() {
    if (!this.enabled) return;
    const r = this.r;
    const db = r.getDrawingBufferSize(this._db || (this._db = new THREE.Vector2()));
    if (db.x < 2 || db.y < 2) return;
    if (!this.src || db.x !== this.size.x || db.y !== this.size.y) this._alloc(db.x, db.y);
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const prevTone = r.toneMapping;
    const prevReset = r.info.autoReset;
    r.info.autoReset = false;      // the bloom passes add to the frame's counts
    r.autoClear = false;
    r.copyFramebufferToTexture(this.src);
    const p = this.params;
    this.mPre.uniforms.tSrc.value = this.src;
    this.mPre.uniforms.uTexel.value.set(1 / db.x, 1 / db.y);
    this.mPre.uniforms.uThreshold.value = p.threshold;
    this.mPre.uniforms.uKnee.value = p.knee;
    this.mPre.uniforms.uSat.value = p.sat;
    this._pass(this.mPre, this.down[0]);
    for (let i = 1; i < this.levels; i++) {
      const s = this.down[i - 1];
      this.mDown.uniforms.tSrc.value = s.texture;
      this.mDown.uniforms.uTexel.value.set(1 / s.width, 1 / s.height);
      this._pass(this.mDown, this.down[i]);
    }
    // upsample: each level adds the blurred coarser level onto its own
    let prev = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      this.mUp.uniforms.tSrc.value = prev.texture;
      this.mUp.uniforms.tPrev.value = this.down[i].texture;
      this.mUp.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
      this.mUp.uniforms.uMix.value = 1;
      this._pass(this.mUp, this.up[i]);
      prev = this.up[i];
    }
    this.mOut.uniforms.tSrc.value = prev.texture;
    this.mOut.uniforms.uStrength.value = p.strength;
    this.mOut.uniforms.uTint.value.copy(p.tint);
    this._pass(this.mOut, prevTarget);
    r.autoClear = prevAuto;
    r.toneMapping = prevTone;
    r.info.autoReset = prevReset;
  }

  passCount() { return this.enabled ? this.levels * 2 + 1 : 0; }

  dispose(all = true) {
    if (this.src) this.src.dispose();
    for (const t of this.down.concat(this.up)) t.dispose();
    this.src = null; this.down = []; this.up = [];
    if (all) for (const m of [this.mPre, this.mDown, this.mUp, this.mOut]) m.dispose();
  }
}
