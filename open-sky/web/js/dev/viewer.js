// Dev viewer: renders the world from a camera given in the URL, for visual
// checks and automated screenshots (sets window.__frames / window.__stats).
import * as THREE from 'three';
import { World } from '../world/world.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(num('fov', 60), innerWidth / innerHeight, 0.5, 400000);
const world = new World(renderer, { dataBase: '../data/', online: q.get('online') !== '0' });
window.__frames = 0;
(async () => {
  const s = document.getElementById('s');
  await world.init((m) => (s.textContent = m));
  await world.loadPlace({ icao: q.get('icao') || 'KJFK', lat: num('plat', undefined), lon: num('plon', undefined) }, (m) => (s.textContent = m));
  if (q.get('wx')) { const { PRESETS } = await import('../world/weather.js'); world.weather.set(PRESETS[q.get('wx')]); }
  const lat = num('lat', world.frame.lat0), lon = num('lon', world.frame.lon0);
  const p = world.frame.toXY(lat, lon);
  const alt = num('alt', 600), hdg = num('hdg', 0) * Math.PI / 180, pitch = num('pitch', -10) * Math.PI / 180;
  const camWorld = { x: p.x, y: p.y, z: alt };
  camera.position.set(p.x, alt, -p.y);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(pitch, -hdg, 0);
  const date = new Date(q.get('time') || '2026-06-21T16:00:00Z');
  let last = performance.now();
  window.__capture = () => { renderer.render(world.scene, camera); return renderer.domElement.toDataURL('image/png'); };
  const loop = () => {
    if (window.__pause) { requestAnimationFrame(loop); return; }
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    world.update(dt, camera, camWorld, date);
    renderer.render(world.scene, camera);
    window.__frames++;
    const info = renderer.info.render;
    window.__stats = { frames: window.__frames, tris: info.triangles, calls: info.calls, terrain: world.terrain.stats, region: world.regions[0] ? world.regions[0].stats : null, tp: world.terrainProvider.stats, packsMB: world.packs.bytesLoaded / 1e6 };
    s.textContent = `${world.status.place}\n${world.status.terrain}\nframes ${window.__frames} tris ${info.triangles} calls ${info.calls}`;
    requestAnimationFrame(loop);
  };
  loop();
})().catch((e) => { document.getElementById('s').textContent = 'ERROR ' + e.stack; window.__error = String(e.stack); console.error(e); });
