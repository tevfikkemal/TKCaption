#!/usr/bin/env node
'use strict';
/**
 * Uretilen SRT'nin altyazi kalitesini olcer.
 * "Iyi gorunuyor" yerine sayiyla konusmak icin.
 */
const fs = require('fs');
const srt = require('../src/srt.js');
const cfg = require('../src/config.js').load();

const file = process.argv[2];
if (!file) { console.error('kullanim: node core/tools/analyze.js <dosya.srt>'); process.exit(1); }

const blocks = srt.parseSrt(fs.readFileSync(file, 'utf8'));
const L = cfg.layout;

let cpsOver = 0, lineOver = 0, tooShort = 0, tooLong = 0, threeLines = 0, overlap = 0;
const cpsList = [];
const worst = [];

for (let i = 0; i < blocks.length; i++) {
  const b = blocks[i];
  const text = b.lines.join(' ');
  const dur = b.end - b.start;
  const cps = dur > 0 ? text.length / dur : Infinity;
  cpsList.push(cps);

  if (cps > L.maxCps + 0.5) { cpsOver++; worst.push({ i: i + 1, cps, dur, text }); }
  if (b.lines.some((l) => l.length > L.maxCharsPerLine)) lineOver++;
  if (b.lines.length > L.maxLines) threeLines++;
  if (dur < L.minDurationSec - 0.01) tooShort++;
  if (dur > L.maxDurationSec + 0.01) tooLong++;
  if (i > 0 && b.start < blocks[i - 1].end) overlap++;
}

cpsList.sort((a, b) => a - b);
const pct = (p) => cpsList[Math.min(cpsList.length - 1, Math.floor(cpsList.length * p))];
const avg = cpsList.reduce((a, b) => a + b, 0) / cpsList.length;
const totalDur = blocks.length ? blocks[blocks.length - 1].end - blocks[0].start : 0;
const chars = blocks.reduce((a, b) => a + b.lines.join(' ').length, 0);

console.log(`\n${file}`);
console.log(`  ${blocks.length} blok, ${chars} karakter, ${totalDur.toFixed(1)} sn kapsam`);
console.log(`  konusma yogunlugu: ${(chars / totalDur).toFixed(1)} karakter/saniye (kaynak metnin kendi hizi)`);
console.log('\n  CPS dagilimi:');
console.log(`    ortalama ${avg.toFixed(1)}   medyan ${pct(0.5).toFixed(1)}   %90 ${pct(0.9).toFixed(1)}   azami ${cpsList[cpsList.length - 1].toFixed(1)}`);
console.log('\n  Kural ihlalleri:');
console.log(`    CPS > ${L.maxCps}          : ${cpsOver} / ${blocks.length}`);
console.log(`    satir > ${L.maxCharsPerLine} karakter  : ${lineOver}`);
console.log(`    ${L.maxLines}'den fazla satir  : ${threeLines}`);
console.log(`    sure < ${L.minDurationSec} sn      : ${tooShort}`);
console.log(`    sure > ${L.maxDurationSec} sn        : ${tooLong}`);
console.log(`    cakisma            : ${overlap}`);

if (worst.length) {
  worst.sort((a, b) => b.cps - a.cps);
  console.log('\n  En kotu 5 blok:');
  for (const w of worst.slice(0, 5)) {
    console.log(`    #${w.i}  cps=${w.cps.toFixed(1)}  sure=${w.dur.toFixed(2)}sn  "${w.text.slice(0, 55)}"`);
  }
}

// Bosluk analizi: uzatacak yer var miydi?
let noRoom = 0, hadRoom = 0;
for (let i = 0; i < blocks.length - 1; i++) {
  const gap = blocks[i + 1].start - blocks[i].end;
  const text = blocks[i].lines.join(' ');
  const cps = text.length / (blocks[i].end - blocks[i].start);
  if (cps > L.maxCps + 0.5) { if (gap > 0.15) hadRoom++; else noRoom++; }
}
console.log(`\n  CPS asan bloklarda: ${noRoom} tanesinde uzatacak bosluk YOK, ${hadRoom} tanesinde vardi`);
console.log('');
