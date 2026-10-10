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
    // ---- player turbofans: fan whine (blade pass + buzz-saw) and core roar
    const J = (this.jetEng = {});
    J.fan1 = ctx.createOscillator(); J.fan1.type = 'triangle';
    J.fan2 = ctx.createOscillator(); J.fan2.type = 'sawtooth';
    J.fanBp = ctx.createBiquadFilter(); J.fanBp.type = 'bandpass'; J.fanBp.Q.value = 2.5;
    J.fanGain = ctx.createGain(); J.fanGain.gain.value = 0;
    J.fan1.connect(J.fanBp); J.fan2.connect(J.fanBp); J.fanBp.connect(J.fanGain); J.fanGain.connect(this.cabin);
    J.fan1.start(); J.fan2.start();
    J.roar = noise();
    J.roarLp = ctx.createBiquadFilter(); J.roarLp.type = 'lowpass'; J.roarLp.Q.value = 0.7;
    J.roarGain = ctx.createGain(); J.roarGain.gain.value = 0;
    J.roar.connect(J.roarLp); J.roarLp.connect(J.roarGain); J.roarGain.connect(this.cabin);
    J.ab = noise();
    J.abLp = ctx.createBiquadFilter(); J.abLp.type = 'lowpass'; J.abLp.frequency.value = 260;
    J.abGain = ctx.createGain(); J.abGain.gain.value = 0;
    J.crackle = ctx.createOscillator(); J.crackle.type = 'square'; J.crackle.frequency.value = 23;
    J.crackleDepth = ctx.createGain(); J.crackleDepth.gain.value = 0;
    J.crackle.connect(J.crackleDepth); J.crackleDepth.connect(J.abGain.gain); J.crackle.start();
    J.ab.connect(J.abLp); J.abLp.connect(J.abGain); J.abGain.connect(this.cabin);
    // stick shaker (low rumble) and warning tones
    this.shaker = ctx.createOscillator(); this.shaker.type = 'square'; this.shaker.frequency.value = 28;
    this.shakerGain = ctx.createGain(); this.shakerGain.gain.value = 0;
    const shLp = ctx.createBiquadFilter(); shLp.type = 'lowpass'; shLp.frequency.value = 120;
    this.shaker.connect(shLp); shLp.connect(this.shakerGain); this.shakerGain.connect(this.master); this.shaker.start();
    this.warnT = 0;
    this.gpws = { last: '', lastT: 0, rad: 9999 };
    this.lastTd = 0;
    this.lastFlaps = 0;
  }

  // short synthesized tones: fire bell, gear horn, master caution, overspeed clacker
  tone(kind) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(this.master);
    if (kind === 'bell') { o.type = 'sine'; o.frequency.value = 760; g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45); }
    else if (kind === 'horn') { o.type = 'square'; o.frequency.value = 600; g.gain.setValueAtTime(0.05, t); g.gain.setValueAtTime(0.05, t + 0.38); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42); }
    else if (kind === 'caution') { o.type = 'sine'; o.frequency.value = 980; g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); }
    else if (kind === 'clacker') { o.type = 'square'; o.frequency.value = 2200; g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03); }
    o.start(t); o.stop(t + 0.5);
  }

  // Player turbofans, warnings and GPWS callouts. Returns the GPWS message shown on the PFD/HUD.
  updateJet(dt, o, sw, view, cam, f) {
    const J = this.jetEng, inside = view === 'cockpit';
    const dist = inside ? 0 : Math.max(5, cam.dist || 30);
    const att = inside ? 1 : Math.min(1, (f.g ? f.g.b : 20) * 1.4 / dist);
    const doppler = inside ? 1 : 343 / Math.max(150, 343 - (cam.closing || 0));
    const n = f.engines;
    let n1 = 0, run = 0;
    for (let i = 0; i < n; i++) { n1 += o['n1_' + i] || 0; if ((o.engMask >> i) & 1) run++; }
    n1 /= Math.max(1, n);
    const x = Math.max(0, Math.min(1, (n1 - 18) / 82));
    const mil = f.cat === 'Fighter' || f.cat === 'Bomber';
    const bpf = (mil ? 1600 : 1100) + n1 * (mil ? 26 : 19);   // fan blade-passing frequency
    this.set(J.fan1.frequency, bpf * doppler);
    this.set(J.fan2.frequency, bpf * 0.5 * doppler * (1 + 0.004 * Math.sin(this.ctx.currentTime * 3)));
    this.set(J.fanBp.frequency, bpf * doppler);
    const heavy = f.sound === 'fanHeavy' ? 1.25 : 1;
    this.set(J.fanGain.gain, (n1 > 2 ? (0.015 + 0.05 * x) * Math.min(1, n1 / 20) : 0) * att * (inside ? 0.5 : 1.2) * (o.mach > 1 && inside ? 0.2 : 1) * this.volume.engine);
    this.set(J.roarLp.frequency, 300 + x * (inside ? 900 : 2600) * heavy);
    const roar = (run / Math.max(1, n)) * (0.03 + 0.24 * x * x) * heavy * (o.reverser ? 1.6 : 1);
    this.set(J.roarGain.gain, roar * att * (inside ? 0.55 : 1.1) * this.volume.engine);
    const ab = o.afterburner ? 1 : 0;
    this.set(J.abGain.gain, ab * 0.35 * att * (inside ? 0.6 : 1.4) * this.volume.engine, 0.15);
    this.set(J.crackleDepth.gain, ab * 0.18 * att, 0.15);
    // mute the piston sounds
    const e = this.eng;
    this.set(e.gain.gain, 0); this.set(e.ngain.gain, 0); this.set(e.lfoGain.gain, 0);
    this.set(this.starterGain.gain, o.starter ? 0.05 : 0, 0.2);
    this.set(this.starter.frequency, 180 + (o.n2Avg || 0) * 14);
    // stick shaker instead of the stall horn
    this.set(this.hornGain.gain, 0);
    this.set(this.shakerGain.gain, o.stallWarn && sw.battery ? 0.22 : 0, 0.03);
    // warnings (repeating)
    this.warnT -= dt;
    const fire = (o.fireMask | 0) !== 0;
    const ra = (o.agl || 0) / 0.3048;
    const gearWarn = ((o.events | 0) & 65536) !== 0;
    if (this.warnT <= 0) {
      this.warnT = 0.5;
      if (fire && sw.battery) this.tone('bell');
      else if (gearWarn && sw.battery) this.tone('horn');
      else if (o.overspeed) { for (let i = 0; i < 6; i++) setTimeout(() => this.tone('clacker'), i * 70); }
    }
    // GPWS: radio altitude callouts and alerts
    const G = this.gpws;
    let msg = '';
    const sink = -(o.vs || 0) / 0.00508;
    if (!o.onGround && sw.battery && o.avionicsPowered) {
      if (ra < 2400 && sink > 2500 + ra * 2 && ra > 50) msg = ra < 1000 && sink > 3500 ? 'PULL UP' : 'SINK RATE';
      else if (gearWarn) msg = 'TOO LOW GEAR';
      for (const c of [2500, 1000, 500, 100, 50, 40, 30, 20, 10]) {
        if (G.rad > c && ra <= c && sink > 50 && o.gearPos > 0.5) { this.speak(c >= 1000 ? `${c === 2500 ? 'twenty five hundred' : 'one thousand'}` : c === 500 ? 'five hundred' : c === 100 ? 'one hundred' : String(c), 'en-US', false); break; }
      }
      if (msg && (msg !== G.last || this.ctx.currentTime - G.lastT > 2.5)) { this.speak(msg.toLowerCase(), 'en-US', false); G.lastT = this.ctx.currentTime; }
    }
    G.last = msg;
    G.rad = ra;
    return msg;
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

  speak(text, lang = 'en-US', interrupt = true) {
    if (!this.volume.voice || typeof speechSynthesis === 'undefined') return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = interrupt ? 1.12 : 1.3;
      u.pitch = interrupt ? 0.95 : 0.8;
      u.volume = this.volume.radio;
      if (interrupt) speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* unavailable */ }
  }

  // o: aircraft outputs; view: camera view name; cam: {dist, closing (m/s)}
  update(dt, o, sw, view, cam, traffic, fleet) {
    if (!this.ctx || !this.enabled) return '';
    const jetAc = fleet && fleet.style !== 'trainer' && fleet.style !== 'aerobatic';
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
    if (!jetAc && this.jetEng) { const J = this.jetEng; this.set(J.fanGain.gain, 0); this.set(J.roarGain.gain, 0); this.set(J.abGain.gain, 0); this.set(this.shakerGain.gain, 0); }
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
    let gpws = '';
    if (jetAc) gpws = this.updateJet(dt, o, sw, view, cam, fleet);
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
    return gpws;
  }

  setPaused(p) {
    if (!this.ctx) return;
    if (p) this.ctx.suspend(); else this.ctx.resume();
  }
}
