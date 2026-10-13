'use strict';
/**
 * Kisa altyazi modu (Reels/TikTok tarzi): her blokta 1-3 kelime.
 */
const { segment } = require('../src/segmenter.js');
const cfgMod = require('../src/config.js');

let ok = 0, hata = 0;
function t(ad, f) {
  try { f(); console.log('  OK   ' + ad); ok++; }
  catch (e) { console.log('  HATA ' + ad + ' -> ' + e.message); hata++; }
}
function esit(a, b, m) { if (a !== b) throw new Error((m ? m + ': ' : '') + 'beklenen=' + b + ' gelen=' + a); }

function kelimeler(metin, aralik = 0.05) {
  let z = 0;
  return metin.split(/\s+/).map((p) => {
    const w = { text: p, start: z, end: z + 0.3, p: 0.9 };
    z += 0.3 + aralik;
    return w;
  });
}
function ayar(n) {
  const c = cfgMod.load();
  c.layout.maxWords = n;
  c.layout.fps = 25;
  return c;
}

console.log('\n=== KISA MOD ===');
const metin = 'Bugün sizlere çok önemli bir şey göstereceğim. Hazır mısınız?';

t('3 kelime: hicbir blok 3 kelimeyi gecmez (yasak bolme haric)', function () {
  const b = segment(kelimeler(metin), ayar(3));
  b.forEach((x) => { if (x.words.length > 4) throw new Error(x.text); });
  esit(b.every((x) => x.lines.length === 1), true, 'tek satir');
});

t('cumle sonunda blok biter', function () {
  const b = segment(kelimeler(metin), ayar(3));
  const i = b.findIndex((x) => /göstereceğim\.$/.test(x.text));
  if (i < 0) throw new Error('cumle sonu blok sonunda degil: ' + b.map((x) => x.text).join(' | '));
});

t('tek kelime modu', function () {
  const b = segment(kelimeler('Bunu herkes bilmeli'), ayar(1));
  esit(b.map((x) => x.text).join('|'), 'Bunu|herkes|bilmeli');
});

t('Turkce yasak bolme: "geldi de" ayrilmaz', function () {
  const b = segment(kelimeler('Ahmet geldi de gitti'), ayar(1));
  if (!b.some((x) => x.text === 'geldi de')) throw new Error(b.map((x) => x.text).join(' | '));
});

t('bloklar cakismaz ve kare izgarasinda', function () {
  const b = segment(kelimeler(metin, 0.02), ayar(2));
  for (let i = 0; i < b.length; i++) {
    if (b[i].end <= b[i].start) throw new Error('sure sifir: ' + b[i].text);
    if (i && b[i].start < b[i - 1].end - 1e-9) throw new Error('cakisma: ' + b[i].text);
    const kare = b[i].start * 25;
    if (Math.abs(kare - Math.round(kare)) > 1e-6) throw new Error('kare disi: ' + b[i].start);
  }
});

t('yakin bloklar arasinda ekran bos kalmaz', function () {
  const b = segment(kelimeler('bir iki üç dört beş altı', 0.05), ayar(1));
  for (let i = 1; i < b.length; i++) {
    if (b[i].start - b[i - 1].end > 0.09) throw new Error('bosluk ' + (b[i].start - b[i - 1].end));
  }
});

t('maxWords yoksa klasik mod (iki satira kadar)', function () {
  const c = cfgMod.load();
  const b = segment(kelimeler(metin), c);
  if (b[0].words.length < 4) throw new Error('klasik mod kisa bolmus');
});

console.log('\n================================');
if (hata === 0) console.log('TUM TESTLER GECTI (' + ok + ')');
else { console.log(hata + ' TEST BASARISIZ'); process.exit(1); }
