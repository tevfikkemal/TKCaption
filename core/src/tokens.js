'use strict';

/**
 * whisper.cpp --output-json-full ciktisini KELIME dizisine cevirir.
 *
 * Neden gerekli: Whisper'in BPE tokenizer'i Turkce'yi parcalar.
 *   "gelemeyeceğimi" → [" gele"]["mey"]["eceğ"]["imi"]
 * Token bazinda bolersek altyazi kelime ortasindan kesilir. Bosluk ile
 * baslamayan token'lari onceki kelimeye yapistirarak kelime sinirini geri kurariz.
 */

// <|...|>, [_BEG_], [_TT_123] gibi ozel token'lar metne girmemeli
const SPECIAL = /^\s*(<\|[^|]*\|>|\[_[A-Z]+_?[^\]]*\])\s*$/;

function isSpecial(t) { return !t || SPECIAL.test(t); }

/** whisper zaman birimi (1 = 10ms) → ms */
function dtwToMs(v) { return v * 10; }

function tokenTimes(tok, segFrom, segTo) {
  const off = tok.offsets || {};
  let from = Number.isFinite(off.from) ? off.from : segFrom;
  let to = Number.isFinite(off.to) ? off.to : segTo;
  // DTW zaman damgasi varsa tercih et — hizalamasi belirgin daha isabetli
  if (Number.isFinite(tok.t_dtw) && tok.t_dtw >= 0) {
    const d = dtwToMs(tok.t_dtw);
    if (d >= segFrom - 2000 && d <= segTo + 2000) from = d;
  }
  if (to < from) to = from;
  return { from, to };
}

/**
 * @returns {Array<{text,start,end,p,segIndex}>} start/end saniye cinsinden
 */
function toWords(json) {
  const segs = (json && json.transcription) || [];
  const words = [];

  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si];
    const sFrom = (seg.offsets && seg.offsets.from) || 0;
    const sTo = (seg.offsets && seg.offsets.to) || sFrom;
    const toks = seg.tokens;

    // Token yoksa (ör. --output-json sade) segmenti tek parca olarak al
    if (!Array.isArray(toks) || toks.length === 0) {
      const txt = (seg.text || '').trim();
      if (txt) words.push({ text: txt, start: sFrom / 1000, end: sTo / 1000, p: 1, segIndex: si, whole: true });
      continue;
    }

    let cur = null;
    for (const tok of toks) {
      const raw = tok.text;
      if (isSpecial(raw)) continue;
      const t = tokenTimes(tok, sFrom, sTo);
      const startsWord = /^[\s\u00A0]/.test(raw);
      const piece = raw.replace(/^[\s\u00A0]+/, '');
      if (piece === '') continue;

      if (startsWord || cur === null) {
        if (cur) words.push(cur);
        cur = { text: piece, start: t.from / 1000, end: t.to / 1000, p: tok.p != null ? tok.p : 1, segIndex: si, _n: 1 };
      } else {
        // Ek/parca: onceki kelimeye yapistir, bitisi uzat, olasiligi ortala
        cur.text += piece;
        cur.end = Math.max(cur.end, t.to / 1000);
        cur._n = (cur._n || 1) + 1;
        if (tok.p != null) cur.p = (cur.p * (cur._n - 1) + tok.p) / cur._n;
      }
    }
    if (cur) words.push(cur);
  }

  // Zaman tutarliligi: monoton artan, sifir sureli kelimelere asgari sure ver
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    delete w._n;
    if (!(w.end > w.start)) w.end = w.start + 0.06;
    if (i > 0 && w.start < words[i - 1].start) w.start = words[i - 1].start;
  }
  return words;
}

module.exports = { toWords, isSpecial };
