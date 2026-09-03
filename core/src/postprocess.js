'use strict';

/**
 * Turkce metin son islemi.
 *
 * Whisper Turkce'de tutarli hatalar yapar:
 *  - Ozel isim eklerinde kesme isareti koymaz  ("Türkiyede" -> "Türkiye'de")
 *  - Sayilardan sonra eki ayirir                ("2000 de"   -> "2000'de")
 *  - Noktalama oncesi bosluk birakir
 *  - Ozel isimleri yanlis duyar (kullanici sozlugu bunu cozer)
 *
 * KASITLI OLARAK TUTUCU: kesme isareti sadece BILINEN ozel isimlere uygulanir.
 * Kor kural yazarsak "Türkiyeli" -> "Türkiye'li" gibi yanlislar uretiriz
 * (yapim eki kesme almaz; "Ahmetler" de almaz - cogul eki).
 */

// Cekim ekleri: kesme isareti ALIR. Yapim ekleri (li/lı/lu/lü, ler/lar, ci/cı) ALMAZ.
const CASE_SUFFIXES = [
  'nden', 'ndan', 'nin', 'nın', 'nun', 'nün', 'den', 'dan', 'ten', 'tan',
  'nde', 'nda', 'yle', 'yla', 'ile', 'nen', 'nan', 'in', 'ın', 'un', 'ün',
  'de', 'da', 'te', 'ta', 'ye', 'ya', 'yi', 'yı', 'yu', 'yü', 'na', 'ne',
  'yi', 'le', 'la', 'e', 'a', 'i', 'ı', 'u', 'ü', 'n'
].sort((a, b) => b.length - a.length); // uzun ek once denensin

// Yerlesik ozel isimler - kullanici sozlugune eklenerek genisletilir
const BUILTIN_PROPER = [
  'Türkiye', 'İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana',
  'Konya', 'Gaziantep', 'Trabzon', 'Diyarbakır', 'Samsun', 'Eskişehir',
  'Kayseri', 'Mersin', 'Erzurum', 'Malatya', 'Van', 'Sivas', 'Denizli',
  'Anadolu', 'Marmara', 'Ege', 'Akdeniz', 'Karadeniz', 'Trakya',
  'Avrupa', 'Asya', 'Amerika', 'Almanya', 'Fransa', 'İngiltere',
  'Adobe', 'Premiere', 'Photoshop', 'YouTube', 'Instagram', 'Google',
  'Atatürk', 'Ahmet', 'Mehmet', 'Ayşe', 'Fatma', 'Mustafa', 'Ali'
];

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Turkce'ye duyarli buyuk harf (i -> İ, ı -> I) */
function upperFirstTr(s) {
  if (!s) return s;
  const c = s[0];
  const up = c === 'i' ? 'İ' : c === 'ı' ? 'I' : c.toLocaleUpperCase('tr');
  return up + s.slice(1);
}

/**
 * Unicode harf siniri.
 * DIKKAT: JavaScript'te \b sinifi [A-Za-z0-9_]'e dayanir; "İ", "ş", "ğ" gibi
 * harfler kelime karakteri SAYILMAZ. Bu yuzden \bİstanbul hicbir zaman eslesmez.
 * Turkce metinde \b yerine bu lookaround'lari kullaniyoruz.
 */
const NOT_LETTER_BEFORE = "(?<![\\p{L}\\p{N}'’])";
const NOT_LETTER_AFTER = '(?![\\p{L}\\p{N}])';

/** Ozel isimlere cekim eki kesme isareti ekle: "Türkiyede" -> "Türkiye'de" */
function applyApostrophes(text, properNouns) {
  let out = text;
  const seen = new Set();
  for (const noun of properNouns) {
    if (!noun || noun.length < 3 || seen.has(noun)) continue;
    seen.add(noun);
    // Kisa isimlerde tek harfli ek riskli ("Van" + "a" -> "vana" yanlis pozitifi)
    const minSfx = noun.length < 4 ? 2 : 1;
    const sfx = CASE_SUFFIXES.filter((s) => s.length >= minSfx).map(escapeRe).join('|');
    const n = escapeRe(noun);
    // Zaten kesme varsa dokunma: (?!['’])
    const re = new RegExp(`${NOT_LETTER_BEFORE}(${n})(?!['’])(${sfx})${NOT_LETTER_AFTER}`, 'gu');
    out = out.replace(re, "$1'$2");
  }
  return out;
}

/** Sayilardan sonraki ayri yazilmis eki bitistir: "2000 de" -> "2000'de" */
function fixNumberSuffixes(text) {
  const sfx = "de|da|te|ta|den|dan|ten|tan|ye|ya|nin|nın|in|ın|li|lı|lu|lü|e|a|i|ı|u|ü";
  return text
    .replace(new RegExp(`(?<![\\p{L}\\p{N}])(\\d+)\\s+(${sfx})${NOT_LETTER_AFTER}`, 'gu'), "$1'$2")
    .replace(new RegExp(`(?<![\\p{L}])(\\d+)(?!['’\\d])(de|da|den|dan|te|ta|ten|tan)${NOT_LETTER_AFTER}`, 'gu'), "$1'$2");
}

/** Tirnak ve tire normalizasyonu */
function normalizeQuotes(text) {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/\s*[-–]\s*$/g, '')      // satir sonundaki yalniz tire
    .replace(/^\s*[-–]\s*/, '- ');    // diyalog tiresi tek bicime
}

/** Noktalama ve bosluk temizligi */
function fixSpacing(text) {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.!?;:…])/g, '$1')        // noktalama oncesi bosluk
    .replace(/([,;:])(?=\S)/g, '$1 ')        // noktalama sonrasi bosluk
    .replace(/([.!?])(?=[\p{L}])/gu, '$1 ')
    .replace(/\.{4,}/g, '…')
    .replace(/\.\.\./g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cumle basi buyuk harf (Turkce i/İ kuralina uyarak).
 * "…" bilerek disarida: altyazida uc nokta cumle sonu degil, devam isaretidir
 * ("Bekle… geliyorum" tek cumledir, "Geliyorum" yapilmamali).
 */
function fixSentenceCase(text) {
  let out = upperFirstTr(text.replace(/^\s+/, ''));
  out = out.replace(/([.!?]\s+)(\p{Ll})/gu, (m, p, c) => p + upperFirstTr(c));
  return out;
}

/**
 * Kullanici sozlugunu uygula.
 * Bicim: ["Ahmet Yılmaz"]  ya da  [{from:"admet", to:"Ahmet"}]
 */
function applyDictionary(text, dictionary) {
  let out = text;
  const proper = [];
  for (const entry of dictionary || []) {
    if (typeof entry === 'string') { proper.push(entry); continue; }
    if (entry && entry.from && entry.to) {
      // \b yerine Unicode sinir: "şşş", "İzmir" gibi girdiler de eslesebilsin
      const re = new RegExp(
        `(?<![\\p{L}\\p{N}])${escapeRe(entry.from)}${NOT_LETTER_AFTER}`, 'giu');
      out = out.replace(re, entry.to);
      proper.push(entry.to);
    }
  }
  return { text: out, proper };
}

/** Tek bir metin parcasini isle */
function processText(text, cfg) {
  const T = (cfg && cfg.turkish) || {};
  if (!T.enabled) return text;
  let out = text;

  const dict = applyDictionary(out, T.dictionary);
  out = dict.text;

  if (T.normalizeQuotes !== false) out = normalizeQuotes(out);
  out = fixSpacing(out);
  if (T.fixNumbers !== false) out = fixNumberSuffixes(out);
  if (T.fixApostrophes !== false) {
    // Kullanici sozlugundeki isimler + yerlesik liste
    const proper = BUILTIN_PROPER.concat(dict.proper.filter(Boolean));
    out = applyApostrophes(out, proper);
  }
  out = fixSentenceCase(out);
  return out;
}

/**
 * Kelime dizisini isler. Kelime sayisi DEGISMEZ - zaman damgalari korunur.
 * Bu yuzden birlestir-isle-yeniden dagit yapiyoruz; bolunme sayisi
 * degisirse guvenli tarafta kalip orijinali koruruz.
 */
function processWords(words, cfg) {
  const T = (cfg && cfg.turkish) || {};
  if (!T.enabled || !words.length) return words;

  const joined = words.map((w) => w.text).join(' ');
  const processed = processText(joined, cfg);
  const parts = processed.split(/\s+/).filter(Boolean);

  if (parts.length === words.length) {
    return words.map((w, i) => Object.assign({}, w, { text: parts[i] }));
  }

  // Kelime sayisi kaydi (ör. "2000 de" -> "2000'de" birlesti).
  // Zaman damgasini bozmamak icin kelime bazinda tek tek isleriz.
  return words.map((w) => Object.assign({}, w, { text: processText(w.text, cfg) }));
}

module.exports = {
  processText, processWords, applyApostrophes, fixNumberSuffixes,
  fixSpacing, fixSentenceCase, normalizeQuotes, upperFirstTr, BUILTIN_PROPER
};
