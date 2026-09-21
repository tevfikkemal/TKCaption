'use strict';
/**
 * Autocut'in dayandigi VAD davranisi.
 *
 * NEDEN AYRI TEST: kesim, altyazi boru hattiyla AYNI VAD'i kullaniyor
 * ama farkli ayarlarla. Altyazida amac whisper'in uydurma metin urettigi
 * uzun sessizlikleri atmak (varsayilan esik 2 sn); kesimde amac
 * kullanicinin verdigi esikten uzun her sessizligi kaldirmak.
 *
 * Iki sey donduruluyor:
 *   1. Kullanicinin esigi GERCEKTEN geciyor mu — gecmezse panel bir ayar
 *      gosterip baska sey yapmis olur.
 *   2. Kenar payinin esige etkisi — pay sessizligi iki taraftan yiyor,
 *      yani efektif esik (esik + 2*pay). Bu davranis dogru ama gizli;
 *      testle sabitlenmezse ilerideki bir degisiklik sessizce bozabilir.
 */
const vad = require('../src/vad.js');

let ok = 0, hata = 0;
function t(ad, f) {
  try { f(); console.log('  OK   ' + ad); ok++; }
  catch (e) { console.log('  HATA ' + ad + ' -> ' + e.message); hata++; }
}
function esit(a, b, m) {
  if (a !== b) throw new Error((m ? m + ': ' : '') + 'beklenen=' + b + ' gelen=' + a);
}

const RATE = 16000;

/** Belirtilen araliklarda gurultu, geri kalani sessiz bir sinyal uretir */
function sinyal(toplamSn, konusmalar) {
  const s = new Float32Array(Math.floor(toplamSn * RATE));
  for (const [a, b] of konusmalar) {
    for (let i = Math.floor(a * RATE); i < Math.floor(b * RATE) && i < s.length; i++) {
      // Sabit tohum yerine deterministik desen: test her calismada ayni
      s[i] = ((i * 2654435761) % 1000) / 1000 - 0.5;
    }
  }
  return s;
}

/* ------------------------------------------------------------------ */

console.log('\n=== KULLANICI ESIGI GECIYOR MU ===');
{
  // 1 sn konusma, 1.2 sn sessizlik, 1 sn konusma
  const s = sinyal(3.2, [[0, 1], [2.2, 3.2]]);

  t('varsayilan esikte (2 sn) birlesiyor', function () {
    const r = vad.detectSpeech(s, RATE, { padMs: 0 });
    esit(r.length, 1, 'bölge sayısı');
  });

  t('esik 800 ms verilince ayriliyor', function () {
    const r = vad.detectSpeech(s, RATE, { minRemovableSilenceMs: 800, padMs: 0 });
    esit(r.length, 2, 'bölge sayısı');
  });

  t('esik 1500 ms verilince yine birlesiyor', function () {
    // 1.2 sn sessizlik 1.5 sn esigin altinda — kesilmemeli
    const r = vad.detectSpeech(s, RATE, { minRemovableSilenceMs: 1500, padMs: 0 });
    esit(r.length, 1, 'bölge sayısı');
  });
}

console.log('\n=== KENAR PAYININ ESIGE ETKISI ===');
{
  const s = sinyal(3.2, [[0, 1], [2.2, 3.2]]);

  // OLCULEN: pay sessizligi IKI taraftan yiyor. 1.2 sn sessizlik
  // pay=400 ms ile 0.4 sn'ye iniyor ve 800 ms esigin altinda kaliyor.
  t('pay 400 ms sessizligi esigin altina dusuruyor', function () {
    const r = vad.detectSpeech(s, RATE, { minRemovableSilenceMs: 800, padMs: 400 });
    esit(r.length, 1, 'bölge sayısı');
  });

  t('pay 0 iken ayni esik ayiriyor', function () {
    const r = vad.detectSpeech(s, RATE, { minRemovableSilenceMs: 800, padMs: 0 });
    esit(r.length, 2, 'bölge sayısı');
  });

  t('efektif esik = esik + 2*pay', function () {
    // 2.0 sn sessizlik, pay 300 ms -> efektif 1.4 sn kalir.
    // Esik 1.2 ise ayrilmali, 1.6 ise birlesmeli.
    const g = sinyal(4, [[0, 1], [3, 4]]);
    const ayrilir = vad.detectSpeech(g, RATE, { minRemovableSilenceMs: 1200, padMs: 300 });
    const birlesir = vad.detectSpeech(g, RATE, { minRemovableSilenceMs: 1600, padMs: 300 });
    esit(ayrilir.length, 2, 'eşik 1.2 sn');
    esit(birlesir.length, 1, 'eşik 1.6 sn');
  });
}

console.log('\n=== SESSIZ ARALIK HESABI ===');
{
  // Panel konusma bolgelerinin ARASINI sessizlik sayiyor; bu hesabin
  // dogrulugu kesimin nereye dusecegini belirliyor.
  const s = sinyal(5, [[0, 1], [2.5, 3], [4, 5]]);
  const r = vad.detectSpeech(s, RATE, { minRemovableSilenceMs: 800, padMs: 0 });

  t('uc konusma bolgesi bulunuyor', function () {
    esit(r.length, 3, 'bölge sayısı');
  });

  t('aralar dogru hesaplaniyor', function () {
    const aralar = [];
    let onceki = 0;
    for (const b of r) {
      const bas = b.start / RATE;
      if (bas - onceki > 0.01) aralar.push([onceki, bas]);
      onceki = b.end / RATE;
    }
    esit(aralar.length, 2, 'sessiz aralık sayısı');
    // Ilk ara ~1.0-2.5, ikincisi ~3.0-4.0
    const yakin = (a, b) => Math.abs(a - b) < 0.1;
    if (!yakin(aralar[0][0], 1.0) || !yakin(aralar[0][1], 2.5)) {
      throw new Error('ilk aralık yanlış: ' + JSON.stringify(aralar[0]));
    }
    if (!yakin(aralar[1][0], 3.0) || !yakin(aralar[1][1], 4.0)) {
      throw new Error('ikinci aralık yanlış: ' + JSON.stringify(aralar[1]));
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
