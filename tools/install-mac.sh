#!/bin/bash
# TK Caption — Mac kurulumu
#
# Terminal'e yapistirin:
#   curl -fsSL https://raw.githubusercontent.com/tevfikkemal/TKCaption/main/tools/install-mac.sh | bash
#
# Kaldirmak icin sonuna " -s -- --kaldir" ekleyin.
#
# NEDEN ZXP DEGIL: Mac'te ZXP Installer kendinden imzali paketi kurmayi
# reddedebiliyor. Bu betik eklentiyi dogrudan kullanicinin eklenti
# klasorune koyuyor — yonetici parolasi gerekmiyor, guncelleme de ayni
# klasore yazabildigi icin parola sormadan calisiyor.
#
# curl ile inen dosyalarda karantina isareti olmaz; Gatekeeper devreye
# girmez. Tarayicidan indirilen bir .command dosyasi bunu saglayamazdi.

set -euo pipefail

DEPO="tevfikkemal/TKCaption"
ID="com.tklabs.tkcaption"
# Testler icin disaridan degistirilebilir; normal kullanimda dokunmayin
HEDEF_KOK="${TKC_HEDEF:-$HOME/Library/Application Support/Adobe/CEP/extensions}"
HEDEF="$HEDEF_KOK/$ID"
SISTEM="/Library/Application Support/Adobe/CEP/extensions/$ID"

yaz()  { printf '%s\n' "$*"; }
dur()  { printf '\nHATA: %s\n' "$*" >&2; exit 1; }

if [ "${TKC_TEST:-}" != "1" ] && [ "$(uname -s)" != "Darwin" ]; then
  dur "Bu betik yalnizca Mac icindir."
fi

debug_modu() {
  # Imzasiz eklenti yalnizca bu bayrak aciksa yuklenir. Premiere surumune
  # gore CSXS numarasi degisiyor; hepsini aciyoruz.
  [ "${TKC_TEST:-}" = "1" ] && return 0
  for v in 9 10 11 12 13 14; do
    defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 || true
  done
}

if [ "${1:-}" = "--kaldir" ]; then
  rm -rf "$HEDEF"
  yaz "TK Caption kaldirildi: $HEDEF"
  [ -d "$SISTEM" ] && yaz "Sistem klasorunde de kurulum var: sudo rm -rf \"$SISTEM\""
  yaz "Indirilen model ve motor: ~/Library/Application Support/TKCaption (elle silebilirsiniz)"
  exit 0
fi

yaz ""
yaz "TK Caption — Mac kurulumu"
yaz "-------------------------"

# --- Hangi surum? Yayinlanmis surumun etiketini kuruyoruz, ana dali degil:
# ana dalda yayinlanmamis degisiklikler olabilir.
KAYNAK="${TKC_KAYNAK:-}"
GECICI="$(mktemp -d)"
trap 'rm -rf "$GECICI"' EXIT

if [ -z "$KAYNAK" ]; then
  SURUM="$(curl -fsSL "https://raw.githubusercontent.com/$DEPO/main/update.json" \
    | grep -m1 '"version"' | sed -E 's/.*"([0-9][0-9.]*)".*/\1/')" \
    || dur "Surum bilgisi alinamadi. Internet baglantinizi kontrol edin."
  [ -n "$SURUM" ] || dur "Surum bilgisi okunamadi."
  yaz "Surum: $SURUM"

  if ! curl -fsSL "https://codeload.github.com/$DEPO/tar.gz/refs/tags/v$SURUM" -o "$GECICI/paket.tgz"; then
    yaz "(v$SURUM etiketi yok, ana daldan kuruluyor)"
    curl -fsSL "https://codeload.github.com/$DEPO/tar.gz/refs/heads/main" -o "$GECICI/paket.tgz" \
      || dur "Paket indirilemedi."
  fi
  mkdir "$GECICI/acik"
  tar -xzf "$GECICI/paket.tgz" -C "$GECICI/acik"
  KAYNAK="$(find "$GECICI/acik" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
fi

[ -f "$KAYNAK/panel/CSXS/manifest.xml" ] || dur "Paket beklenen yapida degil: $KAYNAK"

# --- Eklenti klasorunu kur: tools/build.js ile AYNI yerlesim ---
#   panel/*        -> kok
#   core/src       -> core/src
#   core/package.json
#   styles/        -> styles/
#   LICENSE
YENI="$GECICI/$ID"
mkdir -p "$YENI/core"
cp -R "$KAYNAK/panel/." "$YENI/"
cp -R "$KAYNAK/core/src" "$YENI/core/src"
cp "$KAYNAK/core/package.json" "$YENI/core/package.json"
[ -d "$KAYNAK/styles" ] && cp -R "$KAYNAK/styles" "$YENI/styles"
cp "$KAYNAK/LICENSE" "$YENI/LICENSE"
# Imzasiz kuruyoruz; eski bir imza klasoru kalmasin
rm -rf "$YENI/META-INF"

# Eskisini ancak yenisi tamamen hazirsa degistir
mkdir -p "$HEDEF_KOK"
if [ -d "$HEDEF" ]; then
  rm -rf "$HEDEF.eski"
  mv "$HEDEF" "$HEDEF.eski"
fi
if ! mv "$YENI" "$HEDEF"; then
  [ -d "$HEDEF.eski" ] && mv "$HEDEF.eski" "$HEDEF"
  dur "Eklenti klasorune yazilamadi: $HEDEF_KOK"
fi
rm -rf "$HEDEF.eski"

# Karantina isareti varsa temizle (curl koymaz ama zarari yok)
command -v xattr >/dev/null 2>&1 && xattr -dr com.apple.quarantine "$HEDEF" 2>/dev/null || true

debug_modu

yaz "Kuruldu: $HEDEF"

if [ -d "$SISTEM" ]; then
  yaz ""
  yaz "UYARI: ZXP Installer ile kurulmus eski bir kopya da var:"
  yaz "  $SISTEM"
  yaz "Iki kopya karisabilir. Silmek icin (parola sorar):"
  yaz "  sudo rm -rf \"$SISTEM\""
fi

yaz ""
yaz "Simdi:"
yaz "  1. Premiere Pro aciksa tamamen kapatin (Cmd+Q) ve yeniden acin"
yaz "  2. Pencere > Uzantilar > TK Caption"
yaz "  3. Ilk altyazida konusma modeli iner (~570 MB), bir kez"
yaz ""
