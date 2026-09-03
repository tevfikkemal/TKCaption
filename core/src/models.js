'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

/**
 * Model ve binary indirme / onbellekleme.
 *
 * Tum URL'ler ve boyutlar 2026-09 itibariyle dogrulanmistir.
 * DIKKAT: HuggingFace deposu hala "ggerganov/whisper.cpp" - "ggml-org/whisper.cpp"
 * 401 doner. GitHub tarafi ise ggml-org'a tasinmistir.
 */

const HF = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';
const GH = 'https://github.com/ggml-org/whisper.cpp/releases/download';
// whisper.cpp surum etiketleri "b<build>" bicimindedir (v1.x DEGIL).
// Sabitlenmis surum: tekrarlanabilirlik icin. resolveLatestTag() ile guncellenebilir.
const WHISPER_RELEASE = 'b4938';

const MODELS = {
  'large-v3-turbo-q5_0': { url: `${HF}/ggml-large-v3-turbo-q5_0.bin`, mb: 547, note: 'Varsayilan. Turkce icin hiz/kalite dengesi en iyi.' },
  'large-v3-turbo':      { url: `${HF}/ggml-large-v3-turbo.bin`,      mb: 1549, note: 'Tam turbo. Kalite tavani.' },
  'large-v3-q5_0':       { url: `${HF}/ggml-large-v3-q5_0.bin`,       mb: 1031, note: 'Damitilmamis large-v3. Turbo ile A/B test icin.' },
  'medium-q5_0':         { url: `${HF}/ggml-medium-q5_0.bin`,         mb: 514, note: 'Zayif makineler icin yedek.' }
};

const VAD_MODEL = {
  name: 'silero-v5.1.2',
  url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin',
  mb: 1
};

/**
 * Windows binary secenekleri.
 * NOT: Resmi Vulkan yapisi YOKTUR. Secenekler CPU / BLAS / CUDA ile sinirlidir.
 */
const BINARIES = {
  cpu:    { asset: 'whisper-bin-x64.zip',              mb: 8,   note: 'Sade CPU. Her makinede calisir.' },
  blas:   { asset: 'whisper-blas-bin-x64.zip',         mb: 20,  note: 'CPU + OpenBLAS. Varsayilan evrensel secim.' },
  cuda11: { asset: 'whisper-cublas-11.8.0-bin-x64.zip', mb: 257, note: 'NVIDIA, eski suruculer (CUDA 11.8).' },
  cuda12: { asset: 'whisper-cublas-12.4.0-bin-x64.zip', mb: 640, note: 'NVIDIA, guncel suruculer (CUDA 12.4).' }
};

function repoRoot() { return path.resolve(__dirname, '..', '..'); }

/**
 * Model ve binary'lerin yasadigi klasor.
 *
 * DAGITIM ICIN KRITIK: eklenti sistem geneline kurulursa kendi klasoru
 * (Program Files (x86)\Common Files\Adobe\CEP\extensions) YAZILABILIR DEGILDIR.
 * Bu yuzden indirilen dosyalar kullanicinin veri klasorune gider.
 *
 * Sira:
 *   1. TKCAPTION_HOME ortam degiskeni (elle yonlendirmek isteyenler icin)
 *   2. Depo kokunde zaten indirilmis dosyalar varsa onlar (gelistirme;
 *      var olan indirmeler bosa gitmesin)
 *   3. Kullanici veri klasoru
 */
function userDataRoot() {
  if (process.env.TKCAPTION_HOME) return process.env.TKCAPTION_HOME;
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'TKCaption');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'TKCaption');
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'tkcaption');
}

/** Klasor gercekten yazilabilir mi? Varsaymak yerine deneyerek olcuyoruz. */
function isWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.yazma-testi-' + process.pid);
    fs.writeFileSync(probe, 'x');
    fs.unlinkSync(probe);
    return true;
  } catch (_) { return false; }
}

let _root = null;
function dataRoot() {
  if (_root) return _root;

  if (process.env.TKCAPTION_HOME) { _root = process.env.TKCAPTION_HOME; return _root; }

  // Gelistirme: depo kokunde zaten inmis dosyalar varsa onlari kullan
  const repo = repoRoot();
  try {
    const m = path.join(repo, 'models');
    const b = path.join(repo, 'bin');
    const hasModel = fs.existsSync(m) && fs.readdirSync(m).some((f) => f.endsWith('.bin'));
    const hasBin = fs.existsSync(b) && fs.readdirSync(b).some((f) => f !== '.gitkeep');
    if ((hasModel || hasBin) && isWritable(repo)) { _root = repo; return _root; }
  } catch (_) {}

  const user = userDataRoot();
  _root = isWritable(user) ? user : repo;
  return _root;
}

function modelsDir() { return path.join(dataRoot(), 'models'); }
function binDir() { return path.join(dataRoot(), 'bin'); }

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); return d; }
const mb = (b) => (b / 1048576).toFixed(1);

/* ------------------------------------------------------------------ */
/*  Indirme: yonlendirme takibi + yarim kalani surdurme + ilerleme      */
/* ------------------------------------------------------------------ */

function download(url, dest, onProgress, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 8) return reject(new Error('Cok fazla yonlendirme'));
    ensureDir(path.dirname(dest));
    const part = dest + '.part';
    let from = 0;
    try { from = fs.existsSync(part) ? fs.statSync(part).size : 0; } catch (_) { from = 0; }

    const headers = { 'User-Agent': 'tr-altyazi/0.1' };
    if (from > 0) headers.Range = `bytes=${from}-`;

    const req = https.get(url, { headers }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(download(loc, dest, onProgress, depth + 1));
      }
      if (res.statusCode === 416) { // zaten tam inmis
        res.resume();
        try { fs.renameSync(part, dest); } catch (_) {}
        return resolve(dest);
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.resume();
        return reject(new Error(`Indirme basarisiz: HTTP ${res.statusCode} - ${url}`));
      }
      // Sunucu Range'i yok saydiysa bastan basla
      if (from > 0 && res.statusCode === 200) { from = 0; try { fs.unlinkSync(part); } catch (_) {} }

      const total = from + parseInt(res.headers['content-length'] || '0', 10);
      let got = from;
      let lastTick = 0;
      const out = fs.createWriteStream(part, { flags: from > 0 ? 'a' : 'w' });

      res.on('data', (c) => {
        got += c.length;
        const now = Date.now();
        if (onProgress && (now - lastTick > 400 || got === total)) {
          lastTick = now;
          onProgress({ got, total, pct: total ? got / total : 0 });
        }
      });
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          try {
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            fs.renameSync(part, dest);
            resolve(dest);
          } catch (e) { reject(e); }
        });
      });
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(new Error('Baglanti zaman asimi')); });
  });
}

/* ------------------------------------------------------------------ */
/*  Model                                                              */
/* ------------------------------------------------------------------ */

function modelPath(name) { return path.join(modelsDir(), `ggml-${name}.bin`); }

function modelExists(name) {
  const p = modelPath(name);
  if (!fs.existsSync(p)) return false;
  const spec = MODELS[name];
  if (!spec) return true;
  // Yarim inmis dosyayi gecerli sayma: beklenen boyutun %90'i altindaysa reddet
  const size = fs.statSync(p).size;
  return size > spec.mb * 1048576 * 0.9;
}

async function ensureModel(name, onProgress) {
  const spec = MODELS[name];
  if (!spec) {
    throw new Error(`Bilinmeyen model: ${name}. Secenekler: ${Object.keys(MODELS).join(', ')}`);
  }
  const dest = modelPath(name);
  if (modelExists(name)) return dest;
  if (onProgress) onProgress({ phase: 'start', name, mb: spec.mb });
  await download(spec.url, dest, (p) => {
    if (onProgress) onProgress({ phase: 'download', name, ...p });
  });
  if (!modelExists(name)) {
    throw new Error(`Model indirildi ama boyut beklenenden kucuk: ${dest}`);
  }
  if (onProgress) onProgress({ phase: 'done', name });
  return dest;
}

async function ensureVadModel(onProgress) {
  const dest = path.join(modelsDir(), `ggml-${VAD_MODEL.name}.bin`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 500 * 1024) return dest;
  if (onProgress) onProgress({ phase: 'start', name: 'VAD', mb: VAD_MODEL.mb });
  await download(VAD_MODEL.url, dest, (p) => {
    if (onProgress) onProgress({ phase: 'download', name: 'VAD', ...p });
  });
  return dest;
}

/* ------------------------------------------------------------------ */
/*  Binary                                                             */
/* ------------------------------------------------------------------ */

/** whisper.cpp calistirilabilirinin adi surumler arasinda degisti. */
const EXE_NAMES = ['whisper-cli.exe', 'main.exe', 'whisper-cli', 'main'];

/**
 * DIKKAT: main.exe bu surumlerde yalnizca bir uyari basip 1 ile cikan
 * "deprecation stub"tir; gercek calistirilabilir whisper-cli.exe'dir.
 * Bu yuzden dizin sirasina gore ILK bulunani degil, EXE_NAMES'teki
 * ONCELIGE gore en uygun olani secmemiz gerekir (main.exe son care).
 */
function findExe(dir) {
  if (!fs.existsSync(dir)) return null;
  const hits = new Map();
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (EXE_NAMES.includes(e.name) && !hits.has(e.name)) hits.set(e.name, full);
    }
  }
  for (const name of EXE_NAMES) {           // oncelik sirasiyla ara
    if (hits.has(name)) return hits.get(name);
  }
  return null;
}

/** NVIDIA karti var mi? CUDA yapisi onermek icin. */
function detectNvidia() {
  try {
    const out = execFileSync('powershell', [
      '-NoProfile', '-Command',
      "(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -like '*NVIDIA*' } | Select-Object -First 1).Name"
    ], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out || null;
  } catch (_) { return null; }
}

function recommendVariant() {
  if (os.platform() !== 'win32') return 'blas';
  return detectNvidia() ? 'cuda12' : 'blas';
}

function extractZip(zipPath, destDir) {
  ensureDir(destDir);
  if (os.platform() === 'win32') {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
    ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 300000 });
  } else {
    execFileSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'ignore' });
  }
}

/**
 * whisper.cpp calistirilabilirini hazirla.
 * Once elle konulmus binary aranir; yoksa secilen varyant indirilip acilir.
 */
async function ensureBinary(variant, onProgress) {
  const v = variant || recommendVariant();
  const spec = BINARIES[v];
  if (!spec) throw new Error(`Bilinmeyen binary varyanti: ${v}. Secenekler: ${Object.keys(BINARIES).join(', ')}`);

  const target = path.join(binDir(), v);
  let exe = findExe(target) || findExe(binDir());
  if (exe) return { exe, variant: v, cached: true };

  const zip = path.join(binDir(), spec.asset);
  if (onProgress) onProgress({ phase: 'start', name: `whisper.cpp (${v})`, mb: spec.mb });
  if (!fs.existsSync(zip) || fs.statSync(zip).size < spec.mb * 1048576 * 0.9) {
    await download(`${GH}/${WHISPER_RELEASE}/${spec.asset}`, zip, (p) => {
      if (onProgress) onProgress({ phase: 'download', name: `whisper.cpp (${v})`, ...p });
    });
  }
  if (onProgress) onProgress({ phase: 'extract', name: spec.asset });
  extractZip(zip, target);
  exe = findExe(target);
  if (!exe) throw new Error(`Arsiv acildi ama calistirilabilir bulunamadi: ${target}`);
  try { fs.unlinkSync(zip); } catch (_) {}
  if (onProgress) onProgress({ phase: 'done', name: `whisper.cpp (${v})` });
  return { exe, variant: v, cached: false };
}

module.exports = {
  MODELS, BINARIES, VAD_MODEL,
  ensureModel, ensureVadModel, ensureBinary,
  modelPath, modelExists, modelsDir, binDir,
  recommendVariant, detectNvidia, download, findExe, mb
};
