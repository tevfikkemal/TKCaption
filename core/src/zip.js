'use strict';
/**
 * Zip okuyucu — yalnizca okuma, yalnizca ihtiyacimiz kadari.
 *
 * NEDEN KENDIMIZ: .mogrt dosyalari zip. Panelin onlari calisma aninda
 * acmasi gerekiyor (icindeki definition.json ve thumb.png icin). Node'da
 * yerlesik zip yok; PowerShell'e her dosya icin surec acmak 50 sablonda
 * yuzlerce surec demekti. Zip'in okuma tarafi kucuk bir bicim: merkezi
 * dizini okuyup istenen girdiyi zlib ile acmak yetiyor.
 *
 * Desteklenen: stored (0) ve deflate (8) — .mogrt dosyalarinda gorulen
 * tek iki yontem. Sifreli ve zip64 arsivler desteklenmiyor; oyle bir
 * dosya gelirse acikca hata veriyoruz, sessizce yanlis veri dondurmuyoruz.
 */
const fs = require('fs');
const zlib = require('zlib');

const EOCD_IMZA = 0x06054b50;
const MERKEZ_IMZA = 0x02014b50;
const YEREL_IMZA = 0x04034b50;

/**
 * Arsivin merkezi dizinini okur.
 * @returns {Array<{ad, yontem, sikistirilmis, acilmis, yerelOfset}>}
 */
function girdiler(dosyaYolu) {
  const buf = fs.readFileSync(dosyaYolu);
  const eocd = eocdBul(buf);
  if (eocd < 0) throw new Error('Zip degil ya da bozuk: ' + dosyaYolu);

  const sayi = buf.readUInt16LE(eocd + 10);
  let ofset = buf.readUInt32LE(eocd + 16);

  // Zip64: 0xFFFFFFFF "gercek deger baska yerde" demek. Bu dosyalarda
  // gormedik; karsilasirsak tahmin etmektense hata veriyoruz.
  if (ofset === 0xFFFFFFFF) throw new Error('Zip64 arsiv desteklenmiyor');

  const liste = [];
  for (let i = 0; i < sayi; i++) {
    if (ofset + 46 > buf.length) break;
    if (buf.readUInt32LE(ofset) !== MERKEZ_IMZA) break;

    const bayrak = buf.readUInt16LE(ofset + 8);
    const yontem = buf.readUInt16LE(ofset + 10);
    const sikistirilmis = buf.readUInt32LE(ofset + 20);
    const acilmis = buf.readUInt32LE(ofset + 24);
    const adUz = buf.readUInt16LE(ofset + 28);
    const ekUz = buf.readUInt16LE(ofset + 30);
    const yorumUz = buf.readUInt16LE(ofset + 32);
    const yerelOfset = buf.readUInt32LE(ofset + 42);
    const ad = buf.toString('utf8', ofset + 46, ofset + 46 + adUz);

    liste.push({
      ad, yontem, sikistirilmis, acilmis, yerelOfset,
      sifreli: (bayrak & 0x1) === 1
    });
    ofset += 46 + adUz + ekUz + yorumUz;
  }
  return liste;
}

/**
 * Arsivden TEK bir dosyayi cikarir.
 * @returns {Buffer|null} bulunamazsa null
 */
function oku(dosyaYolu, icerideki) {
  const buf = fs.readFileSync(dosyaYolu);
  const liste = girdilerBuf(buf, dosyaYolu);

  const hedef = liste.find((g) => g.ad === icerideki) ||
                liste.find((g) => g.ad.toLowerCase() === String(icerideki).toLowerCase());
  if (!hedef) return null;
  if (hedef.sifreli) throw new Error('Şifreli zip girdisi: ' + icerideki);

  // Yerel baslik uzunlugu merkezi dizindekinden FARKLI olabilir; veri
  // ofsetini yerel basliktan hesaplamak zorundayiz.
  const y = hedef.yerelOfset;
  if (buf.readUInt32LE(y) !== YEREL_IMZA) throw new Error('Yerel başlık bozuk');
  const adUz = buf.readUInt16LE(y + 26);
  const ekUz = buf.readUInt16LE(y + 28);
  const veriBas = y + 30 + adUz + ekUz;
  const ham = buf.slice(veriBas, veriBas + hedef.sikistirilmis);

  if (hedef.yontem === 0) return ham;
  if (hedef.yontem === 8) return zlib.inflateRawSync(ham);
  throw new Error('Desteklenmeyen sıkıştırma yöntemi: ' + hedef.yontem);
}

/* Ic kullanim: buf zaten okunmusken tekrar okumamak icin */
function girdilerBuf(buf, etiket) {
  const eocd = eocdBul(buf);
  if (eocd < 0) throw new Error('Zip degil ya da bozuk: ' + etiket);
  const sayi = buf.readUInt16LE(eocd + 10);
  let ofset = buf.readUInt32LE(eocd + 16);
  if (ofset === 0xFFFFFFFF) throw new Error('Zip64 arsiv desteklenmiyor');

  const liste = [];
  for (let i = 0; i < sayi; i++) {
    if (ofset + 46 > buf.length) break;
    if (buf.readUInt32LE(ofset) !== MERKEZ_IMZA) break;
    const bayrak = buf.readUInt16LE(ofset + 8);
    const yontem = buf.readUInt16LE(ofset + 10);
    const sikistirilmis = buf.readUInt32LE(ofset + 20);
    const acilmis = buf.readUInt32LE(ofset + 24);
    const adUz = buf.readUInt16LE(ofset + 28);
    const ekUz = buf.readUInt16LE(ofset + 30);
    const yorumUz = buf.readUInt16LE(ofset + 32);
    const yerelOfset = buf.readUInt32LE(ofset + 42);
    const ad = buf.toString('utf8', ofset + 46, ofset + 46 + adUz);
    liste.push({ ad, yontem, sikistirilmis, acilmis, yerelOfset,
                 sifreli: (bayrak & 0x1) === 1 });
    ofset += 46 + adUz + ekUz + yorumUz;
  }
  return liste;
}

/**
 * EOCD kaydini sondan geriye arar.
 *
 * Kayit sabit yerde degil: sonunda 64 KB'a kadar arsiv yorumu olabilir.
 * Bu yuzden son 64 KB + 22 bayti tarayip imzayi ariyoruz.
 */
function eocdBul(buf) {
  const enAz = 22;
  const enFazla = Math.min(buf.length, 65535 + enAz);
  for (let i = buf.length - enAz; i >= buf.length - enFazla; i--) {
    if (i < 0) break;
    if (buf.readUInt32LE(i) === EOCD_IMZA) return i;
  }
  return -1;
}

module.exports = { girdiler, oku };
