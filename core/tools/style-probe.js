#!/usr/bin/env node
'use strict';
/**
 * Premiere TTML stil bilgisini iceri alirken UYGULUYOR MU?
 *
 * NEDEN BU ARAC: TTML standardi tts: oznitelikleriyle yazi tipi, renk,
 * kontur ve arka plan tasiyabiliyor. Bizim urettigimiz TTML zaten bir
 * stil blogu iceriyor (beyaz, sansSerif, %80). Ama Premiere'in ice alma
 * modulu bunlari okuyor mu, yoksa kendi varsayilan altyazi stilini mi
 * uyguluyor — bilmiyoruz. Tahminle ilerlemek yerine olcuyoruz.
 *
 * Uc dosya uretiyor. Uculde AYNI metin ve AYNI zamanlar var; yalnizca
 * stil farkli. Premiere'e alip bakinca:
 *   - Uculu FARKLI gorunuyorsa  -> stil okunuyor, gomulu stil yolu acik
 *   - Uculu AYNI gorunuyorsa    -> stil yok sayiliyor, baska yol gerekir
 *
 * Kullanim:
 *   node core/tools/style-probe.js [cikis-klasoru]
 */
const fs = require('fs');
const path = require('path');

const VARYANTLAR = [
  {
    ad: 'A-sari-konturlu',
    aciklama: 'sari metin, kalin siyah kontur',
    style:
      'tts:fontFamily="sansSerif" tts:fontSize="120%" tts:fontWeight="bold"\n' +
      '             tts:color="#FFD400" tts:textOutline="black 6%"\n' +
      '             tts:textAlign="center"'
  },
  {
    ad: 'B-kutulu',
    aciklama: 'beyaz metin, yari saydam siyah kutu',
    style:
      'tts:fontFamily="sansSerif" tts:fontSize="100%"\n' +
      '             tts:color="white" tts:backgroundColor="rgba(0,0,0,180)"\n' +
      '             tts:textAlign="center"'
  },
  {
    ad: 'C-buyuk-serif',
    aciklama: 'buyuk punto, serif, kirmizi',
    style:
      'tts:fontFamily="serif" tts:fontSize="180%"\n' +
      '             tts:color="#FF3B30" tts:textAlign="center"'
  }
];

/* Uc dosyada da ayni metin: fark yalnizca stilden gelsin. */
const BLOKLAR = [
  { start: '00:00:00.500', end: '00:00:03.000', text: 'Bu bir stil denemesidir.' },
  { start: '00:00:03.500', end: '00:00:06.000', text: 'Uc dosyada metin aynı,<br/>yalnızca stil farklı.' },
  { start: '00:00:06.500', end: '00:00:09.000', text: 'Farklı görünüyorsa stil okunuyor.' }
];

function ttmlUret(v) {
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<tt xmlns="http://www.w3.org/ns/ttml"');
  out.push('    xmlns:tts="http://www.w3.org/ns/ttml#styling"');
  out.push('    xmlns:ttp="http://www.w3.org/ns/ttml#parameter"');
  out.push('    ttp:frameRate="25" xml:lang="tr">');
  out.push('  <head>');
  out.push('    <styling>');
  out.push('      <style xml:id="tk" ' + v.style + '/>');
  out.push('    </styling>');
  out.push('    <layout>');
  out.push('      <region xml:id="alt" tts:origin="10% 80%" tts:extent="80% 20%"');
  out.push('              tts:displayAlign="after"/>');
  out.push('    </layout>');
  out.push('  </head>');
  out.push('  <body>');
  out.push('    <div>');
  for (const b of BLOKLAR) {
    out.push('      <p region="alt" style="tk" begin="' + b.start + '" end="' + b.end + '">' +
      b.text + '</p>');
  }
  out.push('    </div>');
  out.push('  </body>');
  out.push('</tt>');
  return out.join('\n') + '\n';
}

const hedef = process.argv[2] || path.join(process.cwd(), 'stil-denemesi');
fs.mkdirSync(hedef, { recursive: true });

console.log('\nTTML stil yoklamasi\n');
for (const v of VARYANTLAR) {
  const p = path.join(hedef, v.ad + '.ttml');
  fs.writeFileSync(p, ttmlUret(v));
  console.log('  ' + v.ad + '.ttml  — ' + v.aciklama);
}

console.log('\nKlasor: ' + hedef);
console.log('\nNe yapmali:');
console.log('  1. Uc dosyayi da Premiere\'e ice alin (Dosya > Iceri Al)');
console.log('  2. Her birini sirayla zaman cizgisine koyup Program monitorunde bakin');
console.log('');
console.log('  Uculu FARKLI gorunuyorsa -> stil okunuyor, altyazi stillerini');
console.log('  dogrudan dosyaya gomebiliriz.');
console.log('  Uculu AYNI gorunuyorsa   -> Premiere stili yok sayiyor, stili');
console.log('  baska yoldan uygulamak gerekir.');
console.log('');
