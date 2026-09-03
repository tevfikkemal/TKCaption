'use strict';
const srt = require('../src/srt.js');
const hal = require('../src/hallucination.js');
const cfg = require('../src/config.js').load();

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  HATA ') + msg); if (!cond) fail++; };

console.log('=== ZAMAN BICIMLENDIRME ===');
ok(srt.formatTime(0) === '00:00:00,000', 'sifir -> 00:00:00,000');
ok(srt.formatTime(3661.5) === '01:01:01,500', '3661.5sn -> 01:01:01,500  (' + srt.formatTime(3661.5) + ')');
ok(srt.formatTime(0.9999) === '00:00:01,000', 'yuvarlama tasmasi dogru (' + srt.formatTime(0.9999) + ')');
ok(srt.parseTime('01:01:01,500') === 3661.5, 'geri ayristirma');

console.log('\n=== PREMIERE TIMECODE -> SANIYE ===');
ok(Math.abs(srt.timecodeToSeconds('01:00:00:00', 25) - 3600) < 0.001,
   '01:00:00:00 @25fps = 3600sn (' + srt.timecodeToSeconds('01:00:00:00', 25).toFixed(3) + ')');
const df = srt.timecodeToSeconds('01:00:00;00', 29.97);
ok(Math.abs(df - 3600.0) < 0.05, '01:00:00;00 @29.97 DF = duvar saati 3600sn (' + df.toFixed(3) + ')');

console.log('\n=== TIMECODE OFFSET (kritik hata kaynagi) ===');
const blocks = [
  { start: 0, end: 2, lines: ['Merhaba arkadaşlar,', 'bugün altyazı yapacağız.'] },
  { start: 2.5, end: 5.25, lines: ['Adobe bunu Türkçe için eklemiyor.'] }
];
const noOff = srt.toSrt(blocks, cfg);
ok(noOff.includes('00:00:00,000 --> 00:00:02,000'), 'offset yokken 0dan basliyor');

const cfg2 = JSON.parse(JSON.stringify(cfg));
cfg2.output.timecodeOffsetSec = 3600; // sekans 01:00:00:00'dan basliyor
const withOff = srt.toSrt(blocks, cfg2);
ok(withOff.includes('01:00:00,000 --> 01:00:02,000'), 'offset varken 1 saat kaydi');

console.log('\n--- uretilen SRT ---');
console.log(withOff.split('\n').map(l => '    ' + l).join('\n'));

const round = srt.parseSrt(withOff);
ok(round.length === 2 && round[1].lines.length === 1, 'geri okundu: ' + round.length + ' blok');

console.log('\n=== HALUSINASYON FILTRESI ===');
const segs = [
  { text: ' Merhaba arkadaşlar, bugün önemli bir konudan bahsedeceğim.', offsets: { from: 0, to: 3500 } },
  { text: ' Altyazı M.K.', offsets: { from: 3500, to: 4200 } },
  { text: ' Bu araç tamamen ücretsiz.', offsets: { from: 4200, to: 6000 } },
  { text: ' Evet evet evet evet evet evet.', offsets: { from: 6000, to: 7000 } },
  { text: ' Teşekkür ederim.', offsets: { from: 7000, to: 8000 } },
  { text: ' Teşekkür ederim.', offsets: { from: 8000, to: 9000 } },
  { text: ' Teşekkür ederim.', offsets: { from: 9000, to: 10000 } },
  { text: ' Teşekkür ederim.', offsets: { from: 10000, to: 11000 } },
  { text: ' Abone olmayı unutmayın.', offsets: { from: 11000, to: 12000 } },
  { text: ' Sessizlik.', offsets: { from: 12000, to: 30000 } }
];
const res = hal.filterSegments(segs, cfg);
console.log('  ' + segs.length + ' segment -> ' + res.segments.length + ' kaldi, ' + res.removed.length + ' atildi');
for (const r of res.removed) console.log('    ATILDI: "' + r.text + '"  [' + r.reason + ']');
ok(!res.segments.some(s => /M\.K\./.test(s.text)), 'Altyazi M.K. temizlendi');
ok(!res.segments.some(s => /Abone/.test(s.text)), 'Abone olmayi unutmayin temizlendi');
ok(!res.segments.some(s => /Evet evet/.test(s.text)), 'ic-tekrar temizlendi');
ok(res.segments.filter(s => /Teşekkür/.test(s.text)).length <= 2, 'ardisik tekrar 2 ile sinirlandi');
ok(res.segments.some(s => /ücretsiz/.test(s.text)), 'gercek icerik korundu');

console.log('\n=== KELIME TEKRARI ===');
const w = ['bir', 'bir', 'bir', 'şey', 'oldu'].map((t, i) => ({ text: t, start: i, end: i + 0.4 }));
const dd = hal.dedupeWords(w);
ok(dd.length === 4, '5 kelime -> ' + dd.length + ' (3 tekrar 2ye indi, ikileme korundu): ' + dd.map(x => x.text).join(' '));

console.log('\n=== TURKCE IKILEME KORUNUYOR MU ===');
// "yavaş yavaş", "koşa koşa" gercek Turkce yapilar - tekrar filtresi bunlari yemesin
for (const phrase of ['yavaş yavaş gidiyordu', 'koşa koşa geldi', 'azar azar biriktirdi']) {
  const ws = phrase.split(' ').map((t, i) => ({ text: t, start: i * 0.4, end: i * 0.4 + 0.35 }));
  const kept = hal.dedupeWords(ws).map((x) => x.text).join(' ');
  ok(kept === phrase, 'ikileme bozulmadi: "' + kept + '"');
}

console.log('\n================================');
console.log(fail === 0 ? 'TUM TESTLER GECTI' : fail + ' TEST BASARISIZ');
process.exit(fail === 0 ? 0 : 1);
