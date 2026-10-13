// Flight dock: large, labelled on-screen controls for the essentials, so the
// aircraft can be flown without memorising keys. Every button drives the same
// input actions as the keyboard (and so the same C++ systems); the key is shown
// under each label. Hold THRUST − / + and BRAKES; the others are one press.
import { keyLabel } from '../input/input.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const BUTTONS = [
  // [id, action, kind ('hold' | 'once'), label, title]
  ['thr-dn', 'throttleDown', 'hold', 'THR −', 'Reduce thrust (hold)'],
  ['thr', null, 'meter', '', 'Thrust lever position'],
  ['thr-up', 'throttleUp', 'hold', 'THR +', 'Add thrust (hold)'],
  ['gear', 'gear', 'once', 'GEAR', 'Landing gear up / down'],
  ['flaps-up', 'flapsUp', 'once', 'FLAPS ▲', 'Flaps up one step'],
  ['flaps', null, 'readout', '', 'Flap position'],
  ['flaps-dn', 'flapsDown', 'once', 'FLAPS ▼', 'Flaps down one step'],
  ['sb', 'speedbrake', 'once', 'SPD BRK', 'Speed brake out / in'],
  ['ap', 'apToggle', 'once', 'AP', 'Autopilot on / off (holds heading and altitude)'],
  ['at', 'autothrottle', 'once', 'A/THR', 'Autothrottle: holds the selected speed'],
  ['brk', 'brakes', 'hold', 'BRAKES', 'Wheel brakes (hold)'],
  ['eng', 'autoStart', 'once', 'ENG', 'Start or shut down the engines (runs the real procedure)'],
];

export class FlightDock {
  constructor(game) {
    this.g = game;
    const el = (this.el = document.createElement('div'));
    el.id = 'flight-dock';
    el.setAttribute('role', 'toolbar');
    el.setAttribute('aria-label', 'Flight controls');
    el.innerHTML = BUTTONS.map(([id, act, kind, label, title]) => {
      if (kind === 'meter') return `<div class="fd-meter" data-id="${id}" title="${esc(title)}"><div class="fd-meter-bar"><i></i></div><span>0%</span></div>`;
      if (kind === 'readout') return `<div class="fd-readout" data-id="${id}" title="${esc(title)}">0</div>`;
      return `<button type="button" class="fd-btn" data-id="${id}" data-act="${act}" data-kind="${kind}" title="${esc(title)}"><b>${esc(label)}</b><small></small></button>`;
    }).join('');
    $('hud').appendChild(el);
    this.btn = {};
    el.querySelectorAll('[data-id]').forEach((b) => { this.btn[b.dataset.id] = b; });
    const input = game.input;
    const release = (b) => { if (b && b.dataset.kind === 'hold') { input.hold(b.dataset.act, false); b.classList.remove('down'); } };
    el.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button.fd-btn');
      if (!b) return;
      e.preventDefault();
      if (b.dataset.kind === 'hold') {
        input.hold(b.dataset.act, true);
        b.classList.add('down');
        b.setPointerCapture(e.pointerId);
      } else {
        input.trigger(b.dataset.act);
        b.classList.add('flash');
        setTimeout(() => b.classList.remove('flash'), 180);
      }
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, (e) => release(e.target.closest('button.fd-btn')));
    // keyboard users: Enter / Space on a focused button
    el.addEventListener('keydown', (e) => {
      const b = e.target.closest('button.fd-btn');
      if (!b || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      e.stopPropagation();
      if (b.dataset.kind === 'once') input.trigger(b.dataset.act);
    });
    this.keysShown = '';
  }

  _keys() {
    const sig = JSON.stringify(this.g.input.settings.keys);
    if (sig === this.keysShown) return;
    this.keysShown = sig;
    for (const b of Object.values(this.btn)) {
      if (!b.dataset.act) continue;
      const k = (this.g.input.settings.keys[b.dataset.act] || [])[0];
      b.querySelector('small').textContent = k ? keyLabel(k) : '';
    }
  }

  // called by the HUD ~10 times a second
  update() {
    const g = this.g, p = g.player, o = p.o, sw = p.sw, f = p.fleet;
    const on = g.settings.hud && g.settings.dock !== false;
    this.el.classList.toggle('hidden', !on);
    if (!on) return;
    this._keys();
    const jet = p.isJet;
    const thr = Math.max(0, Math.min(1, sw.at && jet ? o.atThr : sw.throttle));
    this.btn.thr.querySelector('i').style.width = `${Math.round(thr * 100)}%`;
    this.btn.thr.querySelector('span').textContent = `${Math.round(thr * 100)}%${jet && o.afterburner ? ' AB' : ''}`;
    const retract = f.gearRetract !== false && f.style !== 'trainer';
    this.btn.gear.hidden = !retract;
    if (retract) {
      const st = o.gearPos > 0.99 ? 'DOWN' : o.gearPos < 0.01 ? 'UP' : 'MOVING';
      this.btn.gear.querySelector('b').textContent = st === 'MOVING' ? 'GEAR ⇅' : `GEAR ${st === 'DOWN' ? 'DN' : 'UP'}`;
      this.btn.gear.dataset.state = st === 'DOWN' ? 'good' : st === 'UP' ? '' : 'warn';
    }
    const flapLabel = jet && f.flaps ? f.flaps[sw.flaps] : `${Math.round(o.flapsDeg)}°`;
    this.btn.flaps.textContent = `FLAPS ${flapLabel}`.slice(0, 12);
    this.btn.flaps.dataset.state = sw.flaps > 0 || o.flapsDeg > 0.5 ? 'on' : '';
    this.btn.sb.hidden = !jet;
    this.btn.sb.dataset.state = o.speedbrake > 0.02 ? 'warn' : sw.spoilerArm ? 'on' : '';
    this.btn.ap.dataset.state = o.apEngaged ? 'on' : '';
    this.btn.ap.querySelector('b').textContent = o.apEngaged ? 'AP ON' : 'AP OFF';
    this.btn.at.hidden = !jet;
    this.btn.at.dataset.state = sw.at ? 'on' : '';
    this.btn.brk.dataset.state = o.onGround && (o.brakeL > 0.5 || sw.parkBrake) ? 'warn' : '';
    const running = o.engineRunning > 0.5 || (jet && (o.n1_0 || 0) > 15);
    this.btn.eng.querySelector('b').textContent = running ? 'ENG OFF' : 'ENG START';
    this.btn.eng.hidden = running && !o.onGround;
    this.btn.eng.dataset.state = running ? '' : 'warn';
  }
}
