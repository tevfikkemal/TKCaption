#!/usr/bin/env node
'use strict';
/**
 * Altyazi zamanlamasi sesle ortusuyor mu?
 *
 * "Altyazi sesten once/sonra cikiyor" sikayetini goz yerine SAYIYLA
 * degerlendirir: her altyazi blogunun basladigi anda seste gercekten
 * konusma var mi, ve konusma baslangiclari ile blok baslangiclari
 * arasinda SISTEMATIK bir kayma var mi?
 *
 * Kullanim: node core/tools/sync-check.js <ses.wav|video> <altyazi.srt>
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const audio = require('../src/audio.js');
const vad = require('../src/vad.js');
const srtMod = require('../src/srt.js');

function loadAudio(input) {
  const ext = path.extname(input).toLowerCase();
  if (ext === '.wav' || ext === '.wave') return audio.decodeWav(input);

  const hints = [
    'ffmpeg',
    'C:\\Program Files\\Topaz Labs LLC\\Topaz Video AI\\ffmpeg.exe'
  ];
  let ff = null;
  for (const h of hints) {
    try {
      if (spawnSync(h, ['-version'], { stdio: 'ignore', timeout: 15000 }).status === 0) { ff = h; break; }
    } catch (_) {}
  }
  if (!ff) throw new Error('ffmpeg bulunamadi (WAV disi girdi icin gerekli)');
  const tmp = path.join(require('os').tmpdir(), 'synccheck-' + process.pid + '.wav');
  execFileSync(ff, ['-y', '-i', input, '-vn', '-ar', '16000', '-ac', '1',
    '-c:a', 'pcm_s16le', tmp], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 900000 });
  const d = audio.decodeWav(tmp);
  try { fs.unlinkSync(tmp); } catch (_) {}
  return d;
}

const [, , mediaPath, srtPath] = process.argv;
if (!mediaPath || !srtPath) {
  console.error('kullanim: node core/tools/sync-check.js <ses|video> <altyazi.srt>');
  process.exit(2);
}

const d = loadAudio(mediaPath);
let samples = d.samples;
let rate = d.sampleRate;
if (rate !== 16000) { samples = audio.resample(samples, rate, 16000); rate = 16000; }

const blocks = srtMod.parseSrt(fs.readFileSync(srtPath, 'utf8'));
if (!blocks.length) { console.error('SRT bos'); process.exit(1); }

console.log('\n' + path.basename(srtPath));
console.log(`  ses ${(samples.length / rate).toFixed(1)} sn   ${blocks.length} altyazi blogu`);
console.log(`  altyazi kapsami ${blocks[0].start.toFixed(1)} - ${blocks[blocks.length - 1].end.toFixed(1)} sn\n`);

/* --- 1. Her blogun BASLADIGI anda seste konusma var mi? --- */
const win = Math.round(0.15 * rate);   // 150 ms pencere
function rmsAt(sec) {
  const c = Math.round(sec * rate);
  const a = Math.max(0, c - win);
  const b = Math.min(samples.length, c + win);
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / (b - a));
}

let all = 0;
for (let i = 0; i < samples.length; i += 160) all += samples[i] * samples[i];
const globalRms = Math.sqrt(all / Math.ceil(samples.length / 160));
const speechThreshold = globalRms * 0.35;

let sessizBaslangic = 0;
for (const b of blocks) if (rmsAt(b.start) < speechThreshold) sessizBaslangic++;
console.log(`  blok basinda ses YOK olan: ${sessizBaslangic} / ${blocks.length}` +
  (sessizBaslangic > blocks.length * 0.3 ? '   <-- SUPHELI' : ''));

/* --- 2. Konusma baslangiclari ile blok baslangiclari arasindaki kayma --- */
const regions = vad.detectSpeech(samples, rate, { minRemovableSilenceMs: 700, padMs: 0 });
console.log(`  seste ${regions.length} konusma baslangici bulundu`);

const onsets = regions.map((r) => r.start / rate);
const diffs = [];
for (const on of onsets) {
  // Bu konusma baslangicina en yakin blok baslangici
  let best = null;
  for (const b of blocks) {
    const dt = b.start - on;
    if (Math.abs(dt) < 3.0 && (best === null || Math.abs(dt) < Math.abs(best))) best = dt;
  }
  if (best !== null) diffs.push(best);
}

if (diffs.length >= 3) {
  diffs.sort((a, b) => a - b);
  const med = diffs[Math.floor(diffs.length / 2)];
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  console.log(`\n  ${diffs.length} eslesme uzerinden kayma:`);
  console.log(`    medyan  ${med >= 0 ? '+' : ''}${med.toFixed(2)} sn`);
  console.log(`    ortalama ${avg >= 0 ? '+' : ''}${avg.toFixed(2)} sn`);
  console.log(`    en erken ${diffs[0].toFixed(2)} sn   en gec ${diffs[diffs.length - 1].toFixed(2)} sn`);
  console.log('    (eksi = altyazi sesten ONCE cikiyor)');
  if (Math.abs(med) > 0.4) {
    console.log(`\n  >> SISTEMATIK KAYMA: altyazilar ${Math.abs(med).toFixed(2)} sn ` +
      (med < 0 ? 'ERKEN' : 'GEC') + ' cikiyor.');
  } else {
    console.log('\n  >> Sistematik kayma yok (medyan 0.4 sn icinde).');
  }
} else {
  console.log('\n  yeterli eslesme bulunamadi');
}

/* --- 3. Ilk ve son bloklar --- */
console.log('\n  ilk 3 blok:');
blocks.slice(0, 3).forEach((b) => {
  console.log(`    ${b.start.toFixed(2)}-${b.end.toFixed(2)}  ses=${rmsAt(b.start).toFixed(4)}` +
    `  "${b.lines.join(' ').slice(0, 40)}"`);
});
console.log('  son 2 blok:');
blocks.slice(-2).forEach((b) => {
  console.log(`    ${b.start.toFixed(2)}-${b.end.toFixed(2)}  ses=${rmsAt(b.start).toFixed(4)}` +
    `  "${b.lines.join(' ').slice(0, 40)}"`);
});
console.log('');
