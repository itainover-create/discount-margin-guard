// QA hooks for the canvas inspector (threejs-game-skills contract):
//   window.__THREE_GAME_TEST_HOOKS__  = { setState, seed, setPausedForScreenshot, setReducedMotion, hideDebugUi, states }
//   window.__THREE_GAME_DIAGNOSTICS__ = live renderer counts for the render-budget check
// Installed only for automated browsers (navigator.webdriver) or with ?qa in the URL,
// so players never get them.
import { fleetEntry } from '../aircraft/fleet.js';

const D2R = Math.PI / 180;

// Named, reproducible scenes. Each one starts a real flight through the normal
// startFlight path, then places the camera; the sim runs a few seconds so
// engines, particles and streaming have settled before the freeze.
const STATES = {
  'jfk-runway-738': { spec: { icao: 'KJFK', start: 'runway', mode: 'accessible', hour: 15, weather: 'fair', aircraft: 1 }, view: 'chase', run: 2 },
  'hudson-a320': { spec: { icao: 'KJFK', start: 'air', mode: 'accessible', hour: 17.4, weather: 'scattered', aircraft: 2 }, place: { lat: 40.700, lon: -74.025, hdg: 18, altM: 420, kt: 210, flaps: 0, gearDown: false }, view: 'chase', run: 2 },
  'a320-cockpit-final': { spec: { icao: 'KJFK', start: 'air', mode: 'accessible', hour: 13, weather: 'fair', aircraft: 2 }, view: 'cockpit', run: 2 },
  'storm-cockpit': { spec: { icao: 'KJFK', start: 'air', mode: 'accessible', hour: 16, weather: 'storm', aircraft: 2 }, view: 'cockpit', run: 4 },
  'f22-manhattan': { spec: { icao: 'KJFK', start: 'air', mode: 'accessible', hour: 11, weather: 'fair', aircraft: 9 }, place: { lat: 40.735, lon: -74.02, hdg: 25, altM: 700, kt: 380, flaps: 0, gearDown: false }, view: 'chase', run: 2 },
  'engine-fire-738': { spec: { icao: 'KJFK', start: 'air', mode: 'accessible', hour: 14, weather: 'fair', aircraft: 1 }, damage: { part: 4, amount: 0.75 }, view: 'chase', run: 5 },
  'night-manhattan': { spec: { icao: 'KJFK', start: 'air', mode: 'accessible', hour: 21.5, weather: 'clear', aircraft: 3 }, place: { lat: 40.69, lon: -74.03, hdg: 30, altM: 600, kt: 230, flaps: 0, gearDown: false }, view: 'chase', run: 2 },
  'cruise-a350': { spec: { icao: 'KJFK', start: 'cruise', mode: 'accessible', hour: 15, weather: 'clear', aircraft: 6 }, view: 'chase', run: 3 },
};

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

function settled(world) {
  if (world.terrain && world.terrain.pending && world.terrain.pending.size) return false;
  for (const r of world.regions) {
    for (const t of r.tiles.values()) {
      if (t.state === 'new' || t.state === 'loading') return false;
      if (t.state === 'ready' && t.lod !== t.want) return false;
    }
  }
  return true;
}

export function installQaHooks(game) {
  let frozen = false;
  const diag = () => {
    if (!game.renderer) return null;
    const i = game.renderer.info;
    return {
      renderer: {
        calls: i.render.calls, triangles: i.render.triangles, points: i.render.points, lines: i.render.lines,
        geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : null,
        pixelRatio: game.renderer.getPixelRatio(), toneMapping: game.renderer.toneMapping, exposure: game.renderer.toneMappingExposure,
        shadowMap: game.renderer.shadowMap.enabled, postPasses: game.post ? game.post.passCount() : 0,
      },
      state: game.qaState || game.state,
      fps: Math.round(game.fps.value || 0),
      buildings: game.world ? game.world.regions.reduce((n, r) => n + (r.stats.buildings || 0), 0) : 0,
    };
  };
  Object.defineProperty(window, '__THREE_GAME_DIAGNOSTICS__', { get: diag, configurable: true });

  const booted = () => new Promise((resolve) => { const t = () => (window.__ready ? resolve() : setTimeout(t, 100)); t(); });

  async function setState(name) {
    await booted();
    if (name === 'menu') {
      if (game.state !== 'menu') game.showMenu();
      for (let i = 0; i < 20; i++) await frame();
      game.qaState = name;
      return { state: name };
    }
    const S = STATES[name];
    if (!S) throw new Error(`unknown state "${name}" (known: menu, ${Object.keys(STATES).join(', ')})`);
    game.debugHold = true;
    await game.startFlight(S.spec);
    if (game.state !== 'flight') throw new Error(`flight did not start for ${name}`);
    const p = game.player;
    if (S.place) {
      const xy = game.world.frame.toXY(S.place.lat, S.place.lon);
      const f = fleetEntry(S.spec.aircraft ?? 0);
      p.spawn({ x: xy.x, y: xy.y, hdgDeg: S.place.hdg, onGround: false, altM: S.place.altM, iasKt: S.place.kt, flaps: S.place.flaps, gearDown: S.place.gearDown, aircraft: f.id, engine: true });
      game.rig.first = true;
    }
    if (S.damage) game.core.damage(S.damage.part, S.damage.amount);
    game.rig.setView(S.view, p);
    // hands-off controller that holds the attitude roughly level
    const hold = (inp, g) => { const o = g.player.o; inp.pitch = Math.max(-0.3, Math.min(0.3, -(o.vu || 0) * 0.02)); inp.roll = Math.max(-0.4, Math.min(0.4, -(o.phi || 0) * 1.5)); };
    // stream the city around the start (bounded); rendering is the slow part on
    // software GPUs, so draw only now and then while tiles arrive
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const t0 = performance.now();
    let lastDraw = 0;
    while (performance.now() - t0 < 60000) {
      game.debugStep(1 / 30, 2, hold);
      await tick();
      if (performance.now() - lastDraw > 3000) { game.render(); lastDraw = performance.now(); }
      if (settled(game.world) && performance.now() - t0 > 1500) break;
    }
    // let the scene run for a moment (engines spool, particles, rain)
    const steps = Math.round((S.run || 2) * 30);
    for (let i = 0; i < steps; i += 3) { game.debugStep(1 / 30, 3, hold); await tick(); }
    for (let i = 0; i < 40 && !settled(game.world); i++) { game.debugStep(1 / 30, 1, hold); await tick(); }
    // the avionics boot card (brand + rights) clears a few seconds into a flight
    const boot = document.getElementById('hud-boot');
    for (let i = 0; i < 80 && boot && !boot.classList.contains('hidden'); i++) await new Promise((r) => setTimeout(r, 100));
    game.render();
    game.qaState = name;
    return { state: name };
  }

  window.__THREE_GAME_TEST_HOOKS__ = {
    states: ['menu', ...Object.keys(STATES)],
    setState,
    seed(n) { game.qaSeed = n; return { seed: n }; },
    setPausedForScreenshot(on) { frozen = !!on; game.qaFrozen = frozen; game.qaDrawn = false; if (game.state === 'flight') game.debugHold = true; return { paused: frozen }; },
    setReducedMotion(on) { game.reducedMotion = !!on; return { reducedMotion: !!on }; },
    hideDebugUi(on) { document.body.classList.toggle('qa-clean', !!on); return { hidden: !!on }; },
  };
  void D2R;
}
