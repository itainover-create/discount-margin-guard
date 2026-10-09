// Synthesised aircraft audio (Web Audio; no recorded samples). Engine and
// propeller follow rpm and load, with wind, tyres, skids, touchdown thumps,
// stall horn, flap motor, switch clicks, radio squelch and nearby jets.
// Cockpit view is muffled (cabin), outside views use distance + Doppler.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = { master: 0.8, engine: 1, env: 0.8, radio: 0.9, voice: true };
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume.master;
    this.cabin = ctx.createBiquadFilter();
    this.cabin.type = 'lowpass';
    this.cabin.frequency.value = 20000;
    this.cabin.connect(this.master);
    this.master.connect(ctx.destination);
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = noiseBuf;
    const noise = () => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.start(); return n; };
    // ---- engine: two detuned pulse trains through a shaper and low-pass
    this.eng = {};
    const e = this.eng;
    e.o1 = ctx.createOscillator(); e.o1.type = 'sawtooth';
    e.o2 = ctx.createOscillator(); e.o2.type = 'square';
    e.o3 = ctx.createOscillator(); e.o3.type = 'sawtooth';
    e.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.6); }
    e.shaper.curve = curve;
    e.mix = ctx.createGain(); e.mix.gain.value = 0.35;
    e.o1.connect(e.mix); e.o2.connect(e.mix); e.o3.connect(e.mix);
    e.mix.connect(e.shaper);
    e.lp = ctx.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.Q.value = 2;
    e.res = ctx.createBiquadFilter(); e.res.type = 'peaking'; e.res.frequency.value = 140; e.res.gain.value = 6; e.res.Q.value = 1.2;
    e.gain = ctx.createGain(); e.gain.gain.value = 0;
    e.shaper.connect(e.lp); e.lp.connect(e.res); e.res.connect(e.gain); e.gain.connect(this.cabin);
    // exhaust roughness: noise amplitude-modulated by the firing frequency
    e.noise = noise();
    e.nbp = ctx.createBiquadFilter(); e.nbp.type = 'bandpass'; e.nbp.Q.value = 0.8;
    e.ngain = ctx.createGain(); e.ngain.gain.value = 0;
    e.noise.connect(e.nbp); e.nbp.connect(e.ngain); e.ngain.connect(this.cabin);
    // propeller buzz (blade pass) – band-limited noise with AM
    e.prop = noise();
    e.pbp = ctx.createBiquadFilter(); e.pbp.type = 'bandpass'; e.pbp.Q.value = 3;
    e.pam = ctx.createGain(); e.pam.gain.value = 0;
    e.lfo = ctx.createOscillator(); e.lfo.type = 'sine';
    e.lfoGain = ctx.createGain(); e.lfoGain.gain.value = 0;
    e.lfo.connect(e.lfoGain); e.lfoGain.connect(e.pam.gain);
    e.prop.connect(e.pbp); e.pbp.connect(e.pam); e.pam.connect(this.cabin);
    e.o1.start(); e.o2.start(); e.o3.start(); e.lfo.start();
    // ---- starter
    this.starter = ctx.createOscillator(); this.starter.type = 'sawtooth';
    this.starterGain = ctx.createGain(); this.starterGain.gain.value = 0;
    const sLp = ctx.createBiquadFilter(); sLp.type = 'lowpass'; sLp.frequency.value = 900;
    this.starter.connect(sLp); sLp.connect(this.starterGain); this.starterGain.connect(this.cabin); this.starter.start();
    // ---- wind
    this.wind = noise();
    this.windBp = ctx.createBiquadFilter(); this.windBp.type = 'bandpass'; this.windBp.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.wind.connect(this.windBp); this.windBp.connect(this.windGain); this.windGain.connect(this.master);
    // ---- tyres
    this.roll = noise();
    this.rollLp = ctx.createBiquadFilter(); this.rollLp.type = 'lowpass'; this.rollLp.frequency.value = 160;
    this.rollGain = ctx.createGain(); this.rollGain.gain.value = 0;
    this.roll.connect(this.rollLp); this.rollLp.connect(this.rollGain); this.rollGain.connect(this.master);
    this.skid = noise();
    this.skidBp = ctx.createBiquadFilter(); this.skidBp.type = 'bandpass'; this.skidBp.frequency.value = 1700; this.skidBp.Q.value = 6;
    this.skidGain = ctx.createGain(); this.skidGain.gain.value = 0;
    this.skid.connect(this.skidBp); this.skidBp.connect(this.skidGain); this.skidGain.connect(this.master);
    // ---- stall horn
    this.horn = ctx.createOscillator(); this.horn.type = 'square'; this.horn.frequency.value = 1550;
    this.hornGain = ctx.createGain(); this.hornGain.gain.value = 0;
    const hBp = ctx.createBiquadFilter(); hBp.type = 'bandpass'; hBp.frequency.value = 1550; hBp.Q.value = 4;
    this.horn.connect(hBp); hBp.connect(this.hornGain); this.hornGain.connect(this.master); this.horn.start();
    // ---- flap motor
    this.flap = ctx.createOscillator(); this.flap.type = 'sawtooth'; this.flap.frequency.value = 210;
    this.flapGain = ctx.createGain(); this.flapGain.gain.value = 0;
    this.flap.connect(this.flapGain); this.flapGain.connect(this.cabin); this.flap.start();
    // ---- jets (AI traffic)
    this.jet = noise();
    this.jetLp = ctx.createBiquadFilter(); this.jetLp.type = 'lowpass'; this.jetLp.frequency.value = 900;
    this.jetGain = ctx.createGain(); this.jetGain.gain.value = 0;
    this.jet.connect(this.jetLp); this.jetLp.connect(this.jetGain); this.jetGain.connect(this.master);
    this.jetWhine = ctx.createOscillator(); this.jetWhine.type = 'sine'; this.jetWhine.frequency.value = 2900;
    this.jetWhineGain = ctx.createGain(); this.jetWhineGain.gain.value = 0;
    this.jetWhine.connect(this.jetWhineGain); this.jetWhineGain.connect(this.master); this.jetWhine.start();
    this.lastTd = 0;
    this.lastFlaps = 0;
  }

  set(param, v, t = 0.06) { if (this.ctx) param.setTargetAtTime(v, this.ctx.currentTime, t); }

  oneShot(kind, gain = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    if (kind === 'click') { f.type = 'highpass'; f.frequency.value = 2500; g.gain.setValueAtTime(gain * 0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03); }
    else if (kind === 'thump') { f.type = 'lowpass'; f.frequency.value = 220; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); }
    else if (kind === 'squelch') { f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7; g.gain.setValueAtTime(gain * 0.25 * this.volume.radio, t); g.gain.setValueAtTime(gain * 0.25 * this.volume.radio, t + 0.12); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); }
    else if (kind === 'crash') { f.type = 'lowpass'; f.frequency.value = 900; g.gain.setValueAtTime(gain * 1.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8); }
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 2);
  }

  speak(text, lang = 'en-US') {
    if (!this.volume.voice || typeof speechSynthesis === 'undefined') return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 1.12;
      u.pitch = 0.95;
      u.volume = this.volume.radio;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* unavailable */ }
  }

  // o: aircraft outputs; view: camera view name; cam: {dist, closing (m/s)}
  update(dt, o, sw, view, cam, traffic) {
    if (!this.ctx || !this.enabled) return;
    const inside = view === 'cockpit';
    const dist = inside ? 0 : Math.max(5, cam.dist || 15);
    const att = inside ? 1 : Math.min(1, 18 / dist);
    const doppler = inside ? 1 : 343 / Math.max(150, 343 - (cam.closing || 0));
    this.set(this.cabin.frequency, inside ? 2600 : 16000, 0.1);
    const rpm = o.rpm || 0;
    const fire = (rpm / 60) * 2 * doppler;
    const load = Math.max(0, Math.min(1.2, (o.power || 0) / 120000));
    const run = o.engineRunning ? 1 : 0;
    const e = this.eng;
    const turning = Math.min(1, rpm / 300);
    this.set(e.o1.frequency, Math.max(5, fire));
    this.set(e.o2.frequency, Math.max(2.5, fire * 0.5));
    this.set(e.o3.frequency, Math.max(5, fire * 1.007));
    this.set(e.lp.frequency, 260 + load * 1600 + rpm * 0.25);
    const engVol = (run * (0.10 + 0.22 * load + 0.08 * rpm / 2700) + (1 - run) * 0.05 * turning) * this.volume.engine;
    this.set(e.gain.gain, engVol * att * (inside ? 1.25 : 1));
    this.set(e.nbp.frequency, 380 + rpm * 0.5);
    this.set(e.ngain.gain, run * (0.04 + 0.08 * load) * att);
    this.set(e.pbp.frequency, Math.max(40, fire * 2.0 + 120));
    this.set(e.lfo.frequency, Math.max(1, fire));
    this.set(e.lfoGain.gain, Math.min(1, rpm / 2700) * 0.18 * att * (inside ? 0.6 : 1.6));
    // starter
    this.set(this.starter.frequency, 90 + rpm * 0.8);
    this.set(this.starterGain.gain, o.starter ? 0.10 : 0, 0.05);
    // wind (airspeed) – louder outside, muffled inside
    const ias = o.ias || 0;
    this.set(this.windBp.frequency, 250 + ias * 12);
    this.set(this.windGain.gain, Math.min(0.35, (ias / 60) ** 2 * 0.22) * (inside ? 0.45 : 0.8) * this.volume.env);
    // tyres
    const onG = o.onGround ? 1 : 0;
    this.set(this.rollGain.gain, onG * Math.min(0.5, (o.wheelSpeed || 0) / 30) * 0.5 * this.volume.env * (inside ? 1 : att), 0.05);
    this.set(this.skidGain.gain, (o.skid || 0) * 0.35 * this.volume.env, 0.03);
    // touchdown thump
    if ((o.tdCount || 0) > this.lastTd) {
      const vs = Math.abs(o.tdVs || 0);
      this.oneShot('thump', Math.min(1, 0.2 + vs * 0.35));
      if (vs > 1.0) this.set(this.skidGain.gain, 0.3, 0.01);
    }
    this.lastTd = o.tdCount || 0;
    // stall horn (reed): warbling tone
    this.set(this.hornGain.gain, o.stallWarn && sw.battery ? 0.06 : 0, 0.03);
    // flap motor
    const moving = Math.abs((o.flapsDeg || 0) - this.lastFlaps) > 0.01;
    this.lastFlaps = o.flapsDeg || 0;
    this.set(this.flapGain.gain, moving ? 0.03 : 0, 0.05);
    if (o.crashed && !this.crashed) this.oneShot('crash', 1);
    this.crashed = !!o.crashed;
    // jets near the camera
    let jet = 0, jetClose = 1e9;
    if (traffic) {
      for (const a of traffic) {
        const loud = a.phase === 6 ? 1.0 : a.phase === 7 ? 0.7 : a.phase >= 8 && a.phase <= 10 ? 0.45 : a.speed > 1 ? 0.18 : 0.08;
        const k = (loud * 6000) / Math.max(a.dist * a.dist, 400);
        jet += k;
        jetClose = Math.min(jetClose, a.dist);
      }
    }
    jet = Math.min(0.6, jet) * (inside ? 0.35 : 1) * this.volume.env;
    this.set(this.jetGain.gain, jet, 0.2);
    this.set(this.jetLp.frequency, 400 + 3000 / (1 + jetClose / 400), 0.2);
    this.set(this.jetWhineGain.gain, jet * 0.04 / (1 + jetClose / 200), 0.2);
  }

  setPaused(p) {
    if (!this.ctx) return;
    if (p) this.ctx.suspend(); else this.ctx.resume();
  }
}
