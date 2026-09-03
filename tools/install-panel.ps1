<#
  TK Caption — geliştirme kurulumu

  İki iş yapar:
   1. PlayerDebugMode'u açar. Adobe, imzalanmamış CEP panellerini yalnızca bu
      geliştirici bayrağı açıkken yükler. HKCU altındadır, yönetici gerektirmez
      ve -Uninstall ile geri alınır.
   2. Kullanıcının CEP eklenti klasöründen bu depodaki panel/ klasörüne bir
      junction (dizin bağlantısı) kurar. Kopya değil bağlantı olduğu için
      koddaki değişiklik anında panele yansır — panel yeniden açılınca görünür.

  Kullanım:
    powershell -ExecutionPolicy Bypass -File tools\install-panel.ps1
    powershell -ExecutionPolicy Bypass -File tools\install-panel.ps1 -Uninstall
#>

param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'

$ExtensionId = 'com.tklabs.tkcaption'
$RepoRoot    = Split-Path -Parent $PSScriptRoot
$PanelSource = Join-Path $RepoRoot 'panel'
$CepDir      = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$LinkPath    = Join-Path $CepDir $ExtensionId

# Premiere 2025/2026'nın hangi CSXS sürümünü kullandığı kesin değil;
# bilinen aralığın tamamına yazmak zararsız ve en güvenli yol.
$CsxsVersions = 9..14

function Write-Step($msg) { Write-Host "  $msg" }

if ($Uninstall) {
    Write-Host "`nTK Caption kaldiriliyor..." -ForegroundColor Yellow

    if (Test-Path $LinkPath) {
        $item = Get-Item $LinkPath -Force
        if ($item.LinkType -eq 'Junction') {
            # Junction'ı silerken hedefi silmemeye dikkat: Delete() bağlantıyı kaldırır
            $item.Delete()
            Write-Step "Baglanti kaldirildi: $LinkPath"
        } else {
            Remove-Item $LinkPath -Recurse -Force
            Write-Step "Klasor silindi: $LinkPath"
        }
    } else {
        Write-Step "Baglanti zaten yok."
    }

    foreach ($v in $CsxsVersions) {
        $key = "HKCU:\Software\Adobe\CSXS.$v"
        if (Test-Path $key) {
            try {
                Remove-ItemProperty -Path $key -Name 'PlayerDebugMode' -ErrorAction Stop
                Write-Step "PlayerDebugMode kaldirildi: CSXS.$v"
            } catch {}
        }
    }
    Write-Host "`nKaldirildi.`n" -ForegroundColor Green
    exit 0
}

Write-Host "`nTK Caption gelistirme kurulumu" -ForegroundColor Cyan
Write-Host ("-" * 46)

# --- 1. Kaynak dogrulama ---
if (-not (Test-Path (Join-Path $PanelSource 'CSXS\manifest.xml'))) {
    Write-Host "HATA: panel\CSXS\manifest.xml bulunamadi." -ForegroundColor Red
    Write-Host "Bu betigi depo icinden calistirin." -ForegroundColor Red
    exit 1
}
Write-Step "Panel kaynagi: $PanelSource"

# --- 2. PlayerDebugMode ---
Write-Host "`nPlayerDebugMode (imzasiz panel yukleme izni)" -ForegroundColor Cyan
foreach ($v in $CsxsVersions) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    Set-ItemProperty -Path $key -Name 'PlayerDebugMode' -Value '1' -Type String
}
Write-Step "CSXS.9 - CSXS.14 icin acildi"

# --- 3. Junction ---
Write-Host "`nEklenti baglantisi" -ForegroundColor Cyan
if (-not (Test-Path $CepDir)) {
    New-Item -ItemType Directory -Path $CepDir -Force | Out-Null
    Write-Step "CEP klasoru olusturuldu: $CepDir"
}

if (Test-Path $LinkPath) {
    $item = Get-Item $LinkPath -Force
    if ($item.LinkType -eq 'Junction') {
        $item.Delete()
        Write-Step "Eski baglanti kaldirildi"
    } else {
        Write-Host "  UYARI: $LinkPath bir junction degil, gercek klasor." -ForegroundColor Yellow
        Write-Host "  Uzerine yazmiyorum. Elle silip tekrar calistirin." -ForegroundColor Yellow
        exit 1
    }
}

New-Item -ItemType Junction -Path $LinkPath -Target $PanelSource | Out-Null
Write-Step "Baglandi: $LinkPath"
Write-Step "        -> $PanelSource"

# --- 4. Ozet ---
Write-Host "`n" ("-" * 46)
Write-Host "Kurulum tamam." -ForegroundColor Green
Write-Host @"

Simdi:
  1. Premiere Pro'yu KAPATIP yeniden acin (calisiyorsa)
  2. Pencere > Uzantilar > TK Caption

Panel gorunmezse:
  - Premiere surumu 25.0'dan eski olabilir (manifest siniri)
  - CEPHtmlEngine surecini gorev yoneticisinden kapatip tekrar deneyin

Kaldirmak icin:
  powershell -ExecutionPolicy Bypass -File tools\install-panel.ps1 -Uninstall

"@
