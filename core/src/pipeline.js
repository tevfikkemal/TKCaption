'use strict';
const fs = require('fs');
const path = require('path');

const configMod = require('./config.js');
const audio = require('./audio.js');
const models = require('./models.js');
const whisper = require('./whisper.js');
const tokens = require('./tokens.js');
const hallucination = require('./hallucination.js');
const postprocess = require('./postprocess.js');
const segmenter = require('./segmenter.js');
const srt = require('./srt.js');

/**
 * Ses -> altyazi boru hatti.
 *
 * Hem CLI (core/src/index.js) hem CEP paneli bunu kullanir. Tek kaynak
 * olmasinin sebebi: ikisi ayri kod tasirsa zamanla birbirinden ayrisir ve
 * "panelde farkli cikiyor" hatalari baslar.
 *
 * Panel bunu CEP'in KENDI Node'unda calistirir; kullanicinin makinesinde
 * Node kurulu olmasi gerekmez.
 */

/**
 * @param {Object} opts
 * @param {string} opts.input       girdi dosyasi (WAV dogrudan, digerleri ffmpeg ister)
 * @param {string} opts.out         cikti SRT yolu
 * @param {Object} [opts.cfg]       config (verilmezse yuklenir)
 * @param {string} [opts.variant]   cpu|blas|cuda11|cuda12
 * @param {string} [opts.ffmpeg]    ffmpeg yolu
 * @param {Function} [opts.onPhase] (phase, message) -> void
 * @param {Function} [opts.onProgress] (phase, pct, message) -> void
 * @param {Function} [opts.prepareAudio] ozel ses hazirlama (CLI ffmpeg'i enjekte eder)
 */
async function run(opts) {
  const cfg = opts.cfg || configMod.load();
  const phase = opts.onPhase || function () {};
  const progress = opts.onProgress || function () {};

  const workDir = opts.workDir || whisper.safeTempDir();
  const ownWorkDir = !opts.workDir;
  const t0 = Date.now();

  try {
    // --- 1. Motor ---
    phase('hazırlık', 'whisper.cpp hazırlanıyor');
    const bin = await models.ensureBinary(opts.variant, (p) => {
      if (p.phase === 'start') phase('indirme', `${p.name} indiriliyor (~${p.mb} MB)`);
      else if (p.phase === 'download') progress('indirme', p.pct, p.name);
      else if (p.phase === 'extract') phase('indirme', 'arşiv açılıyor');
    });
    phase('hazırlık', `motor: ${bin.variant}`);

    // --- 2. Model ---
    const modelFile = await models.ensureModel(cfg.whisper.model, (p) => {
      if (p.phase === 'start') phase('indirme', `model ${p.name} indiriliyor (~${p.mb} MB)`);
      else if (p.phase === 'download') progress('indirme', p.pct, 'model');
    });

    let vadModel = null;
    if (cfg.whisper.useVad) {
      vadModel = await models.ensureVadModel((p) => {
        if (p.phase === 'download') progress('indirme', p.pct, 'VAD modeli');
      });
    }

    // --- 3. Ses ---
    const prepared = opts.prepareAudio
      ? opts.prepareAudio(opts.input, workDir)
      : prepareWav(opts.input, workDir, phase);

    // --- 4. Cozumleme ---
    phase('çözümleme', 'konuşma tanıma başlıyor');
    const result = await whisper.runWithFallback({
      exePath: bin.exe,
      modelPath: modelFile,
      wavPath: prepared.path,
      vadModelPath: vadModel,
      cfg,
      workDir,
      onProgress: (p) => progress('çözümleme', p.pct, 'konuşma tanınıyor'),
      onNotice: (m) => phase('uyarı', m)
    });

    // --- 5. Halusinasyon filtresi ---
    const segs = (result.json && result.json.transcription) || [];
    const filtered = hallucination.filterSegments(segs, cfg);
    if (filtered.removed.length) {
      phase('temizlik', `${filtered.removed.length} şüpheli segment atıldı`);
    }

    // --- 6. Kelimeler ---
    let words = tokens.toWords({ transcription: filtered.segments });
    if (!words.length) {
      throw new Error('Konuşma bulunamadı. Ses sessiz olabilir veya dil yanlış seçilmiş olabilir.');
    }
    words = hallucination.dedupeWords(words);
    words = postprocess.processWords(words, cfg);
    phase('metin', `${words.length} kelime işlendi`);

    // --- 7. Segmentasyon ---
    const blocks = segmenter.segment(words, cfg);
    phase('bölme', `${blocks.length} altyazı bloğu`);

    // --- 8. Yazma ---
    const content = cfg.output.format === 'vtt' ? srt.toVtt(blocks, cfg) : srt.toSrt(blocks, cfg);
    srt.write(opts.out, content, cfg);

    const elapsed = (Date.now() - t0) / 1000;
    return {
      output: opts.out,
      blocks: blocks.length,
      words: words.length,
      removed: filtered.removed.length,
      removedDetail: filtered.removed,
      durationSec: prepared.durationSec,
      elapsedSec: +elapsed.toFixed(1),
      speedRealtime: +(prepared.durationSec / elapsed).toFixed(1),
      cpsViolations: blocks.filter((b) => b.cps > cfg.layout.maxCps + 0.5).length,
      lineLengthViolations: blocks.filter(
        (b) => b.lines.some((l) => l.length > cfg.layout.maxCharsPerLine)).length,
      engine: bin.variant
    };
  } finally {
    if (ownWorkDir && !opts.keepTemp) whisper.cleanup(workDir);
  }
}

/** WAV girdiyi 16 kHz mono'ya hazirlar. ffmpeg gerektirmez. */
function prepareWav(inputPath, workDir, phase) {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext !== '.wav' && ext !== '.wave') {
    throw new Error(
      `Bu boru hattı doğrudan yalnızca WAV okur ("${ext}" verildi). ` +
      `Diğer biçimler için ffmpeg gerekir — CLI bunu kendisi hâlleder.`);
  }
  const target = path.join(workDir, 'audio16k.wav');
  phase('ses', 'WAV çözülüyor');
  const d = audio.decodeWav(inputPath);
  phase('ses', `${d.sampleRate} Hz ${d.channels} kanal, ${d.durationSec.toFixed(1)} sn`);
  let s = d.samples;
  if (d.sampleRate !== audio.TARGET_RATE) {
    phase('ses', `${d.sampleRate} Hz → 16000 Hz`);
    s = audio.resample(s, d.sampleRate, audio.TARGET_RATE);
  }
  audio.normalize(s);
  audio.writeWav16k(target, s);
  return { path: target, durationSec: d.durationSec };
}

module.exports = { run, prepareWav };
