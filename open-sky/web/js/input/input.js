// Input: keyboard, mouse and gamepad / joystick / throttle quadrant.
// Rebindable keys and axes, per-axis sensitivity (expo), dead zone and
// inversion; settings persist in localStorage (per-viewer convenience).

export const ACTIONS = {
  // axes driven by keys (held)
  pitchUp: { label: 'Pitch up (pull)', he: 'הרמת אף', keys: ['KeyS', 'ArrowDown'] },
  pitchDown: { label: 'Pitch down (push)', he: 'הורדת אף', keys: ['KeyW', 'ArrowUp'] },
  rollLeft: { label: 'Roll left', he: 'גלגול שמאלה', keys: ['KeyA', 'ArrowLeft'] },
  rollRight: { label: 'Roll right', he: 'גלגול ימינה', keys: ['KeyD', 'ArrowRight'] },
  yawLeft: { label: 'Rudder left', he: 'הגה כיוון שמאלה', keys: ['KeyQ'] },
  yawRight: { label: 'Rudder right', he: 'הגה כיוון ימינה', keys: ['KeyE'] },
  throttleUp: { label: 'Throttle up', he: 'הגברת מצערת', keys: ['Equal', 'PageUp', 'NumpadAdd'] },
  throttleDown: { label: 'Throttle down', he: 'הורדת מצערת', keys: ['Minus', 'PageDown', 'NumpadSubtract'] },
  brakes: { label: 'Brakes (hold)', he: 'בלמים (החזקה)', keys: ['Space'] },
  trimUp: { label: 'Trim nose up', he: 'קיזוז אף למעלה', keys: ['BracketRight', 'Home'] },
  trimDown: { label: 'Trim nose down', he: 'קיזוז אף למטה', keys: ['BracketLeft', 'End'] },
  mixtureRich: { label: 'Mixture richer', he: 'תערובת עשירה', keys: ['KeyU'] },
  mixtureLean: { label: 'Mixture leaner', he: 'תערובת דלה', keys: ['KeyJ'] },
  freeFwd: { label: 'Free cam forward', he: 'מצלמה חופשית קדימה', keys: ['KeyW'], freeOnly: true },
  // one-shot actions
  parkBrake: { label: 'Parking brake', he: 'בלם חניה', keys: ['KeyB'], once: true },
  flapsDown: { label: 'Flaps down one notch', he: 'מדפים מטה', keys: ['KeyF'], once: true },
  flapsUp: { label: 'Flaps up one notch', he: 'מדפים מעלה', keys: ['KeyV'], once: true },
  gear: { label: 'Landing gear up / down', he: 'כן נסע למעלה / למטה', keys: ['KeyG'], once: true },
  speedbrake: { label: 'Speed brake extend / retract', he: 'בלם אוויר', keys: ['Slash'], once: true },
  spoilerArm: { label: 'Arm ground spoilers', he: 'חימוש ספוילרים', keys: ['Shift+Slash'], once: true },
  reverse: { label: 'Thrust reversers (on the ground)', he: 'הפיכת דחף', keys: ['F2'], once: true },
  autothrottle: { label: 'Autothrottle on / off', he: 'מצערת אוטומטית', keys: ['Shift+KeyR'], once: true },
  atSpdDown: { label: 'Autothrottle speed −5 kt', he: 'מהירות −5', keys: ['Shift+Comma'], once: true },
  atSpdUp: { label: 'Autothrottle speed +5 kt', he: 'מהירות +5', keys: ['Shift+Period'], once: true },
  fireHandle: { label: 'Pull fire handle of a burning engine', he: 'ידית כיבוי אש', keys: ['Shift+KeyF'], once: true },
  autoStart: { label: 'Auto start / shutdown (runs the real procedure)', he: 'התנעה/כיבוי אוטומטיים', keys: ['Shift+KeyE'], once: true },
  apToggle: { label: 'Autopilot on/off', he: 'טייס אוטומטי', keys: ['KeyZ'], once: true },
  apHdg: { label: 'AP heading mode', he: 'מצב כיוון', keys: ['KeyX'], once: true },
  apAlt: { label: 'AP altitude hold', he: 'החזקת גובה', keys: ['KeyY'], once: true },
  hdgBugLeft: { label: 'Heading bug -5°', he: 'כיוון -5°', keys: ['Comma'], once: true },
  hdgBugRight: { label: 'Heading bug +5°', he: 'כיוון +5°', keys: ['Period'], once: true },
  apAltDown: { label: 'AP altitude -100 ft', he: 'גובה -100', keys: ['Semicolon'], once: true },
  apAltUp: { label: 'AP altitude +100 ft', he: 'גובה +100', keys: ['Quote'], once: true },
  landingLight: { label: 'Landing light', he: 'אור נחיתה', keys: ['KeyL'], once: true },
  extLights: { label: 'Nav, beacon & strobe lights', he: 'אורות חיצוניים', keys: ['KeyK'], once: true },
  atc: { label: 'ATC radio menu', he: 'תפריט קשר', keys: ['KeyT', 'Backquote'], once: true },
  view1: { label: 'Cockpit view', he: 'מבט תא טייס', keys: ['Digit1'], once: true },
  view2: { label: 'Chase view', he: 'מבט מעקב', keys: ['Digit2'], once: true },
  view3: { label: 'Wing view', he: 'מבט כנף', keys: ['Digit3'], once: true },
  view4: { label: 'Tower view', he: 'מבט מגדל', keys: ['Digit4'], once: true },
  view5: { label: 'Fly-by view', he: 'מבט חלוף', keys: ['Digit5'], once: true },
  view6: { label: 'Free camera', he: 'מצלמה חופשית', keys: ['Digit6'], once: true },
  viewNext: { label: 'Next view', he: 'מבט הבא', keys: ['KeyC'], once: true },
  resetLook: { label: 'Reset view', he: 'איפוס מבט', keys: ['KeyR'], once: true },
  hud: { label: 'Toggle HUD', he: 'תצוגת נתונים', keys: ['KeyH'], once: true },
  map: { label: 'Toggle map', he: 'מפה', keys: ['KeyM'], once: true },
  checklist: { label: 'Toggle checklist', he: 'רשימת תיוג', keys: ['Shift+KeyG'], once: true },
  save: { label: 'Save point', he: 'נקודת שמירה', keys: ['KeyO'], once: true },
  pause: { label: 'Pause', he: 'השהיה', keys: ['KeyP'], once: true },
  help: { label: 'Controls help', he: 'עזרה', keys: ['F1'], once: true },
  menu: { label: 'Menu', he: 'תפריט', keys: ['Escape'], once: true },
};

export const AXES = ['pitch', 'roll', 'yaw', 'throttle', 'brakes', 'mixture'];
const DEFAULT_GP = {
  // standard-mapping gamepad
  pitch: { axis: 1, invert: false }, roll: { axis: 0, invert: false }, yaw: { axis: -1 }, throttle: { axis: -1 }, brakes: { axis: -1 }, mixture: { axis: -1 },
};

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('opensky.input') || 'null');
    if (s) return s;
  } catch { /* no storage */ }
  return null;
}

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.down = new Set();
    this.pressed = [];
    this.mouse = { dx: 0, dy: 0, wheel: 0, drag: false, button: -1, x: 0, y: 0, clicked: null };
    this.axes = { pitch: 0, roll: 0, yaw: 0 };
    const saved = loadSettings();
    this.settings = Object.assign({
      keys: Object.fromEntries(Object.entries(ACTIONS).map(([k, v]) => [k, v.keys.slice()])),
      sensitivity: { pitch: 0.75, roll: 0.75, yaw: 0.75 },
      expo: { pitch: 0.35, roll: 0.3, yaw: 0.25 },
      deadzone: 0.08,
      invertPitch: false,
      gamepad: JSON.parse(JSON.stringify(DEFAULT_GP)),
      joystick: { index: -1, pitch: { axis: -1, invert: false }, roll: { axis: -1, invert: false }, yaw: { axis: -1, invert: false }, throttle: { axis: -1, invert: false }, brakes: { axis: -1, invert: false }, mixture: { axis: -1, invert: false }, buttons: {} },
    }, saved || {});
    // bindings saved by an older version: add new actions, move keys that changed meaning
    const K = this.settings.keys;
    for (const [k, v] of Object.entries(ACTIONS)) if (!K[k]) K[k] = v.keys.slice();
    if (K.checklist && K.checklist.includes('KeyG')) K.checklist = ['Shift+KeyG'];
    if (K.help) K.help = K.help.filter((c) => c !== 'Slash');
    this.captureEnabled = true;
    this.textFocus = false;
    this.binding = null;
    this._attach();
  }

  save() { try { localStorage.setItem('opensky.input', JSON.stringify(this.settings)); } catch { /* ignore */ } }
  resetDefaults() { try { localStorage.removeItem('opensky.input'); } catch { /* ignore */ } location.reload(); }

  _code(e) {
    const mods = (e.shiftKey && e.code !== 'ShiftLeft' && e.code !== 'ShiftRight' ? 'Shift+' : '');
    return mods + e.code;
  }

  _attach() {
    window.addEventListener('keydown', (e) => {
      if (this.textFocus) return;
      if (this.binding) { e.preventDefault(); this._finishBind(this._code(e)); return; }
      const code = this._code(e);
      if (!e.repeat) this.pressed.push(code);
      this.down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Slash', 'F1', 'F2', 'Backquote', 'Quote', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => this.down.clear());
    const el = this.dom;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      this.mouse.drag = true;
      this.mouse.button = e.button;
      this.mouse.downX = e.clientX;
      this.mouse.downY = e.clientY;
      this.mouse.downAt = performance.now();
    });
    window.addEventListener('mouseup', (e) => {
      const moved = Math.hypot(e.clientX - (this.mouse.downX || 0), e.clientY - (this.mouse.downY || 0));
      if (this.mouse.drag && moved < 5 && e.target === el) this.mouse.clicked = { x: e.clientX, y: e.clientY, button: e.button, held: performance.now() - this.mouse.downAt };
      this.mouse.drag = false;
      this.mouse.button = -1;
      this.mouse.release = true;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (this.mouse.drag) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    el.addEventListener('wheel', (e) => { this.mouse.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
  }

  held(action) {
    const shift = this.down.has('ShiftLeft') || this.down.has('ShiftRight');
    // axis keys are ignored while Shift is held (Shift+key = one-shot commands),
    // except throttle and brakes
    if (shift && !['throttleUp', 'throttleDown', 'brakes'].includes(action)) {
      return (this.settings.keys[action] || []).some((k) => k.startsWith('Shift+') && this.down.has(k.slice(6)));
    }
    return (this.settings.keys[action] || []).some((k) => !k.startsWith('Shift+') && this.down.has(k));
  }

  // Bind the next key / joystick input to an action or axis.
  startBind(target, onDone) { this.binding = { target, onDone, t0: performance.now(), base: this._joyAxesSnapshot() }; }
  _finishBind(code) {
    const b = this.binding;
    this.binding = null;
    if (!b) return;
    if (code !== 'Escape') {
      if (b.target.startsWith('axis:')) return b.onDone && b.onDone(null);
      this.settings.keys[b.target] = [code];
      this.save();
    }
    b.onDone && b.onDone(code);
  }
  _joyAxesSnapshot() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    return pads.map((p) => p.axes.slice());
  }

  gamepads() { return navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []; }

  _shape(v, axis) {
    const dz = this.settings.deadzone;
    const s = Math.sign(v), a = Math.abs(v);
    if (a < dz) return 0;
    const n = (a - dz) / (1 - dz);
    const e = this.settings.expo[axis] ?? 0.3;
    return s * ((1 - e) * n + e * n * n * n);
  }

  // Poll once per frame. mode: 'flight' | 'free' | 'menu'
  poll(dt, mode = 'flight') {
    const out = {
      pitch: 0, roll: 0, yaw: 0, brakeL: 0, brakeR: 0, trimRate: 0, throttleDelta: 0, mixtureDelta: 0,
      throttleAbs: null, mixtureAbs: null, events: [], lookDX: this.mouse.dx, lookDY: this.mouse.dy, wheel: this.mouse.wheel,
      freeMove: { x: 0, y: 0, z: 0 }, fast: this.down.has('ShiftLeft'), resetLook: false, hat: { x: 0, y: 0 },
      click: this.mouse.clicked, mouse: { x: this.mouse.x, y: this.mouse.y, drag: this.mouse.drag, button: this.mouse.button },
      gamepad: false,
    };
    this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0;
    this.mouse.clicked = null;
    // digits pressed this frame (radio menu selection)
    out.digits = this.pressed.map((c) => /^(Digit|Numpad)([1-9])$/.exec(c)).filter(Boolean).map((m) => +m[2]);
    // one-shot actions
    for (const code of this.pressed) {
      for (const [act, def] of Object.entries(ACTIONS)) {
        if (!def.once) continue;
        if ((this.settings.keys[act] || []).includes(code)) out.events.push(act);
      }
    }
    this.pressed.length = 0;
    if (mode === 'free') {
      out.freeMove.y = (this.down.has('KeyW') ? 1 : 0) - (this.down.has('KeyS') ? 1 : 0);
      out.freeMove.x = (this.down.has('KeyD') ? 1 : 0) - (this.down.has('KeyA') ? 1 : 0);
      out.freeMove.z = (this.down.has('KeyE') ? 1 : 0) - (this.down.has('KeyQ') ? 1 : 0);
    }
    // keyboard axes with ramp and self-centring
    const ramp = (cur, target, up, dn) => (target !== 0 ? cur + Math.max(-up * dt, Math.min(up * dt, target - cur)) : cur + Math.max(-dn * dt, Math.min(dn * dt, -cur)));
    const kb = (pos, neg) => (this.held(pos) ? 1 : 0) - (this.held(neg) ? 1 : 0);
    const flight = mode === 'flight';
    const tp = flight ? kb('pitchUp', 'pitchDown') * this.settings.sensitivity.pitch * (this.settings.invertPitch ? -1 : 1) : 0;
    const tr = flight ? kb('rollRight', 'rollLeft') * this.settings.sensitivity.roll : 0;
    const ty = flight ? kb('yawRight', 'yawLeft') * this.settings.sensitivity.yaw : 0;
    this.axes.pitch = ramp(this.axes.pitch, tp, 2.2, 3.5);
    this.axes.roll = ramp(this.axes.roll, tr, 2.6, 4.0);
    this.axes.yaw = ramp(this.axes.yaw, ty, 2.0, 3.0);
    out.pitch = this.axes.pitch;
    out.roll = this.axes.roll;
    out.yaw = this.axes.yaw;
    if (flight) {
      out.throttleDelta = (this.held('throttleUp') ? 0.45 : 0) * dt - (this.held('throttleDown') ? 0.45 : 0) * dt;
      out.mixtureDelta = (this.held('mixtureRich') ? 0.3 : 0) * dt - (this.held('mixtureLean') ? 0.3 : 0) * dt;
      out.trimRate = (this.held('trimUp') ? 1 : 0) - (this.held('trimDown') ? 1 : 0);
      if (this.held('brakes')) { out.brakeL = out.brakeR = 1; }
    }
    // gamepads / joysticks
    for (const gp of this.gamepads()) {
      const std = gp.mapping === 'standard';
      const js = this.settings.joystick;
      if (std) {
        const ax = gp.axes;
        const p = this._shape(ax[1] || 0, 'pitch'), r = this._shape(ax[0] || 0, 'roll');
        if (p || r) out.gamepad = true;
        out.pitch = Math.abs(p) > Math.abs(out.pitch) ? p * (this.settings.invertPitch ? -1 : 1) : out.pitch;
        out.roll = Math.abs(r) > Math.abs(out.roll) ? r : out.roll;
        const lt = gp.buttons[6] ? gp.buttons[6].value : 0, rt = gp.buttons[7] ? gp.buttons[7].value : 0;
        if (lt > 0.05 || rt > 0.05) out.yaw = (rt - lt) * this.settings.sensitivity.yaw;
        out.lookDX += this._shape(ax[2] || 0, 'roll') * 18;
        out.lookDY += this._shape(ax[3] || 0, 'pitch') * 18;
        const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
        if (b(12)) out.throttleDelta += 0.45 * dt;
        if (b(13)) out.throttleDelta -= 0.45 * dt;
        if (b(14)) out.trimRate = -1;
        if (b(15)) out.trimRate = 1;
        if (b(1)) out.brakeL = out.brakeR = 1;
        const edge = (i, act) => { const k = `gp${gp.index}:${i}`; const now = b(i); if (now && !this[k]) out.events.push(act); this[k] = now; };
        edge(0, 'atc'); edge(2, 'flapsDown'); edge(3, 'flapsUp'); edge(4, 'viewPrev'); edge(5, 'viewNext');
        edge(9, 'pause'); edge(8, 'map'); edge(10, 'apToggle'); edge(11, 'resetLook');
      } else if (js.index === -1 || js.index === gp.index) {
        // generic joystick / throttle: user-bound axes
        const val = (cfg) => (cfg && cfg.axis >= 0 && gp.axes[cfg.axis] !== undefined ? gp.axes[cfg.axis] * (cfg.invert ? -1 : 1) : null);
        const p = val(js.pitch), r = val(js.roll), y = val(js.yaw), t = val(js.throttle), br = val(js.brakes), mx = val(js.mixture);
        if (p !== null) out.pitch = this._shape(p, 'pitch');
        if (r !== null) out.roll = this._shape(r, 'roll');
        if (y !== null) out.yaw = this._shape(y, 'yaw');
        if (t !== null) out.throttleAbs = (1 - t) / 2;
        if (br !== null) out.brakeL = out.brakeR = Math.max(0, (1 - br) / 2);
        if (mx !== null) out.mixtureAbs = (1 - mx) / 2;
        for (const [bi, act] of Object.entries(js.buttons || {})) {
          const k = `js${gp.index}:${bi}`;
          const now = gp.buttons[bi] && gp.buttons[bi].pressed;
          if (now && !this[k]) out.events.push(act);
          this[k] = now;
        }
        if (gp.axes.length >= 10) { // hat on axis 9 for many sticks
          const h = gp.axes[9];
          if (h > -1.1 && h < 1.1 && Math.abs(h) < 1.05 && h !== 0) {
            const dirs = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
            const idx = Math.round((h + 1) * 3.5);
            if (dirs[idx]) out.hat = { x: dirs[idx][0], y: dirs[idx][1] };
          }
        }
      }
    }
    if (out.events.includes('resetLook')) out.resetLook = true;
    return out;
  }

  // While binding an axis: returns {index, axis} of the joystick axis moving most.
  detectAxis() {
    const b = this.binding;
    if (!b) return null;
    const now = this._joyAxesSnapshot();
    let best = null, bestD = 0.5;
    now.forEach((axes, pi) => axes.forEach((v, ai) => {
      const d = Math.abs(v - ((b.base[pi] || [])[ai] || 0));
      if (d > bestD) { bestD = d; best = { pad: pi, axis: ai }; }
    }));
    return best;
  }
}

export function keyLabel(code) {
  return code.replace('Shift+', 'Shift + ').replace('Key', '').replace('Digit', '').replace('Arrow', '↑↓←→ '.slice(0, 0) + '')
    .replace('BracketRight', ']').replace('BracketLeft', '[').replace('Equal', '=').replace('Minus', '−').replace('Comma', ',')
    .replace('Period', '.').replace('Semicolon', ';').replace('Quote', "'").replace('Backquote', '`').replace('Slash', '/')
    .replace('Space', 'Space').replace('Escape', 'Esc').replace('NumpadAdd', 'Num +').replace('NumpadSubtract', 'Num −');
}
