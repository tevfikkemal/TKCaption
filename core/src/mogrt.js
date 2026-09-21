'use strict';
/**
 * MOGRT sablon klasorunu tarar, panelin kullanacagi katalogu uretir.
 *
 * NEDEN CALISMA ANINDA: sablonlar kullanicinin kendi dosyalari. Bir
 * donem hazir bir katalogu pakete koymustuk; o katalog ve onizlemeler
 * satin alinmis bir sablon paketinden uretilmisti ve dagitma hakkimiz
 * yoktu. Simdi pakette hicbir sablon verisi yok — panel kullanicinin
 * gosterdigi klasoru okuyup katalogu kendisi cikariyor. Herkes kendi
 * sablonlariyla calisiyor.
 *
 * OLCULEN YAPI (.mogrt bir zip):
 *   definition.json
 *     clientControls[].type === 6      -> metin parametresi
 *     sourceInfo*.framesize.size       -> sablonun kendi cozunurlugu
 *   thumb.png                          -> hazir onizleme
 *
 * Metin parametresinin ADI sablondan sablona degisiyor; ada gore degil
 * TURE gore buluyoruz.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zip = require('./zip.js');

function dataRoot() {
  return path.join(process.env.APPDATA || os.homedir(), 'TKCaption');
}

/** Uretilen katalog ve onizlemeler burada durur — pakette degil. */
function cacheDir() { return path.join(dataRoot(), 'mogrt'); }
function thumbsDir() { return path.join(cacheDir(), 'thumbs'); }
function catalogPath() { return path.join(cacheDir(), 'catalog.json'); }

/** Adobe'un cok dilli string yapisindan ilk degeri alir */
function strDb(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v.strDB && v.strDB.length) return String(v.strDB[0].str || '');
  return '';
}

/** clientControls icinde ilk metin (type 6) kontrolu */
function metinKontrolu(def) {
  const cc = def.clientControls;
  if (!Array.isArray(cc)) return null;
  for (let i = 0; i < cc.length; i++) {
    if (cc[i] && cc[i].type === 6) {
      const fe = cc[i].fonteditinfo || {};
      return {
        index: i,
        ad: strDb(cc[i].uiName),
        font: fe.fontEditValue || '',
        punto: fe.fontSizeEditValue || 0
      };
    }
  }
  return null;
}

/** sourceInfo icinden sablonun kendi cozunurlugu */
function boyut(def) {
  try {
    const si = def.sourceInfoLocalized;
    const ilk = si && si[Object.keys(si)[0]];
    if (ilk && ilk.framesize && ilk.framesize.size) {
      return { en: Number(ilk.framesize.size.x) || 0,
               boy: Number(ilk.framesize.size.y) || 0 };
    }
  } catch (e) {}
  return { en: 0, boy: 0 };
}

/**
 * Klasordeki .mogrt dosyalarini tarar.
 *
 * @param {string} klasor
 * @param {Function} [onProgress] ({done,total,file}) => void
 * @returns {{klasor, uretim, items:Array, atlanan:Array}}
 */
function tara(klasor, onProgress) {
  if (!fs.existsSync(klasor)) throw new Error('Klasör yok: ' + klasor);

  const dosyalar = fs.readdirSync(klasor)
    .filter((f) => f.toLowerCase().endsWith('.mogrt'))
    .sort();

  fs.mkdirSync(thumbsDir(), { recursive: true });

  const items = [];
  const atlanan = [];

  for (let i = 0; i < dosyalar.length; i++) {
    const dosya = dosyalar[i];
    if (onProgress) onProgress({ done: i, total: dosyalar.length, file: dosya });

    const tam = path.join(klasor, dosya);
    const ad = dosya.replace(/\.mogrt$/i, '');

    let def;
    try {
      const buf = zip.oku(tam, 'definition.json');
      if (!buf) { atlanan.push(ad + ' — definition.json yok'); continue; }
      def = JSON.parse(buf.toString('utf8'));
    } catch (e) {
      atlanan.push(ad + ' — okunamadı (' + e.message + ')');
      continue;
    }

    const metin = metinKontrolu(def);
    if (!metin) {
      // Metin parametresi olmayan sablona altyazi yazamayiz; listeye
      // almak kullaniciyi calismayan bir secenekle bas basa birakirdi.
      atlanan.push(ad + ' — metin parametresi yok');
      continue;
    }

    // Onizleme: dosya adindan bagimsiz, icerigin ozetiyle adlandiriyoruz
    // ki iki farkli klasordeki ayni adli sablon birbirini ezmesin.
    let thumb = '';
    try {
      const png = zip.oku(tam, 'thumb.png');
      if (png && png.length) {
        const kisa = crypto.createHash('sha1').update(tam).digest('hex').slice(0, 12);
        const tAd = kisa + '.png';
        fs.writeFileSync(path.join(thumbsDir(), tAd), png);
        thumb = tAd;
      }
    } catch (e) { /* onizleme kritik degil */ }

    const b = boyut(def);
    items.push({
      id: crypto.createHash('sha1').update(dosya).digest('hex').slice(0, 12),
      ad: ad,
      dosya: dosya,
      metinAdi: metin.ad,
      font: metin.font,
      punto: metin.punto,
      en: b.en,
      boy: b.boy,
      thumb: thumb
    });
  }

  if (onProgress) onProgress({ done: dosyalar.length, total: dosyalar.length, file: '' });

  const katalog = {
    version: 2,
    klasor: klasor,
    uretim: new Date().toISOString(),
    items: items,
    atlanan: atlanan
  };
  fs.mkdirSync(cacheDir(), { recursive: true });
  fs.writeFileSync(catalogPath(), JSON.stringify(katalog, null, 2) + '\n');
  return katalog;
}

/**
 * Onbellekteki katalogu okur.
 *
 * Klasor degistiyse ya da dosya sayisi tutmuyorsa null doner — boylece
 * kullanici klasore sablon ekleyip cikardiginda eski liste gosterilmez.
 */
function onbellek(klasor) {
  try {
    const k = JSON.parse(fs.readFileSync(catalogPath(), 'utf8'));
    if (!k || k.version !== 2 || k.klasor !== klasor) return null;

    const simdiki = fs.readdirSync(klasor)
      .filter((f) => f.toLowerCase().endsWith('.mogrt')).length;
    if (simdiki !== k.items.length + k.atlanan.length) return null;

    return k;
  } catch (e) {
    return null;
  }
}

module.exports = { tara, onbellek, cacheDir, thumbsDir, catalogPath };
