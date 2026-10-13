// ORION GAMES brand: the gold "A" emblem (inlined SVG, so the intro can
// animate its parts), the wordmark and the game title.
export const GAME = { name: 'GLOBAL SKIES', sub: 'INFINITE HORIZON', version: 'v2.0' };
export const COMPANY = 'ORION GAMES';
export const SLOGAN = 'WHERE VISION BECOMES REALITY';
export const DEVELOPER = 'ALON NOVITARGER';
export const RIGHTS = `Developed by ${DEVELOPER}. All Rights Reserved.`;
export const COPYRIGHT = `© 2026 ${DEVELOPER}. All Rights Reserved.`;

// The mark, the ORION wordmark and the signature are the artwork itself:
// cut from the ORION poster (perspective-corrected, background keyed out) and
// from Alon Novitarger's signature, not redrawn.
const asset = (f) => new URL(`../../assets/${f}`, import.meta.url).href;
export const EMBLEM_URL = asset('orion-emblem.png');
export const WORDMARK_URL = asset('orion-wordmark.png');
export const SIGNATURE_URL = asset('signature.png');
export const DIVIDER_URL = asset('orion-divider.png');
// sparkle (start of the orbit) and the orbit ellipse, in emblem image fractions
export const EMBLEM_GEO = { sparkle: [0.128, 0.636], center: [0.483, 0.59], a: 0.494, b: 0.187, rot: -22.5, aspect: 820 / 703 };

const imgCache = new Map();
function loadImg(url) {
  if (!imgCache.has(url)) {
    imgCache.set(url, new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; }));
  }
  return imgCache.get(url);
}

// Preload the brand images (boot waits for this so the first frames are complete).
export async function loadEmblem() {
  await Promise.all([EMBLEM_URL, WORDMARK_URL, SIGNATURE_URL, DIVIDER_URL].map(loadImg));
}

// The emblem centred on a square canvas (textures: aircraft fins, displays).
let emblemSquare = null;
export function emblemImage() {
  if (!emblemSquare) {
    emblemSquare = loadImg(EMBLEM_URL).then((img) => {
      if (!img) return null;
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const k = Math.min(512 / img.width, 512 / img.height) * 0.94;
      const w = img.width * k, h = img.height * k;
      c.getContext('2d').drawImage(img, (512 - w) / 2, (512 - h) / 2, w, h);
      return c;
    });
  }
  return emblemSquare;
}

// Lockup: emblem, ORION, GAMES, divider star, slogan and (optionally) the signature.
export function lockup({ signature = false, slogan = true, cls = '' } = {}) {
  const el = document.createElement('div');
  el.className = `brand-lockup ${cls}`;
  el.innerHTML = `
    <div class="brand-emblem"><img class="emblem-img" src="${EMBLEM_URL}" alt="ORION emblem" draggable="false"></div>
    <div class="brand-word"><img src="${WORDMARK_URL}" alt="ORION" draggable="false"></div>
    <div class="brand-games">GAMES</div>
    ${slogan ? `<div class="brand-rule"><img src="${DIVIDER_URL}" alt="" draggable="false"></div><div class="brand-slogan">${SLOGAN}</div>` : ''}
    ${signature ? `<div class="brand-sig"><img src="${SIGNATURE_URL}" alt="Alon Novitarger" draggable="false"><i class="pen"></i></div><div class="brand-name">${DEVELOPER}</div>` : ''}`;
  return el;
}

export function gameTitle(cls = '') {
  const el = document.createElement('div');
  el.className = `game-title ${cls}`;
  el.innerHTML = `<div class="gt-main">${GAME.name}</div><div class="gt-sub">${GAME.sub}</div>`;
  return el;
}

// Small inline badge: emblem + ORION GAMES (menu header, HUD boot).
export function badge(cls = '') {
  const el = document.createElement('div');
  el.className = `brand-badge ${cls}`;
  el.innerHTML = `<div class="brand-emblem"><img class="emblem-img" src="${EMBLEM_URL}" alt="" draggable="false"></div><div><img class="bb-word" src="${WORDMARK_URL}" alt="ORION" draggable="false"><div class="bb-games">GAMES</div></div>`;
  return el;
}
