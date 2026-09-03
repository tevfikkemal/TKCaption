/**
 * TK Caption paneli — teshis ve caption API yoklamasi.
 *
 * Bu ilk surumun tek amaci planin en riskli adimini olcmek:
 * Premiere'in bu surumunde altyazi pistlerine betikle erisilebiliyor mu?
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var log = [];
  var NL = String.fromCharCode(10); // uretilen kodda kacis sorunu yasamamak icin

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  function setStatus(msg) { $('status').textContent = msg || ''; }

  /**
   * Bir yolu ExtendScript string sabitine guvenle gomer.
   *
   * DIKKAT: Yolu duz egik cizgiye CEVIRMEYIN. exportAsMediaDirect yerel
   * Windows yolu ister; "C:/..." verildiginde "Unable to initialize export!"
   * hatasi doner, "C:\..." ile calisir. Bu yuzden ters egik cizgiyi koruyup
   * yalnizca ExtendScript kaynak kodu icin kacisliyoruz.
   */
  function esPath(p) {
    return String(p).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /** Kopruden gelen deger dizi de olabilir, dizi-string de. Ikisini de kabul et. */
  function asArray(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v) {
      try { var p = JSON.parse(v); return Array.isArray(p) ? p : [v]; } catch (e) { return [v]; }
    }
    return [];
  }

  function field(id, text, cls) {
    var el = $(id);
    el.textContent = text;
    el.className = cls || '';
  }

  function show(id, html) {
    var el = $(id);
    el.hidden = false;
    el.innerHTML = html;
    log.push(el.textContent);
  }

  function fmtTimecode(sec, fps) {
    if (!isFinite(sec) || !isFinite(fps) || fps <= 0) return '—';
    var f = Math.round(sec * fps);
    var ff = f % Math.round(fps);
    var t = Math.floor(f / fps);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(Math.floor(t / 3600)) + ':' + pad(Math.floor(t / 60) % 60) + ':' +
           pad(t % 60) + ':' + pad(ff);
  }

  /* ---------------------------------------------------------------- */
  /*  Node tarafi — CEP'in KENDI Node'u                                */
  /* ---------------------------------------------------------------- */

  // Kullanicinin makinesinde Node kurulu olmasi GEREKMEZ; CEP kendi
  // Node'unu getirir. Bu yuzden CLI'yi disaridan spawn etmiyoruz,
  // cekirdek modullerini dogrudan require ediyoruz.
  var nodeReq = (typeof window.require === 'function') ? window.require : null;
  var npath = nodeReq ? nodeReq('path') : null;
  var nfs = nodeReq ? nodeReq('fs') : null;
  var nos = nodeReq ? nodeReq('os') : null;

  var coreDir = null;

  /**
   * core/ klasorunu bulur.
   * Gelistirmede panel bir junction uzerinden gorunur; "../core" junction
   * yolu uzerinde calisir ve yanlis yere bakar. realpathSync junction'i
   * gercek hedefine cozer, boylece hem gelistirme hem dagitim yerlesimi tutar.
   */
  var coreSearchLog = [];

  function resolveCore() {
    if (coreDir) return coreDir;
    coreSearchLog = [];
    if (!nodeReq) { coreSearchLog.push('Node.js kapalı'); return null; }

    var ext = CEP.extensionPath();
    coreSearchLog.push('eklenti yolu: ' + (ext || '(alınamadı)'));
    if (!ext) return null;

    var real = ext;
    try {
      real = nfs.realpathSync(ext);
      if (real !== ext) coreSearchLog.push('junction çözüldü: ' + real);
    } catch (e) {
      coreSearchLog.push('realpath başarısız: ' + e.message);
    }

    var candidates = [
      npath.join(real, 'core'),          // dagitim: core/ eklentinin icinde
      npath.join(real, '..', 'core')     // gelistirme: depo kokunde
    ];
    for (var i = 0; i < candidates.length; i++) {
      var probe = npath.join(candidates[i], 'src', 'pipeline.js');
      var found = false;
      try { found = nfs.existsSync(probe); } catch (e) {}
      coreSearchLog.push((found ? 'BULUNDU  ' : 'yok      ') + probe);
      if (found) { coreDir = candidates[i]; return coreDir; }
    }
    return null;
  }

  /* ---------------------------------------------------------------- */
  /*  Ortam kontrolu                                                   */
  /* ---------------------------------------------------------------- */

  function checkEnvironment() {
    if (!CEP.available()) {
      field('envCep', 'yok — panel Premiere içinde açılmalı', 'err');
      field('envNode', '—', 'dim');
      field('envHost', '—', 'dim');
      field('envBridge', '—', 'dim');
      return;
    }
    field('envCep', 'etkin', 'ok');

    // Node acik mi? --enable-nodejs calismazsa CLI'yi hic calistiramayiz.
    if (CEP.nodeAvailable()) {
      field('envNode', 'v' + CEP.nodeVersion(), 'ok');
    } else {
      field('envNode', 'KAPALI — --enable-nodejs çalışmamış', 'err');
    }

    var host = CEP.hostEnvironment();
    if (host) {
      field('envHost', (host.appName || 'PPRO') + ' ' + (host.appVersion || '?'), 'ok');
    } else {
      field('envHost', 'okunamadı', 'warn');
    }

    // Cekirdek modulleri bulunuyor mu? Panel acilir acilmaz gorunsun ki
    // "core bulunamadi" hatasi calistirma anina kadar saklanmasin.
    var core = resolveCore();
    if (core) {
      field('envCore', core, 'ok');
    } else {
      field('envCore', 'bulunamadı', 'err');
      $('envCore').title = coreSearchLog.join('\n');
    }

    // Kopru yuklu mu? bridge.jsx ScriptPath uzerinden otomatik yuklenmeli.
    CEP.call('trPing()').then(function (d) {
      field('envBridge', 'v' + d.bridgeVersion +
        (d.hasSequence === true || d.hasSequence === 'true' ? ' · sekans var' : ' · sekans yok'),
        'ok');
    }).catch(function (e) {
      field('envBridge', 'yüklenmedi — ' + e.message, 'err');
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Sekans bilgisi                                                   */
  /* ---------------------------------------------------------------- */

  function readSequence() {
    var btn = $('btnSeq');
    btn.disabled = true;
    setStatus('sekans okunuyor…');
    $('seqHint').hidden = true;

    CEP.call('trGetSequenceInfo()').then(function (d) {
      $('seqInfo').hidden = false;
      $('seqName').textContent = d.name;
      $('seqFps').textContent = Number(d.fps).toFixed(3) + ' fps';
      $('seqZero').textContent = fmtTimecode(Number(d.zeroPointSec), Number(d.fps)) +
        '  (' + Number(d.zeroPointSec).toFixed(2) + ' sn)';
      $('seqDur').textContent = Number(d.durationSec).toFixed(1) + ' sn';
      $('seqTracks').textContent = d.videoTracks + ' video · ' + d.audioTracks + ' ses';

      // Sifirdan farkli baslangic zaman kodu en sik altyazi kaymasi sebebidir.
      if (Number(d.zeroPointSec) > 0.001) {
        var h = $('seqHint');
        h.hidden = false;
        h.textContent = 'Sekans 0’dan başlamıyor. Altyazı üretilirken ' +
          Number(d.zeroPointSec).toFixed(2) + ' saniyelik kayma otomatik uygulanacak — ' +
          'aksi hâlde altyazı sekansa yanlış yere düşerdi.';
      }
      setStatus('');
    }).catch(function (e) {
      show('probeOut', '<span class="err">' + esc(e.message) + '</span>');
      setStatus('hata');
    }).then(function () { btn.disabled = false; });
  }

  /* ---------------------------------------------------------------- */
  /*  Caption API yoklamasi — planin en riskli adimi                    */
  /* ---------------------------------------------------------------- */

  function runProbe() {
    var btn = $('btnProbe');
    btn.disabled = true;
    setStatus('yoklanıyor…');

    CEP.call('trProbeCaptionApi()').then(function (d) {
      // bridge.jsx dizileri JSON'un ICINE ham olarak gomuyor, dolayisiyla
      // dis JSON.parse onlari zaten dizi haline getiriyor. Ikinci kez
      // parse etmek hata firlatir ve gercek bulgulari sessizce yutar.
      var found = asArray(d.found);
      var notes = asArray(d.notes);

      var html = '';
      html += '<h3>Premiere ' + esc(d.appVersion) + '</h3>';
      html += 'QE DOM: ' + (String(d.qeAvailable) === 'true'
        ? '<span class="ok">açık</span>' : '<span class="dim">kapalı</span>') + '\n';

      html += '<h3>Bulunan API üyeleri (' + found.length + ')</h3>';
      if (found.length) {
        for (var i = 0; i < found.length; i++) {
          html += '<span class="ok">+</span> ' + esc(found[i]) + '\n';
        }
      } else {
        html += '<span class="warn">Hiçbir caption API üyesi bulunamadı.</span>\n';
      }

      if (notes.length) {
        html += '<h3>Notlar</h3>';
        for (var j = 0; j < notes.length; j++) {
          html += '<span class="dim">·</span> ' + esc(notes[j]) + '\n';
        }
      }

      // Tam uye dokumu: regex'in kacirdigi bir isim varsa burada gorunur
      var dump = asArray(d.allMembers);
      if (dump.length) {
        html += '<h3>Tüm üyeler (' + dump.length + ')</h3>';
        html += '<span class="dim">' + esc(dump.join('\n')) + '</span>\n';
      }

      // Sonucu koprunun metnine degil, bulgunun kendisine gore yaz —
      // boylece "0 uye bulundu" ile "adaylar bulundu" bir daha celisemez.
      html += '<h3>Sonuç</h3>';
      if (found.length) {
        html += '<span class="ok">' + found.length + ' aday API üyesi bulundu.</span>\n';
        html += '<span class="dim">Varlıkları çalıştıkları anlamına gelmiyor; ' +
                'her biri ayrıca denenmeli.</span>';
      } else {
        html += '<span class="warn">Altyazı pisti API’si bulunamadı.</span>\n';
        html += '<span class="dim">Yarı otomatik yola geçiyoruz: kullanıcı tek tıkla ' +
                'Türkçe altyazısını alır, yalnızca son sürükleme elde kalır.</span>';
      }

      show('probeOut', html);
      setStatus('');
    }).catch(function (e) {
      show('probeOut', '<span class="err">' + esc(e.message) + '</span>');
      setStatus('hata');
    }).then(function () { btn.disabled = false; });
  }

  /* ---------------------------------------------------------------- */
  /*  ASIL AKIS: sekans -> ses -> altyazi -> pist                       */
  /* ---------------------------------------------------------------- */

  var running = false;
  var cancelFn = null;

  function cancelRun() {
    if (cancelFn) {
      appendRun('<span class="warn">iptal ediliyor…</span>');
      cancelFn();
      cancelFn = null;
    }
    $('btnCancel').hidden = true;
  }

  function setBar(pct) {
    $('runBar').hidden = false;
    $('runFill').style.width = Math.round((pct || 0) * 100) + '%';
  }

  function appendRun(html) {
    var el = $('runOut');
    el.hidden = false;
    el.innerHTML += html + '\n';
    el.scrollTop = el.scrollHeight;
  }

  function generate() {
    if (running) return;

    if (!nodeReq) {
      show('runOut', '<span class="err">Node.js açık değil. Panel manifest’indeki ' +
           '--enable-nodejs bayrağı çalışmamış; altyazı üretilemez.</span>');
      return;
    }
    var core = resolveCore();
    if (!core) {
      show('runOut', '<span class="err">core/ klasörü bulunamadı.</span>\n\n' +
           '<span class="dim">Aranan yollar:\n  ' +
           esc(coreSearchLog.join('\n  ')) + '</span>');
      return;
    }

    running = true;
    $('btnRun').disabled = true;
    $('runOut').innerHTML = '';
    $('runOut').hidden = false;
    setBar(0);
    setStatus('çalışıyor…');

    var tmp = npath.join(nos.tmpdir(), 'tkcaption-' + Date.now().toString(36));
    try { nfs.mkdirSync(tmp, { recursive: true }); } catch (e) {}
    var wav = npath.join(tmp, 'sekans.wav');
    var srtPath = npath.join(tmp, 'altyazi.srt');

    var seqInfo = null;

    // 1) Sekans bilgisi — kare hizi ve baslangic zaman kodu
    CEP.call('trGetSequenceInfo()').then(function (d) {
      seqInfo = d;
      appendRun('<span class="dim">sekans:</span> ' + esc(d.name) + '  ' +
                Number(d.fps).toFixed(3) + ' fps  ' +
                Number(d.durationSec).toFixed(1) + ' sn');
      if (Number(d.zeroPointSec) > 0.001) {
        appendRun('<span class="warn">başlangıç TC ' +
                  Number(d.zeroPointSec).toFixed(2) + ' sn — kayma uygulanacak</span>');
      }

      // 2) Sesi disari aktar — preset'ler sirayla denenir
      appendRun('<span class="dim">ses çıkarılıyor… (Premiere bu sırada yanıt vermeyebilir)</span>');
      setBar(0.05);
      return CEP.call('trExportAudioAuto("' + esPath(wav) + '", 0)');
    }).then(function (e) {
      var tries = asArray(e.attempts);
      // Ilk preset tutmadiysa hangilerinin elendigini gormek isteriz
      for (var i = 0; i < tries.length - 1; i++) {
        appendRun('<span class="dim">' + esc(tries[i]) + '</span>');
      }
      appendRun('<span class="ok">ses hazır</span> ' + esc(e.preset) + '  ' +
                (Number(e.bytes) / 1048576).toFixed(1) + ' MB, ' +
                Number(e.elapsedSec).toFixed(1) + ' sn');
      setBar(0.15);

      // 4) Boru hattini CEP'in Node'unda calistir
      var pipeline = nodeReq(npath.join(core, 'src', 'pipeline.js'));
      var configMod = nodeReq(npath.join(core, 'src', 'config.js'));
      var cfg = configMod.load();

      cfg.whisper.model = $('optModel').value;
      cfg.layout.maxCharsPerLine = parseInt($('optChars').value, 10) || 42;
      cfg.layout.maxCps = parseFloat($('optCps').value) || 17;
      cfg.layout.fps = Number(seqInfo.fps) || 25;
      // Zaman kodu kaymasini SRT'nin ICINE yaziyoruz. createCaptionTrack'in
      // ikinci argümaninin anlami belgelenmemis; 0 her durumda gecerli
      // oldugu icin bu yol o belirsizlige bagimli degil.
      cfg.output.timecodeOffsetSec = Number(seqInfo.zeroPointSec) || 0;

      return pipeline.run({
        input: wav,
        out: srtPath,
        cfg: cfg,
        onPhase: function (ph, msg) { appendRun('<span class="dim">' + esc(ph) + ':</span> ' + esc(msg)); },
        onProgress: function (ph, pct) { setBar(0.15 + (pct || 0) * 0.75); },
        // Cozumleme baslayinca iptal kolu gelir; uzun sekanslarda sart
        onCancellable: function (stop) {
          cancelFn = stop;
          $('btnCancel').hidden = false;
        }
      });
    }).then(function (res) {
      setBar(0.95);
      appendRun('<span class="ok">' + res.blocks + ' blok, ' + res.words + ' kelime</span>  ' +
                res.elapsedSec + ' sn (' + res.speedRealtime + 'x)');
      if (res.removed) appendRun('<span class="dim">' + res.removed + ' şüpheli segment atıldı</span>');
      if (res.cpsViolations) {
        appendRun('<span class="warn">' + res.cpsViolations + ' blok okuma hızını aşıyor</span> ' +
                  '<span class="dim">— konuşma hızlıysa bu kaçınılmazdır</span>');
      }

      // 5) Sekansa yerlestir
      return CEP.call('trPlaceCaptions("' + esPath(srtPath) + '")');
    }).then(function (pl) {
      setBar(1);
      if (String(pl.placed) === 'true') {
        appendRun('<span class="ok">Altyazı pisti oluşturuldu.</span>');
      } else {
        appendRun('<span class="warn">SRT projeye alındı ama piste yerleştirilemedi' +
                  (pl.detail ? ': ' + esc(pl.detail) : '') + '</span>');
        appendRun('<span class="dim">Proje panelinden zaman çizelgesine sürükleyebilirsiniz.</span>');
      }
      setStatus('tamam');
    }).catch(function (e) {
      appendRun('<span class="err">HATA: ' + esc(e.message) + '</span>');
      setStatus('hata');
    }).then(function () {
      running = false;
      cancelFn = null;
      $('btnCancel').hidden = true;
      $('btnRun').disabled = false;
    });
  }

  /* ---------------------------------------------------------------- */
  /*  createCaptionTrack imza deneyi                                   */
  /* ---------------------------------------------------------------- */

  function testCaptionTrack() {
    var btn = $('btnCaption');
    btn.disabled = true;
    setStatus('deneniyor…');

    CEP.call('trTestCaptionTrack("")').then(function (d) {
      var attempts = asArray(d.attempts);
      var html = '';

      html += '<h3>Fonksiyon</h3>';
      html += 'beklenen argüman sayısı: ' + esc(d.arity) + '\n';
      if (d.source) html += '<span class="dim">' + esc(d.source) + '</span>\n';
      if (d.itemName) html += 'içeri alınan öğe: ' + esc(d.itemName) + '\n';

      html += '<h3>Denemeler (' + attempts.length + ')</h3>';
      for (var i = 0; i < attempts.length; i++) {
        var a = attempts[i];
        var cls = a.indexOf('OK ') === 0 ? 'ok' : 'err';
        html += '<span class="' + cls + '">' + esc(a) + '</span>\n';
      }

      html += '<h3>Sonuç</h3>';
      if (d.success) {
        html += '<span class="ok">Çalışan imza: ' + esc(d.success) + '</span>\n';
        html += '<span class="dim">Tam otomasyon mümkün. Altyazı pisti oluşturulup ' +
                'SRT doğrudan yerleştirilebilir.</span>';
      } else {
        html += '<span class="warn">Hiçbir bileşim işe yaramadı.</span>\n';
        html += '<span class="dim">Hata mesajları doğru argüman türünü gösteriyor olabilir; ' +
                'yukarıdaki metinler bir sonraki denemeyi yönlendirecek.</span>';
      }

      show('captionOut', html);
      setStatus('');
    }).catch(function (e) {
      show('captionOut', '<span class="err">' + esc(e.message) + '</span>');
      setStatus('hata');
    }).then(function () { btn.disabled = false; });
  }


  /* ---------------------------------------------------------------- */
  /*  Disa aktarma teshisi                                             */
  /* ---------------------------------------------------------------- */

  function probeExport() {
    var btn = $('btnExportProbe');
    btn.disabled = true;
    setStatus('teşhis çalışıyor…');

    CEP.call('trProbeExport()').then(function (d) {
      var info = asArray(d.info);
      var attempts = asArray(d.attempts);
      var html = '<h3>Ortam</h3>';
      for (var i = 0; i < info.length; i++) {
        var cls = /HAYIR|YOK/.test(info[i]) ? 'err' : 'dim';
        html += '<span class="' + cls + '">' + esc(info[i]) + '</span>' + NL;
      }
      html += '<h3>exportAsMediaDirect denemeleri (' + attempts.length + ')</h3>';
      if (!attempts.length) html += '<span class="warn">hiç deneme yapılamadı</span>' + NL;
      for (var j = 0; j < attempts.length; j++) {
        var c2 = attempts[j].indexOf('OK ') === 0 ? 'ok' : 'err';
        html += '<span class="' + c2 + '">' + esc(attempts[j]) + '</span>' + NL;
      }
      show('presetOut', html);
      setStatus('');
    }).catch(function (e) {
      show('presetOut', '<span class="err">' + esc(e.message) + '</span>');
      setStatus('hata');
    }).then(function () { btn.disabled = false; });
  }

  /* ---------------------------------------------------------------- */
  /*  Preset listesi                                                   */
  /* ---------------------------------------------------------------- */

  function listPresets() {
    var btn = $('btnPresets');
    btn.disabled = true;
    setStatus('preset’ler taranıyor…');

    // Premiere'in kendi preset klasoru + kullanicinin Documents altindaki
    var paths = [
      'C:/Program Files/Adobe/Adobe Premiere Pro 2026/Settings/EncoderPresets',
      'C:/Program Files/Adobe/Adobe Media Encoder 2026/MediaIO/systempresets'
    ];

    var results = [];
    var chain = Promise.resolve();
    paths.forEach(function (p) {
      chain = chain.then(function () {
        return CEP.call('trListPresets("' + p.replace(/"/g, '\\"') + '")')
          .then(function (d) {
            var list = [];
            try { list = JSON.parse(d.presets); } catch (e) {}
            results.push({ folder: p, presets: list });
          })
          .catch(function (e) { results.push({ folder: p, error: e.message }); });
      });
    });

    chain.then(function () {
      var html = '';
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        html += '<h3>' + esc(r.folder.split('/').pop()) + '</h3>';
        if (r.error) { html += '<span class="dim">' + esc(r.error) + '</span>\n'; continue; }
        // Ses iceren preset'leri one cikar
        var audio = r.presets.filter(function (n) { return /wav|aiff|audio|ses|mp3|aac/i.test(n); });
        if (audio.length) {
          html += '<span class="ok">Ses preset’leri:</span>\n';
          for (var j = 0; j < audio.length; j++) html += '  ' + esc(audio[j]) + '\n';
        } else {
          html += '<span class="dim">' + r.presets.length + ' preset, ses-only yok</span>\n';
        }
      }
      html += '<h3>Not</h3><span class="dim">Ses-only WAV preset’i bulunamazsa ' +
              'Media Encoder’da bir kez oluşturup depoya koyacağız.</span>';
      show('presetOut', html);
      setStatus('');
      btn.disabled = false;
    });
  }

  /* ---------------------------------------------------------------- */

  function copyAll() {
    var text = log.join('\n\n');
    var host = CEP.hostEnvironment();
    text = 'TK Caption teşhis raporu\n' +
           (host ? host.appName + ' ' + host.appVersion + '\n' : '') +
           'Node: ' + (CEP.nodeVersion() || 'yok') + '\n\n' + text;
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setStatus('kopyalandı');
      setTimeout(function () { setStatus(''); }, 2000);
    } catch (e) { setStatus('kopyalanamadı'); }
  }

  document.addEventListener('DOMContentLoaded', function () {
    checkEnvironment();
    $('btnRun').addEventListener('click', generate);
    $('btnCancel').addEventListener('click', cancelRun);
    $('btnSeq').addEventListener('click', readSequence);
    $('btnProbe').addEventListener('click', runProbe);
    $('btnCaption').addEventListener('click', testCaptionTrack);
    $('btnExportProbe').addEventListener('click', probeExport);
    $('btnPresets').addEventListener('click', listPresets);
    $('btnCopy').addEventListener('click', copyAll);
  });
}());
