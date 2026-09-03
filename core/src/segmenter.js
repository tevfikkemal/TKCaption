'use strict';

/**
 * Kelime zaman damgalarindan altyazi bloklari uretir.
 * Burasi aracin rakiplerinden ayrildigi yer: Whisper'in ham segmentleri
 * cok uzun ve cumle ortasindan kesiyor; biz Turkce'ye ozgu kurallarla boluyoruz.
 */

// Onceki kelimeye baglanir - satir basinda YALNIZ birakilamaz
const CLITICS = new Set([
  'de', 'da', 'ki', 'mi', 'mı', 'mu', 'mü',
  'mısın', 'misin', 'musun', 'müsün', 'mıyım', 'miyim', 'muyum', 'müyüm',
  'mıydı', 'miydi', 'muydu', 'müydü', 'mıdır', 'midir', 'mudur', 'müdür'
]);

// Kendinden ONCEKI kelimeye baglanan son cekim edatlari - onlerinden bolunmez
const POSTPOSITIONS = new Set([
  'ile', 'için', 'gibi', 'kadar', 'göre', 'üzere', 'rağmen', 'dolayı', 'karşı',
  'beri', 'doğru', 'sonra', 'önce', 'başka', 'ötürü', 'itibaren', 'yana', 'hakkında'
]);

// Yan cumle baslatir - onlerinden bolmek DOGRU tercih
const CONJUNCTIONS = new Set([
  've', 'veya', 'ya', 'ama', 'fakat', 'ancak', 'çünkü', 'yoksa', 'ise', 'oysa',
  'oysaki', 'hem', 'ne', 'lakin', 'dolayısıyla', 'ayrıca', 'üstelik', 'yani',
  'böylece', 'ardından', 'eğer', 'şayet', 'nitekim', 'halbuki', 'meğer', 'madem'
]);

// Kendinden SONRAKI kelimeyi niteler - arkalarindan bolunmez ("bu | özelliği" olmaz)
const DETERMINERS = new Set([
  'bu', 'şu', 'o', 'bir', 'her', 'hiç', 'bazı', 'birçok', 'tüm', 'bütün',
  'birkaç', 'hangi', 'çok', 'az', 'en', 'daha', 'pek', 'böyle', 'şöyle',
  'öyle', 'aynı', 'diğer', 'kendi', 'hem', 'ne'
]);

const SENTENCE_END = /[.!?…]["')\]]?$/;
const CLAUSE_END = /[,;:]["')\]]?$/;
const STARTS_UPPER = /^["'(\[]?[\p{Lu}]/u;

/**
 * Bolme noktasini yasaklayan ortak kurallar.
 * @returns {boolean} true ise bu noktadan BOLUNEMEZ
 */
function forbiddenBreak(prev, next) {
  // Cumle sinirinda bolmek HER ZAMAN serbesttir. Bu kontrol once gelmeli:
  // "ne" bir baglactir ama "ne?" cumle sonudur - kelimeye bakip yasaklarsak
  // iki cumleyi ayni satira sikistiririz.
  if (SENTENCE_END.test(prev.text)) return false;

  const nx = norm(next.text);
  const pv = norm(prev.text);
  if (CLITICS.has(nx)) return true;        // "geldi | de"
  if (POSTPOSITIONS.has(nx)) return true;  // "açıklamaya | göre"
  if (DETERMINERS.has(pv)) return true;    // "bu | özelliği"
  return false;
}

/** Ozel isim zinciri mi? ("Adobe Premiere Pro" ortadan bolunmesin) */
function properNounChain(prev, next) {
  return !SENTENCE_END.test(prev.text) &&
         STARTS_UPPER.test(prev.text) &&
         STARTS_UPPER.test(next.text);
}

function norm(w) {
  return String(w).toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .replace(/i̇/g, 'i');
}

const len = (s) => s.length;
const joinText = (ws) => ws.map(w => w.text).join(' ');

/* ---------------------------------------------------------------- */
/*  1. Asama: kelimeleri bloklara ayir                                */
/* ---------------------------------------------------------------- */

function blockCost(words, cfg) {
  const L = cfg.layout;
  const text = joinText(words);
  const dur = words[words.length - 1].end - words[0].start;
  return {
    chars: len(text),
    dur,
    cps: dur > 0 ? len(text) / dur : Infinity,
    overChars: len(text) > L.maxCharsPerLine * L.maxLines,
    overDur: dur > L.maxDurationSec,
    overCps: dur > 0 && len(text) / dur > L.maxCps
  };
}

function fits(words, cfg) {
  const c = blockCost(words, cfg);
  return !c.overChars && !c.overDur;
}

/** Bir kelime dizisi icin en iyi bolme noktasini bul (blok seviyesinde). */
function bestBlockSplit(words, cfg) {
  const L = cfg.layout;
  const maxBlockChars = L.maxCharsPerLine * L.maxLines;
  let best = -1;
  let bestScore = -Infinity;

  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i);
    const right = words.slice(i);
    const lc = len(joinText(left));
    const rc = len(joinText(right));
    if (lc > maxBlockChars) continue;                   // sol taraf zaten sigmiyor
    if (left.length < 2 && words.length > 3) continue;  // tek kelimelik blok yapma

    const prev = words[i - 1];
    const next = words[i];
    const nx = norm(next.text);
    if (forbiddenBreak(prev, next)) continue; // ek / edat / belirteç bagi kopmaz

    let score = 0;
    if (SENTENCE_END.test(prev.text)) score += 2000;
    else if (CLAUSE_END.test(prev.text)) score += 1000;
    if (CONJUNCTIONS.has(nx)) score += 700;
    if (properNounChain(prev, next)) score -= 600; // "Adobe | Premiere" bolme

    // Konusma duraklamasi bolme icin dogal nokta
    const pause = next.start - prev.end;
    score += Math.min(Math.max(pause, 0), 1.0) * 900;

    score -= Math.abs(lc - rc) * 0.4;

    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best < 0) best = Math.max(1, Math.ceil(words.length / 2)); // caresiz kalirsak ortadan
  return best;
}

function splitToBlocks(words, cfg) {
  const out = [];
  const stack = [words];
  const guard = words.length * 4 + 64;
  let n = 0;
  while (stack.length && n++ < guard) {
    const cur = stack.shift();
    if (!cur.length) continue;
    if (cur.length === 1 || fits(cur, cfg)) { out.push(cur); continue; }
    const i = bestBlockSplit(cur, cfg);
    stack.unshift(cur.slice(i));
    stack.unshift(cur.slice(0, i));
  }
  return out;
}

/* ---------------------------------------------------------------- */
/*  2. Asama: cumle sinirlarinda on-bol, kisa bloklari birlestir       */
/* ---------------------------------------------------------------- */

function bySentence(words) {
  const groups = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    if (SENTENCE_END.test(w.text)) { groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function mergeShort(blocks, cfg) {
  const L = cfg.layout;
  const maxChars = L.maxCharsPerLine * L.maxLines;
  const out = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (!prev) { out.push(b); continue; }
    const gap = b[0].start - prev[prev.length - 1].end;
    const merged = prev.concat(b);
    const c = blockCost(merged, cfg);
    const prevDur = prev[prev.length - 1].end - prev[0].start;
    const curDur = b[b.length - 1].end - b[0].start;

    // Iki taraftan biri asgari sureden kisaysa birlestirmeyi dene.
    // Ekranda 0.7 saniye kalan bir altyazi okunamaz; bunu duzeltmek icin
    // okuma hizi tavanini bir miktar esnetmeye degir (hizli konusmada
    // zaten hicbir blok 17 cps'in altina inemiyor).
    const fixesDuration = prevDur < L.minDurationSec || curDur < L.minDurationSec;
    const cpsLimit = fixesDuration ? L.maxCps * 1.3 : L.maxCps;

    if (fixesDuration && gap < 0.6 && c.chars <= maxChars &&
        c.dur <= L.maxDurationSec && c.cps <= cpsLimit) {
      out[out.length - 1] = merged;
    } else {
      out.push(b);
    }
  }
  return out;
}

/* ---------------------------------------------------------------- */
/*  3. Asama: blok metnini 1-2 satira bol (Turkce kurallariyla)        */
/* ---------------------------------------------------------------- */

function wrapLines(words, cfg) {
  const L = cfg.layout;
  const text = joinText(words);
  if (len(text) <= L.maxCharsPerLine || words.length < 2) return [text];

  let best = -1;
  let bestScore = -Infinity;
  for (let i = 1; i < words.length; i++) {
    const l1 = joinText(words.slice(0, i));
    const l2 = joinText(words.slice(i));
    if (len(l1) > L.maxCharsPerLine || len(l2) > L.maxCharsPerLine) continue;

    const prev = words[i - 1];
    const next = words[i];
    const nx = norm(next.text);
    if (forbiddenBreak(prev, next)) continue;  // "geldi | de", "bu | özelliği" olmaz
    // Yetim tek kelimelik satir birakma
    if ((i === 1 || i === words.length - 1) && words.length > 3) continue;

    let score = 0;
    if (SENTENCE_END.test(prev.text)) score += 1200;
    else if (CLAUSE_END.test(prev.text)) score += 1000;
    if (CONJUNCTIONS.has(nx)) score += 800;
    if (properNounChain(prev, next)) score -= 700; // ozel isim zinciri bolunmesin

    // Denge: satirlar birbirine yakin uzunlukta olsun
    const diff = Math.abs(len(l1) - len(l2));
    score -= diff * (1 - L.balanceTolerance) * 6;
    // Ters piramit: ust satir alt satirdan kisa olsun
    if (L.preferShorterFirstLine && len(l1) <= len(l2)) score += 120;

    if (score > bestScore) { bestScore = score; best = i; }
  }

  if (best < 0) {
    // Hicbir gecerli nokta yok: karakter bazinda zorla bol (nadiren olur)
    const cut = text.lastIndexOf(' ', L.maxCharsPerLine);
    return cut > 0 ? [text.slice(0, cut), text.slice(cut + 1)] : [text];
  }
  return [joinText(words.slice(0, best)), joinText(words.slice(best))];
}

/* ---------------------------------------------------------------- */
/*  4. Asama: zamanlama - asgari sure, bosluk, kare hizalama           */
/* ---------------------------------------------------------------- */

function applyTiming(blocks, cfg) {
  const L = cfg.layout;
  const frame = 1 / (L.fps || 25);
  const minGap = (L.gapFrames || 2) * frame;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const dur = b.end - b.start;

    // Hedef sure: hem asgari sureyi hem OKUMA HIZINI (cps) karsilasin.
    // Hizli konusmada blok metni kisa surede sigmaz; altyazinin ardindaki
    // duraklamaya tasmasi standart altyazi pratigidir.
    const chars = (b.text || '').replace(/\n/g, ' ').length;
    const cpsNeed = L.maxCps > 0 ? chars / L.maxCps : 0;
    const want = Math.min(Math.max(L.minDurationSec, cpsNeed), L.maxDurationSec);

    if (dur < want) {
      const need = want - dur;
      const next = blocks[i + 1];
      const room = next ? Math.max(0, (next.start - b.end) - minGap) : need;
      b.end += Math.min(need, room);
      const still = want - (b.end - b.start);
      if (still > 0) {
        // Geriye dogru uzatmak konusmanin oncesine tasar; sadece asgari
        // sureyi tutturmak icin yapilir, okuma hizi ugruna degil.
        const backWant = Math.min(still, Math.max(0, L.minDurationSec - (b.end - b.start)));
        if (backWant > 0) {
          const prev = blocks[i - 1];
          const back = prev ? Math.max(0, (b.start - prev.end) - minGap) : b.start;
          b.start -= Math.min(backWant, back);
        }
      }
    }
    // Cok uzunsa kis (okuma bittikten sonra ekranda asili kalmasin)
    if (b.end - b.start > L.maxDurationSec) b.end = b.start + L.maxDurationSec;
  }

  // Cakismalari coz + kare izgarasina otur
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const prev = blocks[i - 1];
    if (prev && b.start < prev.end + minGap) {
      const shift = prev.end + minGap;
      if (b.end - shift >= 0.3) b.start = shift;
      else prev.end = Math.max(prev.start + 0.3, b.start - minGap);
    }
    b.start = Math.max(0, Math.round(b.start / frame) * frame);
    b.end = Math.max(b.start + frame, Math.round(b.end / frame) * frame);
  }
  return blocks;
}

/* ---------------------------------------------------------------- */

function segment(words, cfg) {
  if (!words || !words.length) return [];

  let raw = [];
  for (const sentence of bySentence(words)) {
    raw = raw.concat(splitToBlocks(sentence, cfg));
  }
  raw = mergeShort(raw, cfg);

  const blocks = raw.map((ws) => {
    const lines = wrapLines(ws, cfg);
    const text = lines.join('\n');
    const start = ws[0].start;
    const end = ws[ws.length - 1].end;
    const dur = Math.max(end - start, 0.001);
    return {
      start,
      end,
      lines,
      text,
      words: ws,
      cps: text.replace(/\n/g, ' ').length / dur,
      confidence: ws.reduce((a, w) => a + (w.p == null ? 1 : w.p), 0) / ws.length
    };
  });

  applyTiming(blocks, cfg);
  // Zamanlama degistigi icin cps'i tazele
  for (const b of blocks) {
    b.cps = b.text.replace(/\n/g, ' ').length / Math.max(b.end - b.start, 0.001);
  }
  return blocks;
}

module.exports = {
  segment, wrapLines, splitToBlocks, applyTiming,
  CLITICS, POSTPOSITIONS, CONJUNCTIONS
};
