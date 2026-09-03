#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const configMod = require('./config.js');
const audio = require('./audio.js');
const models = require('./models.js');
const whisper = require('./whisper.js');
const tokens = require('./tokens.js');
const hallucination = require('./hallucination.js');
const postprocess = require('./postprocess.js');
const segmenter = require('./segmenter.js');
const srt = require('./srt.js');

const VERSION = '0.1.0';

/* ------------------------------------------------------------------ */
/*  Argumanlar                                                         */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '-i': case '--input': o.input = next(); break;
      case '-o': case '--out': case '--output': o.out = next(); break;
      case '-l': case '--lang': o.lang = next(); break;
      case '-m': case '--model': o.model = next(); break;
      case '-c': case '--config': o.config = next(); break;
      case '--dict': case '--sozluk': o.dict = next(); break;
      case '--offset': o.offset = next(); break;
      case '--fps': o.fps = parseFloat(next()); break;
      case '--variant': o.variant = next(); break;
      case '--threads': o.threads = parseInt(next(), 10); break;
      case '--max-chars': o.maxChars = parseInt(next(), 10); break;
      case '--max-cps': o.maxCps = parseFloat(next()); break;
      case '--format': o.format = next(); break;
      case '--json': o.json = true; break;
      case '--no-vad': o.noVad = true; break;
      case '--no-dtw': o.noDtw = true; break;
      case '--no-turkish': o.noTurkish = true; break;
      case '--keep-temp': o.keepTemp = true; break;
      case '--verbose': case '-v': o.verbose = true; break;
      case '--list-models': o.listModels = true; break;
      case '-h': case '--help': o.help = true; break;
      case '--version': o.version = true; break;
      default:
        if (a.startsWith('-')) throw new Error(`Bilinmeyen secenek: ${a}`);
        o._.push(a);
    }
  }
  if (!o.input && o._.length) o.input = o._[0];
  return o;
}

const HELP = `
tr-altyazi ${VERSION} — Türkçe otomatik altyazı üreteci (yerel, ücretsiz)

KULLANIM
  node core/src/index.js --input <dosya> [--out <dosya.srt>]

TEMEL
  -i, --input <yol>      Girdi ses/video dosyası (WAV doğrudan; diğerleri ffmpeg ister)
  -o, --out <yol>        Çıktı SRT yolu (varsayılan: girdiyle aynı ad + .srt)
  -m, --model <ad>       Model (varsayılan: large-v3-turbo-q5_0)
  -l, --lang <kod>       Dil (varsayılan: tr)
  -c, --config <yol>     config.json yolu
      --dict <yol>       Kullanıcı sözlüğü (JSON dizi: isimler veya {from,to})

PREMIERE ENTEGRASYONU
      --offset <sn|TC>   Sekans başlangıç zaman kodu (örn. 3600 veya 01:00:00:00)
      --fps <n>          Sekans kare hızı (kare hizalaması için, varsayılan 25)

ALTYAZI BİÇİMİ
      --max-chars <n>    Satır başına azami karakter (varsayılan 42)
      --max-cps <n>      Azami karakter/saniye (varsayılan 17)
      --format <srt|vtt> Çıktı biçimi

MOTOR
      --variant <ad>     cpu | blas | cuda11 | cuda12 (varsayılan: otomatik)
      --threads <n>      İş parçacığı sayısı
      --no-vad           VAD kapat
      --no-dtw           DTW hizalamayı kapat
      --no-turkish       Türkçe son işlemi kapat

DİĞER
      --json             İlerlemeyi JSON satırları olarak yaz (panel için)
      --list-models      Kullanılabilir modelleri listele
      --keep-temp        Geçici dosyaları silme
  -v, --verbose          Ayrıntılı çıktı
  -h, --help             Bu yardım

ÖRNEK
  node core/src/index.js -i roportaj.wav -o roportaj.srt --fps 25
  node core/src/index.js -i sekans.wav --offset 01:00:00:00 --fps 29.97
`;

/* ------------------------------------------------------------------ */
/*  Ilerleme bildirimi                                                 */
/* ------------------------------------------------------------------ */

function makeReporter(useJson) {
  let lastLine = '';
  return {
    step(phase, message, pct) {
      if (useJson) {
        process.stdout.write(JSON.stringify({ type: 'progress', phase, message, pct }) + '\n');
      } else {
        const bar = pct != null ? ` ${Math.round(pct * 100)}%` : '';
        const line = `[${phase}] ${message}${bar}`;
        if (line !== lastLine) { process.stderr.write(line + '\n'); lastLine = line; }
      }
    },
    tick(phase, message, pct) {
      if (useJson) {
        process.stdout.write(JSON.stringify({ type: 'progress', phase, message, pct }) + '\n');
      } else {
        const w = 28;
        const filled = Math.round((pct || 0) * w);
        process.stderr.write(`\r[${phase}] ${message} [${'#'.repeat(filled)}${'.'.repeat(w - filled)}] ${Math.round((pct || 0) * 100)}%   `);
      }
    },
    endTick() { if (!useJson) process.stderr.write('\n'); },
    done(payload) {
      if (useJson) process.stdout.write(JSON.stringify(Object.assign({ type: 'done' }, payload)) + '\n');
    },
    error(message) {
      if (useJson) process.stdout.write(JSON.stringify({ type: 'error', message }) + '\n');
      else process.stderr.write('\nHATA: ' + message + '\n');
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Ses hazirligi                                                      */
/* ------------------------------------------------------------------ */

function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 10000 });
  return r.status === 0;
}

function prepareAudio(inputPath, workDir, report) {
  const ext = path.extname(inputPath).toLowerCase();
  const target = path.join(workDir, 'audio16k.wav');

  if (ext === '.wav' || ext === '.wave') {
    report.step('ses', 'WAV çözülüyor');
    const d = audio.decodeWav(inputPath);
    report.step('ses', `${d.sampleRate} Hz ${d.channels} kanal, ${d.durationSec.toFixed(1)} sn`);
    let s = d.samples;
    if (d.sampleRate !== audio.TARGET_RATE) {
      report.step('ses', `${d.sampleRate} Hz → 16000 Hz`);
      s = audio.resample(s, d.sampleRate, audio.TARGET_RATE);
    }
    audio.normalize(s);
    audio.writeWav16k(target, s);
    return { path: target, durationSec: d.durationSec };
  }

  // WAV disi girdi: ffmpeg gerekli
  if (!hasFfmpeg()) {
    throw new Error(
      `"${ext}" biçimi için ffmpeg gerekli ama PATH'te bulunamadı.\n` +
      `Seçenekler:\n` +
      `  1) Girdiyi WAV olarak verin (Premiere zaten WAV üretiyor — ffmpeg gerekmez)\n` +
      `  2) ffmpeg kurun: https://www.gyan.dev/ffmpeg/builds/ (LGPL "essentials" yeterli)`
    );
  }
  report.step('ses', 'ffmpeg ile 16 kHz mono WAV çıkarılıyor');
  execFileSync('ffmpeg', ['-y', '-i', inputPath, '-vn', '-ar', '16000', '-ac', '1',
    '-c:a', 'pcm_s16le', target], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 1800000 });
  const d = audio.decodeWav(target);
  return { path: target, durationSec: d.durationSec };
}

/* ------------------------------------------------------------------ */
/*  Ana akis                                                           */
/* ------------------------------------------------------------------ */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(HELP); return 0; }
  if (opts.version) { process.stdout.write(VERSION + '\n'); return 0; }
  if (opts.listModels) {
    process.stdout.write('\nKullanılabilir modeller:\n\n');
    for (const [name, spec] of Object.entries(models.MODELS)) {
      const has = models.modelExists(name) ? ' [indirilmiş]' : '';
      process.stdout.write(`  ${name.padEnd(22)} ${String(spec.mb).padStart(5)} MB${has}\n      ${spec.note}\n`);
    }
    process.stdout.write('\nBinary seçenekleri:\n\n');
    for (const [name, spec] of Object.entries(models.BINARIES)) {
      process.stdout.write(`  ${name.padEnd(22)} ${String(spec.mb).padStart(5)} MB   ${spec.note}\n`);
    }
    process.stdout.write(`\nBu makine için önerilen: ${models.recommendVariant()}\n`);
    const gpu = models.detectNvidia();
    if (gpu) process.stdout.write(`Algılanan GPU: ${gpu}\n`);
    return 0;
  }
  if (!opts.input) { process.stderr.write(HELP); return 1; }
  if (!fs.existsSync(opts.input)) throw new Error(`Girdi dosyası bulunamadı: ${opts.input}`);

  const report = makeReporter(opts.json);

  // --- Ayarlar ---
  const cfg = configMod.load(opts.config);
  if (opts.lang) cfg.whisper.language = opts.lang;
  if (opts.model) cfg.whisper.model = opts.model;
  if (opts.threads) cfg.whisper.threads = opts.threads;
  if (opts.noVad) cfg.whisper.useVad = false;
  if (opts.noDtw) cfg.whisper.useDtw = false;
  if (opts.noTurkish) cfg.turkish.enabled = false;
  if (opts.maxChars) cfg.layout.maxCharsPerLine = opts.maxChars;
  if (opts.maxCps) cfg.layout.maxCps = opts.maxCps;
  if (opts.fps) cfg.layout.fps = opts.fps;
  if (opts.format) cfg.output.format = opts.format;
  if (opts.offset != null) {
    cfg.output.timecodeOffsetSec = /[:;]/.test(String(opts.offset))
      ? srt.timecodeToSeconds(opts.offset, cfg.layout.fps)
      : parseFloat(opts.offset);
  }
  if (opts.dict) {
    const d = JSON.parse(fs.readFileSync(opts.dict, 'utf8'));
    cfg.turkish.dictionary = (cfg.turkish.dictionary || []).concat(Array.isArray(d) ? d : d.dictionary || []);
  }

  const outPath = opts.out || opts.input.replace(/\.[^.]+$/, '') +
    (cfg.output.format === 'vtt' ? '.vtt' : '.srt');

  const workDir = whisper.safeTempDir();
  const t0 = Date.now();

  try {
    // --- 1. Motor ve model ---
    report.step('hazırlık', 'whisper.cpp hazırlanıyor');
    const bin = await models.ensureBinary(opts.variant, (p) => {
      if (p.phase === 'download') report.tick('indirme', p.name, p.pct);
      else if (p.phase === 'start') report.step('indirme', `${p.name} indiriliyor (~${p.mb} MB)`);
      else if (p.phase === 'extract') { report.endTick(); report.step('indirme', 'arşiv açılıyor'); }
    });
    report.step('hazırlık', `motor: ${bin.variant} (${path.basename(bin.exe)})`);

    const modelFile = await models.ensureModel(cfg.whisper.model, (p) => {
      if (p.phase === 'download') report.tick('indirme', `model ${p.name}`, p.pct);
      else if (p.phase === 'start') report.step('indirme', `model ${p.name} indiriliyor (~${p.mb} MB)`);
      else if (p.phase === 'done') report.endTick();
    });

    let vadModel = null;
    if (cfg.whisper.useVad) {
      vadModel = await models.ensureVadModel((p) => {
        if (p.phase === 'download') report.tick('indirme', 'VAD modeli', p.pct);
      });
    }

    // --- 2. Ses ---
    const prepared = prepareAudio(opts.input, workDir, report);

    // --- 3. Çözümleme ---
    report.step('çözümleme', 'konuşma tanıma başlıyor', 0);
    const result = await whisper.runWithFallback({
      exePath: bin.exe,
      modelPath: modelFile,
      wavPath: prepared.path,
      vadModelPath: vadModel,
      cfg,
      workDir,
      onProgress: (p) => report.tick('çözümleme', 'konuşma tanınıyor', p.pct),
      onNotice: (m) => report.step('uyarı', m)
    });
    report.endTick();

    // --- 4. Halüsinasyon filtresi ---
    const segs = (result.json && result.json.transcription) || [];
    const filtered = hallucination.filterSegments(segs, cfg);
    if (filtered.removed.length) {
      report.step('temizlik', `${filtered.removed.length} şüpheli segment atıldı`);
      if (opts.verbose) {
        for (const r of filtered.removed) {
          process.stderr.write(`    atıldı: "${r.text.slice(0, 60)}" [${r.reason}]\n`);
        }
      }
    }

    // --- 5. Kelimeler ---
    let words = tokens.toWords({ transcription: filtered.segments });
    if (!words.length) throw new Error('Konuşma bulunamadı. Ses dosyası sessiz olabilir veya dil yanlış seçilmiş olabilir.');
    words = hallucination.dedupeWords(words);
    words = postprocess.processWords(words, cfg);
    report.step('metin', `${words.length} kelime işlendi`);

    // --- 6. Segmentasyon ---
    const blocks = segmenter.segment(words, cfg);
    report.step('bölme', `${blocks.length} altyazı bloğu oluşturuldu`);

    // --- 7. Yazma ---
    const content = cfg.output.format === 'vtt' ? srt.toVtt(blocks, cfg) : srt.toSrt(blocks, cfg);
    srt.write(outPath, content, cfg);

    // --- Özet ---
    const elapsed = (Date.now() - t0) / 1000;
    const over = blocks.filter((b) => b.cps > cfg.layout.maxCps + 0.5).length;
    const longLine = blocks.filter((b) => b.lines.some((l) => l.length > cfg.layout.maxCharsPerLine)).length;
    const speed = prepared.durationSec / elapsed;

    report.done({
      output: outPath,
      blocks: blocks.length,
      words: words.length,
      removed: filtered.removed.length,
      durationSec: prepared.durationSec,
      elapsedSec: +elapsed.toFixed(1),
      speedRealtime: +speed.toFixed(1),
      cpsViolations: over,
      lineLengthViolations: longLine
    });

    if (!opts.json) {
      process.stderr.write(
        `\nTamamlandı: ${outPath}\n` +
        `  ${blocks.length} blok, ${words.length} kelime\n` +
        `  ${prepared.durationSec.toFixed(1)} sn ses / ${elapsed.toFixed(1)} sn işlem (${speed.toFixed(1)}x gerçek zaman)\n` +
        `  kural ihlali: ${over} CPS, ${longLine} satır uzunluğu\n`
      );
    }
    return 0;
  } finally {
    if (!opts.keepTemp) whisper.cleanup(workDir);
    else process.stderr.write(`Geçici dosyalar: ${workDir}\n`);
  }
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      const useJson = process.argv.includes('--json');
      if (useJson) process.stdout.write(JSON.stringify({ type: 'error', message: e.message }) + '\n');
      else process.stderr.write('\nHATA: ' + e.message + '\n');
      process.exit(1);
    });
}

module.exports = { main, parseArgs, prepareAudio };
