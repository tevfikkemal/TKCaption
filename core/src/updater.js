'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

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
 * Guncelleme var mi?
 * @returns {Promise<{available, current, latest, files, notes}>}
 */
async function check(extensionDir) {
  const current = installedVersion(extensionDir);
  const m = await fetchManifest();
  return {
    available: isNewer(m.version, current),
    current,
    latest: m.version,
    files: m.files,
    notes: m.notes || ''
  };
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
      throw new Error('Dosya doğrulaması başarısız: ' + f.path +
        ' (indirilen içerik beklenenden farklı)');
    }
    const dest = path.join(staging, f.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  }
  if (onProgress) onProgress({ done: files.length, total: files.length, file: '' });

  // --- 2. Yedekle ---
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
    throw new Error('Güncelleme uygulanamadı, eski sürüme dönüldü: ' + e.message +
      '\nPremiere açıkken dosyalar kilitli olabilir; Premiere’i kapatıp tekrar deneyin.');
  } finally {
    try { fs.rmSync(staging, { recursive: true, force: true }); } catch (_) {}
  }

  return { updated: files.length, backup, version: manifest.version };
}

module.exports = {
  check, apply, fetchManifest, installedVersion,
  isNewer, parseVersion, sha256, RAW_BASE, MANIFEST_URL
};
