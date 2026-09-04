#!/usr/bin/env node
'use strict';
/**
 * Safe zone preset'lerini tek bir SVG'de yan yana cizer.
 *
 * Amac: degerleri gozle dogrulamak. Bu olculer YAKLASIKTIR — platformlarin
 * arayuzu degistikce kayar. Panelden ayarlanabilir olmasinin sebebi budur.
 */
const fs = require('fs');
const path = require('path');
const sz = require('../src/safezone.js');

const CARD_W = 200;
const GAP = 24;
const LABEL_H = 34;

function card(id, x) {
  const p = sz.PRESETS[id];
  const vertical = p.aspect === '9:16';
  const W = vertical ? 1080 : (p.aspect === '4:5' ? 1080 : 1920);
  const H = vertical ? 1920 : (p.aspect === '4:5' ? 1350 : 1080);

  const scale = CARD_W / W;
  const cw = CARD_W;
  const ch = Math.round(H * scale);

  const r = sz.toRect(id, W, H);
  const t = sz.toTitleRect(id, W, H);
  const s = (v) => (v * scale).toFixed(1);

  let g = `<g transform="translate(${x},${LABEL_H})">`;
  g += `<rect width="${cw}" height="${ch}" fill="#2b2b2b" stroke="#555"/>`;
  // Guvenli alan disi karartma
  g += `<path fill="rgba(0,0,0,0.45)" fill-rule="evenodd" d="M0,0 H${cw} V${ch} H0 Z ` +
       `M${s(r.x)},${s(r.y)} h${s(r.w)} v${s(r.h)} h-${s(r.w)} Z"/>`;
  g += `<rect x="${s(r.x)}" y="${s(r.y)}" width="${s(r.w)}" height="${s(r.h)}" ` +
       `fill="none" stroke="#fff" stroke-width="1.5"/>`;
  if (t) {
    g += `<rect x="${s(t.x)}" y="${s(t.y)}" width="${s(t.w)}" height="${s(t.h)}" ` +
         `fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1" stroke-dasharray="4 3"/>`;
  }
  // Arayuz elemanlari — cizgi tek basina "burasi neden yasak?" demiyor
  const els = sz.uiElements(id, W, H);
  for (const e of els) {
    if (e.type === 'text' || e.type === 'music') {
      const hh = Math.max(2, e.h * scale).toFixed(1);
      g += `<rect x="${s(e.x)}" y="${s(e.y)}" width="${s(e.w)}" height="${hh}" ` +
           `rx="1.5" fill="rgba(255,255,255,0.28)"/>`;
    } else if (e.type === 'box') {
      g += `<rect x="${s(e.x)}" y="${s(e.y)}" width="${s(e.w)}" height="${s(e.h)}" ` +
           `rx="3" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>`;
    } else {
      const rr = Math.max(1.5, e.size * scale / 2).toFixed(1);
      g += `<circle cx="${s(e.x)}" cy="${s(e.y)}" r="${rr}" ` +
           `fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.55)" stroke-width="1"/>`;
    }
  }
  g += `</g>`;
  // Baslik
  g += `<text x="${x}" y="14" fill="#e8e8e8" font-family="sans-serif" font-size="12" ` +
       `font-weight="600">${p.label}</text>`;
  g += `<text x="${x}" y="27" fill="#8a8a8a" font-family="sans-serif" font-size="10">` +
       `${W}×${H}  ·  güvenli ${r.w}×${r.h}</text>`;
  return { svg: g, height: ch };
}

const ids = Object.keys(sz.PRESETS);
let x = GAP;
let maxH = 0;
let body = '';
for (const id of ids) {
  const c = card(id, x);
  body += c.svg;
  maxH = Math.max(maxH, c.height);
  x += CARD_W + GAP;
}

const W = x;
const H = maxH + LABEL_H + GAP;
const svg =
`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#1e1e1e"/>
${body}
<text x="${GAP}" y="${H - 8}" fill="#8a8a8a" font-family="sans-serif" font-size="10">
TK Caption — güvenli alan kılavuzları (yaklaşık değerler, panelden ayarlanabilir)
</text>
</svg>`;

const out = process.argv[2] || path.join(__dirname, '..', '..', 'docs', 'safezone-preview.svg');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, svg, 'utf8');
console.log('yazildi: ' + out);
for (const id of ids) {
  const p = sz.PRESETS[id];
  const vertical = p.aspect === '9:16';
  const W2 = vertical ? 1080 : (p.aspect === '4:5' ? 1080 : 1920);
  const H2 = vertical ? 1920 : (p.aspect === '4:5' ? 1350 : 1080);
  const r = sz.toRect(id, W2, H2);
  console.log('  ' + p.label.padEnd(24) +
    'üst ' + String(r.y).padStart(4) +
    '  alt ' + String(H2 - r.y - r.h).padStart(4) +
    '  sol ' + String(r.x).padStart(3) +
    '  sağ ' + String(W2 - r.x - r.w).padStart(4) + '  px');
}
