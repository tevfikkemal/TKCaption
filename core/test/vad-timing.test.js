'use strict';
/**
 * VAD zaman damgalarini kaydiriyor mu?
 *
 * Sikayet: uzun bir projede altyazilar bosluksuz, bastan itibaren dumduz
 * diziliyor. Supheli whisper.cpp'nin --vad'i: sessizlikleri kesip atarak
 * isliyor; zaman damgalarini orijinal sese geri eslemiyorsa tum konusma
 * bosluklari yok sayilmis gibi one kayar.
 *
 * Deney: bilinen bir sesin BASINA 30 sn sessizlik ekle.
 *   VAD kapali -> ilk altyazi ~30. saniyede baslamali
 *   VAD acik   -> ~30. saniyede baslamiyorsa hata dogrulanir
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const audio = require('../src/audio.js');
const models = require('../src/models.js');
const whisper = require('../src/whisper.js');
const tokens = require('../src/tokens.js');
const configMod = require('../src/config.js');

const SILENCE_SEC = 30;

function buildInput(sourceWav, workDir) {
  const d = audio.decodeWav(sourceWav);
  let s = d.samples;
  if (d.sampleRate !== audio.TARGET_RATE) {
    s = audio.resample(s, d.sampleRate, audio.TARGET_RATE);
  }
  const pad = SILENCE_SEC * audio.TARGET_RATE;
  const out = new Float32Array(pad + s.length);
  out.set(s, pad);                       // basa sessizlik
  const p = path.join(workDir, 'sessizlik-once.wav');
  audio.writeWav16k(p, out);
  return { path: p, speechStartsAt: SILENCE_SEC, totalSec: out.length / audio.TARGET_RATE };
}

async function transcribe(wavPath, useVad, workDir, bin, modelFile, vadModel) {
  const cfg = configMod.load();
  cfg.whisper.useVad = useVad;
  const dir = path.join(workDir, useVad ? 'vad-acik' : 'vad-kapali');
  fs.mkdirSync(dir, { recursive: true });
  const res = await whisper.runWithFallback({
    exePath: bin.exe,
    modelPath: modelFile,
    wavPath,
    vadModelPath: useVad ? vadModel : null,
    cfg,
    workDir: dir
  });
  const words = tokens.toWords(res.json);
  const segs = (res.json && res.json.transcription) || [];
  return {
    firstWord: words.length ? words[0].start : NaN,
    lastWord: words.length ? words[words.length - 1].end : NaN,
    wordCount: words.length,
    firstSegText: segs.length ? (segs[0].text || '').trim().slice(0, 45) : '',
    segCount: segs.length
  };
}

(async () => {
  const src = process.argv[2];
  if (!src || !fs.existsSync(src)) {
    console.error('kullanim: node core/test/vad-timing.test.js <kaynak.wav>');
    process.exit(2);
  }

  const workDir = whisper.safeTempDir();
  try {
    const bin = await models.ensureBinary();
    const cfg = configMod.load();
    const modelFile = models.modelPath(cfg.whisper.model);
    const vadModel = await models.ensureVadModel();

    const input = buildInput(src, workDir);
    console.log(`girdi: ${input.totalSec.toFixed(1)} sn`);
    console.log(`konusma ${input.speechStartsAt} sn'de basliyor (oncesi tam sessizlik)\n`);

    const off = await transcribe(input.path, false, workDir, bin, modelFile, vadModel);
    const on = await transcribe(input.path, true, workDir, bin, modelFile, vadModel);

    const row = (ad, r) =>
      `  ${ad.padEnd(12)} ilk kelime ${String(r.firstWord.toFixed(2)).padStart(7)} sn   ` +
      `son ${String(r.lastWord.toFixed(2)).padStart(7)} sn   ${r.wordCount} kelime`;

    console.log(row('VAD kapali', off));
    console.log(row('VAD acik', on));
    console.log();

    const tol = 3.0;
    const offOk = Math.abs(off.firstWord - SILENCE_SEC) < tol;
    const onOk = Math.abs(on.firstWord - SILENCE_SEC) < tol;

    console.log(`  VAD kapali dogru mu : ${offOk ? 'EVET' : 'HAYIR'} (beklenen ~${SILENCE_SEC} sn)`);
    console.log(`  VAD acik dogru mu   : ${onOk ? 'EVET' : 'HAYIR'} (beklenen ~${SILENCE_SEC} sn)`);
    console.log();

    if (offOk && !onOk) {
      console.log('  >> HATA DOGRULANDI: VAD zaman damgalarini kaydiriyor.');
      console.log(`     VAD ile ilk kelime ${on.firstWord.toFixed(2)} sn'de gorunuyor,`);
      console.log(`     oysa konusma ${SILENCE_SEC} sn'de basliyor.`);
      console.log(`     Kayma: ${(SILENCE_SEC - on.firstWord).toFixed(1)} sn`);
      process.exit(1);
    }
    if (offOk && onOk) {
      console.log('  >> VAD zamanlamayi bozmuyor. Sorun baska yerde.');
      process.exit(0);
    }
    console.log('  >> VAD kapaliyken de zamanlama yanlis — sorun VAD disinda.');
    process.exit(1);
  } finally {
    whisper.cleanup(workDir);
  }
})();
