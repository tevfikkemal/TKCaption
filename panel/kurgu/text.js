/*
 * KURGU FX (com.vedat.kurgufx, v1.3) eklentisinden alindi - yapimcisi Vedat'in
 * onayiyla, TK Caption'da herkese acik yayinlanmak uzere. Icerik degistirilmedi.
 */
/* KURGU FX — Yazı Stüdyosu renderer (canvas) */
(function (G) {
  const K = {};
  const cl = v => Math.max(0, Math.min(1, v));
  const E = {
    out: u => 1 - Math.pow(1 - u, 3),
    inout: u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2,
    back: u => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); },
    elastic: u => u === 0 ? 0 : u === 1 ? 1 : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
    bounce: u => { const n1 = 7.5625, d1 = 2.75; if (u < 1 / d1) return n1 * u * u; if (u < 2 / d1) return n1 * (u -= 1.5 / d1) * u + 0.75; if (u < 2.5 / d1) return n1 * (u -= 2.25 / d1) * u + 0.9375; return n1 * (u -= 2.625 / d1) * u + 0.984375; },
    lin: u => u
  };
  K.EASE = E;

  /* ---------------- styles ---------------- */
  // fill: color | {grad:[...colors], dir:'v'|'h'}
  K.STYLES = [
    { g: 'SADE', id: 'apple', name: 'Apple Style', font: 'IT', w: 700, fill: '#fff', shadow: [0, 6, 24, 'rgba(0,0,0,.45)'], acc: '#38D6F5', track: -0.02 },
    { g: 'SADE', id: 'clean', name: 'Clean Bold', font: 'PP', w: 800, fill: '#fff', shadow: [0, 4, 16, 'rgba(0,0,0,.75)'], acc: '#FFB21E', track: -0.02 },
    { g: 'SADE', id: 'sub', name: 'Altyazı', font: 'PP', w: 800, fill: '#fff', stroke: [0.14, '#000'], acc: '#FFE14D', track: -0.01 },
    { g: 'SADE', id: 'anton', name: 'Manşet', font: 'AN', w: 400, fill: '#fff', shadow: [0, 6, 20, 'rgba(0,0,0,.6)'], acc: '#FF2E43', upper: true, track: 0.01 },
    { g: 'SADE', id: 'serif', name: 'Zarif', font: 'PF', w: 700, italic: true, fill: '#fff', shadow: [0, 4, 18, 'rgba(0,0,0,.6)'], acc: '#E9C46A', track: 0 },
    { g: 'RENKLİ', id: 'amber', name: 'Amber Glow', font: 'PP', w: 900, fill: { grad: ['#FFD54A', '#FF8A00'], dir: 'v' }, glow: [26, 'rgba(255,150,0,.65)'], acc: '#fff', track: -0.02 },
    { g: 'RENKLİ', id: 'gold', name: 'Gold Text', font: 'PP', w: 900, fill: { grad: ['#FFF3B0', '#E8B23A', '#9A6A12'], dir: 'v' }, stroke: [0.03, '#5a3a00'], shadow: [0, 6, 14, 'rgba(0,0,0,.6)'], acc: '#fff', track: -0.02 },
    { g: 'RENKLİ', id: 'neonb', name: 'Neon Mavi', font: 'PP', w: 800, fill: '#C9F6FF', glow: [30, '#18C8FF'], acc: '#fff', track: 0 },
    { g: 'RENKLİ', id: 'neong', name: 'Neon Yeşil', font: 'PP', w: 800, fill: '#D9FFD2', glow: [30, '#2BE33F'], acc: '#fff', track: 0 },
    { g: 'RENKLİ', id: 'red', name: 'Kırmızı Vurgu', font: 'PP', w: 900, fill: '#FF2E43', shadow: [0, 5, 18, 'rgba(0,0,0,.55)'], acc: '#fff', track: -0.03 },
    { g: 'RENKLİ', id: 'water', name: 'Water', font: 'PP', w: 800, fill: { grad: ['#9BE7FF', '#2F7BFF'], dir: 'v' }, shadow: [0, 6, 18, 'rgba(0,0,0,.5)'], acc: '#fff', track: -0.02 },
    { g: 'RENKLİ', id: 'rainbow', name: 'Rainbow', font: 'PP', w: 900, fill: { grad: ['#FF4D4D', '#FFB21E', '#FFE14D', '#33D17A', '#38D6F5', '#7A5CFF'], dir: 'h' }, shadow: [0, 6, 18, 'rgba(0,0,0,.45)'], acc: '#fff', track: -0.02 },
    { g: 'RENKLİ', id: 'oldmoney', name: 'Old Money', font: 'PF', w: 900, fill: { grad: ['#F6E7B8', '#C9A55A'], dir: 'v' }, shadow: [0, 4, 14, 'rgba(0,0,0,.55)'], acc: '#fff', track: 0.02 },
    { g: 'KUTULU', id: 'selected', name: 'Text Selected', font: 'PP', w: 800, fill: '#fff', box: ['#2F6BFF', 0.22, 0.12], acc: '#FFE14D', track: -0.02 },
    { g: 'KUTULU', id: 'yellowbox', name: 'Sarı Kutu', font: 'PP', w: 900, fill: '#111', box: ['#FFD21E', 0.22, 0.1], acc: '#D7261E', track: -0.02 },
    { g: 'KUTULU', id: 'blackbox', name: 'Koyu Şerit', font: 'PP', w: 800, fill: '#fff', box: ['rgba(10,10,14,.82)', 0.28, 0.16], acc: '#FFB21E', track: -0.01 },
    { g: 'KUTULU', id: 'redpill', name: 'Kırmızı Hap', font: 'PP', w: 800, fill: '#fff', box: ['#FF2E43', 0.32, 0.5], acc: '#FFE14D', track: -0.01 },
    { g: 'EFEKTLİ', id: 'outline', name: 'Kontur', font: 'PP', w: 900, fill: 'transparent', stroke: [0.035, '#fff'], acc: '#FFB21E', track: 0 },
    { g: 'EFEKTLİ', id: 'extrude', name: '3B Derinlik', font: 'PP', w: 900, fill: '#fff', extrude: [10, '#FF7A00', '#7A2E00'], acc: '#FFE14D', track: -0.02 },
    { g: 'EFEKTLİ', id: 'glitch', name: 'Glitch RGB', font: 'PP', w: 900, fill: '#fff', rgb: 6, acc: '#38D6F5', track: -0.02 },
    { g: 'EFEKTLİ', id: 'longshadow', name: 'Uzun Gölge', font: 'AN', w: 400, fill: '#FFE14D', long: [18, 'rgba(0,0,0,.5)'], acc: '#fff', upper: true, track: 0.01 }
  ];
  K.style = id => K.STYLES.find(s => s.id === id) || K.STYLES[0];
  const FAM = { PP: 'KPoppins', IT: 'KInterTight', AN: 'KAnton', PF: 'KPlayfair', MS: 'KMontserrat', BB: 'KBebas' };
  const fontStr = (st, size) => `${st.italic ? 'italic ' : ''}${st.w} ${size}px ${FAM[st.font] || st.font}`;
  K.fontStr = fontStr;
  K.ensureFonts = async function () {
    if (!document.fonts) return;
    const list = ['500','600','700','800','900'].map(w => w + ' 60px KPoppins').concat(['500','600','700','800'].map(w => w + ' 60px KInterTight'), ['700','800','900'].map(w => w + ' 60px KMontserrat'), ['400 60px KAnton', '700 60px KPlayfair', 'italic 700 60px KPlayfair', '900 60px KPlayfair', 'italic 900 60px KPlayfair', '400 60px KBebas', '600 60px KUnbounded', '800 60px KUnbounded', '700 60px KSyne', '800 60px KSyne', '400 60px KArchivoBlack', '600 60px KBricolage', '800 60px KBricolage', '400 60px KDMSerif', 'italic 400 60px KDMSerif', '400 60px KInstrument', 'italic 400 60px KInstrument', '500 60px KSpaceGrotesk', '700 60px KSpaceGrotesk']);
    await Promise.all(list.map(f => document.fonts.load(f, 'AaĞğŞşİıÖöÜüÇç0123%').catch(() => { })));
  };

  /* ---------------- animations ---------------- */
  // each: unit, stagger(sec), dur(sec), fn(p) -> transform
  K.ANIMS = [
    { g: 'KARAKTER', id: 'fade', name: 'Fade In', unit: 'char', st: 0.03, d: 0.35, f: p => ({ a: p }) },
    { g: 'KARAKTER', id: 'type', name: 'Typewriter', unit: 'char', st: 0.045, d: 0.01, f: p => ({ a: p > 0 ? 1 : 0 }), cursor: true },
    { g: 'KARAKTER', id: 'rfade', name: 'Random Fade', unit: 'char', st: 0.03, d: 0.4, rnd: true, f: p => ({ a: p }) },
    { g: 'KARAKTER', id: 'cslide', name: 'Slide Up', unit: 'char', st: 0.03, d: 0.45, f: p => ({ a: cl(p * 2), dy: (1 - E.out(p)) * 0.6 }) },
    { g: 'KARAKTER', id: 'cpop', name: 'Scale Pop', unit: 'char', st: 0.035, d: 0.4, f: p => ({ a: cl(p * 3), s: E.back(p) }) },
    { g: 'KARAKTER', id: 'cblur', name: 'Blur In', unit: 'char', st: 0.03, d: 0.5, f: p => ({ a: p, blur: (1 - E.out(p)) * 0.25, s: 1 + (1 - E.out(p)) * 0.2 }) },
    { g: 'KARAKTER', id: 'cbounce', name: 'Bounce Up', unit: 'char', st: 0.04, d: 0.6, f: p => ({ a: cl(p * 3), dy: (1 - E.bounce(p)) * 0.9 }) },
    { g: 'KARAKTER', id: 'crot', name: 'Rotate In', unit: 'char', st: 0.035, d: 0.5, f: p => ({ a: cl(p * 2), rot: (1 - E.back(p)) * 0.9, dy: (1 - E.out(p)) * 0.3 }) },
    { g: 'KARAKTER', id: 'cflip', name: 'Flip', unit: 'char', st: 0.04, d: 0.5, f: p => ({ a: cl(p * 2), sy: E.back(p) }) },
    { g: 'KARAKTER', id: 'track', name: 'Tracking In', unit: 'line', st: 0.1, d: 0.9, f: p => ({ a: cl(p * 1.6), trk: (1 - E.out(p)) * 0.5, blur: (1 - E.out(p)) * 0.08 }) },
    { g: 'KARAKTER', id: 'cglitch', name: 'Glitch In', unit: 'char', st: 0.02, d: 0.35, rnd: true, f: (p, r) => ({ a: p > 0.05 ? (p < 0.6 ? (r > 0.5 ? 1 : 0.2) : 1) : 0, dx: p < 0.7 ? (r - 0.5) * 0.4 : 0 }) },
    { g: 'KELİME', id: 'wfade', name: 'Fade', unit: 'word', st: 0.12, d: 0.4, f: p => ({ a: p, dy: (1 - E.out(p)) * 0.15 }) },
    { g: 'KELİME', id: 'wrand', name: 'Rastgele', unit: 'word', st: 0.1, d: 0.4, rnd: true, f: p => ({ a: p, s: 0.9 + 0.1 * E.out(p) }) },
    { g: 'KELİME', id: 'wslide', name: 'Slide Up', unit: 'word', st: 0.1, d: 0.5, f: p => ({ a: cl(p * 2), dy: (1 - E.out(p)) * 0.7 }) },
    { g: 'KELİME', id: 'wleft', name: 'Slide In Left', unit: 'word', st: 0.1, d: 0.5, f: p => ({ a: cl(p * 2), dx: -(1 - E.out(p)) * 1.2 }) },
    { g: 'KELİME', id: 'wright', name: 'Slide In Right', unit: 'word', st: 0.1, d: 0.5, f: p => ({ a: cl(p * 2), dx: (1 - E.out(p)) * 1.2 }) },
    { g: 'KELİME', id: 'wpop', name: 'Scale Pop', unit: 'word', st: 0.12, d: 0.45, f: p => ({ a: cl(p * 3), s: E.back(p) }) },
    { g: 'KELİME', id: 'wblur', name: 'Blur', unit: 'word', st: 0.12, d: 0.55, f: p => ({ a: p, blur: (1 - E.out(p)) * 0.3 }) },
    { g: 'KELİME', id: 'wkaraoke', name: 'Vurgu Akışı', unit: 'word', st: 0.25, d: 0.2, f: p => ({ a: 0.35 + 0.65 * p, hl: p }) },
    { g: 'KELİME', id: 'wdrop', name: 'Düşüş', unit: 'word', st: 0.1, d: 0.6, f: p => ({ a: cl(p * 3), dy: -(1 - E.bounce(p)) * 1.2 }) },
    { g: 'SATIR', id: 'lrise', name: 'Maskeden Yüksel', unit: 'line', st: 0.12, d: 0.6, mask: true, f: p => ({ dy: (1 - E.out(p)) * 1.15 }) },
    { g: 'SATIR', id: 'lwipe', name: 'Sil-Göster', unit: 'line', st: 0.15, d: 0.6, f: p => ({ wipe: E.inout(p) }) },
    { g: 'SATIR', id: 'lzoom', name: 'Zoom Punch', unit: 'line', st: 0.1, d: 0.45, f: p => ({ a: cl(p * 2.5), s: 1.6 - 0.6 * E.out(p), blur: (1 - E.out(p)) * 0.12 }) },
    { g: 'SATIR', id: 'lfade', name: 'Yumuşak Fade', unit: 'line', st: 0.15, d: 0.7, f: p => ({ a: E.inout(p), dy: (1 - E.out(p)) * 0.12 }) },
    { g: 'SATIR', id: 'none', name: 'Animasyon Yok', unit: 'line', st: 0, d: 0.01, f: () => ({}) }
  ];
  K.OUTS = [
    { id: 'none', name: 'Yok' }, { id: 'fade', name: 'Fade' }, { id: 'down', name: 'Aşağı Kay' },
    { id: 'blur', name: 'Blur' }, { id: 'scale', name: 'Küçül' }, { id: 'wipe', name: 'Sil' }
  ];
  K.anim = id => K.ANIMS.find(a => a.id === id) || K.ANIMS[0];

  /* ---------------- layout ---------------- */
  function parseMarkup(text) {
    // *vurgu* -> accent
    const out = []; let acc = false, buf = '';
    for (const ch of text) {
      if (ch === '*') { if (buf) out.push({ t: buf, acc }); buf = ''; acc = !acc; continue; }
      buf += ch;
    }
    if (buf) out.push({ t: buf, acc });
    return out;
  }
  K.layout = function (ctx, cfg, W, H) {
    const st = K.style(cfg.style);
    const sc = W / 1080;
    const size = cfg.size * sc;
    ctx.font = fontStr(st, size);
    const track = (cfg.track !== undefined ? cfg.track : st.track || 0) * size;
    const maxW = (cfg.maxW || 860) * sc;
    const upper = cfg.upper || st.upper;
    let text = upper ? cfg.text.toLocaleUpperCase('tr-TR') : cfg.text;
    // words with accent flags
    const paras = text.split('\n');
    const lines = [];
    let accState = false;
    for (const para of paras) {
      // markup across words
      const words = [];
      let cur = '', curAcc = accState, list = [];
      for (const ch of para) {
        if (ch === '*') { accState = !accState; continue; }
        list.push({ ch, acc: accState });
      }
      // split into words
      let w = [];
      for (const it of list) {
        if (it.ch === ' ') { if (w.length) words.push(w); w = []; }
        else w.push(it);
      }
      if (w.length) words.push(w);
      // wrap
      const sp = ctx.measureText(' ').width + track;
      let line = [], lw = 0;
      const wWidth = ws => { const s = ws.map(c => c.ch).join(''); return ctx.measureText(s).width + track * (ws.length - 1); };
      for (const wd of words) {
        const ww = wWidth(wd);
        if (line.length && lw + sp + ww > maxW) { lines.push(line); line = []; lw = 0; }
        lw += (line.length ? sp : 0) + ww; line.push(wd);
      }
      lines.push(line);
    }
    const lh = size * (cfg.lh || 1.12);
    // glyph positions
    const out = [];
    let ci = 0, wi = 0;
    const blockH = lh * lines.length;
    const posY = cfg.pos || 'bottom';
    let top;
    const SZT = 250 * H / 1920, SZB = 1520 * H / 1920;
    if (posY === 'top') top = SZT;
    else if (posY === 'mid') top = H / 2 - blockH / 2;
    else if (posY === 'bottom') top = SZB - blockH;
    else top = (cfg.y || 50) / 100 * H - blockH / 2;
    const L = 70 * sc, R = (cfg.pos === 'bottom' ? 900 : 1010) * sc;
    lines.forEach((line, li) => {
      const chars = [];
      line.forEach((wd, k) => { if (k) chars.push({ ch: ' ', acc: false, space: true, word: -1 }); wd.forEach(c => chars.push({ ch: c.ch, acc: c.acc, word: wi })); wi++; });
      const str = chars.map(c => c.ch).join('');
      const lineW = ctx.measureText(str).width + track * Math.max(0, chars.length - 1);
      let x0;
      if (cfg.align === 'left') x0 = L; else if (cfg.align === 'right') x0 = R - lineW; else x0 = (L + R) / 2 - lineW / 2;
      if (cfg.align !== 'left' && cfg.align !== 'right' && posY !== 'bottom') x0 = W / 2 - lineW / 2;
      const base = top + lh * li + size * 0.82;
      for (let i = 0; i < chars.length; i++) {
        const pre = ctx.measureText(str.slice(0, i)).width + track * i;
        const cw = ctx.measureText(chars[i].ch).width;
        chars[i].x = x0 + pre; chars[i].w = cw; chars[i].y = base; chars[i].line = li;
        if (!chars[i].space) chars[i].ci = ci++;
      }
      out.push({ chars, x0, w: lineW, base, top: top + lh * li, h: lh });
    });
    return { lines: out, size, st, nChars: ci, nWords: wi, track, top, blockH, sc };
  };

  /* ---------------- drawing ---------------- */
  function makeFill(ctx, st, size, lineX0, lineW, cx, accColor, isAcc) {
    if (isAcc) return accColor;
    const f = st.fill;
    if (typeof f === 'string') return f;
    let g;
    if (f.dir === 'h') g = ctx.createLinearGradient(lineX0 - cx, 0, lineX0 - cx + lineW, 0);
    else g = ctx.createLinearGradient(0, -size * 0.78, 0, size * 0.12);
    f.grad.forEach((c, i) => g.addColorStop(i / (f.grad.length - 1), c));
    return g;
  }
  function drawGlyph(ctx, st, ch, size, fill, accColor, isAcc, colorOverride) {
    const fillStyle = colorOverride || fill;
    if (st.long) { ctx.save(); ctx.fillStyle = st.long[1]; for (let i = st.long[0]; i > 0; i--) ctx.fillText(ch, i * size / 120, i * size / 120); ctx.restore(); }
    if (st.extrude) {
      const d = st.extrude[0];
      for (let i = d; i > 0; i--) { ctx.fillStyle = i > d * 0.5 ? st.extrude[2] : st.extrude[1]; ctx.fillText(ch, i * size / 160, i * size / 160); }
    }
    if (st.shadow) { ctx.shadowOffsetX = st.shadow[0] * size / 100; ctx.shadowOffsetY = st.shadow[1] * size / 100; ctx.shadowBlur = st.shadow[2] * size / 100; ctx.shadowColor = st.shadow[3]; }
    if (st.glow) { ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.shadowBlur = st.glow[0] * size / 100; ctx.shadowColor = isAcc ? accColor : st.glow[1]; }
    if (st.stroke) {
      ctx.lineJoin = 'round'; ctx.miterLimit = 2;
      ctx.lineWidth = st.stroke[0] * size * (st.fill === 'transparent' ? 1 : 2);
      ctx.strokeStyle = isAcc && st.fill === 'transparent' ? accColor : st.stroke[1];
      ctx.strokeText(ch, 0, 0);
      if (st.fill !== 'transparent') { ctx.shadowColor = 'transparent'; }
    }
    if (st.rgb) {
      const o = st.rgb * size / 100;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,0,60,.85)'; ctx.fillText(ch, -o, 0);
      ctx.fillStyle = 'rgba(0,220,255,.85)'; ctx.fillText(ch, o, 0);
      ctx.restore();
    }
    if (st.fill !== 'transparent' || isAcc) { ctx.fillStyle = (st.fill === 'transparent' && isAcc) ? 'transparent' : fillStyle; ctx.fillText(ch, 0, 0); }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  }
  function seeded(i) { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }

  /* main frame renderer */
  K.drawFrame = function (ctx, W, H, t, cfg, lay) {
    ctx.clearRect(0, 0, W, H);
    lay = lay || K.layout(ctx, cfg, W, H);
    const st = lay.st, size = lay.size, an = K.anim(cfg.anim);
    const accColor = cfg.accent || st.acc;
    const color = cfg.color && cfg.color !== 'auto' ? cfg.color : null;
    const speed = cfg.speed || 1;
    const stg = an.st / speed, ud = an.d / speed;
    const dur = cfg.dur, outD = cfg.out && cfg.out !== 'none' ? Math.min(0.5, dur * 0.25) : 0;
    const outU = outD ? cl((t - (dur - outD)) / outD) : 0, outE = E.inout(outU);
    ctx.font = fontStr(st, size);
    ctx.textBaseline = 'alphabetic';
    // unit index helper
    const nUnits = an.unit === 'char' ? lay.nChars : an.unit === 'word' ? lay.nWords : lay.lines.length;
    const order = [];
    for (let i = 0; i < nUnits; i++) order.push(i);
    if (an.rnd) order.sort((a, b) => seeded(a + 3) - seeded(b + 3));
    const delayOf = {}; order.forEach((u, k) => { delayOf[u] = k * stg; });
    const prog = u => cl((t - (delayOf[u] || 0)) / Math.max(0.001, ud));
    // boxes
    if (st.box) {
      lay.lines.forEach((ln, li) => {
        const uIdx = an.unit === 'line' ? li : an.unit === 'word' ? (ln.chars.find(c => c.word >= 0) || {}).word : (ln.chars.find(c => c.ci !== undefined) || {}).ci;
        const p = prog(uIdx || 0);
        const bp = an.id === 'none' ? 1 : E.out(cl(p * 1.4));
        const padX = st.box[1] * size, padY = st.box[2] * size * 1.0, r = Math.min(st.box[2] > 0.3 ? 999 : size * 0.18, (ln.h + padY) / 2);
        const x = ln.x0 - padX, y = ln.base - size * 0.82 - padY * 0.6, w = (ln.w + padX * 2) * bp * (1 - (cfg.out === 'wipe' ? outE : 0)), h = size * 1.04 + padY * 1.2;
        ctx.save(); ctx.globalAlpha = (1 - (cfg.out === 'fade' || cfg.out === 'blur' ? outE : 0));
        ctx.fillStyle = st.box[0];
        const rr = Math.min(r, h / 2, w / 2);
        ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath(); ctx.fill();
        ctx.restore();
      });
    }
    // glyphs
    let lastVisible = null;
    lay.lines.forEach((ln, li) => {
      // per-line clip for mask / wipe
      ctx.save();
      if (an.mask) { ctx.beginPath(); ctx.rect(0, ln.base - size * 1.05, W, size * 1.38); ctx.clip(); }
      ln.chars.forEach(c => {
        if (c.space) return;
        const u = an.unit === 'char' ? c.ci : an.unit === 'word' ? c.word : li;
        const p = prog(u);
        const tr = an.f(p, seeded(c.ci + 1 + Math.floor(t * 30) * (an.id === 'cglitch' ? 1 : 0)));
        let a = tr.a !== undefined ? tr.a : 1;
        let dx = (tr.dx || 0) * size, dy = (tr.dy || 0) * size, s = tr.s !== undefined ? tr.s : 1, sy = tr.sy !== undefined ? tr.sy : 1, rot = tr.rot || 0, blur = (tr.blur || 0) * size;
        let x = c.x;
        if (tr.trk) { const lineMid = ln.x0 + ln.w / 2; x = lineMid + (c.x + c.w / 2 - lineMid) * (1 + tr.trk) - c.w / 2; }
        if (tr.wipe !== undefined) { const edge = ln.x0 + ln.w * tr.wipe; if (c.x > edge) return; }
        // out
        if (outD && outU > 0) {
          if (cfg.out === 'fade') a *= 1 - outE;
          if (cfg.out === 'down') { dy += outE * size * 0.6; a *= 1 - outE; }
          if (cfg.out === 'blur') { blur += outE * size * 0.25; a *= 1 - outE; }
          if (cfg.out === 'scale') { s *= 1 - 0.4 * outE; a *= 1 - outE; }
          if (cfg.out === 'wipe') { const edge = ln.x0 + ln.w * outE; if (c.x + c.w < edge) return; }
        }
        if (a <= 0.003) return;
        ctx.save();
        ctx.globalAlpha = Math.min(1, a);
        ctx.translate(x + c.w / 2 + dx, c.y + dy - size * 0.3);
        if (rot) ctx.rotate(rot);
        if (s !== 1 || sy !== 1) ctx.scale(s, s * sy);
        ctx.translate(-c.w / 2, size * 0.3);
        if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(1)}px)`;
        const fill = makeFill(ctx, st, size, ln.x0, ln.w, x, accColor, c.acc);
        let co = color && !c.acc ? color : null;
        if (tr.hl !== undefined && !c.acc) co = tr.hl >= 1 ? (color || null) : 'rgba(255,255,255,.55)';
        drawGlyph(ctx, st, c.ch, size, fill, accColor, c.acc, co);
        ctx.restore();
        lastVisible = c;
      });
      ctx.restore();
    });
    // typewriter cursor
    if (an.cursor && t < dur - outD) {
      const blink = Math.floor(t * 2.5) % 2 === 0;
      const c = lastVisible || (lay.lines[0] && lay.lines[0].chars[0]);
      if (c && blink) { ctx.fillStyle = accColor; ctx.fillRect(c.x + (lastVisible ? c.w : 0) + size * 0.06, c.y - size * 0.78, size * 0.07, size * 0.92); }
    }
    return lay;
  };

  /* ---------------- templates ---------------- */
  function rrect(ctx, x, y, w, h, r) { r = Math.min(r, h / 2, Math.abs(w) / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const pop = (t, st, d) => E.back(cl((t - st) / d));
  const eo = (t, st, d) => E.out(cl((t - st) / d));
  function outK(t, dur) { return 1 - E.inout(cl((t - (dur - 0.35)) / 0.35)); }
  function fitFont(ctx, txt, font, maxW, start) { let s = start; ctx.font = font(s); while (s > 10 && ctx.measureText(txt).width > maxW) { s -= 2; ctx.font = font(s); } return s; }
  K.TEMPLATES = [
    { id: 'hook', name: 'Hook (Etiket + Başlık)', fields: [['l1', 'Etiket', 'Hastanın eşi sordu'], ['l2', 'Beyaz satır', 'Ameliyatın da bu çizim gibiyse'], ['l3', 'Dev vurgu', 'kalkalım!']], dur: 3.5 },
    { id: 'stat', name: 'Büyük Sayı', fields: [['num', 'Sayı', '%90'], ['lab', 'Açıklama', 'Kanı kas içi damarlar taşır']], dur: 3 },
    { id: 'lower', name: 'İsim Bandı', fields: [['name', 'İsim', 'Prof. Dr. Ahmet Akgül'], ['title', 'Unvan', 'Kalp ve Damar Cerrahı']], dur: 4 },
    { id: 'steps', name: 'Süreç Kartı', fields: [['title', 'Başlık', 'SÜREÇ'], ['s1', 'Adım 1 (büyük | birim | alt)', '2–2,5 | SAAT | Ameliyat'], ['s2', 'Adım 2', '1 | GECE | Hastanede'], ['s3', 'Adım 3', 'SABAH | | Taburcu']], dur: 7.5 },
    { id: 'versus', name: 'Karşılaştırma', fields: [['label', 'Başlık', 'ÇİZİM Mİ, AMELİYAT MI?'], ['a', 'Sol', 'ÇİZİM'], ['b', 'Sağ', 'AMELİYAT']], dur: 4 }
  ];
  K.drawTemplate = function (ctx, W, H, t, tp, f, acc) {
    ctx.clearRect(0, 0, W, H);
    const sc = W / 1080, X = 70 * sc, RW = 888 * sc - X, dur = tp.dur;
    const ok = outK(t, dur);
    acc = acc || '#FF2E43';
    ctx.save(); ctx.globalAlpha = ok;
    if (tp.id === 'hook') {
      const y0 = 262 * H / 1920;
      const k0 = pop(t, 0.08, 0.45), k1 = eo(t, 0.3, 0.45), k2 = pop(t, 0.62, 0.5);
      ctx.font = `700 ${30 * sc}px KPoppins`;
      const pw = ctx.measureText(f.l1).width + 44 * sc;
      ctx.save(); ctx.translate(X + 10 * sc, y0 + 27 * sc); ctx.scale(k0, k0); ctx.translate(0, -27 * sc);
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 20 * sc; ctx.shadowOffsetY = 6 * sc;
      ctx.fillStyle = acc; rrect(ctx, 0, 0, pw, 54 * sc, 14 * sc); ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(f.l1, 22 * sc, 28 * sc); ctx.restore();
      ctx.textBaseline = 'alphabetic';
      const s2 = fitFont(ctx, f.l2, s => `800 ${s}px KPoppins`, 940 * sc, 58 * sc);
      ctx.save(); ctx.globalAlpha = ok * k1; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 18 * sc; ctx.shadowOffsetY = 4 * sc;
      ctx.fillText(f.l2, X + 10 * sc, y0 + 54 * sc + 16 * sc + s2 * 0.95 + (1 - k1) * 30 * sc); ctx.restore();
      const s3 = fitFont(ctx, f.l3, s => `900 ${s}px KPoppins`, 940 * sc, 92 * sc);
      ctx.save(); const by = y0 + 54 * sc + 16 * sc + s2 * 1.08 + 4 * sc + s3 * 0.95;
      ctx.translate(X + 10 * sc, by); ctx.scale(0.7 + 0.3 * k2, 0.7 + 0.3 * k2); ctx.globalAlpha = ok * cl(k2);
      ctx.fillStyle = acc; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 20 * sc; ctx.shadowOffsetY = 4 * sc; ctx.fillText(f.l3, 0, 0); ctx.restore();
    } else if (tp.id === 'stat') {
      const k = eo(t, 0.05, 0.9), kl = eo(t, 0.45, 0.5);
      const m = String(f.num).match(/^(\D*)(\d+)(.*)$/);
      const txt = m ? m[1] + Math.round(parseInt(m[2]) * k) + m[3] : f.num;
      const cy = 1250 * H / 1920;
      ctx.textAlign = 'center';
      const s = fitFont(ctx, f.num, s => `900 ${s}px KPoppins`, 860 * sc, 230 * sc);
      ctx.save(); ctx.translate(W / 2, cy); ctx.scale(1.25 - 0.25 * E.out(cl(t / 0.5)), 1.25 - 0.25 * E.out(cl(t / 0.5)));
      ctx.globalAlpha = ok * cl(t / 0.25); ctx.fillStyle = acc; ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 30 * sc; ctx.fillText(txt, 0, 0); ctx.restore();
      ctx.fillStyle = acc; ctx.fillRect(W / 2 - 60 * sc * kl, cy + 34 * sc, 120 * sc * kl, 7 * sc);
      ctx.globalAlpha = ok * kl; ctx.fillStyle = '#fff'; fitFont(ctx, f.lab, s => `700 ${s}px KPoppins`, 860 * sc, 46 * sc);
      ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 14 * sc; ctx.fillText(f.lab, W / 2, cy + 100 * sc + (1 - kl) * 20 * sc);
      ctx.textAlign = 'left';
    } else if (tp.id === 'lower') {
      const k = eo(t, 0, 0.55), k2 = eo(t, 0.25, 0.5), y = 1330 * H / 1920;
      ctx.font = `800 ${50 * sc}px KPoppins`; const nw = ctx.measureText(f.name).width;
      ctx.font = `600 ${32 * sc}px KInterTight`; const tw = ctx.measureText(f.title).width;
      const bw = Math.max(nw, tw) + 70 * sc;
      ctx.fillStyle = acc; ctx.fillRect(X, y - 70 * sc, 10 * sc, 150 * sc * k);
      ctx.save(); ctx.beginPath(); ctx.rect(X + 10 * sc, y - 80 * sc, bw * k, 170 * sc); ctx.clip();
      ctx.fillStyle = 'rgba(12,13,18,.86)'; ctx.fillRect(X + 10 * sc, y - 70 * sc, bw, 150 * sc);
      ctx.fillStyle = '#fff'; ctx.font = `800 ${50 * sc}px KPoppins`; ctx.fillText(f.name, X + 40 * sc, y + 4 * sc);
      ctx.globalAlpha = ok * k2; ctx.fillStyle = '#C9CED6'; ctx.font = `600 ${32 * sc}px KInterTight`; ctx.fillText(f.title, X + 40 * sc, y + 52 * sc);
      ctx.restore();
    } else if (tp.id === 'steps') {
      drawSteps(ctx, W, H, t, f, acc === '#FF2E43' ? '#FFB21E' : acc, dur);
    } else if (tp.id === 'versus') {
      const k = eo(t, 0, 0.5), ka = pop(t, 0.2, 0.5), kb = pop(t, 0.45, 0.5), cy = 1300 * H / 1920;
      ctx.textAlign = 'center';
      ctx.font = `700 ${26 * sc}px KPoppins`; ctx.fillStyle = '#fff'; ctx.globalAlpha = ok * k;
      const lab = f.label.split('').join(String.fromCharCode(8202));
      ctx.fillText(lab, (X + 888 * sc) / 2, cy - 120 * sc);
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect((X + 888 * sc) / 2 - 1.5 * sc, cy - 90 * sc, 3 * sc, 170 * sc * k);
      const cx1 = X + (888 * sc - X) * 0.25, cx2 = X + (888 * sc - X) * 0.75;
      [[f.a, cx1, ka, '#3D7BFF'], [f.b, cx2, kb, acc]].forEach(([tx, cx, kk, col]) => {
        ctx.save(); ctx.translate(cx, cy); ctx.scale(cl(kk) * 0.2 + 0.8 * kk, kk); ctx.globalAlpha = ok * cl(kk);
        fitFont(ctx, tx, s => `900 ${s}px KPoppins`, 380 * sc, 76 * sc);
        ctx.fillStyle = col; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 20 * sc; ctx.fillText(tx, 0, 0); ctx.restore();
      });
      ctx.textAlign = 'left';
    }
    ctx.restore();
  };
  function drawSteps(ctx, W, H, t, f, AC, dur) {
    const sc = W / 1080;
    const steps = [f.s1, f.s2, f.s3].filter(Boolean).map(s => { const p = s.split('|').map(x => x.trim()); return { big: p[0] || '', unit: p[1] || '', sub: p[2] || '' }; });
    const n = steps.length; if (!n) return;
    const CT = 1150 * H / 1920, CB = 1524 * H / 1920, CL = 70 * sc, CR = 887 * sc;
    const L = CL + 36 * sc, R = CR - 36 * sc, Wd = R - L;
    const slot = dur / n, idx = Math.min(n - 1, Math.floor(t / slot)), lf = t - idx * slot;
    const kc = E.out(cl(t / 0.36));
    ctx.save(); ctx.globalAlpha *= kc; ctx.translate(0, (1 - kc) * 40 * sc);
    ctx.fillStyle = 'rgba(11,13,19,.94)'; rrect(ctx, CL, CT, CR - CL, CB - CT, 30 * sc); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1.5 * sc; ctx.stroke();
    ctx.fillStyle = AC; ctx.beginPath(); ctx.arc(L + 7 * sc, CT + 44 * sc, 7 * sc, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${28 * sc}px KPoppins`; ctx.fillText(f.title.split('').join(String.fromCharCode(8202)), L + 26 * sc, CT + 54 * sc);
    ctx.textAlign = 'right'; ctx.font = `700 ${28 * sc}px KInterTight`; ctx.fillStyle = '#AEB4BF';
    ctx.fillText(`${String(idx + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, R, CT + 54 * sc); ctx.textAlign = 'left';
    // stage
    const st = steps[idx]; const kIn = E.out(cl(lf / 0.44));
    const LINE_Y = 1428 * H / 1920, ST_T = 1214 * H / 1920;
    ctx.save(); ctx.beginPath(); ctx.rect(L - 10 * sc, ST_T, Wd + 20 * sc, LINE_Y - ST_T - 22 * sc); ctx.clip();
    const fs = Math.min(172 * sc, fitFont(ctx, st.big, s => `900 ${s}px KPoppins`, Wd - (st.unit ? 240 * sc : 0), 172 * sc));
    ctx.font = `900 ${fs}px KPoppins`;
    const by = ST_T + fs * 0.92 + (1 - kIn) * fs * 1.05;
    ctx.fillStyle = '#fff'; ctx.fillText(st.big, L, by);
    const bw = ctx.measureText(st.big).width;
    if (st.unit) {
      const ku = E.out(cl((lf - 0.24) / 0.4));
      ctx.fillStyle = AC; ctx.fillRect(L + bw + 24 * sc, by - fs * 0.13 - (st.big.length <= 2 ? 88 : 64) * sc - 16 * sc, 70 * sc * ku, 7 * sc);
      ctx.font = `800 ${(st.big.length <= 2 ? 88 : 64) * sc}px KPoppins`; ctx.globalAlpha *= ku; ctx.fillText(st.unit, L + bw + 24 * sc, by - fs * 0.13);
    }
    ctx.restore();
    // journey line
    const stopX = i => L + 12 * sc + i * ((Wd - 24 * sc) / (n - 1 || 1));
    const mv = E.out(cl(lf / 0.48));
    const dotX = idx === 0 ? L + (stopX(0) - L) * E.out(cl(t / 0.56)) : stopX(idx - 1) + (stopX(idx) - stopX(idx - 1)) * mv;
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(L, LINE_Y, Wd, 4 * sc);
    ctx.fillStyle = AC; ctx.fillRect(L, LINE_Y, Math.max(0, dotX - L), 4 * sc);
    steps.forEach((s, i) => {
      const x = stopX(i), reached = i < idx || (i === idx && mv > 0.95) || (i === 0 && t > 0.56), cur = i === idx;
      ctx.beginPath(); ctx.arc(x, LINE_Y + 2 * sc, 10 * sc, 0, 7); ctx.fillStyle = reached ? AC : '#0b0d13'; ctx.fill();
      ctx.lineWidth = 4 * sc; ctx.strokeStyle = reached ? AC : 'rgba(255,255,255,.75)'; ctx.stroke();
      ctx.font = `${cur ? 800 : 600} ${(cur ? 40 : 36) * sc}px KPoppins`; ctx.fillStyle = cur ? '#fff' : '#C9CED6';
      ctx.textAlign = i === 0 ? 'left' : i === n - 1 ? 'right' : 'center';
      ctx.fillText(s.sub, i === 0 ? L : i === n - 1 ? R : x, LINE_Y + 66 * sc);
    });
    ctx.textAlign = 'left';
    ctx.beginPath(); ctx.arc(dotX, LINE_Y + 2 * sc, 15 * sc, 0, 7); ctx.fillStyle = '#fff';
    ctx.shadowColor = AC; ctx.shadowBlur = 22 * sc; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.restore();
  }

  /* ---------------- captions ---------------- */
  K.drawCaption = function (ctx, W, H, t, line, cfg) {
    ctx.clearRect(0, 0, W, H);
    const sc = W / 1080, size = (cfg.size || 54) * sc;
    const st = K.style(cfg.style || 'clean');
    const acc = cfg.accent || '#FFB21E';
    const words = line.words.map(w => ({ ...w, w: cfg.upper ? w.w.toLocaleUpperCase('tr-TR') : w.w }));
    ctx.font = fontStr(st, size);
    const sp = ctx.measureText(' ').width * 1.25 + (cfg.pop ? size * 0.08 : 0);
    // wrap to max width
    const maxW = (cfg.maxW || 800) * sc, rows = [[]];
    let rw = 0;
    words.forEach(w => { const ww = ctx.measureText(w.w).width; if (rows[rows.length - 1].length && rw + sp + ww > maxW) { rows.push([]); rw = 0; } rw += (rw ? sp : 0) + ww; rows[rows.length - 1].push({ ...w, ww }); });
    const lh = size * 1.14, blockH = lh * rows.length;
    let top = cfg.pos === 'top' ? 260 * H / 1920 : cfg.pos === 'mid' ? H / 2 - blockH / 2 : (cfg.y ? cfg.y / 100 * H - blockH / 2 : 1035 * H / 1920);
    const cx = cfg.pos === 'bottom' || !cfg.pos ? (70 * sc + 887 * sc) / 2 : W / 2;
    const k = E.back(cl((t - line.s) / 0.16));
    const ko = 1 - cl((t - (line.e - 0.06)) / 0.06);
    if (cfg.bar) {
      const bw = Math.max(...rows.map(r => r.reduce((a, w) => a + w.ww, 0) + sp * (r.length - 1))) + size * 0.7;
      ctx.save(); ctx.globalAlpha = 0.8 * ko; ctx.fillStyle = 'rgba(8,8,12,.85)';
      rrect(ctx, cx - bw / 2, top - size * 0.18, bw, blockH + size * 0.2, size * 0.25); ctx.fill(); ctx.restore();
    }
    rows.forEach((r, ri) => {
      const lw = r.reduce((a, w) => a + w.ww, 0) + sp * (r.length - 1);
      let x = cx - lw / 2; const y = top + lh * ri + size * 0.86;
      r.forEach(w => {
        const shown = cfg.mode === 'word' ? t >= w.s - 0.02 : true;
        const active = t >= w.s && t < w.e + 0.05;
        if (shown) {
          const wk = cfg.mode === 'word' ? E.back(cl((t - w.s) / 0.14)) : k;
          ctx.save(); ctx.globalAlpha = ko * cl(wk * 1.5);
          ctx.translate(x + w.ww / 2, y - size * 0.3); const s2 = (0.9 + 0.1 * wk) * (active && cfg.pop ? 1.08 : 1); ctx.scale(s2, s2); ctx.translate(-w.ww / 2, size * 0.3);
          const col = active && cfg.hl !== false ? acc : (cfg.color || '#fff');
          drawGlyph(ctx, st, w.w, size, col, acc, false, col);
          ctx.restore();
        }
        x += w.ww + sp;
      });
    });
  };

  /* ---------------- render to PNG sequence ---------------- */
  K.renderSeq = async function (opts) {
    // opts: {W,H,fps,dur,draw:(ctx,t)=>void, dir, prefix, onProg}
    const nreq = (G.cep_node && G.cep_node.require) || require;
    const fs = nreq('fs'), path = nreq('path');
    fs.mkdirSync(opts.dir, { recursive: true });
    const cv = document.createElement('canvas'); cv.width = opts.W; cv.height = opts.H;
    const ctx = cv.getContext('2d');
    const N = Math.max(1, Math.round(opts.dur * opts.fps));
    let first = null;
    for (let i = 0; i < N; i++) {
      opts.draw(ctx, i / opts.fps);
      const b64 = cv.toDataURL('image/png').split(',')[1];
      const fp = path.join(opts.dir, `${opts.prefix || 'kfx'}_${String(i).padStart(5, '0')}.png`);
      fs.writeFileSync(fp, Buffer.from(b64, 'base64'));
      if (!first) first = fp;
      if (opts.onProg && i % 5 === 0) { opts.onProg(i / N); await new Promise(r => setTimeout(r, 0)); }
    }
    return { first, frames: N };
  };
  G.KText = K;
})(typeof window !== 'undefined' ? window : globalThis);
