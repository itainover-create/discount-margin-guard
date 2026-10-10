// Original score for the ORION GAMES / GLOBAL SKIES opening, synthesised with
// Web Audio (no samples): star bells, a swelling pad, a brass-like chord
// progression (Dm - Bb - F - C - Dm, resolving to D major on the title),
// timpani, impacts, risers and a jet pass. Also a quiet ambient loop for the
// menus. All times are seconds from play().
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
const m = { D2: 38, F2: 41, A2: 45, Bb2: 46, C3: 48, D3: 50, E3: 52, F3: 53, Fs3: 54, G3: 55, A3: 57, Bb3: 58, C4: 60, D4: 62, E4: 64, F4: 65, Fs4: 66, A4: 69, D5: 74, F5: 77, A5: 81, C6: 84, D6: 86, E6: 88 };
const f = (k) => NOTE(m[k]);

export class Music {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    this.out.connect(out);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 3;
    this.comp.connect(this.out);
    this.dry = ctx.createGain();
    this.dry.connect(this.comp);
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(3.2, 2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.verb.connect(this.wet);
    this.wet.connect(this.comp);
    this.noise = this._noiseBuffer();
    this.nodes = [];
    this.ambientTimer = null;
  }

  setVolume(v) { this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }

  _impulse(sec, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }

  _noiseBuffer() {
    const ctx = this.ctx, b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _track(n) {
    this.nodes.push(n);
    n.addEventListener('ended', () => { const i = this.nodes.indexOf(n); if (i >= 0) this.nodes.splice(i, 1); });
    return n;
  }
  _send(node, wet = 0.5) {
    node.connect(this.dry);
    const g = this.ctx.createGain();
    g.gain.value = wet;
    node.connect(g);
    g.connect(this.verb);
  }

  // ---- instruments --------------------------------------------------------
  pad(freqs, t, dur, vol = 0.06, cut0 = 300, cut1 = 1400, attack = 1.4) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(cut0, t);
    lp.frequency.linearRampToValueAtTime(cut1, t + dur * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - 1.6));
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g);
    this._send(g, 0.7);
    for (const fr of freqs) {
      for (const [type, det] of [['sawtooth', -8], ['sawtooth', 7], ['triangle', 0]]) {
        const o = this._track(ctx.createOscillator());
        o.type = type;
        o.frequency.value = fr;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    }
  }

  brass(freqs, t, dur, vol = 0.08) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2.5;
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 0.13);
    lp.frequency.exponentialRampToValueAtTime(1100, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.07);
    g.gain.linearRampToValueAtTime(vol * 0.7, t + 0.6);
    g.gain.setValueAtTime(vol * 0.7, t + Math.max(0.6, dur - 0.8));
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g);
    this._send(g, 0.45);
    for (const fr of freqs) {
      for (const det of [-6, 5]) {
        const o = this._track(ctx.createOscillator());
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(fr * 0.985, t);
        o.frequency.linearRampToValueAtTime(fr, t + 0.06);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
    }
  }

  bell(fr, t, vol = 0.05, pan = 0) {
    const ctx = this.ctx;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    this._send(p, 0.9);
    for (const [ratio, amp, dec] of [[1, 1, 2.2], [2.76, 0.4, 1.0], [5.4, 0.2, 0.5]]) {
      const o = this._track(ctx.createOscillator());
      o.type = 'sine';
      o.frequency.value = fr * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * amp, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g);
      g.connect(p);
      o.start(t);
      o.stop(t + dec + 0.05);
    }
  }

  pluck(fr, t, vol = 0.05) {
    const ctx = this.ctx;
    const o = this._track(ctx.createOscillator());
    o.type = 'triangle';
    o.frequency.value = fr;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g);
    this._send(g, 0.6);
    o.start(t);
    o.stop(t + 0.7);
  }

  timpani(t, fr = 73, vol = 0.5) {
    const ctx = this.ctx;
    const o = this._track(ctx.createOscillator());
    o.type = 'sine';
    o.frequency.setValueAtTime(fr * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(fr, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g);
    this._send(g, 0.5);
    o.start(t);
    o.stop(t + 1.7);
    this._noiseHit(t, 160, 0.25, vol * 0.6, 'bandpass', 1.2);
  }

  impact(t, vol = 0.7) {
    const ctx = this.ctx;
    const o = this._track(ctx.createOscillator());
    o.type = 'sine';
    o.frequency.setValueAtTime(62, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 1.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    o.connect(g);
    g.connect(this.dry);
    o.start(t);
    o.stop(t + 2.7);
    this._noiseHit(t, 900, 0.5, vol * 0.35, 'lowpass', 0.8);
  }

  _noiseHit(t, freq, dur, vol, type = 'lowpass', q = 0.7) {
    const ctx = this.ctx;
    const n = this._track(ctx.createBufferSource());
    n.buffer = this.noise;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = freq;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(fl);
    fl.connect(g);
    this._send(g, 0.4);
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  // rising noise sweep that peaks at t + dur
  riser(t, dur, vol = 0.12, f0 = 300, f1 = 7000) {
    const ctx = this.ctx;
    const n = this._track(ctx.createBufferSource());
    n.buffer = this.noise;
    n.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = 'bandpass';
    fl.Q.value = 1.4;
    fl.frequency.setValueAtTime(f0, t);
    fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    n.connect(fl);
    fl.connect(g);
    this._send(g, 0.5);
    n.start(t);
    n.stop(t + dur + 0.1);
  }

  // jet / swoosh pass across the stereo field
  whoosh(t, dur, vol = 0.18, pan0 = -1, pan1 = 1) {
    const ctx = this.ctx;
    const n = this._track(ctx.createBufferSource());
    n.buffer = this.noise;
    n.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = 'bandpass';
    fl.Q.value = 0.9;
    fl.frequency.setValueAtTime(500, t);
    fl.frequency.exponentialRampToValueAtTime(2400, t + dur * 0.45);
    fl.frequency.exponentialRampToValueAtTime(350, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(pan0, t);
    p.pan.linearRampToValueAtTime(pan1, t + dur);
    n.connect(fl);
    fl.connect(g);
    g.connect(p);
    this._send(p, 0.3);
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  // ---- the opening score (≈15.5 s), synchronised with ui/intro.js ---------
  playIntro() {
    const t = this.ctx.currentTime + 0.05;
    // night sky: low pad, star bells as Orion's stars appear
    this.pad([f('D2'), f('A2'), f('D3')], t, 3.3, 0.05, 200, 900, 1.6);
    const stars = ['A5', 'D6', 'F5', 'C6', 'A5', 'E6', 'D5', 'F5'];
    stars.forEach((k, i) => this.bell(f(k), t + 0.25 + i * 0.27, 0.035, (i % 2 ? 0.5 : -0.5) * (i / 8)));
    // gathering into the sparkle
    this.riser(t + 1.9, 1.15, 0.1, 400, 9000);
    // logo: impact + brass Dm, sparkle runs the orbit
    this.impact(t + 3.05, 0.65);
    this.timpani(t + 3.05, 73, 0.5);
    this.brass([f('D3'), f('F3'), f('A3'), f('D4')], t + 3.05, 2.0, 0.07);
    this.pad([f('D3'), f('A3')], t + 3.05, 3.5, 0.035, 500, 1800, 0.4);
    this.whoosh(t + 3.1, 1.7, 0.08, -0.8, 0.8);
    // ORION letters: plucks, then Bb - F - C
    ['D5', 'F5', 'A5', 'C6', 'D6'].forEach((k, i) => this.pluck(f(k), t + 5.0 + i * 0.09, 0.04));
    this.brass([f('Bb2'), f('D3'), f('F3'), f('Bb3')], t + 5.05, 1.4, 0.06);
    this.brass([f('F2'), f('A2'), f('C3'), f('F3')], t + 6.4, 1.1, 0.06);
    this.timpani(t + 6.4, 55, 0.3);
    this.brass([f('C3'), f('E3'), f('G3'), f('C4')], t + 7.45, 1.4, 0.06);
    // signature: soft Dm, bells
    this.pad([f('D3'), f('F3'), f('A3')], t + 7.6, 3.2, 0.04, 600, 1600, 0.6);
    this.bell(f('A5'), t + 7.8, 0.03, -0.3);
    this.bell(f('D6'), t + 8.6, 0.03, 0.3);
    // title: riser, hit, D major, jet pass
    this.riser(t + 9.9, 1.7, 0.14, 250, 8000);
    this.timpani(t + 10.9, 73, 0.28);
    this.timpani(t + 11.15, 73, 0.32);
    this.timpani(t + 11.35, 73, 0.38);
    this.impact(t + 11.6, 0.8);
    this.timpani(t + 11.6, 73, 0.6);
    this.brass([f('D3'), f('Fs3'), f('A3'), f('D4'), f('Fs4')], t + 11.6, 3.6, 0.085);
    this.pad([f('D2'), f('A2'), f('D3'), f('Fs3'), f('A3')], t + 11.6, 4.2, 0.05, 700, 2600, 0.3);
    this.bell(f('A5'), t + 11.7, 0.04, -0.4);
    this.bell(f('D6'), t + 11.9, 0.04, 0.4);
    this.whoosh(t + 11.0, 2.4, 0.22, -1, 1);
    return t;
  }

  // ---- quiet menu ambience: slow chord cycle with occasional bells --------
  startAmbient(vol = 0.032) {
    if (this.ambientTimer) return;
    const chords = [['D3', 'A3', 'F4'], ['Bb2', 'F3', 'D4'], ['F2', 'C3', 'A3'], ['C3', 'G3', 'E4']];
    let i = 0;
    const step = () => {
      const t = this.ctx.currentTime + 0.05;
      this.pad(chords[i % 4].map(f), t, 9.5, vol, 400, 1100, 3.0);
      if (i % 2 === 0) this.bell(f(['A5', 'D6', 'F5', 'C6'][i % 4]), t + 3, vol * 0.6, (Math.random() - 0.5) * 0.8);
      i++;
    };
    step();
    this.ambientTimer = setInterval(step, 8000);
  }

  stopAmbient() {
    clearInterval(this.ambientTimer);
    this.ambientTimer = null;
  }

  stopAll(fade = 0.6) {
    this.stopAmbient();
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + fade);
    const nodes = this.nodes;
    this.nodes = [];
    setTimeout(() => { for (const n of nodes) { try { n.stop(); } catch { /* already stopped */ } } }, fade * 1000 + 50);
  }

  resume(vol) { this.out.gain.cancelScheduledValues(this.ctx.currentTime); this.out.gain.setValueAtTime(vol, this.ctx.currentTime); }
}
