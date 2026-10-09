// Headless screenshot helper: node tests/shot.mjs "<url>" out.png [waitFrames] [timeoutMs]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [, , url, out, waitFrames = '120', timeout = '90000'] = process.argv;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
const t0 = Date.now();
try {
  await page.waitForFunction((n) => window.__error || (window.__frames || 0) >= n, +waitFrames, { timeout: +timeout, polling: 500 });
} catch (e) { logs.push('timeout waiting for frames'); }
const stats = await page.evaluate(() => { window.__pause = true; return { err: window.__error, stats: window.__stats }; });
const data = await page.evaluate(() => (window.__capture ? window.__capture() : null));
if (data) (await import('node:fs')).writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
else await page.screenshot({ path: out, timeout: 120000 });
console.log(JSON.stringify(stats, null, 1));
console.log('elapsed', (Date.now() - t0) / 1000, 's');
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
