'use strict';
const fs = require('fs');

/**
 * WAV cozumleme + 16kHz mono yeniden orneklemeye — saf JS, ffmpeg gerektirmez.
 * whisper.cpp 16kHz mono 16-bit PCM WAV ister; Premiere 48kHz WAV verir.
 */

const TARGET_RATE = 16000;

function readChunks(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Gecerli bir RIFF/WAVE dosyasi degil');
  }
  const chunks = {};
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4).trim(); // 'fmt ' sonundaki bosluk atilir
    const size = buf.readUInt32LE(off + 4);
    const start = off + 8;
    const end = Math.min(start + size, buf.length);
    if (!(id in chunks)) chunks[id] = { start, end, size };
    off = start + size + (size % 2); // chunk'lar cift hizali
    if (size === 0 && id !== 'data') break;
  }
  return chunks;
}

/** WAV dosyasini {sampleRate, channels, samples:Float32Array(mono, -1..1)} olarak coz. */
function decodeWav(filePath) {
  const buf = fs.readFileSync(filePath);
  const chunks = readChunks(buf);
  if (!chunks.fmt || !chunks.data) throw new Error("WAV'da fmt veya data chunk'i yok");

  const f = chunks.fmt.start;
  let format = buf.readUInt16LE(f);
  const channels = buf.readUInt16LE(f + 2);
  const sampleRate = buf.readUInt32LE(f + 4);
  const bitsPerSample = buf.readUInt16LE(f + 14);

  // WAVE_FORMAT_EXTENSIBLE (0xFFFE) → gercek formati GUID'in ilk 2 baytindan al
  if (format === 0xFFFE && chunks.fmt.size >= 40) format = buf.readUInt16LE(f + 24);
  if (format !== 1 && format !== 3) {
    throw new Error(`Desteklenmeyen WAV kodlamasi (format=${format}). Sikistirilmis WAV icin ffmpeg gerekir.`);
  }
  if (!channels || !sampleRate) throw new Error('WAV basligi bozuk');

  const bytes = bitsPerSample >> 3;
  const dataStart = chunks.data.start;
  const dataLen = chunks.data.end - dataStart;
  const frameCount = Math.floor(dataLen / (bytes * channels));
  const mono = new Float32Array(frameCount);

  // Hizli yol: 16-bit PCM (en yaygin durum) — typed array uzerinden dogrudan oku
  if (format === 1 && bytes === 2 && ((buf.byteOffset + dataStart) % 2 === 0)) {
    const pcm = new Int16Array(buf.buffer, buf.byteOffset + dataStart, frameCount * channels);
    if (channels === 1) {
      for (let i = 0; i < frameCount; i++) mono[i] = pcm[i] / 32768;
    } else {
      const invc = 1 / channels;
      for (let i = 0; i < frameCount; i++) {
        let acc = 0; const b = i * channels;
        for (let c = 0; c < channels; c++) acc += pcm[b + c];
        mono[i] = (acc * invc) / 32768;
      }
    }
    return { sampleRate, channels, samples: mono, durationSec: frameCount / sampleRate };
  }

  // Cok kanalliysa ortalayarak mono'ya indir
  const inv = 1 / channels;
  for (let i = 0; i < frameCount; i++) {
    let acc = 0;
    const base = dataStart + i * bytes * channels;
    for (let c = 0; c < channels; c++) {
      const p = base + c * bytes;
      let v;
      if (format === 3) {
        v = bytes === 8 ? buf.readDoubleLE(p) : buf.readFloatLE(p);
      } else if (bytes === 2) {
        v = buf.readInt16LE(p) / 32768;
      } else if (bytes === 3) {
        const u = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
        v = ((u & 0x800000) ? u - 0x1000000 : u) / 8388608;
      } else if (bytes === 4) {
        v = buf.readInt32LE(p) / 2147483648;
      } else if (bytes === 1) {
        v = (buf[p] - 128) / 128;
      } else {
        throw new Error(`Desteklenmeyen bit derinligi: ${bitsPerSample}`);
      }
      acc += v;
    }
    mono[i] = acc * inv;
  }
  return { sampleRate, channels, samples: mono, durationSec: frameCount / sampleRate };
}

/**
 * Polyphase pencereli-sinc yeniden ornekleme.
 * Katsayilar kesirli faz basina bir kez hesaplanip tabloya alinir; ic dongude
 * sadece carp-topla kalir. 48k→16k gibi tam katli oranlarda tek faz kullanilir.
 */
function buildFilter(ratio, taps, phases) {
  const cutoff = ratio < 1 ? 0.5 * ratio * 0.94 : 0.5 * 0.94;
  const half = taps >> 1;
  const table = new Float32Array(phases * taps);
  for (let p = 0; p < phases; p++) {
    const frac = p / phases;
    let sum = 0;
    const base = p * taps;
    for (let j = 0; j < taps; j++) {
      const k = j - half + 1;
      const x = k - frac;
      const a = 2 * Math.PI * cutoff * x;
      const sinc = Math.abs(a) < 1e-8 ? 1 : Math.sin(a) / a;
      const t = (x + half) / taps;
      const w = (t < 0 || t > 1) ? 0
        : 0.42 - 0.5 * Math.cos(2 * Math.PI * t) + 0.08 * Math.cos(4 * Math.PI * t);
      const c = sinc * w;
      table[base + j] = c;
      sum += c;
    }
    if (Math.abs(sum) > 1e-9) for (let j = 0; j < taps; j++) table[base + j] /= sum;
  }
  return { table, half };
}

function resample(samples, inRate, outRate, taps = 32, phases = 64) {
  if (inRate === outRate) return samples;
  const ratio = outRate / inRate;
  const outLen = Math.max(1, Math.floor(samples.length * ratio));
  const out = new Float32Array(outLen);
  const { table, half } = buildFilter(ratio, taps, phases);
  const step = inRate / outRate;
  const N = samples.length;

  for (let i = 0; i < outLen; i++) {
    const center = i * step;
    const i0 = Math.floor(center);
    let ph = ((center - i0) * phases) | 0;
    if (ph >= phases) ph = phases - 1;
    const base = ph * taps;
    const first = i0 - half + 1;
    let acc = 0;
    if (first >= 0 && first + taps <= N) {
      // sicak yol: sinir kontrolu yok
      for (let j = 0; j < taps; j++) acc += samples[first + j] * table[base + j];
    } else {
      for (let j = 0; j < taps; j++) {
        const idx = first + j;
        if (idx >= 0 && idx < N) acc += samples[idx] * table[base + j];
      }
    }
    out[i] = acc;
  }
  return out;
}

/** Tepe degerine gore normalize et (whisper sessiz kayitlarda daha cok halusinasyon uretir). */
function normalize(samples, targetPeak = 0.95) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a; }
  if (peak < 1e-6 || peak >= targetPeak) return samples;
  const g = targetPeak / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= g;
  return samples;
}

/** 16kHz mono 16-bit PCM WAV yaz. */
function writeWav16k(filePath, samples, sampleRate = TARGET_RATE) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);            // PCM
  buf.writeUInt16LE(1, 22);            // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
  return filePath;
}

module.exports = { decodeWav, resample, normalize, writeWav16k, TARGET_RATE };
