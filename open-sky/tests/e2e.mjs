// End-to-end browser test of the game (headless Chromium + SwiftShader).
// Usage: node tests/e2e.mjs <baseUrl> <outDir> [scenario]
// Scenarios exercise the real game loop through window.__game.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const [, , base = 'http://localhost:8123/', out = './shots', scenario = 'smoke'] = process.argv;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a);

async function shot(name) {
  // capture from the WebGL canvas right after a render (preserveDrawingBuffer is off)
  const data = await page.evaluate(() => {
    const g = window.__game;
    if (g && g.state === 'flight') g.render();
    return null;
  });
  void data;
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 });
  log('shot', name);
}
async function waitFor(fn, timeout = 120000, arg) {
  await page.waitForFunction(fn, arg, { timeout, polling: 500 });
}
async function frames(n) {
  const start = await page.evaluate(() => window.__game.fps.frames + (window.__frameCount || 0));
  void start;
  await page.evaluate((k) => new Promise((res) => { let c = 0; const f = () => { if (++c >= k) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
}

try {
  await page.goto(base);
  await waitFor(() => window.__ready || window.__error, 180000);
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  log('booted');
  await page.evaluate(() => document.querySelector('[data-tab="free"]').click());
  await frames(10);
  await shot('01-menu-globe');
  await page.evaluate(() => document.querySelector('[data-tab="home"]').click());

  if (scenario === 'smoke' || scenario === 'all') {
    await page.evaluate(() => window.__game.startFlight({ icao: 'KJFK', start: 'stand', mode: 'accessible', hour: 12, weather: 'fair' }));
    await waitFor(() => window.__game.state === 'flight', 180000);
    log('flight started');
    await frames(40);
    await shot('02-cockpit-stand');
    // auto start the engine via the real procedure
    await page.evaluate(() => window.__game.autoStartStop());
    await waitFor(() => window.__game.player.o.engineRunning > 0.5, 60000);
    log('engine running', await page.evaluate(() => Math.round(window.__game.player.o.rpm)));
    await page.evaluate(() => window.__game.rig.setView('chase', window.__game.player));
    await frames(30);
    await shot('03-chase-stand');
    // ATC: request taxi
    await page.evaluate(() => window.__game.atc.request('taxi'));
    await page.waitForTimeout(4000);
    const atc = await page.evaluate(() => window.__game.atc.log.map((m) => `${m.station}: ${m.text}`).join('\n'));
    log('ATC log:\n' + atc);
    await frames(20);
    await shot('04-taxi-route');
    const stats = await page.evaluate(() => ({ fps: window.__game.fps.value, info: window.__game.renderer.info.render, agents: window.__game.traffic.agents.length, region: window.__game.world.regions[0] && window.__game.world.regions[0].stats, terrain: window.__game.world.terrain.stats }));
    log('stats', JSON.stringify(stats));
  }
  writeFileSync(`${out}/console.log`, logs.join('\n'));
  log('console lines', logs.length);
  console.log(logs.filter((l) => /error|Error|warn/.test(l)).slice(0, 30).join('\n'));
} catch (e) {
  console.log('E2E FAILED:', e.message);
  console.log(logs.slice(-40).join('\n'));
  try { await page.screenshot({ path: `${out}/failure.png`, timeout: 60000 }); } catch { /* ignore */ }
  process.exitCode = 1;
} finally {
  await browser.close();
}
