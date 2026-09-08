'use strict';
/**
 * Altyazi bloklarinin ExtendScript'e saglam gecmesi.
 *
 * NEDEN AYRI TEST: blok listesi JSON olarak uretiliyor, sonra bir
 * ExtendScript KAYNAK KODU dizgisinin icine gomuluyor:
 *   trPlaceMogrtBatch("...yol...", "...JSON...", 0)
 * Yani metin iki kez kacisa giriyor — once JSON, sonra ES kaynak kodu.
 * Turkce altyazida tirnak, apostrof, ters egik cizgi ve satir sonu
 * fazlasiyla gecer; biri yanlis kacarsa ES tarafinda eval patlar ve
 * hata "blok listesi okunamadi" diye gorunur, sebebi gorunmez.
 *
 * Burada panel tarafindaki kacisi uygulayip ES tarafindaki eval'i taklit
 * ediyoruz; ucundan giren metin obur ucundan AYNI cikmali.
 */

/** panel/js/main.js icindeki esPath ile birebir ayni olmali */
function esPath(p) {
  return String(p).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * ExtendScript tarafini taklit eder: cagri dizgisinden ikinci argumani
 * cikarip once ES dizgi kacisini, sonra eval'i uygular.
 */
function esTarafindaCoz(cagri) {
  // ES kaynak kodundaki "..." dizgisini bul (kacisli tirnaklari atlayarak)
  const m = /trPlaceMogrtBatch\("(?:[^"\\]|\\.)*", "((?:[^"\\]|\\.)*)", \d+\)/.exec(cagri);
  if (!m) throw new Error('cagri dizgisi ayristirilamadi');
  // ES yorumlayicisi dizgi sabitini cozer: \\ -> \, \" -> "
  const cozulmus = m[1].replace(/\\(.)/g, (_, c) => (c === '\\' ? '\\' : c === '"' ? '"' : '\\' + c));
  return JSON.parse(cozulmus); // ES'te eval('(' + s + ')') ile ayni sonuc
}

let ok = 0, hata = 0;
function t(ad, f) {
  try { f(); console.log('  OK   ' + ad); ok++; }
  catch (e) { console.log('  HATA ' + ad + ' -> ' + e.message); hata++; }
}
function esit(a, b, m) {
  if (a !== b) throw new Error((m ? m + ': ' : '') + JSON.stringify(b) + ' beklendi, ' +
                               JSON.stringify(a) + ' geldi');
}

/** Bir blok listesini panel gibi paketleyip ES gibi cozer */
function turla(bloklar) {
  const json = JSON.stringify(bloklar);
  const cagri = 'trPlaceMogrtBatch("C:\\\\yol\\\\a.mogrt", "' + esPath(json) + '", 0)';
  return esTarafindaCoz(cagri);
}

console.log('\n=== ALTYAZI METNI GIDIS-DONUS ===');

const ornekler = [
  { ad: 'düz Türkçe', metin: 'Merhaba dünya, nasılsın?' },
  { ad: 'çift tırnak', metin: 'Bana "tamam" dedi.' },
  { ad: 'apostrof', metin: "Türkiye'de yaşıyorum." },
  { ad: 'ters eğik çizgi', metin: 'C:\\Users\\test yolu' },
  { ad: 'iki satır', metin: 'birinci satır\nikinci satır' },
  { ad: 'tırnak + satır sonu', metin: '"Alıntı"\nikinci "satır"' },
  { ad: 'tüm Türkçe harfler', metin: 'ğüşiöçĞÜŞİÖÇ' },
  { ad: 'kesme ve tırnak birlikte', metin: 'Ali\'nin "arabası" bozuldu' },
  { ad: 'boş metin', metin: '' }
];

for (const o of ornekler) {
  t(o.ad, function () {
    const geri = turla([{ start: 1.5, end: 3.2, text: o.metin }]);
    esit(geri.length, 1, 'blok sayısı');
    esit(geri[0].text, o.metin, 'metin');
    esit(geri[0].start, 1.5, 'başlangıç');
    esit(geri[0].end, 3.2, 'bitiş');
  });
}

console.log('\n=== GRUP HALINDE ===');
t('10 blok birlikte', function () {
  const giren = [];
  for (let i = 0; i < 10; i++) {
    giren.push({ start: i, end: i + 0.9, text: 'Blok "' + i + '"\nikinci satır' });
  }
  const geri = turla(giren);
  esit(geri.length, 10, 'blok sayısı');
  for (let i = 0; i < 10; i++) {
    esit(geri[i].text, giren[i].text, 'blok ' + i);
    esit(geri[i].start, giren[i].start, 'başlangıç ' + i);
  }
});

console.log('\n=== ZAMAN KODU DUSME ===');
t('zeroPoint çıkarılınca blok sıfırdan başlar', function () {
  // Sekans 01:00:00:00'dan basliyorsa SRT 3600+ yaziyor; MOGRT sekansin
  // basindan saniye istiyor. Fark dusulmezse her klip bir saat kayar.
  const zeroSec = 3600;
  const srtBaslangic = 3601.5;
  const sonuc = Math.max(0, srtBaslangic - zeroSec);
  esit(sonuc, 1.5, 'düşülmüş başlangıç');
});
t('zeroPoint 0 iken deger degismez', function () {
  esit(Math.max(0, 1.5 - 0), 1.5);
});
t('negatife dusmez', function () {
  esit(Math.max(0, 0.5 - 3600), 0);
});

console.log('\n================================');
if (hata === 0) {
  console.log('TUM TESTLER GECTI (' + ok + ')');
} else {
  console.log(hata + ' TEST BASARISIZ');
  process.exit(1);
}
