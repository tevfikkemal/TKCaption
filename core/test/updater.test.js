'use strict';
/**
 * Guncelleyici testleri.
 *
 * En kritik olan SURUM KARSILASTIRMA: yanlis bir karsilastirma ya
 * guncellemeyi hic gostermez ya da her acilista bos yere guncelleme
 * onerir. Ikisi de kullaniciyi kaybettirir.
 */
const up = require('../src/updater.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

let fail = 0;
function ok(cond, label, extra) {
  console.log((cond ? '  OK   ' : '  HATA ') + label);
  if (!cond) { if (extra) console.log('         ' + extra); fail++; }
}

console.log('=== SURUM KARSILASTIRMA ===');
{
  ok(up.isNewer('0.8.0', '0.7.1'), '0.8.0 > 0.7.1');
  ok(up.isNewer('0.7.2', '0.7.1'), '0.7.2 > 0.7.1');
  ok(up.isNewer('1.0.0', '0.9.9'), '1.0.0 > 0.9.9');
  ok(!up.isNewer('0.7.1', '0.7.1'), 'ayni sürüm yeni değil');
  ok(!up.isNewer('0.7.0', '0.7.1'), 'eski sürüm yeni değil');
  ok(!up.isNewer('0.9.9', '1.0.0'), '0.9.9 < 1.0.0');
}
{
  // Sayisal karsilastirma, metin degil: "0.10.0" > "0.9.0" olmali
  ok(up.isNewer('0.10.0', '0.9.0'),
     '0.10.0 > 0.9.0 (metin karşılaştırması olsaydı ters olurdu)');
  ok(up.isNewer('0.7.10', '0.7.9'), '0.7.10 > 0.7.9');
}
{
  // Eksik/bozuk surumler cokmesin
  ok(!up.isNewer('', '0.7.1'), 'boş sürüm yeni sayılmıyor');
  ok(up.isNewer('1', '0.9.9'), 'tek haneli sürüm de karşılaştırılıyor');
  ok(!up.isNewer('abc', '0.1.0'), 'geçersiz sürüm yeni sayılmıyor');
}

console.log('\n=== KURULU SURUMU OKUMA ===');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tkup-'));
  fs.mkdirSync(path.join(dir, 'CSXS'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'CSXS', 'manifest.xml'),
    '<?xml version="1.0"?>\n<ExtensionManifest ExtensionBundleId="x" ' +
    'ExtensionBundleVersion="0.7.1" Version="11.0"></ExtensionManifest>');
  ok(up.installedVersion(dir) === '0.7.1',
     'manifest.xml’den okundu (' + up.installedVersion(dir) + ')');

  const bos = fs.mkdtempSync(path.join(os.tmpdir(), 'tkup-'));
  ok(up.installedVersion(bos) === '0.0.0',
     'manifest yoksa 0.0.0 (' + up.installedVersion(bos) + ')');

  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(bos, { recursive: true, force: true });
}

console.log('\n=== SHA DOGRULAMA ===');
{
  const a = up.sha256(Buffer.from('merhaba'));
  const b = up.sha256(Buffer.from('merhaba'));
  const c = up.sha256(Buffer.from('merhabb'));
  ok(a === b, 'aynı içerik aynı özet');
  ok(a !== c, 'tek harf farkı özeti değiştiriyor');
  ok(a.length === 64, 'SHA-256 uzunluğu 64 (' + a.length + ')');
}

console.log('\n=== ADRESLER ===');
{
  ok(up.RAW_BASE.indexOf('https://') === 0, 'kaynak HTTPS');
  ok(up.MANIFEST_URL.indexOf(up.RAW_BASE) === 0, 'bildirim aynı depodan');
  ok(up.MANIFEST_URL.indexOf('TKCaption') > 0, 'depo adı doğru');
}

console.log('\n================================');
console.log(fail === 0 ? 'TUM TESTLER GECTI' : fail + ' TEST BASARISIZ');
process.exit(fail === 0 ? 0 : 1);
