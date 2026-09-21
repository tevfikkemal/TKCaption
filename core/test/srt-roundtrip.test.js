'use strict';
/**
 * Panelde duzenlenen altyazinin kaydedilip yeniden okunmasi.
 *
 * NEDEN: panel SRT'yi parseSrt ile okuyor, kullanici metni degistiriyor,
 * toSrt ile geri yaziyor. parseSrt KAYDIRILMIS zamanlari okur (sekansin
 * baslangic zaman kodu icine islenmistir); toSrt yazarken offset'i tekrar
 * eklerse zaman IKI KAT kayar ve altyazi sekansta bambaska bir yere duser.
 * Bu sessiz bir hata olurdu — dosya gecerli gorunur, yeri yanlis olur.
 */
const srt = require('../src/srt.js');

let ok = 0, hata = 0;
function t(ad, f) {
  try { f(); console.log('  OK   ' + ad); ok++; }
  catch (e) { console.log('  HATA ' + ad + ' -> ' + e.message); hata++; }
}
function yakin(a, b, tol, m) {
  if (Math.abs(a - b) > (tol || 0.002)) {
    throw new Error((m || '') + ' beklenen=' + b + ' gelen=' + a);
  }
}

console.log('\n=== KAYDET-OKU TURU ===');
{
  // Sekans 01:00:00:00'dan basliyormus gibi: zamanlar 3600+ 
  const kaynak = [
    { start: 3618.0, end: 3621.4, lines: ['Birinci blok'] },
    { start: 3622.0, end: 3625.5, lines: ['İkinci blok', 'iki satır'] }
  ];

  t('offset 0 ile yazilinca zaman korunuyor', function () {
    const metin = srt.toSrt(kaynak, { output: { timecodeOffsetSec: 0 } });
    const geri = srt.parseSrt(metin);
    yakin(geri[0].start, 3618.0, 0.002, 'ilk başlangıç');
    yakin(geri[1].end, 3625.5, 0.002, 'son bitiş');
  });

  t('offset tekrar eklenirse zaman IKI KAT kayar', function () {
    // Bu testin amaci hatayi yakalamak degil, DAVRANISI dondurmak:
    // offset verilirse eklenir. Panel bu yuzden 0 gecirmek zorunda.
    const metin = srt.toSrt(kaynak, { output: { timecodeOffsetSec: 3600 } });
    const geri = srt.parseSrt(metin);
    yakin(geri[0].start, 7218.0, 0.002, 'çift kayma');
  });

  t('metin degisikligi zamani etkilemiyor', function () {
    const duzenli = kaynak.map(function (b) {
      return { start: b.start, end: b.end, lines: ['DÜZENLENDİ ' + b.lines[0]] };
    });
    const metin = srt.toSrt(duzenli, { output: { timecodeOffsetSec: 0 } });
    const geri = srt.parseSrt(metin);
    yakin(geri[0].start, 3618.0, 0.002, 'başlangıç');
    if (geri[0].lines[0].indexOf('DÜZENLENDİ') !== 0) {
      throw new Error('metin yazılmamış: ' + geri[0].lines[0]);
    }
  });

  t('bos blok yazilmiyor', function () {
    const bosluklu = [
      { start: 1, end: 2, lines: ['dolu'] },
      { start: 3, end: 4, lines: [''] },
      { start: 5, end: 6, lines: ['yine dolu'] }
    ];
    const geri = srt.parseSrt(srt.toSrt(bosluklu, { output: { timecodeOffsetSec: 0 } }));
    if (geri.length !== 2) throw new Error('blok sayısı: ' + geri.length);
  });

  t('Turkce karakterler bozulmuyor', function () {
    const tr = [{ start: 1, end: 2, lines: ['Şığüöç ĞÜŞİÖÇ — “tırnak”'] }];
    const geri = srt.parseSrt(srt.toSrt(tr, { output: { timecodeOffsetSec: 0 } }));
    if (geri[0].lines[0] !== 'Şığüöç ĞÜŞİÖÇ — “tırnak”') {
      throw new Error('bozuldu: ' + geri[0].lines[0]);
    }
  });
}

console.log('\n================================');
if (hata === 0) {
  console.log('TUM TESTLER GECTI (' + ok + ')');
} else {
  console.log(hata + ' TEST BASARISIZ');
  process.exit(1);
}
