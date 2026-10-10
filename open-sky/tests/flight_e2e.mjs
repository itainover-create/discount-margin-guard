// Automated flight tests in headless Chromium. Scripted "test pilots" fly
// the real game through Game.debugStep (physics, ATC, traffic, missions,
// scoring all run; rendering only for screenshots).
// Usage: node tests/flight_e2e.mjs <baseUrl> <outDir> [scenarios,comma,separated]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const [, , base = 'http://localhost:8123/', out = './shots', which = 'ground,takeoff,landing,traffic,fleet,cameras,perf'] = process.argv;
const want = new Set(which.split(','));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const results = [];
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's', ...a);
const record = (name, pass, detail) => { results.push({ name, pass, detail }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail)); };

async function shot(name, frames = 6) {
  await page.evaluate(async (n) => {
    const g = window.__game;
    for (let i = 0; i < n; i++) { g.world.update(0.016, g.camera, g.rig.worldPos(), g.date()); g.rig.update(0.016, g.player, g.blankInput()); g.player.ui.frame = -1 - i; g.player.pose(0.05); g.hud.update(0.2); g.render(); await new Promise((r) => setTimeout(r, 0)); }
  }, frames);
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 180000 });
  const nan = await page.evaluate(() => {
    const bad = [];
    window.__game.world.scene.traverse((o) => {
      const bs = o.geometry && o.geometry.boundingSphere;
      if (bs && isNaN(bs.radius)) {
        const chain = []; for (let p = o; p; p = p.parent) chain.push(p.name || p.type);
        const pa = o.geometry.attributes.position; let i = 0; while (i < pa.array.length && isFinite(pa.array[i])) i++;
        bad.push({ chain: chain.join(' < '), count: pa.count, firstNaN: i, mat: o.material && o.material.type });
      }
    });
    return bad;
  });
  if (nan.length) log('NaN geometry objects:', JSON.stringify(nan));
  log('screenshot', name);
}

// test pilot helpers injected into the page
const HELPERS = `
window.__tp = {
  wrap(a){ while(a>Math.PI)a-=2*Math.PI; while(a<-Math.PI)a+=2*Math.PI; return a; },
  clamp(v,a,b){ return v<a?a:v>b?b:v; },
  // follow ATC taxi route nodes; returns true when stopped at the hold node
  taxi(input, g, st){
    const o=g.player.o, ap=g.atc.airport, r=g.atc.route; if(!r) return;
    g.player.sw.parkBrake=false;
    const nodes=ap.data.graph.nodes;
    const loc=ap.owner.toLocal(o.x,o.y,{});
    if(st.i===undefined) st.i=0;
    // clearance limit: hold short of an uncleared runway crossing
    const lim=g.atc.taxiLimit();
    if(lim<r.path.length-1) st.holdsShort=(st.holdsShort||0)+1;
    // advance along the path: target = first node > 22 m ahead
    while(st.i<lim){ const n=nodes[r.path[st.i]]; if(Math.hypot(n[0]-loc.x,n[1]-loc.y)<22) st.i++; else break; }
    const n=nodes[r.path[Math.min(st.i,lim)]];
    const dist=Math.hypot(n[0]-loc.x,n[1]-loc.y);
    const want=Math.atan2(n[0]-loc.x,n[1]-loc.y);
    const err=this.wrap(want-o.psi);
    const last=st.i>=lim;
    let vt = Math.abs(err)>0.5? 2.5 : 6.5; if(last) vt=Math.min(vt, Math.max(0, (dist-6)*0.2));
    // see and avoid: hold behind traffic in front (AI aircraft on the taxiway)
    st.trafficAhead=false;
    for(const a of g.traffic.agents){ const dx=a.x-o.x, dy=a.y-o.y, d=Math.hypot(dx,dy); if(d>110) continue;
      const f=dx*Math.sin(o.psi)+dy*Math.cos(o.psi), l=Math.abs(dx*Math.cos(o.psi)-dy*Math.sin(o.psi));
      const half=[17.5,13,30,5.5][a.type]||17.5;  // AI half-span; ours is 5.5 m
      if(f>0 && l<half+8){ st.trafficAhead=true; vt=Math.min(vt, Math.max(0,(d-(half+45))*0.15)); } }
    input.yaw=this.clamp(err*2.2 - o.r*0.8,-1,1);
    const ev=vt-o.gs;
    g.player.sw.throttle=this.clamp(0.12+ev*0.12,0,0.45);
    if(ev<-1.0 || (last && dist<10) || vt<0.3){ input.brakeL=input.brakeR=vt<0.3?1:this.clamp(-ev*0.4,0.2,1); g.player.sw.throttle=0; }
    const hn=nodes[r.path[r.path.length-1]], dHold=Math.hypot(hn[0]-loc.x,hn[1]-loc.y);
    st.queued = st.trafficAhead && dHold<180;  // stopped in the departure queue behind traffic
    st.done = lim===r.path.length-1 && o.gs<0.6 && ((last && dist<14) || st.queued);
  },
  // fly attitude: pitch/roll commands to targets (rad)
  att(input, o, pitchT, bankT){
    input.pitch=this.clamp(3.0*(pitchT-o.theta)-0.8*o.q,-1,1);
    input.roll=this.clamp(2.5*(bankT-o.phi)-0.5*o.p,-1,1);
  },
};`;

try {
  await page.goto(base);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  await page.evaluate(HELPERS);
  await page.evaluate(() => { window.__game.debugHold = true; });
  // report the origin of any NaN geometry
  await page.evaluate(async () => {
    const THREE = await import('three');
    const orig = THREE.BufferGeometry.prototype.computeBoundingSphere;
    THREE.BufferGeometry.prototype.computeBoundingSphere = function () {
      orig.call(this);
      if (this.boundingSphere && isNaN(this.boundingSphere.radius)) console.error('NaN geometry: ' + (this.name || '?') + ' ' + new Error().stack.split('\n').slice(2, 8).join(' | '));
    };
  });
  log('booted');

  // ---------------------------------------------------------------- ground
  if (want.has('ground')) {
    await page.evaluate(() => window.__game.startFlight({ icao: 'KJFK', start: 'stand', mode: 'accessible', hour: 12, weather: 'fair' }));
    await page.waitForFunction(() => window.__game.state === 'flight', null, { timeout: 180000 });
    await page.evaluate(() => { window.__game.debugHold = true; });
    await shot('g1-cockpit-cold', 4);
    const start = await page.evaluate(() => {
      const g = window.__game;
      g.autoStartStop();
      g.debugStep(0.05, 400);
      return { running: g.player.o.engineRunning, rpm: Math.round(g.player.o.rpm), oilP: Math.round(g.player.o.oilP), sw: { ...g.player.sw } };
    });
    record('Engine auto-start runs the switch sequence', start.running > 0.5 && start.sw.battery && start.sw.alternator && start.sw.avionics, start);
    const taxiReq = await page.evaluate(() => {
      const g = window.__game;
      g.atc.request('startup');
      g.debugStep(0.05, 60);
      g.atc.request('taxi');
      g.debugStep(0.05, 60);
      return { route: g.atc.route ? g.atc.route.names : null, nodes: g.atc.route ? g.atc.route.path.length : 0, log: g.atc.log.map((m) => m.station + ': ' + m.text) };
    });
    record('ATC taxi clearance with A* route over real taxiways', !!taxiReq.route && taxiReq.nodes > 2, taxiReq);
    await page.evaluate(() => window.__game.rig.setView('chase', window.__game.player));
    await shot('g2-chase-taxi-route', 4);
    const taxi = await page.evaluate(() => {
      const g = window.__game, st = {};
      let maxKt = 0, t = 0;
      while (!st.done && t < 900) {
        g.debugStep(0.05, 20, (inp, gg) => window.__tp.taxi(inp, gg, st));
        t += 1;
        maxKt = Math.max(maxKt, g.player.o.gs / 0.514444);
        if (g.player.o.crashed) break;
      }
      return { done: !!st.done, simSec: Math.round(t), maxKt: Math.round(maxKt), atHold: g.mission.atHold(), queuedBehindTraffic: !!st.queued, crossings: (g.atc.route.crossings || []).map((c) => ({ rw: c.name, cleared: c.cleared, done: c.done })), violations: g.atc.violations.map((v) => v.text), crashed: g.player.o.crashed, crashText: g.player.crashText, crashInfo: g.player.crashInfo, atcLog: g.atc.log.filter((m) => /cross|hold short/i.test(m.text)).map((m) => m.station + ': ' + m.text) };
    });
    record('Taxi along the route to the hold-short line (scripted pilot)', taxi.done && !taxi.crashed && taxi.violations.length === 0, taxi);
    await shot('g3-at-hold-short', 4);
    const ready = await page.evaluate(() => {
      const g = window.__game;
      g.player.sw.parkBrake = true;  // holding: brakes set (idle thrust would creep)
      g.atc.request('ready');
      let t = 0;
      while (!g.atc.clearances.takeoff && t < 400) { g.debugStep(0.05, 40); t += 2; }
      return { cleared: g.atc.clearances.takeoff, waitedSec: t, log: g.atc.log.slice(-4).map((m) => m.station + ': ' + m.text) };
    });
    record('Takeoff clearance from the runway authority (waits for traffic if needed)', ready.cleared, ready);
  }

  // --------------------------------------------------------------- takeoff
  if (want.has('takeoff')) {
    await page.evaluate(() => window.__game.startFlight({ icao: 'KJFK', start: 'runway', mode: 'simulation', hour: 15, weather: 'fair' }));
    await page.waitForFunction(() => window.__game.state === 'flight', null, { timeout: 180000 });
    const res = await page.evaluate(() => {
      const g = window.__game, tp = window.__tp;
      g.atc.clearances.taxi = true;
      g.atc.request('ready');
      let t = 0;
      while (!g.atc.clearances.takeoff && t < 300) { g.debugStep(0.05, 40); t += 2; }
      const rwyHdg = g.player.o.psi;
      g.player.sw.landing = true; g.player.sw.strobe = true;
      let rot = null, lift = null, maxPitch = 0;
      const ctl = (inp, gg) => {
        const o = gg.player.o;
        gg.player.sw.throttle = 1; gg.player.sw.parkBrake = false;
        inp.yaw = tp.clamp(tp.wrap(rwyHdg - o.psi) * 3 - o.r * 1.0, -1, 1);
        const kt = o.ias / 0.514444;
        if (kt > 55 && !rot) rot = Math.round(o.simTime);
        if (rot) tp.att(inp, o, kt < 68 ? 9 * Math.PI / 180 : 7 * Math.PI / 180, 0); else inp.pitch = 0;
        if (!o.onGround && !lift) lift = { kt: Math.round(kt), t: Math.round(o.simTime) };
        maxPitch = Math.max(maxPitch, o.theta);
      };
      let steps = 0;
      while (steps < 12000 && (g.player.o.z - g.atc.airport.elev) < 305) { g.debugStep(0.02, 50, ctl); steps += 50; if (g.player.o.crashed) break; }
      const o = g.player.o;
      return { cleared: g.atc.clearances.takeoff || g.atc.state, liftoff: lift, altFt: Math.round((o.z - g.atc.airport.elev) / 0.3048), crashed: o.crashed, events: o.events, atcState: g.atc.state, violations: g.atc.violations.map((v) => v.text), maxPitchDeg: Math.round(maxPitch * 57.3) };
    });
    record('Simulation-mode takeoff to 1000 ft AGL (scripted pilot)', !res.crashed && res.altFt >= 990 && res.violations.length === 0, res);
    await page.evaluate(() => window.__game.rig.setView('chase', window.__game.player));
    await shot('t1-climb-chase', 6);
    await page.evaluate(() => window.__game.rig.setView('cockpit', window.__game.player));
    await shot('t2-climb-cockpit', 6);
  }

  // --------------------------------------------------------------- landing
  if (want.has('landing')) {
    for (const [icao, wx, mode, mission] of [['KJFK', 'fair', 'accessible', null], ['LLBG', 'crosswind', 'simulation', 'crosswind']]) {
      await page.evaluate(([i, w, m, mi]) => window.__game.startFlight({ icao: i, start: 'air', mode: m, hour: 13, weather: w, missionId: mi || undefined }), [icao, wx, mode, mission]);
      await page.waitForFunction(() => window.__game.state === 'flight', null, { timeout: 180000 });
      const res = await page.evaluate(() => {
        const g = window.__game, tp = window.__tp, ap = g.atc.airport, end = g.atc.activeEnd;
        g.atc.request('final');
        g.debugStep(0.05, 40);
        const D2R = Math.PI / 180;
        let flare = false, td = null, minAgl = 1e9; const st = {};
        let iBank = 0;
        const ctl = (inp, gg) => {
          const o = gg.player.o, sw = gg.player.sw;
          const loc = ap.owner.toLocal(o.x, o.y, {});
          const rc = ap.runwayCoords(end, loc.x, loc.y);
          const agl = o.z - end.z;
          minAgl = Math.min(minAgl, agl);
          sw.landing = true;
          if (rc.along > -5500) sw.flaps = 3; else if (rc.along > -8000) sw.flaps = 2;
          // localizer: desired track from lateral error, bank to track (handles crosswind crab)
          const rwyHdg = end.hdgTrue * D2R;
          const trk = Math.atan2(o.ve, o.vn);
          const wantTrk = rwyHdg - tp.clamp(rc.lateral * 0.012, -0.5, 0.5);  // lateral > 0: right of the centreline
          const bankT = tp.clamp(tp.wrap(wantTrk - trk) * 2.2, -0.35, 0.35);
          // glide path 3 deg to 300 m beyond threshold
          const gpAlt = Math.max(0, (300 - rc.along)) * Math.tan(3 * D2R);
          const kt = o.ias / 0.514444;
          if (!flare && agl < 9 && !o.onGround) { flare = true; st.fp = o.theta; }
          if (o.onGround) {
            sw.throttle = 0; inp.brakeL = inp.brakeR = kt < 50 ? 0.8 : 0; inp.pitch = 0.2;
            inp.yaw = tp.clamp(tp.wrap(rwyHdg - o.psi) * 3 - o.r, -1, 1);
            if (!td) td = { tdVsFpm: Math.round(o.tdVs / 0.00508), along: Math.round(rc.along), lateral: rc.lateral.toFixed(1), kt: Math.round(kt) };
            return;
          }
          if (flare) {
            // round-out: sink rate proportional to wheel height, pitch follows the sink-rate error
            sw.throttle = agl > 4 ? 0.1 : 0;
            const vsT = -Math.max(0.3, (agl - 1.0) * 0.45);
            st.fp = tp.clamp(st.fp + (vsT - o.vu) * 0.006, -0.05, 0.2);
            const vlat = o.ve * Math.cos(rwyHdg) - o.vn * Math.sin(rwyHdg);
            tp.att(inp, o, st.fp, tp.clamp((tp.clamp(-rc.lateral * 0.12, -2, 2) - vlat) * 0.09, -0.3, 0.3));
            // decrab: align nose with runway using rudder in the flare
            inp.yaw = tp.clamp(tp.wrap(rwyHdg - o.psi) * 3 - o.r * 0.8, -1, 1);
            return;
          }
          // below 60 m: wing-low sideslip (rudder aligns the nose, bank holds the centreline)
          if (agl < 60) {
            const h = rwyHdg, vlat = o.ve * Math.cos(h) - o.vn * Math.sin(h);
            const vlatT = tp.clamp(-rc.lateral * 0.12, -3, 3);
            st.bank = tp.clamp((vlatT - vlat) * 0.09, -0.3, 0.3);
          }
          const vsT = -o.gs * Math.tan(3 * D2R) + (gpAlt - agl) * 0.15;
          const pitchT = Math.asin(tp.clamp(vsT / Math.max(o.tas, 20), -0.3, 0.3)) + o.alpha;
          tp.att(inp, o, pitchT, agl < 60 ? st.bank : bankT);
          if (agl < 60) inp.yaw = tp.clamp(tp.wrap(rwyHdg - o.psi) * 4 - o.r * 1.0, -1, 1);
          sw.throttle = tp.clamp(0.25 + (65 - kt) * 0.04, 0, 0.9);
        };
        let steps = 0; const trace = [];
        while (steps < 40000 && !(g.player.o.onGround && g.player.o.gs < 5)) {
          g.debugStep(0.02, 50, ctl); steps += 50; if (g.player.o.crashed) break;
          if (steps % 500 === 0) { const o = g.player.o, loc = ap.owner.toLocal(o.x, o.y, {}), rc = ap.runwayCoords(end, loc.x, loc.y);
            trace.push(`t${Math.round(steps * 0.02)} along${Math.round(rc.along)} lat${Math.round(rc.lateral)} agl${Math.round(o.z - end.z)} ias${Math.round(o.ias / 0.5144)} hdg${Math.round(o.psi * 57.3)} trk${Math.round(Math.atan2(o.ve, o.vn) * 57.3)} bank${Math.round(o.phi * 57.3)} fl${g.player.sw.flaps}`); }
        }
        const L = g.scorer.landings[0] || null;
        return { cleared: g.atc.clearances.land || g.atc.state, td, landingScore: L ? L.score : null, landing: L, crashed: g.player.o.crashed, crashReason: g.player.o.crashReason, wind: g.world.weather.state.windKt + 'kt/' + g.world.weather.state.gustKt, rwy: end.ident + ' ' + Math.round(end.hdgTrue), trace: td ? undefined : trace };
      });
      record(`5 nm final to landing at ${icao} (${wx}, ${mode} mode, scripted pilot)`, !res.crashed && !!res.td && res.landing && res.landing.onRunway, res);
      await page.evaluate(() => window.__game.rig.setView('chase', window.__game.player));
      await shot(`l-${icao}-after-landing`, 6);
      const deb = await page.evaluate(() => { window.__game.endFlight(); return document.getElementById('debrief-body').innerText.slice(0, 600); });
      log('debrief:', deb.replace(/\n+/g, ' | '));
      await page.screenshot({ path: `${out}/l-${icao}-debrief.png` });
      await page.evaluate(() => { document.getElementById('debrief').classList.add('hidden'); });
    }
  }

  // --------------------------------------------------------------- fleet (v2)
  if (want.has('fleet')) {
    // every aircraft spawns on the runway, renders and stays put
    const spawnRes = [];
    for (let id = 0; id <= 13; id++) {
      await page.evaluate((i) => window.__game.startFlight({ icao: 'KJFK', start: 'runway', mode: 'accessible', hour: 12, weather: 'fair', aircraft: i }), id);
      await page.waitForFunction(() => window.__game.state === 'flight', null, { timeout: 180000 });
      const r = await page.evaluate(() => { const g = window.__game; g.debugStep(1 / 30, 90); g.render(); const o = g.player.o; return { id: g.player.aircraftId, onGround: o.onGround, crashed: o.crashed, gs: +o.gs.toFixed(2), eng: o.engMask, dmg: +(o.dmgFus + o.dmgWingL + o.dmgWingR).toFixed(3) }; });
      spawnRes.push(r);
      if (id === 7 || id === 9) { await page.evaluate(() => window.__game.rig.setView('chase', window.__game.player)); await shot(`f-spawn-${id}`, 3); }
    }
    record('Fleet: all 14 aircraft spawn on the runway, engines running, stable, undamaged', spawnRes.every((r) => r.onGround && !r.crashed && r.gs < 0.5 && r.eng > 0 && r.dmg === 0), spawnRes);

    // jet takeoff (737-800 class) with a scripted pilot
    await page.evaluate(() => window.__game.startFlight({ icao: 'KJFK', start: 'runway', mode: 'simulation', hour: 12, weather: 'fair', aircraft: 1 }));
    await page.waitForFunction(() => window.__game.state === 'flight', null, { timeout: 180000 });
    const to = await page.evaluate(() => {
      const g = window.__game, p = g.player, f = p.fleet, tp = window.__tp;
      p.sw.parkBrake = false;
      let rot = false, lo = null; const hdg0 = p.o.psi;
      const ctl = (inp) => {
        const o = p.o, kt = o.ias / 0.514444;
        inp.throttleAbs = 1;
        inp.yaw = tp.clamp(tp.wrap(hdg0 - o.psi) * 3 - o.r * 0.6, -1, 1);
        inp.roll = tp.clamp(-o.phi * 1.5 - o.p * 0.3 + (o.onGround ? 0 : tp.wrap(hdg0 - o.psi) * 1.2), -1, 1);
        if (kt > f.vr) rot = true;
        const th = rot ? (o.onGround ? 8 : 14) * Math.PI / 180 : 0;
        inp.pitch = rot ? tp.clamp(3 * (th - o.theta) - 1.2 * o.q + 0.25, -1, 1) : 0;
        if (!o.onGround && !lo) lo = { kt: Math.round(kt), t: Math.round(o.simTime) };
        if (!o.onGround && o.agl > 15) p.sw.gear = false;
        if (!o.onGround && o.agl > 300) p.sw.flaps = 0;
      };
      let t = 0;
      while (t < 120 && p.o.agl / 0.3048 < 1500 && !p.o.crashed) { g.debugStep(1 / 30, 15, ctl); t += 0.5; }
      const o = p.o;
      return { liftoff: lo, altFt: Math.round(o.agl / 0.3048), gear: +o.gearPos.toFixed(2), flaps: Math.round(o.flapsDeg), crashed: o.crashed, tailStrike: g.scorer.timeline.some((e) => /Tail strike/.test(e.text)), n1: Math.round(o.n1_0) };
    });
    record('Fleet: 737-800-class takeoff to 1500 ft (simulation mode, scripted pilot)', !to.crashed && to.liftoff && to.liftoff.kt > 140 && to.liftoff.kt < 185 && to.altFt >= 1500 && to.gear < 0.05 && !to.tailStrike, to);
    await page.evaluate(() => window.__game.rig.setView('cockpit', window.__game.player));
    await shot('f-738-climb-cockpit', 4);

    // jet approach and landing (A320 class): AP heading + V/S on the glide path, A/T at Vref+5, manual flare
    await page.evaluate(() => window.__game.startFlight({ icao: 'KJFK', start: 'air', mode: 'accessible', hour: 13, weather: 'fair', aircraft: 2 }));
    await page.waitForFunction(() => window.__game.state === 'flight', null, { timeout: 180000 });
    const ld = await page.evaluate(() => {
      const g = window.__game, p = g.player, f = p.fleet, tp = window.__tp, ap = g.atc.airport, end = g.atc.activeEnd;
      const D2R = Math.PI / 180;
      g.atc.request('final'); g.debugStep(0.05, 20);
      const sw = p.sw; sw.at = true; p.ui.atSpdKt = f.vref + 5; sw.spoilerArm = true; sw.landing = true;
      sw.apLat = 1; sw.apVert = 0; sw.apMaster = true;
      let flare = false, td = null, st = {};
      const rwyHdg = end.hdgTrue * D2R;
      const ctl = (inp) => {
        const o = p.o;
        const loc = ap.owner.toLocal(o.x, o.y, {});
        const rc = ap.runwayCoords(end, loc.x, loc.y);
        const agl = o.z - end.z;
        if (o.onGround) {
          st.sbMax = Math.max(st.sbMax || 0, o.speedbrake);
          sw.apMaster = false; sw.at = false; sw.throttle = 0.6; sw.reverse = o.gs > 30; if (o.gs < 30) sw.throttle = 0;
          inp.brakeL = inp.brakeR = 0.8; inp.pitch = 0;
          inp.yaw = tp.clamp(tp.wrap(rwyHdg - o.psi) * 3 - o.r, -1, 1);
          if (!td) td = { vsFpm: Math.round(o.tdVs / 0.00508), along: Math.round(rc.along), lateral: +rc.lateral.toFixed(1), kt: Math.round(o.ias / 0.514444) };
          return;
        }
        // lateral: track toward the centreline, heading bug = track + drift (wind crab)
        const wantTrk = rwyHdg - tp.clamp(rc.lateral * 0.003, -0.2, 0.2);
        const drift = tp.wrap(Math.atan2(o.ve, o.vn) - o.psi);
        const bug = wantTrk - drift;
        p.ui.hdgBugDeg = ((bug / D2R - (g.world.magVar || 0)) + 720) % 360; p.ui.hdgBug = p.ui.hdgBugDeg * D2R;
        // vertical: V/S onto a 3-degree path aimed 300 m past the threshold
        const gpAlt = Math.max(0, 300 - rc.along) * Math.tan(3 * D2R);
        p.ui.apVsFpm = Math.round((-o.gs * Math.tan(3 * D2R) + (gpAlt - agl) * 0.12) / 0.00508);
        if (agl < 18 && !flare) { flare = true; sw.apMaster = false; st.th = o.theta; }
        if (flare) {
          sw.at = false; sw.throttle = 0;
          const vsT = -Math.max(0.5, (agl - 2) * 0.22);
          st.th = tp.clamp(st.th + (vsT - o.vu) * 0.01, -0.02, 0.15);
          inp.pitch = tp.clamp(3 * (st.th - o.theta) - 1.0 * o.q, -1, 1);
          inp.roll = tp.clamp(-o.phi * 1.5, -1, 1);
          inp.yaw = tp.clamp(tp.wrap(rwyHdg - o.psi) * 3 - o.r, -1, 1);
        }
      };
      let steps = 0;
      while (steps < 30000 && !(p.o.onGround && p.o.gs < 3)) { g.debugStep(0.02, 50, ctl); steps += 50; if (p.o.crashed) break; }
      const L = g.scorer.landings[0] || null;
      return { td, landing: L ? { score: L.score, onRunway: L.onRunway, g: +L.g.toFixed(2) } : null, crashed: p.o.crashed, sbMax: +(st.sbMax || 0).toFixed(2), rolloutM: td ? Math.round(ap.runwayCoords(end, ap.owner.toLocal(p.o.x, p.o.y, {}).x, ap.owner.toLocal(p.o.x, p.o.y, {}).y).along - td.along) : null };
    });
    record('Fleet: A320-class approach and landing (AP V/S + A/T, flare, reversers, brakes)', ld.sbMax > 0.9 && !ld.crashed && ld.td && ld.landing && ld.landing.onRunway && ld.td.vsFpm > -720, ld);
    await page.evaluate(() => window.__game.rig.setView('chase', window.__game.player));
    await shot('f-320-after-landing', 4);

    // engine fire mission: fire at 800 ft, fire handle, keep flying
    await page.evaluate(() => window.__game.startFlight({ icao: 'KJFK', start: 'runway', mode: 'accessible', hour: 13, weather: 'scattered', missionId: 'jetfire' }));
    await page.waitForFunction(() => window.__game.state === 'flight', null, { timeout: 180000 });
    const fire = await page.evaluate(() => {
      const g = window.__game, p = g.player, f = p.fleet, tp = window.__tp;
      p.sw.parkBrake = false;
      let rot = false; const hdg0 = p.o.psi; let fireSeen = false, handled = false;
      const ctl = (inp) => {
        const o = p.o, kt = o.ias / 0.514444;
        inp.throttleAbs = 1;
        if (kt > f.vr) rot = true;
        const th = rot ? (o.onGround ? 8 : 10) * Math.PI / 180 : 0;
        inp.pitch = rot ? tp.clamp(3 * (th - o.theta) - 1.2 * o.q + 0.2, -1, 1) : 0;
        inp.roll = tp.clamp(-o.phi * 1.5 - o.p * 0.3, -1, 1);
        inp.yaw = tp.clamp(tp.wrap(hdg0 - o.psi) * 3 - o.r * 0.6, -1, 1);
        if (!o.onGround && o.agl > 15) p.sw.gear = false;
        if (o.fireMask) fireSeen = true;
        if (fireSeen && !handled) { inp.events.push('fireHandle'); handled = true; }
      };
      let t = 0, tHandled = null;
      while (t < 140 && !p.o.crashed) {
        g.debugStep(1 / 30, 15, ctl); t += 0.5;
        if (handled && tHandled === null) tHandled = t;
        if (tHandled !== null && t > tHandled + 15) break;
      }
      const o = p.o;
      return { fireSeen, handled, fireNow: o.fireMask, eng1: (o.engMask & 1), eng2: (o.engMask >> 1) & 1, altFt: Math.round(o.agl / 0.3048), crashed: o.crashed, timeline: g.scorer.timeline.slice(-4).map((e) => e.text) };
    });
    record('Fleet: engine fire on departure — fire handle extinguishes, flight continues on one engine', fire.fireSeen && fire.handled && !fire.fireNow && fire.eng2 && !fire.crashed && fire.altFt > 400, fire);
    await page.evaluate(() => window.__game.rig.setView('chase', window.__game.player));
    await shot('f-engine-fire', 4);

    // cruise: en-route traffic, TCAS, autothrottle Mach hold, radio wheel
    await page.evaluate(() => window.__game.startFlight({ icao: 'KJFK', start: 'cruise', mode: 'accessible', hour: 15, weather: 'clear', aircraft: 6 }));
    await page.waitForFunction(() => window.__game.state === 'flight', null, { timeout: 180000 });
    const cr = await page.evaluate(() => {
      const g = window.__game, p = g.player;
      g.debugStep(1 / 20, 600);
      const o = p.o;
      g.hud.toggleAtc(true);
      const wheel = { shown: !document.getElementById('radio-wheel').classList.contains('hidden'), options: document.querySelectorAll('#radio-wheel .rw-opt').length };
      g.hud.toggleAtc(false);
      return { altFt: Math.round(o.alt / 0.3048), mach: +o.mach.toFixed(3), n1: Math.round(o.n1_0), enroute: g.enroute.flights.length, tcas: (p.ui.traffic || []).length, routes: g.enroute.flights.slice(0, 3).map((f) => `${f.callsign} FL${f.fl} ${f.route}`), wheel };
    });
    record('Fleet: cruise FL390 Mach 0.84 on A/T, en-route traffic on TCAS, radio wheel', Math.abs(cr.mach - 0.84) < 0.03 && cr.enroute > 0 && cr.tcas > 0 && cr.wheel.shown && cr.wheel.options > 0, cr);

    // account: Google sign-in + Drive appData save / sign-out, against mocked Google endpoints
    let stored = null;
    await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.google={accounts:{oauth2:{initTokenClient:(c)=>({requestAccessToken:()=>setTimeout(()=>c.callback({access_token:"tok-e2e",expires_in:3600}),10)}),revoke:(t,cb)=>{window.__revoked=t;cb&&cb();}}}};' }));
    await page.route('https://www.googleapis.com/**', (r) => {
      const u = r.request().url();
      if (u.includes('userinfo')) return r.fulfill({ contentType: 'application/json', body: '{"name":"Test Pilot","email":"pilot@example.com"}' });
      if (u.includes('spaces=appDataFolder')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ files: stored ? [{ id: 'f1' }] : [] }) });
      if (u.includes('uploadType=multipart')) { stored = r.request().postData(); return r.fulfill({ contentType: 'application/json', body: '{"id":"f1"}' }); }
      return r.fulfill({ status: 404, body: '' });
    });
    const acct = await page.evaluate(async () => {
      const g = window.__game;
      g.settings.googleClientId = 'e2e.apps.googleusercontent.com';
      await g.cloud.signIn();
      const signed = g.cloud.signedIn && g.cloud.profile.email;
      await g.cloud.save({ v: 1, test: true });
      await g.cloud.signOut();
      return { signed, afterSignOut: { signedIn: g.cloud.signedIn, token: g.cloud.token, revoked: window.__revoked }, tokenPersisted: (JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).includes('tok-e2e') };
    });
    acct.uploaded = !!(stored && stored.includes('appDataFolder'));
    record('Account: Sign in with Google → cloud save to Drive appData → sign-out revokes and wipes the token (mocked Google)', acct.signed && acct.uploaded && !acct.afterSignOut.signedIn && !acct.afterSignOut.token && acct.afterSignOut.revoked === 'tok-e2e' && !acct.tokenPersisted, acct);
    await page.unroute('https://accounts.google.com/gsi/client');
    await page.unroute('https://www.googleapis.com/**');
  }

  // --------------------------------------------------------------- traffic
  if (want.has('traffic')) {
    await page.evaluate(() => window.__game.startFlight({ icao: 'KJFK', start: 'stand', mode: 'accessible', hour: 12, weather: 'fair' }));
    await page.waitForFunction(() => window.__game.state === 'flight', null, { timeout: 180000 });
    const res = await page.evaluate(() => {
      const g = window.__game, ap = g.atc.airport;
      g.core.tfcSetDensity(16, 99);
      const phases = {}, conflicts = [], seen = new Set();
      let takeoffs = 0, landings = 0;
      const prev = new Map();
      for (let s = 0; s < 900; s++) { // 900 x 1 s = 15 simulated minutes
        g.debugStep(0.1, 10);
        const onRw = {};
        for (const a of g.traffic.agents) {
          phases[a.phase] = (phases[a.phase] || 0) + 1;
          const p = prev.get(a.callsign);
          if (p !== undefined && p !== 6 && a.phase === 6) takeoffs++;
          if (p !== undefined && p === 8 && a.phase === 10) landings++;
          prev.set(a.callsign, a.phase);
          const loc = ap.owner.toLocal(a.x, a.y, {});
          const rw = ap.runwayAt(loc.x, loc.y, 0);
          const fast = a.phase === 6 || a.phase === 10 || (a.phase === 8 && a.z - ap.elev < 30);
          if (rw >= 0 && fast) (onRw[rw] = onRw[rw] || []).push(a.callsign);
        }
        for (const [rw, list] of Object.entries(onRw)) if (list.length > 1) { const k = rw + ':' + list.join(','); if (!seen.has(k)) { seen.add(k); conflicts.push({ t: s, rw, list }); } }
      }
      return { takeoffs, landings, conflicts, phases, agents: g.traffic.agents.length };
    });
    record('AI traffic: departures and arrivals with no runway conflicts (15 sim-min)', res.conflicts.length === 0 && res.takeoffs + res.landings > 0, res);
    await page.evaluate(() => window.__game.rig.setView('tower', window.__game.player));
    await shot('tr-tower-view', 6);
  }

  // --------------------------------------------------------------- cameras
  if (want.has('cameras')) {
    await page.evaluate(() => window.__game.startFlight({ icao: 'KJFK', start: 'airHigh', mode: 'accessible', hour: 18.6, weather: 'scattered' }));
    await page.waitForFunction(() => window.__game.state === 'flight', null, { timeout: 180000 });
    await page.evaluate(() => window.__game.debugStep(0.05, 60, (inp, g) => { g.player.sw.throttle = 0.65; }));
    for (const v of ['cockpit', 'chase', 'wing', 'tower', 'flyby', 'free']) {
      await page.evaluate((vv) => window.__game.rig.setView(vv, window.__game.player), v);
      await shot(`c-${v}`, 5);
    }
    const ok = await page.evaluate(() => {
      const g = window.__game, cam = g.camera.position;
      const gr = g.world.heightAt(cam.x, -cam.z);
      return { camAboveGround: cam.y > gr, view: g.rig.view };
    });
    record('All six camera views render (screenshots) and stay above ground', ok.camAboveGround, ok);
  }

  // ------------------------------------------------------------------ perf
  if (want.has('perf')) {
    for (const [name, spec, place] of [
      ['JFK ramp', { icao: 'KJFK', start: 'stand', mode: 'accessible', hour: 12, weather: 'fair' }, null],
      ['Manhattan 1500 ft', { icao: 'KJFK', start: 'airHigh', mode: 'accessible', hour: 12, weather: 'fair' }, [40.758, -73.995, 460, 200]],
      ['Night JFK final', { icao: 'KJFK', start: 'air', mode: 'accessible', hour: 22, weather: 'clear' }, null],
    ]) {
      await page.evaluate((s) => window.__game.startFlight(s), spec);
      await page.waitForFunction(() => window.__game.state === 'flight', null, { timeout: 180000 });
      const r = await page.evaluate(async (pl) => {
        const g = window.__game;
        if (pl) {
          const p = g.world.frame.toXY(pl[0], pl[1]);
          g.core.reset(p.x, p.y, pl[2], pl[3] * Math.PI / 180, 51, false, true);
          g.player.readOutputs();
          g.rig.setView('chase', g.player);
        }
        // warm-up: let tiles stream
        for (let i = 0; i < 30; i++) { g.debugStep(0.05, 2); await new Promise((r2) => setTimeout(r2, 0)); }
        const upd = [];
        for (let i = 0; i < 40; i++) { const t = performance.now(); g.debugStep(1 / 60, 1); upd.push(performance.now() - t); }
        const rend = [];
        for (let i = 0; i < 6; i++) { const t = performance.now(); g.render(); g.renderer.getContext().finish(); rend.push(performance.now() - t); }
        upd.sort((a, b) => a - b);
        rend.sort((a, b) => a - b);
        const info = g.renderer.info.render;
        return { updateMsMedian: upd[20].toFixed(2), updateMsP95: upd[37].toFixed(2), renderMsMedianSwiftShader: rend[3].toFixed(0), triangles: info.triangles, drawCalls: info.calls, buildings: g.world.regions[0] ? g.world.regions[0].stats.buildings : 0, terrainChunks: g.world.terrain.stats.chunks };
      }, place);
      record(`Performance sample: ${name}`, true, r);
      await shot(`p-${name.replace(/\W+/g, '_')}`, 4);
    }
  }
} catch (e) {
  record('harness', false, { error: e.message });
  try { await page.screenshot({ path: `${out}/failure.png`, timeout: 60000 }); } catch { /* ignore */ }
} finally {
  writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
  writeFileSync(`${out}/console.log`, logs.join('\n'));
  const errs = logs.filter((l) => /\[(error|pageerror)\]/.test(l));
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed; console errors: ${errs.length}`);
  console.log(errs.slice(0, 15).join('\n'));
  await browser.close();
}
