'use strict';
/**
 * Zip okuyucu testi.
 *
 * NEDEN: .mogrt dosyalarini panel calisma aninda aciyor. Okuyucu yanlis
 * calisirsa sablon listesi bos gelir ya da — daha kotusu — bozuk veri
 * sessizce gecer. Burada kendi arsivimizi uretip geri okuyoruz; gercek
 * bir .mogrt'ye bagli kalmiyoruz cunku o dosyalar depoda yok.
 *
 * Kapsanan: stored ve deflate girdiler, Turkce dosya adlari, arsiv
 * yorumu (EOCD'nin sabit yerde olmamasi), bulunmayan girdi, bozuk dosya.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const zip = require('../src/zip.js');

let ok = 0, hata = 0;
function t(ad, f) {
  try { f(); console.log('  OK   ' + ad); ok++; }
  catch (e) { console.log('  HATA ' + ad + ' -> ' + e.message); hata++; }
}
function esit(a, b, m) {
  if (a !== b) throw new Error((m ? m + ': ' : '') + JSON.stringify(b) +
                               ' beklendi, ' + JSON.stringify(a) + ' geldi');
}

/**
 * Elle zip uretir. Kutuphane kullanmiyoruz ki test, okuyucunun kendi
 * varsayimlarini degil BICIMI dogrulasin.
 */
function zipYaz(hedef, girdiler, yorum) {
  const yerel = [];
  const merkez = [];
  let ofset = 0;

  for (const g of girdiler) {
    const adBuf = Buffer.from(g.ad, 'utf8');
    const ham = Buffer.from(g.veri);
    const sikistir = g.yontem === 8;
    const veri = sikistir ? zlib.deflateRawSync(ham) : ham;
    const crc = crc32(ham);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);              // surum
    lh.writeUInt16LE(0, 6);               // bayrak
    lh.writeUInt16LE(g.yontem, 8);
    lh.writeUInt16LE(0, 10);              // zaman
    lh.writeUInt16LE(0, 12);              // tarih
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(veri.length, 18);
    lh.writeUInt32LE(ham.length, 22);
    lh.writeUInt16LE(adBuf.length, 26);
    lh.writeUInt16LE(0, 28);              // ek alan yok
    yerel.push(lh, adBuf, veri);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(g.yontem, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(veri.length, 20);
    ch.writeUInt32LE(ham.length, 24);
    ch.writeUInt16LE(adBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(ofset, 42);
    merkez.push(ch, adBuf);

    ofset += lh.length + adBuf.length + veri.length;
  }

  const yerelBuf = Buffer.concat(yerel);
  const merkezBuf = Buffer.concat(merkez);
  const yorumBuf = Buffer.from(yorum || '', 'utf8');

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(girdiler.length, 8);
  eocd.writeUInt16LE(girdiler.length, 10);
  eocd.writeUInt32LE(merkezBuf.length, 12);
  eocd.writeUInt32LE(yerelBuf.length, 16);
  eocd.writeUInt16LE(yorumBuf.length, 20);

  fs.writeFileSync(hedef, Buffer.concat([yerelBuf, merkezBuf, eocd, yorumBuf]));
}

/* Zip CRC-32 */
let crcTablo = null;
function crc32(buf) {
  if (!crcTablo) {
    crcTablo = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcTablo[i] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTablo[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/* ------------------------------------------------------------------ */

const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'tkc-zip-'));

console.log('\n=== TEMEL OKUMA ===');
{
  const dosya = path.join(kok, 'temel.zip');
  const json = JSON.stringify({ ad: 'şablon', punto: 124 });
  // Gercek .mogrt'de definition.json deflate, kucuk dosyalar stored olabilir
  zipYaz(dosya, [
    { ad: 'definition.json', veri: Buffer.from(json, 'utf8'), yontem: 8 },
    { ad: 'thumb.png', veri: Buffer.from([0x89, 0x50, 0x4E, 0x47, 1, 2, 3]), yontem: 0 },
    { ad: 'project.aegraphic', veri: Buffer.alloc(5000, 7), yontem: 8 }
  ]);

  t('girdiler listeleniyor', function () {
    esit(zip.girdiler(dosya).length, 3);
  });
  t('deflate girdi acildi', function () {
    esit(zip.oku(dosya, 'definition.json').toString('utf8'), json);
  });
  t('stored girdi okundu', function () {
    esit(zip.oku(dosya, 'thumb.png').slice(0, 4).toString('hex'), '89504e47');
  });
  t('buyuk girdi tam acildi', function () {
    const b = zip.oku(dosya, 'project.aegraphic');
    esit(b.length, 5000, 'uzunluk');
    esit(b[4999], 7, 'son bayt');
  });
  t('olmayan girdi null doner', function () {
    esit(zip.oku(dosya, 'yok.txt'), null);
  });
  t('buyuk-kucuk harf toleransi', function () {
    esit(zip.oku(dosya, 'DEFINITION.JSON').toString('utf8'), json);
  });
}

console.log('\n=== TURKCE AD VE ARSIV YORUMU ===');
{
  // EOCD sabit yerde degil: sonda yorum olabilir. Okuyucu geriye
  // dogru aramazsa bu dosyayi hic acamaz.
  const dosya = path.join(kok, 'yorumlu.zip');
  zipYaz(dosya, [
    { ad: 'şablon çıktısı.json', veri: Buffer.from('{"a":1}', 'utf8'), yontem: 8 }
  ], 'bu arsivin sonunda bir yorum var '.repeat(20));

  t('yorumlu arsiv okundu', function () {
    esit(zip.oku(dosya, 'şablon çıktısı.json').toString('utf8'), '{"a":1}');
  });
  t('Türkçe ad listede doğru', function () {
    esit(zip.girdiler(dosya)[0].ad, 'şablon çıktısı.json');
  });
}

console.log('\n=== BOZUK DOSYA ===');
{
  const bozuk = path.join(kok, 'bozuk.zip');
  fs.writeFileSync(bozuk, Buffer.from('bu bir zip degil, duz metin'));
  t('zip olmayan dosya hata veriyor', function () {
    let patladi = false;
    try { zip.girdiler(bozuk); } catch (e) { patladi = true; }
    if (!patladi) throw new Error('hata beklenirken sessizce gecti');
  });
}

fs.rmSync(kok, { recursive: true, force: true });

console.log('\n================================');
if (hata === 0) {
  console.log('TUM TESTLER GECTI (' + ok + ')');
} else {
  console.log(hata + ' TEST BASARISIZ');
  process.exit(1);
}
