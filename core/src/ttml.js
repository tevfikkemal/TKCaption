'use strict';

/**
 * TTML (Timed Text Markup Language) altyazi yazici.
 *
 * NEDEN GEREKLI:
 * SRT zaman bazlidir ve KARE HIZI TASIMAZ. Premiere bir SRT'yi iceri
 * alirken ogeye kendi varsayimini atar (olculdu: 30 fps). Sekans 60 fps
 * ise altyazi kayar — kullanicinin bildirdigi hata tam olarak budur.
 *
 * TTML kare hizini dosyanin ICINDE tasir (ttp:frameRate), dolayisiyla
 * Premiere'in tahmin etmesine gerek kalmaz.
 *
 * Premiere .xml uzantili TTML dosyalarini altyazi olarak iceri alir.
 */

function pad(n, w) {
  return String(Math.floor(n)).padStart(w, '0');
}

/** saniye -> "HH:MM:SS.mmm" (TTML media zaman bicimi) */
function formatTime(sec) {
  let ms = Math.round(Math.max(0, sec) * 1000);
  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const m = Math.floor(ms / 60000); ms -= m * 60000;
  const s = Math.floor(ms / 1000); ms -= s * 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * NTSC kare hizlari (29.97, 59.94) TTML'de tam sayi + carpan olarak
 * ifade edilir: frameRate="60" frameRateMultiplier="1000 1001".
 */
function frameRateParts(fps) {
  const f = Number(fps) || 25;
  const nearest = Math.round(f);
  const isNtsc = Math.abs(f - nearest * 1000 / 1001) < 0.01;
  return {
    rate: isNtsc ? nearest : (Number.isInteger(f) ? f : nearest),
    multiplier: isNtsc ? '1000 1001' : '1 1'
  };
}

function toTtml(blocks, cfg) {
  const offset = (cfg && cfg.output && cfg.output.timecodeOffsetSec) || 0;
  const scale = (cfg && cfg.output && cfg.output.timeScale) || 1;
  const fps = (cfg && cfg.layout && cfg.layout.fps) || 25;
  const fr = frameRateParts(fps);
  const lang = (cfg && cfg.whisper && cfg.whisper.language) || 'tr';

  const out = [];
  out.push('<?xml version="1.0" encoding="utf-8"?>');
  out.push('<tt xmlns="http://www.w3.org/ns/ttml"');
  out.push('    xmlns:tts="http://www.w3.org/ns/ttml#styling"');
  out.push('    xmlns:ttp="http://www.w3.org/ns/ttml#parameter"');
  out.push('    ttp:timeBase="media"');
  out.push(`    ttp:frameRate="${fr.rate}"`);
  out.push(`    ttp:frameRateMultiplier="${fr.multiplier}"`);
  out.push(`    xml:lang="${escapeXml(lang)}">`);
  out.push('  <head>');
  out.push('    <styling>');
  out.push('      <style xml:id="tk" tts:fontFamily="sansSerif" tts:fontSize="80%"');
  out.push('             tts:color="white" tts:textAlign="center"/>');
  out.push('    </styling>');
  out.push('    <layout>');
  out.push('      <region xml:id="alt" tts:origin="10% 80%" tts:extent="80% 20%"');
  out.push('              tts:displayAlign="after"/>');
  out.push('    </layout>');
  out.push('  </head>');
  out.push('  <body>');
  out.push('    <div>');

  for (const b of blocks) {
    const lines = b.lines ? b.lines : String(b.text || '').split('\n');
    const text = lines.filter(Boolean).map(escapeXml).join('<br/>');
    if (!text) continue;
    out.push(`      <p region="alt" style="tk" begin="${formatTime(b.start * scale + offset)}" ` +
             `end="${formatTime(b.end * scale + offset)}">${text}</p>`);
  }

  out.push('    </div>');
  out.push('  </body>');
  out.push('</tt>');
  return out.join('\n');
}

module.exports = { toTtml, formatTime, frameRateParts, escapeXml };
