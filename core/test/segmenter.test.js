'use strict';
const { segment, wrapLines } = require('../src/segmenter.js');
const cfgMod = require('../src/config.js');
const cfg = cfgMod.load();

/** Duz metinden gercekci zaman damgali kelime dizisi uret (hece ~ sure). */
function mkWords(text, cps = 14, startAt = 0) {
  const parts = text.split(/\s+/).filter(Boolean);
  let t = startAt;
  return parts.map((p) => {
    const dur = Math.max(0.12, p.length / cps);
    const w = { text: p, start: t, end: t + dur, p: 0.95 };
    t += dur + 0.05;
    // Cumle sonunda daha uzun duraklama
    if (/[.!?]$/.test(p)) t += 0.35;
    else if (/,$/.test(p)) t += 0.12;
    return w;
  });
}

function report(title, text, cps) {
  const words = mkWords(text, cps);
  const blocks = segment(words, cfg);
  console.log('\n=== ' + title + ' ===');
  let bad = 0;
  blocks.forEach((b, i) => {
    const flags = [];
    b.lines.forEach((l) => { if (l.length > cfg.layout.maxCharsPerLine) flags.push('SATIR>' + cfg.layout.maxCharsPerLine); });
    if (b.lines.length > cfg.layout.maxLines) flags.push('SATIR SAYISI>' + cfg.layout.maxLines);
    if (b.cps > cfg.layout.maxCps + 0.5) flags.push('CPS=' + b.cps.toFixed(1));
    if (b.end - b.start < cfg.layout.minDurationSec - 0.01) flags.push('KISA');
    if (b.end - b.start > cfg.layout.maxDurationSec + 0.01) flags.push('UZUN');
    if (flags.length) bad++;
    const t = `${b.start.toFixed(2)}-${b.end.toFixed(2)}`;
    console.log(`[${String(i + 1).padStart(2)}] ${t.padEnd(13)} cps=${b.cps.toFixed(1).padStart(4)} ${flags.length ? '!! ' + flags.join(',') : ''}`);
    b.lines.forEach((l) => console.log(`     |${l}| (${l.length})`));
  });
  console.log(`--- ${blocks.length} blok, ${bad} kural ihlali`);
  return { blocks, bad };
}

const t1 = 'Merhaba arkadaşlar, bugün sizlere Adobe Premiere Pro üzerinde Türkçe altyazı nasıl oluşturulur onu anlatacağım. Bildiğiniz gibi Adobe bu özelliği yıllardır Türkçe için eklemiyor, biz de kendi çözümümüzü yaptık.';
const t2 = 'Yarın sabah erkenden kalkıp havaalanına gitmem gerekiyor çünkü uçağım dokuzda kalkıyor ve trafik olursa yetişemem.';
const t3 = 'Bunu gördün mü, gerçekten inanılmaz bir şey de söylemedi ama yine de haklıydı.';

const r1 = report('Tanitim konusmasi', t1, 14);
const r2 = report('Uzun tek cumle (bolme zorlanacak)', t2, 15);
const r3 = report('Ek ve baglaclar (de/da/mi testi)', t3, 13);

console.log('\n=== SATIR BOLME KURALI TESTLERI ===');
const cases = [
  ['Bunu gerçekten yapabileceğini hiç düşünmemiştim ama sen başardın', 'ama-oncesi bolunmeli'],
  ['Ankara Üniversitesi Rektörlüğü tarafından yapılan açıklamaya göre süreç devam ediyor', 'gore edatindan once bolunmemeli'],
  ['Sen bunu gördün mü acaba diye merak ediyordum doğrusu şu an', 'mu satir basinda olmamali']
];
for (const [text, beklenti] of cases) {
  const w = mkWords(text, 14);
  const lines = wrapLines(w, cfg);
  console.log('\n' + beklenti);
  lines.forEach((l) => console.log('  |' + l + '| (' + l.length + ')'));
}

const totalBad = r1.bad + r2.bad + r3.bad;
console.log('\n================================');
console.log(totalBad === 0 ? 'TUM BLOKLAR KURALLARA UYGUN' : 'TOPLAM ' + totalBad + ' IHLAL');
process.exit(totalBad === 0 ? 0 : 1);
