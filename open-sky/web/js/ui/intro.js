// Opening sequence: the Orion constellation forms in a night sky, gathers into
// the poster's sparkle, which sweeps the orbit and reveals the ORION mark; ORION GAMES, the
// slogan and the signature follow, then the GLOBAL SKIES title over in-engine
// key art. Synchronised with the score in audio/music.js. Skippable.
import { lockup, gameTitle, loadEmblem, RIGHTS, COPYRIGHT, COMPANY, EMBLEM_GEO, EMBLEM_URL } from './brand.js';
import { Music } from '../audio/music.js';

// Orion (as seen from the northern hemisphere), normalised screen positions
const ORION = [
  ['Betelgeuse', 0.31, 0.20, 3.2], ['Rigel', 0.70, 0.80, 3.4], ['Bellatrix', 0.66, 0.25, 2.4], ['Saiph', 0.37, 0.83, 2.2],
  ['Alnitak', 0.44, 0.53, 2.3], ['Alnilam', 0.50, 0.505, 2.4], ['Mintaka', 0.56, 0.48, 2.2], ['Meissa', 0.49, 0.10, 1.8],
];
const LINES = [[7, 0], [7, 2], [0, 4], [2, 6], [4, 5], [5, 6], [4, 3], [6, 1]];
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

export class Intro {
  constructor(game) {
    this.g = game;
    this.el = null;
  }

  static wanted(game) {
    if (/[?&]intro\b/.test(location.search)) return true;
    if (navigator.webdriver || /skipintro/.test(location.search)) return false;
    return game.settings.intro !== false;
  }

  // gate: true shows "click to start" first (browsers need a gesture for audio)
  async run({ gate = true } = {}) {
    await loadEmblem();
    this._build();
    if (gate) await this._gate();
    return new Promise((resolve) => {
      this.done = resolve;
      this._play();
    });
  }

  _build() {
    const el = (this.el = document.createElement('section'));
    el.id = 'intro';
    el.innerHTML = `
      <canvas class="intro-stars"></canvas>
      <div class="intro-art"></div>
      <div class="intro-flash"></div>
      <div class="intro-stage"></div>
      <div class="intro-title">
        <div class="intro-presents">${COMPANY} PRESENTS</div>
        <div class="intro-gt"></div>
        <div class="intro-streak"></div>
      </div>
      <div class="intro-gate">
        <div class="gate-logo"></div>
        <button class="gate-start">CLICK OR PRESS ANY KEY</button>
        <div class="gate-note">Sound on · the opening can be skipped with Esc</div>
      </div>
      <div class="intro-skip">Esc / click to skip</div>
      <div class="intro-foot">${RIGHTS}<br>${COPYRIGHT}</div>`;
    document.body.appendChild(el);
    this.stage = el.querySelector('.intro-stage');
    this.logo = lockup({ signature: true, cls: 'intro-lockup' });
    this.stage.appendChild(this.logo);
    el.querySelector('.intro-gt').appendChild(gameTitle('intro'));
    el.querySelector('.gate-logo').appendChild(lockup({ slogan: true, cls: 'gate' }));
    el.querySelector('.gate-logo').appendChild(gameTitle('gate'));
    this.canvas = el.querySelector('.intro-stars');
    this._resize = () => { this.canvas.width = innerWidth * devicePixelRatio; this.canvas.height = innerHeight * devicePixelRatio; };
    this._resize();
    addEventListener('resize', this._resize);
    // emblem: revealed by a sweep that follows the orbit from the sparkle
    this.emb = this.logo.querySelector('.brand-emblem');
    this.emb.style.setProperty('--emblem-mask', `url("${EMBLEM_URL}")`);
    this.glint = document.createElement('i');
    this.glint.className = 'orbit-glint';
    this.flare = document.createElement('i');
    this.flare.className = 'spark-flare';
    this.emb.append(this.glint, this.flare);
    this._setSweep(0);
    this.sig = this.logo.querySelector('.brand-sig');
    this.pen = this.sig.querySelector('.pen');
    this.sigImg = this.sig.querySelector('img');
    // stars
    this.stars = Array.from({ length: 420 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, p: Math.random() * 6.28, s: 0.5 + Math.random() * 2 }));
  }

  _gate() {
    this.el.classList.add('gating');
    return new Promise((resolve) => {
      const go = (e) => {
        if (e && e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
        removeEventListener('keydown', go, true);
        this.el.removeEventListener('pointerdown', go);
        this.el.classList.remove('gating');
        resolve();
      };
      addEventListener('keydown', go, true);
      this.el.addEventListener('pointerdown', go);
      // draw a calm starfield behind the gate
      const loop = () => { if (!this.el.classList.contains('gating')) return; this._drawSky(0, true); requestAnimationFrame(loop); };
      loop();
    });
  }

  _play() {
    const g = this.g;
    g.audio.start();
    if (g.audio.ctx && (g.settings.music ?? 0.7) > 0) {
      if (!g.music) g.music = new Music(g.audio.ctx, g.audio.ctx.destination);
      g.music.resume(g.settings.music ?? 0.7);
      g.music.playIntro();
    }
    this.t0 = performance.now();
    this.el.classList.add('playing');
    this._skip = (e) => {
      if (performance.now() - this.t0 < 400) return;
      if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      this._finish(true);
    };
    addEventListener('keydown', this._skip, true);
    this.el.addEventListener('pointerdown', this._skip);
    const cues = [
      [3.30, () => this.el.classList.add('a-on')],
      [4.85, () => this.el.classList.add('shine')],
      [5.00, () => this.logo.classList.add('word-on')],
      [5.80, () => this.logo.classList.add('games-on')],
      [6.40, () => this.logo.classList.add('slogan-on')],
      [7.40, () => this.logo.classList.add('sig-on')],
      [8.80, () => this.logo.classList.add('name-on')],
      [10.40, () => this.el.classList.add('stage-out', 'art-on')],
      [11.00, () => this.el.classList.add('presents-on')],
      [11.60, () => this.el.classList.add('title-on', 'flash')],
      [12.00, () => this.el.classList.remove('flash')],
      [12.50, () => this.el.classList.add('sub-on')],
      [15.40, () => this._finish(false)],
    ];
    let ci = 0;
    const frame = () => {
      if (this.finished) return;
      const t = (performance.now() - this.t0) / 1000;
      while (ci < cues.length && t >= cues[ci][0]) cues[ci++][1]();
      if (t < 10.8) this._drawSky(t, false);
      this._emblem(t);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // night sky with the Orion constellation forming and collapsing into the sparkle
  _drawSky(t, calm) {
    const c = this.canvas, x = c.getContext('2d'), W = c.width, H = c.height, dpr = devicePixelRatio;
    x.clearRect(0, 0, W, H);
    const fade = calm ? 1 : 1 - ease((t - 9.6) / 1.0);
    for (const s of this.stars) {
      const tw = 0.55 + 0.45 * Math.sin(s.p + performance.now() / 1000 * s.s);
      x.globalAlpha = tw * 0.8 * fade;
      x.fillStyle = '#cfe0ff';
      x.beginPath();
      x.arc(s.x * W, s.y * H, s.r * dpr, 0, 6.283);
      x.fill();
    }
    if (calm) { x.globalAlpha = 1; return; }
    // constellation box (centred, a bit to the left of the logo)
    const size = Math.min(W, H) * 0.62, ox = W / 2 - size / 2, oy = H / 2 - size / 2;
    const target = this._sparkleScreen();
    const collapse = ease((t - 2.55) / 0.5);
    const pos = ORION.map(([, sx, sy]) => {
      let px = ox + sx * size, py = oy + sy * size;
      const bx = ox + 0.5 * size, by = oy + 0.505 * size;
      px += (bx - px) * collapse; py += (by - py) * collapse;
      const fly = ease((t - 2.95) / 0.25);
      return [px + (target[0] - px) * fly, py + (target[1] - py) * fly];
    });
    // lines
    const lineP = Math.min(1, Math.max(0, (t - 1.2) / 1.3));
    x.strokeStyle = '#e8c88a';
    x.lineWidth = 1.2 * dpr;
    x.globalAlpha = 0.55 * (1 - collapse);
    LINES.forEach(([a, b], i) => {
      const k = Math.min(1, Math.max(0, lineP * LINES.length - i));
      if (k <= 0) return;
      x.beginPath();
      x.moveTo(pos[a][0], pos[a][1]);
      x.lineTo(pos[a][0] + (pos[b][0] - pos[a][0]) * k, pos[a][1] + (pos[b][1] - pos[a][1]) * k);
      x.stroke();
    });
    // stars
    ORION.forEach(([, , , mag], i) => {
      const on = ease((t - (0.25 + i * 0.27)) / 0.35);
      if (on <= 0 || t > 3.3) return;
      const [px, py] = pos[i];
      const r = mag * dpr * (1 + collapse * 1.5);
      const gr = x.createRadialGradient(px, py, 0, px, py, r * 7);
      gr.addColorStop(0, 'rgba(255,248,226,1)');
      gr.addColorStop(0.2, 'rgba(255,214,140,0.55)');
      gr.addColorStop(1, 'rgba(255,190,90,0)');
      x.globalAlpha = on * (t > 3.0 ? 1 - ease((t - 3.0) / 0.3) : 1);
      x.fillStyle = gr;
      x.beginPath();
      x.arc(px, py, r * 7, 0, 6.283);
      x.fill();
    });
    x.globalAlpha = 1;
  }

  // point on the orbit ellipse (emblem fractions) for parameter th (radians)
  _orbitPt(th) {
    const G = EMBLEM_GEO, r = (G.rot * Math.PI) / 180;
    const ux = Math.cos(r), uy = Math.sin(r);
    // ellipse in pixel-aspect space (x scaled by the image aspect)
    const ax = G.a * Math.cos(th), by = G.b * Math.sin(th);
    const px = ax * ux - by * uy, py = ax * uy + by * ux;
    return [G.center[0] + px, G.center[1] + py * G.aspect];
  }

  _sparkleScreen() {
    const r = this.emb.getBoundingClientRect(), [sx, sy] = EMBLEM_GEO.sparkle;
    return [(r.left + sx * r.width) * devicePixelRatio, (r.top + sy * r.height) * devicePixelRatio];
  }

  // conic mask around the orbit centre: everything the sweep has passed is visible
  _setSweep(k) {
    const G = EMBLEM_GEO;
    const cx = (G.center[0] * 100).toFixed(1), cy = (G.center[1] * 100).toFixed(1);
    let m;
    if (k <= 0) m = 'linear-gradient(transparent, transparent)';
    else if (k >= 1) m = 'none';
    else {
      // the sparkle sits at ~174deg (screen, from +x, y down); the sweep runs counter-clockwise
      const startCss = 174 + 90, span = 360 * k;
      m = `conic-gradient(from ${(startCss - span).toFixed(1)}deg at ${cx}% ${cy}%, transparent 0deg, #000 6deg, #000 ${span.toFixed(1)}deg, transparent ${span.toFixed(1)}deg)`;
    }
    this.emb.style.webkitMaskImage = m;
    this.emb.style.maskImage = m;
  }

  _emblem(t) {
    const k = ease((t - 3.05) / 1.7);
    this._setSweep(t < 3.05 ? 0 : k);
    const r = this.emb.getBoundingClientRect();
    if (t > 3.0 && t < 5.0) {
      // glint rides the orbit: from the sparkle (-127deg) round the bottom, right side and top
      const th = (-127 - 313 * k) * Math.PI / 180;
      const [fx, fy] = this._orbitPt(th);
      this.glint.style.left = `${fx * r.width}px`;
      this.glint.style.top = `${fy * r.height}px`;
      this.glint.style.opacity = String(Math.min(1, (5.0 - t) * 3));
    } else this.glint.style.opacity = '0';
    if (t > 4.55) {
      const s = ease((t - 4.55) / 0.4);
      const pulse = Math.max(0, Math.sin((t - 4.55) * 5)) * (1 - s * 0.5);
      this.flare.style.left = `${EMBLEM_GEO.sparkle[0] * r.width}px`;
      this.flare.style.top = `${EMBLEM_GEO.sparkle[1] * r.height}px`;
      this.flare.style.opacity = String(Math.min(1, s) * (t < 6.2 ? 1 : Math.max(0.25, 1 - (t - 6.2) / 1.2)));
      this.flare.style.transform = `translate(-50%, -50%) scale(${0.3 + s * 0.7 + pulse * 0.35}) rotate(${(1 - s) * 60}deg)`;
    }
    // signature: written left to right with the pen glow at the edge
    if (t > 7.4) {
      const w = ease((t - 7.4) / 2.0);
      this.sigImg.style.clipPath = `inset(0 ${((1 - w) * 100).toFixed(1)}% 0 0)`;
      const ir = this.sigImg.getBoundingClientRect(), sr = this.sig.getBoundingClientRect();
      this.pen.style.left = `${ir.left - sr.left + w * ir.width}px`;
      this.pen.style.top = `${ir.top - sr.top + ir.height * (0.45 + 0.12 * Math.sin(w * 31))}px`;
      this.pen.style.opacity = String(w < 1 ? 0.95 : Math.max(0, 1 - (t - 9.4) * 3));
    }
  }

  _finish(skipped) {
    if (this.finished) return;
    this.finished = true;
    removeEventListener('keydown', this._skip, true);
    removeEventListener('resize', this._resize);
    const g = this.g;
    if (skipped && g.music) g.music.stopAll(0.5);
    this.el.classList.add('out');
    setTimeout(() => {
      this.el.remove();
      if (g.music && (g.settings.music ?? 0.7) > 0 && g.state === 'menu') {
        g.music.resume(g.settings.music ?? 0.7);
        g.music.startAmbient();
      }
      this.done();
    }, skipped ? 500 : 900);
  }
}
