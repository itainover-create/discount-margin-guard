// Air traffic control. Clearances come from the game state: the C++ runway
// authority (occupancy, arrival reservations, AI traffic), the active
// runway chosen from the wind, the player's position, and A* taxi routes
// over the real taxiway graph. Phraseology is English aviation style; each
// message carries a Hebrew explanation.
const D2R = Math.PI / 180;
const PLAYER = 0;
const REQ = { TAKEOFF: 0, LANDING: 1, CROSS: 2, LINEUP: 3 };

// Known frequencies (simulation only; generic elsewhere).
const FREQ = {
  KJFK: { atis: '128.725', gnd: '121.900', twr: '119.100' },
  KLGA: { atis: '127.050', gnd: '121.700', twr: '118.700' },
  KEWR: { atis: '115.700', gnd: '121.800', twr: '118.300' },
};
const GENERIC = { atis: '127.000', gnd: '121.900', twr: '118.300' };
const LETTERS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu'];
const AI_AIRLINES = ['Orion', 'Skyline', 'Atlas Blue', 'Coastal', 'Meridian', 'Polar', 'Sunline', 'Harbor'];

export const ATC_STATE = {
  NONE: 'none', STARTUP: 'startup', TAXI: 'taxi', HOLDING: 'holding', LINEUP: 'lineup', TAKEOFF: 'takeoff',
  DEPARTED: 'departed', PATTERN: 'pattern', INBOUND: 'inbound', LANDING: 'landing', LANDED: 'landed', TAXI_IN: 'taxiIn',
};

function hdg3(deg) { return String(Math.round(((deg % 360) + 360) % 360) || 360).padStart(3, '0'); }
function windText(w) { return w.windKt < 3 ? 'wind calm' : `wind ${hdg3(Math.round(w.windDir / 10) * 10)} at ${Math.round(w.windKt)}${w.gustKt ? ` gusting ${Math.round(w.gustKt)}` : ''}`; }
function windHe(w) { return w.windKt < 3 ? 'רוח שקטה' : `רוח מכיוון ${hdg3(Math.round(w.windDir / 10) * 10)} במהירות ${Math.round(w.windKt)} קשר${w.gustKt ? ` עם משבים עד ${Math.round(w.gustKt)}` : ''}`; }

export class ATC {
  constructor(game) {
    this.game = game;
    this.log = [];
    this.state = ATC_STATE.NONE;
    this.callsign = 'Skylark 4X-ONS';
    this.callsignShort = 'Skylark ONS';
    this.clearances = { startup: false, taxi: false, takeoff: false, lineup: false, land: false, cross: false, touchAndGo: false };
    this.violations = [];
    this.listeners = [];
    this.timer = 0;
    this.pending = null;
    this.route = null;
    this.lastAgentPhase = new Map();
    this.atisLetter = 'Kilo';
    this.emergency = false;
  }

  on(fn) { this.listeners.push(fn); }
  _emit(msg) {
    msg.t = this.game.simClock ? this.game.simClock() : 0;
    this.log.push(msg);
    if (this.log.length > 80) this.log.shift();
    for (const fn of this.listeners) fn(msg);
  }

  // ---------------------------------------------------------------------
  setAirport(airport) {
    this.airport = airport;
    if (!airport) return;
    this.freq = FREQ[airport.icao] || GENERIC;
    const short = airport.data.name.replace(/International|Airport|Intl\.?/g, '').trim();
    this.names = { gnd: `${short} Ground`, twr: `${short} Tower`, atis: `${short} information` };
    this.selectRunway();
    const hr = new Date().getUTCHours();
    this.atisLetter = LETTERS[(hr + airport.icao.charCodeAt(1)) % 26];
    this.state = ATC_STATE.NONE;
    for (const k of Object.keys(this.clearances)) this.clearances[k] = false;
    this.crossRw = -1;
    this.route = null;
    this.pending = null;
    this.queue = [];
    this.pattern = false;
    this.emergency = false;
    this.wasAirborne = false;
    this._incursion = this._toViol = false;
  }

  // The flight starts lined up on the runway (menu choice "on the runway"):
  // the tower has cleared the aircraft to line up and wait.
  startOnRunway() {
    const cs = this.callsign, rwy = this.activeEnd.ident;
    this.clearances.startup = this.clearances.taxi = this.clearances.lineup = true;
    this.state = ATC_STATE.LINEUP;
    this.game.core.tfcRequest(PLAYER, this.activeRw, REQ.LINEUP, 0);
    this.atc(this.names.twr, `${cs}, runway ${rwy}, line up and wait.`, `לעלות למסלול ${rwy} ולהמתין עליו (Line up and wait). יש לדווח מוכנות להמראה.`, false);
  }

  selectRunway() {
    const w = this.game.world.weather.state;
    const core = this.game.core;
    const best = core.tfcBestRunway(w.windDir * D2R, w.windKt * 0.514444);
    const rw = Math.floor(best / 2), dir = best % 2;
    this.activeRw = rw;
    this.activeDir = dir;
    core.tfcSetActive(rw, dir);
    const end = this.airport.rw[rw].ends[dir];
    this.activeEnd = end;
    return end;
  }

  get radioOk() {
    const g = this.game;
    return !g.player.simMode || (g.player.o.avionicsPowered > 0.5);
  }

  // ---------------------------------------------------------------------
  // Situation of the player relative to the airport
  situation() {
    const g = this.game, o = g.player.o, ap = this.airport;
    if (!ap) return null;
    const loc = ap.owner.toLocal(o.x, o.y, {});
    const onRw = ap.runwayAt(loc.x, loc.y, 3);
    const end = this.activeEnd;
    const rc = ap.runwayCoords(end, loc.x, loc.y);
    const dist = Math.hypot(loc.x - end.tx, loc.y - end.ty);
    const elev = ap.elev;
    const aglField = o.z - elev;
    const hdgErr = Math.abs((((o.psi / D2R) - end.hdgTrue + 540) % 360) - 180);
    const onFinal = !o.onGround && rc.along < 300 && rc.along > -12000 && Math.abs(rc.lateral) < 400 + Math.abs(rc.along) * 0.08 && hdgErr < 35;
    const nearField = dist < 12000;
    return { loc, onRw, rc, dist, aglField, hdgErr, onFinal, nearField, onGround: o.onGround > 0.5, ias: o.ias / 0.514444 };
  }

  // ---------------------------------------------------------------------
  // Options for the radio menu in the current state
  options() {
    const s = this.situation();
    if (!this.airport || !s) return [{ id: 'none', label: 'No airport in range', he: 'אין שדה תעופה בטווח' }];
    const o = [];
    o.push({ id: 'atis', label: `Listen to ATIS (${this.freq.atis})`, he: 'האזנה לשידור מידע אוטומטי (ATIS)' });
    if (s.onGround) {
      if (!this.clearances.startup && !this.game.player.o.engineRunning) o.push({ id: 'startup', label: `Ground: request start-up`, he: 'בקשת אישור התנעה' });
      if (!this.clearances.taxi && this.state !== ATC_STATE.LANDED && this.state !== ATC_STATE.TAXI_IN && s.onRw < 0) o.push({ id: 'taxi', label: `Ground: request taxi for departure`, he: 'בקשת הסעה למסלול ההמראה' });
      if (this.clearances.taxi && !this.clearances.takeoff) o.push({ id: 'ready', label: `Tower: ready for departure, runway ${this.activeEnd.ident}`, he: 'דיווח מוכנות להמראה' });
      if (this.clearances.taxi && !this.clearances.takeoff) o.push({ id: 'readyPattern', label: `Tower: ready, request closed traffic (pattern)`, he: 'מוכן להמראה, בקשה לטוס בהקפות' });
      if (this.state === ATC_STATE.LANDED || this.state === ATC_STATE.TAXI_IN) o.push({ id: 'taxiIn', label: `Ground: request taxi to parking`, he: 'בקשת הסעה לחניה' });
      if (s.onRw >= 0 && this.state === ATC_STATE.LANDED) o.push({ id: 'vacated', label: 'Tower: runway vacated', he: 'דיווח פינוי מסלול' });
    } else {
      if (!this.clearances.land) {
        o.push({ id: 'inbound', label: `Tower: inbound for landing with ${this.atisLetter}`, he: 'דיווח התקרבות ובקשת נחיתה' });
        if (s.onFinal) o.push({ id: 'final', label: `Tower: on final runway ${this.activeEnd.ident}`, he: 'דיווח בגישה סופית' });
      } else {
        o.push({ id: 'touchAndGo', label: 'Tower: request touch-and-go', he: 'בקשת נגיעה והמראה (גע וסע)' });
      }
      o.push({ id: 'goAround', label: 'Tower: going around', he: 'דיווח על ביצוע הליכה סביב' });
      if (this.state === ATC_STATE.DEPARTED || this.state === ATC_STATE.PATTERN) o.push({ id: 'leaving', label: 'Tower: request frequency change, leaving the area', he: 'בקשת החלפת תדר ויציאה מהאזור' });
      o.push({ id: 'mayday', label: 'MAYDAY — declare emergency', he: 'הכרזה על מצב חירום' });
    }
    return o;
  }

  // ---------------------------------------------------------------------
  pilot(text, he) { this._emit({ who: 'pilot', station: this.callsign, text, he }); }
  atc(station, text, he, speak = true) {
    this._emit({ who: 'atc', station, text, he });
    if (speak) this.game.audio.oneShot('squelch', 1);
    if (speak && this.game.settings.atcVoice) this.game.audio.speak(text);
  }
  chatter(text) { this._emit({ who: 'ai', station: '', text, he: '' }); }

  request(id) {
    if (id === 'none') return;
    if (!this.radioOk) {
      this._emit({ who: 'system', station: 'RADIO', text: 'Radio is not powered (battery + avionics master).', he: 'הקשר אינו מופעל — יש להדליק מצבר ומתג אוויוניקה.' });
      return;
    }
    const s = this.situation();
    const ap = this.airport, w = this.game.world.weather.state, rwy = this.activeEnd.ident;
    const qnh = Math.round(w.qnh), alt = (w.qnh / 33.8639).toFixed(2);
    const press = ap.icao.startsWith('K') || ap.icao.startsWith('P') ? `altimeter ${alt}` : `QNH ${qnh}`;
    const pressHe = ap.icao.startsWith('K') || ap.icao.startsWith('P') ? `כוונון מד גובה ${alt}` : `לחץ ${qnh} הקטופסקל (QNH)`;
    const cs = this.callsign, csS = this.callsignShort;
    switch (id) {
      case 'atis': {
        const metar = this.game.world.weather.metar(ap.icao, this.game.date());
        this.atc(this.names.atis, `${ap.data.name} information ${this.atisLetter}. ${metar}. Landing and departing runway ${rwy}. Advise on initial contact you have information ${this.atisLetter}.`,
          `מידע ${this.atisLetter}: מזג האוויר (${windHe(w)}, ראות ${(w.visM / 1000).toFixed(1)} ק"מ). מסלול בשימוש: ${rwy}. יש לציין בפנייה הראשונה שקיבלת את המידע.`, false);
        break;
      }
      case 'startup':
        this.pilot(`${this.names.gnd}, ${cs}, at the ramp with ${this.atisLetter}, request start-up.`, 'בקשה להתניע את המנוע.');
        this.clearances.startup = true;
        this.state = ATC_STATE.STARTUP;
        this.later(1.5, () => this.atc(this.names.gnd, `${cs}, start-up approved, ${press}, advise ready to taxi.`, `ההתנעה אושרה. ${pressHe}. יש לדווח כשמוכנים להסעה.`));
        break;
      case 'taxi': {
        this.pilot(`${this.names.gnd}, ${cs}, ready to taxi with ${this.atisLetter}.`, 'דיווח מוכנות להסעה.');
        const route = this.planDeparture();
        this.later(1.8, () => {
          if (!route) {
            this.atc(this.names.gnd, `${cs}, unable to find a taxi route from your position, taxi to runway ${rwy} at your discretion, hold short.`, `לא נמצא מסלול הסעה ממיקומך — יש להסיע בזהירות למסלול ${rwy} ולעצור לפניו.`);
          } else {
            const via = route.names.length ? `via ${route.names.join(', ')}` : 'via the apron';
            const lim = route.crossings.length ? route.crossings[0].name : rwy;
            this.atc(this.names.gnd, `${cs}, runway ${rwy}, taxi ${via}, hold short of runway ${lim}.`,
              `אישור הסעה למסלול ${rwy} דרך מסלולי ההסעה ${route.names.join(', ') || 'הרחבה'}. חובה לעצור לפני קו העצירה של מסלול ${lim} ולא להיכנס אליו ללא אישור.` +
              (route.crossings.length ? ` הדרך חוצה את מסלול ${lim} — חצייה רק לאחר אישור נפרד.` : ''));
            this.pilot(`Runway ${rwy}, taxi ${via}, hold short ${lim}, ${csS}.`, 'חזרה על ההוראות (Readback).');
          }
          this.clearances.taxi = true;
          this.clearances.startup = true;
          this.state = ATC_STATE.TAXI;
        });
        break;
      }
      case 'ready':
      case 'readyPattern': {
        this.pattern = id === 'readyPattern';
        const where = this.state === ATC_STATE.LINEUP ? `on runway ${rwy}` : `holding short runway ${rwy}`;
        this.pilot(`${this.names.twr}, ${cs}, ${where}, ready for departure${this.pattern ? ', request closed traffic' : ''}.`, 'דיווח מוכנות להמראה.');
        if (this.state !== ATC_STATE.LINEUP) this.state = ATC_STATE.HOLDING;
        this.later(2, () => this.tryTakeoff(true));
        break;
      }
      case 'inbound': {
        this.pilot(`${this.names.twr}, ${cs}, ${(s.dist / 1852).toFixed(0)} miles out at ${Math.round(this.game.player.o.indAlt / 0.3048 / 100) * 100} feet, inbound for landing with ${this.atisLetter}.`, 'דיווח התקרבות לנחיתה.');
        this.later(2, () => this.inboundInstructions(s));
        break;
      }
      case 'final':
        this.pilot(`${this.names.twr}, ${cs}, final runway ${rwy}.`, 'דיווח בגישה הסופית.');
        this.later(1.5, () => this.tryLanding(true));
        break;
      case 'touchAndGo':
        this.pilot(`${cs}, request touch and go.`, 'בקשה לנגיעה והמראה מחדש.');
        this.clearances.touchAndGo = true;
        this.later(1.5, () => this.atc(this.names.twr, `${cs}, touch and go approved.`, 'אושר לבצע נגיעה והמראה מחדש (גע וסע).'));
        break;
      case 'goAround':
        this.pilot(`${cs}, going around.`, 'מבצע הליכה סביב.');
        this.cancelLanding();
        this.later(1.5, () => this.atc(this.names.twr, `${cs}, roger, fly runway heading, climb to ${Math.round((ap.elev / 0.3048 + 1000) / 100) * 100} feet, re-enter the downwind.`, 'הליכה סביב: לטוס בכיוון המסלול, לטפס ל-1000 רגל מעל השדה ולהיכנס שוב לצלע הרוח (Downwind).'));
        break;
      case 'leaving':
        this.pilot(`${cs}, leaving the area, request frequency change.`, 'בקשה לעזוב את התדר.');
        this.later(1.5, () => this.atc(this.names.twr, `${cs}, frequency change approved, good day.`, 'אושרה החלפת תדר. טיסה נעימה.'));
        this.state = ATC_STATE.NONE;
        break;
      case 'taxiIn': {
        this.pilot(`${this.names.gnd}, ${cs}, clear of the runway, request taxi to parking.`, 'בקשת הסעה לחניה.');
        const route = this.planToParking();
        this.later(1.8, () => {
          const via = route && route.names.length ? `via ${route.names.join(', ')}` : 'as convenient';
          const hs = route && route.crossings.length ? `, hold short of runway ${route.crossings[0].name}` : '';
          this.atc(this.names.gnd, `${cs}, taxi to the ramp ${via}${hs}.`, `הסעה לרחבת החניה ${route && route.names.length ? 'דרך ' + route.names.join(', ') : ''}${hs ? `. יש לעצור לפני מסלול ${route.crossings[0].name} ולחכות לאישור חצייה` : ''}.`);
          this.state = ATC_STATE.TAXI_IN;
        });
        break;
      }
      case 'vacated':
        this.pilot(`${cs}, runway vacated.`, 'פיניתי את המסלול.');
        this.releaseRunway();
        this.later(1.2, () => this.atc(this.names.twr, `${cs}, contact ground ${this.freq.gnd}.`, `יש לעבור לתדר הקרקע ${this.freq.gnd}.`));
        break;
      case 'mayday':
        this.emergency = true;
        this.pilot(`MAYDAY MAYDAY MAYDAY, ${cs}, emergency, request immediate landing.`, 'הכרזת חירום ובקשה לנחיתה מיידית.');
        this.later(1.5, () => {
          this.atc(this.names.twr, `${cs}, roger MAYDAY, cleared to land any runway, ${windText(w)}. Emergency services are standing by.`, 'החירום התקבל: מותר לנחות בכל מסלול. כוחות החירום בכוננות.');
          this.clearances.land = true;
          this.state = ATC_STATE.LANDING;
        });
        break;
      default:
        break;
    }
  }

  later(sec, fn) { (this.queue || (this.queue = [])).push({ t: sec, fn }); }

  planDeparture() {
    const ap = this.airport, g = this.game, core = g.core, o = g.player.o;
    const loc = ap.owner.toLocal(o.x, o.y, {});
    const from = core.tfcNearestNode(loc.x, loc.y, (1 << 0) | (1 << 3) | (1 << 1), 400);
    const hold = core.tfcHoldNode(this.activeRw, this.activeDir);
    if (from < 0 || hold < 0) { this.route = null; return null; }
    const path = core.tfcFindPath(from, hold, -1);
    if (path.length < 2) { this.route = null; return null; }
    this.route = { path, names: ap.routeNames(path), holdNode: hold, crossings: this.findCrossings(path) };
    this.game.showRoute(this.route);
    return this.route;
  }

  planToParking() {
    const ap = this.airport, g = this.game, core = g.core, o = g.player.o;
    const loc = ap.owner.toLocal(o.x, o.y, {});
    const from = core.tfcNearestNode(loc.x, loc.y, (1 << 0) | (1 << 1) | (1 << 2), 400);
    const stand = (ap.data.stands || [])[0] || (ap.data.gates || [])[0];
    if (from < 0 || !stand) return null;
    const path = core.tfcFindPath(from, stand.node, -1);
    if (path.length < 2) return null;
    this.route = { path, names: ap.routeNames(path), stand, crossings: this.findCrossings(path) };
    this.game.showRoute(this.route);
    return this.route;
  }

  // Runway crossings along a taxi route: each run of path nodes on a runway
  // (a run that starts at the first node is the runway just vacated).
  findCrossings(path) {
    const ap = this.airport, nodes = ap.data.graph.nodes, out = [];
    let cur = -1;
    for (let k = 0; k < path.length; k++) {
      const n = nodes[path[k]];
      const rw = ap.runwayAt(n[0], n[1], 3);
      if (rw >= 0 && rw !== cur && k > 0) {
        const r = ap.rw[rw];
        const name = rw === this.activeRw ? this.activeEnd.ident : r.ends[0].ident;
        out.push({ rw, enter: k, hold: k - 1, name, cleared: false, entered: false, done: false, told: false });
      }
      cur = rw;
    }
    return out;
  }

  nextCrossing() { return this.route && this.route.crossings ? this.route.crossings.find((c) => !c.done) : null; }

  // Path index the player is cleared to: the hold-short point of the next
  // uncleared runway crossing, otherwise the end of the route.
  taxiLimit() {
    if (!this.route) return -1;
    const cr = this.nextCrossing();
    return cr && !cr.cleared ? cr.hold : this.route.path.length - 1;
  }

  updateCrossing(dt, s) {
    const cr = this.nextCrossing();
    if (!cr || !s.onGround || (this.state !== ATC_STATE.TAXI && this.state !== ATC_STATE.TAXI_IN)) return;
    const core = this.game.core, cs = this.callsign, nodes = this.airport.data.graph.nodes;
    if (!cr.cleared) {
      const hn = nodes[this.route.path[cr.hold]];
      if (Math.hypot(hn[0] - s.loc.x, hn[1] - s.loc.y) > 250) return;
      this._crossTimer = (this._crossTimer || 0) - dt;
      if (this._crossTimer > 0) return;
      this._crossTimer = 2;
      if (core.tfcRequest(PLAYER, cr.rw, REQ.CROSS, 0)) {
        cr.cleared = true;
        this.crossRw = cr.rw;
        const nxt = this.route.crossings.find((c) => !c.done && c !== cr);
        const lim = nxt ? nxt.name : (this.route.holdNode !== undefined ? this.activeEnd.ident : null);
        const cont = lim ? `, continue taxi, hold short of runway ${lim}` : ', continue to the ramp';
        this.atc(this.names.gnd, `${cs}, cross runway ${cr.name}${cont}.`,
          `אושר לחצות את מסלול ${cr.name}. יש לחצות ללא עיכוב${lim ? ` ולהמשיך בהסעה עד לפני מסלול ${lim}` : ' ולהמשיך לרחבה'}.`);
        this.pilot(`Cross runway ${cr.name}${lim ? `, hold short ${lim}` : ''}, ${this.callsignShort}.`, 'חזרה על אישור החצייה.');
      } else if (!cr.told) {
        cr.told = true;
        this.atc(this.names.gnd, `${cs}, hold short of runway ${cr.name}, traffic on the runway.`, `יש לעצור לפני מסלול ${cr.name} — יש תנועה על המסלול. אישור חצייה יינתן כשיתפנה.`);
      }
      return;
    }
    if (s.onRw === cr.rw) cr.entered = true;
    else if (cr.entered) {
      cr.done = true;
      core.tfcRelease(PLAYER, cr.rw);
      this.crossRw = -1;
    }
  }

  tryTakeoff(first) {
    const core = this.game.core, cs = this.callsign, w = this.game.world.weather.state, rwy = this.activeEnd.ident;
    const ok = core.tfcRequest(PLAYER, this.activeRw, REQ.TAKEOFF, 0);
    if (ok) {
      this.clearances.takeoff = true;
      this.clearances.lineup = true;
      this.state = ATC_STATE.TAKEOFF;
      const pat = this.pattern ? `, make ${this.patternSide()} traffic` : `, fly runway heading`;
      this.atc(this.names.twr, `${cs}${pat}, runway ${rwy}, ${windText(w)}, cleared for takeoff.`,
        `אושר להמריא ממסלול ${rwy}. ${windHe(w)}. ${this.pattern ? `לאחר ההמראה יש לבצע הקפה (${this.patternSide() === 'left' ? 'שמאלית' : 'ימנית'}).` : 'לאחר ההמראה יש לשמור על כיוון המסלול.'}`);
      this.pilot(`Cleared for takeoff runway ${rwy}, ${this.callsignShort}.`, 'חזרה על אישור ההמראה.');
      this.game.hideRoute();
      this.pending = null;
    } else {
      const eta = core.tfcArrivalEta(this.activeRw);
      if (first) {
        const reason = eta >= 0 && eta < 120 ? `traffic on ${Math.max(1, Math.round(eta * 70 / 1852))} mile final` : 'traffic on the runway';
        this.atc(this.names.twr, `${cs}, hold short runway ${rwy}, ${reason}.`, `יש להמתין לפני המסלול ${rwy} — ${eta >= 0 && eta < 120 ? 'מטוס נמצא בגישה לנחיתה' : 'המסלול תפוס'}. תקבל אישור כשהמסלול יתפנה.`);
        this.pilot(`Holding short runway ${rwy}, ${this.callsignShort}.`, 'ממתין לפני המסלול.');
      }
      this.pending = 'takeoff';
    }
  }

  patternSide() {
    // right traffic when the runway end's right side is the airport's busy side; simple: alternate by ident
    const id = this.activeEnd.ident;
    return id.endsWith('R') ? 'right' : 'left';
  }

  inboundInstructions(s) {
    const cs = this.callsign, rwy = this.activeEnd.ident, w = this.game.world.weather.state;
    const ap = this.airport;
    const fieldFt = Math.round((ap.elev / 0.3048 + 1000) / 100) * 100;
    this.state = ATC_STATE.INBOUND;
    if (s.rc.along < -2500 && Math.abs(s.rc.lateral) < 3000) {
      this.atc(this.names.twr, `${cs}, make straight-in runway ${rwy}, report 3 mile final, ${windText(w)}.`, `גישה ישירה למסלול ${rwy}. יש לדווח במרחק 3 מייל בגישה הסופית.`);
    } else {
      const side = this.patternSide();
      this.atc(this.names.twr, `${cs}, enter ${side} downwind runway ${rwy} at ${fieldFt} feet, report midfield downwind.`, `כניסה לצלע הרוח (${side === 'left' ? 'שמאלית' : 'ימנית'}) של מסלול ${rwy} בגובה ${fieldFt} רגל. יש לדווח באמצע הצלע.`);
    }
  }

  tryLanding(first) {
    const core = this.game.core, cs = this.callsign, w = this.game.world.weather.state, rwy = this.activeEnd.ident;
    const s = this.situation();
    const eta = Math.max(0, -s.rc.along) / Math.max(30, this.game.player.o.gs);
    const ok = core.tfcRequest(PLAYER, this.activeRw, REQ.LANDING, eta);
    if (ok) {
      this.clearances.land = true;
      this.state = ATC_STATE.LANDING;
      this.atc(this.names.twr, `${cs}, runway ${rwy}, ${windText(w)}, cleared to land.`, `אושר לנחות במסלול ${rwy}. ${windHe(w)}.`);
      this.pilot(`Cleared to land runway ${rwy}, ${this.callsignShort}.`, 'חזרה על אישור הנחיתה.');
      this.pending = null;
    } else {
      if (first) this.atc(this.names.twr, `${cs}, continue approach, traffic on the runway, expect landing clearance.`, 'להמשיך בגישה — המסלול תפוס כרגע. אישור נחיתה יינתן כשיתפנה.');
      this.pending = 'land';
    }
  }

  cancelLanding() {
    this.clearances.land = false;
    this.game.core.tfcCancelArrival(PLAYER, this.activeRw);
    this.state = this.state === ATC_STATE.LANDING ? ATC_STATE.PATTERN : this.state;
  }

  releaseRunway() { if (this.airport) this.game.core.tfcRelease(PLAYER, this.activeRw); }

  // ---------------------------------------------------------------------
  update(dt) {
    if (!this.airport) return;
    // scheduled transmissions
    if (this.queue) {
      for (const q of this.queue) q.t -= dt;
      const due = this.queue.filter((q) => q.t <= 0);
      this.queue = this.queue.filter((q) => q.t > 0);
      due.forEach((q) => q.fn());
    }
    const g = this.game, o = g.player.o, core = g.core;
    const s = this.situation();
    if (!s) return;
    // tell the traffic system where the player is (airport frame)
    const onRwPhys = s.onRw >= 0 && (s.onGround || s.aglField < 30) ? s.onRw : -1;
    core.tfcSetPlayer(s.loc.x, s.loc.y, o.psi, o.gs, onRwPhys, s.aglField);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 2;
      if (this.pending === 'takeoff') this.tryTakeoff(false);
      if (this.pending === 'land') this.tryLanding(false);
    }
    // keep the player's arrival reservation fresh
    if (this.clearances.land && !s.onGround) {
      const eta = Math.max(0, -s.rc.along) / Math.max(30, o.gs);
      core.tfcReserveArrival(PLAYER, this.activeRw, eta);
      // go-around if the runway is blocked close in
      const occ = core.tfcOccupant(this.activeRw);
      if (occ >= 0 && occ !== PLAYER && s.rc.along > -1200 && s.aglField < 150 && !this.emergency) {
        this.atc(this.names.twr, `${this.callsign}, go around, runway occupied.`, 'ביצוע הליכה סביב מיידי — המסלול תפוס!');
        this.cancelLanding();
        this.violationsLog('go-around-instructed', 'ATC instructed a go-around', 0);
      }
    }
    this.updateCrossing(dt, s);
    // violations: runway incursion / takeoff / landing without clearance
    if (s.onRw >= 0 && s.onRw !== this.crossRw && s.onGround && !this.clearances.lineup && !this.clearances.takeoff && !this.clearances.land && this.state !== ATC_STATE.LANDED && !this._incursion) {
      this._incursion = true;
      this.violationsLog('incursion', 'Runway incursion: entered the runway without clearance', 25);
      this.atc(this.names.twr, `${this.callsign}, you entered runway ${this.airport.rw[s.onRw].name} without clearance, hold position and contact the tower.`, 'נכנסת למסלול בלי אישור! עצור ופנה למגדל. (חדירה למסלול)');
    }
    if (s.onRw < 0) this._incursion = false;
    if (s.onRw >= 0 && s.onGround && s.ias > 35 && !this.clearances.takeoff && this.state !== ATC_STATE.LANDED && this.state !== ATC_STATE.LANDING && !this._toViol) {
      this._toViol = true;
      this.violationsLog('takeoff-no-clearance', 'Takeoff roll without takeoff clearance', 30);
    }
    // takeoff: release the runway when airborne and clear
    if (this.state === ATC_STATE.TAKEOFF && !s.onGround && s.aglField > 120) {
      this.releaseRunway();
      this.clearances.takeoff = false;
      this.clearances.lineup = false;
      this.clearances.taxi = false;
      this.state = this.pattern ? ATC_STATE.PATTERN : ATC_STATE.DEPARTED;
    }
    // landing detection
    if ((this.state === ATC_STATE.LANDING || this.state === ATC_STATE.PATTERN || this.state === ATC_STATE.INBOUND || this.state === ATC_STATE.DEPARTED || this.state === ATC_STATE.NONE) && s.onGround && s.onRw >= 0 && this.wasAirborne) {
      if (!this.clearances.land && !this.emergency) this.violationsLog('landing-no-clearance', 'Landed without landing clearance', 30);
      if (this.clearances.touchAndGo) {
        this.clearances.touchAndGo = false;
      } else if (s.ias < 30) {
        this.state = ATC_STATE.LANDED;
        this.clearances.land = false;
        this.later(1, () => this.atc(this.names.twr, `${this.callsign}, exit the runway when able, contact ground ${this.freq.gnd}.`, `לפנות את המסלול בהקדם האפשרי ולעבור לתדר הקרקע ${this.freq.gnd}.`));
      }
    }
    if (!s.onGround && s.aglField > 50) this.wasAirborne = true;
    if (this.state === ATC_STATE.LANDED && s.onRw < 0 && s.onGround) {
      this.releaseRunway();
      this.state = ATC_STATE.TAXI_IN;
      this.wasAirborne = false;
    }
    this.aiChatter();
  }

  violationsLog(id, text, penalty) {
    this.violations.push({ id, text, penalty, t: this.game.simClock() });
    this.game.events.emit('violation', { id, text, penalty });
  }

  // background radio chatter from AI traffic phase changes
  aiChatter() {
    const tr = this.game.traffic;
    if (!tr || !this.airport) return;
    for (const a of tr.agents) {
      const prev = this.lastAgentPhase.get(a.callsign);
      if (prev === a.phase) continue;
      this.lastAgentPhase.set(a.callsign, a.phase);
      if (prev === undefined) continue;
      const cs = `${AI_AIRLINES[a.callsign % AI_AIRLINES.length]} ${100 + ((a.callsign * 37) % 800)}`;
      const rw = this.activeEnd.ident;
      if (a.phase === 5) this.chatter(`${this.names.twr}: ${cs}, runway ${rw}, line up and wait.`);
      else if (a.phase === 6) this.chatter(`${this.names.twr}: ${cs}, runway ${rw}, cleared for takeoff.`);
      else if (a.phase === 11) this.chatter(`${this.names.gnd}: ${cs}, taxi to the gate.`);
      else if (a.phase === 3 && prev === 2) this.chatter(`${this.names.gnd}: ${cs}, taxi to runway ${rw}.`);
      else if (a.phase === 8 && prev !== 8) this.chatter(`${this.names.twr}: ${cs}, continue approach runway ${rw}.`);
      else if (a.phase === 12) this.chatter(`${this.names.twr}: ${cs}, go around.`);
    }
  }
}
