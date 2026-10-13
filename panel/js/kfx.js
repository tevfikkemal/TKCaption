/**
 * KURGU FX araclari — TK Caption panelinde.
 *
 * Cizim, sablon, gecis ve ses modulleri ile Premiere koprusu KURGU FX'ten
 * (com.vedat.kurgufx v1.3, yapimcisi Vedat'in onayiyla) degistirilmeden
 * alindi: panel/kurgu/. Bu dosya onlari TK Caption'in sayfa duzenine
 * baglar. Asagida "KURGU FX'ten" diye isaretli veri ve fonksiyonlar (Lumetri
 * hazir ayarlari, renk onizleme, dalga cizimi, simgeler) KURGU FX'in panel
 * dosyasindan alindi.
 *
 * Premiere komutlari KURGU FX'in kendi koprusunden: KFX.run(ad, arguman).
 * Bizim koprumuzle (tr*) ad cakismasi yok; ikisi yan yana yuklu.
 */
(function () {
  'use strict';

  const nreq = typeof window.require === 'function' ? window.require : null;
  const fs = nreq && nreq('fs'), path = nreq && nreq('path'), os = nreq && nreq('os');
  const $ = (id) => document.getElementById(id);

  function kokDizin() {
    const ext = window.CEP && CEP.extensionPath ? CEP.extensionPath() : null;
    return ext && path ? path.join(ext, 'kurgu') : null;
  }
  const ADJ = () => path.join(kokDizin(), 'KFX_Adjust.prproj');

  /* ---------------------------------------------------------------- */
  /*  KURGU FX koprusu                                                 */
  /* ---------------------------------------------------------------- */

  let hostSoz = null;
  function hostYukle() {
    if (!hostSoz) {
      const yol = path.join(kokDizin(), 'host.jsx');
      hostSoz = CEP.evalScript('$.evalFile(' + JSON.stringify(yol) + ')')
        .catch((e) => { hostSoz = null; throw e; });
    }
    return hostSoz;
  }
  /** Panel yeniden yuklenince kopru de yeniden okunmali */
  function hostSifirla() { hostSoz = null; }

  function kfx(fn, arg) {
    if (!window.CEP || !CEP.available || !CEP.available()) {
      return Promise.reject(new Error('Premiere içinde çalıştırın.'));
    }
    return hostYukle().then(() =>
      CEP.evalScript('KFX.run(' + JSON.stringify(fn) + ', ' + JSON.stringify(arg || {}) + ')')
    ).then((r) => {
      let o;
      try { o = JSON.parse(r); } catch (e) { throw new Error('Premiere yanıtı okunamadı: ' + String(r).slice(0, 160)); }
      if (!o.ok) throw new Error(o.error);
      return o.data;
    });
  }

  async function sekans() {
    const i = await kfx('info');
    if (!i.seq) throw new Error('Önce bir sekans açın.');
    return i;
  }

  /* ---------------------------------------------------------------- */
  /*  DOM yardimcilari (TK Caption siniflariyla)                       */
  /* ---------------------------------------------------------------- */

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (v !== false && v !== undefined && v !== null) el.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  }
  const kart = (etiket, ...kids) => h('div', { class: 'card' }, etiket ? h('div', { class: 'clbl' }, etiket) : null, ...kids);
  const satir = (etiket, el) => h('div', { class: 'frow' }, h('span', { class: 'flbl' }, etiket), el);
  const not = (metin) => h('p', { class: 'hint' }, metin);

  function kaydirici(etiket, obj, key, min, max, step, fmt, onCh) {
    const val = h('b', { class: 'val' }, fmt ? fmt(obj[key]) : obj[key]);
    const inp = h('input', { type: 'range', min, max, step, value: obj[key] });
    const boya = () => {
      const p = (parseFloat(inp.value) - min) / (max - min) * 100;
      inp.style.setProperty('--p', p.toFixed(1) + '%');
    };
    inp.addEventListener('input', () => {
      obj[key] = parseFloat(inp.value);
      val.textContent = fmt ? fmt(obj[key]) : obj[key];
      boya();
      if (onCh) onCh(obj[key]);
    });
    boya();
    const r = h('div', { class: 'frow' }, h('span', { class: 'flbl' }, etiket), inp, val);
    r.ayarla = (v) => { obj[key] = v; inp.value = v; val.textContent = fmt ? fmt(v) : v; boya(); };
    return r;
  }

  function secim(obj, key, ops, onCh, sinif) {
    const el = h('div', { class: 'seg' + (sinif ? ' ' + sinif : '') });
    ops.forEach(([v, l]) => {
      const b = h('button', { type: 'button', class: obj[key] === v ? 'mini on' : 'mini' }, l);
      b.onclick = () => {
        obj[key] = v;
        el.querySelectorAll('.mini').forEach((x) => { x.className = 'mini'; });
        b.className = 'mini on';
        if (onCh) onCh(v);
      };
      el.append(b);
    });
    return el;
  }

  function liste(obj, key, ops, onCh) {
    const s = h('select');
    ops.forEach(([v, l]) => {
      const o = h('option', { value: v }, l);
      if (String(obj[key]) === String(v)) o.selected = true;
      s.append(o);
    });
    s.onchange = () => {
      const v = s.value;
      obj[key] = v === '' || isNaN(v) ? v : parseFloat(v);
      if (onCh) onCh(obj[key]);
    };
    return s;
  }

  function cip(obj, key, etiket, onCh) {
    const i = h('input', { type: 'checkbox' });
    i.checked = !!obj[key];
    const lab = h('label', { class: obj[key] ? 'chip on' : 'chip' }, i, h('span', null, etiket));
    i.onchange = () => { obj[key] = i.checked; lab.className = i.checked ? 'chip on' : 'chip'; if (onCh) onCh(i.checked); };
    return lab;
  }

  /** Islem gunlugu ve ilerleme */
  function gunluk() {
    const out = h('div', { class: 'out', hidden: true });
    const bar = h('div', { class: 'bar', hidden: true }, h('div', { class: 'fill' }));
    return {
      out, bar,
      yaz(html, cls) {
        out.hidden = false;
        out.innerHTML += (cls ? '<span class="' + cls + '">' : '') + html + (cls ? '</span>' : '') + '\n';
        out.scrollTop = out.scrollHeight;
      },
      temizle() { out.innerHTML = ''; out.hidden = true; },
      ilerle(v) { bar.hidden = false; bar.firstChild.style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + '%'; },
      bitti() { setTimeout(() => { bar.hidden = true; }, 700); }
    };
  }
  const kac = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  async function calistir(btn, g, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); }
    catch (e) { g.yaz(kac(e && e.message || e), 'err'); }
    finally { if (btn) btn.disabled = false; }
  }

  const fmtSn = (v) => (+v).toFixed(2) + ' sn';
  const fmtP = (v) => Math.round(v * 100) + '%';

  /* ---------------------------------------------------------------- */
  /*  Ortak: kare kare cizip timeline'a koy                            */
  /* ---------------------------------------------------------------- */

  /** Kareler proje klasorunun yanina yazilir; gecici klasor temizlenirse klip cevrimdisi kalirdi */
  function cizimKoku(proje) {
    if (proje) {
      const d = path.join(path.dirname(proje), 'TK Caption', 'Yazi');
      try { fs.mkdirSync(d, { recursive: true }); return d; } catch (e) {}
    }
    const base = process.platform === 'win32'
      ? path.join(process.env.APPDATA || os.homedir(), 'TKCaption')
      : path.join(os.homedir(), 'Library', 'Application Support', 'TKCaption');
    const d = path.join(base, 'renders');
    fs.mkdirSync(d, { recursive: true });
    return d;
  }

  async function cizVeKoy(ad, sure, ciz, g) {
    const i = await sekans();
    const W = i.seq.w, H = i.seq.h, fps = Math.round(i.seq.fps * 1000) / 1000;
    const dir = path.join(cizimKoku(i.project),
      new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '_' +
      ad.replace(/[^\wçğıöşüÇĞİÖŞÜ]+/g, '_').slice(0, 24));
    await window.KText.ensureFonts();
    g.yaz('<span class="dim">' + W + '×' + H + ', ' + Math.round(sure * fps) + ' kare çiziliyor…</span>');
    const r = await window.KText.renderSeq({
      W, H, fps, dur: sure, dir, prefix: 'tk', draw: ciz,
      onProg: (p) => g.ilerle(p * 0.9)
    });
    const pl = await kfx('importStills', { first: r.first, fps, dur: sure, name: 'TK ' + ad.slice(0, 30), track: -1, bin: 'TK Caption Yazı' });
    g.ilerle(1);
    g.bitti();
    return pl;
  }

  /* ---------------------------------------------------------------- */
  /*  Onizleme dongusu (yalnizca gorunen sayfa)                        */
  /* ---------------------------------------------------------------- */

  const donguler = [];   // {sayfa, f(zaman)}
  function dongu(zaman) {
    window.requestAnimationFrame(dongu);
    for (const d of donguler) {
      const s = $(d.sayfa);
      if (!s || s.hidden) continue;
      try { d.f(zaman / 1000); } catch (e) { if (!d.hata) { d.hata = true; console.error(e); } }
    }
  }

  function onizlemeKutusu(w, h2) {
    const cv = h('canvas', { width: w, height: h2 });
    const ib = h('i');
    const kap = h('div', { class: 'preview' }, cv, h('div', { class: 'pbar' }, ib));
    return { kap, cv, ib };
  }

  /* ================================================================ */
  /*  YAZI STUDYOSU                                                    */
  /* ================================================================ */

  function yaziSayfasi(kap) {
    const K = window.KText;
    const TS = Object.assign({ text: 'Bu yöntemle *iz kalmaz*', style: 'clean', anim: 'cslide', out: 'fade',
      size: 84, pos: 'mid', y: 50, align: 'center', dur: 3, speed: 1, color: 'auto', accent: '', upper: false },
      kayitOku('kfx.yazi'));
    const sakla = () => kayitYaz('kfx.yazi', TS);
    let lay = null;
    const yeniden = () => { lay = null; sakla(); };
    let bas = 0;
    const basaSar = () => { bas = 0; };

    const pv = onizlemeKutusu(540, 960);
    donguler.push({ sayfa: 'tab-yazi', f: (z) => {
      if (!bas) bas = z;
      const d = TS.dur + 0.6, t = (z - bas) % d;
      const ctx = pv.cv.getContext('2d');
      if (!lay) lay = K.layout(ctx, TS, 540, 960);
      K.drawFrame(ctx, 540, 960, Math.min(t, TS.dur), TS, lay);
      pv.ib.style.width = Math.min(100, t / TS.dur * 100).toFixed(1) + '%';
      animKutulari(z);
    } });

    const ta = h('textarea', { class: 'ta', rows: 3, spellcheck: 'false' });
    ta.value = TS.text;
    ta.oninput = () => { TS.text = ta.value; yeniden(); };

    // Gorunum
    const stilKap = h('div');
    let son = '', grid = null;
    const stilKareleri = [];
    K.STYLES.forEach((st) => {
      if (st.g !== son) { stilKap.append(h('div', { class: 'sgrup' }, st.g)); grid = h('div', { class: 'sgrid' }); stilKap.append(grid); son = st.g; }
      const c = h('canvas', { width: 216, height: 110 });
      const t = h('button', { type: 'button', class: 'stile' + (TS.style === st.id ? ' on' : '') }, c, h('span', null, st.name));
      t.onclick = () => {
        TS.style = st.id;
        stilKap.querySelectorAll('.stile').forEach((x) => x.classList.remove('on'));
        t.classList.add('on');
        yeniden(); basaSar();
      };
      grid.append(t);
      stilKareleri.push([c, st]);
    });
    const stilleriCiz = () => stilKareleri.forEach(([c, st]) => {
      K.drawFrame(c.getContext('2d'), 216, 110, 1, { text: 'Aa', style: st.id, anim: 'none', size: 330, pos: 'mid', dur: 1, align: 'center' });
    });
    K.ensureFonts().then(stilleriCiz);

    // Animasyon: her secenek canli oynayan bir kutu
    const animKap = h('div');
    son = ''; grid = null;
    const animKareleri = [];
    K.ANIMS.forEach((an) => {
      if (an.g !== son) { animKap.append(h('div', { class: 'sgrup' }, an.g)); grid = h('div', { class: 'sgrid' }); animKap.append(grid); son = an.g; }
      const c = h('canvas', { width: 216, height: 96 });
      const t = h('button', { type: 'button', class: 'stile anim' + (TS.anim === an.id ? ' on' : '') }, c, h('span', null, an.name));
      t.onclick = () => {
        TS.anim = an.id;
        animKap.querySelectorAll('.stile').forEach((x) => x.classList.remove('on'));
        t.classList.add('on');
        sakla(); basaSar();
      };
      grid.append(t);
      animKareleri.push([c, an]);
    });
    let animKare = 0;
    function animKutulari(z) {
      if ((animKare++ & 1) === 1) return;   // her iki karede bir: 25 kutu
      const t = z % 2.2;
      animKareleri.forEach(([c, an]) => {
        const cfg = { text: 'Abc', style: TS.style, anim: an.id, out: 'none', size: 290, pos: 'mid', dur: 1.8, align: 'center', speed: TS.speed };
        K.drawFrame(c.getContext('2d'), 216, 96, Math.min(t, 1.8), cfg);
      });
    }

    // Ayarlar
    const yRow = kaydirici('Dikey konum', TS, 'y', 10, 90, 1, (v) => Math.round(v) + '%', yeniden);
    yRow.hidden = TS.pos !== 'custom';
    const ana = h('input', { type: 'color', value: TS.color && TS.color !== 'auto' ? TS.color : '#ffffff' });
    ana.oninput = () => { TS.color = ana.value; sakla(); };
    const vurgu = h('input', { type: 'color', value: TS.accent || '#FFB21E' });
    vurgu.oninput = () => { TS.accent = vurgu.value; sakla(); };

    const g = gunluk();
    const ekle = h('button', { type: 'button', class: 'cta sticky', html: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg><span>Timeline\'a Ekle</span>' });
    ekle.onclick = () => calistir(ekle, g, async () => {
      g.temizle();
      const cfg = JSON.parse(JSON.stringify(TS));
      let L = null;
      const i = await sekans();
      const r = await cizVeKoy(cfg.text.replace(/\*/g, ''), cfg.dur, (ctx, t) => {
        if (!L) L = K.layout(ctx, cfg, i.seq.w, i.seq.h);
        K.drawFrame(ctx, i.seq.w, i.seq.h, t, cfg, L);
      }, g);
      g.yaz('Eklendi — V' + r.track + ', ' + Number(r.t).toFixed(2) + ' sn', 'ok');
    });

    kap.append(
      pv.kap,
      kart('Metin', ta, not('Vurgu rengi için kelimeyi *yıldız* içine alın. Enter ile satır kırın.')),
      kart('Görünüm', stilKap),
      kart('Animasyon', animKap, satir('Çıkış', secim(TS, 'out', K.OUTS.map((x) => [x.id, x.name]), () => { sakla(); basaSar(); }, 'wrap'))),
      kart('Ayarlar',
        kaydirici('Punto', TS, 'size', 30, 220, 1, (v) => Math.round(v) + 'px', yeniden),
        satir('Konum', secim(TS, 'pos', [['top', 'Üst'], ['mid', 'Orta'], ['bottom', 'Alt'], ['custom', 'Özel']], (v) => { yRow.hidden = v !== 'custom'; yeniden(); })),
        yRow,
        satir('Hizalama', secim(TS, 'align', [['left', 'Sol'], ['center', 'Orta'], ['right', 'Sağ']], yeniden)),
        kaydirici('Süre', TS, 'dur', 0.5, 15, 0.1, (v) => (+v).toFixed(1) + ' sn', () => { sakla(); basaSar(); }),
        kaydirici('Animasyon hızı', TS, 'speed', 0.4, 2.5, 0.05, (v) => (+v).toFixed(2) + 'x', () => { sakla(); basaSar(); }),
        satir('Renkler', h('div', { class: 'renkler' },
          h('span', { class: 'hint' }, 'Ana'), ana, h('span', { class: 'hint' }, 'Vurgu'), vurgu,
          h('button', { type: 'button', class: 'btn small', onclick: () => { TS.color = 'auto'; TS.accent = ''; sakla(); } }, 'Stil rengine dön'))),
        h('div', { class: 'chips' }, cip(TS, 'upper', 'BÜYÜK HARF', yeniden))),
      not('Yazı şeffaf PNG dizisi olarak çizilir ve oynatma kafasına, en üstteki boş kanala yerleşir.'),
      ekle, g.bar, g.out);
  }

  /* ================================================================ */
  /*  HAZIR SABLONLAR                                                  */
  /* ================================================================ */

  function sablonSayfasi(kap) {
    const T = window.KTpl;
    const TP = Object.assign({ id: T.LIST[0].id, f: {}, acc: '#FF2E43', dur: null }, kayitOku('kfx.sablon'));
    const sakla = () => kayitYaz('kfx.sablon', TP);
    const tp = () => T.LIST.find((x) => x.id === TP.id) || T.LIST[0];
    const sureOf = () => TP.dur || tp().dur;
    const alanlar = () => { const f = {}; tp().fields.forEach(([k, , d]) => { f[k] = TP.f[TP.id + k] !== undefined ? TP.f[TP.id + k] : d; }); return f; };
    let bas = 0;

    const pv = onizlemeKutusu(540, 960);
    donguler.push({ sayfa: 'tab-hazir', f: (z) => {
      if (!bas) bas = z;
      const D = sureOf(), t = (z - bas) % (D + 0.5);
      T.draw(pv.cv.getContext('2d'), 540, 960, Math.min(t, D), tp(), alanlar(), TP.acc, D);
      pv.ib.style.width = Math.min(100, t / D * 100).toFixed(1) + '%';
    } });

    const form = h('div', { class: 'formlar' });
    const sureObj = { d: sureOf() };
    const sureSatir = kaydirici('Süre', sureObj, 'd', 0.5, 15, 0.1, (v) => (+v).toFixed(1) + ' sn', (v) => { TP.dur = v; sakla(); });
    const kur = () => {
      form.replaceChildren();
      tp().fields.forEach(([k, etiket, d]) => {
        const i = h('input', { type: 'text', class: 'tin' });
        i.value = TP.f[TP.id + k] !== undefined ? TP.f[TP.id + k] : d;
        i.oninput = () => { TP.f[TP.id + k] = i.value; sakla(); };
        form.append(satir(etiket, i));
      });
      sureSatir.ayarla(sureOf());
    };
    const renk = h('input', { type: 'color', value: TP.acc });
    renk.oninput = () => { TP.acc = renk.value; sakla(); };

    const kats = h('div');
    let son = '', grid = null;
    const kareler = [];
    T.LIST.forEach((x) => {
      if (x.cat !== son) { kats.append(h('div', { class: 'sgrup' }, x.cat)); grid = h('div', { class: 'sgrid dikey' }); kats.append(grid); son = x.cat; }
      const c = h('canvas', { width: 108, height: 192 });
      const t = h('button', { type: 'button', class: 'stile dikey' + (TP.id === x.id ? ' on' : '') }, c, h('span', null, x.name));
      t.onclick = () => {
        TP.id = x.id; TP.dur = null; sakla();
        kats.querySelectorAll('.stile').forEach((z) => z.classList.remove('on'));
        t.classList.add('on');
        kur(); bas = 0;
      };
      grid.append(t);
      kareler.push([c, x]);
    });
    window.KText.ensureFonts().then(async () => {
      for (const [c, x] of kareler) {
        try { T.draw(c.getContext('2d'), 108, 192, x.dur * 0.72, x, T.defaults(x), TP.acc); } catch (e) {}
        await new Promise((r) => setTimeout(r, 0));
      }
    });
    kur();

    const g = gunluk();
    const ekle = h('button', { type: 'button', class: 'cta sticky', html: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg><span>Timeline\'a Ekle</span>' });
    ekle.onclick = () => calistir(ekle, g, async () => {
      g.temizle();
      const i = await sekans();
      const T2 = tp(), f = alanlar(), acc = TP.acc, D = sureOf();
      const r = await cizVeKoy(T2.name, D, (ctx, t) => T.draw(ctx, i.seq.w, i.seq.h, t, T2, f, acc, D), g);
      g.yaz(T2.name + ' eklendi — V' + r.track, 'ok');
    });

    kap.append(pv.kap,
      kart('İçerik', form, sureSatir, satir('Vurgu rengi', renk)),
      kart('Şablonlar (' + T.LIST.length + ')', kats),
      ekle, g.bar, g.out);
  }

  /* ================================================================ */
  /*  GECISLER                                                         */
  /* ================================================================ */

  /* Simgeler — KURGU FX'ten */
  const sv = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  const SIMGE = {
    zoom: sv('<circle cx="11" cy="11" r="6.5"/><path d="M20.5 20.5L16 16M11 8v6M8 11h6"/>'),
    punchin: sv('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/><path d="M3 3l5 5M21 3l-5 5M3 21l5-5M21 21l-5-5"/>'),
    punchout: sv('<rect x="8" y="8" width="8" height="8" rx="1"/><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 2"/><path d="M8 8L3 3M16 8l5-5M8 16l-5 5M16 16l5 5"/>'),
    target: sv('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>'),
    bounce: sv('<path d="M3 18c3-12 6-12 9 0s6-12 9 0"/>'),
    shake: sv('<path d="M8 4l-3 8 3 8M16 4l3 8-3 8"/><rect x="9.5" y="7" width="5" height="10" rx="1"/>'),
    whipL: sv('<path d="M20 12H5M10 7l-5 5 5 5"/><path d="M20 8h-4M20 16h-4" opacity=".5"/>'),
    whipR: sv('<path d="M4 12h15M14 7l5 5-5 5"/><path d="M4 8h4M4 16h4" opacity=".5"/>'),
    whipU: sv('<path d="M12 20V5M7 10l5-5 5 5"/>'),
    whipD: sv('<path d="M12 4v15M7 14l5 5 5-5"/>'),
    blur: sv('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5" opacity=".55"/><circle cx="12" cy="12" r="9.5" opacity=".25"/>'),
    flash: sv('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
    glitch: sv('<path d="M3 6h10M7 10h14M3 14h12M9 18h12"/>'),
    spin: sv('<path d="M20 12a8 8 0 11-3-6.2"/><path d="M20 4v5h-5"/>'),
    stop: sv('<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>')
  };

  function gecisSayfasi(kap) {
    const TR = window.KTrans;
    const TRO = Object.assign({ dur: 0.5, amount: 1, ti: -1, shutter: 180 }, kayitOku('kfx.gecis'));
    const sakla = () => kayitYaz('kfx.gecis', TRO);
    const g = gunluk();

    async function uygula(id, cut) {
      const p = TR.planAdj(id, cut, TRO);
      const top = await kfx('contentTop', { a: p.start, b: p.end });
      const pl = await kfx('placeAdj', { start: p.start, end: p.end, ti: -1, minTi: top, name: p.name, tpl: ADJ() });
      if (p.fx.length) await kfx('applyFx', { clips: [{ id: pl.id, fx: p.fx }] });
      return pl;
    }

    const gruplar = h('div');
    let son = '', grid = null;
    TR.LIST.forEach(([gr, id, ad, ic]) => {
      if (gr !== son) { gruplar.append(h('div', { class: 'sgrup' }, gr)); grid = h('div', { class: 'sgrid' }); gruplar.append(grid); son = gr; }
      const t = h('button', { type: 'button', class: 'stile ikon', title: 'Oynatma kafasındaki kesime uygula',
        html: (SIMGE[ic] || SIMGE.zoom) + '<span>' + kac(ad) + '</span>' });
      t.onclick = () => calistir(t, g, async () => {
        const cut = await kfx('cutNear', { ti: TRO.ti, radius: 1.0 });
        const pl = await uygula(id, cut);
        g.yaz(ad + ' → V' + (pl.ti + 1) + ' ayar katmanı, ' + cut.t.toFixed(2) + ' sn', 'ok');
      });
      grid.append(t);
    });

    const git = async (yon) => {
      const i = await sekans();
      const kesimler = await kfx('cuts', { ti: TRO.ti >= 0 ? TRO.ti : 0 });
      const ph = i.seq.ph;
      const t = yon > 0 ? kesimler.find((c) => c > ph + 0.02) : kesimler.slice().reverse().find((c) => c < ph - 0.02);
      if (t === undefined) throw new Error('Başka kesim yok.');
      await kfx('seek', { t });
    };

    const hepsi = { id: TR.LIST[0][1] };
    const kanalSec = liste(TRO, 'ti', [[-1, 'Otomatik'], [0, 'V1'], [1, 'V2'], [2, 'V3'], [3, 'V4']], sakla);

    kap.append(
      kart('Geçişler (' + TR.LIST.length + ')', gruplar,
        h('div', { class: 'duo' },
          h('button', { type: 'button', class: 'btn ghost', onclick: (e) => calistir(e.currentTarget, g, () => git(-1)) }, '◀ Önceki kesim'),
          h('button', { type: 'button', class: 'btn ghost', onclick: (e) => calistir(e.currentTarget, g, () => git(1)) }, 'Sonraki kesim ▶'))),
      kart('Ayarlar',
        kaydirici('Süre', TRO, 'dur', 0.2, 1.6, 0.05, fmtSn, sakla),
        kaydirici('Şiddet', TRO, 'amount', 0.3, 1.6, 0.05, (v) => Math.round(v * 100) + '%', sakla),
        kaydirici('Shutter açısı', TRO, 'shutter', 0, 360, 10, (v) => Math.round(v) + '°', sakla),
        satir('Kesim kanalı', kanalSec),
        not('Geçiş, kesimin üstündeki kanala "KFX …" adlı bir ayar katmanı olarak eklenir ve timeline\'da kalır. Silmek, kaydırmak ya da uzatmak için o klibi düzenlemeniz yeterli.')),
      kart('Toplu uygula',
        satir('Geçiş', liste(hepsi, 'id', TR.LIST.map((x) => [x[1], x[2]]))),
        h('button', { type: 'button', class: 'btn ghost', onclick: (e) => calistir(e.currentTarget, g, async () => {
          const kesimler = await kfx('cutsAll', { ti: TRO.ti >= 0 ? TRO.ti : 0 });
          if (!kesimler.length) throw new Error('Kesim yok.');
          let n = 0;
          for (const c of kesimler) { await uygula(hepsi.id, c); n++; g.ilerle(n / kesimler.length); }
          g.bitti();
          g.yaz(n + ' kesime uygulandı.', 'ok');
        }) }, 'Kanaldaki tüm kesimlere uygula'),
        h('button', { type: 'button', class: 'btn small', onclick: (e) => calistir(e.currentTarget, g, async () => {
          const r = await kfx('removeFx', { audio: false });
          g.yaz(r.removed + ' efekt kaldırıldı.', 'ok');
        }) }, 'Seçili kliplerden görüntü efektlerini kaldır')),
      g.bar, g.out);
  }

  /* ================================================================ */
  /*  LUMETRI RENK                                                     */
  /* ================================================================ */

  /* Hazir ayarlar ve onizleme hesabi — KURGU FX'ten */
  const LUM = [
    ['dogal', 'Doğal Canlı', { Exposure: 0.1, Contrast: 10, Highlights: -10, Shadows: 8, Vibrance: 18, Saturation: 105, Sharpen: 10 }],
    ['klinik', 'Klinik Temiz', { Exposure: 0.2, Temperature: -6, Contrast: 8, Highlights: -22, Whites: 10, Vibrance: 8 }],
    ['ten', 'Ten Tonu', { Temperature: 6, Tint: 4, Vibrance: 12, Saturation: 98, Highlights: -12, Shadows: 5 }],
    ['tahta', 'Beyaz Tahta Parlaması', { Exposure: -0.15, Highlights: -45, Whites: -30, Shadows: 8, Contrast: 4 }],
    ['sicak', 'Sıcak', { Temperature: 18, Tint: 3, Vibrance: 10, Contrast: 6 }],
    ['soguk', 'Soğuk', { Temperature: -18, Tint: -2, Contrast: 8, Highlights: -6 }],
    ['teal', 'Teal & Orange', { Temperature: 7, Tint: -5, Contrast: 16, Highlights: -12, Shadows: -8, Vibrance: 15, Saturation: 95 }],
    ['kontrast', 'Yüksek Kontrast', { Contrast: 35, Blacks: -15, Whites: 12, Saturation: 108 }],
    ['soft', 'Soft Film', { 'Faded Film': 25, Contrast: -10, Highlights: -15, Saturation: 92, Amount: -0.8 }],
    ['sinema', 'Sinematik', { Contrast: 18, Highlights: -20, Shadows: -10, Saturation: 90, 'Faded Film': 8, Amount: -1.5 }],
    ['vintage', 'Vintage', { 'Faded Film': 35, Temperature: 15, Saturation: 80, Contrast: -6, Amount: -1.2 }],
    ['bw', 'Siyah-Beyaz', { Saturation: 0, Contrast: 22, Blacks: -10 }],
    ['bwsoft', 'S-B Yumuşak', { Saturation: 0, 'Faded Film': 18, Contrast: 6, Highlights: -10 }],
    ['parlak', 'Aydınlat', { Exposure: 0.45, Shadows: 20, Highlights: -15 }],
    ['karart', 'Karart', { Exposure: -0.35, Highlights: -10, Blacks: -8 }],
    ['vignette', 'Sadece Vinyet', { Amount: -1.6 }]
  ];
  const LKEYS = [['Temperature', 'Sıcaklık', -60, 60, 1], ['Tint', 'Ton', -60, 60, 1], ['Exposure', 'Pozlama', -2, 2, 0.05], ['Contrast', 'Kontrast', -60, 60, 1],
    ['Highlights', 'Vurgular', -80, 80, 1], ['Shadows', 'Gölgeler', -80, 80, 1], ['Whites', 'Beyazlar', -80, 80, 1], ['Blacks', 'Siyahlar', -80, 80, 1],
    ['Vibrance', 'Canlılık', -60, 60, 1], ['Saturation', 'Doygunluk', 0, 200, 1], ['Faded Film', 'Soluk Film', 0, 80, 1], ['Sharpen', 'Keskinlik', 0, 80, 1], ['Amount', 'Vinyet', -3, 3, 0.05]];
  const LDEF = { Temperature: 0, Tint: 0, Exposure: 0, Contrast: 0, Highlights: 0, Shadows: 0, Whites: 0, Blacks: 0, Vibrance: 0, Saturation: 100, 'Faded Film': 0, Sharpen: 0, Amount: 0 };
  function gradePixels(src, dst, v) {
    const d = src.data, o = dst.data, W = src.width, H = src.height;
    const ex = Math.pow(2, v.Exposure || 0), ct = 1 + (v.Contrast || 0) / 100, tp = (v.Temperature || 0) / 100 * 0.35, tn = (v.Tint || 0) / 100 * 0.25;
    const hl = (v.Highlights || 0) / 100 * 0.35, sh = (v.Shadows || 0) / 100 * 0.35, wh = (v.Whites || 0) / 100 * 0.25, bl = (v.Blacks || 0) / 100 * 0.25;
    const sat = (v.Saturation === undefined ? 100 : v.Saturation) / 100, vib = (v.Vibrance || 0) / 100, fade = (v['Faded Film'] || 0) / 100 * 0.3, vg = (v.Amount || 0) / 3;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let r = d[i] / 255 * ex, g = d[i + 1] / 255 * ex, b = d[i + 2] / 255 * ex;
      r += tp; b -= tp; g -= tn; r += tn * 0.3; b += tn * 0.3;
      let L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const adj = hl * Math.max(0, L - 0.5) * 2 + sh * Math.max(0, 0.5 - L) * 2 + wh * Math.pow(Math.max(0, L), 3) + bl * Math.pow(Math.max(0, 1 - L), 3);
      r += adj; g += adj; b += adj;
      r = (r - 0.5) * ct + 0.5; g = (g - 0.5) * ct + 0.5; b = (b - 0.5) * ct + 0.5;
      L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), cs = mx - mn;
      const sv2 = sat * (1 + vib * (1 - Math.min(1, cs * 2)));
      r = L + (r - L) * sv2; g = L + (g - L) * sv2; b = L + (b - L) * sv2;
      r = fade + r * (1 - fade); g = fade + g * (1 - fade); b = fade + b * (1 - fade);
      if (vg) { const dx = x / W - 0.5, dy = y / H - 0.5, rr = Math.min(1, (dx * dx + dy * dy) * 2.2); const m = 1 + vg * rr * 0.9; r *= m; g *= m; b *= m; }
      o[i] = r * 255; o[i + 1] = g * 255; o[i + 2] = b * 255; o[i + 3] = 255;
    }
  }
  let LUM_IMG = null;
  function lumSample(W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    if (LUM_IMG) { const r = Math.max(W / LUM_IMG.width, H / LUM_IMG.height); const w = LUM_IMG.width * r, hh = LUM_IMG.height * r; x.drawImage(LUM_IMG, (W - w) / 2, (H - hh) / 2, w, hh); }
    else {
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#9fc2dd'); g.addColorStop(0.45, '#e9eef2'); g.addColorStop(1, '#5d6b74'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = '#f4f6f7'; x.fillRect(W * 0.08, H * 0.12, W * 0.55, H * 0.25);
      x.fillStyle = '#d7a184'; x.beginPath(); x.ellipse(W * 0.62, H * 0.42, W * 0.17, H * 0.11, 0, 0, 7); x.fill();
      x.fillStyle = '#26323b'; x.fillRect(W * 0.38, H * 0.52, W * 0.5, H * 0.48);
      x.fillStyle = '#3b7bbf'; x.fillRect(0, H * 0.82, W * 0.35, H * 0.18);
    }
    return x.getImageData(0, 0, W, H);
  }

  function renkSayfasi(kap) {
    const st = Object.assign({ id: 'dogal', mix: 100, mode: 'adj', scope: 'sel' }, kayitOku('kfx.renk'));
    const sakla = () => kayitYaz('kfx.renk', st);
    const ayarDegerleri = () => {
      const p = (LUM.find((x) => x[0] === st.id) || LUM[0])[2], o = {};
      for (const k in LDEF) { const hedef = p[k] !== undefined ? p[k] : LDEF[k]; o[k] = LDEF[k] + (hedef - LDEF[k]) * st.mix / 100; }
      return o;
    };
    const vals = ayarDegerleri();
    const pv = h('canvas', { width: 216, height: 384, class: 'lumpv' });
    const pvCiz = () => { const src = lumSample(216, 384), dst = pv.getContext('2d').createImageData(216, 384); gradePixels(src, dst, vals); pv.getContext('2d').putImageData(dst, 0, 0); };
    const ince = h('div');
    const inceCiz = () => ince.replaceChildren(...LKEYS.map(([k, l, a, b, s2]) =>
      kaydirici(l, vals, k, a, b, s2, (v) => String(Math.round(v * 100) / 100), pvCiz)));

    const grid = h('div', { class: 'sgrid lumgrid' });
    const kutular = [];
    LUM.forEach(([id, ad, p]) => {
      const c = h('canvas', { width: 90, height: 120 });
      const t = h('button', { type: 'button', class: 'stile lum' + (id === st.id ? ' on' : '') }, c, h('span', null, ad));
      t.onclick = () => {
        st.id = id; sakla();
        kutular.forEach((x) => x.classList.toggle('on', x === t));
        Object.assign(vals, ayarDegerleri()); inceCiz(); pvCiz();
      };
      t._ciz = () => { const src = lumSample(90, 120), dst = c.getContext('2d').createImageData(90, 120); gradePixels(src, dst, Object.assign({}, LDEF, p)); c.getContext('2d').putImageData(dst, 0, 0); };
      kutular.push(t); grid.append(t);
    });
    const hepsiniCiz = () => kutular.forEach((t) => t._ciz());

    const g = gunluk();
    const kareAl = h('button', { type: 'button', class: 'btn small' }, 'Oynatma kafasındaki kareyi önizlemede kullan');
    kareAl.onclick = () => calistir(kareAl, g, async () => {
      const p = path.join(os.tmpdir(), 'tk_kare_' + Date.now() + '.png');
      await kfx('grabFrame', { path: p });
      for (let i = 0; i < 20 && !fs.existsSync(p); i++) await new Promise((r) => setTimeout(r, 150));
      if (!fs.existsSync(p)) throw new Error('Kare alınamadı.');
      const im = new Image();
      im.src = 'file:///' + p.replace(/\\/g, '/') + '?' + Date.now();
      await im.decode();
      LUM_IMG = im; hepsiniCiz(); pvCiz();
      g.yaz('Önizleme karesi oynatma kafasından alındı.', 'ok');
    });

    const uygula = h('button', { type: 'button', class: 'cta sticky', html: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg><span>Uygula</span>' });
    uygula.onclick = () => calistir(uygula, g, async () => {
      const set = Object.assign({}, vals, { 'Saturation#2': 100 });
      const r = await kfx('lumetri', { set, mode: st.mode, scope: st.scope, label: (LUM.find((x) => x[0] === st.id) || [])[1], tpl: ADJ() });
      g.yaz('Lumetri ' + (st.mode === 'adj' ? 'ayar katmanına' : r.clips + ' klibe') + ' uygulandı.' +
        (r.warn && r.warn.length ? ' (bazı alanlar bulunamadı: ' + r.warn.slice(0, 3).join(', ') + ')' : ''), 'ok');
    });

    kap.append(
      h('div', { class: 'preview lumkap' }, pv),
      kart('Hazır ayarlar', grid,
        kaydirici('Yoğunluk', st, 'mix', 0, 150, 5, (v) => v + '%', () => { sakla(); Object.assign(vals, ayarDegerleri()); inceCiz(); pvCiz(); }),
        kareAl),
      kart('Nereye',
        satir('Uygula', secim(st, 'mode', [['adj', 'Ayar katmanı'], ['clips', 'Seçili kliplere']], sakla)),
        satir('Kapsam', secim(st, 'scope', [['sel', 'Seçili klipler'], ['all', 'Tüm sekans']], sakla)),
        not('Ayar katmanı: renk, kliplerin üstünde "KFX Renk" adlı ayrı bir katman olur; kapatıp açabilir, opaklığıyla yoğunluğu ayarlayabilirsiniz.')),
      kart('İnce ayar', ince),
      uygula, g.out);
    inceCiz(); hepsiniCiz(); pvCiz();
  }

  /* ================================================================ */
  /*  MUZIK -> MARKER                                                  */
  /* ================================================================ */

  /* Dalga ve isaret cizimi — KURGU FX'ten */
  function drawEnv(cv, db, hop, t0, ranges, thr, col, marks) {
    const c = cv.getContext('2d'), W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);
    const n = db.length, dur = n * hop;
    if (!n) return;
    const y = (v) => H - 6 - (Math.max(-70, Math.min(0, v)) + 70) / 70 * (H - 12);
    if (ranges) { c.fillStyle = col + '40'; ranges.forEach((r) => c.fillRect((r[0] - t0) / dur * W, 0, Math.max(1, (r[1] - r[0]) / dur * W), H)); }
    c.fillStyle = '#2dd4bf';
    const step = n / W;
    for (let x = 0; x < W; x++) {
      let m = -120; for (let i = Math.floor(x * step); i < Math.floor((x + 1) * step); i++) m = Math.max(m, db[i]);
      const yy = y(m); c.fillRect(x, yy, 1, H - 6 - yy);
    }
    if (thr !== undefined) { c.strokeStyle = 'rgba(255,255,255,.45)'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(0, y(thr)); c.lineTo(W, y(thr)); c.stroke(); c.setLineDash([]); }
    if (marks) { c.fillStyle = '#fff'; marks.forEach((t) => c.fillRect((t - t0) / dur * W, 0, 2, H)); }
  }

  /** ffmpeg yolu: yoksa indirir (bir kez, ~1 MB) */
  async function ffmpegYolu(g) {
    try {
      const core = window.TK_COREDIR && window.TK_COREDIR();
      if (!core) return null;
      const m = nreq(path.join(core, 'src', 'models.js'));
      const var0 = m.findFfmpeg();
      if (var0) return var0;
      g.yaz('<span class="dim">ffmpeg indiriliyor (bir kez, ~1 MB)…</span>');
      const r = await m.ensureFfmpeg();
      return r.exe;
    } catch (e) {
      g.yaz('<span class="warn">ffmpeg hazırlanamadı (' + kac(e.message) + ') — tarayıcı çözücüsü denenecek.</span>');
      return null;
    }
  }

  function muzikSayfasi(kap) {
    const A = window.KAudio;
    const o = Object.assign({ track: 0, useSel: true, mode: 'onset', sens: 0.55, gap: 0.25, keep: 1, every: 1, color: 0 }, kayitOku('kfx.muzik'));
    const sakla = () => kayitYaz('kfx.muzik', o);
    let zamanlar = null;
    const cv = h('canvas', { class: 'viz', width: 900, height: 168 });
    const ozet = h('div', { class: 'stats' });
    const g = gunluk();

    const analiz = h('button', { type: 'button', class: 'btn ghost' }, 'Analiz Et');
    const ekle = h('button', { type: 'button', class: 'btn primary', disabled: true }, 'Marker Ekle');
    const sil = h('button', { type: 'button', class: 'btn small' }, 'TK Beat marker\'larını sil');

    analiz.onclick = () => calistir(analiz, g, async () => {
      g.temizle();
      const klipler = await kfx('trackClips', { type: 'audio', ti: o.track, useSel: o.useSel });
      if (!klipler.length) throw new Error('Ses klibi bulunamadı.');
      const aralik = [Math.min(...klipler.map((c) => c.start)), Math.max(...klipler.map((c) => c.end))];
      const ff = await ffmpegYolu(g);
      const tl = await A.buildTimeline({ ffmpeg: ff }, klipler, 22050, aralik, (p) => g.ilerle(p * 0.6));
      g.ilerle(0.7);
      await new Promise((r) => setTimeout(r, 20));
      const on = A.onsetEnv(tl.pcm, 22050, { band: o.mode === 'kick' ? 'low' : 'all' });
      let bpm = null;
      if (o.mode === 'grid') {
        const tp = A.tempo(on); bpm = tp.bpm;
        zamanlar = tp.beats.filter((_, i) => i % o.every === 0);
      } else {
        let pk = A.pickPeaks(on, { sens: o.sens, minGap: o.gap });
        if (o.keep < 1) {
          const esik = pk.map((p) => p.v).sort((a, b) => b - a)[Math.max(0, Math.floor(pk.length * o.keep) - 1)];
          pk = pk.filter((p) => p.v >= esik);
        }
        zamanlar = pk.map((p) => p.t);
        if (o.every > 1) zamanlar = zamanlar.filter((_, i) => i % o.every === 0);
        bpm = A.tempo(on).bpm;
      }
      zamanlar = zamanlar.map((t) => t + tl.t0).filter((t) => t <= aralik[1]);
      A.clearCache();
      drawEnv(cv, A.envelopeDb(tl.pcm, 22050, 0.02), 0.02, tl.t0, null, undefined, '#fff', zamanlar);
      g.ilerle(1); g.bitti();
      ozet.replaceChildren(
        h('div', { class: 'stat' }, h('b', null, String(zamanlar.length)), h('small', null, 'marker')),
        h('div', { class: 'stat' }, h('b', null, String(Math.round(bpm))), h('small', null, 'BPM (tahmini)')),
        h('div', { class: 'stat' }, h('b', null, ff ? 'ffmpeg' : 'tarayıcı'), h('small', null, 'ses okuma')));
      ekle.disabled = !zamanlar.length;
    });
    ekle.onclick = () => calistir(ekle, g, async () => {
      const r = await kfx('addMarkers', { items: zamanlar.map((t, i) => ({ t, name: 'TK Beat ' + (i + 1), color: o.color })) });
      g.yaz(r.added + ' marker eklendi.', 'ok');
    });
    sil.onclick = () => calistir(sil, g, async () => {
      const r = await kfx('clearMarkers', { prefix: 'TK Beat' });
      g.yaz(r.removed + ' marker silindi.', 'ok');
    });

    const kanallar = [[0, 'A1'], [1, 'A2'], [2, 'A3'], [3, 'A4'], [4, 'A5'], [5, 'A6']];
    kap.append(
      kart('Kaynak',
        h('div', { class: 'chips' }, cip(o, 'useSel', 'Seçili ses klibini kullan (müzik)', sakla)),
        satir('ya da kanal', liste(o, 'track', kanallar, sakla)),
        satir('Tespit', secim(o, 'mode', [['onset', 'Vuruşlar'], ['kick', 'Bas / Kick'], ['grid', 'BPM ızgarası']], sakla)),
        kaydirici('Hassasiyet', o, 'sens', 0, 1, 0.01, fmtP, sakla),
        kaydirici('En kısa aralık', o, 'gap', 0.08, 2, 0.01, fmtSn, sakla),
        kaydirici('En güçlüler', o, 'keep', 0.1, 1, 0.05, fmtP, sakla),
        satir('Izgara', liste(o, 'every', [[1, 'Her vuruş'], [2, 'Her 2 vuruş'], [4, 'Her 4 (bar)'], [8, 'Her 8 vuruş']], sakla)),
        satir('Marker rengi', liste(o, 'color', [[0, 'Yeşil'], [1, 'Kırmızı'], [2, 'Mor'], [3, 'Turuncu'], [4, 'Sarı'], [5, 'Beyaz'], [6, 'Mavi'], [7, 'Camgöbeği']], sakla))),
      kart('Sonuç', cv, ozet, g.bar, h('div', { class: 'duo' }, analiz, ekle)),
      sil, g.out);
  }

  /* ---------------------------------------------------------------- */
  /*  Kalici secimler                                                  */
  /* ---------------------------------------------------------------- */

  function kayitOku(k) {
    try { return JSON.parse(window.localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; }
  }
  function kayitYaz(k, v) {
    try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  /* ---------------------------------------------------------------- */

  function kur() {
    const sayfalar = [
      ['kfxYazi', yaziSayfasi, 'KText'],
      ['kfxHazir', sablonSayfasi, 'KTpl'],
      ['kfxGecis', gecisSayfasi, 'KTrans'],
      ['kfxRenk', renkSayfasi, null],
      ['kfxMuzik', muzikSayfasi, 'KAudio']
    ];
    for (const [id, f, gerek] of sayfalar) {
      const kap = $(id);
      if (!kap) continue;
      if (gerek && !window[gerek]) { kap.append(not('Modül yüklenemedi: ' + gerek)); continue; }
      try { f(kap); } catch (e) { kap.append(h('p', { class: 'hint err' }, 'Sayfa kurulamadı: ' + e.message)); console.error(e); }
    }
    window.requestAnimationFrame(dongu);
  }

  window.TKKfx = { kfx, hostSifirla };
  document.addEventListener('DOMContentLoaded', kur);
})();
