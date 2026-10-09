// Missions, the guided tutorial and performance scoring. Every objective is
// checked against the simulation state (switches, engine, clearances,
// position) — nothing is completed by a button that only pretends.
const D2R = Math.PI / 180;
const KT = 1 / 0.514444, FT = 1 / 0.3048;

export const MISSIONS = [
  {
    id: 'tutorial', title: 'Tutorial: first flight at JFK', titleHe: 'הדרכה: טיסה ראשונה ב-JFK',
    kind: 'Training', icao: 'KJFK', start: 'stand', weather: 'clear', hour: 11, pax: 0,
    desc: 'Step-by-step: cockpit, engine start, ATC, taxi, takeoff, a traffic pattern and landing at New York JFK. Hints in English and Hebrew.',
    descHe: 'הדרכה צעד אחר צעד: תא הטייס, התנעה, קשר, הסעה, המראה, הקפה ונחיתה בנמל התעופה JFK.',
    tutorial: true, pattern: true,
  },
  {
    id: 'liberty', title: 'Liberty Harbour Tour', titleHe: 'סיור נמל ופסל החירות',
    kind: 'Passenger flight', icao: 'KJFK', start: 'stand', weather: 'fair', hour: 17.2, pax: 2,
    desc: 'Two passengers, a sightseeing loop: Coney Island, the Verrazzano Bridge, the Statue of Liberty and up the Hudson past Midtown, then back to JFK. Stay in the Hudson corridor between 800 and 1300 ft and keep the ride smooth.',
    descHe: 'שני נוסעים בסיור: קוני איילנד, גשר ורזאנו, פסל החירות ומעלה נהר ההדסון לאורך מנהטן, וחזרה לנחיתה ב-JFK. בקטע ההדסון יש לטוס בין 800 ל-1300 רגל ובצורה נוחה לנוסעים.',
    waypoints: [
      { name: 'Coney Island', lat: 40.5752, lon: -73.9790, altFt: [1200, 2000], r: 1500 },
      { name: 'Verrazzano Bridge', lat: 40.6066, lon: -74.0447, altFt: [1000, 1700], r: 1300 },
      { name: 'Statue of Liberty', lat: 40.6892, lon: -74.0445, altFt: [800, 1300], r: 900, corridor: true },
      { name: 'Hudson — Midtown', lat: 40.7600, lon: -74.0090, altFt: [800, 1300], r: 1000, corridor: true },
      { name: 'Brooklyn Bridge', lat: 40.7060, lon: -73.9970, altFt: [800, 1500], r: 1100 },
      { name: 'Jamaica Bay', lat: 40.6110, lon: -73.8320, altFt: [1000, 2000], r: 1800 },
    ],
    land: 'KJFK',
  },
  {
    id: 'crosswind', title: 'Gusty crosswind landing', titleHe: 'נחיתה ברוח צד משבית',
    kind: 'Landing skill', icao: 'LLBG', start: 'air', weather: 'crosswind', hour: 14, pax: 0,
    desc: 'Ben Gurion, 22 kt crosswind gusting 32. Crab on final, transition to a wing-low slip and touch down on the centreline.',
    descHe: 'נתב"ג, רוח צד של 22 קשר עם משבים עד 32. גישה בזווית תיקון (Crab), מעבר להטיית כנף בתוך הרוח ונחיתה על קו האמצע.',
    land: 'LLBG',
  },
  {
    id: 'fog', title: 'Low-visibility arrival', titleHe: 'גישה בראות נמוכה',
    kind: 'Landing skill', icao: 'KJFK', start: 'air', weather: 'fog', hour: 6.5, pax: 0,
    desc: 'Fog, visibility 1200 m and an overcast at 300 ft. Fly the approach lights and the PAPI to the runway.',
    descHe: 'ערפל, ראות של 1200 מטר ותקרת עננים ב-300 רגל. יש להיעזר באורות הגישה ובמחוון ה-PAPI כדי לנחות.',
    land: 'KJFK',
  },
  {
    id: 'efato', title: 'Engine failure after takeoff', titleHe: 'כשל מנוע לאחר המראה',
    kind: 'Failure scenario', icao: 'KLAS', start: 'runway', weather: 'clear', hour: 10, pax: 0,
    desc: 'Las Vegas. The engine will fail at about 600 ft above the field. Lower the nose, keep 68 KIAS and land as straight ahead as possible — do not try to turn back low.',
    descHe: 'לאס וגאס. המנוע ייכשל בגובה של כ-600 רגל מעל השדה. יש להוריד את האף, לשמור על 68 קשר ולנחות כמה שיותר ישר קדימה.',
    failure: { id: 0, aglFt: 600 }, land: 'any',
  },
  {
    id: 'saba', title: 'Saba short-field arrival', titleHe: 'נחיתה על מסלול קצר בסאבה',
    kind: 'Landing skill', icao: 'TNCS', start: 'air', weather: 'fair', hour: 9, pax: 0,
    desc: 'One of the world\'s shortest commercial runways: 400 m between cliffs and the sea. Full flaps, 60 KIAS on short final, touch down early.',
    descHe: 'אחד המסלולים המסחריים הקצרים בעולם: 400 מטר בין מצוקים לים. מדפים מלאים, 60 קשר בגישה, ונגיעה בתחילת המסלול.',
    land: 'TNCS',
  },
  {
    id: 'alps', title: 'Innsbruck valley arrival', titleHe: 'גישה לעמק אינסברוק',
    kind: 'Mountain flying', icao: 'LOWI', start: 'airHigh', weather: 'scattered', hour: 15, pax: 1,
    desc: 'Descend into the Inn valley between 2,000 m peaks and land at Innsbruck. Watch the terrain and keep a margin from the slopes.',
    descHe: 'ירידה אל עמק האין בין פסגות של 2,000 מטר ונחיתה באינסברוק. יש לשמור מרחק מהמדרונות.',
    land: 'LOWI',
  },
];

// ---------------------------------------------------------------------------
// Tutorial steps (each checks real state)
// ---------------------------------------------------------------------------
export function tutorialSteps(game) {
  const p = () => game.player, o = () => game.player.o, sw = () => game.player.sw, atc = () => game.atc;
  const acc = () => !game.player.simMode;
  const fieldFt = () => (o().z - (game.atc.airport ? game.atc.airport.elev : 0)) * FT;
  return [
    { t: 'Welcome to OPEN SKY. Hold the right mouse button and drag to look around. Press 2 for the outside view and 1 to come back.', he: 'ברוכים הבאים! גררו עם הכפתור הימני של העכבר כדי להסתכל סביב. מקש 2 – מבט מבחוץ, מקש 1 – חזרה לתא.', done: (s) => s.time > 10 || s.viewsSeen >= 2 },
    { t: 'Before start: parking brake ON (B), master battery ON (click the red BAT switch) and the beacon (BCN) ON.', he: 'לפני ההתנעה: בלם חניה מופעל (B), מתג המצבר (BAT האדום) ומתג משואת ההבהוב (BCN) דלוקים.', done: () => sw().parkBrake && sw().battery && sw().beacon, hint: 'Switches are on the lower left of the panel. Hover to see names.' },
    { t: 'Set the mixture full rich (U or drag the red knob in), fuel selector BOTH, and crack the throttle (about 1/10).', he: 'תערובת עשירה מלאה (U), בורר דלק על BOTH, ומצערת פתוחה מעט (כעשירית).', done: () => sw().mixture > 0.9 && sw().fuelSelector === 2 && sw().throttle > 0.04 && sw().throttle < 0.25, hint: 'Throttle: = / − keys or drag the black knob. Accessible mode: Shift+E runs the whole start procedure for you.' },
    { t: 'Prime the engine: fuel pump ON for about 3 seconds, then OFF.', he: 'הזרקת דלק התחלתית: הפעילו את משאבת הדלק (PUMP) לכ-3 שניות ואז כבו אותה.', skip: acc, done: () => o().prime > 1.5 && !sw().fuelPump },
    { t: 'Clear prop! Turn the key to START (right-click the key, or hold it) until the engine runs, then release to BOTH.', he: 'הזהירו "הרחק מהמדחף!" וסובבו את המפתח ל-START (קליק ימני על המפתח) עד שהמנוע מתניע, ואז שחררו ל-BOTH.', done: () => o().engineRunning > 0.5 },
    { t: 'After start: alternator (ALT) and avionics (AVN) ON. Check oil pressure rising into the green.', he: 'אחרי ההתנעה: הדליקו את מתג הגנרטור (ALT) ואת מתג האוויוניקה (AVN). ודאו שלחץ השמן עולה לתחום הירוק.', done: () => sw().alternator && sw().avionics && o().oilP > 25 },
    { t: 'Call ATC: press T to open the radio and choose "Ground: request taxi for departure".', he: 'פנו לפיקוח: מקש T פותח את הקשר. בחרו "בקשת הסעה למסלול ההמראה".', done: () => atc().clearances.taxi },
    { t: 'Release the parking brake (B), add a little power and follow the green taxi line. Steer with Q / E (rudder). Stay below 20 kt. Stop at the yellow hold-short line.', he: 'שחררו את בלם החניה (B), הוסיפו מעט כוח ועקבו אחרי הקו הירוק. היגוי בעזרת Q ו-E. מהירות מתחת ל-20 קשר. עצרו לפני קו העצירה הצהוב.', done: (s) => s.atHold, hint: 'Brakes: Space. Reduce power to idle before you reach the line.' },
    { t: 'At the hold line: flaps UP or 10°, trim near TO. Open the radio (T) and report "ready for departure".', he: 'בנקודת ההמתנה: מדפים סגורים או 10°, קיזוז במצב המראה. פתחו את הקשר (T) ודווחו "מוכן להמראה".', done: () => atc().clearances.takeoff || atc().pending === 'takeoff' },
    { t: 'Wait for the takeoff clearance. When cleared: landing light (L) and strobes ON, line up on the centreline.', he: 'המתינו לאישור ההמראה. לאחר האישור: אור נחיתה (L) ומהבהבים דלוקים, היכנסו למסלול ויישרו על קו האמצע.', done: () => atc().clearances.takeoff && game.atcSituation().onRw >= 0 },
    { t: 'Full throttle. Keep straight with rudder. At 55 knots gently pull back (S / ↓) and climb at 70–75 knots.', he: 'מצערת מלאה. שמרו על כיוון בעזרת הגה הכיוון. ב-55 קשר משכו בעדינות ושמרו על 70–75 קשר בטיפוס.', done: () => !o().onGround && fieldFt() > 400 },
    { t: 'Climb to pattern altitude, 1000 ft above the field. Follow the magenta rings: crosswind, then downwind.', he: 'טפסו לגובה ההקפה – 1000 רגל מעל השדה. עקבו אחרי הטבעות: צלע רוחב ואז צלע הרוח.', done: (s) => s.patternIndex >= 2 },
    { t: 'Downwind: abeam the runway end reduce to about 1800 rpm, flaps 10°, and call the tower (T) to report.', he: 'צלע הרוח: מול קצה המסלול הורידו כוח לכ-1800 סל"ד, מדפים 10°, ודווחו למגדל (T).', done: (s) => s.patternIndex >= 3 && (atc().clearances.land || atc().pending === 'land' || atc().state === 'inbound') },
    { t: 'Base and final: flaps 20° then full, 65 knots. PAPI: two white, two red means on glide path.', he: 'צלע בסיס וגישה סופית: מדפים 20° ואז מלאים, 65 קשר. ב-PAPI – שני אורות לבנים ושניים אדומים = שיפוע תקין.', done: () => !o().onGround && game.atcSituation().onFinal && atc().clearances.land },
    { t: 'Land: over the threshold reduce to idle, raise the nose gently (flare) and let it settle. Brake with Space.', he: 'נחיתה: מעל סף המסלול הורידו למצערת סרק, הרימו מעט את האף והניחו למטוס לשקוע בעדינות. בלימה – רווח.', done: () => o().onGround && o().tdCount > 0 && o().gs < 8 },
    { t: 'Well done! Exit the runway, then request taxi to parking (T). Press Esc → End flight for your debrief.', he: 'כל הכבוד! פנו מהמסלול ובקשו הסעה לחניה (T). לסיכום הביצוע: Esc ← סיום טיסה.', done: () => false },
  ];
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
export class Scorer {
  constructor(game, mission) {
    this.game = game;
    this.mission = mission;
    this.timeline = [];
    this.t = 0;
    this.speed = { good: 0, total: 0 };
    this.alt = { good: 0, total: 0 };
    this.comfort = 100;
    this.procedure = 100;
    this.landings = [];
    this.flags = {};
    this.lastTd = 0;
    this.lastEvents = 0;
    this.maxBank = 0;
    this.maxG = 1;
    this.minG = 1;
    this.taxiFast = 0;
    this.waypointsHit = 0;
    this.crash = null;
    this.distance = 0;
    this.airTime = 0;
  }

  note(text, he = '', kind = '') { this.timeline.push({ t: this.t, text, he, kind }); }
  penalty(key, pts, text, he = '') {
    if (this.flags[key]) return;
    this.flags[key] = true;
    this.procedure = Math.max(0, this.procedure - pts);
    this.note(`${text} (−${pts})`, he, 'bad');
  }

  update(dt) {
    const g = this.game, o = g.player.o, sw = g.player.sw;
    this.t += dt;
    if (o.crashed && !this.crash) {
      const why = ['', 'gear collapse (hard landing)', 'terrain impact', 'wing strike', 'water', 'obstacle / building', 'structural overstress'][o.crashReason | 0] || 'crash';
      this.crash = why;
      this.note(`CRASH: ${why}`, 'התרסקות', 'bad');
    }
    if (o.crashed) return;
    const ias = o.ias * KT, agl = o.agl * FT;
    this.distance += o.gs * dt;
    if (!o.onGround) this.airTime += dt;
    // speed discipline by phase
    let target = null;
    const sit = g.atcSituation();
    if (o.onGround && ias < 40 && o.gs > 0.5) { target = [0, 20]; if (ias > 25 && sit && sit.onRw < 0) this.taxiFast += dt; }
    else if (!o.onGround && sit && sit.onFinal && agl < 1500) target = [58, 80];
    else if (!o.onGround && o.vs > 1.5) target = [62, 95];
    else if (!o.onGround) target = [60, 130];
    if (target) {
      this.speed.total += dt;
      if (ias >= target[0] && ias <= target[1]) this.speed.good += dt;
    }
    if (this.taxiFast > 4) { this.penalty('taxiFast', 5, 'Taxi speed above 25 kt', 'מהירות הסעה גבוהה מדי'); }
    // altitude discipline: mission waypoint bands, else pattern / cruise sanity
    const wp = g.mission && g.mission.currentWaypoint ? g.mission.currentWaypoint() : null;
    if (!o.onGround && wp && wp.altFt) {
      this.alt.total += dt;
      const ftMsl = o.indAlt * FT;
      if (ftMsl >= wp.altFt[0] - 100 && ftMsl <= wp.altFt[1] + 100) this.alt.good += dt;
      else if (wp.corridor && ftMsl > 1400) this.penalty('corridor', 10, 'Above 1300 ft in the Hudson corridor', 'מעל 1300 רגל בפרוזדור ההדסון');
    } else if (!o.onGround && agl > 300) {
      this.alt.total += dt;
      if (agl > 500) this.alt.good += dt;
    }
    // comfort (passengers): bank, load factor, descent rate, roll rate
    const bank = Math.abs(o.phi) / D2R;
    this.maxBank = Math.max(this.maxBank, o.onGround ? 0 : bank);
    this.maxG = Math.max(this.maxG, o.nz);
    this.minG = Math.min(this.minG, o.nz);
    let disc = 0;
    if (!o.onGround) {
      if (bank > 30) disc += (bank - 30) * 0.02;
      if (o.nz > 1.6 || o.nz < 0.5) disc += 0.5;
      if (o.vs * FT * 60 < -1200) disc += 0.15;
      if (Math.abs(o.p) / D2R > 35) disc += 0.1;
    }
    this.comfort = Math.max(0, this.comfort - disc * dt * 6 * (this.mission && this.mission.pax ? 1 : 0.5));
    // procedures
    if (o.engineRunning && !this.flags.started) {
      this.flags.started = true;
      if (!sw.beacon) this.penalty('beacon', 5, 'Engine started without the beacon on', 'התנעה ללא אור משואה');
      if (!g.atc.clearances.startup && g.mission && g.mission.start === 'stand') this.note('Started without start-up clearance (not required at all airports)', 'התנעה ללא אישור', '');
    }
    if (o.onGround && o.gs > 3 && sw.parkBrake) this.penalty('parkBrake', 5, 'Taxiing with the parking brake set', 'הסעה עם בלם חניה');
    if (!o.onGround && agl < 1000 && !sw.landing && this.airTime > 30 && !this.flags.lightNote) { this.flags.lightNote = true; this.procedure = Math.max(0, this.procedure - 3); this.note('Landing light off below 1000 ft (−3)', 'אור נחיתה כבוי בגובה נמוך', 'bad'); }
    const ev = o.events | 0;
    const newEv = ev & ~this.lastEvents;
    this.lastEvents = ev;
    const E = { 1: ['tailStrike', 10, 'Tail strike', 'פגיעת זנב'], 2: ['propStrike', 20, 'Propeller strike', 'פגיעת מדחף'], 4: ['tip', 15, 'Wingtip strike', 'פגיעת קצה כנף'], 8: ['vfe', 8, 'Flap speed (Vfe) exceeded', 'חריגה ממהירות מדפים'], 16: ['vne', 15, 'Never-exceed speed exceeded', 'חריגה ממהירות מקסימלית'], 32: ['glim', 15, 'Load factor limit exceeded', 'חריגה מעומס מבני'], 64: ['stall', 5, 'Stall', 'הזדקרות'], 2048: ['apdisc', 0, 'Autopilot disconnected', 'ניתוק טייס אוטומטי'], 4096: ['bounce', 5, 'Bounced landing', 'נחיתה מקפצת'] };
    for (const [bit, [k, pts, txt, he]] of Object.entries(E)) {
      if (newEv & +bit) {
        if (+bit === 64 && agl < 25) continue; // flare stall-horn / landing stall is normal
        if (pts) this.penalty(k + this.t.toFixed(0), pts, txt, he); else this.note(txt, he);
      }
    }
    // landings
    if (o.tdCount > this.lastTd) {
      this.lastTd = o.tdCount;
      const L = this.evaluateTouchdown();
      if (L) {
        this.landings.push(L);
        this.note(`Touchdown: ${Math.round(-L.vsFpm)} fpm, ${L.g.toFixed(2)} g, ${L.centre.toFixed(1)} m from centreline, ${Math.round(L.along)} m past threshold → ${L.score}/100`, 'נגיעה במסלול', L.score >= 70 ? 'good' : '');
      }
    }
  }

  evaluateTouchdown() {
    const g = this.game, o = g.player.o;
    const ap = g.atc.airport;
    const vsFpm = o.tdVs * FT * 60;
    let centre = 99, along = -1, onRunway = false;
    if (ap) {
      const loc = ap.owner.toLocal(o.tdX, o.tdY, {});
      const rwi = ap.runwayAt(loc.x, loc.y, 0);
      if (rwi >= 0) {
        onRunway = true;
        const r = ap.rw[rwi];
        const hdg = o.tdHdg / D2R;
        const end = Math.abs((((hdg - r.ends[0].hdgTrue) % 360) + 540) % 360 - 180) < 90 ? r.ends[0] : r.ends[1];
        const rc = ap.runwayCoords(end, loc.x, loc.y);
        centre = Math.abs(rc.lateral);
        along = rc.along;
      }
    }
    let s = 0;
    const v = -vsFpm;
    s += v <= 200 ? 30 : v <= 350 ? 25 : v <= 500 ? 16 : v <= 700 ? 6 : 0;
    s += centre <= 2 ? 20 : centre <= 5 ? 15 : centre <= 10 ? 8 : onRunway ? 3 : 0;
    s += along >= 60 && along <= 500 ? 20 : along > 500 && along <= 900 ? 12 : along >= 0 ? 6 : 0;
    const crab = Math.abs(o.tdCrab) / D2R, bank = Math.abs(o.tdBank) / D2R;
    s += Math.max(0, 15 - Math.max(0, crab - 2) * 2 - Math.max(0, bank - 3) * 2);
    s += o.tdNz <= 1.4 ? 15 : o.tdNz <= 1.8 ? 8 : 0;
    if (!onRunway) s = Math.min(s, 20);
    return { vsFpm, g: o.tdNz, centre, along, crab, bank, onRunway, score: Math.round(Math.max(0, Math.min(100, s))) };
  }

  result() {
    const pct = (a) => (a.total > 5 ? Math.round((100 * a.good) / a.total) : 100);
    const land = this.landings.length ? Math.max(...this.landings.map((l) => l.score)) : null;
    const viol = this.game.atc.violations.reduce((s, v) => s + v.penalty, 0);
    const proc = Math.max(0, Math.round(this.procedure - viol));
    const parts = {
      landing: land, speed: pct(this.speed), altitude: pct(this.alt), procedures: proc,
      comfort: Math.round(this.comfort),
    };
    const w = { landing: 0.3, speed: 0.15, altitude: 0.15, procedures: 0.25, comfort: 0.15 };
    let tot = 0, wt = 0;
    for (const [k, v] of Object.entries(parts)) if (v !== null) { tot += v * w[k]; wt += w[k]; }
    let total = Math.round(tot / Math.max(wt, 0.01));
    if (this.crash) total = 0;
    if (this.mission && this.mission.waypoints && this.waypointsHit < this.mission.waypoints.length) total = Math.round(total * (0.5 + 0.5 * this.waypointsHit / this.mission.waypoints.length));
    const grade = this.crash ? 'F' : total >= 90 ? 'A' : total >= 80 ? 'B' : total >= 65 ? 'C' : total >= 50 ? 'D' : 'E';
    return { parts, total, grade, crash: this.crash, timeline: this.timeline, landings: this.landings, violations: this.game.atc.violations, maxBank: this.maxBank, maxG: this.maxG, minG: this.minG, distanceKm: this.distance / 1000, flightMin: this.t / 60, waypointsHit: this.waypointsHit };
  }
}

// ---------------------------------------------------------------------------
// Mission runtime: waypoints, pattern guidance, failures, tutorial progress
// ---------------------------------------------------------------------------
export class MissionRuntime {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.wpIndex = 0;
    this.steps = def && def.tutorial ? tutorialSteps(game) : null;
    this.step = 0;
    this.stepTime = 0;
    this.viewsSeen = new Set();
    this.patternIndex = 0;
    this.pattern = null;
    this.failed = false;
    this.done = false;
  }

  currentWaypoint() { return this.def && this.def.waypoints ? this.def.waypoints[this.wpIndex] || null : null; }

  // traffic pattern legs for the active runway (rings to fly through)
  buildPattern() {
    const atc = this.game.atc;
    if (!atc.airport) return;
    const ap = atc.airport, end = atc.activeEnd, r = ap.rw[end.rw];
    const ux = end.dir === 0 ? r.ux : -r.ux, uy = end.dir === 0 ? r.uy : -r.uy;
    const side = atc.patternSide() === 'left' ? -1 : 1;           // right of the landing direction = +1
    const nx = uy * side, ny = -ux * side;                        // toward the downwind side
    const L = r.L, off = 1600;
    const thr = { x: end.tx, y: end.ty };
    const h = ap.elev + 1000 * 0.3048;
    const P = (along, lat) => ({ x: thr.x + ux * along + nx * lat, y: thr.y + uy * along + ny * lat });
    this.pattern = [
      { name: 'Upwind', ...P(L + 900, 0), z: ap.elev + 600 * 0.3048 },
      { name: 'Crosswind', ...P(L + 1100, off * 0.6), z: h },
      { name: 'Downwind', ...P(L * 0.5, off), z: h },
      { name: 'Abeam threshold', ...P(-200, off), z: h },
      { name: 'Base', ...P(-1700, off * 0.75), z: ap.elev + 700 * 0.3048 },
      { name: 'Final', ...P(-2200, 0), z: ap.elev + 500 * 0.3048 },
    ];
    this.game.showRings(this.pattern.map((p) => { const w = ap.owner.toWorld(p.x, p.y, {}); return { x: w.x, y: w.y, z: p.z, name: p.name }; }));
  }

  update(dt) {
    const g = this.game, o = g.player.o;
    // waypoints
    const wp = this.currentWaypoint();
    if (wp) {
      const p = g.world.frame.toXY(wp.lat, wp.lon);
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < wp.r && !o.onGround) {
        g.scorer.waypointsHit++;
        g.toast(`Waypoint ${wp.name} ✓`, 'good');
        g.scorer.note(`Waypoint: ${wp.name}`, '', 'good');
        this.wpIndex++;
        g.updateRouteGuide();
      }
    }
    // pattern rings progress
    if (this.pattern && this.patternIndex < this.pattern.length) {
      const ap = g.atc.airport;
      const p = this.pattern[this.patternIndex];
      const w = ap.owner.toWorld(p.x, p.y, {});
      const d = Math.hypot(o.x - w.x, o.y - w.y);
      if (d < 700 && !o.onGround) { this.patternIndex++; g.highlightRing(this.patternIndex); }
    }
    // scripted failure
    const f = this.def && this.def.failure;
    if (f && !this.failed && !o.onGround && g.atc.airport && (o.z - g.atc.airport.elev) * FT > f.aglFt) {
      this.failed = true;
      g.core.setFailure(f.id, true);
      g.toast('ENGINE FAILURE', 'bad');
      g.scorer.note('Engine failure (scenario)', 'כשל מנוע (תרחיש)', 'bad');
    }
    // tutorial
    if (this.steps) {
      this.stepTime += dt;
      while (this.step < this.steps.length) {
        const st = this.steps[this.step];
        if (st.skip && st.skip()) { this.step++; continue; }
        const ctx = { time: this.stepTime, viewsSeen: this.viewsSeen.size, atHold: this.atHold(), patternIndex: this.patternIndex };
        if (st.done(ctx)) {
          this.step++;
          this.stepTime = 0;
          if (this.step === 11 && !this.pattern) this.buildPattern();
          g.audio.oneShot('click', 1);
          continue;
        }
        break;
      }
    }
  }

  atHold() {
    const g = this.game, r = g.atc.route;
    if (!r || r.holdNode === undefined || !g.atc.airport) return false;
    const n = g.atc.airport.data.graph.nodes[r.holdNode];
    const loc = g.atc.airport.owner.toLocal(g.player.o.x, g.player.o.y, {});
    return Math.hypot(loc.x - n[0], loc.y - n[1]) < 45 && g.player.o.gs < 2.5;
  }

  tutorialView() {
    if (!this.steps) return null;
    const st = this.steps[Math.min(this.step, this.steps.length - 1)];
    return { index: this.step, count: this.steps.length, text: st.t, he: st.he, hint: st.hint || '' };
  }
}
