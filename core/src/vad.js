'use strict';

/**
 * Sessizlik tespiti ve zaman esleme.
 *
 * NEDEN KENDIMIZ YAPIYORUZ:
 * whisper.cpp'nin --vad'i sessizlikleri kesiyor ama zaman damgalarini
 * orijinal sese GERI ESLEMIYOR; sonuc olarak butun altyazilar bosluksuz,
 * bastan itibaren diziliyor (olculdu: core/test/vad-timing.test.js).
 * VAD'i tamamen kapatinca da whisper sessiz bolumlerde uydurma metin
 * uretiyor ("Altyazı M.K." gibi) ve bunlar filtreden kacabiliyor.
 *
 * Cozum: sessizligi BIZ kesiyoruz ve hangi parcanin orijinalde nereye
 * denk geldigini kendimiz tutuyoruz. Boylece:
 *   - zaman damgalari dogru kaliyor (esleme bizde)
 *   - sessizlik whisper'a hic ulasmadigi icin halusinasyon uretilmiyor
 *   - islenecek ses kisaldigi icin daha hizli
 */

const DEFAULTS = {
  frameMs: 20,          // enerji penceresi
  hopMs: 10,
  minSpeechMs: 200,     // bundan kisa "konusma" gurultudur
  minSilenceMs: 400,
  padMs: 400,           // konusmanin bas/sonundan kirpmamak icin pay
  energyRatio: 2.0,     // gurultu tabaninin kac kati konusma sayilir
  absoluteFloor: 0.0016, // mutlak alt sinir (~ -56 dBFS)

  /**
   * SADECE bundan uzun sessizlikler atilir.
   *
   * Amac mikro-kirpma degil: whisper'in uydurma metin urettigi UZUN sessiz
   * bolumleri elemek. Kisa duraklamayi tutmanin maliyeti yok, ama kesmenin
   * riski var — sessiz konusulan bir cumlenin basi kirpilabiliyor.
   * (Olculdu: 2.0 esikle gercek konusmanin ilk 0.88 sn'si kesiliyordu.)
   */
  minRemovableSilenceMs: 2000,

  // Blok baslangicini gercek konusmaya cekerken izin verilen azami kaydirma.
  // Emin olmadigimiz yerde altyaziyi oynatmaktansa oldugu gibi birakiyoruz.
  maxSnapShiftSec: 2.0
};

/** Kare basina RMS enerjisi */
function frameEnergies(samples, rate, frameMs, hopMs) {
  const frame = Math.max(1, Math.round(rate * frameMs / 1000));
  const hop = Math.max(1, Math.round(rate * hopMs / 1000));
  const count = Math.max(0, Math.floor((samples.length - frame) / hop) + 1);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const start = i * hop;
    let sum = 0;
    for (let j = 0; j < frame; j++) {
      const v = samples[start + j];
      sum += v * v;
    }
    out[i] = Math.sqrt(sum / frame);
  }
  return { energies: out, hop, frame };
}

/** Yuzdelik (gurultu tabanini bulmak icin) */
function percentile(arr, p) {
  if (!arr.length) return 0;
  const copy = Float32Array.from(arr);
  copy.sort();
  const idx = Math.min(copy.length - 1, Math.max(0, Math.floor(copy.length * p)));
  return copy[idx];
}

/**
 * Konusma bolgelerini bulur.
 * @returns {Array<{start:number,end:number}>} ORNEK cinsinden, birlestirilmis
 */
function detectSpeech(samples, rate, options) {
  const o = Object.assign({}, DEFAULTS, options || {});
  if (!samples.length) return [];

  const { energies, hop } = frameEnergies(samples, rate, o.frameMs, o.hopMs);
  if (!energies.length) return [{ start: 0, end: samples.length }];

  // Gurultu tabani: alt %20'nin medyani gibi davranan sade bir olcu
  const floor = percentile(energies, 0.2);
  const thresholdBase = Math.max(floor * o.energyRatio, o.absoluteFloor);
  // Cok yuksek esik konusmayi yer; tepe degerin altinda kalmasini garanti et
  const peak = percentile(energies, 0.99);
  const threshold = Math.min(thresholdBase, Math.max(peak * 0.35, o.absoluteFloor));

  // 1) Esigin ustundeki kareler
  const loud = new Uint8Array(energies.length);
  for (let i = 0; i < energies.length; i++) loud[i] = energies[i] >= threshold ? 1 : 0;

  // 2) Ham bolgeleri cikar
  const regions = [];
  let inRegion = false;
  let regionStart = 0;
  for (let i = 0; i < loud.length; i++) {
    if (loud[i] && !inRegion) { inRegion = true; regionStart = i; }
    else if (!loud[i] && inRegion) { inRegion = false; regions.push([regionStart, i]); }
  }
  if (inRegion) regions.push([regionStart, loud.length]);
  if (!regions.length) return [];

  const framesFor = (ms) => Math.max(1, Math.round(ms / o.hopMs));
  const minSilenceFrames = framesFor(o.minSilenceMs);
  const minSpeechFrames = framesFor(o.minSpeechMs);

  // 3) Kisa sessizliklerle ayrilmis bolgeleri birlestir
  const merged = [regions[0]];
  for (let i = 1; i < regions.length; i++) {
    const prev = merged[merged.length - 1];
    if (regions[i][0] - prev[1] <= minSilenceFrames) prev[1] = regions[i][1];
    else merged.push(regions[i]);
  }

  // 4) Cok kisa bolgeleri at, pay ekle, orneklere cevir
  const padFrames = framesFor(o.padMs);
  const out = [];
  for (const [a, b] of merged) {
    if (b - a < minSpeechFrames) continue;
    const s = Math.max(0, (a - padFrames) * hop);
    const e = Math.min(samples.length, (b + padFrames) * hop);
    const last = out[out.length - 1];
    if (last && s <= last.end) last.end = Math.max(last.end, e);   // pay sonrasi cakisma
    else out.push({ start: s, end: e });
  }
  if (!out.length) return out;

  /* 5) GUVENLIK ADIMI — yalnizca UZUN sessizlikleri at.
   *
   * Enerji esigi sessiz konusulan bolumleri yanlislikla sessizlik sayabilir.
   * Bu yuzden kisa araliklari geri birlestiriyoruz: ancak minRemovableSilence
   * suresini asan bosluklar gercekten atiliyor. Boylece en kotu durumda
   * "hic kirpmamis" oluruz — konusma kesmeyiz. */
  const minGap = Math.round(o.minRemovableSilenceMs / 1000 * rate);

  const safe = [out[0]];
  for (let i = 1; i < out.length; i++) {
    const prev = safe[safe.length - 1];
    if (out[i].start - prev.end < minGap) prev.end = out[i].end;   // bosluk kisa: koru
    else safe.push(out[i]);
  }
  // Bastaki ve sondaki kisa sessizlikler de korunur
  if (safe[0].start < minGap) safe[0].start = 0;
  const lastReg = safe[safe.length - 1];
  if (samples.length - lastReg.end < minGap) lastReg.end = samples.length;

  return safe;
}

/**
 * Konusma bolgelerini birlestirip kisaltilmis ses ve ESLEME TABLOSU uretir.
 *
 * Esleme tablosu olmadan kisaltma yapmak, whisper.cpp'nin dustugu hatanin
 * ta kendisidir: zaman damgalari kisaltilmis sese gore kalir ve altyazi
 * one kayar.
 */
function buildTrimmed(samples, regions) {
  if (!regions.length) {
    return { samples, map: [{ trimStart: 0, origStart: 0, length: samples.length }], trimmedAll: false };
  }
  let total = 0;
  for (const r of regions) total += r.end - r.start;

  const out = new Float32Array(total);
  const map = [];
  let pos = 0;
  for (const r of regions) {
    const len = r.end - r.start;
    out.set(samples.subarray(r.start, r.end), pos);
    map.push({ trimStart: pos, origStart: r.start, length: len });
    pos += len;
  }
  return { samples: out, map, trimmedAll: true };
}

/**
 * Kisaltilmis ses zamanini ORIJINAL zamana cevirir.
 * @param {Array} map buildTrimmed'den
 * @param {number} t saniye (kisaltilmis ses uzerinde)
 * @param {number} rate ornekleme hizi
 */
function toOriginalTime(map, t, rate) {
  const sample = t * rate;
  for (let i = 0; i < map.length; i++) {
    const m = map[i];
    if (sample < m.trimStart + m.length) {
      const offset = Math.max(0, sample - m.trimStart);
      return (m.origStart + offset) / rate;
    }
  }
  // Sinirin otesi: son parcanin sonuna sabitle
  const last = map[map.length - 1];
  return (last.origStart + last.length) / rate;
}

/** Kelime dizisinin zamanlarini orijinal sese geri esler. */
function remapWords(words, map, rate) {
  for (const w of words) {
    w.start = toOriginalTime(map, w.start, rate);
    w.end = toOriginalTime(map, w.end, rate);
    if (w.end < w.start) w.end = w.start + 0.06;
  }
  return words;
}

/**
 * Blok baslangiclarini GERCEK ses baslangicina hizalar.
 *
 * NEDEN: Whisper segment baslangicini erken verir. Olculdu (60 fps sekans):
 *   uretilen blok  0.16 sn
 *   gercek konusma 1.38 sn   -> 1.22 sn erken aciliyor
 * Bu sabit bir kayma degildir; her kayitta degisir, cunku whisper'in
 * segment sinirlari icerige gore oynar. Dolayisiyla sabit bir carpan ya da
 * offset ile duzeltilemez — sesin kendisine bakmak gerekir.
 *
 * Blok bir sessizligin icinde basliyorsa, sonraki konusma baslangicina
 * cekilir. Kaydirma maxShiftSec ile sinirlidir: emin olmadigimiz yerde
 * altyaziyi oynatmaktansa oldugu gibi birakmak daha guvenli.
 *
 * @returns {{moved:number, totalShift:number}}
 */
function snapBlocksToSpeech(blocks, samples, rate, options) {
  const o = Object.assign({}, DEFAULTS, options || {});
  const maxShift = (o.maxSnapShiftSec === undefined) ? 2.0 : o.maxSnapShiftSec;
  if (!blocks.length || !samples.length || maxShift <= 0) return { moved: 0, totalShift: 0 };

  // Pay VERMEDEN tespit: konusmanin gercek basladigi ani istiyoruz
  const regions = detectSpeech(samples, rate, Object.assign({}, o, {
    padMs: 0,
    minSilenceMs: 200,
    minRemovableSilenceMs: 0
  }));
  if (!regions.length) return { moved: 0, totalShift: 0 };

  const onsets = regions.map((r) => r.start / rate);
  const ends = regions.map((r) => r.end / rate);

  /** t aninda konusma var mi? */
  function inSpeech(t) {
    for (let i = 0; i < onsets.length; i++) {
      if (t >= onsets[i] && t <= ends[i]) return true;
      if (onsets[i] > t) break;
    }
    return false;
  }

  /** t'den sonraki ilk konusma baslangici */
  function nextOnset(t) {
    for (let i = 0; i < onsets.length; i++) if (onsets[i] >= t) return onsets[i];
    return null;
  }

  let moved = 0;
  let totalShift = 0;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (inSpeech(b.start)) continue;          // zaten konusmanin icinde

    const onset = nextOnset(b.start);
    if (onset === null) continue;

    const shift = onset - b.start;
    if (shift <= 0.05 || shift > maxShift) continue;   // ya onemsiz ya da supheli

    // Blogun sonunu asma; en az yarim saniye ekranda kalsin
    const yeniStart = Math.min(onset, b.end - 0.5);
    if (yeniStart <= b.start) continue;

    b.start = yeniStart;
    moved++;
    totalShift += shift;
  }

  return { moved, totalShift };
}

/** Ozet bilgi (gunluge yazmak icin) */
function summarize(regions, totalSamples, rate) {
  let speech = 0;
  for (const r of regions) speech += r.end - r.start;
  const totalSec = totalSamples / rate;
  const speechSec = speech / rate;
  return {
    regions: regions.length,
    totalSec,
    speechSec,
    removedSec: totalSec - speechSec,
    removedPct: totalSec > 0 ? (1 - speechSec / totalSec) * 100 : 0
  };
}

module.exports = {
  detectSpeech, buildTrimmed, toOriginalTime, remapWords,
  snapBlocksToSpeech, summarize, DEFAULTS
};
