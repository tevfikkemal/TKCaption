'use strict';

/**
 * Dolgu tespiti: "ııı", "eee", "şey", "yani" gibi konusmayi uzatan
 * parcalari bulur. Kesmeyi YAPMAZ — yalnizca aday listesi uretir; kullanici
 * listeyi gorup onaylar, kesim Auto Cut'in kesim yoluyla yapilir.
 *
 * IKI KAYNAK:
 *
 * 1. Kelime: whisper'in yazdigi dolgu kelimeleri. "ııı/eee" gibi sesleri
 *    whisper cogu zaman YAZMIYOR (temiz metin uretmek uzere egitilmis);
 *    yazdiginda ise burada yakaliyoruz.
 *
 * 2. Sesli bosluk: VAD "burada ses var" diyor ama o araliga hicbir kelime
 *    dusmuyor. Whisper'in atladigi "ııı"lar tam olarak boyle gorunur.
 *    Nefes ve kisa gurultuler de buraya dusebilir; bu yuzden alt ve ust
 *    sure siniri var ve aday kullaniciya gosterilmeden kesilmiyor.
 */

/** Her zaman dolgu sayilan sesler: "ııı", "eee", "hmm", "ıhh"... */
const SES_DOLGU = /^(ı+h*|i+h*|e+h*|e+m+|a+h+|ö+h*|ı+m+|h+m+|m+h*m*|hı+|ha+h|öhö|ıhı)$/;

/**
 * Anlamli olabilen dolgu kelimeleri. Varsayilan olarak KAPALI baslarlar:
 * "yani" bazen gercekten "yani"dir. Kullanici panelden acar.
 */
const KELIME_DOLGU = ['şey', 'yani', 'hani', 'işte', 'falan', 'filan', 'aslında', 'öyle'];

function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
}

/**
 * @param {Array<{text,start,end}>} words  kelime zamanlari (saniye)
 * @param {Array<{start,end}>} [speech]   VAD konusma bolgeleri (saniye)
 * @param {Object} [opts]
 * @param {string[]} [opts.kelimeler]     acik dolgu kelimeleri (KELIME_DOLGU'dan)
 * @param {boolean} [opts.sesliBosluk=true]
 * @param {number} [opts.minSesSn=0.25]   sesli bosluk alt siniri
 * @param {number} [opts.maxSesSn=2.0]    ustu muhtemelen konusma, dolgu degil
 * @param {number} [opts.pay=0.04]        kesimin kelimeye tasmamasi icin pay
 * @returns {Array<{start,end,text,tur}>} zamana gore sirali, cakismasiz
 */
function bul(words, speech, opts) {
  const o = Object.assign({ kelimeler: [], sesliBosluk: true, minSesSn: 0.25, maxSesSn: 2.0, pay: 0.04 }, opts || {});
  const acik = new Set((o.kelimeler || []).map(norm));
  const ws = (words || []).filter((w) => w && w.end > w.start).slice().sort((a, b) => a.start - b.start);
  const adaylar = [];

  // --- 1. Kelime dolgulari ---
  for (let i = 0; i < ws.length; i++) {
    const n = norm(ws[i].text);
    if (!n) continue;
    const ses = SES_DOLGU.test(n);
    if (!ses && !acik.has(n)) continue;
    const onceki = ws[i - 1];
    const sonraki = ws[i + 1];
    // Kesimi komsu kelimelere tasirmadan, mumkunse biraz genislet
    const bas = Math.max(onceki ? onceki.end : 0, ws[i].start - o.pay);
    const bit = sonraki ? Math.min(sonraki.start, ws[i].end + o.pay) : ws[i].end + o.pay;
    if (bit - bas < 0.05) continue;
    adaylar.push({ start: bas, end: bit, text: ws[i].text, tur: ses ? 'ses' : 'kelime' });
  }

  // --- 2. Sesli bosluklar: konusma var, kelime yok ---
  if (o.sesliBosluk && speech && speech.length) {
    for (const r of speech) {
      // Bu konusma bolgesindeki kelimelerin kaplamadigi parcalar
      let imlec = r.start;
      const icerdeki = ws.filter((w) => w.end > r.start && w.start < r.end);
      const bosluklar = [];
      for (const w of icerdeki) {
        if (w.start > imlec) bosluklar.push({ start: imlec, end: w.start });
        imlec = Math.max(imlec, w.end);
      }
      if (r.end > imlec) bosluklar.push({ start: imlec, end: r.end });

      for (const b of bosluklar) {
        const uz = b.end - b.start;
        if (uz < o.minSesSn || uz > o.maxSesSn) continue;
        // Bolgenin basi/sonu VAD payi olabilir: kelimeye bitisik kisa
        // kenarlari dolgu saymiyoruz, yalnizca iki kelime ARASINDAKI ya
        // da yeterince uzun bosluklari
        const kenarda = (b.start === r.start || b.end === r.end);
        if (kenarda && uz < o.minSesSn * 2) continue;
        adaylar.push({ start: b.start, end: b.end, text: '(ses)', tur: 'bosluk' });
      }
    }
  }

  // --- Sirala ve cakisanlari birlestir ---
  adaylar.sort((a, b) => a.start - b.start);
  const sonuc = [];
  for (const a of adaylar) {
    const son = sonuc[sonuc.length - 1];
    if (son && a.start <= son.end + 0.02) {
      son.end = Math.max(son.end, a.end);
      if (a.tur !== 'bosluk') { son.text = son.tur === 'bosluk' ? a.text : son.text + ' ' + a.text; son.tur = a.tur; }
      continue;
    }
    sonuc.push(Object.assign({}, a));
  }
  return sonuc;
}

/** Adayin cevresindeki metin — listede baglam gostermek icin */
function baglam(words, aday, n) {
  const k = n || 3;
  const ws = (words || []).slice().sort((a, b) => a.start - b.start);
  const once = ws.filter((w) => w.end <= aday.start + 0.01).slice(-k).map((w) => w.text);
  const sonra = ws.filter((w) => w.start >= aday.end - 0.01).slice(0, k).map((w) => w.text);
  return { once: once.join(' '), sonra: sonra.join(' ') };
}

/**
 * Whisper'a dolgulari YAZDIRMAK icin baslangic ipucu.
 * OLCULEN DEGIL, BILINEN DAVRANIS: whisper ipucundaki uslubu taklit eder;
 * ipucunda "ııı, eee" gecerse bunlari metne yazma egilimi artar.
 * Noktalama ipucunu koruyoruz — o da ayni mekanizmayla calisiyor.
 */
const DOLGU_IPUCU = 'Eee, şey, ııı... bugün, hmm, sizlere bir konudan bahsedeceğim. Yani, ııı, evet.';

module.exports = { bul, baglam, norm, SES_DOLGU, KELIME_DOLGU, DOLGU_IPUCU };
