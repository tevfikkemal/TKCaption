/*
 * KURGU FX (com.vedat.kurgufx, v1.3) eklentisinden alindi - yapimcisi Vedat'in
 * onayiyla, TK Caption'da herkese acik yayinlanmak uzere. Icerik degistirilmedi.
 */
/* KURGU FX — geçiş ve zoom tanımları (Transform tabanlı, kare kare keyframe) */
(function (G) {
  const cl = v => Math.max(0, Math.min(1, v));
  const Ei = u => u * u * u, Eo = u => 1 - Math.pow(1 - u, 3), Eio = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const Eback = u => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
  const Ebounce = u => { const n1 = 7.5625, d1 = 2.75; if (u < 1 / d1) return n1 * u * u; if (u < 2 / d1) return n1 * (u -= 1.5 / d1) * u + 0.75; if (u < 2.5 / d1) return n1 * (u -= 2.25 / d1) * u + 0.9375; return n1 * (u -= 2.625 / d1) * u + 0.984375; };
  const Eel = u => u === 0 ? 0 : u === 1 ? 1 : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
  const rnd = (i) => { const x = Math.sin(i * 91.17 + 7.3) * 43758.5453; return x - Math.floor(x) - 0.5; };
  const T = {};
  // each def: a(u,k,i) for outgoing clip (u: 0→1 toward cut), b(u,k,i) for incoming (u: 0→1 after cut). k = intensity
  // channels: s (scale %), sw (scale width % -> non-uniform), rot, skew, op, blur, dl (dir blur len), dd (dir blur angle), ox/oy (offset, frame fraction, wraps), br (brightness)
  const whip = (dx, dy) => ({
    a: (u, k) => ({ ox: dx * 0.5 * Ei(u), oy: dy * 0.5 * Ei(u), dl: 170 * k * Ei(u), dd: dx ? 90 : 0 }),
    b: (u, k) => ({ ox: -dx * 0.5 * (1 - Eo(u)), oy: -dy * 0.5 * (1 - Eo(u)), dl: 170 * k * (1 - Eo(u)), dd: dx ? 90 : 0 })
  });
  const push = (dx, dy) => ({
    a: (u) => ({ ox: dx * 0.5 * Eio(u), oy: dy * 0.5 * Eio(u) }),
    b: (u) => ({ ox: -dx * 0.5 * (1 - Eio(u)), oy: -dy * 0.5 * (1 - Eio(u)) })
  });
  const diag = (dx, dy) => ({
    a: (u, k) => ({ ox: dx * 0.5 * Ei(u), oy: dy * 0.5 * Ei(u), dl: 170 * k * Ei(u), dd: Math.atan2(dx, -dy) * 180 / Math.PI }),
    b: (u, k) => ({ ox: -dx * 0.5 * (1 - Eo(u)), oy: -dy * 0.5 * (1 - Eo(u)), dl: 170 * k * (1 - Eo(u)), dd: Math.atan2(dx, -dy) * 180 / Math.PI })
  });
  T.LIST = [
    ['ZOOM', 'zoomIn', 'Zoom In', 'zoom', { a: (u, k) => ({ s: 100 + 70 * k * Ei(u) }), b: (u, k) => ({ s: 100 + 70 * k * (1 - Eo(u)) }) }],
    ['ZOOM', 'zoomOut', 'Zoom Out', 'punchout', { a: (u, k) => ({ s: 100 + 35 * k * Ei(u), blur: 25 * k * Ei(u) }), b: (u, k) => ({ s: 100 + 60 * k * (1 - Eo(u)), blur: 25 * k * (1 - Eo(u)) }) }],
    ['ZOOM', 'zoomSpin', 'Zoom + Dön', 'spin', { a: (u, k) => ({ s: 100 + 80 * k * Ei(u), rot: 20 * k * Ei(u) }), b: (u, k) => ({ s: 100 + 80 * k * (1 - Eo(u)), rot: -20 * k * (1 - Eo(u)) }) }],
    ['ZOOM', 'zoomBlur', 'Zoom Blur', 'blur', { a: (u, k) => ({ s: 100 + 60 * k * Ei(u), blur: 60 * k * Ei(u) }), b: (u, k) => ({ s: 100 + 60 * k * (1 - Eo(u)), blur: 60 * k * (1 - Eo(u)) }) }],
    ['ZOOM', 'zoomFlash', 'Zoom + Flash', 'flash', { a: (u, k) => ({ s: 100 + 60 * k * Ei(u), br: 90 * Ei(u) }), b: (u, k) => ({ s: 100 + 60 * k * (1 - Eo(u)), br: 90 * (1 - Eo(u)) }) }],
    ['ZOOM', 'pulse', 'Pulse', 'target', { a: (u, k) => ({ s: 100 + 10 * k * Ei(u) }), b: (u, k) => ({ s: 100 + 10 * k * (1 - Eo(u)) + 8 * k * Math.sin(Math.PI * u) }) }],
    ['ZOOM', 'punch', 'Punch', 'punchin', { a: () => ({}), b: (u, k) => ({ s: 100 + 22 * k * (1 - Eback(u)) }) }],
    ['ZOOM', 'spin360', 'Spin 360', 'spin', { a: (u) => ({ rot: 180 * Ei(u), s: 100 + 90 * Ei(u) }), b: (u) => ({ rot: -180 * (1 - Eo(u)), s: 100 + 90 * (1 - Eo(u)) }) }],
    ['ZOOM', 'roll', 'Roll', 'spin', { a: (u, k) => ({ rot: 90 * k * Ei(u), s: 100 + 85 * Ei(u) }), b: (u, k) => ({ rot: -90 * k * (1 - Eo(u)), s: 100 + 85 * (1 - Eo(u)) }) }],
    ['WHIP', 'whipL', 'Whip ←', 'whipL', whip(-1, 0)], ['WHIP', 'whipR', 'Whip →', 'whipR', whip(1, 0)],
    ['WHIP', 'whipU', 'Whip ↑', 'whipU', whip(0, -1)], ['WHIP', 'whipD', 'Whip ↓', 'whipD', whip(0, 1)],
    ['WHIP', 'diagUL', 'Çapraz ↖', 'whipU', diag(-1, -1)], ['WHIP', 'diagUR', 'Çapraz ↗', 'whipU', diag(1, -1)],
    ['WHIP', 'diagDL', 'Çapraz ↙', 'whipD', diag(-1, 1)], ['WHIP', 'diagDR', 'Çapraz ↘', 'whipD', diag(1, 1)],
    ['KAYDIR', 'pushL', 'Kaydır ←', 'whipL', push(-1, 0)], ['KAYDIR', 'pushR', 'Kaydır →', 'whipR', push(1, 0)],
    ['KAYDIR', 'pushU', 'Kaydır ↑', 'whipU', push(0, -1)], ['KAYDIR', 'pushD', 'Kaydır ↓', 'whipD', push(0, 1)],
    ['KAYDIR', 'drop', 'Düş (zıpla)', 'whipD', { a: () => ({}), b: (u) => ({ oy: -0.5 * (1 - Ebounce(u)) }) }],
    ['KAYDIR', 'skewL', 'Eğik Kayma', 'whipL', { a: (u, k) => ({ ox: -0.5 * Ei(u), skew: -20 * k * Ei(u), s: 100 + 25 * Ei(u), dl: 120 * k * Ei(u), dd: 90 }), b: (u, k) => ({ ox: 0.5 * (1 - Eo(u)), skew: 20 * k * (1 - Eo(u)), s: 100 + 25 * (1 - Eo(u)), dl: 120 * k * (1 - Eo(u)), dd: 90 }) }],
    ['IŞIK', 'flash', 'Flash', 'flash', { a: (u) => ({ br: 100 * Ei(u) }), b: (u) => ({ br: 100 * (1 - Eo(u)) }) }],
    ['IŞIK', 'dipBlack', 'Siyaha Geç', 'stop', { a: (u) => ({ br: -100 * Eio(u) }), b: (u) => ({ br: -100 * (1 - Eio(u)) }) }],
    ['IŞIK', 'light', 'Işık Patlaması', 'flash', { a: (u, k) => ({ br: 80 * Ei(u), blur: 50 * k * Ei(u), s: 100 + 15 * Ei(u) }), b: (u, k) => ({ br: 80 * (1 - Eo(u)), blur: 50 * k * (1 - Eo(u)), s: 100 + 15 * (1 - Eo(u)) }) }],
    ['IŞIK', 'blur', 'Blur', 'blur', { a: (u, k) => ({ blur: 90 * k * Eio(u) }), b: (u, k) => ({ blur: 90 * k * (1 - Eio(u)) }) }],
    ['IŞIK', 'fadeBlur', 'Yumuşak Geçiş', 'blur', { a: (u, k) => ({ blur: 40 * k * Eio(u), s: 100 + 6 * Eio(u) }), b: (u, k) => ({ blur: 40 * k * (1 - Eio(u)), s: 100 + 6 * (1 - Eio(u)) }) }],
    ['EFEKT', 'stretchH', 'Esnet ↔', 'whipR', { a: (u, k) => ({ sw: 100 + 150 * k * Ei(u), dl: 80 * k * Ei(u), dd: 90 }), b: (u, k) => ({ sw: 100 + 150 * k * (1 - Eo(u)), dl: 80 * k * (1 - Eo(u)), dd: 90 }) }],
    ['EFEKT', 'stretchV', 'Esnet ↕', 'whipU', { a: (u, k) => ({ s: 100 + 120 * k * Ei(u), sw: 100, dl: 80 * k * Ei(u), dd: 0 }), b: (u, k) => ({ s: 100 + 120 * k * (1 - Eo(u)), sw: 100, dl: 80 * k * (1 - Eo(u)), dd: 0 }) }],
    ['EFEKT', 'glitch', 'Glitch', 'glitch', { a: (u, k, i) => ({ ox: u > 0.35 ? rnd(i) * 0.25 * k : 0, s: 106, br: u > 0.6 ? rnd(i + 3) * 40 : 0 }), b: (u, k, i) => ({ ox: u < 0.65 ? rnd(i + 9) * 0.25 * k : 0, s: 106, br: u < 0.4 ? rnd(i + 5) * 40 : 0 }) }],
    ['EFEKT', 'shake', 'Sarsıntı', 'shake', { a: (u, k, i) => ({ ox: rnd(i) * 0.06 * k * u, oy: rnd(i + 50) * 0.04 * k * u, s: 108 }), b: (u, k, i) => ({ ox: rnd(i + 7) * 0.06 * k * (1 - u), oy: rnd(i + 70) * 0.04 * k * (1 - u), s: 108 }) }],
    ['EFEKT', 'squeeze', 'Sıkıştır', 'punchout', { a: (u, k) => ({ sqz: Ei(u) * k, blur: 25 * k * Ei(u) }), b: (u, k) => ({ sqz: (1 - Eo(u)) * k, blur: 25 * k * (1 - Eo(u)) }) }],
    ['EFEKT', 'elastic', 'Elastik', 'bounce', { a: (u, k) => ({ s: 100 + 30 * k * Ei(u) }), b: (u, k) => ({ s: 130 - 30 * Eel(u) }) }]
  ];
  /* channels -> effect specs for host.applyFx */
  function build(frames, shutter) {
    // frames: [{t, v:{...}}]
    const has = k => frames.some(f => f.v[k] !== undefined && f.v[k] !== null);
    const fx = [];
    const tr = (has('s') || has('sw') || has('rot') || has('skew') || has('op') || has('sqz'));
    if (tr) {
      const set = { useShutter: false, shutter: shutter };
      const keys = {};
      const nonUni = has('sw') || has('sqz');
      if (nonUni) set.uni = false;
      if (has('s') || has('sqz') || nonUni) keys.scale = frames.map(f => [f.t, f.v.sqz !== undefined ? 100 + 60 * f.v.sqz : (f.v.s !== undefined ? f.v.s : 100)]);
      if (nonUni) keys.scaleW = frames.map(f => [f.t, f.v.sqz !== undefined ? 100 - 45 * f.v.sqz : (f.v.sw !== undefined ? f.v.sw : (f.v.s !== undefined ? f.v.s : 100))]);
      if (has('rot')) keys.rot = frames.map(f => [f.t, f.v.rot || 0]);
      if (has('skew')) keys.skew = frames.map(f => [f.t, f.v.skew || 0]);
      if (has('op')) keys.op = frames.map(f => [f.t, f.v.op !== undefined ? f.v.op : 100]);
      fx.push({ type: 'transform', set, keys });
    }
    if (has('ox') || has('oy')) fx.push({ type: 'offset', set: {}, keys: { center: frames.map(f => [f.t, [f.v.ox || 0, f.v.oy || 0]]) }, rel: { center: true } });
    if (has('dl')) fx.push({ type: 'dblur', set: { dir: frames.find(f => f.v.dd !== undefined) ? frames.find(f => f.v.dd !== undefined).v.dd : 90 }, keys: { len: frames.map(f => [f.t, f.v.dl || 0]) } });
    if (has('blur')) fx.push({ type: 'gblur', set: { edge: true }, keys: { blur: frames.map(f => [f.t, f.v.blur || 0]) } });
    if (has('br')) fx.push({ type: 'bright', set: {}, keys: { b: frames.map(f => [f.t, f.v.br || 0]) } });
    return fx;
  }
  /* cut = {t, A, B, aStart, bEnd, fd} */
  T.plan = function (id, cut, opts) {
    const def = T.LIST.find(x => x[1] === id); if (!def) throw new Error('Geçiş yok: ' + id);
    const d = def[4], k = opts.amount || 1, half = (opts.dur || 0.5) / 2, f = cut.fd, sh = opts.shutter || 180;
    const clips = [];
    if (cut.A) {
      const t0 = Math.max(cut.aStart, cut.t - half), t1 = cut.t - f;
      const N = Math.max(1, Math.round((t1 - t0) / f)), fr = [];
      for (let i = 0; i <= N; i++) fr.push({ t: t0 + i * f, v: d.a(i / N, k, i) });
      fr.push({ t: t0 - f > cut.aStart ? t0 - f : t0, v: d.a(0, k, 0) });
      const fx = build(fr, sh); if (fx.length) clips.push({ id: cut.A, fx });
    }
    if (cut.B) {
      const t0 = cut.t, t1 = Math.min(cut.bEnd - f, cut.t + half);
      const N = Math.max(1, Math.round((t1 - t0) / f)), fr = [];
      for (let i = 0; i <= N; i++) fr.push({ t: t0 + i * f, v: d.b(i / N, k, i) });
      const fx = build(fr, sh); if (fx.length) clips.push({ id: cut.B, fx });
    }
    return { clips };
  };
  /* AtomX-style: one adjustment layer over the cut, carrying the whole transition */
  T.planAdj = function (id, cut, opts) {
    const def = T.LIST.find(x => x[1] === id); if (!def) throw new Error('Geçiş yok: ' + id);
    const d = def[4], k = opts.amount || 1, half = (opts.dur || 0.5) / 2, f = cut.fd, sh = opts.shutter || 180;
    const t0 = Math.round((cut.t - half) / f) * f, t1 = Math.round((cut.t + half) / f) * f;
    const fr = [];
    const NA = Math.max(1, Math.round((cut.t - f - t0) / f));
    for (let i = 0; i <= NA; i++) fr.push({ t: t0 + i * f, v: d.a(i / NA, k, i) });
    const NB = Math.max(1, Math.round((t1 - cut.t) / f));
    for (let i = 0; i <= NB; i++) fr.push({ t: cut.t + i * f, v: d.b(i / NB, k, i + 100) });
    return { start: t0, end: t1 + f, name: 'KFX ' + def[2], group: def[0], fx: build(fr, sh) };
  };
  /* zoom presets via Transform (anchor = position = focus, shutter blur) */
  T.ZOOMS = [
    ['punchIn', 'Punch In', 'punchin'], ['punchOut', 'Punch Out', 'punchout'], ['emph', 'Vurgu (playhead)', 'target'],
    ['push', 'Yavaş Yaklaş', 'push'], ['pull', 'Yavaş Uzaklaş', 'pull'], ['bounce', 'Zıpla', 'bounce'], ['shake', 'Sarsıntı', 'shake'], ['inout', 'Gir-Çık', 'zoom']
  ];
  T.zoomPlan = function (preset, clip, o, fd, ph) {
    const E = { out: Eo, inout: Eio, in: Ei, lin: u => u, back: Eback, expo: u => u === 1 ? 1 : 1 - Math.pow(2, -10 * u) }[o.ease] || Eo;
    const amt = 100 * (1 + o.amount), cs = clip.start, ce = clip.end - fd;
    let t0 = cs, t1 = Math.min(ce, cs + o.dur), fn;
    if (preset === 'punchIn') fn = u => 100 + (amt - 100) * E(u);
    if (preset === 'punchOut') fn = u => amt + (100 - amt) * E(u);
    if (preset === 'emph') { t0 = Math.max(cs, Math.min(ph, ce - 0.1)); t1 = Math.min(ce, t0 + o.dur); fn = u => 100 + (amt - 100) * E(u); }
    if (preset === 'push') { t1 = ce; fn = u => 100 + (amt - 100) * u; }
    if (preset === 'pull') { t1 = ce; fn = u => amt + (100 - amt) * u; }
    if (preset === 'bounce') fn = u => 100 + (amt - 100) * Math.sin(Math.PI * u);
    if (preset === 'inout') { t1 = ce; fn = u => { const a = o.dur / Math.max(0.01, ce - cs); return u < a ? 100 + (amt - 100) * E(u / a) : u > 1 - a ? amt + (100 - amt) * E((u - (1 - a)) / a) : amt; }; }
    let shake = preset === 'shake';
    const N = Math.max(1, Math.round((t1 - t0) / fd)), keys = { scale: [] }, offs = [];
    const long = preset === 'push' || preset === 'pull';
    if (long) { keys.scale = [[t0, fn(0)], [t1, fn(1)]]; }
    else for (let i = 0; i <= N; i++) {
      const u = i / N;
      if (shake) { const d = 1 - u; keys.scale.push([t0 + i * fd, u >= 1 ? 100 : 106]); offs.push([t0 + i * fd, [rnd(i) * 0.035 * d * (1 + o.amount), rnd(i + 40) * 0.02 * d * (1 + o.amount)]]); }
      else keys.scale.push([t0 + i * fd, fn(u)]);
    }
    const fx = [{ type: 'transform', set: { useShutter: false, shutter: o.shutter || 180, anchorRel: [o.focusX - 0.5, o.focusY - 0.5] }, keys }];
    if (offs.length) fx.push({ type: 'offset', set: {}, keys: { center: offs }, rel: { center: true } });
    return { clips: [{ id: clip.id, fx }] };
  };
  G.KTrans = T;
})(typeof window !== 'undefined' ? window : globalThis);
