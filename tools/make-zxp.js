#!/usr/bin/env node
'use strict';
/**
 * ZXP paketi uretir (imzali Adobe eklenti dosyasi).
 *
 * NEDEN ZXP: kullanici tek dosyaya cift tiklayip kuruyor. Zip + PowerShell
 * betigi calisiyor ama "once su betigi calistir" demek guven vermiyor.
 *
 * DURUST SINIR: sertifikamiz KENDIMIZDEN imzali (self-signed). Adobe'un
 * guvendigi bir saglayicidan alinmadigi icin:
 *   - Creative Cloud uygulamasi uzerinden KURULAMAZ
 *   - ZXP Installer / Anastasiy Extension Manager gibi araclarla kurulur
 *   - PlayerDebugMode hala gerekebilir (Premiere imzayi taniyamazsa)
 * Guvenilir sertifika ucretli ve yillik yenilenir; ucretsiz dagitilan bir
 * arac icin self-signed yaygin ve kabul goren yoldur.
 *
 * Kullanim:
 *   node tools/make-zxp.js
 *
 * Sertifika ilk calistirmada uretilir ve tools/.cert/ altinda saklanir.
 * O klasor .gitignore'dadir — ozel anahtar depoya GIRMEMELIDIR.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const EXT_ID = 'com.tklabs.tkcaption';
const SRC = path.join(DIST, EXT_ID);

const CERT_DIR = path.join(__dirname, '.cert');
const CERT_FILE = path.join(CERT_DIR, 'tklabs.p12');
const PASS_FILE = path.join(CERT_DIR, 'password.txt');

const TOOL_DIR = path.join(__dirname, '.bin');
const TOOL = path.join(TOOL_DIR, 'ZXPSignCmd.exe');
const TOOL_URL =
  'https://github.com/Adobe-CEP/CEP-Resources/raw/master/ZXPSignCMD/4.1.3/x64/ZXPSignCmd.exe';

/* ------------------------------------------------------------------ */

function download(url, dest, depth) {
  depth = depth || 0;
  return new Promise((resolve, reject) => {
    if (depth > 8) return reject(new Error('Çok fazla yönlendirme'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    https.get(url, { headers: { 'User-Agent': 'TKCaption-build' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(download(loc, dest, depth + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' — ' + url));
      }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(dest)));
      out.on('error', reject);
    }).on('error', reject);
  });
}

async function ensureTool() {
  if (fs.existsSync(TOOL) && fs.statSync(TOOL).size > 1000000) return TOOL;
  console.log('  ZXPSignCmd indiriliyor (~4 MB)...');
  await download(TOOL_URL, TOOL);
  const mb = (fs.statSync(TOOL).size / 1048576).toFixed(1);
  console.log('  indirildi: ' + mb + ' MB');
  return TOOL;
}

/** Rastgele, yeterince uzun parola — elle akilda tutulmasi gerekmiyor */
function makePassword() {
  return require('crypto').randomBytes(18).toString('base64').replace(/[^A-Za-z0-9]/g, '');
}

function ensureCert(tool) {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(PASS_FILE)) {
    return { file: CERT_FILE, pass: fs.readFileSync(PASS_FILE, 'utf8').trim() };
  }
  fs.mkdirSync(CERT_DIR, { recursive: true });
  const pass = makePassword();

  console.log('  Sertifika üretiliyor (bir kez)...');
  execFileSync(tool, [
    '-selfSignedCert', 'TR', 'Istanbul', 'TK Labs', 'Tevfik Kemal',
    pass, CERT_FILE,
    '-validityDays', '3650'
  ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });

  fs.writeFileSync(PASS_FILE, pass + '\n');
  console.log('  sertifika: ' + CERT_FILE);
  console.log('  NOT: tools/.cert/ depoya GIRMEZ; özel anahtar oradadır.');
  return { file: CERT_FILE, pass };
}

function readVersion() {
  const xml = fs.readFileSync(path.join(ROOT, 'panel', 'CSXS', 'manifest.xml'), 'utf8');
  const m = /ExtensionBundleVersion="([^"]+)"/.exec(xml);
  return m ? m[1] : '0.0.0';
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error('HATA: dist/' + EXT_ID + ' yok. Önce: node tools/build.js');
    process.exit(1);
  }
  if (os.platform() !== 'win32') {
    console.error('HATA: bu betik Windows içindir (ZXPSignCmd.exe).');
    process.exit(1);
  }

  const version = readVersion();
  console.log('TK Caption ' + version + ' — ZXP imzalaniyor\n');

  const tool = await ensureTool();
  const cert = ensureCert(tool);

  const out = path.join(DIST, 'TKCaption-' + version + '.zxp');
  try { fs.unlinkSync(out); } catch (_) {}

  console.log('  paketleniyor...');
  try {
    execFileSync(tool, ['-sign', SRC, out, cert.file, cert.pass, '-tsa',
      'http://timestamp.digicert.com'],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
  } catch (e) {
    // Zaman damgasi sunucusuna ulasilamazsa imza yine gecerli, sadece
    // sertifika suresi dolunca eski paketler dogrulanamaz olur.
    const msg = String(e.stderr || e.stdout || e.message);
    console.log('  zaman damgası alınamadı, damgasız imzalanıyor');
    execFileSync(tool, ['-sign', SRC, out, cert.file, cert.pass],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
  }

  if (!fs.existsSync(out)) {
    console.error('HATA: ZXP üretilemedi.');
    process.exit(1);
  }

  // Uretilen paket gercekten dogrulanabiliyor mu? Imzalamak yetmez.
  let dogrulandi = false;
  try {
    const r = execFileSync(tool, ['-verify', out, '-certInfo'],
      { encoding: 'utf8', timeout: 120000 });
    dogrulandi = /is valid|Signature verified|valid/i.test(r);
    console.log('  doğrulama: ' + (dogrulandi ? 'imza geçerli' : r.trim().split('\n')[0]));
  } catch (e) {
    console.log('  doğrulama yapılamadı: ' + String(e.message).split('\n')[0]);
  }

  console.log('\nHazır: ' + out);
  console.log('  boyut: ' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
  console.log('\nKurulum: ZXP dosyasını ZXP Installer ile açın');
  console.log('  https://zxpinstaller.com');
})().catch((e) => {
  console.error('\nHATA: ' + e.message);
  process.exit(1);
});
