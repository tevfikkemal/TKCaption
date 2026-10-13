'use strict';

/**
 * SRT / VTT yazici.
 *
 * Kritik nokta - TIMECODE OFFSET:
 * Premiere sekanslari cogu zaman 00:00:00:00'dan baslamaz (yayin isinde
 * 01:00:00:00 standarttir). Disari aktarilan ses her zaman 0'dan baslar.
 * Offset uygulanmazsa altyazi sekansa geri konuldugunda bir saat kayar.
 * cfg.output.timecodeOffsetSec bu farki kapatir.
 */

function pad(n, w) {
  return String(Math.floor(n)).padStart(w, '0');
}

/** saniye -> "HH:MM:SS,mmm" (SRT) veya "HH:MM:SS.mmm" (VTT) */
function formatTime(sec, sep = ',') {
  let s = Math.max(0, sec);
  // Yuvarlamayi ms'de yap, saniye tasmasini elle yonet
  let ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const m = Math.floor(ms / 60000); ms -= m * 60000;
  const ss = Math.floor(ms / 1000); ms -= ss * 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(ss, 2)}${sep}${pad(ms, 3)}`;
}

/** "HH:MM:SS,mmm" -> saniye (test / geri okuma icin) */
function parseTime(str) {
  const m = /^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(String(str).trim());
  if (!m) return NaN;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4].padEnd(3, '0')) / 1000;
}

/**
 * Premiere zaman kodu string'ini ("01:00:00:00") saniyeye cevirir.
 * Drop-frame (";" ayraci) NTSC hesabini kullanir.
 */
function timecodeToSeconds(tc, fps) {
  const drop = /;/.test(tc);
  const p = String(tc).split(/[:;]/).map(Number);
  if (p.length !== 4 || p.some(isNaN)) return 0;
  const [hh, mm, ss, ff] = p;
  const nominal = Math.round(fps);
  if (!drop) return (hh * 3600 + mm * 60 + ss) * (nominal / fps) + ff / fps;
  // Drop-frame: her dakika 2 kare atlanir, her 10. dakika haric
  const dropPerMin = nominal === 30 ? 2 : nominal === 60 ? 4 : 2;
  const totalMin = hh * 60 + mm;
  const frames = ((hh * 3600 + mm * 60 + ss) * nominal + ff) -
                 dropPerMin * (totalMin - Math.floor(totalMin / 10));
  return frames / fps;
}

function toSrt(blocks, cfg) {
  const offset = (cfg && cfg.output && cfg.output.timecodeOffsetSec) || 0;
  // Premiere'in kare hizi varsayimini telafi eden carpan (bkz. config.js)
  const scale = (cfg && cfg.output && cfg.output.timeScale) || 1;
  const out = [];
  let n = 0;
  for (const b of blocks) {
    const text = (b.lines ? b.lines.join('\n') : b.text || '').trim();
    if (!text) continue;
    n++;
    out.push(String(n));
    out.push(`${formatTime(b.start * scale + offset)} --> ${formatTime(b.end * scale + offset)}`);
    out.push(text);
    out.push('');
  }
  return out.join('\n');
}

function toVtt(blocks, cfg) {
  const offset = (cfg && cfg.output && cfg.output.timecodeOffsetSec) || 0;
  const out = ['WEBVTT', ''];
  for (const b of blocks) {
    const text = (b.lines ? b.lines.join('\n') : b.text || '').trim();
    if (!text) continue;
    out.push(`${formatTime(b.start + offset, '.')} --> ${formatTime(b.end + offset, '.')}`);
    out.push(text);
    out.push('');
  }
  return out.join('\n');
}

/** Basit SRT ayristirici - kendi ciktimizi dogrulamak icin */
function parseSrt(str) {
  const blocks = [];
  const chunks = String(str).replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  for (const c of chunks) {
    const lines = c.split('\n');
    if (lines.length < 2) continue;
    const tm = /^(.+?)\s*-->\s*(.+?)$/.exec(lines[1]);
    if (!tm) continue;
    blocks.push({
      index: parseInt(lines[0], 10),
      start: parseTime(tm[1]),
      end: parseTime(tm[2]),
      lines: lines.slice(2)
    });
  }
  return blocks;
}

function write(filePath, content, cfg) {
  const fs = require('fs');
  const bom = cfg && cfg.output && cfg.output.bom ? '﻿' : '';
  fs.writeFileSync(filePath, bom + content, 'utf8');
  return filePath;
}

/**
 * Altyazi bloklarini okunur duz metne cevirir (YouTube aciklamasi, blog,
 * kayit icin). Blok sinirlari cumle sinirlari degil; bloklari birlestirip
 * metni yeniden cumlelere gore paragraflara ayiriyoruz. Uzun bir duraklama
 * (varsayilan 2 sn) yeni paragraf sayilir — konu degisimi genelde oradadir.
 *
 * @param {Array<{start,end,lines|text}>} blocks  parseSrt ciktisi da olur
 * @param {Object} [o]
 * @param {boolean} [o.zaman]  her paragrafin basina [dk:sn] yaz
 * @param {number} [o.paragrafSn=2]
 */
function toPlainText(blocks, o) {
  const opt = Object.assign({ zaman: false, paragrafSn: 2 }, o || {});
  const paragraflar = [];
  let cur = null;
  let oncekiBitis = -Infinity;
  for (const b of blocks || []) {
    const metin = (b.lines ? b.lines.join(' ') : String(b.text || '')).replace(/\s+/g, ' ').trim();
    if (!metin) continue;
    // Yeni paragraf: uzun duraklama VE onceki cumle bitmis
    const bitti = cur && /[.!?…]["')\]]?$/.test(cur.metin);
    if (!cur || (b.start - oncekiBitis >= opt.paragrafSn && bitti)) {
      cur = { start: b.start, metin: metin };
      paragraflar.push(cur);
    } else {
      cur.metin += ' ' + metin;
    }
    oncekiBitis = b.end;
  }
  const dk = (s) => {
    const t = Math.max(0, Math.floor(s));
    const h = Math.floor(t / 3600);
    const m = Math.floor(t / 60) % 60;
    const ss = t % 60;
    return (h ? h + ':' + pad(m, 2) : String(m)) + ':' + pad(ss, 2);
  };
  return paragraflar
    .map((p) => (opt.zaman ? '[' + dk(p.start) + '] ' : '') + p.metin)
    .join('\n\n') + '\n';
}

module.exports = { toSrt, toVtt, toPlainText, formatTime, parseTime, parseSrt, timecodeToSeconds, write };
