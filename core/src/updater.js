'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

/**
 * Kendi kendini guncelleme.
 *
 * TASARIM KARARLARI
 *
 * 1. GitHub Releases DEGIL, dogrudan depo dosyalari kullaniliyor.
 *    Release olusturmak elle bir adim; boylece "push ettim ama yayinlamayi
 *    unuttum" durumu olmuyor. update.json her derlemede uretilip commit'leniyor.
 *
 * 2. Her dosyanin SHA-256'si bildirimde yazili ve indirdikten SONRA
 *    dogrulaniyor. Yarim inen ya da bozulan dosya eklentiyi calismaz hale
 *    getirebilir; dogrulama olmadan guncelleme yapmak kullaniciyi
 *    calismayan bir eklentiyle basbasa birakma riski tasir.
 *
 * 3. Once TAMAMI gecici klasore indirilip dogrulaniyor, ancak hepsi
 *    tamamsa yerine tasiniyor. Yarim guncelleme diye bir sey olmuyor.
 *
 * 4. Eski surum yedeklenip, tasima sirasinda hata cikarsa geri aliniyor.
 *
 * 5. OLCULEN: ZXP Installer eklentiyi "Program Files (x86)\Common Files\
 *    Adobe\CEP\extensions" altina kuruyor. Orasi normal kullanicinin
 *    yazamadigi bir konum; kopyalama EPERM ile dusuyor. Bu yuzden once
 *    yazilabilirlik olculuyor, yazilamiyorsa Windows'tan yetki istenip
 *    (UAC) kopyalama yukseltilmis bir surecte yapiliyor. Kullaniciya
 *    "Premiere'i kapat" demek bu durumda ise yaramaz — sorun kilit degil.
 */

const RAW_BASE = 'https://raw.githubusercontent.com/tevfikkemal/TKCaption/main';
const MANIFEST_URL = RAW_BASE + '/update.json';

/** "0.7.1" -> [0,7,1]; karsilastirilabilir sayi dizisi */
function parseVersion(v) {
  return String(v || '0').split('.').map(function (n) {
    var x = parseInt(n, 10);
    return isNaN(x) ? 0 : x;
  });
}

/** a, b'den yeni mi? */
function isNewer(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

function fetchBuffer(url, depth) {
  depth = depth || 0;
  return new Promise((resolve, reject) => {
    if (depth > 6) return reject(new Error('Çok fazla yönlendirme'));
    const req = https.get(url, { headers: { 'User-Agent': 'TKCaption-updater' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(fetchBuffer(loc, depth + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' — ' + url));
      }
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => resolve(Buffer.concat(parts)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Bağlantı zaman aşımı')));
  });
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Uzaktaki surum bildirimini okur.
 * @returns {Promise<{version,files,notes}>}
 */
async function fetchManifest() {
  const raw = await fetchBuffer(MANIFEST_URL + '?t=' + Date.now());
  let m;
  try {
    m = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    throw new Error('Sürüm bilgisi okunamadı: ' + e.message);
  }
  if (!m.version || !Array.isArray(m.files)) {
    throw new Error('Sürüm bilgisi eksik.');
  }
  return m;
}

/** Kurulu surumu manifest.xml'den okur. */
function installedVersion(extensionDir) {
  try {
    const xml = fs.readFileSync(path.join(extensionDir, 'CSXS', 'manifest.xml'), 'utf8');
    const m = /ExtensionBundleVersion="([^"]+)"/.exec(xml);
    return m ? m[1] : '0.0.0';
  } catch (e) {
    return '0.0.0';
  }
}

/**
 * Klasore gercekten yazabiliyor muyuz?
 *
 * Yetkiyi tahmin etmek yerine olcuyoruz: yol Program Files altinda diye
 * varsaymak yaniltir (kullanici yonetici olabilir, ACL degistirilmis
 * olabilir). Tek guvenilir yol denemek.
 */
function yazilabilir(dir) {
  const p = path.join(dir, '.tkcaption-yazma-testi');
  try {
    fs.writeFileSync(p, 'x');
    fs.unlinkSync(p);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Guncelleme var mi?
 * @returns {Promise<{available, current, latest, files, notes, writable}>}
 */
async function check(extensionDir) {
  const current = installedVersion(extensionDir);
  const m = await fetchManifest();
  return {
    available: isNewer(m.version, current),
    current,
    latest: m.version,
    files: m.files,
    notes: m.notes || '',
    writable: yazilabilir(extensionDir)
  };
}

/**
 * Dogrulanmis dosyalari YUKSELTILMIS bir surecte yerine tasir.
 *
 * Windows UAC istemi cikar; kullanici onaylamazsa hata firlatir. Yedekleme
 * ve geri alma yukseltilmis betigin icinde yapiliyor — yarim guncelleme
 * birakmamak icin.
 */
function yukseltilmisTasi(staging, extensionDir, files) {
  const y = tasimaBetigiYaz(staging, extensionDir, files);

  try { fs.unlinkSync(y.sonuc); } catch (_) {}

  const komut =
    '$a = ' + psStr('-NoProfile -ExecutionPolicy Bypass -File "' + y.betik + '"') + '; ' +
    '$p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList $a; ' +
    'exit $p.ExitCode';

  try {
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', komut],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
  } catch (e) {
    // UAC reddedildiginde Start-Process firlatir; sonuc dosyasi da olusmaz.
    if (!fs.existsSync(y.sonuc)) {
      throw new Error('Yönetici izni verilmedi. Güncelleme yapılamadı.');
    }
  }

  const sonuc = fs.existsSync(y.sonuc)
    ? fs.readFileSync(y.sonuc, 'utf8').replace(/^﻿/, '').trim()
    : '';
  if (sonuc !== 'OK') {
    throw new Error(sonuc || 'Yükseltilmiş kopyalama sonuç vermedi.');
  }
}

/**
 * Tasima betigini uretir ve staging'e yazar.
 *
 * Ayri fonksiyon: boylece kopyalama/yedekleme/geri alma mantigi UAC
 * istemi olmadan test edilebiliyor. Yalnizca UAC ile calisabilen bir
 * kod yolu, hic test edilmeyen bir kod yoludur.
 *
 * @returns {{betik, liste, sonuc, yedek}} uretilen dosya yollari
 */
function tasimaBetigiYaz(staging, extensionDir, files) {
  const listeYolu = path.join(staging, '_liste.txt');
  const betikYolu = path.join(staging, '_uygula.ps1');
  const sonucYolu = path.join(staging, '_sonuc.txt');
  const yedekYolu = path.join(staging, '_yedek');

  fs.writeFileSync(listeYolu, files.map(function (f) { return f.path; }).join('\r\n'), 'utf8');

  // Betik ASCII: yukseltilmis surecte kod sayfasi farkli olabilir,
  // Turkce karakter bozulmasin diye hic kullanmiyoruz.
  const betik = [
    '$ErrorActionPreference = "Stop"',
    '$staging = ' + psStr(staging),
    '$hedef   = ' + psStr(extensionDir),
    '$yedek   = ' + psStr(yedekYolu),
    '$sonuc   = ' + psStr(sonucYolu),
    '$liste   = Get-Content -LiteralPath ' + psStr(listeYolu) + ' -Encoding UTF8',
    '$yazilan = @()',
    'try {',
    '  foreach ($p in $liste) {',
    '    if (-not $p) { continue }',
    '    $src = Join-Path $staging $p',
    '    $dst = Join-Path $hedef $p',
    '    $dd = Split-Path $dst -Parent',
    '    if (-not (Test-Path $dd)) { New-Item -ItemType Directory -Path $dd -Force | Out-Null }',
    '    if (Test-Path $dst) {',
    '      $b = Join-Path $yedek $p',
    '      $bd = Split-Path $b -Parent',
    '      if (-not (Test-Path $bd)) { New-Item -ItemType Directory -Path $bd -Force | Out-Null }',
    '      Copy-Item -LiteralPath $dst -Destination $b -Force',
    '    }',
    '    Copy-Item -LiteralPath $src -Destination $dst -Force',
    '    $yazilan += $p',
    '  }',
    '  "OK" | Set-Content -LiteralPath $sonuc -Encoding UTF8',
    '} catch {',
    '  foreach ($p in $yazilan) {',
    '    $b = Join-Path $yedek $p',
    '    if (Test-Path $b) { try { Copy-Item -LiteralPath $b -Destination (Join-Path $hedef $p) -Force } catch {} }',
    '  }',
    '  ("HATA: " + $_.Exception.Message) | Set-Content -LiteralPath $sonuc -Encoding UTF8',
    '  exit 1',
    '}'
  ].join('\r\n');
  fs.writeFileSync(betikYolu, betik, 'ascii');

  return { betik: betikYolu, liste: listeYolu, sonuc: sonucYolu, yedek: yedekYolu };
}

/** PowerShell tek tirnakli dizgi — icerideki tek tirnak ikilenir */
function psStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

/**
 * Guncellemeyi indirir, DOGRULAR ve uygular.
 *
 * Onemli: dosyalar once gecici klasore inip SHA ile dogrulaniyor. Ancak
 * hepsi tamamsa yerine tasiniyor — yarim guncelleme eklentiyi bozardi.
 *
 * @param {Function} [onProgress] ({done, total, file}) => void
 */
async function apply(extensionDir, manifest, onProgress) {
  const files = manifest.files;
  const staging = path.join(os.tmpdir(), 'tkcaption-update-' + Date.now().toString(36));
  fs.mkdirSync(staging, { recursive: true });

  // --- 1. Indir ve dogrula ---
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (onProgress) onProgress({ done: i, total: files.length, file: f.path });

    const buf = await fetchBuffer(RAW_BASE + '/' + f.source + '?t=' + Date.now());
    if (f.sha && sha256(buf) !== f.sha) {
      // OLCULEN: raw.githubusercontent.com dosyalari 5 dakika onbellekliyor
      // (max-age=300) ve query string ile de no-cache basligiyla da
      // atlatilamiyor. Surum bildirimi yenilenmisken bir dosya hala eski
      // kopyadan gelebiliyor. Bu, bozulmus indirmeden ayirt edilemez ama
      // en olasi sebep budur; kullaniciyi bosuna telaslandirmayalim.
      throw new Error('Güncelleme henüz yayılıyor. Birkaç dakika sonra ' +
        'tekrar deneyin.\n(' + f.path + ' beklenen sürümle eşleşmedi)');
    }
    const dest = path.join(staging, f.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  }
  if (onProgress) onProgress({ done: files.length, total: files.length, file: '' });

  // --- 2. Yazamiyorsak yetki iste; yedekleme/tasima orada yapilir ---
  // ZXP Installer sistem klasorune kurdugu icin normal kullanici oraya
  // yazamiyor. Bunu denemeden once olcup dogru yolu seciyoruz.
  if (!yazilabilir(extensionDir)) {
    if (onProgress) onProgress({ done: files.length, total: files.length, file: '', phase: 'yetki' });
    try {
      yukseltilmisTasi(staging, extensionDir, files);
    } finally {
      try { fs.rmSync(staging, { recursive: true, force: true }); } catch (_) {}
    }
    return { updated: files.length, backup: null, version: manifest.version, elevated: true };
  }

  const backup = path.join(os.tmpdir(), 'tkcaption-backup-' + Date.now().toString(36));
  fs.mkdirSync(backup, { recursive: true });
  for (const f of files) {
    const cur = path.join(extensionDir, f.path);
    if (fs.existsSync(cur)) {
      const b = path.join(backup, f.path);
      fs.mkdirSync(path.dirname(b), { recursive: true });
      fs.copyFileSync(cur, b);
    }
  }

  // --- 3. Yerine tasi; hata olursa geri al ---
  const yazilan = [];
  try {
    for (const f of files) {
      const src = path.join(staging, f.path);
      const dst = path.join(extensionDir, f.path);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      yazilan.push(f.path);
    }
  } catch (e) {
    // Geri alma: yazilanlari yedekten dondur
    for (const p of yazilan) {
      const b = path.join(backup, p);
      if (fs.existsSync(b)) {
        try { fs.copyFileSync(b, path.join(extensionDir, p)); } catch (_) {}
      }
    }
    // Sebebi tahmin etmeyip hata kodundan okuyoruz. Yanlis teshis
    // kullaniciyi bosuna Premiere kapatip acmaya yonlendiriyordu.
    const kod = e.code || '';
    let ipucu;
    if (kod === 'EPERM' || kod === 'EACCES') {
      ipucu = '\nBu klasöre yazma yetkisi yok. Premiere’i kapatıp tekrar deneyin; ' +
        'Windows yetki isterse onaylayın.';
    } else if (kod === 'EBUSY') {
      ipucu = '\nDosyalar kullanımda. Premiere’i kapatıp tekrar deneyin.';
    } else {
      ipucu = '';
    }
    throw new Error('Güncelleme uygulanamadı, eski sürüme dönüldü: ' + e.message + ipucu);
  } finally {
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch (_) {}
  }

  return { updated: files.length, backup, version: manifest.version };
}

module.exports = {
  check, apply, fetchManifest, installedVersion, yazilabilir, tasimaBetigiYaz,
  isNewer, parseVersion, sha256, RAW_BASE, MANIFEST_URL
};
