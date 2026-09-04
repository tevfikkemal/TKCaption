'use strict';
/**
 * Yukseltilmis tasima betiginin testi.
 *
 * NEDEN AYRI TEST: ZXP Installer eklentiyi Program Files altina kuruyor;
 * orada guncelleme ancak yonetici yetkisiyle yapilabiliyor. O kod yolu
 * yalnizca UAC istemiyle calissaydi hic test edilemezdi. Bu yuzden betik
 * uretimi (tasimaBetigiYaz) tasimadan ayrildi: burada betigi YUKSELTMEDEN,
 * yazilabilir gecici klasorlerde calistirip mantigini dogruluyoruz.
 *
 * Dogrulanan: guncelleme, yeni klasor acma, yedekleme ve — en onemlisi —
 * yarida kalan bir tasimanin geri alinmasi.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const u = require('../src/updater.js');

let ok = 0, hata = 0;
function t(ad, f) {
  try { f(); console.log('  OK   ' + ad); ok++; }
  catch (e) { console.log('  HATA ' + ad + ' -> ' + e.message); hata++; }
}
function esit(a, b, m) {
  if (a !== b) throw new Error((m ? m + ': ' : '') + 'beklenen=' + b + ' gelen=' + a);
}

/** Betigi yukseltmeden calistirir; sonuc dosyasinin icerigini dondurur. */
function calistir(y) {
  try {
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', y.betik],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
  } catch (_) { /* betik hata yolunda exit 1 verir; sonuc dosyasina bakiyoruz */ }
  return fs.existsSync(y.sonuc)
    ? fs.readFileSync(y.sonuc, 'utf8').replace(/^﻿/, '').trim()
    : '';
}

function yaz(kok, rel, icerik) {
  const p = path.join(kok, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, icerik);
  return p;
}
function oku(kok, rel) {
  return fs.readFileSync(path.join(kok, rel), 'utf8');
}

/* ------------------------------------------------------------------ */

console.log('\n=== BASARILI TASIMA ===');
{
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'tkc-tas-'));
  const staging = path.join(kok, 'staging');
  const hedef = path.join(kok, 'hedef');
  const files = [{ path: 'core/a.js' }, { path: 'js/b.js' }, { path: 'yeni/c.js' }];

  files.forEach(function (f) { yaz(staging, f.path, 'YENI ' + f.path); });
  // Ilk ikisi hedefte var; ucuncusu yeni gelen bir dosya.
  yaz(hedef, 'core/a.js', 'ESKI core/a.js');
  yaz(hedef, 'js/b.js', 'ESKI js/b.js');

  const y = u.tasimaBetigiYaz(staging, hedef, files);
  const sonuc = calistir(y);

  t('sonuc OK', function () { esit(sonuc, 'OK'); });
  t('var olan dosya guncellendi', function () { esit(oku(hedef, 'core/a.js'), 'YENI core/a.js'); });
  t('yeni klasor acildi', function () { esit(oku(hedef, 'yeni/c.js'), 'YENI yeni/c.js'); });
  t('eski surum yedeklendi', function () { esit(oku(y.yedek, 'core/a.js'), 'ESKI core/a.js'); });
  t('olmayan dosya yedeklenmedi', function () {
    esit(fs.existsSync(path.join(y.yedek, 'yeni/c.js')), false);
  });

  fs.rmSync(kok, { recursive: true, force: true });
}

console.log('\n=== YARIDA KALAN TASIMA GERI ALINIYOR ===');
{
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'tkc-geri-'));
  const staging = path.join(kok, 'staging');
  const hedef = path.join(kok, 'hedef');
  // Listede uc dosya var ama staging'de ikincisi YOK — tasima ortasinda
  // duser. Gercekte de yarim inen bir guncelleme boyle davranir.
  const files = [{ path: 'a.js' }, { path: 'eksik.js' }, { path: 'c.js' }];

  yaz(staging, 'a.js', 'YENI a');
  yaz(staging, 'c.js', 'YENI c');
  yaz(hedef, 'a.js', 'ESKI a');
  yaz(hedef, 'eksik.js', 'ESKI eksik');
  yaz(hedef, 'c.js', 'ESKI c');

  const y = u.tasimaBetigiYaz(staging, hedef, files);
  const sonuc = calistir(y);

  t('sonuc HATA bildiriyor', function () {
    if (sonuc.indexOf('HATA') !== 0) throw new Error('gelen: ' + sonuc);
  });
  t('yazilan dosya eski haline dondu', function () { esit(oku(hedef, 'a.js'), 'ESKI a'); });
  t('sonraki dosyaya hic dokunulmadi', function () { esit(oku(hedef, 'c.js'), 'ESKI c'); });
  t('hedef bozulmadan kaldi', function () { esit(oku(hedef, 'eksik.js'), 'ESKI eksik'); });

  fs.rmSync(kok, { recursive: true, force: true });
}

console.log('\n=== YOLDA BOSLUK VE TEK TIRNAK ===');
{
  // Kullanici adinda bosluk, klasor adinda tek tirnak — ikisi de gercekte
  // gorulur ve ikisi de PowerShell dizgisini bozabilir.
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'tkc-yol-'));
  const staging = path.join(kok, "bos luk 'tirnak");
  const hedef = path.join(kok, "he def");
  const files = [{ path: 'a.js' }];
  yaz(staging, 'a.js', 'YENI');
  yaz(hedef, 'a.js', 'ESKI');

  const y = u.tasimaBetigiYaz(staging, hedef, files);
  const sonuc = calistir(y);

  t('bosluklu/tirnakli yolda calisti', function () { esit(sonuc, 'OK'); });
  t('dosya guncellendi', function () { esit(oku(hedef, 'a.js'), 'YENI'); });

  fs.rmSync(kok, { recursive: true, force: true });
}

console.log('\n=== YAZILABILIRLIK OLCUMU ===');
{
  t('gecici klasor yazilabilir', function () { esit(u.yazilabilir(os.tmpdir()), true); });
  t('olmayan klasor yazilamaz', function () {
    esit(u.yazilabilir(path.join(os.tmpdir(), 'yok-boyle-bir-yer-12345')), false);
  });
}

console.log('\n================================');
if (hata === 0) {
  console.log('TUM TESTLER GECTI (' + ok + ')');
} else {
  console.log(hata + ' TEST BASARISIZ');
  process.exit(1);
}
