'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

/**
 * whisper.cpp surec sarmalayicisi.
 *
 * Halusinasyona karsi en guclu kol burada: --max-context 0.
 * Whisper 30 saniyelik pencereleri isler ve onceki pencerenin metnini baglam
 * olarak sonrakine tasir. Sessiz bir pencerede uydurma uretirse o uydurma
 * baglama girer ve kendini besleyerek tekrar dongusune girer. Baglami kesmek
 * bu dongunun kaynagini yok eder.
 */

/** Model adindan DTW hizalama preset'i. Yanlis preset whisper.cpp'yi hata verdirir. */
const DTW_PRESETS = {
  'large-v3-turbo': 'large.v3.turbo',
  'large-v3-turbo-q5_0': 'large.v3.turbo',
  'large-v3-q5_0': 'large.v3',
  'large-v3': 'large.v3',
  'medium-q5_0': 'medium',
  'medium': 'medium'
};

/**
 * Turkce karakterli veya bosluklu yollar whisper.cpp binary'sinde kod sayfasi
 * sorunu cikarir ("C:\\Users\\Şükrü\\..."). Gecici dosyalari guvenli yola koyariz.
 */
function safeTempDir() {
  const base = os.tmpdir();
  const clean = /^[\x20-\x7E]+$/.test(base); // sadece ASCII mi
  const root = clean ? base : path.join(path.parse(process.cwd()).root, 'tr-altyazi-tmp');
  const dir = path.join(root, 'tr-altyazi-' + process.pid + '-' + Date.now().toString(36));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function buildArgs(opts) {
  const { modelPath, wavPath, outPrefix, cfg, vadModelPath } = opts;
  const W = cfg.whisper;
  const threads = W.threads && W.threads > 0
    ? W.threads
    : Math.max(2, Math.min(16, Math.floor(os.cpus().length / 2)));

  const a = [
    '-m', modelPath,
    '-f', wavPath,
    '-l', W.language || 'tr',
    '-t', String(threads),
    '-of', outPrefix,
    '-ojf',                  // token seviyesinde JSON - kelime birlestirme icin sart
    '-pp'                    // ilerleme yuzdesi (stderr'e yazar)
  ];

  // --- Halusinasyon karsiti ayarlar ---
  if (W.maxContext !== undefined && W.maxContext !== null) a.push('-mc', String(W.maxContext));
  if (W.entropyThold != null) a.push('-et', String(W.entropyThold));
  if (W.logprobThold != null) a.push('-lpt', String(W.logprobThold));
  if (W.noSpeechThold != null) a.push('-nth', String(W.noSpeechThold));
  if (W.temperature != null) a.push('-tp', String(W.temperature));
  if (W.beamSize != null) a.push('-bs', String(W.beamSize));
  if (W.suppressNonSpeech) a.push('--suppress-nst');

  // --- VAD ---
  if (W.useVad && vadModelPath) {
    a.push('--vad', '--vad-model', vadModelPath);
    if (W.vadThreshold != null) a.push('--vad-threshold', String(W.vadThreshold));
  }

  // --- DTW hizalama ---
  if (W.useDtw) {
    const preset = DTW_PRESETS[W.model];
    if (preset) a.push('--dtw', preset);
  }

  // --- Noktalamayi tetikleyen baslangic ipucu ---
  if (W.initialPrompt) a.push('--prompt', W.initialPrompt);

  return a;
}

/** Windows'ta child.kill() torun surecleri oldurmez; agac olarak oldur. */
function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (os.platform() === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'],
        { stdio: 'ignore', timeout: 10000 });
      return;
    } catch (_) { /* asagidaki genel yola dus */ }
  }
  try { child.kill('SIGKILL'); } catch (_) {}
}

/**
 * whisper.cpp'yi calistirir, JSON ciktisini dondurur.
 * @returns {Promise<{json:Object, stderr:string, args:Array, cancel:Function}>}
 */
function run(opts) {
  const { exePath, modelPath, wavPath, cfg, vadModelPath, onProgress, workDir } = opts;
  const dir = workDir || safeTempDir();
  const outPrefix = path.join(dir, 'out');
  const args = buildArgs({ modelPath, wavPath, outPrefix, cfg, vadModelPath });

  let child = null;
  let cancelled = false;

  const promise = new Promise((resolve, reject) => {
    child = spawn(exePath, args, {
      cwd: path.dirname(exePath),   // yanindaki DLL'leri bulabilsin
      windowsHide: true
    });

    let stderr = '';
    let stdout = '';

    const readProgress = (chunk) => {
      const s = chunk.toString();
      // "whisper_print_progress_callback: progress =  40%"
      const re = /progress\s*=\s*(\d+)%/g;
      let m;
      let last = null;
      while ((m = re.exec(s)) !== null) last = parseInt(m[1], 10);
      if (last !== null && onProgress) onProgress({ pct: last / 100, raw: last });
    };

    child.stdout.on('data', (c) => { stdout += c.toString(); readProgress(c); });
    child.stderr.on('data', (c) => { stderr += c.toString(); readProgress(c); });

    child.on('error', (e) => {
      reject(new Error(`whisper.cpp baslatilamadi (${exePath}): ${e.message}`));
    });

    child.on('close', (code) => {
      if (cancelled) return reject(Object.assign(new Error('Iptal edildi'), { cancelled: true }));
      const jsonPath = outPrefix + '.json';
      if (code !== 0 && !fs.existsSync(jsonPath)) {
        return reject(new Error(
          `whisper.cpp ${code} koduyla cikti.\n` +
          `Komut: ${path.basename(exePath)} ${args.join(' ')}\n` +
          `Hata cikti:\n${stderr.slice(-2000)}`
        ));
      }
      if (!fs.existsSync(jsonPath)) {
        return reject(new Error(`JSON cikti uretilmedi: ${jsonPath}\n${stderr.slice(-1500)}`));
      }
      let json;
      try {
        json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      } catch (e) {
        return reject(new Error(`JSON cikti ayristirilamadi: ${e.message}`));
      }
      resolve({ json, stderr, stdout, args, jsonPath, workDir: dir });
    });
  });

  promise.cancel = () => { cancelled = true; killTree(child); };
  promise.getChild = () => child;
  return promise;
}

/**
 * DTW bazi yapilarda desteklenmez. Once DTW ile dene, "dtw" iceren bir hata
 * alirsak DTW'siz tekrar dene - kullanici bir sey fark etmesin.
 */
async function runWithFallback(opts) {
  try {
    return await run(opts);
  } catch (e) {
    const msg = String(e.message || '');
    if (opts.cfg.whisper.useDtw && /dtw|aheads|alignment/i.test(msg)) {
      const cfg2 = JSON.parse(JSON.stringify(opts.cfg));
      cfg2.whisper.useDtw = false;
      if (opts.onNotice) opts.onNotice('DTW bu yapida desteklenmiyor, DTW olmadan devam ediliyor.');
      return await run(Object.assign({}, opts, { cfg: cfg2 }));
    }
    throw e;
  }
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

module.exports = { run, runWithFallback, buildArgs, safeTempDir, killTree, cleanup, DTW_PRESETS };
