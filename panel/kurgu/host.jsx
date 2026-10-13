/*
 * KURGU FX (com.vedat.kurgufx, v1.3) eklentisinden alindi - yapimcisi Vedat'in
 * onayiyla, TK Caption'da herkese acik yayinlanmak uzere. Icerik degistirilmedi.
 */
/* KURGU FX — Premiere Pro host script (ExtendScript / ES3) */
var KFX = {};
(function () {
  var TPS = 254016000000;

  /* ---------- JSON (ExtendScript has none) ---------- */
  function q(s) {
    return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';
  }
  function J(v) {
    if (v === null || v === undefined) return 'null';
    var t = typeof v;
    if (t === 'number') return isFinite(v) ? String(v) : 'null';
    if (t === 'boolean') return String(v);
    if (t === 'string') return q(v);
    if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(J(v[i])); return '[' + a.join(',') + ']'; }
    var o = [];
    for (var k in v) { if (v.hasOwnProperty(k) && typeof v[k] !== 'function') o.push(q(k) + ':' + J(v[k])); }
    return '{' + o.join(',') + '}';
  }
  KFX.run = function (fn, arg) {
    try {
      if (!KFX[fn]) throw new Error('Bilinmeyen komut: ' + fn);
      return J({ ok: true, data: KFX[fn](arg || {}) });
    } catch (e) {
      return J({ ok: false, error: String(e && e.message ? e.message : e) + (e && e.line ? ' (satır ' + e.line + ')' : '') });
    }
  };

  /* ---------- helpers ---------- */
  function S() { var s = app.project.activeSequence; if (!s) throw new Error('Aktif sekans yok. Önce bir sekans aç.'); return s; }
  function T(sec) { var t = new Time(); t.ticks = String(Math.round(sec * TPS)); return t; }
  function fd(s) { return parseFloat(s.timebase) / TPS; }
  function snap(s, sec) { var f = fd(s); return Math.round(sec / f) * f; }
  function trk(s, type) { return type === 'audio' ? s.audioTracks : s.videoTracks; }
  function sec(t) { return t && t.seconds !== undefined ? t.seconds : parseFloat(t) / TPS; }
  function seqEnd(s) { return parseFloat(s.end) / TPS; }
  function spd(it) { try { var v = it.getSpeed(); return v ? v : 1; } catch (e) { return 1; } }
  function isRev(it) { try { return !!it.isSpeedReversed(); } catch (e) { return false; } }
  function mpath(it) { try { return it.projectItem ? it.projectItem.getMediaPath() : ''; } catch (e) { return ''; } }
  function clipInfo(f) {
    var it = f.item;
    return { id: it.nodeId, name: it.name, type: f.type, ti: f.ti, ci: f.ci, start: it.start.seconds, end: it.end.seconds,
      inP: it.inPoint.seconds, outP: it.outPoint.seconds, path: mpath(it), speed: spd(it), rev: isRev(it), disabled: !!it.disabled };
  }
  function findNode(s, id) {
    var types = ['video', 'audio'];
    for (var k = 0; k < 2; k++) {
      var ts = trk(s, types[k]);
      for (var i = 0; i < ts.numTracks; i++) {
        var cl = ts[i].clips;
        for (var j = 0; j < cl.numItems; j++) if (cl[j].nodeId === id) return { item: cl[j], type: types[k], ti: i, ci: j };
      }
    }
    return null;
  }
  function selection(s, type) {
    var out = [], sel;
    try { sel = s.getSelection(); } catch (e) { sel = []; }
    for (var i = 0; i < sel.length; i++) {
      var f = findNode(s, sel[i].nodeId);
      if (f && (!type || f.type === type)) out.push(f);
    }
    out.sort(function (a, b) { return a.item.start.seconds - b.item.start.seconds; });
    return out;
  }
  function clipAt(s, type, ti, t) {
    var cl = trk(s, type)[ti].clips;
    for (var j = 0; j < cl.numItems; j++) {
      if (cl[j].start.seconds <= t + 1e-4 && cl[j].end.seconds > t + 1e-4) return { item: cl[j], type: type, ti: ti, ci: j };
    }
    return null;
  }
  function getComp(it, names) {
    var c = it.components;
    for (var i = c.numItems - 1; i >= 0; i--) {
      for (var n = 0; n < names.length; n++) if (c[i].displayName === names[n] || c[i].matchName === names[n]) return c[i];
    }
    return null;
  }
  function prop(comp, names) {
    if (!comp) return null;
    var p = comp.properties;
    for (var n = 0; n < names.length; n++) for (var i = 0; i < p.numItems; i++) if (p[i].displayName === names[n]) return p[i];
    // loose match
    for (n = 0; n < names.length; n++) for (i = 0; i < p.numItems; i++) {
      var dn = String(p[i].displayName).toLowerCase();
      if (dn.indexOf('uniform') >= 0 || dn.indexOf('use comp') >= 0) continue;
      if (dn.indexOf(String(names[n]).toLowerCase()) >= 0) return p[i];
    }
    return null;
  }
  function mt(it, tl) { return it.inPoint.seconds + (tl - it.start.seconds) * spd(it); }
  function valAt(p, it, tl) {
    try { if (p.isTimeVarying()) return p.getValueAtTime(T(mt(it, tl))); } catch (e) { }
    return p.getValue();
  }
  function lerp(a, b, u) {
    if (a instanceof Array) { var r = []; for (var i = 0; i < a.length; i++) r.push(a[i] + (b[i] - a[i]) * u); return r; }
    return a + (b - a) * u;
  }
  var EASE = {
    lin: function (u) { return u; },
    'in': function (u) { return u * u * u; },
    out: function (u) { return 1 - Math.pow(1 - u, 3); },
    inout: function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    expo: function (u) { return u === 1 ? 1 : 1 - Math.pow(2, -10 * u); },
    back: function (u) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); },
    sine: function (u) { return -(Math.cos(Math.PI * u) - 1) / 2; }
  };
  function ez(n) { return EASE[n] || EASE.inout; }
  /* write one keyframe at timeline second tl */
  function key(p, it, tl, v) {
    var t = T(mt(it, tl));
    p.addKey(t);
    p.setValueAtKey(t, v, 0);
  }
  /* animate a property frame-by-frame (robust: no reliance on interpolation curves) */
  function anim(s, p, it, t0, t1, fn) {
    if (!p) return 0;
    if (!p.isTimeVarying()) p.setTimeVarying(true);
    var f = fd(s), a = snap(s, t0), b = snap(s, t1);
    var cs = it.start.seconds, ce = it.end.seconds - f * 0.5;
    var N = Math.max(1, Math.round((b - a) / f)), n = 0;
    for (var i = 0; i <= N; i++) {
      var tl = a + i * f;
      if (tl < cs - 1e-4 || tl > ce + 1e-4) continue;
      key(p, it, tl, fn(i / N));
      n++;
    }
    return n;
  }
  function resetProp(p, it, tl) {
    var v = valAt(p, it, tl);
    if (p.isTimeVarying()) { p.setTimeVarying(false); }
    try { p.setValue(v, 1); } catch (e) { }
    return v;
  }
  function getBin(name) {
    var r = app.project.rootItem;
    for (var i = 0; i < r.children.numItems; i++) {
      var c = r.children[i];
      if (c.type === ProjectItemType.BIN && c.name === name) return c;
    }
    return r.createBin(name);
  }
  function normPath(p) { return String(p).replace(/\//g, '\\').toLowerCase(); }
  function findInBin(bin, path) {
    var np = normPath(path);
    for (var i = bin.children.numItems - 1; i >= 0; i--) {
      var c = bin.children[i];
      try { if (c.type !== ProjectItemType.BIN && normPath(c.getMediaPath()) === np) return c; } catch (e) { }
    }
    return null;
  }
  function importTo(bin, path, stills) {
    var it = findInBin(bin, path);
    if (it) return it;
    app.project.importFiles([path], true, bin, !!stills);
    it = findInBin(bin, path);
    if (!it) throw new Error('İçe aktarılamadı: ' + path);
    return it;
  }
  function qeSeq() { app.enableQE(); return qe.project.getActiveSequence(); }
  function qeItem(f) {
    var qs = qeSeq();
    var tr = f.type === 'video' ? qs.getVideoTrackAt(f.ti) : qs.getAudioTrackAt(f.ti);
    var n = tr.numItems, i, it;
    var st = f.item.start.seconds;
    for (i = 0; i < n; i++) {
      it = tr.getItemAt(i);
      if (!it || it.type === 'Empty') continue;
      var s2 = null;
      try { if (it.start && it.start.secs !== undefined) s2 = parseFloat(it.start.secs); else if (it.start && it.start.ticks !== undefined) s2 = parseFloat(it.start.ticks) / TPS; } catch (e) { }
      if (s2 !== null && Math.abs(s2 - st) < 0.02) return it;
    }
    var k = -1;
    for (i = 0; i < n; i++) { it = tr.getItemAt(i); if (it && it.type !== 'Empty') { k++; if (k === f.ci) return it; } }
    throw new Error('Klip QE tarafında bulunamadı.');
  }
  function addVFx(f, names) {
    var q2 = qeItem(f), e = null;
    for (var i = 0; i < names.length && !e; i++) { try { e = qe.project.getVideoEffectByName(names[i]); } catch (x) { e = null; } }
    if (!e) throw new Error('Efekt bulunamadı: ' + names[0]);
    q2.addVideoEffect(e);
    var f2 = findNode(app.project.activeSequence, f.item.nodeId); if (f2) f.item = f2.item;
    var c = f.item.components;
    return c[c.numItems - 1];
  }
  function addAFx(f, names) {
    var q2 = qeItem(f), e = null;
    for (var i = 0; i < names.length && !e; i++) { try { e = qe.project.getAudioEffectByName(names[i]); } catch (x) { e = null; } }
    if (!e) throw new Error('Ses efekti bulunamadı: ' + names[0]);
    q2.addAudioEffect(e);
    var f2 = findNode(app.project.activeSequence, f.item.nodeId); if (f2) f.item = f2.item;
    var c = f.item.components;
    return c[c.numItems - 1];
  }
  function topVideoUnder(s, t) {
    for (var i = 0; i < s.videoTracks.numTracks; i++) { var c = clipAt(s, 'video', i, t); if (c) return c; }
    return null;
  }
  function overlaps(track, a, b) {
    var cl = track.clips;
    for (var j = 0; j < cl.numItems; j++) if (cl[j].start.seconds < b - 1e-3 && cl[j].end.seconds > a + 1e-3) return true;
    return false;
  }
  function addTrack(s, type) {
    var qs = qeSeq();
    var n0 = trk(s, type).numTracks;
    try {
      if (type === 'video') qs.addTracks(1, n0, 0); else qs.addTracks(0, 0, 1, 1, n0);
    } catch (e) { }
    s = app.project.activeSequence;
    return trk(s, type).numTracks > n0 ? n0 : -1;
  }
  /* top-most free video track above everything in [a,b] */
  function pickVideoTrack(s, a, b) {
    var ts = s.videoTracks, maxOcc = -1;
    for (var i = 0; i < ts.numTracks; i++) if (overlaps(ts[i], a, b)) maxOcc = i;
    var t = maxOcc + 1;
    if (t < ts.numTracks) return t;
    var n = addTrack(s, 'video');
    return n >= 0 ? n : ts.numTracks - 1;
  }
  function pickAudioTrack(s, a, b, avoid0) {
    var ts = s.audioTracks;
    for (var i = avoid0 ? 1 : 0; i < ts.numTracks; i++) if (!overlaps(ts[i], a, b)) return i;
    var n = addTrack(s, 'audio');
    return n >= 0 ? n : ts.numTracks - 1;
  }
  function dbToLevel(db) { return Math.pow(10, (db - 15) / 20); }
  function levelToDb(v) { return v <= 0 ? -96 : 20 * Math.log(v) / Math.LN10 + 15; }

  /* ---------- info ---------- */
  KFX.info = function () {
    var s = app.project.activeSequence;
    if (!s) return { seq: null };
    var sel = selection(s), out = [];
    for (var i = 0; i < sel.length && i < 200; i++) out.push(clipInfo(sel[i]));
    var n = 0;
    for (i = 0; i < s.videoTracks.numTracks; i++) n += s.videoTracks[i].clips.numItems;
    return {
      seq: { name: s.name, id: s.sequenceID, fd: fd(s), fps: 1 / fd(s), w: s.frameSizeHorizontal, h: s.frameSizeVertical,
        ph: s.getPlayerPosition().seconds, end: seqEnd(s), vt: s.videoTracks.numTracks, at: s.audioTracks.numTracks, clips: n },
      sel: out, project: app.project.path
    };
  };
  KFX.trackClips = function (a) {
    var s = S(), out = [];
    var type = a.type || 'audio';
    if (a.useSel) {
      var sel = selection(s, type);
      for (var i = 0; i < sel.length; i++) out.push(clipInfo(sel[i]));
      if (out.length) return out;
    }
    var ts = trk(s, type);
    if (a.ti >= ts.numTracks) throw new Error('Böyle bir kanal yok: ' + (type === 'audio' ? 'A' : 'V') + (a.ti + 1));
    var cl = ts[a.ti].clips;
    for (var j = 0; j < cl.numItems; j++) out.push(clipInfo({ item: cl[j], type: type, ti: a.ti, ci: j }));
    return out;
  };
  KFX.cuts = function (a) {
    var s = S(), out = [];
    var cl = s.videoTracks[a.ti || 0].clips;
    for (var j = 1; j < cl.numItems; j++) out.push(cl[j].start.seconds);
    return out;
  };
  KFX.markerTimes = function () {
    var s = S(), ms = s.markers, out = [], m = ms.getFirstMarker();
    while (m) { out.push(m.start.seconds); m = ms.getNextMarker(m); }
    return out;
  };
  KFX.seek = function (a) { var s = S(); s.setPlayerPosition(String(Math.round(a.t * TPS))); return true; };

  /* ---------- markers ---------- */
  KFX.addMarkers = function (a) {
    var s = S(), n = 0;
    for (var i = 0; i < a.items.length; i++) {
      var m = a.items[i];
      var mk = s.markers.createMarker(snap(s, m.t));
      try { mk.name = m.name || 'KFX'; } catch (e) { }
      try { if (m.comment) mk.comments = m.comment; } catch (e) { }
      if (m.d && m.d > 0) { try { mk.end = T(snap(s, m.t + m.d)); } catch (e) { try { mk.end = snap(s, m.t + m.d); } catch (e2) { } } }
      try { if (m.color !== undefined) mk.setColorByIndex(m.color); } catch (e) { }
      n++;
    }
    return { added: n };
  };
  KFX.clearMarkers = function (a) {
    var s = S(), ms = s.markers, del = [], m = ms.getFirstMarker();
    while (m) { if (String(m.name).indexOf(a.prefix || 'KFX') === 0) del.push(m); m = ms.getNextMarker(m); }
    for (var i = 0; i < del.length; i++) ms.deleteMarker(del[i]);
    return { removed: del.length };
  };

  /* ---------- silence cut ---------- */
  KFX.cutSilence = function (a) {
    var s = S();
    var R = a.ranges.slice(0);
    if (!R.length) return { removed: 0 };
    if (a.clone) {
      var name0 = s.name;
      s.clone();
      var ns = app.project.sequences[app.project.sequences.numSequences - 1];
      try { ns.name = name0 + ' (KFX kesim)'; } catch (e) { }
      app.project.openSequence(ns.sequenceID);
      try { app.project.activeSequence = ns; } catch (e) { }
      s = app.project.activeSequence;
    }
    var f = fd(s), eps = f * 0.5;
    for (var i = 0; i < R.length; i++) { R[i] = [snap(s, R[i][0]), snap(s, R[i][1])]; }
    R.sort(function (x, y) { return x[0] - y[0]; });
    // razor
    var qs = qeSeq(), st = s.getSettings();
    var done = {};
    for (i = 0; i < R.length; i++) for (var k = 0; k < 2; k++) {
      var c = R[i][k], key2 = Math.round(c / f);
      if (done[key2]) continue; done[key2] = 1;
      qs.razor(T(c).getFormatted(st.videoFrameRate, st.videoDisplayFormat));
    }
    // remove pieces inside silent ranges
    var removed = 0, types = ['video', 'audio'];
    for (var ty = 0; ty < 2; ty++) {
      var ts = trk(s, types[ty]);
      for (var t = 0; t < ts.numTracks; t++) {
        try { if (ts[t].isLocked()) continue; } catch (e) { }
        var cl = ts[t].clips;
        for (var j = cl.numItems - 1; j >= 0; j--) {
          var it = cl[j], a0 = it.start.seconds, b0 = it.end.seconds;
          for (var r = 0; r < R.length; r++) {
            if (a0 >= R[r][0] - eps && b0 <= R[r][1] + eps) { it.remove(0, 0); removed++; break; }
          }
        }
      }
    }
    // close gaps (ripple), last range first — always re-read items fresh (linked partners move together)
    var shifted = 0;
    if (a.ripple !== false) {
      for (r = R.length - 1; r >= 0; r--) {
        var len = R[r][1] - R[r][0], ids = [];
        for (ty = 0; ty < 2; ty++) {
          ts = trk(s, types[ty]);
          for (t = 0; t < ts.numTracks; t++) {
            try { if (ts[t].isLocked()) continue; } catch (e) { }
            cl = ts[t].clips;
            for (j = 0; j < cl.numItems; j++) if (cl[j].start.seconds >= R[r][1] - eps) ids.push({ id: cl[j].nodeId, o: cl[j].start.seconds, v: ty === 0 ? 0 : 1 });
          }
        }
        ids.sort(function (x, y) { return (x.o - y.o) || (x.v - y.v); });
        for (j = 0; j < ids.length; j++) {
          var fr = findNode(s, ids[j].id); if (!fr) continue;
          var cur = fr.item.start.seconds, tgt = ids[j].o - len;
          if (Math.abs(cur - tgt) > eps) { fr.item.move(T(snap(s, tgt) - cur)); shifted++; }
        }
      }
    }
    // report leftover gaps on unlocked tracks (between first and last clip)
    var gaps = 0;
    for (ty = 0; ty < 2; ty++) { ts = trk(s, types[ty]); for (t = 0; t < ts.numTracks; t++) { cl = ts[t].clips; for (j = 1; j < cl.numItems; j++) if (cl[j].start.seconds - cl[j - 1].end.seconds > eps * 2 && cl[j].start.seconds - cl[j - 1].end.seconds < 3) gaps++; } }
    return { removed: removed, shifted: shifted, ranges: R.length, seq: s.name, gaps: gaps };
  };

  /* ---------- zoom / motion ---------- */
  function motionOf(it) {
    var mo = getComp(it, ['AE.ADBE Motion', 'Motion', 'Hareket']);
    if (!mo) throw new Error('Motion efekti yok: ' + it.name);
    return { sc: prop(mo, ['Scale', 'Ölçek']), po: prop(mo, ['Position', 'Konum']) };
  }
  function zoomTargets(s) {
    var sel = selection(s, 'video');
    if (sel.length) return sel;
    var c = topVideoUnder(s, s.getPlayerPosition().seconds);
    if (!c) throw new Error('Klip seç ya da playhead\'i bir klibin üstüne getir.');
    return [c];
  }
  KFX.zoom = function (a) {
    var s = S(), tg = zoomTargets(s), W = s.frameSizeHorizontal, H = s.frameSizeVertical;
    var amt = a.amount || 1.15, dur = a.dur || 0.6, E = ez(a.ease || 'out'), ph = s.getPlayerPosition().seconds, n = 0;
    for (var i = 0; i < tg.length; i++) {
      var it = tg[i].item, m = motionOf(it), cs = it.start.seconds, ce = it.end.seconds;
      var t0 = cs, t1 = Math.min(ce, cs + dur);
      if (a.preset === 'emph') { t0 = Math.max(cs, Math.min(ph, ce - 0.1)); t1 = Math.min(ce, t0 + dur); }
      if (a.preset === 'push' || a.preset === 'pull') { t0 = cs; t1 = ce; }
      var base = resetProp(m.sc, it, t0);
      var p0 = resetProp(m.po, it, t0);
      var norm = p0[0] <= 2 && p0[1] <= 2;
      var F = norm ? [a.focusX !== undefined ? a.focusX : 0.5, a.focusY !== undefined ? a.focusY : 0.5] : [(a.focusX || 0.5) * W, (a.focusY || 0.5) * H];
      var big = base * amt;
      var posFor = function (sv) { var k = sv / base; return [F[0] + (p0[0] - F[0]) * k, F[1] + (p0[1] - F[1]) * k]; };
      var from = base, to = big, fn;
      if (a.preset === 'punchOut' || a.preset === 'pull') { from = big; to = base; }
      if (a.preset === 'bounce') {
        fn = function (u) { return base + (big - base) * Math.sin(Math.PI * u); };
      } else if (a.preset === 'shake') {
        var amp = (a.shakePx || 22) * (norm ? 1 / W : 1), seed = 7;
        var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5; };
        var sb = base * 1.06;
        n += anim(s, m.sc, it, t0 - (a.preset === 'shake' ? 0 : 0), t1, function (u) { return u >= 1 ? base : sb; });
        n += anim(s, m.po, it, t0, t1, function (u) { if (u >= 1) return p0; var d = (1 - u); return [p0[0] + rnd() * 2 * amp * d, p0[1] + rnd() * 2 * amp * d * (norm ? W / H : 1)]; });
        continue;
      } else {
        fn = function (u) { return from + (to - from) * E(u); };
      }
      var useE = (a.preset === 'push' || a.preset === 'pull') ? EASE.lin : null;
      if (useE) { fn = function (u) { return from + (to - from) * u; }; }
      // long moves: 2 keys; short moves: frame-by-frame
      if (t1 - t0 > 2.5 && (a.preset === 'push' || a.preset === 'pull')) {
        if (!m.sc.isTimeVarying()) m.sc.setTimeVarying(true);
        if (!m.po.isTimeVarying()) m.po.setTimeVarying(true);
        key(m.sc, it, t0, from); key(m.sc, it, t1 - fd(s), to);
        key(m.po, it, t0, posFor(from)); key(m.po, it, t1 - fd(s), posFor(to));
        n += 4;
      } else {
        n += anim(s, m.sc, it, t0, t1, fn);
        n += anim(s, m.po, it, t0, t1, function (u) { return posFor(fn(u)); });
      }
    }
    return { clips: tg.length, keys: n };
  };
  /* smooth the scale jumps between adjacent selected clips */
  KFX.smoothCuts = function (a) {
    var s = S(), sel = selection(s, 'video'), dur = a.dur || 0.6, E = ez(a.ease || 'inout'), done = 0;
    if (sel.length < 1) {
      var ts = s.videoTracks[a.ti || 0].clips; sel = [];
      for (var j = 0; j < ts.numItems; j++) sel.push({ item: ts[j], type: 'video', ti: a.ti || 0, ci: j });
    }
    for (var i = 0; i < sel.length; i++) {
      var B = sel[i].item, A = null, cl = s.videoTracks[sel[i].ti].clips;
      for (j = 0; j < cl.numItems; j++) if (Math.abs(cl[j].end.seconds - B.start.seconds) < fd(s) * 0.6) A = cl[j];
      if (!A) continue;
      var ma = motionOf(A), mb = motionOf(B);
      var tA = A.end.seconds - fd(s), tB = B.start.seconds;
      var sa = valAt(ma.sc, A, tA), pa = valAt(ma.po, A, tA);
      var sb = resetProp(mb.sc, B, tB), pb = resetProp(mb.po, B, tB);
      if (Math.abs(sa - sb) < 0.01 && Math.abs(pa[0] - pb[0]) < 1e-4 && Math.abs(pa[1] - pb[1]) < 1e-4) continue;
      var t1 = Math.min(B.end.seconds, tB + dur);
      anim(s, mb.sc, B, tB, t1, function (u) { return sa + (sb - sa) * E(u); });
      anim(s, mb.po, B, tB, t1, function (u) { return lerp(pa, pb, E(u)); });
      done++;
    }
    return { smoothed: done };
  };

  /* ---------- transitions (keyframed on the two clips around a cut) ---------- */
  function findCut(s, a) {
    var ph = s.getPlayerPosition().seconds, best = null, f = fd(s);
    var lo = a.ti >= 0 ? a.ti : 0, hi = a.ti >= 0 ? a.ti : s.videoTracks.numTracks - 1;
    for (var t = lo; t <= hi; t++) {
      var cl = s.videoTracks[t].clips;
      for (var j = 1; j < cl.numItems; j++) {
        var c = cl[j].start.seconds;
        if (Math.abs(cl[j - 1].end.seconds - c) > f * 0.6) continue;
        var d = Math.abs(c - ph);
        if (d <= (a.radius || 1.0) && (!best || d < best.d - 1e-6)) best = { d: d, t: c, A: { item: cl[j - 1], type: 'video', ti: t, ci: j - 1 }, B: { item: cl[j], type: 'video', ti: t, ci: j } };
      }
      if (best && a.ti < 0) break;
    }
    if (!best) throw new Error('Playhead\'i iki klibin birleştiği kesime getir (±1 sn).');
    return best;
  }
  function setP(comp, names, v) { var p = prop(comp, names); if (p) { try { p.setValue(v, 1); } catch (e) { } } return p; }
  KFX.transition = function (a) {
    var s = S(), cut = findCut(s, a), c = cut.t, half = (a.dur || 0.5) / 2, z = a.amount || 1.0;
    var A = cut.A, B = cut.B, Ein = EASE['in'], Eout = EASE.out;
    var tA0 = Math.max(A.item.start.seconds, c - half), tA1 = c - fd(s), tB0 = c, tB1 = Math.min(B.item.end.seconds, c + half);
    var W = s.frameSizeHorizontal, type = a.type;
    var tf = function (f) {
      var cp = addVFx(f, ['Transform', 'Dönüştür']);
      setP(cp, ["Use Composition's Shutter Angle", 'Use Composition'], false);
      setP(cp, ['Shutter Angle', 'Deklanşör Açısı'], a.shutter || 270);
      return cp;
    };
    if (type === 'zoom' || type === 'zoomOut') {
      var k = 1 + 0.9 * z;
      var ta = tf(A), tb = tf(B), sa = prop(ta, ['Scale', 'Ölçek']), sb = prop(tb, ['Scale', 'Ölçek']);
      if (type === 'zoom') {
        anim(s, sa, A.item, tA0, tA1, function (u) { return 100 + (100 * k - 100) * Ein(u); });
        anim(s, sb, B.item, tB0, tB1, function (u) { return 100 * k + (100 - 100 * k) * Eout(u); });
      } else {
        anim(s, sa, A.item, tA0, tA1, function (u) { return 100 + (100 * k - 100) * Ein(u); });
        anim(s, sb, B.item, tB0, tB1, function (u) { return 100 * k + (100 - 100 * k) * Eout(u); });
        var ra = prop(ta, ['Rotation', 'Döndürme']), rb = prop(tb, ['Rotation', 'Döndürme']);
        anim(s, ra, A.item, tA0, tA1, function (u) { return 12 * Ein(u); });
        anim(s, rb, B.item, tB0, tB1, function (u) { return -12 * (1 - Eout(u)); });
      }
    } else if (type.indexOf('whip') === 0) {
      var dir = { whipL: [-1, 0], whipR: [1, 0], whipU: [0, -1], whipD: [0, 1] }[type];
      var oa = addVFx(A, ['Offset', 'Kaydırma']), ob = addVFx(B, ['Offset', 'Kaydırma']);
      var pa = prop(oa, ['Shift Center To', 'Merkezi Şuraya']), pb = prop(ob, ['Shift Center To', 'Merkezi Şuraya']);
      var c0 = pa.getValue(), nrm = c0[0] <= 2 && c0[1] <= 2;
      var dx = dir[0] * (nrm ? 0.5 : W * 0.5), dy = dir[1] * (nrm ? 0.5 : s.frameSizeVertical * 0.5);
      anim(s, pa, A.item, tA0, tA1, function (u) { var e = Ein(u); return [c0[0] + dx * e, c0[1] + dy * e]; });
      anim(s, pb, B.item, tB0, tB1, function (u) { var e = 1 - Eout(u); return [c0[0] - dx * e, c0[1] - dy * e]; });
      var da = addVFx(A, ['Directional Blur', 'Yönlü Bulanıklık']), db = addVFx(B, ['Directional Blur', 'Yönlü Bulanıklık']);
      var ang = dir[0] !== 0 ? 90 : 0;
      setP(da, ['Direction', 'Yön'], ang); setP(db, ['Direction', 'Yön'], ang);
      var L = 160 * z;
      anim(s, prop(da, ['Blur Length', 'Bulanıklık Uzunluğu']), A.item, tA0, tA1, function (u) { return L * Ein(u); });
      anim(s, prop(db, ['Blur Length', 'Bulanıklık Uzunluğu']), B.item, tB0, tB1, function (u) { return L * (1 - Eout(u)); });
    } else if (type === 'blur') {
      var ga = addVFx(A, ['Gaussian Blur', 'Gauss Bulanıklığı']), gb = addVFx(B, ['Gaussian Blur', 'Gauss Bulanıklığı']);
      setP(ga, ['Repeat Edge Pixels', 'Kenar'], true); setP(gb, ['Repeat Edge Pixels', 'Kenar'], true);
      var BL = 90 * z;
      anim(s, prop(ga, ['Blurriness', 'Bulanıklık']), A.item, tA0, tA1, function (u) { return BL * EASE.inout(u); });
      anim(s, prop(gb, ['Blurriness', 'Bulanıklık']), B.item, tB0, tB1, function (u) { return BL * (1 - EASE.inout(u)); });
    } else if (type === 'flash') {
      var fa = addVFx(A, ['ProcAmp']), fb = addVFx(B, ['ProcAmp']);
      var mx = 100 * Math.min(1, 0.6 + 0.4 * z);
      anim(s, prop(fa, ['Brightness', 'Parlaklık']), A.item, tA0, tA1, function (u) { return mx * Ein(u); });
      anim(s, prop(fb, ['Brightness', 'Parlaklık']), B.item, tB0, tB1, function (u) { return mx * (1 - Eout(u)); });
      anim(s, prop(fa, ['Contrast', 'Kontrast']), A.item, tA0, tA1, function (u) { return 100 - 70 * Ein(u); });
      anim(s, prop(fb, ['Contrast', 'Kontrast']), B.item, tB0, tB1, function (u) { return 30 + 70 * Eout(u); });
    } else if (type === 'glitch' || type === 'shake') {
      var seed = 11, rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5; };
      var ta2 = tf(A), tb2 = tf(B);
      var posA = prop(ta2, ['Position', 'Konum']), posB = prop(tb2, ['Position', 'Konum']);
      var scA = prop(ta2, ['Scale', 'Ölçek']), scB = prop(tb2, ['Scale', 'Ölçek']);
      var p0 = posA.getValue(), nr = p0[0] <= 2 && p0[1] <= 2, amp = (type === 'glitch' ? 0.07 : 0.035) * z * (nr ? 1 : W);
      scA.setValue(112, 1); scB.setValue(112, 1);
      anim(s, posA, A.item, tA0, tA1, function (u) { return [p0[0] + rnd() * 2 * amp * u, p0[1] + rnd() * amp * u * (type === 'shake' ? 1 : 0.2)]; });
      anim(s, posB, B.item, tB0, tB1, function (u) { var d = 1 - u; return [p0[0] + rnd() * 2 * amp * d, p0[1] + rnd() * amp * d * (type === 'shake' ? 1 : 0.2)]; });
      if (type === 'glitch') {
        var oa2 = addVFx(A, ['Offset', 'Kaydırma']), ob2 = addVFx(B, ['Offset', 'Kaydırma']);
        var qa = prop(oa2, ['Shift Center To', 'Merkezi Şuraya']), qb = prop(ob2, ['Shift Center To', 'Merkezi Şuraya']);
        var q0 = qa.getValue(), qn = q0[0] <= 2;
        anim(s, qa, A.item, tA0, tA1, function (u) { return [q0[0] + (u > 0.3 ? rnd() * (qn ? 0.3 : W * 0.3) : 0), q0[1]]; });
        anim(s, qb, B.item, tB0, tB1, function (u) { return [q0[0] + (u < 0.7 ? rnd() * (qn ? 0.3 : W * 0.3) : 0), q0[1]]; });
      }
    } else throw new Error('Bilinmeyen geçiş: ' + type);
    return { cut: c, track: cut.A.ti + 1 };
  };

  /* ---------- import & place ---------- */
  KFX.importStills = function (a) {
    var s = S(), bin = getBin(a.bin || 'KURGU FX Yazılar');
    app.project.importFiles([a.first], true, bin, true);
    var it = findInBin(bin, a.first);
    if (!it) throw new Error('Görüntü dizisi içe aktarılamadı.');
    try { it.setOverrideFrameRate(a.fps); } catch (e) { }
    try { if (a.name) it.name = a.name; } catch (e) { }
    var t = a.t !== undefined ? a.t : s.getPlayerPosition().seconds;
    t = snap(s, t);
    var ti = a.track >= 0 ? a.track : pickVideoTrack(s, t, t + (a.dur || 3));
    s = app.project.activeSequence;
    s.videoTracks[ti].overwriteClip(it, T(t));
    return { track: ti + 1, t: t };
  };
  KFX.importFile = function (a) {
    var bin = getBin(a.bin || 'KURGU FX');
    var it = importTo(bin, a.path, false);
    return { name: it.name };
  };
  KFX.placeAudio = function (a) {
    var s = S(), bin = getBin(a.bin || 'KURGU FX SFX'), out = [];
    var items = a.items || [a];
    for (var i = 0; i < items.length; i++) {
      var x = items[i], it = importTo(bin, x.path, false);
      var t = x.t !== undefined && x.t !== null ? x.t : s.getPlayerPosition().seconds;
      t = snap(s, Math.max(0, t));
      var len = x.len || 2;
      var ti = x.track >= 0 ? x.track : pickAudioTrack(s, t, t + len, true);
      s = app.project.activeSequence;
      s.audioTracks[ti].overwriteClip(it, T(t));
      out.push({ t: t, track: ti + 1 });
    }
    return { placed: out.length, list: out };
  };
  KFX.placeVideoFile = function (a) {
    var s = S(), bin = getBin(a.bin || 'KURGU FX'), it = importTo(bin, a.path, false);
    var t = a.t !== undefined ? a.t : 0;
    var ti = a.track >= 0 ? a.track : pickVideoTrack(s, t, a.end || seqEnd(s));
    s = app.project.activeSequence;
    s.videoTracks[ti].overwriteClip(it, T(t));
    var cl = s.videoTracks[ti].clips, placed = null;
    for (var j = 0; j < cl.numItems; j++) if (Math.abs(cl[j].start.seconds - t) < 0.01) placed = cl[j];
    if (placed && a.end) { try { placed.end = T(a.end); } catch (e) { } }
    if (placed && a.label) { try { placed.name = a.label; } catch (e) { } }
    return { track: ti + 1 };
  };

  /* ---------- audio ---------- */
  var AFX = {
    tel: [[['Highpass'], { cutoff: 400 }], [['Lowpass'], { cutoff: 3200 }]],
    radyo: [[['Highpass'], { cutoff: 650 }], [['Lowpass'], { cutoff: 4800 }], [['Distortion'], {}]],
    boguk: [[['Lowpass'], { cutoff: 650 }]],
    derin: [[['Pitch Shifter'], { semi: -4 }]],
    ince: [[['Pitch Shifter'], { semi: 5 }]],
    uzak: [[['Lowpass'], { cutoff: 2400 }], [['Studio Reverb'], {}]],
    robot: [[['Pitch Shifter'], { semi: -2 }], [['Chorus/Flanger', 'Flanger'], {}]],
    reverb: [[['Studio Reverb'], {}]],
    eko: [[['Analog Delay', 'Delay'], {}]],
    bas: [[['Bass'], { boost: 6 }]],
    fillL: [[['Fill Right with Left'], {}]],
    fillR: [[['Fill Left with Right'], {}]],
    deess: [[['DeEsser'], {}]],
    denoise: [[['DeNoise'], {}]]
  };
  function setLoose(comp, params) {
    var p = comp.properties, set = 0;
    for (var k in params) {
      if (!params.hasOwnProperty(k)) continue;
      for (var i = 0; i < p.numItems; i++) {
        if (String(p[i].displayName).toLowerCase().indexOf(k) >= 0) { try { p[i].setValue(params[k], 1); set++; } catch (e) { } break; }
      }
    }
    return set;
  }
  function audioTargets(s) {
    var sel = selection(s, 'audio');
    if (!sel.length) {
      var v = selection(s, 'video');
      if (v.length) {
        // use linked audio of selected video clips
        for (var i = 0; i < v.length; i++) {
          try { var li = v[i].item.getLinkedItems(); for (var j = 0; j < li.numItems; j++) { var f = findNode(s, li[j].nodeId); if (f && f.type === 'audio') sel.push(f); } } catch (e) { }
        }
      }
    }
    if (!sel.length) throw new Error('Önce ses klibini (veya kliplerini) seç.');
    return sel;
  }
  KFX.audioFx = function (a) {
    var s = S(), tg = audioTargets(s), chain = AFX[a.preset], warn = [];
    if (!chain) throw new Error('Bilinmeyen ses ayarı');
    for (var i = 0; i < tg.length; i++) {
      for (var c = 0; c < chain.length; c++) {
        try { var comp = addAFx(tg[i], chain[c][0]); setLoose(comp, chain[c][1]); }
        catch (e) { warn.push(String(e.message || e)); }
      }
    }
    return { clips: tg.length, warn: warn };
  };
  KFX.removeAudioFx = function () {
    var s = S(), tg = audioTargets(s), n = 0;
    for (var i = 0; i < tg.length; i++) {
      var q2 = qeItem(tg[i]);
      try { q2.removeEffects(true, false); n++; } catch (e) {
        try { q2.removeEffects(); n++; } catch (e2) { }
      }
    }
    return { cleared: n };
  };
  KFX.fade = function (a) {
    var s = S(), tg = selection(s), n = 0, f = fd(s);
    if (!tg.length) throw new Error('Klip seç.');
    for (var i = 0; i < tg.length; i++) {
      var it = tg[i].item, cs = it.start.seconds, ce = it.end.seconds;
      var p, base;
      if (tg[i].type === 'audio' && a.audio !== false) {
        p = prop(getComp(it, ['Volume', 'Ses Düzeyi']), ['Level', 'Düzey']);
        if (!p) continue;
        base = resetProp(p, it, cs + (ce - cs) / 2);
        if (a.inDur > 0) anim(s, p, it, cs, Math.min(ce, cs + a.inDur), function (u) { return base * EASE.sine(u); });
        if (a.outDur > 0) anim(s, p, it, Math.max(cs, ce - a.outDur), ce - f, function (u) { return base * (1 - EASE.sine(u)); });
        n++;
      } else if (tg[i].type === 'video' && a.video !== false) {
        p = prop(getComp(it, ['AE.ADBE Opacity', 'Opacity', 'Opaklık']), ['Opacity', 'Opaklık']);
        if (!p) continue;
        base = resetProp(p, it, cs + (ce - cs) / 2);
        if (a.inDur > 0) anim(s, p, it, cs, Math.min(ce, cs + a.inDur), function (u) { return base * EASE.sine(u); });
        if (a.outDur > 0) anim(s, p, it, Math.max(cs, ce - a.outDur), ce - f, function (u) { return base * (1 - EASE.sine(u)); });
        n++;
      }
    }
    return { clips: n };
  };
  /* music ducking under speech ranges */
  KFX.duck = function (a) {
    var s = S(), tr = s.audioTracks[a.music], cl = tr.clips, n = 0, ramp = a.ramp || 0.25;
    for (var j = 0; j < cl.numItems; j++) {
      var it = cl[j], cs = it.start.seconds, ce = it.end.seconds;
      var p = prop(getComp(it, ['Volume', 'Ses Düzeyi']), ['Level', 'Düzey']);
      if (!p) continue;
      var base = resetProp(p, it, cs), bdb = levelToDb(base), low = dbToLevel(bdb + (a.db || -12));
      p.setTimeVarying(true);
      var ks = [];
      for (var r = 0; r < a.ranges.length; r++) {
        var x = a.ranges[r][0], y = a.ranges[r][1];
        if (y < cs || x > ce) continue;
        ks.push([x - ramp, base], [x, low], [y, low], [y + ramp, base]);
      }
      var f = fd(s);
      for (var k = 0; k < ks.length; k++) {
        var t = snap(s, ks[k][0]);
        if (t < cs || t > ce - f) continue;
        key(p, it, t, ks[k][1]); n++;
      }
    }
    return { keys: n };
  };

  /* ---------- easing of existing keyframes ---------- */
  KFX.ease = function (a) {
    var s = S(), tg = selection(s), n = 0, f = fd(s), E = ez(a.ease || 'inout');
    if (!tg.length) throw new Error('Keyframe\'li klipleri seç.');
    for (var i = 0; i < tg.length; i++) {
      var it = tg[i].item, comps = it.components;
      for (var c = 0; c < comps.numItems; c++) {
        var props = comps[c].properties;
        for (var p = 0; p < props.numItems; p++) {
          var pr = props[p];
          var tv = false; try { tv = pr.isTimeVarying(); } catch (e) { }
          if (!tv) continue;
          var keys = pr.getKeys();
          if (!keys || keys.length < 2) continue;
          if (a.mode === 'bake') {
            var kk = [], vv = [];
            for (var k = 0; k < keys.length; k++) { kk.push(keys[k].seconds); vv.push(pr.getValueAtKey(keys[k])); }
            for (k = 0; k < kk.length - 1; k++) {
              var v0 = vv[k], v1 = vv[k + 1];
              if (typeof v0 !== 'number' && !(v0 instanceof Array)) continue;
              var N = Math.round((kk[k + 1] - kk[k]) / f);
              for (var q2 = 1; q2 < N; q2++) {
                var tm = T(kk[k] + q2 * f);
                pr.addKey(tm); pr.setValueAtKey(tm, lerp(v0, v1, E(q2 / N)), 0); n++;
              }
            }
          } else {
            var mode = a.mode === 'linear' ? 0 : a.mode === 'hold' ? 4 : 5;
            for (k = 0; k < keys.length; k++) { try { pr.setInterpolationTypeAtKey(keys[k], mode, k === keys.length - 1); n++; } catch (e) { } }
          }
        }
      }
    }
    return { keys: n };
  };

  /* ---------- safe zone guide ---------- */
  KFX.safeZone = function (a) {
    var s = S(), ts = s.videoTracks, found = null;
    for (var i = 0; i < ts.numTracks; i++) {
      var cl = ts[i].clips;
      for (var j = 0; j < cl.numItems; j++) if (String(cl[j].name).indexOf('KFX_SafeZone') === 0) found = cl[j];
    }
    if (found) { found.disabled = a.show === 'toggle' ? !found.disabled : !a.show; return { visible: !found.disabled }; }
    if (a.show === false) return { visible: false };
    var bin = getBin('KURGU FX'), it = importTo(bin, a.png, false);
    var end = seqEnd(s), ti = pickVideoTrack(s, 0, end);
    s = app.project.activeSequence;
    s.videoTracks[ti].overwriteClip(it, T(0));
    cl = s.videoTracks[ti].clips;
    for (j = 0; j < cl.numItems; j++) if (cl[j].start.seconds < 0.01) { try { cl[j].end = T(end); } catch (e) { } try { cl[j].name = 'KFX_SafeZone (exportta kapat)'; } catch (e) { } }
    return { visible: true, track: ti + 1 };
  };

  KFX.captionTrack = function (a) {
    var s = S(), bin = getBin('KURGU FX Altyazı'), it = importTo(bin, a.path, false), ok2 = false;
    try { s.createCaptionTrack(it, 0, Sequence.CAPTION_FORMAT_SUBTITLE); ok2 = true; } catch (e) { }
    if (!ok2) { try { s.createCaptionTrack(it, 0); ok2 = true; } catch (e2) { } }
    if (!ok2) throw new Error('Altyazı kanalı oluşturulamadı; SRT projeye eklendi, timeline\'a sürükleyebilirsin.');
    return { ok: true };
  };

  /* ================= v1.1: generic effect writer ================= */
  var FXMAP = {
    transform: { names: ['Transform', 'Dönüştür'], idx: { anchor: 0, pos: 1, uni: 2, scale: 3, scaleW: 4, skew: 5, skewAxis: 6, rot: 7, op: 8, useShutter: 9, shutter: 10 },
      nm: { anchor: ['Anchor Point', 'Bağlantı Noktası'], pos: ['Position', 'Konum'], uni: ['Uniform Scale', 'Tekdüze Ölçek'], scale: ['Scale', 'Scale Height', 'Ölçek', 'Ölçek Yüksekliği'], scaleW: ['Scale Width', 'Ölçek Genişliği'], skew: ['Skew', 'Eğim'], skewAxis: ['Skew Axis', 'Eğim Ekseni'], rot: ['Rotation', 'Döndürme'], op: ['Opacity', 'Opaklık'], useShutter: ["Use Composition's Shutter Angle", 'Use Composition’s Shutter Angle'], shutter: ['Shutter Angle', 'Deklanşör Açısı'] } },
    gblur: { names: ['Gaussian Blur', 'Gauss Bulanıklığı'], idx: { blur: 0, dims: 1, edge: 2 }, nm: { blur: ['Blurriness', 'Bulanıklık'], dims: ['Blur Dimensions'], edge: ['Repeat Edge Pixels'] } },
    dblur: { names: ['Directional Blur', 'Yönlü Bulanıklık'], idx: { dir: 0, len: 1 }, nm: { dir: ['Direction', 'Yön'], len: ['Blur Length', 'Bulanıklık Uzunluğu'] } },
    offset: { names: ['Offset', 'Kaydırma'], idx: { center: 0, blend: 1 }, nm: { center: ['Shift Center To'], blend: ['Blend With Original'] } },
    bright: { names: ['Brightness & Contrast', 'Parlaklık ve Kontrast', 'ProcAmp'], idx: { b: 0, c: 1 }, nm: { b: ['Brightness', 'Parlaklık'], c: ['Contrast', 'Kontrast'] } }
  };
  function pByKey(comp, def, k) {
    var p = comp.properties, names = def.nm[k] || [], i, n;
    for (n = 0; n < names.length; n++) for (i = 0; i < p.numItems; i++) if (p[i].displayName === names[n]) return p[i];
    var ix = def.idx[k];
    if (ix !== undefined && ix < p.numItems) return p[ix];
    return null;
  }
  function relVal(base, v, W, H) {
    var norm = base[0] <= 2 && base[1] <= 2;
    return norm ? [base[0] + v[0], base[1] + v[1]] : [base[0] + v[0] * W, base[1] + v[1] * H];
  }
  /* a = {clips:[{id, fx:[{type, set:{k:v}, keys:{k:[[tl,v],...]}, rel:{k:true}}]}]} */
  KFX.applyFx = function (a) {
    var s = S(), W = s.frameSizeHorizontal, H = s.frameSizeVertical, nk = 0, fxn = 0;
    for (var c = 0; c < a.clips.length; c++) {
      var spec = a.clips[c], f = findNode(s, spec.id);
      if (!f) throw new Error('Klip bulunamadı: ' + spec.id);
      for (var e = 0; e < spec.fx.length; e++) {
        var fx = spec.fx[e], def = FXMAP[fx.type];
        var comp = addVFx(f, def.names); fxn++;
        var k, p;
        if (fx.set.anchorRel) {
          var pa = pByKey(comp, def, 'anchor'), pp = pByKey(comp, def, 'pos');
          if (pa && pp) { var ar = fx.set.anchorRel; try { pa.setValue(relVal(pa.getValue(), ar, W, H), 1); pp.setValue(relVal(pp.getValue(), ar, W, H), 1); } catch (x) { } }
        }
        for (k in fx.set) { if (!fx.set.hasOwnProperty(k) || k === 'anchorRel') continue; p = pByKey(comp, def, k); if (p) { try { p.setValue(fx.set[k], 1); } catch (x) { } } }
        for (k in fx.keys) {
          if (!fx.keys.hasOwnProperty(k)) continue;
          p = pByKey(comp, def, k); if (!p) continue;
          var base = null; if (fx.rel && fx.rel[k]) base = p.getValue();
          if (!p.isTimeVarying()) p.setTimeVarying(true);
          var ks = fx.keys[k], it = f.item, cs = it.start.seconds, ce = it.end.seconds - fd(s) * 0.5;
          for (var q2 = 0; q2 < ks.length; q2++) {
            var tl = snap(s, ks[q2][0]); if (tl < cs - 1e-4 || tl > ce + 1e-4) continue;
            var v = base ? relVal(base, ks[q2][1], W, H) : ks[q2][1];
            key(p, it, tl, v); nk++;
          }
        }
      }
    }
    return { effects: fxn, keys: nk };
  };
  /* ================= v1.3: AtomX-style adjustment-layer transitions ================= */
  var ADJ_NAME = 'KFX Ayar Katmanı';
  function walkFind(root, fn, depth) {
    if (depth > 6) return null;
    for (var i = 0; i < root.children.numItems; i++) {
      var c = root.children[i];
      if (fn(c)) return c;
      if (c.type === ProjectItemType.BIN) { var r = walkFind(c, fn, depth + 1); if (r) return r; }
    }
    return null;
  }
  function isSeqItem(c) { try { return c.isSequence && c.isSequence(); } catch (e) { return false; } }
  function adjItem(tpl) {
    var root = app.project.rootItem;
    var it = walkFind(root, function (c) { return c.type !== ProjectItemType.BIN && c.name === ADJ_NAME; }, 0);
    if (it) return it;
    if (!tpl || !new File(tpl).exists) throw new Error('Ayar katmanı şablonu bulunamadı: ' + tpl);
    var bin = getBin('KURGU FX');
    app.project.importFiles([tpl], true, bin, false);
    it = walkFind(bin, function (c) { return c.type !== ProjectItemType.BIN && !isSeqItem(c) && (c.name === '1080x1920' || /adjust|ayar|корректир/i.test(c.name)); }, 0);
    if (!it) throw new Error('Ayar katmanı içe aktarılamadı.');
    try { it.name = ADJ_NAME; } catch (e) { }
    try { it.moveBin(bin); } catch (e) { }
    // remove the helper sequence that came with the template
    try { for (var i = app.project.sequences.numSequences - 1; i >= 0; i--) { var q = app.project.sequences[i]; if (q.name === 'KFX_ADJ_TEMPLATE') app.project.deleteSequence(q); } } catch (e) { }
    return it;
  }
  function freeOn(s, ti, a, b) { return ti >= 0 && ti < s.videoTracks.numTracks && !overlaps(s.videoTracks[ti], a, b); }
  /* a = {start, end, ti (preferred), minTi, name, tpl} -> places an adjustment layer clip, returns {id, ti} */
  KFX.placeAdj = function (a) {
    var s = S(), it = adjItem(a.tpl), st = snap(s, a.start), en = snap(s, a.end);
    var ti = (a.ti >= 0 && a.ti > (a.minTi || -1) && freeOn(s, a.ti, st, en)) ? a.ti : -1;
    if (ti < 0) {
      for (var t = (a.minTi || 0) + 1; t < s.videoTracks.numTracks; t++) if (freeOn(s, t, st, en)) { ti = t; break; }
      if (ti < 0) { ti = addTrack(s, 'video'); if (ti < 0) throw new Error('Boş video kanalı yok.'); }
    }
    s = app.project.activeSequence;
    s.videoTracks[ti].overwriteClip(it, T(st));
    var cl = s.videoTracks[ti].clips, ci = null;
    for (var j = 0; j < cl.numItems; j++) if (Math.abs(cl[j].start.seconds - st) < fd(s) * 0.5) ci = cl[j];
    if (!ci) throw new Error('Ayar katmanı yerleşmedi.');
    try { ci.end = T(en); } catch (e) { }
    try { ci.name = a.name || 'KFX Geçiş'; } catch (e) { }
    // fit adjustment layer to sequence frame
    try {
      var W = s.frameSizeHorizontal, H = s.frameSizeVertical, sc = Math.max(W / 1080, H / 1920) * 100;
      if (Math.abs(sc - 100) > 0.5) { var mo = ci.components[1]; for (var q = 0; q < mo.properties.numItems; q++) if (mo.properties[q].displayName === 'Scale' || mo.properties[q].displayName === 'Ölçek') { mo.properties[q].setValue(sc, 1); break; } }
    } catch (e) { }
    return { id: ci.nodeId, ti: ti, start: ci.start.seconds, end: ci.end.seconds };
  };
  /* highest video track index that has a clip covering [a,b] (the content to transform) */
  KFX.contentTop = function (a) {
    var s = S(), top = -1;
    for (var i = 0; i < s.videoTracks.numTracks; i++) {
      var cl = s.videoTracks[i].clips;
      for (var j = 0; j < cl.numItems; j++) { var c = cl[j]; if (c.start.seconds < a.b - 1e-3 && c.end.seconds > a.a + 1e-3 && String(c.name).indexOf('KFX') !== 0) { top = i; break; } }
    }
    return top;
  };
  /* ================= v1.3: Lumetri ================= */
  var LUM_NAMES = ['Lumetri Color', 'Lumetri Renk', 'Lumetri Rengi'];
  var LUM_DEF = { 'Temperature': 0, 'Tint': 0, 'Saturation': 100, 'Exposure': 0, 'Contrast': 0, 'Highlights': 0, 'Shadows': 0, 'Whites': 0, 'Blacks': 0,
    'Faded Film': 0, 'Sharpen': 0, 'Vibrance': 0, 'Saturation#2': 100, 'Amount': 0 };
  var LUM_TR = { 'Temperature': ['Sıcaklık'], 'Tint': ['Ton'], 'Saturation': ['Doygunluk'], 'Exposure': ['Pozlama'], 'Contrast': ['Kontrast'], 'Highlights': ['Vurgular'],
    'Shadows': ['Gölgeler'], 'Whites': ['Beyazlar'], 'Blacks': ['Siyahlar'], 'Faded Film': ['Soluk Film'], 'Sharpen': ['Keskinleştir'], 'Vibrance': ['Canlılık'], 'Amount': ['Miktar'] };
  function lumProp(comp, key) {
    var parts = key.split('#'), nm = parts[0], occ = parts[1] ? parseInt(parts[1], 10) : 1, names = [nm].concat(LUM_TR[nm] || []), n = 0, p = comp.properties;
    for (var i = 0; i < p.numItems; i++) {
      var dn = String(p[i].displayName);
      for (var k = 0; k < names.length; k++) if (dn === names[k]) { n++; if (n === occ) return p[i]; break; }
    }
    return null;
  }
  function findComp(item, names) {
    var c = item.components;
    for (var i = 0; i < c.numItems; i++) for (var k = 0; k < names.length; k++) if (c[i].displayName === names[k]) return c[i];
    return null;
  }
  function videoTargets(s) {
    var sel = selection(s, 'video');
    if (!sel.length) { var ph = s.getPlayerPosition().seconds; var c = topVideoUnder(s, ph); if (c) sel = [c]; }
    return sel;
  }
  /* a = {set:{key:val}, mode:'clips'|'adj', tpl, scope:'sel'|'all'} */
  KFX.lumetri = function (a) {
    var s = S(), targets = [], warn = [], i, k;
    if (a.mode === 'adj') {
      var a0, b0;
      if (a.scope === 'all') { a0 = 0; b0 = seqEnd(s); }
      else {
        var sel = selection(s, 'video'); if (!sel.length) throw new Error('Önce timeline\'da renk vereceğin klipleri seç (ya da "Tüm sekans"ı seç).');
        a0 = 1e9; b0 = 0; for (i = 0; i < sel.length; i++) { a0 = Math.min(a0, sel[i].item.start.seconds); b0 = Math.max(b0, sel[i].item.end.seconds); }
      }
      var top = KFX.contentTop({ a: a0, b: b0 });
      var pl = KFX.placeAdj({ start: a0, end: b0, ti: -1, minTi: top, name: 'KFX Renk · ' + (a.label || 'Lumetri'), tpl: a.tpl });
      s = app.project.activeSequence; targets = [findNode(s, pl.id)];
    } else targets = videoTargets(s);
    if (!targets.length) throw new Error('Video klip seçili değil.');
    for (i = 0; i < targets.length; i++) {
      var f = targets[i], comp = findComp(f.item, LUM_NAMES);
      if (!comp) comp = addVFx(f, LUM_NAMES);
      var all = {}; for (k in LUM_DEF) if (LUM_DEF.hasOwnProperty(k)) all[k] = LUM_DEF[k];
      for (k in a.set) if (a.set.hasOwnProperty(k)) all[k] = a.set[k];
      for (k in all) {
        if (!all.hasOwnProperty(k)) continue;
        var p = lumProp(comp, k); if (!p) { warn.push(k); continue; }
        try { if (p.isTimeVarying()) p.setTimeVarying(false); p.setValue(all[k], 1); } catch (e) { warn.push(k + ':' + e.message); }
      }
    }
    return { clips: targets.length, warn: warn };
  };
  KFX.grabFrame = function (a) {
    var qs = qeSeq(), tc = qs.CTI.timecode;
    qs.exportFramePNG(tc, a.path);
    return { tc: tc, path: a.path };
  };
  /* ================= v1.3: MOGRT library ================= */
  KFX.mogrt = function (a) {
    var s = S(), t = a.t !== undefined && a.t !== null ? a.t : s.getPlayerPosition().seconds;
    t = snap(s, Math.max(0, t));
    var len = a.len || 5;
    var vt = a.track >= 0 ? a.track : pickVideoTrack(s, t, t + len);
    s = app.project.activeSequence;
    var at = 0; try { at = pickAudioTrack(s, t, t + len, true); } catch (e) { }
    s = app.project.activeSequence;
    var ti = s.importMGT(a.path, T(t).ticks, vt, at);
    if (!ti) throw new Error('MOGRT eklenemedi (Premiere reddetti).');
    return { track: vt + 1, t: t, name: ti.name, id: ti.nodeId };
  };
  /* nearest cut to t (or playhead) */
  KFX.cutNear = function (a) {
    var s = S(), ph = a.t !== undefined ? a.t : s.getPlayerPosition().seconds, f = fd(s), best = null;
    var lo = a.ti >= 0 ? a.ti : 0, hi = a.ti >= 0 ? a.ti : s.videoTracks.numTracks - 1;
    for (var t = lo; t <= hi; t++) {
      var cl = s.videoTracks[t].clips;
      for (var j = 1; j < cl.numItems; j++) {
        var c = cl[j].start.seconds;
        if (String(cl[j].name).indexOf('KFX') === 0 || String(cl[j - 1].name).indexOf('KFX') === 0) continue;
        if (Math.abs(cl[j - 1].end.seconds - c) > f * 0.6) continue;
        var d = Math.abs(c - ph);
        if (d <= (a.radius || 1.0) && (!best || d < best.d - 1e-6)) best = { d: d, t: c, ti: t, A: cl[j - 1].nodeId, B: cl[j].nodeId,
          aStart: cl[j - 1].start.seconds, bEnd: cl[j].end.seconds };
      }
    }
    if (!best) {
      if (a.allowClip) {
        for (t = 0; t < s.videoTracks.numTracks; t++) {
          var cc = clipAt(s, 'video', t, ph);
          if (cc && String(cc.item.name).indexOf('KFX_TR_') !== 0) return { t: cc.item.start.seconds, ti: t, A: null, B: cc.item.nodeId, aStart: 0, bEnd: cc.item.end.seconds, fd: f };
        }
      }
      throw new Error('Yakında kesim yok. Playhead\'i (ya da bıraktığın geçişi) iki klibin birleştiği yere getir.');
    }
    best.fd = f;
    return best;
  };
  KFX.cutsAll = function (a) {
    var s = S(), out = [], cl = s.videoTracks[a.ti || 0].clips, f = fd(s);
    for (var j = 1; j < cl.numItems; j++) if (Math.abs(cl[j - 1].end.seconds - cl[j].start.seconds) < f * 0.6) out.push({ t: cl[j].start.seconds, ti: a.ti || 0, A: cl[j - 1].nodeId, B: cl[j].nodeId, aStart: cl[j - 1].start.seconds, bEnd: cl[j].end.seconds, fd: f });
    return out;
  };
  /* drag placeholders dropped on the timeline */
  KFX.takeDrops = function () {
    var s = app.project.activeSequence; if (!s) return [];
    var out = [], ts = s.videoTracks;
    for (var i = 0; i < ts.numTracks; i++) {
      var cl = ts[i].clips;
      for (var j = cl.numItems - 1; j >= 0; j--) {
        var nm = String(cl[j].name);
        if (nm.indexOf('KFX_TR_') === 0) {
          out.push({ id: nm.replace(/^KFX_TR_/, '').replace(/\.png$/i, ''), t: cl[j].start.seconds, ti: i });
          cl[j].remove(0, 0);
        }
      }
    }
    return out;
  };
  /* remove non-intrinsic effects (QE) */
  var KEEPV = { 'Motion': 1, 'Opacity': 1, 'Time Remapping': 1, 'Hareket': 1, 'Opaklık': 1, 'Zamanı Yeniden Eşleme': 1 };
  var KEEPA = { 'Volume': 1, 'Channel Volume': 1, 'Panner': 1, 'Ses Düzeyi': 1, 'Kanal Ses Düzeyi': 1, 'Kaydırıcı': 1 };
  function isProcessed(it) { var p = String(mpath(it)).toLowerCase(); return p.indexOf('kurgu fx\\processed') >= 0 || p.indexOf('kurgu fx\\clean') >= 0 || p.indexOf('kurgu fx/processed') >= 0 || p.indexOf('kurgu fx/clean') >= 0; }
  /* undo rendered/cleaned copies: remove copy, re-enable originals underneath */
  function restoreAudio(s, sel) {
    var restored = 0, removed = 0, i, t, j, ts = s.audioTracks;
    var spans = [];
    for (i = 0; i < sel.length; i++) spans.push([sel[i].item.start.seconds, sel[i].item.end.seconds]);
    for (i = 0; i < spans.length; i++) {
      var a0 = spans[i][0] + 1e-3, b0 = spans[i][1] - 1e-3;
      for (t = 0; t < ts.numTracks; t++) {
        var cl = ts[t].clips;
        for (j = cl.numItems - 1; j >= 0; j--) {
          var it = cl[j]; if (it.start.seconds >= b0 || it.end.seconds <= a0) continue;
          if (isProcessed(it)) { it.remove(0, 0); removed++; }
          else if (it.disabled) { it.disabled = false; restored++; }
        }
      }
    }
    return { restored: restored, copies: removed };
  }
  KFX.removeFx = function (a) {
    var s = S(), sel = a.audio ? audioTargets(s) : selection(s, 'video'), n = 0, rs = null;
    if (a.audio) {
      var hasCopy = false;
      for (var z = 0; z < sel.length; z++) if (isProcessed(sel[z].item) || sel[z].item.disabled) hasCopy = true;
      if (hasCopy) { rs = restoreAudio(s, sel); try { sel = audioTargets(s); } catch (e) { sel = []; } }
    }
    if (!sel.length && !rs) throw new Error('Önce klip seç.');
    var keep = a.audio ? KEEPA : KEEPV;
    for (var i = 0; i < sel.length; i++) {
      var qi = qeItem(sel[i]);
      var cnt = qi.numComponents;
      for (var k = cnt - 1; k >= 0; k--) {
        var cp = qi.getComponentAt(k);
        if (!cp || keep[cp.name]) continue;
        if (a.only && String(cp.name).indexOf(a.only) < 0) continue;
        try { cp.remove(); n++; } catch (e) { }
      }
    }
    return { removed: n, restored: rs ? rs.restored : 0, copies: rs ? rs.copies : 0 };
  };
  /* audio presets with real values (filters: v = sqrt(Hz / 19950)) */
  function hz(f) { return Math.sqrt(Math.max(20, Math.min(19950, f)) / 19950); }
  KFX.audioPreset = function (a) {
    var s = S(), tg = audioTargets(s), done = 0, warn = [];
    for (var i = 0; i < tg.length; i++) {
      for (var c = 0; c < a.chain.length; c++) {
        var st = a.chain[c];
        try {
          var comp = addAFx(tg[i], st.names);
          var p = comp.properties;
          for (var k in st.set) {
            if (!st.set.hasOwnProperty(k)) continue;
            var v = st.set[k], target = null;
            for (var j = 0; j < p.numItems; j++) if (String(p[j].displayName).toLowerCase() === k.toLowerCase()) target = p[j];
            if (!target) for (j = 0; j < p.numItems; j++) if (String(p[j].displayName).toLowerCase().indexOf(k.toLowerCase()) >= 0) target = p[j];
            if (!target) continue;
            if (st.hz && st.hz[k]) v = hz(v);
            if (st.db && st.db[k]) v = dbToLevel(v);
            target.setValue(v, 1);
          }
        } catch (e) { warn.push(String(e.message || e)); }
      }
      done++;
    }
    return { clips: done, warn: warn };
  };
  /* replace selected audio clips with processed files (aligned) */
  KFX.audioJobs = function () {
    var s = S(), tg = audioTargets(s), out = [];
    for (var i = 0; i < tg.length; i++) { var c = clipInfo(tg[i]); out.push(c); }
    return out;
  };
  KFX.placeProcessed = function (a) {
    // a.items: [{id, path, srcStart(sec in processed file that corresponds to clip inPoint)}], a.mute original
    var s = S(), bin = getBin(a.bin || 'KURGU FX Temiz Ses'), placed = 0, track = -1;
    var minS = 1e9, maxE = 0, fs = [];
    for (var i = 0; i < a.items.length; i++) { var f = findNode(s, a.items[i].id); fs.push(f); if (f) { minS = Math.min(minS, f.item.start.seconds); maxE = Math.max(maxE, f.item.end.seconds); } }
    track = a.track >= 0 ? a.track : pickAudioTrack(s, minS, maxE, false);
    s = app.project.activeSequence;
    for (i = 0; i < a.items.length; i++) {
      var x = a.items[i], fi = fs[i]; if (!fi) continue;
      var pi = importTo(bin, x.path, false);
      var inS = x.off, outS = x.off + (fi.item.end.seconds - fi.item.start.seconds);
      pi.setInPoint(T(inS).ticks, 4); pi.setOutPoint(T(outS).ticks, 4);
      s.audioTracks[track].overwriteClip(pi, T(fi.item.start.seconds));
      try { pi.clearInPoint(4); pi.clearOutPoint(4); } catch (e) { }
      if (a.mute) { try { fi.item.disabled = true; } catch (e) { } }
      placed++;
    }
    return { placed: placed, track: track + 1 };
  };
  KFX.ping = function () { return { version: app.version, project: app.project ? app.project.name : '' }; };
})();
