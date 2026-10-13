/*
 * KURGU FX (com.vedat.kurgufx, v1.3) eklentisinden alindi - yapimcisi Vedat'in
 * onayiyla, TK Caption'da herkese acik yayinlanmak uzere. Icerik degistirilmedi.
 */
/* KURGU FX — audio analysis (silence, beats, speech) */
(function (G) {
  const nreq = (G.cep_node && G.cep_node.require) || (typeof require !== 'undefined' ? require : null);
  const cp = nreq ? nreq('child_process') : null;
  const fs = nreq ? nreq('fs') : null;

  const A = {};
  const decodeCache = new Map();

  /* ---- PCM loading ---- */
  A.ffmpegPCM = function (ff, path, inSec, durSec, rate) {
    return new Promise((res, rej) => {
      const args = ['-v', 'error', '-ss', String(Math.max(0, inSec)), '-t', String(Math.max(0.05, durSec)), '-i', path, '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1'];
      const p = cp.spawn(ff, args, { windowsHide: true });
      const chunks = []; let err = '';
      p.stdout.on('data', d => chunks.push(d));
      p.stderr.on('data', d => { err += d; });
      p.on('error', rej);
      p.on('close', code => {
        if (code !== 0 && !chunks.length) return rej(new Error('ffmpeg: ' + err.slice(0, 300)));
        const b = Buffer.concat(chunks);
        const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4));
        res(new Float32Array(ab));
      });
    });
  };
  async function decodeFile(path) {
    if (decodeCache.has(path)) return decodeCache.get(path);
    if (fs.statSync(path).size > 600 * 1024 * 1024) throw new Error('Dosya çok büyük (' + path.split(/[\\/]/).pop() + '). Bu iş için ffmpeg gerekli: Ayarlar > Tek tıkla kurulum.');
    const buf = fs.readFileSync(path);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    const ctx = new (G.AudioContext || G.webkitAudioContext)();
    const audio = await ctx.decodeAudioData(ab);
    try { ctx.close(); } catch (e) { }
    decodeCache.set(path, audio);
    return audio;
  }
  A.webPCM = async function (path, inSec, durSec, rate) {
    const ab = await decodeFile(path);
    const sr = ab.sampleRate, ch = ab.numberOfChannels;
    const i0 = Math.max(0, Math.floor(inSec * sr)), i1 = Math.min(ab.length, Math.floor((inSec + durSec) * sr));
    const n = Math.max(0, Math.floor((i1 - i0) * rate / sr));
    const out = new Float32Array(n), step = sr / rate;
    const data = []; for (let c = 0; c < ch; c++) data.push(ab.getChannelData(c));
    for (let k = 0; k < n; k++) {
      const a = i0 + Math.floor(k * step), b = Math.min(i1, i0 + Math.floor((k + 1) * step));
      let s = 0, m = 0;
      for (let i = a; i < Math.max(a + 1, b); i++) { for (let c = 0; c < ch; c++) s += data[c][i] || 0; m++; }
      out[k] = s / (m * ch);
    }
    return out;
  };
  A.clearCache = () => decodeCache.clear();
  A.loadPCM = function (opts, path, inSec, durSec, rate) {
    if (opts.ffmpeg && cp) return A.ffmpegPCM(opts.ffmpeg, path, inSec, durSec, rate).catch(e => { console.warn(e); return A.webPCM(path, inSec, durSec, rate); });
    return A.webPCM(path, inSec, durSec, rate);
  };
  /* mix a list of timeline clips into one timeline-aligned mono buffer */
  A.buildTimeline = async function (opts, clips, rate, range, onProg) {
    const t0 = range ? range[0] : 0;
    const t1 = range ? range[1] : Math.max(...clips.map(c => c.end));
    const out = new Float32Array(Math.ceil((t1 - t0) * rate) + 1);
    let i = 0;
    for (const c of clips) {
      i++;
      if (onProg) onProg(i / clips.length);
      if (c.disabled || !c.path || c.rev) continue;
      const a = Math.max(c.start, t0), b = Math.min(c.end, t1);
      if (b <= a) continue;
      const sp = c.speed || 1;
      const inSec = c.inP + (a - c.start) * sp;
      let pcm = await A.loadPCM(opts, c.path, inSec, (b - a) * sp, rate);
      if (Math.abs(sp - 1) > 1e-3) { const n = Math.floor(pcm.length / sp), r = new Float32Array(n); for (let k = 0; k < n; k++) r[k] = pcm[Math.floor(k * sp)]; pcm = r; }
      const off = Math.round((a - t0) * rate);
      const n = Math.min(pcm.length, out.length - off);
      for (let k = 0; k < n; k++) out[off + k] += pcm[k];
    }
    return { pcm: out, rate, t0 };
  };

  /* ---- envelopes ---- */
  A.envelopeDb = function (pcm, rate, hop) {
    const H = Math.max(1, Math.round(rate * hop)), n = Math.floor(pcm.length / H), db = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0; const o = i * H;
      for (let k = 0; k < H; k++) { const v = pcm[o + k]; s += v * v; }
      db[i] = 10 * Math.log10(s / H + 1e-12);
    }
    return db;
  };
  function percentile(arr, p) { const a = Array.from(arr).filter(x => x > -110).sort((x, y) => x - y); if (!a.length) return -90; return a[Math.min(a.length - 1, Math.floor(a.length * p))]; }
  A.autoThreshold = function (db) {
    const floor = percentile(db, 0.08), speech = percentile(db, 0.7);
    return Math.max(floor + 6, Math.min(speech - 18, floor + (speech - floor) * 0.35));
  };
  /* silent ranges in timeline seconds */
  A.silences = function (tl, o) {
    const hop = 0.01, db = A.envelopeDb(tl.pcm, tl.rate, hop);
    const thr = o.auto ? A.autoThreshold(db) : o.threshold;
    const out = [];
    let st = -1;
    for (let i = 0; i <= db.length; i++) {
      const silent = i < db.length && db[i] < thr;
      if (silent && st < 0) st = i;
      if (!silent && st >= 0) {
        const a = st * hop, b = i * hop;
        if (b - a >= o.minSil) {
          const isHead = st === 0, isTail = i === db.length;
          const ra = tl.t0 + a + (isHead ? 0 : o.pad), rb = tl.t0 + b - (isTail ? 0 : o.pad);
          if (rb - ra > 0.08) out.push([ra, rb]);
        }
        st = -1;
      }
    }
    return { ranges: out, thr, db, hop };
  };
  A.speech = function (tl, o) {
    const s = A.silences(tl, { auto: o.auto, threshold: o.threshold, minSil: o.gap || 0.45, pad: 0 });
    const tEnd = tl.t0 + tl.pcm.length / tl.rate, out = [];
    let cur = tl.t0;
    for (const r of s.ranges) { if (r[0] - cur > 0.15) out.push([cur, r[0]]); cur = r[1]; }
    if (tEnd - cur > 0.15) out.push([cur, tEnd]);
    return { ranges: out, thr: s.thr };
  };

  /* ---- FFT (radix-2) ---- */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  /* onset strength envelope (spectral flux) */
  A.onsetEnv = function (pcm, rate, o) {
    const N = 1024, hop = 256, nb = N / 2;
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const frames = Math.max(0, Math.floor((pcm.length - N) / hop));
    const env = new Float32Array(frames);
    const hiBin = o.band === 'low' ? Math.max(2, Math.round(160 / (rate / N))) : nb;
    const loBin = o.band === 'low' ? 1 : 1;
    let prev = new Float32Array(nb);
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let f = 0; f < frames; f++) {
      const o2 = f * hop;
      for (let i = 0; i < N; i++) { re[i] = pcm[o2 + i] * win[i]; im[i] = 0; }
      fft(re, im);
      let s = 0;
      for (let k = loBin; k < hiBin; k++) {
        const m = Math.log1p(100 * Math.sqrt(re[k] * re[k] + im[k] * im[k]));
        const d = m - prev[k]; if (d > 0) s += d;
        prev[k] = m;
      }
      env[f] = s;
    }
    return { env, fps: rate / hop, off: (N / 2) / rate };
  };
  /* peak picking -> beat times (seconds, relative to buffer) */
  A.pickPeaks = function (on, o) {
    const env = on.env, fps = on.fps, n = env.length;
    const W = Math.max(1, Math.round(0.06 * fps)), M = Math.round(0.6 * fps);
    let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, env[i]);
    const e = Array.from(env, v => v / (mx || 1));
    const delta = 0.02 + (1 - o.sens) * 0.35;
    const minGap = o.minGap || 0.18;
    const peaks = [];
    let last = -1e9;
    for (let i = 1; i < n - 1; i++) {
      let isMax = true;
      for (let k = Math.max(0, i - W); k <= Math.min(n - 1, i + W); k++) if (e[k] > e[i]) { isMax = false; break; }
      if (!isMax) continue;
      let s = 0, c = 0;
      for (let k = Math.max(0, i - M); k <= Math.min(n - 1, i + M); k++) { s += e[k]; c++; }
      if (e[i] < s / c + delta) continue;
      const t = i / fps + (on.off || 0);
      if (t - last < minGap) { if (peaks.length && e[i] > peaks[peaks.length - 1].v) { peaks[peaks.length - 1] = { t, v: e[i] }; last = t; } continue; }
      peaks.push({ t, v: e[i] }); last = t;
    }
    return peaks;
  };
  /* tempo via autocorrelation + best phase grid */
  A.tempo = function (on) {
    const env = on.env, fps = on.fps, n = env.length;
    const mean = env.reduce((a, b) => a + b, 0) / (n || 1);
    const x = Array.from(env, v => v - mean);
    let best = 0, bestLag = 0;
    const lo = Math.round(fps * 60 / 190), hi = Math.round(fps * 60 / 70);
    for (let lag = lo; lag <= hi; lag++) {
      let s = 0; for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag];
      const bpmL = 60 * fps / lag;
      const w = Math.exp(-0.5 * Math.pow(Math.log2(bpmL / 120) / 0.9, 2));
      s *= w;
      if (s > best) { best = s; bestLag = lag; }
    }
    const period = bestLag / fps, bpm = 60 / period;
    let bp = 0, bs = -1;
    for (let ph = 0; ph < bestLag; ph++) {
      let s = 0; for (let i = ph; i < n; i += bestLag) s += env[i];
      if (s > bs) { bs = s; bp = ph; }
    }
    const beats = [];
    for (let t = bp / fps; t < n / fps; t += period) beats.push(t + (on.off || 0));
    return { bpm, period, beats };
  };
  A.writeWav16 = function (path, pcm, rate) {
    const n = pcm.length, buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
    buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, pcm[i])); buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2); }
    fs.writeFileSync(path, buf);
  };
  G.KAudio = A;
})(typeof window !== 'undefined' ? window : globalThis);
