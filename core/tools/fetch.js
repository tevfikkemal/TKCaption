#!/usr/bin/env node
'use strict';
/**
 * Motor ve model dosyalarini onceden indirir.
 * Kullanim: node core/tools/fetch.js [varyant] [model]
 */
const models = require('../src/models.js');

const variant = process.argv[2] || models.recommendVariant();
const modelName = process.argv[3] || 'large-v3-turbo-q5_0';

function bar(name, p) {
  const w = 30;
  const filled = Math.round((p.pct || 0) * w);
  const mb = (p.got / 1048576).toFixed(0);
  const tot = (p.total / 1048576).toFixed(0);
  process.stdout.write(
    `\r${name.padEnd(26)} [${'#'.repeat(filled)}${'.'.repeat(w - filled)}] ` +
    `${String(Math.round((p.pct || 0) * 100)).padStart(3)}%  ${mb}/${tot} MB   `);
}

(async () => {
  const t0 = Date.now();
  try {
    console.log(`Varyant: ${variant}   Model: ${modelName}\n`);

    const bin = await models.ensureBinary(variant, (p) => {
      if (p.phase === 'download') bar(p.name, p);
      else if (p.phase === 'start') console.log(`-> ${p.name} indiriliyor (~${p.mb} MB)`);
      else if (p.phase === 'extract') console.log(`\n-> arsiv aciliyor: ${p.name}`);
      else if (p.phase === 'done') console.log(`\n-> tamam: ${p.name}`);
    });
    console.log(`Calistirilabilir: ${bin.exe}\n`);

    const mp = await models.ensureModel(modelName, (p) => {
      if (p.phase === 'download') bar('model ' + p.name, p);
      else if (p.phase === 'start') console.log(`-> model ${p.name} indiriliyor (~${p.mb} MB)`);
      else if (p.phase === 'done') console.log(`\n-> tamam: model ${p.name}`);
    });
    console.log(`Model: ${mp}\n`);

    const vad = await models.ensureVadModel((p) => {
      if (p.phase === 'download') bar('VAD', p);
      else if (p.phase === 'start') console.log(`-> VAD modeli indiriliyor (~${p.mb} MB)`);
    });
    console.log(`\nVAD: ${vad}`);

    console.log(`\nHAZIR. Toplam sure: ${((Date.now() - t0) / 1000).toFixed(0)} sn`);
  } catch (e) {
    console.error('\nHATA: ' + e.message);
    process.exit(1);
  }
})();
