#!/usr/bin/env node
'use strict';
/**
 * Dagitim paketi uretir.
 *
 * Gelistirme yerlesiminde core/ depo kokunde, panel/ ayri durur ve panel bir
 * junction uzerinden gorunur. Dagitimda ise HER SEY tek bir eklenti klasorunun
 * icinde olmali; kullanicida junction kuracak bir sey yok.
 *
 * Uretilen yapi:
 *   dist/com.tklabs.tkcaption/     <- Adobe CEP eklenti klasoru
 *     CSXS/ css/ js/ jsx/ index.html
 *     core/src/                    <- panel bunu require eder
 *     LICENSE  SURUM.txt
 *   dist/KUR.ps1                   <- kurulum betigi
 *   dist/TKCaption-<surum>.zip     <- arkadaslara verilecek dosya
 *
 * models/ ve bin/ PAKETE GIRMEZ (1.2 GB). Ilk calistirmada kullanicinin
 * veri klasorune iner — bkz. core/src/models.js dataRoot().
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const EXT_ID = 'com.tklabs.tkcaption';
const OUT = path.join(DIST, EXT_ID);

function readVersion() {
  const xml = fs.readFileSync(path.join(ROOT, 'panel', 'CSXS', 'manifest.xml'), 'utf8');
  const m = /ExtensionBundleVersion="([^"]+)"/.exec(xml);
  return m ? m[1] : '0.0.0';
}

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {}
}

function copyDir(src, dest, filter) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (filter && !filter(s, entry)) continue;
    if (entry.isDirectory()) copyDir(s, d, filter);
    else fs.copyFileSync(s, d);
  }
}

function sizeOf(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? sizeOf(p) : fs.statSync(p).size;
  }
  return total;
}

const INSTALLER = `<#
  TK Caption — kurulum

  Ne yapar:
   1. Adobe'un imzasiz panelleri yuklemesi icin gereken PlayerDebugMode
      bayragini acar. HKCU altindadir, yonetici gerektirmez.
   2. Eklentiyi kullanicinin CEP klasorune kopyalar.

  Kaldirmak icin: powershell -ExecutionPolicy Bypass -File KUR.ps1 -Kaldir
#>

param([switch]$Kaldir)

$ErrorActionPreference = 'Stop'
$ExtId  = '${EXT_ID}'
$Kaynak = Join-Path $PSScriptRoot $ExtId
$CepDir = Join-Path $env:APPDATA 'Adobe\\CEP\\extensions'
$Hedef  = Join-Path $CepDir $ExtId

if ($Kaldir) {
    Write-Host ""
    Write-Host "TK Caption kaldiriliyor..." -ForegroundColor Yellow
    if (Test-Path $Hedef) {
        $item = Get-Item $Hedef -Force
        if ($item.LinkType -eq 'Junction') { $item.Delete() } else { Remove-Item $Hedef -Recurse -Force }
        Write-Host "  Eklenti silindi."
    } else {
        Write-Host "  Eklenti zaten yok."
    }
    Write-Host ""
    Write-Host "  Not: indirilen modeller silinmedi." -ForegroundColor DarkGray
    Write-Host "  Onlari da silmek isterseniz: $env:APPDATA\\TKCaption" -ForegroundColor DarkGray
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "TK Caption kurulumu" -ForegroundColor Cyan
Write-Host ("-" * 44)

if (-not (Test-Path (Join-Path $Kaynak 'CSXS\\manifest.xml'))) {
    Write-Host "HATA: $ExtId klasoru bulunamadi." -ForegroundColor Red
    Write-Host "Zip dosyasinin TAMAMINI ayni klasore cikardiginizdan emin olun." -ForegroundColor Red
    exit 1
}

# Premiere acikken kopyalama yaparsak panel bozuk yuklenir
$premiere = Get-Process 'Adobe Premiere Pro' -ErrorAction SilentlyContinue
if ($premiere) {
    Write-Host ""
    Write-Host "  UYARI: Premiere Pro su an acik." -ForegroundColor Yellow
    Write-Host "  Kuruluma devam edilebilir ama panelin gorunmesi icin" -ForegroundColor Yellow
    Write-Host "  Premiere'i kapatip yeniden acmaniz gerekecek." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host ""
Write-Host "PlayerDebugMode aciliyor" -ForegroundColor Cyan
foreach ($v in 9..14) {
    $key = "HKCU:\\Software\\Adobe\\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    Set-ItemProperty -Path $key -Name 'PlayerDebugMode' -Value '1' -Type String
}
Write-Host "  CSXS.9 - CSXS.14 tamam"

Write-Host ""
Write-Host "Eklenti kopyalaniyor" -ForegroundColor Cyan
if (-not (Test-Path $CepDir)) { New-Item -ItemType Directory -Path $CepDir -Force | Out-Null }
if (Test-Path $Hedef) {
    $item = Get-Item $Hedef -Force
    if ($item.LinkType -eq 'Junction') { $item.Delete() } else { Remove-Item $Hedef -Recurse -Force }
    Write-Host "  Onceki surum kaldirildi"
}
Copy-Item -Path $Kaynak -Destination $Hedef -Recurse -Force
Write-Host "  $Hedef"

Write-Host ""
Write-Host ("-" * 44)
Write-Host "Kurulum tamam." -ForegroundColor Green
Write-Host @"

Simdi:
  1. Premiere Pro'yu KAPATIP yeniden acin
  2. Pencere > Uzantilar > TK Caption

Ilk calistirmada konusma tanima modeli inecek (~570 MB).
Bir kez iner, sonrasinda internet gerekmez.

Panel gorunmuyorsa:
  - Premiere surumunuz 25.0 veya ustu olmali
  - Gorev yoneticisinden CEPHtmlEngine sureclerini kapatip tekrar deneyin

"@
`;

/* ------------------------------------------------------------------ */

function build() {
  const version = readVersion();
  console.log(`TK Caption ${version} paketleniyor\n`);

  rmrf(DIST);
  fs.mkdirSync(OUT, { recursive: true });

  // --- Panel dosyalari ---
  copyDir(path.join(ROOT, 'panel'), OUT);
  console.log('  panel/      -> eklenti koku');

  // --- Cekirdek (yalnizca src; test ve arac dosyalari kullaniciya gerekmez) ---
  copyDir(path.join(ROOT, 'core', 'src'), path.join(OUT, 'core', 'src'));
  fs.copyFileSync(path.join(ROOT, 'core', 'package.json'),
                  path.join(OUT, 'core', 'package.json'));
  console.log('  core/src/   -> eklentinin icine');

  // --- Lisans ve surum ---
  fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(OUT, 'LICENSE'));
  fs.writeFileSync(path.join(OUT, 'SURUM.txt'),
    `TK Caption ${version}\nby TK Labs\n\n` +
    `Derleme: ${new Date().toISOString()}\n` +
    `Kaynak : https://github.com/tevfikkemal/TKCaption\n`);

  // --- Kurulum betigi ---
  fs.writeFileSync(path.join(DIST, 'KUR.ps1'), INSTALLER);
  console.log('  KUR.ps1     -> kurulum betigi');

  // --- Kisa okuma dosyasi ---
  fs.writeFileSync(path.join(DIST, 'OKUBENI.txt'),
`TK Caption ${version} — Premiere Pro icin Turkce otomatik altyazi
by TK Labs

KURULUM
  1. Bu klasordeki dosyalarin HEPSINI ayni yere cikarin
  2. KUR.ps1 dosyasina sag tiklayin > "PowerShell ile calistir"
     (veya PowerShell'de: powershell -ExecutionPolicy Bypass -File KUR.ps1)
  3. Premiere Pro'yu kapatip yeniden acin
  4. Pencere > Uzantilar > TK Caption

GEREKSINIMLER
  - Adobe Premiere Pro 2025 veya uzeri
  - Windows
  - Ilk calistirma icin internet (model indirilecek, ~570 MB)

NASIL CALISIR
  Zaman cizelgesinde bir sekans acin, panelde "Altyazi Olustur" dugmesine
  basin. Sesi cikarir, bilgisayarinizda cozumler ve altyaziyi sekansa
  yerlestirir. Ses hicbir yere gonderilmez, hicbir ucret yoktur.

  NVIDIA ekran karti varsa cok daha hizli calisir.

KALDIRMA
  powershell -ExecutionPolicy Bypass -File KUR.ps1 -Kaldir

SORUN OLURSA
  Panelde "Gelismis / Teshis" bolumunu acip "Teshis raporunu kopyala"
  dugmesine basin, ciktiyi paylasin.

  https://github.com/tevfikkemal/TKCaption
`);

  // --- Zip ---
  const zipName = `TKCaption-${version}.zip`;
  const zipPath = path.join(DIST, zipName);
  try {
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Compress-Archive -Path '${OUT}','${path.join(DIST, 'KUR.ps1')}','${path.join(DIST, 'OKUBENI.txt')}' ` +
      `-DestinationPath '${zipPath}' -Force`
    ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 });
    console.log(`  ${zipName}`);
  } catch (e) {
    console.log('  (zip olusturulamadi: ' + e.message.split('\n')[0] + ')');
  }

  const kb = (sizeOf(OUT) / 1024).toFixed(0);
  console.log(`\nHazir: ${DIST}`);
  console.log(`  eklenti boyutu: ${kb} KB (model ve motor haric)`);
  if (fs.existsSync(zipPath)) {
    console.log(`  zip: ${(fs.statSync(zipPath).size / 1024).toFixed(0)} KB`);
  }
  console.log(`\nArkadaslariniza ${zipName} dosyasini verin.`);
}

if (require.main === module) build();
module.exports = { build };
