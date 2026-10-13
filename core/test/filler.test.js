'use strict';
/**
 * Dolgu tespiti. Yanlis pozitif burada pahali: kesim gercek kelimeyi
 * yerse video bozulur. Testlerin cogu "kesmemesi gereken"i dogruluyor.
 */
const f = require('../src/filler.js');

let ok = 0, hata = 0;
function t(ad, fn) {
  try { fn(); console.log('  OK   ' + ad); ok++; }
  catch (e) { console.log('  HATA ' + ad + ' -> ' + e.message); hata++; }
}
function esit(a, b, m) { if (a !== b) throw new Error((m ? m + ': ' : '') + 'beklenen=' + b + ' gelen=' + a); }
const w = (text, start, end) => ({ text, start, end });

console.log('\n=== SES DOLGULARI ===');
t('ııı, eee, hmm yakalanir', function () {
  const ws = [w('Merhaba', 0, 0.5), w('ııı,', 0.6, 1.0), w('bugün', 1.1, 1.5), w('eee', 1.6, 2.0), w('tamam', 2.1, 2.5), w('hmm.', 2.6, 2.9)];
  const r = f.bul(ws, null, {});
  esit(r.length, 3);
  esit(r[0].tur, 'ses');
});
t('gercek kelimeler dolgu sayilmaz (e, ama, ile, hem, mi)', function () {
  const ws = ['ama', 'ile', 'hem', 'mi', 'eh!', 'evet', 'işte'].map((x, i) => w(x, i, i + 0.5));
  const r = f.bul(ws, null, {});
  // "eh" dolgu sayilir, digerleri sayilmaz; "işte" kelime listesi kapaliyken sayilmaz
  esit(r.map((x) => x.text).join(','), 'eh!');
});
t('kesim komsu kelimeye tasmaz', function () {
  const ws = [w('bir', 0, 0.5), w('ııı', 0.5, 0.9), w('iki', 0.9, 1.3)];
  const r = f.bul(ws, null, { pay: 0.1 });
  esit(r[0].start, 0.5); esit(r[0].end, 0.9);
});

console.log('\n=== KELIME DOLGULARI ===');
t('kapaliyken "yani" kesilmez', function () {
  const r = f.bul([w('yani', 0, 0.4)], null, {});
  esit(r.length, 0);
});
t('acilinca "yani", "şey" yakalanir; buyuk harf/noktalama farketmez', function () {
  const ws = [w('Yani,', 0, 0.4), w('bu', 0.5, 0.7), w('şey.', 0.8, 1.1)];
  const r = f.bul(ws, null, { kelimeler: ['yani', 'şey'] });
  esit(r.length, 2); esit(r[0].tur, 'kelime');
});
t('Turkce kucuk harf: "IŞTE" -> "işte"', function () {
  const r = f.bul([w('İşte', 0, 0.4)], null, { kelimeler: ['işte'] });
  esit(r.length, 1);
});

console.log('\n=== SESLI BOSLUK ===');
t('konusma bolgesinde kelimesiz 0.6 sn -> aday', function () {
  const ws = [w('bugün', 0.0, 0.5), w('geldim', 1.1, 1.6)];
  const r = f.bul(ws, [{ start: 0, end: 1.6 }], {});
  esit(r.length, 1); esit(r[0].tur, 'bosluk');
  esit(r[0].start, 0.5); esit(r[0].end, 1.1);
});
t('cok kisa bosluk (0.1 sn) aday degil', function () {
  const ws = [w('bugün', 0.0, 0.5), w('geldim', 0.6, 1.0)];
  esit(f.bul(ws, [{ start: 0, end: 1.0 }], {}).length, 0);
});
t('cok uzun bosluk (3 sn) aday degil — muhtemelen konusma', function () {
  const ws = [w('bugün', 0.0, 0.5), w('geldim', 3.5, 4.0)];
  esit(f.bul(ws, [{ start: 0, end: 4.0 }], {}).length, 0);
});
t('bolge kenarindaki kisa VAD payi aday degil', function () {
  const ws = [w('bugün', 0.3, 0.8)];
  esit(f.bul(ws, [{ start: 0.0, end: 0.8 }], {}).length, 0);
});
t('kapatilabilir', function () {
  const ws = [w('bugün', 0.0, 0.5), w('geldim', 1.1, 1.6)];
  esit(f.bul(ws, [{ start: 0, end: 1.6 }], { sesliBosluk: false }).length, 0);
});

console.log('\n=== BIRLESTIRME ===');
t('bitisik "ııı" kelimesi ve sesli bosluk tek aday olur', function () {
  const ws = [w('bir', 0, 0.4), w('ııı', 0.4, 0.7), w('iki', 1.3, 1.6)];
  const r = f.bul(ws, [{ start: 0, end: 1.6 }], {});
  esit(r.length, 1);
  esit(r[0].start, 0.4); esit(r[0].end, 1.3); esit(r[0].text, 'ııı');
});
t('sonuc zamana gore sirali', function () {
  const ws = [w('a', 0, 0.3), w('eee', 2, 2.4), w('b', 2.5, 2.8), w('ııı', 0.4, 0.8)];
  const r = f.bul(ws, null, {});
  esit(r[0].text, 'ııı');
});
t('baglam: oncesi ve sonrasi', function () {
  const ws = [w('bir', 0, 0.3), w('iki', 0.4, 0.6), w('ııı', 0.7, 1.0), w('üç', 1.1, 1.3)];
  const b = f.baglam(ws, { start: 0.7, end: 1.0 }, 2);
  esit(b.once, 'bir iki'); esit(b.sonra, 'üç');
});

console.log('\n================================');
if (hata === 0) console.log('TUM TESTLER GECTI (' + ok + ')');
else { console.log(hata + ' TEST BASARISIZ'); process.exit(1); }
