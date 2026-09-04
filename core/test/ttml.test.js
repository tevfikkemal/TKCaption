'use strict';
/**
 * TTML yazici testleri.
 *
 * Bu bicimin varlik sebebi KARE HIZI: SRT onu tasimadigi icin Premiere
 * 30 fps varsayiyor ve 60 fps sekansta altyazi kayiyor. Dolayisiyla
 * en kritik test, kare hizinin dosyaya dogru yazilmasi.
 */
const ttml = require('../src/ttml.js');
const base = require('../src/config.js').load();

let fail = 0;
function ok(cond, label, extra) {
  console.log((cond ? '  OK   ' : '  HATA ') + label);
  if (!cond) { if (extra) console.log('         ' + extra); fail++; }
}

const blocks = [
  { start: 0.16, end: 2.6, lines: ['Evet Kemal abi geldin mi?'] },
  { start: 2.76, end: 4.08, lines: ['Bugün torna', 'atölyesindeyiz.'] },
  { start: 5.0, end: 7.0, lines: ['Test & <karakter> "kaçış"'] }
];

console.log('=== KARE HIZI (bu bicimin varlik sebebi) ===');
{
  const cfg = JSON.parse(JSON.stringify(base));
  cfg.layout.fps = 60;
  const x = ttml.toTtml(blocks, cfg);
  ok(x.indexOf('ttp:frameRate="60"') >= 0, '60 fps dosyaya yazildi');
  ok(x.indexOf('ttp:frameRateMultiplier="1 1"') >= 0, 'carpan 1 1 (NTSC degil)');
}
{
  const cfg = JSON.parse(JSON.stringify(base));
  cfg.layout.fps = 29.97;
  const x = ttml.toTtml(blocks, cfg);
  ok(x.indexOf('ttp:frameRate="30"') >= 0, '29.97 -> frameRate 30');
  ok(x.indexOf('ttp:frameRateMultiplier="1000 1001"') >= 0,
     '29.97 -> NTSC carpani 1000 1001');
}
{
  const cfg = JSON.parse(JSON.stringify(base));
  cfg.layout.fps = 59.94;
  const x = ttml.toTtml(blocks, cfg);
  ok(x.indexOf('ttp:frameRate="60"') >= 0 &&
     x.indexOf('ttp:frameRateMultiplier="1000 1001"') >= 0,
     '59.94 -> 60 + NTSC carpani');
}

console.log('\n=== ZAMAN BICIMI ===');
ok(ttml.formatTime(0) === '00:00:00.000', 'sifir');
ok(ttml.formatTime(3661.5) === '01:01:01.500', '3661.5 sn (' + ttml.formatTime(3661.5) + ')');
ok(ttml.formatTime(0.9999) === '00:00:01.000', 'yuvarlama tasmasi');

console.log('\n=== TIMECODE OFFSET ===');
{
  const cfg = JSON.parse(JSON.stringify(base));
  cfg.output.timecodeOffsetSec = 3600;
  const x = ttml.toTtml(blocks, cfg);
  ok(x.indexOf('begin="01:00:00.160"') >= 0,
     'sekans baslangic TC si uygulandi (01:00:00.160)');
}

console.log('\n=== XML KACISI (bozuk dosya uretmeyelim) ===');
{
  const x = ttml.toTtml(blocks, base);
  ok(x.indexOf('&amp;') >= 0, '& kacislandi');
  ok(x.indexOf('&lt;karakter&gt;') >= 0, '< > kacislandi');
  ok(x.indexOf('<karakter>') < 0, 'ham < > kalmadi');
}

console.log('\n=== SATIR SONU ===');
{
  const x = ttml.toTtml(blocks, base);
  ok(x.indexOf('Bugün torna<br/>atölyesindeyiz.') >= 0, 'iki satir <br/> ile birlesti');
}

console.log('\n=== GECERLI XML MI ===');
{
  const x = ttml.toTtml(blocks, base);
  ok(x.indexOf('<?xml version="1.0" encoding="utf-8"?>') === 0, 'XML bildirimi basta');
  ok(x.trim().slice(-5) === '</tt>', 'kok etiket kapandi');
  // Kaba denge kontrolu: <p ...> sayisi ile </p> sayisi
  const open = (x.match(/<p /g) || []).length;
  const close = (x.match(/<\/p>/g) || []).length;
  ok(open === close && open === 3, '3 <p> etiketi dengeli (' + open + '/' + close + ')');
}

console.log('\n================================');
console.log(fail === 0 ? 'TUM TESTLER GECTI' : fail + ' TEST BASARISIZ');
process.exit(fail === 0 ? 0 : 1);
