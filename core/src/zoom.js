'use strict';

/**
 * Otomatik zoom (punch-in) planlayici.
 *
 * Konusmadaki her yeni ifadede (bir duraklamadan sonra baslayan konusma)
 * goruntu yakin/uzak arasinda gecis yapar — tek kameralik konusma
 * videolarinda ikinci kamera hissi verir. Ses yeterli; altyazi gerekmez.
 *
 * Bu modul yalnizca HESAP yapar: hangi anda hangi olcek. Premiere'e
 * yazma kopruda. Boylece mantik Premiere olmadan test edilebiliyor.
 *
 * Olcekler GORELI (1 = klibin mevcut boyutu, 1.15 = %15 yakin): klip 4K
 * kaynaktan %50'ye sigdirilmis olabilir; mutlak 115 yazmak onu bozardi.
 */

/**
 * @param {Array<{start,end}>} konusma  VAD konusma bolgeleri (saniye)
 * @param {Object} o
 * @param {number} o.oran       yakin olcek (1.15 = %115)
 * @param {number} o.aralikSn   iki gecis arasi en az sure
 * @param {string} o.stil       'punch' (ani) | 'yumusak' (kayarak)
 * @param {number} [o.fps=25]
 * @param {number} [o.birlesSn=0.35]  bundan kisa duraklama ayni ifade sayilir
 * @param {number} [o.gecisSn=0.45]   yumusak gecisin suresi
 * @returns {Array<{t,v}>} sirali anahtar kareler, t saniye, v goreli olcek
 */
function planla(konusma, o) {
  const fps = o.fps || 25;
  const kare = 1 / fps;
  const birles = o.birlesSn != null ? o.birlesSn : 0.35;
  const gecis = o.gecisSn || 0.45;
  const oran = o.oran || 1.15;
  const aralik = Math.max(0.5, o.aralikSn || 3);

  // Ifadeler: kisa duraklamalarla bolunmus konusmayi birlestir
  const r = (konusma || []).slice().sort((a, b) => a.start - b.start);
  const ifadeler = [];
  for (const b of r) {
    const son = ifadeler[ifadeler.length - 1];
    if (son && b.start - son.end < birles) son.end = Math.max(son.end, b.end);
    else ifadeler.push({ start: b.start, end: b.end });
  }

  const anahtar = [{ t: 0, v: 1 }];
  let durum = 1;
  let sonGecis = -Infinity;

  for (let i = 0; i < ifadeler.length; i++) {
    const s = ifadeler[i].start;
    if (s - sonGecis < aralik) continue;
    // Ilk ifadede uzak baslamak dogal; ilk gecis ikinci ifadede
    if (i === 0) { sonGecis = s; continue; }
    const yeni = durum === 1 ? oran : 1;
    if (o.stil === 'yumusak') {
      anahtar.push({ t: s, v: durum });
      anahtar.push({ t: s + gecis, v: yeni });
    } else {
      // Ani gecis: bir kare once eski deger, tam anda yeni deger
      anahtar.push({ t: Math.max(0, s - kare), v: durum });
      anahtar.push({ t: s, v: yeni });
    }
    durum = yeni;
    sonGecis = s;
  }
  return anahtar;
}

/** Anahtar kare dizisinde t anindaki degeri (dogrusal ara deger) */
function degerAt(anahtar, t) {
  if (!anahtar.length) return 1;
  if (t <= anahtar[0].t) return anahtar[0].v;
  for (let i = 1; i < anahtar.length; i++) {
    const a = anahtar[i - 1], b = anahtar[i];
    if (t <= b.t) {
      if (b.t === a.t) return b.v;
      return a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t);
    }
  }
  return anahtar[anahtar.length - 1].v;
}

/**
 * Sekans zamanindaki anahtar kareleri kliplere dagitir.
 *
 * Her klip KENDI anahtar karelerini tasir ve baslangic aninin degerini de
 * almali — yoksa kesimden sonraki klip zoom'un ortasinda baslasa bile
 * %100'den baslar. Bir kesim de zaten dogal bir gecis noktasi.
 *
 * ZAMAN TABANI: anahtar kare zamani klibin KAYNAK zamaninda:
 *   yerel = sekansZamani - klip.start + klip.inPoint
 * Premiere'de olculmedi (bkz. docs/premiere-api.md) — kopru yazdiktan
 * sonra geri okuyup raporluyor.
 *
 * @param {Array<{t,v}>} anahtar
 * @param {Array<{i,start,end,inPoint}>} klipler  saniye
 * @returns {Array<{i, keys:Array<{t,v}>}>}
 */
function kliplereDagit(anahtar, klipler) {
  const sonuc = [];
  for (const k of klipler) {
    if (!(k.end > k.start)) continue;
    const yerel = (t) => +(t - k.start + (k.inPoint || 0)).toFixed(5);
    const keys = [{ t: yerel(k.start), v: +degerAt(anahtar, k.start).toFixed(4) }];
    for (const a of anahtar) {
      if (a.t > k.start + 1e-6 && a.t < k.end - 1e-6) keys.push({ t: yerel(a.t), v: a.v });
    }
    // Hic gecis yoksa ve her yer 1 ise bu klibe dokunmaya gerek yok
    if (keys.length === 1 && keys[0].v === 1) continue;
    sonuc.push({ i: k.i, keys });
  }
  return sonuc;
}

module.exports = { planla, degerAt, kliplereDagit };
