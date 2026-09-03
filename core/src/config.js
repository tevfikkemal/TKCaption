'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Varsayilan ayarlar. Hepsi config.json ile ezilebilir.
 * Degerler TRT / Netflix Turkce altyazi kilavuzlarindaki olculere dayaniyor.
 */
const DEFAULTS = {
  // --- Altyazi bicimi ---
  layout: {
    maxCharsPerLine: 42,      // Latin alfabesi standardi
    maxLines: 2,
    maxCps: 17,               // karakter/saniye — yetiskin okuma hizi (TR)
    minDurationSec: 0.833,    // 5/6 saniye — asgari goruntuleme suresi
    maxDurationSec: 7.0,
    gapFrames: 2,             // bloklar arasi asgari bosluk (kare)
    fps: 25,                  // SRT kare hizalamasi icin; Premiere'den gelir
    preferShorterFirstLine: true, // ters piramit: ust satir kisa olsun
    balanceTolerance: 0.35    // satir dengesi toleransi (0=kati, 1=umursama)
  },

  // --- Whisper calistirma ---
  whisper: {
    model: 'large-v3-turbo-q5_0',
    language: 'tr',
    threads: 0,               // 0 = cekirdek sayisinin yarisi
    maxContext: 0,            // 0 = pencereler arasi baglami kes → tekrar dongusunu onler
    entropyThold: 2.4,
    logprobThold: -1.0,
    noSpeechThold: 0.6,
    temperature: 0.0,
    suppressNonSpeech: true,
    useDtw: true,             // DTW hizalama — daha isabetli zaman damgasi

    /**
     * VAD VARSAYILAN OLARAK KAPALI — bilincli karar, eksiklik degil.
     *
     * whisper.cpp b4938'in --vad'i sessizlikleri kesip atiyor ama zaman
     * damgalarini orijinal sese GERI ESLEMIYOR. Sonuc: tum altyazilar
     * bosluksuz, bastan itibaren dumduz diziliyor.
     *
     * Olculdu (core/test/vad-timing.test.js): basina 30 sn sessizlik
     * eklenmis 118 sn'lik ses uzerinde
     *   VAD kapali -> ilk kelime  31.00 sn, son 110.14 sn  (dogru)
     *   VAD acik   -> ilk kelime   0.02 sn, son  70.57 sn  (yanlis)
     *
     * Sessizlikte olusan halusinasyonlari kendi filtremiz temizliyor
     * (hallucination.js). VAD duzelen bir yapida acilabilir.
     */
    useVad: false,
    vadThreshold: 0.5,

    // Sessizligi KENDIMIZ kirpiyoruz (core/src/vad.js). whisper.cpp'ninkinin
    // aksine esleme tablosu bizde kaldigi icin zaman damgalari dogru kaliyor.
    // Yan faydasi: sessizlik whisper'a hic ulasmadigindan halusinasyon
    // uretilmiyor ve islenecek ses kisaldigi icin daha hizli.
    trimSilence: true,
    beamSize: 5,
    initialPrompt: 'Merhaba, bugün sizlere önemli bir konudan bahsedeceğim. Evet, doğru duydunuz.'
    // ^ Duzgun noktalamali TR ornek cumle: Whisper'in noktalama uretmesini belirgin artirir.
  },

  // --- Sessizlik tespiti (core/src/vad.js) ---
  vad: {
    frameMs: 20,
    hopMs: 10,
    minSpeechMs: 200,      // bundan kisa "konusma" gurultudur
    minSilenceMs: 400,
    padMs: 400,            // konusmanin bas/sonunu kirpmamak icin pay
    energyRatio: 2.0,      // gurultu tabaninin kac kati konusma sayilir
    minRemovableSilenceMs: 2000,  // SADECE bundan uzun sessizlikler atilir
    absoluteFloor: 0.0016
  },

  // --- Halusinasyon filtresi ---
  hallucination: {
    enabled: true,
    maxRepeatCount: 2,        // ayni metin arka arkaya bu kadardan fazla tekrar ederse at
    minCharsPerSecond: 1.0,   // bunun altinda = supheli uzun/bos segment
    maxCharsPerSecond: 35,    // bunun ustunde = supheli sikisik segment
    dropLeadingTrailingNoise: true,
    blacklist: [              // Whisper'in TR'de sessizlikte urettigi bilinen cop
      'altyazı m.k.', 'altyazı m.k', 'abone olmayı unutmayın',
      'izlediğiniz için teşekkürler', 'altyazı için teşekkürler',
      'bu videoyu beğendiyseniz', 'kanalıma abone olun',
      'türkçe altyazı', 'altyazi', 'copyright', 'amara.org',
      'yorumlarda buluşmak üzere', 'altyazı ve çeviri'
    ]
  },

  // --- Turkce son islem ---
  turkish: {
    enabled: true,
    fixApostrophes: true,     // ozel isim eki: "Türkiyede" → "Türkiye'de"
    fixNumbers: true,
    normalizeQuotes: true,
    dictionary: []            // kullanici sozlugu: [{from:"...", to:"..."}] veya ["Isim"]
  },

  // --- Cikti ---
  output: {
    format: 'srt',
    encoding: 'utf8',
    bom: false,
    timecodeOffsetSec: 0      // sekans baslangic TC'si (Premiere'den gelir)
  }
};

function deepMerge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const k of Object.keys(over)) {
    out[k] = (k in base) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}

function load(configPath) {
  let cfg = JSON.parse(JSON.stringify(DEFAULTS));
  const candidates = configPath
    ? [configPath]
    : [path.join(process.cwd(), 'config.json'), path.join(__dirname, '..', '..', 'config.json')];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        cfg = deepMerge(cfg, JSON.parse(fs.readFileSync(p, 'utf8')));
        cfg._loadedFrom = p;
        break;
      }
    } catch (e) {
      throw new Error(`config.json okunamadi (${p}): ${e.message}`);
    }
  }
  return cfg;
}

module.exports = { DEFAULTS, load, deepMerge };
