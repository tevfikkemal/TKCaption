#!/usr/bin/env node
'use strict';
/**
 * MOGRT sablonlarini tarar, panelin kullanacagi katalogu uretir.
 *
 * NEDEN: .mogrt aslinda bir zip. Icinde definition.json (parametreler) ve
 * thumb.png (onizleme) var. Panel her acilista 50 dosyayi acip okuyamaz —
 * bir kez tarayip kucuk bir katalog ve kucuk onizleme dosyalari uretiyoruz.
 *
 * OLCULEN YAPI:
 *   clientControls[].type === 6  -> metin parametresi (altyaziyi buraya yazacagiz)
 *   clientControls[].type === 4  -> renk parametresi
 *   thumb.png                    -> hazir onizleme
 *
 * Metin parametresinin ADI sablondan sablona degisiyor ("apple middle",
 * "Texto", "Subtitle"...). Bu yuzden ada gore degil TURE gore buluyoruz;
 * ilk type 6 kontrolu metin alanidir.
 *
 * Kullanim:
 *   node tools/mogrt-catalog.js ["kaynak klasor"] [hedef klasor]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const KAYNAK = process.argv[2] || path.join(ROOT, 'mogrt sablonlar');
const HEDEF = process.argv[3] || path.join(ROOT, 'panel', 'mogrt');

/** .mogrt bir zip; tek dosyayi PowerShell ile cikariyoruz (harici arac yok) */
function zipDosyaOku(zipYolu, icDosya) {
  const ps = [
    '$ErrorActionPreference="Stop"',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    '$z=[System.IO.Compression.ZipFile]::OpenRead(' + psStr(zipYolu) + ')',
    'try {',
    '  $e=$z.Entries | Where-Object { $_.FullName -eq ' + psStr(icDosya) + ' } | Select-Object -First 1',
    '  if (-not $e) { exit 2 }',
    '  $s=$e.Open(); $ms=New-Object System.IO.MemoryStream',
    '  $s.CopyTo($ms); $s.Close()',
    '  [Console]::Out.Write([Convert]::ToBase64String($ms.ToArray()))',
    '} finally { $z.Dispose() }'
  ].join('; ');
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
    return Buffer.from(out.trim(), 'base64');
  } catch (e) {
    return null;
  }
}

function psStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

/** clientControls icinde ilk metin (type 6) kontrolunu bulur */
function metinKontrolu(def) {
  const cc = def.clientControls;
  if (!Array.isArray(cc)) return null;
  for (let i = 0; i < cc.length; i++) {
    if (cc[i] && cc[i].type === 6) {
      return {
        index: i,
        id: cc[i].id || '',
        ad: strDb(cc[i].uiName),
        font: (cc[i].fonteditinfo && cc[i].fonteditinfo.fontEditValue) || '',
        punto: (cc[i].fonteditinfo && cc[i].fonteditinfo.fontSizeEditValue) || 0
      };
    }
  }
  return null;
}

/** Adobe'un cok dilli string yapisindan ilk degeri alir */
function strDb(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v.strDB && v.strDB.length) return String(v.strDB[0].str || '');
  return '';
}

/* ------------------------------------------------------------------ */

if (!fs.existsSync(KAYNAK)) {
  console.error('HATA: kaynak klasor yok: ' + KAYNAK);
  process.exit(1);
}

const dosyalar = fs.readdirSync(KAYNAK)
  .filter((f) => f.toLowerCase().endsWith('.mogrt'))
  .sort();

if (!dosyalar.length) {
  console.error('HATA: .mogrt bulunamadi: ' + KAYNAK);
  process.exit(1);
}

fs.mkdirSync(path.join(HEDEF, 'thumbs'), { recursive: true });

console.log('\nMOGRT katalogu uretiliyor — ' + dosyalar.length + ' sablon\n');

const items = [];
let atlanan = 0;

for (const dosya of dosyalar) {
  const tam = path.join(KAYNAK, dosya);
  const ad = dosya.replace(/\.mogrt$/i, '');

  const defBuf = zipDosyaOku(tam, 'definition.json');
  if (!defBuf) { console.log('  ATLA  ' + ad + ' — definition.json okunamadi'); atlanan++; continue; }

  let def;
  try { def = JSON.parse(defBuf.toString('utf8')); }
  catch (e) { console.log('  ATLA  ' + ad + ' — definition.json bozuk'); atlanan++; continue; }

  const metin = metinKontrolu(def);
  if (!metin) {
    // Metin parametresi olmayan sablona altyazi yazamayiz; listeye almak
    // kullaniciyi calismayan bir secenekle karsi karsiya birakirdi.
    console.log('  ATLA  ' + ad + ' — metin parametresi yok');
    atlanan++;
    continue;
  }

  // Onizleme: thumb.png varsa cikar
  let thumb = '';
  const pngBuf = zipDosyaOku(tam, 'thumb.png');
  if (pngBuf && pngBuf.length) {
    const tAd = ad.replace(/[^A-Za-z0-9 _.-]/g, '_') + '.png';
    fs.writeFileSync(path.join(HEDEF, 'thumbs', tAd), pngBuf);
    thumb = 'thumbs/' + tAd;
  }

  items.push({
    id: ad.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, ''),
    ad: ad,
    dosya: dosya,
    metinIndex: metin.index,
    metinAdi: metin.ad,
    font: metin.font,
    punto: metin.punto,
    thumb: thumb
  });

  console.log('  OK    ' + ad + (thumb ? '' : '  (onizleme yok)'));
}

const katalog = {
  version: 1,
  uretim: new Date().toISOString(),
  sayi: items.length,
  items: items
};
fs.writeFileSync(path.join(HEDEF, 'catalog.json'),
                 JSON.stringify(katalog, null, 2) + '\n');

const thumbBoyut = fs.readdirSync(path.join(HEDEF, 'thumbs'))
  .reduce((t, f) => t + fs.statSync(path.join(HEDEF, 'thumbs', f)).size, 0);

console.log('\n' + items.length + ' sablon kataloglandi' +
            (atlanan ? ', ' + atlanan + ' atlandi' : ''));
console.log('  katalog   : ' + path.join(HEDEF, 'catalog.json'));
console.log('  onizleme  : ' + (thumbBoyut / 1048576).toFixed(1) + ' MB');
console.log('\nNOT: .mogrt dosyalarinin KENDISI pakete girmiyor (114 MB).');
console.log('Panel onlari kullanicinin sablon klasorunden okuyacak.');
