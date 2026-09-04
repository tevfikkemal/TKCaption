'use strict';
/**
 * Kendi sessizlik tespitimizin birim testleri.
 * En kritik olan: ESLEME. Kisaltilmis ses zamanlari orijinale dogru
 * cevrilmezse whisper.cpp'nin dustugu hataya duseriz — altyazi one kayar.
 */
const vad = require('../src/vad.js');

const RATE = 16000;
let fail = 0;
function ok(cond, label, extra) {
  console.log((cond ? '  OK   ' : '  HATA ') + label);
  if (!cond) { if (extra) console.log('         ' + extra); fail++; }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

/** Belirtilen araliklarda "konusma" (gurultu), digerlerinde sessizlik uret */
function makeAudio(spans, totalSec) {
  const s = new Float32Array(Math.round(totalSec * RATE));
  for (const [a, b] of spans) {
    const from = Math.round(a * RATE);
    const to = Math.round(b * RATE);
    for (let i = from; i < to && i < s.length; i++) {
      // Konusmaya benzer degisken genlikli sinyal
      s[i] = (Math.random() * 2 - 1) * 0.25 * (0.6 + 0.4 * Math.sin(i / 900));
    }
  }
  return s;
}

console.log('=== KONUSMA BOLGESI TESPITI ===');
{
  const audio = makeAudio([[15, 35], [50, 70], [85, 105]], 120);
  const regions = vad.detectSpeech(audio, RATE);
  ok(regions.length === 3, '3 konusma bolgesi bulundu (bulunan: ' + regions.length + ')');
  if (regions.length === 3) {
    const toSec = (r) => [r.start / RATE, r.end / RATE];
    const [a, b, c] = regions.map(toSec);
    ok(near(a[0], 15, 0.6) && near(a[1], 35, 0.6),
       '1. bolge 15-35 sn  (' + a[0].toFixed(1) + '-' + a[1].toFixed(1) + ')');
    ok(near(b[0], 50, 0.6) && near(b[1], 70, 0.6),
       '2. bolge 50-70 sn  (' + b[0].toFixed(1) + '-' + b[1].toFixed(1) + ')');
    ok(near(c[0], 85, 0.6) && near(c[1], 105, 0.6),
       '3. bolge 85-105 sn (' + c[0].toFixed(1) + '-' + c[1].toFixed(1) + ')');
  }

  const sum = vad.summarize(regions, audio.length, RATE);
  ok(near(sum.removedSec, 60, 3),
     'atilan sessizlik ~60 sn (' + sum.removedSec.toFixed(1) + ' sn, %' + sum.removedPct.toFixed(0) + ')');
}

console.log('\n=== KISALTMA VE ESLEME (en kritik) ===');
{
  const audio = makeAudio([[15, 35], [50, 70], [85, 105]], 120);
  const regions = vad.detectSpeech(audio, RATE);
  const t = vad.buildTrimmed(audio, regions);

  const trimSec = t.samples.length / RATE;
  ok(near(trimSec, 61.5, 3), 'kisaltilmis ses ~60 sn (' + trimSec.toFixed(1) + ' sn)');

  // Kisaltilmis sesin basi -> orijinalde 1. bolgenin basi
  const t0 = vad.toOriginalTime(t.map, 0, RATE);
  ok(near(t0, 14.75, 0.6), 'kisaltilmis 0 sn -> orijinal ~14.75 sn (' + t0.toFixed(2) + ')');

  // 1. bolgenin ortasi
  const mid1 = vad.toOriginalTime(t.map, 10, RATE);
  ok(near(mid1, 24.75, 0.6), 'kisaltilmis 10 sn -> orijinal ~24.75 sn (' + mid1.toFixed(2) + ')');

  // 2. bolgeye gecis: 1. bolge ~20.5 sn surdu
  const into2 = vad.toOriginalTime(t.map, 21, RATE);
  ok(into2 > 48 && into2 < 53, 'kisaltilmis 21 sn -> 2. bolgeye dustu (' + into2.toFixed(2) + ')');

  // 3. bolge
  const into3 = vad.toOriginalTime(t.map, 45, RATE);
  ok(into3 > 84 && into3 < 92, 'kisaltilmis 45 sn -> 3. bolgeye dustu (' + into3.toFixed(2) + ')');

  // Monotonluk: esleme geriye gitmemeli
  let mono = true;
  let prev = -1;
  for (let x = 0; x < trimSec; x += 0.5) {
    const v = vad.toOriginalTime(t.map, x, RATE);
    if (v < prev - 0.001) { mono = false; break; }
    prev = v;
  }
  ok(mono, 'esleme monoton artiyor (zaman geri sarmiyor)');
}

console.log('\n=== KELIME ESLEME ===');
{
  const audio = makeAudio([[15, 35], [50, 70]], 90);
  const regions = vad.detectSpeech(audio, RATE);
  const t = vad.buildTrimmed(audio, regions);
  // Kisaltilmis ses uzerinde bulunmus gibi kelimeler
  const words = [
    { text: 'bir', start: 0.5, end: 1.0 },
    { text: 'iki', start: 10.0, end: 10.5 },
    { text: 'uc', start: 25.0, end: 25.5 }
  ];
  vad.remapWords(words, t.map, RATE);
  ok(words[0].start > 14 && words[0].start < 17,
     '1. kelime 1. bolgeye dustu (' + words[0].start.toFixed(2) + ' sn)');
  ok(words[2].start > 48 && words[2].start < 72,
     '3. kelime 2. bolgeye dustu (' + words[2].start.toFixed(2) + ' sn)');
  ok(words[0].start < words[1].start && words[1].start < words[2].start,
     'kelime sirasi korundu');
}

console.log('\n=== GUVENLIK: SADECE UZUN SESSIZLIK ATILIR ===');
{
  // Kisa duraklamalar (1 sn) korunmali — kesmenin riski var, tutmanin yok
  const audio = makeAudio([[0, 5], [6, 11], [12, 17]], 18);
  const regions = vad.detectSpeech(audio, RATE);
  ok(regions.length === 1,
     '1 sn duraklamalar birlestirildi, tek bolge (' + regions.length + ')');
  const sum = vad.summarize(regions, audio.length, RATE);
  ok(sum.removedSec < 2, 'neredeyse hic kirpma yok (' + sum.removedSec.toFixed(1) + ' sn)');
}
{
  // 5 sn sessizlik atilmali
  const audio = makeAudio([[0, 5], [10, 15]], 15);
  const regions = vad.detectSpeech(audio, RATE);
  ok(regions.length === 2, '5 sn sessizlik bolme sebebi (' + regions.length + ' bolge)');
}
{
  // Bastaki kisa sessizlik korunmali: sessiz konusulan giris kesilmesin
  const audio = makeAudio([[1, 10]], 12);
  const regions = vad.detectSpeech(audio, RATE);
  ok(regions.length === 1 && regions[0].start === 0,
     'bastaki 1 sn sessizlik korundu (bas: ' + (regions[0].start / RATE).toFixed(2) + ' sn)');
}
{
  // Bastaki UZUN sessizlik atilmali
  const audio = makeAudio([[10, 20]], 22);
  const regions = vad.detectSpeech(audio, RATE);
  const start = regions.length ? regions[0].start / RATE : -1;
  ok(regions.length === 1 && start > 8 && start < 10.5,
     'bastaki 10 sn sessizlik atildi (bas: ' + start.toFixed(2) + ' sn)');
}

console.log('\n=== BLOK BASINI GERCEK KONUSMAYA CEKME ===');
{
  // Konusma 5. saniyede basliyor; blok yanlislikla 2. saniyede aciliyor
  const audio = makeAudio([[5, 12]], 15);
  const blocks = [{ start: 2.0, end: 7.0, lines: ['erken açılmış blok'] }];
  const r = vad.snapBlocksToSpeech(blocks, audio, RATE, { maxSnapShiftSec: 5 });
  ok(r.moved === 1, '1 blok tasindi (' + r.moved + ')');
  ok(near(blocks[0].start, 5.0, 0.4),
     'blok basi konusmaya cekildi: ' + blocks[0].start.toFixed(2) + ' sn (beklenen ~5.0)');
  ok(blocks[0].end === 7.0, 'blok sonu degismedi');
}
{
  // Zaten konusmanin icinde basliyorsa dokunulmamali
  const audio = makeAudio([[0, 10]], 12);
  const blocks = [{ start: 3.0, end: 5.0, lines: ['dogru blok'] }];
  const r = vad.snapBlocksToSpeech(blocks, audio, RATE);
  ok(r.moved === 0, 'konusma icindeki blok tasinmadi');
  ok(blocks[0].start === 3.0, 'baslangic korundu');
}
{
  // Kaydirma sinirini asiyorsa DOKUNMA — emin degilsek oynatma
  const audio = makeAudio([[10, 15]], 18);
  const blocks = [{ start: 1.0, end: 12.0, lines: ['cok uzak'] }];
  const r = vad.snapBlocksToSpeech(blocks, audio, RATE, { maxSnapShiftSec: 2.0 });
  ok(r.moved === 0, 'sinir asildigi icin tasinmadi (' + r.moved + ')');
  ok(blocks[0].start === 1.0, 'baslangic korundu');
}
{
  // Blogun sonunu asmamali
  const audio = makeAudio([[5, 12]], 15);
  const blocks = [{ start: 2.0, end: 5.2, lines: ['kisa blok'] }];
  vad.snapBlocksToSpeech(blocks, audio, RATE, { maxSnapShiftSec: 5 });
  ok(blocks[0].start <= blocks[0].end - 0.5,
     'blok en az 0.5 sn ekranda kaliyor (' +
     (blocks[0].end - blocks[0].start).toFixed(2) + ' sn)');
}
{
  // Sessiz seste hicbir sey yapilmamali
  const silent = new Float32Array(10 * RATE);
  const blocks = [{ start: 1.0, end: 3.0, lines: ['x'] }];
  const r = vad.snapBlocksToSpeech(blocks, silent, RATE);
  ok(r.moved === 0 && blocks[0].start === 1.0, 'sessiz seste bloklara dokunulmadi');
}

console.log('\n=== SINIR DURUMLARI ===');
{
  const silent = new Float32Array(10 * RATE);
  const r = vad.detectSpeech(silent, RATE);
  ok(r.length === 0, 'tamamen sessiz ses -> konusma bolgesi yok (' + r.length + ')');

  const t = vad.buildTrimmed(silent, r);
  ok(t.samples.length === silent.length, 'bolge yoksa ses aynen kalir (kirpma yapilmaz)');

  const full = makeAudio([[0, 10]], 10);
  const rf = vad.detectSpeech(full, RATE);
  ok(rf.length === 1, 'bastan sona konusma -> tek bolge (' + rf.length + ')');

  const tiny = makeAudio([[1, 1.05]], 5);   // 50 ms
  const rt = vad.detectSpeech(tiny, RATE);
  ok(rt.length === 0, 'cok kisa gurultu konusma sayilmadi (' + rt.length + ')');
}

console.log('\n================================');
console.log(fail === 0 ? 'TUM TESTLER GECTI' : fail + ' TEST BASARISIZ');
process.exit(fail === 0 ? 0 : 1);
