'use strict';

/**
 * Halusinasyon filtresi.
 *
 * Whisper sessiz / muzikli / gurultulu bolumlerde uydurma metin uretir.
 * Turkce'de en sik gorulenler: "Altyazı M.K.", "Abone olmayı unutmayın",
 * "İzlediğiniz için teşekkürler" - egitim verisindeki YouTube altyazilarindan
 * ezberlenmis kaliplar. Ayrica ayni cumleyi onlarca kez tekrarlama dongusune girer.
 *
 * Bu modul cikti uzerinde ikinci savunma hatti. Birinci hat whisper.js'teki
 * --max-context 0 ve VAD ayarlaridir.
 */

function normalize(s) {
  return String(s)
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Metin kendi icinde ayni kelimeyi/obegi tekrarliyor mu? ("evet evet evet evet") */
function selfRepetitionRatio(text) {
  const w = normalize(text).split(' ').filter(Boolean);
  if (w.length < 4) return 0;
  const uniq = new Set(w);
  return 1 - uniq.size / w.length;
}

/** Iki metin pratik olarak ayni mi? */
function sameText(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Biri digerinin icinde ve uzunluklari yakinsa da tekrar say
  const [s, l] = na.length <= nb.length ? [na, nb] : [nb, na];
  return l.includes(s) && s.length / l.length > 0.85;
}

/**
 * whisper.cpp JSON segmentlerini filtreler.
 * @returns {{segments:Array, removed:Array<{text,reason,from,to}>}}
 */
function filterSegments(segments, cfg) {
  const H = cfg.hallucination;
  if (!H || !H.enabled) return { segments, removed: [] };

  const blacklist = (H.blacklist || []).map(normalize).filter(Boolean);
  const kept = [];
  const removed = [];
  let runText = null;
  let runCount = 0;

  const drop = (seg, reason) => removed.push({
    text: (seg.text || '').trim(),
    reason,
    from: (seg.offsets && seg.offsets.from) || 0,
    to: (seg.offsets && seg.offsets.to) || 0
  });

  for (const seg of segments) {
    const text = (seg.text || '').trim();
    const norm = normalize(text);
    const from = (seg.offsets && seg.offsets.from) || 0;
    const to = (seg.offsets && seg.offsets.to) || from;
    const dur = Math.max((to - from) / 1000, 0.001);
    const cps = text.length / dur;

    if (!norm) { drop(seg, 'bos'); continue; }

    // 1. Kara liste - bilinen uydurma kaliplar
    const hit = blacklist.find((b) => b && (norm === b || norm.includes(b)));
    if (hit) { drop(seg, `kara-liste: "${hit}"`); continue; }

    // 2. Ic tekrar - "evet evet evet evet"
    if (selfRepetitionRatio(text) > 0.75) { drop(seg, 'ic-tekrar'); continue; }

    // 3. Arka arkaya ayni segment
    if (runText !== null && sameText(runText, text)) {
      runCount++;
      if (runCount > (H.maxRepeatCount || 2)) { drop(seg, `ardisik-tekrar x${runCount}`); continue; }
    } else {
      runText = text;
      runCount = 1;
    }

    // 4. Anormal karakter/saniye yogunlugu
    //    Cok dusuk: uzun sessizlige tek cumle yapistirmis.
    //    Cok yuksek: zaman damgasi cokmus.
    if (dur > 1.5 && cps < (H.minCharsPerSecond || 1.0)) { drop(seg, `dusuk-cps ${cps.toFixed(1)}`); continue; }
    if (cps > (H.maxCharsPerSecond || 35)) { drop(seg, `yuksek-cps ${cps.toFixed(1)}`); continue; }

    kept.push(seg);
  }

  // 5. Bas ve sondaki tek basina duran supheli segmentler
  if (H.dropLeadingTrailingNoise) {
    const suspicious = (seg, neighbour) => {
      if (!seg) return false;
      const t = normalize(seg.text || '');
      if (t.split(' ').length > 6) return false;
      if (!neighbour) return false;
      const gap = Math.abs(((neighbour.offsets && neighbour.offsets.from) || 0) -
                           ((seg.offsets && seg.offsets.to) || 0)) / 1000;
      return gap > 8; // 8 saniyeden uzun bosluk ardindan gelen kisa cumle
    };
    while (kept.length > 1 && suspicious(kept[0], kept[1])) {
      drop(kept.shift(), 'basta-yalitilmis');
    }
    while (kept.length > 1 && suspicious(kept[kept.length - 1], kept[kept.length - 2])) {
      drop(kept.pop(), 'sonda-yalitilmis');
    }
  }

  return { segments: kept, removed };
}

/** Kelime seviyesinde son temizlik: ardisik ayni kelime ("bir bir bir") */
function dedupeWords(words, maxRun = 2) {
  const out = [];
  let run = 0;
  for (const w of words) {
    const prev = out[out.length - 1];
    if (prev && normalize(prev.text) === normalize(w.text) && normalize(w.text).length > 1) {
      run++;
      if (run >= maxRun) { prev.end = Math.max(prev.end, w.end); continue; }
    } else {
      run = 0;
    }
    out.push(w);
  }
  return out;
}

module.exports = { filterSegments, dedupeWords, normalize, selfRepetitionRatio, sameText };
