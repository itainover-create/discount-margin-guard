// ORION GAMES brand: the gold "A" emblem (inlined SVG, so the intro can
// animate its parts), the wordmark and the game title.
export const GAME = { name: 'GLOBAL SKIES', sub: 'INFINITE HORIZON', version: 'v2.0' };
export const COMPANY = 'ORION GAMES';
export const SLOGAN = 'WHERE VISION BECOMES REALITY';
export const DEVELOPER = 'ALON NOVITARGER';
export const RIGHTS = `Developed by ${DEVELOPER}. All Rights Reserved.`;
export const COPYRIGHT = `© 2026 ${DEVELOPER}. All Rights Reserved.`;

let emblemText = null;
let instance = 0;

export async function loadEmblem() {
  if (!emblemText) emblemText = await (await fetch('assets/orion-emblem.svg')).text();
  return emblemText;
}

// Inline copy of the emblem with ids unique to this instance (several logos
// may be on screen; gradient references must not collide).
export function emblemSvg() {
  const n = ++instance;
  return emblemText
    .replace(/id="(og|orion)-/g, `id="$1${n}-`)
    .replace(/url\(#(og)-/g, `url(#$1${n}-`)
    .replace(/<svg /, `<svg data-n="${n}" class="emblem" `);
}

// Lockup: emblem, ORION, GAMES, divider star, slogan and (optionally) the signature.
export function lockup({ signature = false, slogan = true, cls = '' } = {}) {
  const el = document.createElement('div');
  el.className = `brand-lockup ${cls}`;
  el.innerHTML = `
    <div class="brand-emblem">${emblemSvg()}</div>
    <div class="brand-word">${'ORION'.split('').map((c) => `<span>${c}</span>`).join('')}</div>
    <div class="brand-games">GAMES</div>
    ${slogan ? `<div class="brand-rule"><span></span><i>✦</i><span></span></div><div class="brand-slogan">${SLOGAN}</div>` : ''}
    ${signature ? `<div class="brand-sig">Alon Novitarger</div><div class="brand-name">${DEVELOPER}</div>` : ''}`;
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
  el.innerHTML = `<div class="brand-emblem">${emblemSvg()}</div><div><div class="bb-word">ORION</div><div class="bb-games">GAMES</div></div>`;
  return el;
}
