/*
 * KURGU FX (com.vedat.kurgufx, v1.3) eklentisinden alindi - yapimcisi Vedat'in
 * onayiyla, TK Caption'da herkese acik yayinlanmak uzere. Icerik degistirilmedi.
 */
/* KURGU FX — 74 hazır şablon (canvas, 1080x1920 tabanlı) */
(function (G) {
  const cl = v => Math.max(0, Math.min(1, v));
  const Eo = u => 1 - Math.pow(1 - cl(u), 3), Ei = u => Math.pow(cl(u), 3), Eio = u => { u = cl(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
  const Eb = u => { u = cl(u); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
  const Eel = u => { u = cl(u); return u === 0 ? 0 : u === 1 ? 1 : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (2 * Math.PI) / 3) + 1; };
  const F = { PP: 'KPoppins', IT: 'KInterTight', AN: 'KAnton', PF: 'KPlayfair', MS: 'KMontserrat', BB: 'KBebas', UB: 'KUnbounded', SY: 'KSyne', AB: 'KArchivoBlack', BG: 'KBricolage', DS: 'KDMSerif', IS: 'KInstrument', SG: 'KSpaceGrotesk' };

  /* ------------ drawing context helper ------------ */
  function mk(ctx, W, H, t, dur) {
    const s = W / 1080, Y = H / 1920;
    const o = {
      ctx, W, H, t, dur, s,
      x: v => v * s, y: v => v * Y,
      k: (st, d) => cl((t - st) / (d || 0.4)),               // linear progress
      e: (st, d) => Eo((t - st) / (d || 0.4)),
      b: (st, d) => Eb((t - st) / (d || 0.45)),
      out: () => 1 - Eio((t - (dur - 0.35)) / 0.35),
      font: (w, size, fam, it) => { ctx.font = `${it ? 'italic ' : ''}${w} ${size * s}px ${F[fam || 'PP']}`; },
      tw: str => ctx.measureText(str).width,
      fit(str, w, size, fam, maxW) { let z = size; this.font(w, z, fam); while (z > 12 && this.tw(str) > maxW * s) { z -= 2; this.font(w, z, fam); } return z; },
      rr(x, y, w, h, r) { r = Math.max(0, Math.min(r, h / 2, Math.abs(w) / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); },
      fillRR(x, y, w, h, r, c) { this.rr(x, y, w, h, r); ctx.fillStyle = c; ctx.fill(); },
      shadow(b, c, oy) { ctx.shadowColor = c || 'rgba(0,0,0,.55)'; ctx.shadowBlur = (b || 18) * s; ctx.shadowOffsetY = (oy || 4) * s; },
      noShadow() { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.shadowOffsetX = 0; },
      text(str, x, y, c, align) { ctx.textAlign = align || 'left'; ctx.fillStyle = c; ctx.fillText(str, x, y); ctx.textAlign = 'left'; },
      clipRect(x, y, w, h) { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); },
      // reveal text from a mask (slide up)
      rise(str, x, y, size, c, st, d, align) { ctx.save(); const k = Eo((t - st) / (d || 0.5)); this.clipRect(-10, y - size * s * 1.05, W + 20, size * s * 1.32); ctx.globalAlpha *= cl(k * 3); this.text(str, x, y + (1 - k) * size * s * 1.1, c, align); ctx.restore(); },
      // per-char pop
      chars(str, x, y, c, st, step, align) { const total = this.tw(str); let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x; for (let i = 0; i < str.length; i++) { const ch = str[i], w = this.tw(ch), k = Eb((t - st - i * (step || 0.03)) / 0.35); if (k > 0.001) { ctx.save(); ctx.globalAlpha *= cl(k * 2); ctx.translate(cx + w / 2, y); ctx.scale(k, k); this.text(ch, -w / 2, 0, c); ctx.restore(); } cx += w; } },
      // typewriter
      type(str, x, y, c, st, cps, align) { const n = Math.floor(Math.max(0, t - st) * (cps || 22)); const sub = str.slice(0, n); this.text(sub, x, y, c, align); return sub; },
      // count up for numeric strings
      count(str, k) { const m = String(str).match(/^(\D*)(\d+)([.,]?\d*)(.*)$/); if (!m) return str; const n = parseInt(m[2]); return m[1] + Math.round(n * Eo(k)) + (k >= 1 ? m[3] : '') + m[4]; },
      words(str, x, y, c, st, step, align) { const ws = String(str).split(' '); const sp = this.tw(' '); const tot = this.tw(str); let cx = align === 'center' ? x - tot / 2 : x; ws.forEach((w, i) => { const k = Eo((t - st - i * (step || 0.09)) / 0.4); ctx.save(); ctx.globalAlpha *= k; this.text(w, cx, y + (1 - k) * 30 * s, c); ctx.restore(); cx += this.tw(w) + sp; }); }
    };
    return o;
  }
  const L = 70, R = 887, CX = 478; // safe zone (Reels)

  /* ------------ template definitions ------------ */
  const TPL = [];
  const def = (cat, id, name, dur, fields, draw) => TPL.push({ cat, id, name, dur, fields, draw });
  const nameF = [['a', 'İsim', 'Prof. Dr. Ahmet Akgül'], ['b', 'Unvan', 'Kalp ve Damar Cerrahı']];

  /* ===== ALT BANT (lower thirds) ===== */
  def('ALT BANT', 'lt_bar', 'Çubuklu Bant', 4, nameF, (o, f, A) => {
    const { ctx } = o, y = o.y(1330), k = o.e(0, 0.5), k2 = o.e(0.2, 0.5);
    o.font(800, 50); const w = Math.max(o.tw(f.a), (o.font(600, 32, 'IT'), o.tw(f.b))) + o.x(70);
    ctx.fillStyle = A; ctx.fillRect(o.x(L), y - o.x(70), o.x(10), o.x(150) * k);
    ctx.save(); o.clipRect(o.x(L + 10), y - o.x(80), w * k, o.x(170));
    o.fillRR(o.x(L + 10), y - o.x(70), w, o.x(150), 0, 'rgba(12,13,18,.88)');
    o.font(800, 50); o.text(f.a, o.x(L + 40), y + o.x(4), '#fff');
    ctx.globalAlpha *= k2; o.font(600, 32, 'IT'); o.text(f.b, o.x(L + 40), y + o.x(52), '#C9CED6'); ctx.restore();
  });
  def('ALT BANT', 'lt_pill', 'Hap İsim', 4, nameF, (o, f, A) => {
    const { ctx } = o, y = o.y(1360), kb = o.b(0, 0.5), k2 = o.e(0.25, 0.4);
    o.font(800, 44); const w = o.tw(f.a) + o.x(64);
    ctx.save(); ctx.translate(o.x(L), y); ctx.scale(kb, kb); o.shadow(24); o.fillRR(0, -o.x(40), w, o.x(80), o.x(40), A); o.noShadow(); o.text(f.a, o.x(32), o.x(15), '#fff'); ctx.restore();
    ctx.globalAlpha *= k2; o.font(600, 30, 'IT'); o.shadow(10); o.text(f.b, o.x(L + 10), y + o.x(80) + (1 - k2) * o.x(20), '#fff');
  });
  def('ALT BANT', 'lt_line', 'Çizgili Minimal', 4, nameF, (o, f, A) => {
    const { ctx } = o, y = o.y(1380), k = o.e(0, 0.6);
    o.shadow(14); o.font(800, 54); o.rise(f.a, o.x(L), y, 54, '#fff', 0.1, 0.5);
    ctx.fillStyle = A; o.noShadow(); ctx.fillRect(o.x(L), y + o.x(22), o.x(360) * k, o.x(5));
    o.shadow(10); o.font(500, 30, 'IT'); o.rise(f.b, o.x(L), y + o.x(72), 30, '#E9EBEF', 0.35, 0.5);
  });
  def('ALT BANT', 'lt_two', 'İki Renk Kutu', 4, nameF, (o, f, A) => {
    const { ctx } = o, y = o.y(1320), k = o.e(0, 0.45), k2 = o.e(0.15, 0.45);
    o.font(800, 46); const w1 = o.tw(f.a) + o.x(50); o.font(700, 30, 'IT'); const w2 = o.tw(f.b) + o.x(40);
    ctx.save(); o.clipRect(o.x(L), y - o.x(60), w1 * k, o.x(80)); o.fillRR(o.x(L), y - o.x(60), w1, o.x(80), 0, '#fff'); o.font(800, 46); o.text(f.a, o.x(L + 25), y - o.x(4), '#111'); ctx.restore();
    ctx.save(); o.clipRect(o.x(L), y + o.x(20), w2 * k2, o.x(56)); o.fillRR(o.x(L), y + o.x(20), w2, o.x(56), 0, A); o.font(700, 30, 'IT'); o.text(f.b, o.x(L + 20), y + o.x(58), '#fff'); ctx.restore();
  });
  def('ALT BANT', 'lt_glass', 'Cam Kart', 4, nameF, (o, f, A) => {
    const { ctx } = o, y = o.y(1300), k = o.e(0, 0.5);
    o.font(800, 46); const w = Math.max(o.tw(f.a), (o.font(600, 30, 'IT'), o.tw(f.b))) + o.x(120);
    ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * o.x(40));
    o.fillRR(o.x(L), y, w, o.x(140), o.x(28), 'rgba(255,255,255,.16)'); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = o.x(2); ctx.stroke();
    ctx.fillStyle = A; ctx.beginPath(); ctx.arc(o.x(L + 50), y + o.x(70), o.x(22) * o.b(0.2), 0, 7); ctx.fill();
    o.shadow(10); o.font(800, 46); o.text(f.a, o.x(L + 92), y + o.x(66), '#fff'); o.font(600, 30, 'IT'); o.text(f.b, o.x(L + 92), y + o.x(108), '#E6E8EC'); ctx.restore();
  });
  def('ALT BANT', 'lt_side', 'Yan Vurgu Sağ', 4, nameF, (o, f, A) => {
    const { ctx } = o, y = o.y(1340), k = o.e(0, 0.5), k2 = o.e(0.2, 0.5);
    ctx.fillStyle = A; ctx.fillRect(o.x(R) - o.x(8), y - o.x(70), o.x(8), o.x(140) * k);
    o.shadow(14); o.font(800, 50); ctx.save(); ctx.globalAlpha *= k; o.text(f.a, o.x(R - 30) + (1 - k) * o.x(40), y, '#fff', 'right'); ctx.restore();
    o.font(600, 30, 'IT'); ctx.globalAlpha *= k2; o.text(f.b, o.x(R - 30) + (1 - k2) * o.x(40), y + o.x(50), A, 'right');
  });
  def('ALT BANT', 'lt_outline', 'Kontur Kutu', 4, nameF, (o, f, A) => {
    const { ctx } = o, y = o.y(1330), k = o.k(0, 0.7);
    o.font(800, 46); const w = Math.max(o.tw(f.a), (o.font(600, 30, 'IT'), o.tw(f.b))) + o.x(70), h = o.x(140);
    ctx.strokeStyle = A; ctx.lineWidth = o.x(4); const per = 2 * (w + h); ctx.setLineDash([per * Eo(k), per]); o.rr(o.x(L), y - o.x(70), w, h, o.x(10)); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha *= o.e(0.3, 0.4); o.shadow(10); o.font(800, 46); o.text(f.a, o.x(L + 35), y + o.x(-6), '#fff'); o.font(600, 30, 'IT'); o.text(f.b, o.x(L + 35), y + o.x(42), '#D9DCE2');
  });
  def('ALT BANT', 'lt_grad', 'Gradyan Şerit', 4, nameF, (o, f, A) => {
    const { ctx } = o, y = o.y(1350), k = o.e(0, 0.6);
    const g = ctx.createLinearGradient(0, 0, o.x(800), 0); g.addColorStop(0, A); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); o.clipRect(0, y - o.x(70), o.x(820) * k, o.x(150)); ctx.fillStyle = g; ctx.fillRect(0, y - o.x(70), o.x(820), o.x(150)); ctx.restore();
    o.shadow(10); o.font(800, 50); o.rise(f.a, o.x(L), y + o.x(-2), 50, '#fff', 0.15); o.font(600, 30, 'IT'); o.rise(f.b, o.x(L), y + o.x(46), 30, '#fff', 0.3);
  });
  def('ALT BANT', 'lt_type', 'Daktilo İsim', 4.5, nameF, (o, f, A) => {
    const { ctx } = o, y = o.y(1360);
    o.shadow(12); o.font(800, 50, 'MS'); const sub = o.type(f.a, o.x(L), y, '#fff', 0.1, 24);
    if (Math.floor(o.t * 3) % 2 === 0 || sub.length < f.a.length) { ctx.fillStyle = A; ctx.fillRect(o.x(L) + o.tw(sub) + o.x(8), y - o.x(42), o.x(5), o.x(50)); }
    o.font(600, 30, 'IT'); o.type(f.b, o.x(L), y + o.x(50), A, 0.1 + f.a.length / 24 + 0.15, 30);
  });
  def('ALT BANT', 'lt_tag', 'Etiketli', 4, [['tag', 'Etiket', 'UZMAN'], ...nameF], (o, f, A) => {
    const { ctx } = o, y = o.y(1350), kb = o.b(0, 0.4), k = o.e(0.15, 0.5);
    o.font(800, 24); const tw = o.tw(f.tag) + o.x(30);
    ctx.save(); ctx.translate(o.x(L), y - o.x(75)); ctx.scale(kb, kb); o.fillRR(0, 0, tw, o.x(40), o.x(6), A); o.text(f.tag, o.x(15), o.x(29), '#fff'); ctx.restore();
    o.shadow(12); o.font(800, 52); o.rise(f.a, o.x(L), y + o.x(10), 52, '#fff', 0.15); o.font(600, 30, 'IT'); ctx.globalAlpha *= k; o.text(f.b, o.x(L), y + o.x(56), '#E4E6EA');
  });

  /* ===== BAŞLIK ===== */
  const titF = [['a', 'Başlık', 'Varis neden olur?']];
  def('BAŞLIK', 't_center', 'Büyük Orta Başlık', 3, titF, (o, f, A) => { o.shadow(24); o.fit(f.a, 900, 110, 'PP', 900); o.chars(f.a, o.x(540), o.y(960), '#fff', 0.05, 0.03, 'center'); });
  def('BAŞLIK', 't_stack', 'İki Satır Yığın', 3.5, [['a', 'Üst', 'BU DAMARI'], ['b', 'Alt (vurgu)', 'KORUYORUZ']], (o, f, A) => {
    o.shadow(20); o.fit(f.a, 400, 120, 'AN', 860); o.rise(f.a, o.x(540), o.y(930), 120, '#fff', 0.05, 0.5, 'center');
    o.fit(f.b, 400, 150, 'AN', 900); o.rise(f.b, o.x(540), o.y(1080), 150, A, 0.25, 0.5, 'center');
  });
  def('BAŞLIK', 't_words', 'Kelime Kelime', 3.5, titF, (o, f, A) => { o.shadow(18); o.fit(f.a, 800, 92, 'PP', 900); o.words(f.a, o.x(540), o.y(960), '#fff', 0.05, 0.12, 'center'); });
  def('BAŞLIK', 't_box', 'Kutulu Başlık', 3, titF, (o, f, A) => {
    const { ctx } = o; const z = o.fit(f.a, 900, 86, 'PP', 820); const w = o.tw(f.a) + o.x(60), h = o.x(z * 1.35), k = o.e(0, 0.45);
    ctx.save(); ctx.translate(o.x(540), o.y(960)); o.clipRect(-w / 2, -h / 2, w * k, h); o.fillRR(-w / 2, -h / 2, w, h, o.x(14), A); ctx.restore();
    ctx.globalAlpha *= o.e(0.2, 0.3); o.text(f.a, o.x(540), o.y(960) + o.x(z * 0.35), '#fff', 'center');
  });
  def('BAŞLIK', 't_under', 'Altı Çizili', 3, titF, (o, f, A) => {
    const { ctx } = o; o.shadow(18); const z = o.fit(f.a, 800, 96, 'PP', 880); o.rise(f.a, o.x(540), o.y(960), z, '#fff', 0.05, 0.5, 'center');
    o.noShadow(); const w = o.tw(f.a); ctx.fillStyle = A; ctx.fillRect(o.x(540) - w / 2, o.y(960) + o.x(26), w * o.e(0.35, 0.5), o.x(12));
  });
  def('BAŞLIK', 't_outline', 'Kontur + Dolgu', 3, titF, (o, f, A) => {
    const { ctx } = o; const z = o.fit(f.a, 900, 120, 'AN', 900); ctx.textAlign = 'center';
    ctx.lineWidth = o.x(3); ctx.strokeStyle = '#fff'; ctx.strokeText(f.a, o.x(540), o.y(960)); ctx.save(); const w = o.tw(f.a);
    o.clipRect(o.x(540) - w / 2, o.y(960) - o.x(z), w * o.e(0.3, 0.7), o.x(z * 1.3)); o.text(f.a, o.x(540), o.y(960), A, 'center'); ctx.restore();
  });
  def('BAŞLIK', 't_split', 'İki Renkli', 3, [['a', 'Beyaz', 'Kalp'], ['b', 'Renkli', 'Sağlığı']], (o, f, A) => {
    const { ctx } = o; o.shadow(18); o.font(900, 130); const w1 = o.tw(f.a + ' '), w2 = o.tw(f.b), x0 = o.x(540) - (w1 + w2) / 2, k = o.e(0, 0.5), k2 = o.e(0.15, 0.5);
    ctx.save(); ctx.globalAlpha *= k; o.text(f.a, x0 - (1 - k) * o.x(80), o.y(980), '#fff'); ctx.restore(); ctx.save(); ctx.globalAlpha *= k2; o.text(f.b, x0 + w1 + (1 - k2) * o.x(80), o.y(980), A); ctx.restore();
  });
  def('BAŞLIK', 't_chapter', 'Bölüm Numarası', 3.5, [['n', 'Numara', '01'], ['a', 'Başlık', 'Belirtiler']], (o, f, A) => {
    const { ctx } = o; o.shadow(16); o.font(900, 200, 'AN'); ctx.save(); ctx.globalAlpha *= 0.9 * o.e(0, 0.5); o.text(f.n, o.x(L), o.y(900) + (1 - o.e(0, 0.5)) * o.x(60), A); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.fillRect(o.x(L), o.y(940), o.x(140) * o.e(0.2, 0.4), o.x(6)); o.font(800, 70); o.rise(f.a, o.x(L), o.y(1030), 70, '#fff', 0.3);
  });
  def('BAŞLIK', 't_serif', 'Zarif Serif', 3.5, titF, (o, f, A) => { o.shadow(16); o.fit(f.a, 700, 96, 'PF', 880); const { ctx } = o; ctx.font = ctx.font.replace(/^/, 'italic '); o.words(f.a, o.x(540), o.y(960), '#fff', 0.1, 0.15, 'center'); });
  def('BAŞLIK', 't_hashtag', 'Hashtag', 3, [['a', 'Etiket', '#varis']], (o, f, A) => {
    const { ctx } = o, kb = o.b(0, 0.5); o.font(800, 96); const w = o.tw(f.a) + o.x(70);
    ctx.save(); ctx.translate(o.x(540), o.y(960)); ctx.rotate(-0.05); ctx.scale(kb, kb); o.shadow(30); o.fillRR(-w / 2, -o.x(70), w, o.x(130), o.x(20), '#fff'); o.noShadow(); o.text(f.a, 0, o.x(32), A, 'center'); ctx.restore();
  });
  def('BAŞLIK', 't_glitch', 'Glitch Başlık', 2.5, titF, (o, f, A) => {
    const { ctx } = o; o.fit(f.a, 900, 110, 'PP', 900); const j = o.t < 0.5 ? (Math.sin(o.t * 90) * o.x(12)) : 0;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; o.text(f.a, o.x(540) - o.x(6) + j, o.y(960), 'rgba(255,0,70,.9)', 'center'); o.text(f.a, o.x(540) + o.x(6) - j, o.y(960), 'rgba(0,220,255,.9)', 'center'); ctx.restore();
    o.text(f.a, o.x(540), o.y(960), '#fff', 'center');
  });

  /* ===== HOOK ===== */
  def('HOOK', 'h_pill', 'Etiket + Başlık', 3.5, [['l1', 'Etiket', 'Hastanın eşi sordu'], ['l2', 'Beyaz satır', 'Ameliyatın da bu çizim gibiyse'], ['l3', 'Dev vurgu', 'kalkalım!']], (o, f, A) => {
    const { ctx } = o, y0 = o.y(262), X = o.x(L + 10);
    o.font(700, 30); const pw = o.tw(f.l1) + o.x(44), k0 = o.b(0.08, 0.45);
    ctx.save(); ctx.translate(X, y0 + o.x(27)); ctx.scale(k0, k0); ctx.translate(0, -o.x(27)); o.shadow(20, 'rgba(0,0,0,.35)', 6); o.fillRR(0, 0, pw, o.x(54), o.x(14), A); o.noShadow(); ctx.textBaseline = 'middle'; o.text(f.l1, o.x(22), o.x(28), '#fff'); ctx.textBaseline = 'alphabetic'; ctx.restore();
    const z2 = o.fit(f.l2, 800, 58, 'PP', 940), k1 = o.e(0.3, 0.45); ctx.save(); ctx.globalAlpha *= k1; o.shadow(18, 'rgba(0,0,0,.7)'); o.text(f.l2, X, y0 + o.x(70 + z2 * 0.95) + (1 - k1) * o.x(30), '#fff'); ctx.restore();
    const z3 = o.fit(f.l3, 900, 92, 'PP', 940), k2 = o.b(0.62, 0.5); ctx.save(); ctx.translate(X, y0 + o.x(70 + z2 * 1.08 + 4 + z3 * 0.95)); ctx.scale(0.7 + 0.3 * k2, 0.7 + 0.3 * k2); ctx.globalAlpha *= cl(k2); o.shadow(20); o.text(f.l3, 0, 0, A); ctx.restore();
  });
  def('HOOK', 'h_q', 'Soru Hook', 3.5, [['a', 'Soru', 'Bacaklarınız akşam ağrıyor mu?']], (o, f, A) => {
    const { ctx } = o, kb = o.b(0, 0.5); o.font(900, 200, 'AN'); ctx.save(); ctx.translate(o.x(540), o.y(700)); ctx.rotate(-0.12 * (1 - kb)); ctx.scale(kb, kb); o.shadow(30); o.text('?', 0, 0, A, 'center'); ctx.restore();
    o.shadow(18); const z = o.fit(f.a, 800, 70, 'PP', 900); wrap(o, f.a, o.x(540), o.y(860), z, 900, '#fff', 0.3);
  });
  def('HOOK', 'h_warn', 'Uyarı', 3.5, [['a', 'Uyarı', 'DİKKAT'], ['b', 'Mesaj', 'Bu belirtiyi sakın görmezden gelmeyin']], (o, f, A) => {
    const { ctx } = o, kb = o.b(0, 0.45); ctx.save(); ctx.translate(o.x(540), o.y(640)); ctx.scale(kb, kb); o.shadow(30);
    ctx.fillStyle = '#FFD21E'; ctx.beginPath(); ctx.moveTo(0, -o.x(110)); ctx.lineTo(o.x(120), o.x(95)); ctx.lineTo(-o.x(120), o.x(95)); ctx.closePath(); ctx.fill(); o.noShadow(); o.font(900, 140, 'AN'); o.text('!', 0, o.x(80), '#111', 'center'); ctx.restore();
    o.font(900, 90, 'AN'); o.shadow(18); o.rise(f.a, o.x(540), o.y(860), 90, '#FFD21E', 0.25, 0.5, 'center'); const z = o.fit(f.b, 800, 56, 'PP', 880); wrap(o, f.b, o.x(540), o.y(940), z, 880, '#fff', 0.45);
  });
  def('HOOK', 'h_list', '3 Hata', 3.5, [['n', 'Sayı', '3'], ['a', 'Konu', 'HATA'], ['b', 'Alt', 'varis hastalarının yaptığı']], (o, f, A) => {
    const { ctx } = o, kb = o.b(0, 0.5); o.font(900, 340, 'AN'); ctx.save(); ctx.translate(o.x(330), o.y(900)); ctx.scale(kb, kb); o.shadow(30); o.text(f.n, 0, 0, A, 'center'); ctx.restore();
    o.font(900, 130, 'AN'); o.shadow(18); o.rise(f.a, o.x(480), o.y(780), 130, '#fff', 0.2, 0.5); o.font(700, 40); o.rise(f.b, o.x(480), o.y(860), 40, '#fff', 0.35, 0.5);
  });
  def('HOOK', 'h_stop', 'Kaydırmayı Durdur', 3, [['a', 'Metin', 'BUNU BİLMİYORSAN'], ['b', 'Alt', 'izlemeye devam et']], (o, f, A) => {
    const { ctx } = o, k = o.k(0, 0.25); const sh = o.t < 0.35 ? Math.sin(o.t * 80) * o.x(10) * (1 - o.t / 0.35) : 0; ctx.save(); ctx.translate(sh, 0);
    const z = o.fit(f.a, 400, 120, 'AN', 900); o.fillRR(o.x(540) - o.tw(f.a) / 2 - o.x(30), o.y(900) - o.x(z), o.tw(f.a) + o.x(60), o.x(z * 1.25), o.x(8), A); o.text(f.a, o.x(540), o.y(900) + o.x(z * 0.05), '#fff', 'center'); ctx.restore();
    o.font(600, 40, 'IT'); ctx.globalAlpha *= o.e(0.3, 0.4); o.shadow(12); o.text(f.b, o.x(540), o.y(990), '#fff', 'center');
  });
  def('HOOK', 'h_pov', 'POV', 3.5, [['a', 'POV metni', 'POV: Ameliyattan 1 gün sonra eve gidiyorsun']], (o, f, A) => {
    const { ctx } = o; o.font(900, 64, 'AN'); const kb = o.b(0, 0.4); const w = o.tw('POV') + o.x(40);
    ctx.save(); ctx.translate(o.x(L + 10), o.y(300)); ctx.scale(kb, kb); o.fillRR(0, -o.x(60), w, o.x(80), o.x(10), '#fff'); o.text('POV', o.x(20), o.x(4), '#111'); ctx.restore();
    const txt = f.a.replace(/^POV:\s*/i, ''); o.shadow(16); const z = o.fit(txt, 800, 60, 'PP', 940 * 2); wrap(o, txt, o.x(L + 10), o.y(400), Math.min(z, 64), 900, '#fff', 0.25, 'left');
  });

  /* ===== SAYI ===== */
  def('SAYI', 's_big', 'Büyük Sayı', 3, [['num', 'Sayı', '%90'], ['lab', 'Açıklama', 'Kanı kas içi damarlar taşır']], (o, f, A) => {
    const { ctx } = o, cy = o.y(1250); const k = o.k(0.05, 0.9); o.fit(f.num, 900, 230, 'PP', 860); ctx.save(); ctx.translate(o.x(540), cy); const sc = 1.25 - 0.25 * o.e(0, 0.5); ctx.scale(sc, sc); ctx.globalAlpha *= o.k(0, 0.25); o.shadow(30); o.text(o.count(f.num, k), 0, 0, A, 'center'); ctx.restore();
    const kl = o.e(0.45, 0.5); ctx.fillStyle = A; ctx.fillRect(o.x(540) - o.x(60) * kl, cy + o.x(34), o.x(120) * kl, o.x(7)); ctx.globalAlpha *= kl; o.fit(f.lab, 700, 46, 'PP', 860); o.shadow(14); o.text(f.lab, o.x(540), cy + o.x(100), '#fff', 'center');
  });
  def('SAYI', 's_two', 'İki Rakam', 3.5, [['n1', 'Sol sayı', '3–5 mm'], ['l1', 'Sol', 'Normal damar'], ['n2', 'Sağ sayı', '10 mm'], ['l2', 'Sağ', 'Varisli damar']], (o, f, A) => {
    const { ctx } = o, cy = o.y(1280); [[f.n1, f.l1, 0.25, '#fff', 0], [f.n2, f.l2, 0.75, A, 0.25]].forEach(([n, l, px, c, d]) => {
      const x = o.x(L) + (o.x(R) - o.x(L)) * px, kb = o.b(d, 0.45); ctx.save(); ctx.translate(x, cy); ctx.scale(kb, kb); o.fit(n, 900, 110, 'PP', 380); o.shadow(20); o.text(n, 0, 0, c, 'center'); ctx.restore();
      ctx.save(); ctx.globalAlpha *= o.e(d + 0.25, 0.4); o.font(600, 32, 'IT'); o.shadow(10); o.text(l, x, cy + o.x(60), '#E6E8EC', 'center'); ctx.restore(); });
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(o.x(CX) - o.x(1.5), cy - o.x(100), o.x(3), o.x(190) * o.e(0, 0.5));
  });
  def('SAYI', 's_bar', 'Yüzde Çubuğu', 3.5, [['num', 'Yüzde', '90'], ['lab', 'Etiket', 'Başarı oranı']], (o, f, A) => {
    const { ctx } = o, y = o.y(1300), v = Math.min(100, parseFloat(f.num) || 0), k = o.e(0.2, 1.2), w = o.x(R - L);
    o.font(700, 40); o.shadow(12); o.text(f.lab, o.x(L), y - o.x(30), '#fff'); o.font(900, 64); o.text('%' + Math.round(v * k), o.x(R), y - o.x(22), A, 'right'); o.noShadow();
    o.fillRR(o.x(L), y, w, o.x(28), o.x(14), 'rgba(255,255,255,.25)'); o.fillRR(o.x(L), y, w * v / 100 * k, o.x(28), o.x(14), A);
  });
  def('SAYI', 's_ring', 'Halka Yüzde', 3.5, [['num', 'Yüzde', '75'], ['lab', 'Etiket', 'hastada iz kalmıyor']], (o, f, A) => {
    const { ctx } = o, cx = o.x(540), cy = o.y(1150), r = o.x(150), v = Math.min(100, parseFloat(f.num) || 0), k = o.e(0.1, 1.2);
    ctx.lineWidth = o.x(26); ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
    ctx.strokeStyle = A; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * v / 100 * k); ctx.stroke(); ctx.lineCap = 'butt';
    o.font(900, 96); o.shadow(14); o.text('%' + Math.round(v * k), cx, cy + o.x(34), '#fff', 'center'); o.font(700, 40); ctx.globalAlpha *= o.e(0.5, 0.4); o.text(f.lab, cx, cy + r + o.x(80), '#fff', 'center');
  });
  def('SAYI', 's_mult', 'Çarpan', 3, [['num', 'Çarpan', 'x2'], ['lab', 'Etiket', 'daha hızlı iyileşme']], (o, f, A) => {
    const { ctx } = o, kb = o.b(0, 0.5); o.font(900, 260, 'AN'); ctx.save(); ctx.translate(o.x(540), o.y(1100)); ctx.rotate(-0.08); ctx.scale(kb, kb); o.shadow(30); o.text(f.num, 0, 0, A, 'center'); ctx.restore();
    o.font(800, 50); o.shadow(14); o.rise(f.lab, o.x(540), o.y(1190), 50, '#fff', 0.3, 0.5, 'center');
  });
  def('SAYI', 's_time', 'Süre Sayacı', 3.5, [['num', 'Süre', '2 saat'], ['lab', 'Etiket', 'ameliyat süresi']], (o, f, A) => {
    const { ctx } = o, cx = o.x(540), cy = o.y(1050), k = o.k(0, 1.6); ctx.lineWidth = o.x(10); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, o.x(90), 0, 7); ctx.stroke();
    ctx.strokeStyle = A; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); const a = -Math.PI / 2 + k * Math.PI * 4; ctx.lineTo(cx + Math.cos(a) * o.x(70), cy + Math.sin(a) * o.x(70)); ctx.stroke(); ctx.lineCap = 'butt';
    o.font(900, 90); o.shadow(14); o.text(o.count(f.num, o.k(0.1, 1)), cx, cy + o.x(200), '#fff', 'center'); o.font(600, 38, 'IT'); o.text(f.lab, cx, cy + o.x(260), A, 'center');
  });

  /* ===== LİSTE ===== */
  def('LİSTE', 'l_num', 'Numaralı Liste', 5, [['title', 'Başlık', 'BELİRTİLER'], ['a', '1', 'Akşam ağrısı'], ['b', '2', 'Şişlik'], ['c', '3', 'Kramp']], (o, f, A) => {
    const { ctx } = o; o.font(800, 30); o.shadow(10); o.rise(f.title.split('').join(String.fromCharCode(8202)), o.x(L), o.y(1080), 30, A, 0); [f.a, f.b, f.c].forEach((s2, i) => {
      const y = o.y(1170) + i * o.x(110), d = 0.3 + i * 0.35, kb = o.b(d, 0.4); ctx.save(); ctx.translate(o.x(L + 40), y - o.x(16)); ctx.scale(kb, kb); o.noShadow(); ctx.fillStyle = A; ctx.beginPath(); ctx.arc(0, 0, o.x(36), 0, 7); ctx.fill(); o.font(900, 40); o.text(String(i + 1), 0, o.x(14), '#fff', 'center'); ctx.restore();
      o.font(700, 52); o.shadow(12); ctx.save(); ctx.globalAlpha *= o.e(d + 0.1, 0.4); o.text(s2, o.x(L + 110) + (1 - o.e(d + 0.1, 0.4)) * o.x(30), y, '#fff'); ctx.restore(); });
  });
  def('LİSTE', 'l_check', 'Kontrol Listesi', 5, [['a', '1', 'İz kalmaz'], ['b', '2', 'Aynı gün yürür'], ['c', '3', 'Damar korunur']], (o, f, A) => {
    const { ctx } = o; [f.a, f.b, f.c].forEach((s2, i) => {
      const y = o.y(1140) + i * o.x(120), d = 0.1 + i * 0.4, k = o.k(d, 0.35); ctx.strokeStyle = '#fff'; ctx.lineWidth = o.x(4); o.rr(o.x(L), y - o.x(50), o.x(64), o.x(64), o.x(12)); ctx.stroke();
      if (k > 0) { ctx.strokeStyle = A; ctx.lineWidth = o.x(9); ctx.lineCap = 'round'; ctx.beginPath(); const p = [[14, -20], [28, -4], [52, -38]]; ctx.moveTo(o.x(L + p[0][0]), y + o.x(p[0][1])); const k1 = cl(k * 2), k2 = cl(k * 2 - 1); ctx.lineTo(o.x(L + p[0][0] + (p[1][0] - p[0][0]) * k1), y + o.x(p[0][1] + (p[1][1] - p[0][1]) * k1)); if (k2 > 0) ctx.lineTo(o.x(L + p[1][0] + (p[2][0] - p[1][0]) * k2), y + o.x(p[1][1] + (p[2][1] - p[1][1]) * k2)); ctx.stroke(); ctx.lineCap = 'butt'; }
      o.font(700, 52); o.shadow(12); ctx.save(); ctx.globalAlpha *= o.e(d, 0.4); o.text(s2, o.x(L + 100), y, '#fff'); ctx.restore(); o.noShadow(); });
  });
  def('LİSTE', 'l_dodont', 'Yap / Yapma', 4.5, [['a', 'Yap', 'Yürüyüş yap'], ['b', 'Yapma', 'Uzun süre ayakta kalma']], (o, f, A) => {
    const { ctx } = o; [[f.a, '#2FD27A', '✓', 0], [f.b, '#FF3B4E', '✕', 0.5]].forEach(([s2, c, ic, d], i) => {
      const y = o.y(1180) + i * o.x(150), kb = o.b(d, 0.45); ctx.save(); ctx.translate(o.x(L + 45), y - o.x(18)); ctx.scale(kb, kb); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, o.x(44), 0, 7); ctx.fill(); o.font(900, 52); o.text(ic, 0, o.x(18), '#fff', 'center'); ctx.restore();
      o.shadow(12); const z = o.fit(s2, 700, 50, 'PP', 700); ctx.save(); ctx.globalAlpha *= o.e(d + 0.15, 0.4); o.text(s2, o.x(L + 120), y, '#fff'); ctx.restore(); o.noShadow(); });
  });
  def('LİSTE', 'l_steps', 'Süreç Kartı', 7.5, [['title', 'Başlık', 'SÜREÇ'], ['s1', 'Adım 1 (büyük | birim | alt)', '2–2,5 | SAAT | Ameliyat'], ['s2', 'Adım 2', '1 | GECE | Hastanede'], ['s3', 'Adım 3', 'SABAH | | Taburcu']], (o, f, A) => stepsCard(o, f, A));
  def('LİSTE', 'l_timeline', 'Zaman Çizelgesi', 5, [['a', '1. gün', 'Ameliyat'], ['b', '1. hafta', 'Yürüyüş'], ['c', '1. ay', 'Spor']], (o, f, A) => {
    const { ctx } = o, x = o.x(L + 30), k = o.e(0, 1.6); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(x - o.x(2), o.y(1080), o.x(4), o.x(360)); ctx.fillStyle = A; ctx.fillRect(x - o.x(2), o.y(1080), o.x(4), o.x(360) * k);
    [[f.a, 'Ameliyat'], [f.b], [f.c]].forEach((_, i) => { const lab = [f.a, f.b, f.c][i], nm = (TPL.find(t2 => t2.id === 'l_timeline').fields[i][1]); const y = o.y(1100) + i * o.x(160), d = 0.2 + i * 0.5, kb = o.b(d, 0.4);
      ctx.save(); ctx.translate(x, y); ctx.scale(kb, kb); ctx.fillStyle = A; ctx.beginPath(); ctx.arc(0, 0, o.x(16), 0, 7); ctx.fill(); ctx.restore();
      ctx.save(); ctx.globalAlpha *= o.e(d, 0.4); o.font(700, 28, 'IT'); o.shadow(8); o.text(f['_l' + i] || ['1. GÜN', '1. HAFTA', '1. AY'][i], x + o.x(40), y - o.x(10), A); o.font(800, 50); o.text(lab, x + o.x(40), y + o.x(46), '#fff'); ctx.restore(); });
  });

  /* ===== VURGU ===== */
  def('VURGU', 'c_arrow', 'Ok + Etiket', 3, [['a', 'Etiket', 'Burası damar'], ['dir', 'Yön (sol/sağ)', 'sol']], (o, f, A) => {
    const { ctx } = o, left = !/sa/i.test(f.dir), kx = o.e(0, 0.5), y = o.y(900); ctx.save(); if (!left) { ctx.translate(o.W, 0); ctx.scale(-1, 1); }
    ctx.strokeStyle = A; ctx.lineWidth = o.x(12); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(o.x(520), y); ctx.lineTo(o.x(520) - o.x(260) * kx, y + o.x(120) * kx); ctx.stroke();
    if (kx > 0.9) { const ex = o.x(260), ey = y + o.x(120); ctx.beginPath(); ctx.moveTo(ex + o.x(10), ey - o.x(60)); ctx.lineTo(ex, ey); ctx.lineTo(ex + o.x(66), ey + o.x(16)); ctx.stroke(); } ctx.lineCap = 'butt'; ctx.restore();
    o.font(800, 50); const w = o.tw(f.a) + o.x(50), x = left ? o.x(520) : o.W - o.x(520) - w, kb = o.b(0.25, 0.4); ctx.save(); ctx.translate(x + w / 2, y - o.x(40)); ctx.scale(kb, kb); o.shadow(20); o.fillRR(-w / 2, -o.x(45), w, o.x(80), o.x(14), A); o.noShadow(); o.text(f.a, 0, o.x(14), '#fff', 'center'); ctx.restore();
  });
  def('VURGU', 'c_circle', 'Daire İşaret', 3, [['a', 'Etiket', 'Varis']], (o, f, A) => {
    const { ctx } = o, cx = o.x(540), cy = o.y(960), k = o.e(0, 0.7); ctx.strokeStyle = A; ctx.lineWidth = o.x(10); ctx.lineCap = 'round'; ctx.beginPath(); ctx.ellipse(cx, cy, o.x(200), o.x(140), -0.15, -2, -2 + 6.6 * k); ctx.stroke(); ctx.lineCap = 'butt';
    o.font(800, 54); o.shadow(18); ctx.globalAlpha *= o.e(0.5, 0.4); o.text(f.a, cx, cy + o.x(230), '#fff', 'center');
  });
  def('VURGU', 'c_bracket', 'Köşeli Çerçeve', 3, [['a', 'Etiket', 'ÖNEMLİ']], (o, f, A) => {
    const { ctx } = o, cx = o.x(540), cy = o.y(960), k = o.e(0, 0.5), w = o.x(300) + o.x(80) * (1 - k), h = o.x(300) + o.x(80) * (1 - k), L2 = o.x(60); ctx.strokeStyle = '#fff'; ctx.lineWidth = o.x(8); ctx.globalAlpha *= k;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => { ctx.beginPath(); ctx.moveTo(cx + sx * w / 2, cy + sy * h / 2 - sy * L2); ctx.lineTo(cx + sx * w / 2, cy + sy * h / 2); ctx.lineTo(cx + sx * w / 2 - sx * L2, cy + sy * h / 2); ctx.stroke(); });
    o.font(800, 34); const tw = o.tw(f.a) + o.x(30); o.fillRR(cx - tw / 2, cy + h / 2 + o.x(20), tw, o.x(52), o.x(8), A); o.text(f.a, cx, cy + h / 2 + o.x(58), '#fff', 'center');
  });
  def('VURGU', 'c_pin', 'Konum İğnesi', 3, [['a', 'Etiket', 'Kasık bölgesi']], (o, f, A) => {
    const { ctx } = o, x = o.x(540), y = o.y(900), d = o.b(0, 0.6), drop = (1 - Eel((o.t) / 0.8)) * o.x(-200); ctx.save(); ctx.translate(x, y + drop); o.shadow(20); ctx.fillStyle = A; ctx.beginPath(); ctx.arc(0, -o.x(60), o.x(46), Math.PI, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -o.x(62), o.x(17), 0, 7); ctx.fill(); ctx.restore();
    o.font(800, 44); o.noShadow(); const w = o.tw(f.a) + o.x(40), kb = o.b(0.45, 0.4); ctx.save(); ctx.translate(x, y + o.x(60)); ctx.scale(kb, kb); o.fillRR(-w / 2, 0, w, o.x(70), o.x(35), 'rgba(12,13,18,.88)'); o.text(f.a, 0, o.x(48), '#fff', 'center'); ctx.restore();
  });
  def('VURGU', 'c_badge', 'YENİ Rozeti', 2.5, [['a', 'Rozet', 'YENİ']], (o, f, A) => {
    const { ctx } = o, kb = o.b(0, 0.5), rot = o.t * 0.6; ctx.save(); ctx.translate(o.x(760), o.y(420)); ctx.scale(kb, kb); ctx.rotate(rot * 0.2 - 0.2); o.shadow(24); ctx.fillStyle = A; ctx.beginPath(); for (let i = 0; i < 24; i++) { const r = i % 2 ? o.x(100) : o.x(124), a = i / 24 * Math.PI * 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); o.noShadow(); o.font(900, 44); o.text(f.a, 0, o.x(16), '#fff', 'center'); ctx.restore();
  });
  def('VURGU', 'c_note', 'Not Kartı', 4, [['title', 'Başlık', 'BİLİYOR MUYDUNUZ?'], ['a', 'Not', 'Varis kadınlarda 2 kat daha sık görülür.']], (o, f, A) => {
    const { ctx } = o, k = o.e(0, 0.5), y = o.y(1180); ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * o.x(50)); o.shadow(30, 'rgba(0,0,0,.35)'); o.fillRR(o.x(L), y, o.x(R - L), o.x(280), o.x(24), '#FFF8E6'); o.noShadow(); ctx.fillStyle = A; ctx.fillRect(o.x(L), y, o.x(14), o.x(280));
    o.font(800, 28); o.text(f.title, o.x(L + 44), y + o.x(60), A); const z = o.fit(f.a, 700, 44, 'PP', 99999); wrap(o, f.a, o.x(L + 44), y + o.x(120), Math.min(44, z), R - L - 80, '#1d1d1f', 0.2, 'left', true); ctx.restore();
  });

  /* ===== SOSYAL / CTA ===== */
  def('SOSYAL', 'cta_follow', 'Takip Et', 3, [['a', 'Kullanıcı', '@profdrahmetakgul']], (o, f, A) => {
    const { ctx } = o, kb = o.b(0, 0.45), y = o.y(1350); o.font(800, 40); const w = o.tw(f.a) + o.x(260); ctx.save(); ctx.translate(o.x(CX), y); ctx.scale(kb, kb); o.shadow(24); o.fillRR(-w / 2, -o.x(55), w, o.x(110), o.x(55), '#fff'); o.noShadow();
    ctx.fillStyle = A; ctx.beginPath(); ctx.arc(-w / 2 + o.x(56), 0, o.x(38), 0, 7); ctx.fill(); o.text(f.a, -w / 2 + o.x(110), o.x(14), '#111'); const fk = o.k(0.9, 0.2), followed = o.t > 1.1;
    o.fillRR(w / 2 - o.x(150), -o.x(32), o.x(130), o.x(64), o.x(32), followed ? '#E6E8EC' : A); o.font(800, 26); o.text(followed ? 'Takipte' : 'Takip Et', w / 2 - o.x(85), o.x(9), followed ? '#333' : '#fff', 'center'); ctx.restore();
    if (o.t > 0.7 && o.t < 1.4) cursor(o, o.x(CX) + w / 2 - o.x(70), y + o.x(10), o.k(0.7, 0.4));
  });
  def('SOSYAL', 'cta_like', 'Beğen + Kaydet', 3, [['a', 'Metin', 'Kaydet, sonra lazım olur']], (o, f, A) => {
    const { ctx } = o, y = o.y(1300); [['♥', '#FF3B4E', 0], ['🔖', '#FFD21E', 0.25]].forEach(([ic, c, d], i) => { const kb = o.b(d, 0.4), x = o.x(CX) + (i ? 1 : -1) * o.x(90); ctx.save(); ctx.translate(x, y); ctx.scale(kb, kb); o.shadow(24); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, o.x(70), 0, 7); ctx.fill(); o.noShadow(); o.font(900, i ? 60 : 76); o.text(i ? '★' : '♥', 0, o.x(24), c, 'center'); ctx.restore(); });
    o.font(800, 44); o.shadow(14); o.rise(f.a, o.x(CX), y + o.x(150), 44, '#fff', 0.4, 0.5, 'center');
  });
  def('SOSYAL', 'cta_comment', 'Yorum Yaz', 3.5, [['a', 'Soru', 'Siz hangisini yaşadınız?'], ['b', 'Yorum', 'Yorumlara yazın 👇']], (o, f, A) => {
    const { ctx } = o, y = o.y(1220), k = o.e(0, 0.5); o.font(700, 44); const w = Math.min(o.x(R - L), o.tw(f.a) + o.x(80)); ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * o.x(40)); o.shadow(24); o.fillRR(o.x(CX) - w / 2, y, w, o.x(130), o.x(30), '#fff'); ctx.beginPath(); ctx.moveTo(o.x(CX) - o.x(30), y + o.x(128)); ctx.lineTo(o.x(CX) - o.x(60), y + o.x(170)); ctx.lineTo(o.x(CX) + o.x(10), y + o.x(128)); ctx.fill(); o.noShadow(); o.fit(f.a, 700, 44, 'PP', (w / o.s) - 60); o.text(f.a, o.x(CX), y + o.x(80), '#111', 'center'); ctx.restore();
    o.font(700, 36, 'IT'); o.shadow(12); ctx.globalAlpha *= o.e(0.4, 0.4); o.text(f.b, o.x(CX), y + o.x(240), A, 'center');
  });
  def('SOSYAL', 'cta_sub', 'Abone Ol Butonu', 3, [['a', 'Metin', 'ABONE OL']], (o, f, A) => {
    const { ctx } = o, kb = o.b(0, 0.45), y = o.y(1350), on = o.t > 1.1; o.font(900, 46); const w = o.tw(on ? 'ABONE OLUNDU' : f.a) + o.x(100);
    ctx.save(); ctx.translate(o.x(CX), y); const pr = o.t > 0.95 && o.t < 1.15 ? 0.92 : 1; ctx.scale(kb * pr, kb * pr); o.shadow(24); o.fillRR(-w / 2, -o.x(55), w, o.x(110), o.x(16), on ? '#3a3d45' : '#FF0033'); o.noShadow(); o.text(on ? 'ABONE OLUNDU' : f.a, 0, o.x(16), '#fff', 'center'); ctx.restore();
    if (o.t > 0.5 && o.t < 1.4) cursor(o, o.x(CX) + o.x(40), y + o.x(20), o.k(0.5, 0.5));
  });
  def('SOSYAL', 'cta_link', 'Link Bio\'da', 3, [['a', 'Metin', 'Randevu için link bio\'da']], (o, f, A) => {
    const { ctx } = o, y = o.y(1340), kb = o.b(0, 0.45); o.font(800, 40); const w = o.tw(f.a) + o.x(140); ctx.save(); ctx.translate(o.x(CX), y); ctx.scale(kb, kb); o.shadow(24); o.fillRR(-w / 2, -o.x(50), w, o.x(100), o.x(50), A); o.noShadow(); o.font(900, 46); o.text('🔗', -w / 2 + o.x(60), o.x(16), '#fff', 'center'); o.font(800, 40); o.text(f.a, o.x(30), o.x(14), '#fff', 'center'); ctx.restore();
  });
  def('SOSYAL', 'cta_swipe', 'Kaydır / Devamı', 3, [['a', 'Metin', 'Devamı sonraki videoda']], (o, f, A) => {
    const { ctx } = o, y = o.y(1300), bob = Math.sin(o.t * 6) * o.x(14); ctx.strokeStyle = '#fff'; ctx.lineWidth = o.x(10); ctx.lineCap = 'round'; ctx.globalAlpha *= o.e(0, 0.4);
    [0, 1].forEach(i => { ctx.beginPath(); ctx.moveTo(o.x(CX) - o.x(40), y - o.x(40) + i * o.x(40) + bob); ctx.lineTo(o.x(CX), y + i * o.x(40) + bob); ctx.lineTo(o.x(CX) + o.x(40), y - o.x(40) + i * o.x(40) + bob); ctx.stroke(); }); ctx.lineCap = 'butt';
    o.font(800, 46); o.shadow(14); o.text(f.a, o.x(CX), y - o.x(90), '#fff', 'center');
  });

  /* ===== DİĞER ===== */
  def('DİĞER', 'x_vs', 'Karşılaştırma', 4, [['label', 'Başlık', 'ÇİZİM Mİ, AMELİYAT MI?'], ['a', 'Sol', 'ÇİZİM'], ['b', 'Sağ', 'AMELİYAT']], (o, f, A) => {
    const { ctx } = o, cy = o.y(1300); o.font(700, 26); ctx.globalAlpha *= 1; ctx.save(); ctx.globalAlpha *= o.e(0, 0.5); o.shadow(10); o.text(f.label.split('').join(String.fromCharCode(8202)), o.x(CX), cy - o.x(120), '#fff', 'center'); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(o.x(CX) - o.x(1.5), cy - o.x(90), o.x(3), o.x(170) * o.e(0, 0.5));
    [[f.a, 0.25, '#3D7BFF', 0.2], [f.b, 0.75, A, 0.45]].forEach(([tx, p, c, d]) => { const kb = o.b(d, 0.5), x = o.x(L) + o.x(R - L) * p; ctx.save(); ctx.translate(x, cy); ctx.scale(kb, kb); o.fit(tx, 900, 76, 'PP', 380); o.shadow(20); o.text(tx, 0, 0, c, 'center'); ctx.restore(); });
  });
  def('DİĞER', 'x_quote', 'Alıntı', 5, [['a', 'Alıntı', 'Ressam gibi çizemem ama ressam gibi ameliyat yaparım.'], ['b', 'Kişi', 'Prof. Dr. Ahmet Akgül']], (o, f, A) => {
    const { ctx } = o; o.font(900, 260, 'PF'); ctx.save(); ctx.globalAlpha *= 0.9 * o.e(0, 0.5); o.text('“', o.x(L - 10), o.y(1000), A); ctx.restore();
    o.shadow(14); wrap(o, f.a, o.x(L + 10), o.y(1040), 56, R - L, '#fff', 0.2, 'left', false, 'PF', true); o.font(700, 32, 'IT'); ctx.globalAlpha *= o.e(1.2, 0.5); o.text('— ' + f.b, o.x(L + 10), o.y(1440), A);
  });
  def('DİĞER', 'x_stamp', 'Tarih / Yer', 3.5, [['a', 'Yer', 'İSTANBUL'], ['b', 'Tarih', '2026']], (o, f, A) => {
    const { ctx } = o, x = o.x(L), y = o.y(330); ctx.fillStyle = A; ctx.fillRect(x, y - o.x(46), o.x(8), o.x(100) * o.e(0, 0.4)); o.shadow(12); o.font(900, 52, 'MS'); o.type(f.a, x + o.x(28), y, '#fff', 0.15, 18); o.font(600, 34, 'IT'); o.type(f.b, x + o.x(28), y + o.x(46), '#E4E6EA', 0.2 + f.a.length / 18, 18);
  });
  def('DİĞER', 'x_end', 'Kapanış Kartı', 4, [['a', 'İsim', 'Prof. Dr. Ahmet Akgül'], ['b', 'Alt', 'Randevu: link bio\'da']], (o, f, A) => {
    const { ctx } = o, k = o.e(0, 0.6); ctx.fillStyle = `rgba(10,11,15,${0.75 * k})`; ctx.fillRect(0, 0, o.W, o.H); const kb = o.b(0.2, 0.5);
    ctx.save(); ctx.translate(o.x(540), o.y(860)); ctx.scale(kb, kb); ctx.fillStyle = A; ctx.beginPath(); ctx.arc(0, 0, o.x(90), 0, 7); ctx.fill(); o.font(900, 80); o.text(f.a.replace(/^(Prof\.|Dr\.|Doç\.)\s*/g, '').replace(/^(Dr\.)\s*/, '').trim()[0] || 'A', 0, o.x(28), '#fff', 'center'); ctx.restore();
    o.fit(f.a, 800, 60, 'PP', 880); o.rise(f.a, o.x(540), o.y(1040), 60, '#fff', 0.4, 0.5, 'center'); o.font(600, 36, 'IT'); o.rise(f.b, o.x(540), o.y(1100), 36, A, 0.6, 0.5, 'center');
  });
  def('DİĞER', 'x_counter', 'Geri Sayım', 3.2, [['n', 'Başlangıç', '3']], (o, f, A) => {
    const { ctx } = o, n = parseInt(f.n) || 3, step = (o.dur - 0.2) / n, i = Math.min(n - 1, Math.floor(o.t / step)), lt = o.t - i * step, kb = Eb(lt / 0.3);
    ctx.save(); ctx.translate(o.x(540), o.y(1000)); ctx.scale(kb, kb); ctx.globalAlpha *= 1 - cl((lt - step + 0.15) / 0.15); o.font(900, 360, 'AN'); o.shadow(30); o.text(String(n - i), 0, o.x(120), A, 'center'); ctx.restore();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = o.x(10); ctx.beginPath(); ctx.arc(o.x(540), o.y(960), o.x(230), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (lt / step)); ctx.stroke();
  });
  def('DİĞER', 'x_kicker', 'Konu Başlığı (üst)', 3, [['a', 'Konu', 'VARİS TEDAVİSİ']], (o, f, A) => {
    const { ctx } = o, y = o.y(300), k = o.e(0, 0.5); ctx.fillStyle = A; ctx.beginPath(); ctx.arc(o.x(L + 10), y - o.x(12), o.x(10) * o.b(0, 0.4), 0, 7); ctx.fill(); o.font(800, 34); o.shadow(10);
    ctx.save(); o.clipRect(o.x(L + 30), y - o.x(50), o.x(900) * k, o.x(70)); o.text(f.a.split('').join(String.fromCharCode(8202)), o.x(L + 34), y, '#fff'); ctx.restore();
  });
  def('DİĞER', 'x_two_line', 'Soru → Cevap', 4.5, [['a', 'Soru', 'Lazer iz bırakır mı?'], ['b', 'Cevap', 'HAYIR']], (o, f, A) => {
    const { ctx } = o; o.shadow(16); o.fit(f.a, 700, 60, 'PP', 900); o.words(f.a, o.x(540), o.y(880), '#fff', 0.05, 0.1, 'center'); const kb = o.b(1.1, 0.5); ctx.save(); ctx.translate(o.x(540), o.y(1040)); ctx.scale(kb, kb); o.fit(f.b, 900, 150, 'AN', 900); o.text(f.b, 0, 0, A, 'center'); ctx.restore();
  });
  def('DİĞER', 'x_progress', 'Video İlerleme Çubuğu', 6, [['a', 'Bölüm', 'Bölüm 1']], (o, f, A) => {
    const { ctx } = o, k = cl(o.t / o.dur); o.fillRR(o.x(L), o.y(250), o.x(R + 140 - L), o.x(10), o.x(5), 'rgba(255,255,255,.3)'); o.fillRR(o.x(L), o.y(250), o.x(R + 140 - L) * k, o.x(10), o.x(5), A); o.font(700, 26, 'IT'); o.shadow(8); o.text(f.a, o.x(L), o.y(236), '#fff');
  });

  /* ===== TREND 2026 (yeni fontlar: Unbounded, Syne, Archivo Black, Bricolage, Instrument Serif, DM Serif, Space Grotesk) ===== */
  const TR = 'TREND 2026';
  def(TR, 'tr_editorial', 'Editoryal Serif', 4, [['a', 'Üst', 'Bunu bilmeden'], ['b', 'Vurgu (italik)', 'ameliyat olmayın']], (o, f, A) => {
    const { ctx } = o, y = o.y(1250);
    o.shadow(18, 'rgba(0,0,0,.5)'); o.font(800, 64, 'BG'); o.rise(f.a, o.x(CX), y, 64, '#fff', 0, 0.5, 'center');
    o.fit(f.b, 400, 108, 'IS', 800); ctx.font = 'italic ' + ctx.font; o.rise(f.b, o.x(CX), y + o.x(118), 108, A, 0.18, 0.55, 'center');
  });
  def(TR, 'tr_pillstack', 'Hap Yığını', 4, [['a', 'Satır 1', 'Varis'], ['b', 'Satır 2', 'lazerle'], ['c', 'Satır 3', '20 dakikada']], (o, f, A) => {
    const { ctx } = o, rows = [f.a, f.b, f.c].filter(Boolean), cols = ['#fff', A, '#111'], tc = ['#111', '#fff', '#fff'];
    rows.forEach((r, i) => { const k = o.b(i * 0.14, 0.5); o.font(800, 70, 'UB'); const w = o.tw(r) + o.x(70), y = o.y(1080) + i * o.x(112);
      ctx.save(); ctx.translate(o.x(CX), y); ctx.rotate((i % 2 ? 2.5 : -2.5) * Math.PI / 180 * k); ctx.scale(k, k); o.shadow(22); o.fillRR(-w / 2, -o.x(50), w, o.x(100), o.x(50), cols[i % 3]); o.noShadow(); o.text(r, 0, o.x(26), tc[i % 3], 'center'); ctx.restore(); });
  });
  def(TR, 'tr_highlight', 'Fosforlu Kalem', 4, [['a', 'Metin', 'Asıl sorun'], ['b', 'Fosforlu', 'damarın kendisi']], (o, f, A) => {
    const { ctx } = o, y = o.y(1300); o.font(800, 74, 'BG'); const w = o.tw(f.b);
    o.shadow(14); o.font(700, 60, 'BG'); o.rise(f.a, o.x(CX), y - o.x(96), 60, '#fff', 0, 0.45, 'center'); o.noShadow();
    const k = o.e(0.35, 0.5); ctx.save(); ctx.globalAlpha *= 0.92; ctx.fillStyle = A === '#FF2E43' ? '#FFE14D' : A; ctx.beginPath();
    const x0 = o.x(CX) - w / 2 - o.x(18), hh = o.x(78); ctx.moveTo(x0, y - hh * 0.7); ctx.lineTo(x0 + (w + o.x(36)) * k, y - hh * 0.78); ctx.lineTo(x0 + (w + o.x(36)) * k, y + hh * 0.22); ctx.lineTo(x0, y + hh * 0.3); ctx.fill(); ctx.restore();
    o.font(800, 74, 'BG'); o.rise(f.b, o.x(CX), y, 74, '#111', 0.15, 0.45, 'center');
  });
  def(TR, 'tr_sticker', 'Etiket (Sticker)', 3.5, [['a', 'Etiket', 'DOKTOR ANLATIYOR']], (o, f, A) => {
    const { ctx } = o, k = o.b(0, 0.55); o.font(400, 58, 'AB'); const w = o.tw(f.a) + o.x(80);
    ctx.save(); ctx.translate(o.x(CX), o.y(420)); ctx.rotate(-4 * Math.PI / 180); ctx.scale(k, k); o.shadow(26, 'rgba(0,0,0,.45)', 10);
    o.fillRR(-w / 2 - o.x(10), -o.x(62), w + o.x(20), o.x(124), o.x(22), '#fff'); o.noShadow(); o.fillRR(-w / 2, -o.x(52), w, o.x(104), o.x(16), A);
    o.text(f.a, 0, o.x(22), '#fff', 'center'); ctx.restore();
  });
  def(TR, 'tr_bignum', 'Dev Sayı (Unbounded)', 4, [['a', 'Sayı', '%92'], ['b', 'Açıklama', 'hastada tek seansta sonuç']], (o, f, A) => {
    const { ctx } = o, k = cl(o.t / 1.1); o.shadow(24); o.fit(o.count(f.a, 1), 800, 240, 'UB', 760);
    o.text(o.count(f.a, k), o.x(CX), o.y(1120), A, 'center'); o.font(600, 46, 'SG'); o.noShadow(); o.shadow(12);
    wrap(o, f.b, o.x(CX), o.y(1150), 46, 700, '#fff', 0.5, 'center', false, 'SG');
  });
  def(TR, 'tr_outline', 'Dolu + Kontur', 4, [['a', 'Kelime', 'ÖNCE'], ['b', 'Kelime 2', 'SONRA']], (o, f, A) => {
    const { ctx } = o; const lg = o.tw ? (o.font(800, 150, 'SY'), o.tw(f.a) > o.tw(f.b) ? f.a : f.b) : f.a; const fz = o.fit(lg, 800, 150, 'SY', 740); const y1 = o.y(1060), y2 = y1 + o.x(fz * 1.07);
    [[f.a, y1, 0], [f.b, y2, 0.2]].forEach(([s2, y, st], i) => { for (let r = 3; r >= 0; r--) { const k = o.e(st + r * 0.06, 0.45); ctx.save(); ctx.globalAlpha *= k * (r ? 0.35 : 1); ctx.textAlign = 'center';
      if (r === 0) { ctx.fillStyle = i ? A : '#fff'; o.shadow(16); ctx.fillText(s2, o.x(CX), y); } else { ctx.strokeStyle = i ? A : '#fff'; ctx.lineWidth = o.x(3); ctx.strokeText(s2, o.x(CX), y + r * o.x(i ? 22 : -22) * (1 - k * 0.2)); } ctx.restore(); } });
  });
  def(TR, 'tr_glasschip', 'Cam Bilgi Çipi', 4, [['a', 'Başlık', 'Ameliyatsız'], ['b', 'Alt', 'Aynı gün işe dönüş']], (o, f, A) => {
    const { ctx } = o, k = o.e(0, 0.55), y = o.y(1340); o.font(700, 48, 'SG'); const w = Math.max(o.tw(f.a), (o.font(500, 32, 'SG'), o.tw(f.b))) + o.x(150);
    ctx.save(); ctx.globalAlpha *= k; ctx.translate(o.x(CX) - w / 2, y + (1 - k) * o.x(50));
    const g = ctx.createLinearGradient(0, 0, w, o.x(150)); g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(255,255,255,.08)'); o.rr(0, 0, w, o.x(150), o.x(75)); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = o.x(2); ctx.stroke();
    ctx.fillStyle = A; ctx.beginPath(); ctx.arc(o.x(75), o.x(75), o.x(42) * o.b(0.2, 0.5), 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = o.x(7); ctx.lineCap = 'round'; const kc = o.e(0.45, 0.35); ctx.beginPath(); ctx.moveTo(o.x(56), o.x(76)); ctx.lineTo(o.x(56) + o.x(14) * Math.min(1, kc * 2), o.x(76) + o.x(14) * Math.min(1, kc * 2)); if (kc > 0.5) ctx.lineTo(o.x(70) + o.x(26) * (kc - 0.5) * 2, o.x(90) - o.x(30) * (kc - 0.5) * 2); ctx.stroke();
    o.font(700, 48, 'SG'); o.text(f.a, o.x(140), o.x(68), '#fff'); o.font(500, 32, 'SG'); o.text(f.b, o.x(140), o.x(112), 'rgba(255,255,255,.85)'); ctx.restore();
  });
  def(TR, 'tr_kinetic', 'Kinetik Kelime', 3, [['a', 'Cümle', 'Bu yöntemle iz kalmaz']], (o, f, A) => {
    const { ctx } = o, ws = f.a.split(' '), n = ws.length, slot = Math.max(0.28, (o.dur - 0.6) / n), i = Math.min(n - 1, Math.floor(o.t / slot)), lt = o.t - i * slot, k = Eb(lt / 0.3);
    o.fit(ws[i].toUpperCase(), 800, 190, 'UB', 760); ctx.save(); ctx.translate(o.x(CX), o.y(1000)); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); o.shadow(26); o.text(ws[i].toUpperCase(), 0, 0, i % 2 ? A : '#fff', 'center'); ctx.restore();
    ws.forEach((w, j) => { ctx.fillStyle = j <= i ? A : 'rgba(255,255,255,.35)'; o.fillRR(o.x(CX) - n * o.x(18) + j * o.x(36), o.y(1080), o.x(24), o.x(8), o.x(4), j <= i ? A : 'rgba(255,255,255,.35)'); });
  });
  def(TR, 'tr_notes', 'Notlar Uygulaması', 4.5, [['a', 'Başlık', 'Ameliyat sonrası'], ['b', 'Madde 1', 'Çorap 2 hafta'], ['c', 'Madde 2', 'Günde 30 dk yürüyüş'], ['d', 'Madde 3', 'Sıcak banyo yok']], (o, f, A) => {
    const { ctx } = o, k = o.e(0, 0.5), x = o.x(110), y = o.y(980), w = o.x(740), items = [f.b, f.c, f.d].filter(Boolean), hh = o.x(170 + items.length * 78);
    ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * o.x(60)); o.shadow(30, 'rgba(0,0,0,.4)', 12); o.fillRR(x, y, w, hh, o.x(36), '#FFFDF5'); o.noShadow();
    ctx.fillStyle = '#F6C343'; o.font(700, 26, 'SG'); o.text('‹ Notlar', x + o.x(36), y + o.x(56), '#E2A50E'); o.font(800, 46, 'BG'); o.text(f.a, x + o.x(36), y + o.x(118), '#111');
    items.forEach((it, i) => { const ki = o.e(0.35 + i * 0.25, 0.4), yy = y + o.x(190 + i * 78); ctx.save(); ctx.globalAlpha *= ki; ctx.strokeStyle = '#E2A50E'; ctx.lineWidth = o.x(4); ctx.beginPath(); ctx.arc(x + o.x(56), yy - o.x(12), o.x(15), 0, 7); ctx.stroke();
      if (ki > 0.6) { ctx.fillStyle = '#E2A50E'; ctx.beginPath(); ctx.arc(x + o.x(56), yy - o.x(12), o.x(9) * (ki - 0.6) / 0.4, 0, 7); ctx.fill(); }
      o.font(600, 36, 'SG'); o.text(it, x + o.x(92) + (1 - ki) * o.x(20), yy, '#222'); ctx.restore(); });
    ctx.restore();
  });
  def(TR, 'tr_quote', 'Büyük Alıntı', 5, [['a', 'Alıntı', 'Varis bir estetik sorun değil, dolaşım sorunudur.'], ['b', 'Kişi', 'Prof. Dr. Ahmet Akgül']], (o, f, A) => {
    const { ctx } = o; ctx.save(); ctx.globalAlpha *= o.e(0, 0.5) * 0.9; o.font(400, 300, 'DS'); o.text('“', o.x(L), o.y(1000), A); ctx.restore();
    wrap(o, f.a, o.x(L + 10), o.y(980), 62, 760, '#fff', 0.15, 'left', false, 'DS');
    const k = o.e(0.9, 0.5); ctx.fillStyle = A; ctx.fillRect(o.x(L + 10), o.y(1420), o.x(60) * k, o.x(5)); ctx.globalAlpha *= k; o.font(600, 32, 'SG'); o.shadow(10); o.text(f.b, o.x(L + 90), o.y(1432), '#fff');
  });
  def(TR, 'tr_meshtitle', 'Gradyan Kart', 4, [['a', 'Başlık', 'VARİS TEDAVİSİ'], ['b', 'Alt', '3 seçenek, 1 doğru karar']], (o, f, A) => {
    const { ctx } = o, k = o.e(0, 0.6), y = o.y(1180), w = o.x(780), x = o.x(CX) - w / 2, hh = o.x(260);
    ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * o.x(40)); o.rr(x, y, w, hh, o.x(40)); ctx.clip();
    const g = ctx.createLinearGradient(x, y, x + w, y + hh); g.addColorStop(0, A); g.addColorStop(1, '#5B2EFF'); ctx.fillStyle = g; ctx.fillRect(x, y, w, hh);
    const tt = o.t * 0.8; for (let i = 0; i < 3; i++) { const rg = ctx.createRadialGradient(x + w * (0.3 + 0.4 * Math.sin(tt + i * 2)), y + hh * (0.5 + 0.4 * Math.cos(tt * 1.3 + i)), 0, x + w * 0.5, y + hh * 0.5, w * 0.6); rg.addColorStop(0, i === 1 ? 'rgba(255,214,90,.55)' : 'rgba(255,255,255,.25)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = rg; ctx.fillRect(x, y, w, hh); }
    o.fit(f.a, 800, 76, 'UB', 700); o.text(f.a, o.x(CX), y + o.x(130), '#fff', 'center'); o.font(500, 36, 'SG'); o.text(f.b, o.x(CX), y + o.x(196), 'rgba(255,255,255,.92)', 'center'); ctx.restore();
  });
  def(TR, 'tr_underline', 'Çizim Altı Çizgi', 4, [['a', 'Metin', 'Kesinlikle'], ['b', 'Vurgu', 'yapmayın']], (o, f, A) => {
    const { ctx } = o, y = o.y(1260); o.shadow(16); o.font(800, 70, 'BG'); o.rise(f.a, o.x(CX), y - o.x(90), 70, '#fff', 0, 0.45, 'center');
    o.font(800, 104, 'SY'); o.rise(f.b.toUpperCase(), o.x(CX), y + o.x(40), 104, '#fff', 0.15, 0.45, 'center'); const w = o.tw(f.b.toUpperCase());
    const k = o.e(0.5, 0.5); o.noShadow(); ctx.strokeStyle = A; ctx.lineWidth = o.x(12); ctx.lineCap = 'round'; ctx.beginPath(); const x0 = o.x(CX) - w / 2;
    for (let i = 0; i <= 40 * k; i++) { const u = i / 40, xx = x0 + w * u, yy = y + o.x(70) + Math.sin(u * 9) * o.x(7); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke();
  });
  def(TR, 'tr_tag2', 'Köşe Rozeti', 3.5, [['a', 'Rozet', 'YENİ'], ['b', 'Metin', 'Köpük tedavisi']], (o, f, A) => {
    const { ctx } = o, k = o.b(0, 0.5), x = o.x(L + 20), y = o.y(330);
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k); o.font(400, 34, 'AB'); const w1 = o.tw(f.a) + o.x(40); o.font(700, 38, 'SG'); const w2 = o.tw(f.b) + o.x(44);
    o.shadow(20); o.fillRR(0, 0, w1 + w2, o.x(70), o.x(35), 'rgba(15,16,22,.88)'); o.noShadow(); o.fillRR(o.x(6), o.x(6), w1, o.x(58), o.x(29), A);
    o.font(400, 34, 'AB'); o.text(f.a, o.x(26), o.x(48), '#fff'); o.font(700, 38, 'SG'); o.text(f.b, w1 + o.x(24), o.x(49), '#fff'); ctx.restore();
  });
  def(TR, 'tr_split', 'İkiye Bölünmüş Başlık', 4, [['a', 'Sol', 'MİT'], ['b', 'Sağ', 'GERÇEK']], (o, f, A) => {
    const { ctx } = o, y = o.y(1000), k = o.e(0, 0.5), k2 = o.e(0.25, 0.5);
    const fz = Math.min(o.fit(f.a, 800, 120, 'UB', 380), o.fit(f.b, 800, 120, 'UB', 440)); o.font(800, fz, 'UB'); ctx.save(); o.shadow(20); ctx.globalAlpha *= k; o.text(f.a, o.x(CX) - o.x(20) - (1 - k) * o.x(120), y, 'rgba(255,255,255,.55)', 'right'); ctx.restore();
    ctx.save(); ctx.globalAlpha *= k2; ctx.fillStyle = A; ctx.save(); ctx.translate(o.x(CX), y - o.x(45)); ctx.rotate(Math.PI / 4 * k2); ctx.fillRect(-o.x(14), -o.x(14), o.x(28), o.x(28)); ctx.restore(); ctx.restore();
    o.font(800, fz, 'UB'); ctx.save(); o.shadow(20); ctx.globalAlpha *= k2; o.text(f.b, o.x(CX) + o.x(40) + (1 - k2) * o.x(120), y + o.x(150), A, 'left'); ctx.restore();
  });
  def(TR, 'tr_chapter', 'Bölüm Kartı', 3.5, [['a', 'No', '02'], ['b', 'Bölüm', 'Tedavi seçenekleri']], (o, f, A) => {
    const { ctx } = o, k = o.e(0, 0.6); ctx.save(); ctx.globalAlpha *= 0.55 * k; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, o.W, o.H); ctx.restore();
    o.font(400, 260, 'DS'); ctx.save(); ctx.globalAlpha *= k; o.text(f.a, o.x(CX), o.y(960), A, 'center'); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.fillRect(o.x(CX) - o.x(110) * k, o.y(1020), o.x(220) * k, o.x(3));
    o.font(700, 60, 'BG'); o.rise(f.b, o.x(CX), o.y(1110), 60, '#fff', 0.3, 0.5, 'center');
  });
  def(TR, 'tr_y2k', 'Krom Y2K', 3.5, [['a', 'Metin', 'WOW']], (o, f, A) => {
    const { ctx } = o, k = o.b(0, 0.6); o.fit(f.a, 800, 220, 'UB', 760); ctx.save(); ctx.translate(o.x(CX), o.y(1000)); ctx.scale(k, k); ctx.rotate(-3 * Math.PI / 180);
    const g = ctx.createLinearGradient(0, -o.x(200), 0, o.x(30)); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#9aa7b8'); g.addColorStop(0.5, '#2b3240'); g.addColorStop(0.62, '#dfe7f2'); g.addColorStop(1, '#7c8797');
    o.shadow(30, A, 0); ctx.lineWidth = o.x(10); ctx.strokeStyle = '#0b0d12'; ctx.textAlign = 'center'; ctx.strokeText(f.a, 0, 0); ctx.fillStyle = g; ctx.fillText(f.a, 0, 0);
    const sp = (o.t * 1.6) % 2; ctx.fillStyle = '#fff'; ctx.globalAlpha *= Math.max(0, 1 - Math.abs(sp - 0.6) * 3); ctx.beginPath(); const sx = o.x(240), sy = -o.x(170); ctx.moveTo(sx, sy - o.x(40)); ctx.lineTo(sx + o.x(8), sy - o.x(8)); ctx.lineTo(sx + o.x(40), sy); ctx.lineTo(sx + o.x(8), sy + o.x(8)); ctx.lineTo(sx, sy + o.x(40)); ctx.lineTo(sx - o.x(8), sy + o.x(8)); ctx.lineTo(sx - o.x(40), sy); ctx.lineTo(sx - o.x(8), sy - o.x(8)); ctx.fill(); ctx.restore();
  });

  /* helpers that need TPL scope */
  function wrap(o, str, x, y, size, maxW, c, st, align, noShadow, fam, it) {
    const { ctx } = o; o.font(fam === 'PF' ? 700 : fam === 'DS' || fam === 'IS' || fam === 'AB' ? 400 : fam === 'SG' ? 700 : 800, size, fam || 'PP', it); const ws = String(str).split(' '), lines = []; let cur = '';
    ws.forEach(w => { const tst = cur ? cur + ' ' + w : w; if (o.tw(tst) > o.x(maxW) && cur) { lines.push(cur); cur = w; } else cur = tst; }); if (cur) lines.push(cur);
    lines.forEach((ln, i) => { ctx.save(); const k = Eo((o.t - (st || 0) - i * 0.12) / 0.45); ctx.globalAlpha *= k; if (!noShadow) o.shadow(14); o.text(ln, x, y + o.x(size * 1.2) * (i + 1) + (1 - k) * o.x(24), c, align || 'center'); ctx.restore(); });
  }
  function cursor(o, x, y, k) { const { ctx } = o; ctx.save(); ctx.translate(x + (1 - Eo(k)) * o.x(120), y + (1 - Eo(k)) * o.x(120)); o.shadow(10); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = o.x(3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, o.x(60)); ctx.lineTo(o.x(16), o.x(46)); ctx.lineTo(o.x(28), o.x(72)); ctx.lineTo(o.x(38), o.x(66)); ctx.lineTo(o.x(26), o.x(42)); ctx.lineTo(o.x(46), o.x(42)); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
  function stepsCard(o, f, AC) {
    const { ctx, t, dur } = o; AC = AC === '#FF2E43' ? '#FFB21E' : AC;
    const steps = [f.s1, f.s2, f.s3].filter(Boolean).map(s2 => { const p = s2.split('|').map(x => x.trim()); return { big: p[0] || '', unit: p[1] || '', sub: p[2] || '' }; });
    const n = steps.length; if (!n) return;
    const CT = o.y(1150), CB = o.y(1524), CL2 = o.x(70), CR2 = o.x(887), Lx = CL2 + o.x(36), Rx = CR2 - o.x(36), Wd = Rx - Lx;
    const slot = dur / n, idx = Math.min(n - 1, Math.floor(t / slot)), lf = t - idx * slot, kc = Eo(t / 0.36);
    ctx.save(); ctx.globalAlpha *= kc; ctx.translate(0, (1 - kc) * o.x(40)); o.fillRR(CL2, CT, CR2 - CL2, CB - CT, o.x(30), 'rgba(11,13,19,.94)');
    ctx.fillStyle = AC; ctx.beginPath(); ctx.arc(Lx + o.x(7), CT + o.x(44), o.x(7), 0, 7); ctx.fill(); o.font(700, 28); o.text(f.title.split('').join(String.fromCharCode(8202)), Lx + o.x(26), CT + o.x(54), '#fff');
    o.font(700, 28, 'IT'); o.text(`${String(idx + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, Rx, CT + o.x(54), '#AEB4BF', 'right');
    const st = steps[idx], kIn = Eo(lf / 0.44), LY = o.y(1428), ST = o.y(1214);
    ctx.save(); o.clipRect(Lx - o.x(10), ST, Wd + o.x(20), LY - ST - o.x(22)); const fs = Math.min(172, o.fit(st.big, 900, 172, 'PP', (Wd / o.s) - (st.unit ? 240 : 0))); o.font(900, fs);
    const by = ST + o.x(fs * 0.92) + (1 - kIn) * o.x(fs * 1.05); o.text(st.big, Lx, by, '#fff'); const bw = o.tw(st.big);
    if (st.unit) { const ku = Eo((lf - 0.24) / 0.4), us = st.big.length <= 2 ? 88 : 64; ctx.fillStyle = AC; ctx.fillRect(Lx + bw + o.x(24), by - o.x(fs * 0.13 + us + 16), o.x(70) * ku, o.x(7)); o.font(800, us); ctx.globalAlpha *= ku; o.text(st.unit, Lx + bw + o.x(24), by - o.x(fs * 0.13), AC); }
    ctx.restore();
    const stopX = i => Lx + o.x(12) + i * ((Wd - o.x(24)) / (n - 1 || 1)), mv = Eo(lf / 0.48), dotX = idx === 0 ? Lx + (stopX(0) - Lx) * Eo(t / 0.56) : stopX(idx - 1) + (stopX(idx) - stopX(idx - 1)) * mv;
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(Lx, LY, Wd, o.x(4)); ctx.fillStyle = AC; ctx.fillRect(Lx, LY, Math.max(0, dotX - Lx), o.x(4));
    steps.forEach((s2, i) => { const x = stopX(i), reached = i < idx || (i === idx && mv > 0.95) || (i === 0 && t > 0.56), cur = i === idx; ctx.beginPath(); ctx.arc(x, LY + o.x(2), o.x(10), 0, 7); ctx.fillStyle = reached ? AC : '#0b0d13'; ctx.fill(); ctx.lineWidth = o.x(4); ctx.strokeStyle = reached ? AC : 'rgba(255,255,255,.75)'; ctx.stroke();
      o.font(cur ? 800 : 600, cur ? 40 : 36); o.text(s2.sub, i === 0 ? Lx : i === n - 1 ? Rx : x, LY + o.x(66), cur ? '#fff' : '#C9CED6', i === 0 ? 'left' : i === n - 1 ? 'right' : 'center'); });
    ctx.beginPath(); ctx.arc(dotX, LY + o.x(2), o.x(15), 0, 7); ctx.fillStyle = '#fff'; ctx.shadowColor = AC; ctx.shadowBlur = o.x(22); ctx.fill(); o.noShadow(); ctx.restore();
  }

  G.KTpl = {
    LIST: TPL,
    draw(ctx, W, H, t, tp, fields, acc, dur) {
      ctx.clearRect(0, 0, W, H); const D = dur || tp.dur; const o = mk(ctx, W, H, Math.min(t, D), D);
      ctx.save(); ctx.globalAlpha = o.out(); ctx.textBaseline = 'alphabetic';
      try { tp.draw(o, fields, acc || '#FF2E43'); } finally { ctx.restore(); }
    },
    defaults(tp) { const f = {}; tp.fields.forEach(([k, , d]) => f[k] = d); return f; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
