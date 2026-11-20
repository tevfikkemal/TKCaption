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
  /* Hazir stillerin kurulum sonucu — tanilamada gosteriliyor. */
  var stilDurum = 'henüz denenmedi';
  var NL = String.fromCharCode(10); // uretilen kodda kacis sorunu yasamamak icin

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  /* Ayri bir durum satiri yok; kisa bildirimler sekans satirinda gorunuyor. */
  function setStatus(msg) {
    var el = $('seqMeta');
    if (el && msg) el.textContent = msg;
  }

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

  // Arayuz sadelestirilirken bir alan kaldirilirsa panel calisma aninda
  // patlamasin diye tum alan erisimleri null-guvenli.
  function field(id, text, cls) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = cls || '';
  }

  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
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
  var MAC = /Mac/i.test((typeof navigator !== 'undefined' && navigator.platform) || '');

  var coreDir = null;

  /* ---------------------------------------------------------------- */
  /*  TK Caption Pro                                                   */
  /* ---------------------------------------------------------------- */

  /*
   * Pro kodu ucretsiz pakette YOK. Eklenti klasorunde pro/pro.js varsa
   * (Pro kurulumu) okunup bu kapsamda calistirilir; yoksa Pro sekmeleri
   * kilitli gorunur ve tiklaninca tanitim sayfasi acilir.
   */
  var PRO = { acik: false };

  function proKlasoru() {
    var ext = CEP.extensionPath();
    if (!ext || !nfs) return null;
    var real = ext;
    try { real = nfs.realpathSync(ext); } catch (e) {}
    var p = npath.join(real, 'pro');
    try { return nfs.existsSync(npath.join(p, 'pro.js')) ? p : null; } catch (e) { return null; }
  }

  function proYukle() {
    var kok = proKlasoru();
    if (kok) {
      try {
        var kaynak = nfs.readFileSync(npath.join(kok, 'pro.js'), 'utf8');
        // Dogrudan eval: Pro kodu bu kapsamin yardimcilarini kullanir
        eval(kaynak);
      } catch (e) {
        PRO.acik = false;
        PRO.hata = e.message;
        console.error('Pro yuklenemedi', e);
      }
    }
    proKilitYansit();
  }

  /** Pro sekmelerine kilit rozeti; altyazidaki Grafik secenegi */
  function proKilitYansit() {
    var sekmeler = document.querySelectorAll('[data-pro]');
    for (var i = 0; i < sekmeler.length; i++) {
      var el = sekmeler[i];
      el.classList.toggle('kilitli', !PRO.acik);
      if (!PRO.acik && !el.querySelector('.prorozet')) {
        var b = document.createElement('b');
        b.className = 'prorozet';
        b.textContent = 'PRO';
        el.appendChild(b);
      }
    }
    var gr = document.querySelector('#targetGrp [data-target="graphic"]');
    if (gr && !PRO.acik) { gr.disabled = true; gr.title = 'Grafik timeline TK Caption Pro\'da'; }
    field('envPro', PRO.acik ? 'Pro' : (PRO.hata ? 'Ücretsiz (Pro yüklenemedi: ' + PRO.hata + ')' : 'Ücretsiz'),
          PRO.acik ? 'ok' : '');
  }
  window.TK_COREDIR = function () { return resolveCore(); };

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
      if ($('envCore')) $('envCore').title = coreSearchLog.join('\n');
    }

    // Veri klasoru ve model durumu. Ilk calistirmada ~570 MB inecegini
    // kullanici DUGMEYE BASMADAN once bilmeli.
    if (core) {
      try {
        var models = nodeReq(npath.join(core, 'src', 'models.js'));
        field('envData', models.modelsDir(), 'ok');
        // Indirilecek TOPLAM boyutu soyle: model + motor.
        // NVIDIA kartinda CUDA yapisi 640 MB — sadece modeli soylemek
        // kullaniciyi yanlis hazirlar.
        var sel = $('optModel');
        var wanted = sel ? sel.value : 'large-v3-turbo-q5_0';
        var need = 0;
        var parts = [];
        if (!models.modelExists(wanted)) {
          var spec = models.MODELS[wanted];
          if (spec) { need += spec.mb; parts.push('model'); }
        }
        var variant = models.recommendVariant();
        if (!models.findExe(npath.join(models.binDir(), variant)) &&
            !models.findExe(models.binDir())) {
          var bspec = models.BINARIES[variant];
          if (bspec) { need += bspec.mb; parts.push('motor'); }
        }
        if (need > 0) {
          var fr = $('firstRun');
          if (fr) fr.hidden = false;
          setText('firstRunSize', '~' + (need >= 1024
            ? (need / 1024).toFixed(1) + ' GB'
            : need + ' MB'));
        }
      } catch (e) {
        field('envData', 'okunamadı — ' + e.message, 'warn');
      }
    }

    // Hazir altyazi stillerini Premiere'in stil klasorune koy.
    // Sessiz: basarisiz olsa bile panelin isi bundan etkilenmiyor, ama
    // sonucu tanilamada gorunur tutuyoruz ki "stiller gelmedi" dendiginde
    // sebebi arayabilelim.
    (function () {
      var ext = CEP.extensionPath();
      if (!ext) { stilDurum = 'eklenti yolu alınamadı'; return; }
      var dir = ext + '/styles';
      CEP.call('trInstallTextStyles("' + esPath(dir) + '")').then(function (r) {
        stilDurum = r.copied + ' kopyalandı, ' + r.skipped + ' zaten vardı — ' + r.dir;
      }).catch(function (e) {
        stilDurum = 'kurulamadı: ' + (e && e.message ? e.message : e);
      });
    })();

    // Kopru yuklu mu? bridge.jsx ScriptPath uzerinden otomatik yuklenmeli.
    CEP.call('trPing()').then(function (d) {
      setText('ver', 'v' + d.bridgeVersion);
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

  /**
   * @param {boolean} [auto] panel acilirken kendiliginden cagrildi mi?
   *   Acilista sekans yoksa bu bir hata degildir; kullaniciya kirmizi
   *   mesaj gostermek yerine sessizce geciyoruz.
   */
  /**
   * Sekans ozeti — tek satir: ad, cozunurluk, kare hizi, sure.
   * Ayri bir kart yerine baslik altinda duruyor; calistirmadan once neyin
   * islenecegini gostermek icin bu kadari yetiyor.
   */
  /*
   * OTOMATIK TAZELEME
   *
   * Premiere, sekans degistiginde ya da In/Out isaretlendiginde CEP
   * paneline haber vermiyor; panel bayat bilgi gosteriyor ve kullanici
   * her seferinde "yenile"ye basmak zorunda kaliyordu.
   *
   * Cozum: panel odagi geri aldiginda kendisi okuyor. Kullanicinin akisi
   * zaten "Premiere'de isaretle -> panele don" oldugu icin bu an tam
   * dogru an. Polling yapmiyoruz — panel gorunmezken bile Premiere'i
   * saniyede bir mesgul etmenin anlami yok.
   *
   * Cok sik cagirmayi engellemek icin kisa bir bekleme var: Premiere
   * odak degisimlerinde arka arkaya birkac olay gonderebiliyor.
   */
  var sonTazeleme = 0;
  var sonImza = null;
  var imzaTimer = null;

  function tazeleGerekirse() {
    var simdi = new Date().getTime();
    if (simdi - sonTazeleme < 400) return;
    sonTazeleme = simdi;
    readSequence(true);
  }

  /**
   * Sekans degisimini yakalamak icin UCUZ yoklama.
   *
   * Onceden yalnizca focus olayina guveniyorduk ama CEP panelinde o olay
   * her zaman gelmiyor: kullanici Premiere'de In/Out isaretleyip panele
   * donunce panel hala eski bilgiyi gosteriyordu ve elle "yenile"
   * gerekiyordu.
   *
   * Simdi saniyede bir kez KISA bir imza okunuyor (sekans kimligi,
   * In/Out, timeline sayilari). Imza degismediyse hicbir sey yapilmiyor;
   * degistiyse tam bilgi bir kez aliniyor. Tam okuma pahali olan taraf —
   * ses timeline'larini gezip klip sayiyor — ve artik yalnizca gerekince
   * calisiyor.
   *
   * Panel gorunmezken yoklama duruyor: arkada Premiere'i mesgul etmenin
   * anlami yok.
   */
  function imzaYokla() {
    if (document.hidden) return;
    // Altyazi uretilirken Premiere zaten mesgul; yoklama sirayi bekler
    if (running) return;
    CEP.call('trSeqSignature()').then(function (r) {
      var imza = String(r.sig || '');
      if (sonImza === null) { sonImza = imza; return; }
      if (imza !== sonImza) {
        sonImza = imza;
        tazeleGerekirse();
      }
    }).catch(function () { /* sekans yok ya da kopru hazir degil */ });
  }

  function yoklamaBaslat() {
    if (imzaTimer) return;
    imzaTimer = window.setInterval(imzaYokla, 1000);
  }
  function yoklamaDurdur() {
    if (!imzaTimer) return;
    window.clearInterval(imzaTimer);
    imzaTimer = null;
  }

  function initAutoRefresh() {
    try {
      window.addEventListener('focus', tazeleGerekirse);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { yoklamaDurdur(); }
        else { yoklamaBaslat(); tazeleGerekirse(); }
      });
      yoklamaBaslat();
    } catch (e) { /* olay baglanamadi: "yenile" dugmesi hep duruyor */ }
  }

  function readSequence(auto) {
    var btn = $('btnSeq');
    if (btn) btn.disabled = true;

    CEP.call('trGetSequenceInfo()').then(function (d) {
      setText('seqName', d.name);
      var parca = [];
      if (Number(d.width) > 0) parca.push(d.width + '×' + d.height);
      parca.push(Number(d.fps).toFixed(d.fps % 1 ? 3 : 0) + ' fps');
      parca.push(Number(d.durationSec).toFixed(0) + ' sn');

      // Sifirdan farkli baslangic zaman kodu en sik altyazi kaymasi
      // sebebidir; sessizce gecmek yerine satirda gosteriyoruz.
      if (Number(d.zeroPointSec) > 0.001) {
        parca.push('başlangıç ' + fmtTimecode(Number(d.zeroPointSec), Number(d.fps)));
      }
      // Ust bardaki hap dar: cozunurlugu basliga (title) birakiyoruz
      setText('seqMeta', parca.slice(1).join(' · '));
      var el = $('seqName');
      if (el) { el.className = 'ellipsis'; el.title = parca.join(' · '); }
      var nokta = $('seqDot');
      if (nokta) nokta.className = 'dot on';
      kapsamiTazele(d);
      if (PRO.zoomPistleriniCiz) PRO.zoomPistleriniCiz(asArray(d.videoList));
    }).catch(function (e) {
      var nokta = $('seqDot');
      if (nokta) nokta.className = 'dot';
      if (!auto) {
        setText('seqName', 'sekans okunamadı');
        setText('seqMeta', e.message);
      }
    }).then(function () {
      if (btn) btn.disabled = false;
    });
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

      html += '<h3>Hazır stiller</h3>';
      html += esc(stilDurum) + '\n';

      html += '<h3>Güncelleme</h3>';
      html += esc(updateDurum) + '\n';

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
        html += '<span class="warn">Altyazı timeline API’si bulunamadı.</span>\n';
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
  /*  Otomatik guncelleme                                              */
  /* ---------------------------------------------------------------- */

  var pendingUpdate = null;
  /* Son guncelleme kontrolunun sonucu — tanilamada gosteriliyor. */
  var updateDurum = 'henüz kontrol edilmedi';


  /** Eklentinin kurulu oldugu gercek klasor (junction cozulmus hali) */
  function extensionRoot() {
    var ext = CEP.extensionPath();
    if (!ext) return null;
    try { return nfs.realpathSync(ext); } catch (e) { return ext; }
  }

  /**
   * Sessizce guncelleme kontrolu.
   *
   * Hata durumunda SESSIZ kaliyoruz: internet yoksa ya da GitHub
   * erisilemiyorsa kullaniciyi uyarmanin anlami yok — eklenti zaten
   * calisiyor. Guncelleme bir kolaylik, zorunluluk degil.
   */
  function checkUpdate() {
    var core = resolveCore();
    if (!core || !nodeReq) { updateDurum = 'çekirdek bulunamadı'; return; }
    var root = extensionRoot();
    if (!root) { updateDurum = 'eklenti klasörü bulunamadı'; return; }

    var updater;
    try {
      updater = nodeReq(npath.join(core, 'src', 'updater.js'));
    } catch (e) {
      updateDurum = 'updater yüklenemedi: ' + e.message;
      return;
    }

    updateDurum = 'kontrol ediliyor…';
    updater.check(root).then(function (r) {
      updateDurum = (r.apiLimit ? '[GitHub saatlik istek limiti doldu — birkaç dakika sonra] ' : '') +
        'kurulu v' + r.current + ' / depoda v' + r.latest +
        (r.available ? ' — güncelleme var' : ' — güncel') +
        (r.writable === false ? ' (klasör yazılamıyor, yetki istenecek)' : '');
      if (!r.available) return;
      pendingUpdate = { root: root, updater: updater, manifest: r };
      var box = $('updateBox');
      if (box) box.hidden = false;
      setText('updateTitle', 'Yeni sürüm: v' + r.latest);
      var not = r.notes ||
        ('Şu an v' + r.current + ' kullanıyorsunuz. Güncelleme ' +
         r.files.length + ' dosyayı yeniler; Premiere’i yeniden başlatmanız gerekir.');
      // ZXP ile sistem klasorune kurulduysa yazma yetkisi yok; kullanici
      // UAC istemiyle karsilasacagini onceden bilsin.
      if (r.writable === false) not += MAC ? ' Mac yönetici parolası isteyecek.' : ' Windows yönetici izni isteyecek.';
      setText('updateNote', not);
    }).catch(function (e) {
      // Sessizce yutmak, "guncelleme cikmadi" dendiginde sebebi
      // gormemize engel oluyordu. Kutuyu acmiyoruz (internetsiz makinede
      // her acilista hata gostermek dogru degil) ama tanilamaya yaziyoruz.
      updateDurum = 'kontrol edilemedi: ' + (e && e.message ? e.message : e);
    });
  }

  function runUpdate() {
    if (!pendingUpdate) return;
    var btn = $('btnUpdate');
    btn.disabled = true;
    $('updateBar').hidden = false;
    setText('updateNote', 'İndiriliyor…');

    var u = pendingUpdate;
    u.updater.apply(u.root, u.manifest, function (p) {
      var pct = p.total ? p.done / p.total : 0;
      $('updateFill').style.width = Math.round(pct * 100) + '%';
      if (p.phase === 'yetki') {
        // UAC penceresi acilirken panel donmus gorunur; ne bekledigini yaz.
        setText('updateNote', MAC ? 'Mac parola penceresi açılıyor — parolanızı girin.'
          : 'Windows yetki penceresi açılıyor — “Evet” deyin.');
      } else if (p.file) {
        setText('updateNote', 'İndiriliyor: ' + p.file);
      }
    }).then(function (res) {
      setText('updateTitle', 'v' + res.version + ' kuruldu');
      setText('updateNote',
        res.updated + ' dosya güncellendi. Uygulamak için sağ üstteki ' +
        'yenileme düğmesine basın — Premiere’i kapatmanız gerekmez.');
      btn.hidden = true;
    }).catch(function (e) {
      setText('updateNote', e.message);
      btn.disabled = false;
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Kapsam — hangi aralik, hangi ses pistleri                        */
  /* ---------------------------------------------------------------- */

  /*
   * ARALIK: "Tüm sekans" ya da "In → Out". Ikincisi yalnizca sekansta
   * isaret varsa aciliyor; isaretsizken dugmeyi tiklanabilir birakmak
   * kullaniciyi bos bir secime davet ederdi.
   *
   * SES PISTI: exportAsMediaDirect tum miksaji veriyor, tek pist secme
   * secenegi yok. Kopru istenmeyen pistleri gecici susturup disari
   * aktariyor ve eski durumlarini aynen geri koyuyor.
   */

  var kapsamHedef = 'caption';   // 'caption' = altyazi timeline, 'graphic' = grafik timeline
  /* 'auto' = uretince hemen yerlestir, 'manual' = once listede goster.
     Ayarlar'a gomuluyken bulunamiyordu; kapsam satirina alindi. */
  var kapsamYerlestirme = 'auto';
  var kapsamAralik = 'entire';   // 'entire' | 'inout'
  var kapsamSes = [];            // bos = tumu; dolu = secili ses timeline indeksleri
  var kapsamBicim = 0;           // blok basina en cok kelime; 0 = klasik
  var kapsamDil = 'tr';          // 'tr' | 'en' (ceviri)
  var sonSeqBilgi = null;

  /** Bir dugme grubunda verilen degeri secili gosterir (kayitli secimi geri yuklerken) */
  function grupYansit(grp, oznitelik, deger) {
    if (!grp) return;
    var hepsi = grp.querySelectorAll('.mini');
    for (var i = 0; i < hepsi.length; i++) {
      hepsi[i].className = hepsi[i].getAttribute(oznitelik) === String(deger) ? 'mini on' : 'mini';
    }
  }

  var HEDEF_ANAHTAR = 'tkcaption.hedef';

  /** Bir dugme grubunda tek secim; secilen degeri dondurur */
  function grupSecimi(grp, oznitelik, geriCagri) {
    if (!grp) return;
    var dugmeler = grp.querySelectorAll('.mini');
    for (var i = 0; i < dugmeler.length; i++) {
      dugmeler[i].addEventListener('click', function () {
        if (this.disabled) return;
        var hepsi = grp.querySelectorAll('.mini');
        for (var j = 0; j < hepsi.length; j++) hepsi[j].className = 'mini';
        this.className = 'mini on';
        geriCagri(this.getAttribute(oznitelik));
      });
    }
  }

  function initScope() {
    grupSecimi($('rangeGrp'), 'data-range', function (v) { kapsamAralik = v; });

    grupSecimi($('placeGrp'), 'data-place', function (v) {
      kapsamYerlestirme = v;
      yerelYaz('tkcaption.yerlestirme', v);
      hedefiYansit();
    });

    grupSecimi($('targetGrp'), 'data-target', function (v) {
      kapsamHedef = v;
      yerelYaz(HEDEF_ANAHTAR, v);
      hedefiYansit();
    });

    // Dil: tr = Turkce altyazi, en = Turkce konusmadan Ingilizce altyazi (ceviri)
    grupSecimi($('dilGrp'), 'data-dil', function (v) {
      kapsamDil = v;
      yerelYaz('tkcaption.dil', v);
      hedefiYansit();
    });
    var kayitliD = yerelOku('tkcaption.dil');
    if (kayitliD === 'en' || kayitliD === 'tr') {
      kapsamDil = kayitliD;
      grupYansit($('dilGrp'), 'data-dil', kayitliD);
    }

    // Bicim: 0 = klasik (iki satir, okuma hizi), 3 = kisa, 1 = tek kelime
    grupSecimi($('capGrp'), 'data-cap', function (v) {
      kapsamBicim = parseInt(v, 10) || 0;
      yerelYaz('tkcaption.bicim', String(kapsamBicim));
    });
    var kayitliB = yerelOku('tkcaption.bicim');
    if (kayitliB === '0' || kayitliB === '1' || kayitliB === '3') {
      kapsamBicim = parseInt(kayitliB, 10);
      grupYansit($('capGrp'), 'data-cap', kayitliB);
    }

    var kayitliY = yerelOku('tkcaption.yerlestirme');
    if (kayitliY === 'manual' || kayitliY === 'auto') {
      kapsamYerlestirme = kayitliY;
      var gy = $('placeGrp');
      if (gy) {
        var hy = gy.querySelectorAll('.mini');
        for (var iy = 0; iy < hy.length; iy++) {
          hy[iy].className = hy[iy].getAttribute('data-place') === kayitliY ? 'mini on' : 'mini';
        }
      }
    }

    // Son secilen hedefi hatirla
    var kayitli = yerelOku(HEDEF_ANAHTAR);
    if (kayitli === 'graphic' && !PRO.acik) kayitli = 'caption';
    if (kayitli === 'graphic' || kayitli === 'caption') {
      kapsamHedef = kayitli;
      var g = $('targetGrp');
      if (g) {
        var hepsi = g.querySelectorAll('.mini');
        for (var i = 0; i < hepsi.length; i++) {
          hepsi[i].className = hepsi[i].getAttribute('data-target') === kayitli
            ? 'mini on' : 'mini';
        }
      }
    }
    hedefiYansit();
  }

  /**
   * Hedef secimini ana eylemin uzerinde gorunur kilar.
   *
   * Grafik timeline secildiginde sablon sart; sablon yoksa kullanici
   * dugmeye basip hata almadan once bunu bilmeli.
   */
  function hedefiYansit() {
    var ipucu = $('runHint');
    if (!ipucu) return;

    if (kapsamHedef === 'graphic') {
      var ad = PRO.mogrtAd ? PRO.mogrtAd() : null;
      ipucu.textContent = ad
        ? 'grafik timeline’a — şablon: ' + ad
        : 'grafik timeline’a — önce Şablonlar’dan şablon seçin';
    } else {
      var mod = kapsamYerlestirme;
      ipucu.textContent = mod === 'manual'
        ? 'altyazı timeline’ına — önce listede gösterilir, Yerleştir’e basınca konur'
        : 'altyazı timeline’ına — kapatılabilir altyazı';
    }
  }

  /** Sekans bilgisi gelince aralik dugmesini ve ses pistlerini tazeler */
  function kapsamiTazele(d) {
    sonSeqBilgi = d;

    /*
     * In/Out dugmesi HER ZAMAN tiklanabilir.
     *
     * Once isaret yokken disabled yapiyorduk ve secimi sessizce tum
     * sekansa dusuruyorduk. Ikisi de yanlis cikti: kullanici dugmeye
     * bastigini saniyor, panel ona "tamam" diyor ama arkada tum sekans
     * isleniyordu. Kullanicinin secimini geri almak yerine durumu
     * yaziyoruz; ne oldugunu gormesi daha iyi.
     */
    var btn = $('btnInOut');
    if (btn) {
      btn.disabled = false;
      var varMi = String(d.hasInOut) === 'true';
      if (varMi) {
        var uz = Number(d.outSec) - Number(d.inSec);
        btn.textContent = 'In → Out (' + uz.toFixed(0) + ' sn)';
        btn.title = 'In ' + Number(d.inSec).toFixed(2) + ' sn → Out ' +
                    Number(d.outSec).toFixed(2) + ' sn';
      } else {
        btn.textContent = 'In → Out (işaret yok)';
        btn.title = 'Sekansta In/Out işareti okunamadı — Premiere tüm sekansı işleyebilir.';
      }
    }

    sesPistleriniCiz(asArray(d.audioList));
  }

  /**
   * Ses pisti dugmelerini kurar.
   * Kopruden "ad|klipSayisi|sessizMi" bicimiinde geliyor. Bos pistleri
   * gostermiyoruz — secilecek bir sey yok, yalnizca kalabalik yapardi.
   */
  function sesPistleriniCiz(liste) {
    var grp = $('audioGrp');
    if (!grp) return;

    var html = '<button class="mini' + (kapsamSes.length ? '' : ' on') +
               '" data-audio="all" type="button">Tümü</button>';

    var gosterilen = 0;
    for (var i = 0; i < liste.length; i++) {
      var p = String(liste[i]).split('|');
      var ad = p[0] || ('A' + (i + 1));
      var klip = parseInt(p[1], 10) || 0;
      if (klip === 0) continue;   // bos pist
      gosterilen++;
      var secili = false;
      for (var s = 0; s < kapsamSes.length; s++) if (kapsamSes[s] === i) secili = true;
      html += '<button class="mini' + (secili ? ' on' : '') +
              '" data-audio="' + i + '" type="button">' + esc(ad) + '</button>';
    }

    // Tek pist varsa secim anlamsiz; satiri hic gostermiyoruz
    var satir = $('audioRow') || grp;
    satir.hidden = gosterilen < 2;
    grp.innerHTML = html;

    var dugmeler = grp.querySelectorAll('.mini');
    for (var d = 0; d < dugmeler.length; d++) {
      dugmeler[d].addEventListener('click', function () {
        var deger = this.getAttribute('data-audio');
        if (deger === 'all') {
          kapsamSes = [];
        } else {
          var idx = parseInt(deger, 10);
          var yeni = [];
          var vardi = false;
          for (var v = 0; v < kapsamSes.length; v++) {
            if (kapsamSes[v] === idx) { vardi = true; continue; }
            yeni.push(kapsamSes[v]);
          }
          if (!vardi) yeni.push(idx);
          kapsamSes = yeni;
        }
        sesPistleriniCiz(liste);
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /*  ALTYAZI LISTESI — gor ve duzenle                                 */
  /* ---------------------------------------------------------------- */

  /*
   * Uretilen altyazilari panelde gosterip metni duzenlemeye aciyoruz.
   * Konusma tanima hicbir zaman kusursuz degil; ozel isimler ve teknik
   * terimler icin kullanicinin dosyayi disarida acmasini beklemek
   * gereksiz bir adim.
   *
   * ZAMANLARA DOKUNMUYORUZ. Zaman duzenlemek tek basina bir is: blok
   * cakismasi, minimum sure, okuma hizi kurallarinin hepsini yeniden
   * dogrulamak gerekir. Metin duzenleme bu kurallari bozmaz — satir
   * uzunlugu disinda, onu da uyari olarak gosteriyoruz.
   */

  var subsBloklar = null;
  var subsYol = null;
  var subsDegisti = false;
  /* Her kaydetme YENI bir dosyaya yaziliyor (Premiere ayni yolu yeniden
     okumuyor); sayac ad uretiyor, onceki iz temizlik icin tutuluyor. */
  var subsDuzeltmeNo = 0;
  var subsOncekiDuzeltme = null;

  function subsYukle(srtYolu) {
    var core = resolveCore();
    if (!core || !srtYolu) return;

    try {
      var srtMod = nodeReq(npath.join(core, 'src', 'srt.js'));
      subsBloklar = srtMod.parseSrt(nfs.readFileSync(srtYolu, 'utf8'));
      subsYol = srtYolu;
    } catch (e) {
      return;
    }
    if (!subsBloklar || !subsBloklar.length) return;

    subsDegisti = false;
    subsDuzeltmeNo = 0;
    subsOncekiDuzeltme = null;
    subsCiz();
    $('subsBox').hidden = false;
  }

  function subsCiz() {
    var kap = $('subsList');
    if (!kap || !subsBloklar) return;

    var html = '';
    for (var i = 0; i < subsBloklar.length; i++) {
      var b = subsBloklar[i];
      var metin = b.lines ? b.lines.join('\n') : '';
      html += '<div class="sub" data-i="' + i + '">' +
              '<span class="tm">' + sn2kisa(b.start) + '</span>' +
              '<textarea class="tx" rows="2">' + esc(metin) + '</textarea>' +
              '</div>';
    }
    kap.innerHTML = html;

    var alanlar = kap.querySelectorAll('.tx');
    for (var a = 0; a < alanlar.length; a++) {
      alanlar[a].addEventListener('input', function () {
        var satir = this.parentNode;
        var idx = parseInt(satir.getAttribute('data-i'), 10);
        subsBloklar[idx].lines = this.value.split('\n');
        satir.className = 'sub degisti';
        subsDegisti = true;
        $('btnSubsSave').disabled = false;
        subsBilgiTazele();
      });
    }
    subsBilgiTazele();
  }

  /** Saniyeyi kisa okunur bicime cevirir: 75.4 -> 1:15 */
  function sn2kisa(sn) {
    var t = Math.max(0, Math.floor(Number(sn) || 0));
    var d = Math.floor(t / 60);
    var s = t % 60;
    return d + ':' + (s < 10 ? '0' : '') + s;
  }

  function subsBilgiTazele() {
    if (!subsBloklar) return;
    var sinir = parseInt($('optChars').value, 10) || 42;
    var uzun = 0;
    for (var i = 0; i < subsBloklar.length; i++) {
      var ls = subsBloklar[i].lines || [];
      for (var j = 0; j < ls.length; j++) if (ls[j].length > sinir) uzun++;
    }
    setText('subsInfo', subsBloklar.length + ' blok' +
      (uzun ? '  ·  ' + uzun + ' satır ' + sinir + ' karakteri aşıyor' : '') +
      (subsDegisti ? '  ·  kaydedilmedi' : ''));
  }

  /**
   * Duzenlenen metni dosyaya yazar ve sekansa YENIDEN yerlestirir.
   *
   * Premiere'in altyazi timeline'ina erisemedigimiz icin var olani
   * guncelleyemiyoruz; yeni bir dosya yazip yeniden yerlestiriyoruz.
   * Eskisi sekansta kalir — kullaniciya bunu acikca soyluyoruz, cunku
   * sessizce iki altyazi birden gostermek daha kotu olurdu.
   */
  function subsKaydet() {
    if (!subsBloklar || !subsYol) return;
    var btn = $('btnSubsSave');
    btn.disabled = true;

    var core = resolveCore();
    var srtMod, configMod, cfg;
    try {
      srtMod = nodeReq(npath.join(core, 'src', 'srt.js'));
      configMod = nodeReq(npath.join(core, 'src', 'config.js'));
      cfg = configMod.load();
    } catch (e) {
      subsNot('Çekirdek yüklenemedi: ' + e.message);
      btn.disabled = false;
      return;
    }

    // Bos bloklari atiyoruz: kullanici metni silmisse o altyazi olmamali
    var temiz = [];
    for (var i = 0; i < subsBloklar.length; i++) {
      var ls = (subsBloklar[i].lines || []).filter(function (l) { return l.trim() !== ''; });
      if (!ls.length) continue;
      temiz.push({ start: subsBloklar[i].start, end: subsBloklar[i].end, lines: ls });
    }
    if (!temiz.length) { subsNot('Tüm bloklar boş — kaydedilmedi.'); btn.disabled = false; return; }

    /*
     * DUZENLEME YENI BIR DOSYAYA YAZILIYOR.
     *
     * OLCULEN: app.project.importFiles ayni yolu daha once aldiysa
     * projedeki ESKI kopyayi kullaniyor; diskteki dosya degisse bile
     * yeniden okumuyor. Bu yuzden duzenlenen metin sekansa hic
     * ulasmiyordu — dosya dogruydu, Premiere bakmiyordu.
     *
     * Ayni ada yazip "Premiere tazelesin" beklemek denendi ve olmadi
     * (refreshMedia altyazi ogelerinde sessizce etkisiz). Tek guvenilir
     * yol Premiere'in TANIMADIGI bir ad vermek.
     *
     * Eski duzenleme dosyalarini siliyoruz ki klasor birikmesin; asil
     * uretilen dosyaya dokunmuyoruz.
     */
    var yeniYol = subsYol.replace(/(-d\d+)?(\.[^.]+)$/, '-d' + (++subsDuzeltmeNo) + '$2');
    try {
      // Zaman kodu kaymasi SRT'nin icinde ZATEN var; tekrar eklersek iki
      // kat kayar. parseSrt kaydirilmis zamanlari okudu, oldugu gibi yaziyoruz.
      cfg.output.timecodeOffsetSec = 0;
      srtMod.write(yeniYol, srtMod.toSrt(temiz, cfg), cfg);

      // Bir onceki duzenleme dosyasi artik gereksiz
      if (subsOncekiDuzeltme && subsOncekiDuzeltme !== yeniYol) {
        try { nfs.unlinkSync(subsOncekiDuzeltme); } catch (e) {}
      }
      subsOncekiDuzeltme = yeniYol;
      subsYol = yeniYol;
    } catch (e) {
      subsNot('Yazılamadı: ' + e.message);
      btn.disabled = false;
      return;
    }

    subsDegisti = false;
    subsBilgiTazele();

    var satirlar = $('subsList').querySelectorAll('.sub');
    for (var s = 0; s < satirlar.length; s++) satirlar[s].className = 'sub';

    /*
     * KAYDETME SEKANSA DOKUNMUYOR.
     *
     * OLCULEN: refreshMedia() altyazi ogelerinde hata vermeden calisiyor
     * ama dosyayi tazelemiyor. Panel "guncellendi" diyordu, sekansta
     * hicbir sey degismiyordu — sessiz basarisizlik, en kotu tur.
     *
     * Premiere altyazi timeline'ini betige hic acmadigi icin var olani
     * guncellemenin yolu yok. Geriye iki secenek kaliyor ve ikisi de
     * kullanicinin karari:
     *   - Dosyayi kaydet, sekansa dokunma (Premiere'in kendi altyazi
     *     panelinden duzenlemeye devam edilebilir)
     *   - Yeni bir timeline ekle ve eskisini elle sil
     *
     * Kaydetme artik yalnizca birincisini yapiyor; ikincisi ayri bir
     * dugme. Kullanicinin istemedigi bir seyi varsayilan yapmiyoruz.
     */
    subsNot('Kaydedildi: ' + subsYol.split(/[\\/]/).pop() +
            '  ·  Sekanstaki altyazı değişmedi.');
    $('btnSubsPlace').disabled = false;
  }

  /** Duzenlenen dosyayi sekansa YENI bir altyazi timeline'i olarak koyar */
  function subsYerlestir() {
    if (!subsYol) return;
    var btn = $('btnSubsPlace');
    btn.disabled = true;
    subsNot('yerleştiriliyor…');

    // trReplaceCaptions once ESKI altyazi ogelerini projeden silmeyi
    // deniyor, sonra yenisini koyuyor. Pist silme API'si yok ama ogeyi
    // silmek pisti de bosaltabilir — deneyip sonucu raporluyoruz.
    CEP.call('trReplaceCaptions("' + esPath(subsYol) + '")').then(function (pl) {
      if (String(pl.placed) === 'true') {
        var silinen = Number(pl.deletedItems) || 0;
        var dosyaAdi = subsYol.split(/[\/]/).pop();
        var duzeltme = /-dd+.[^.]+$/.test(dosyaAdi);
        subsNot('Yerleştirildi: ' + esc(dosyaAdi) +
          (silinen ? '  ·  ' + silinen + ' eski altyazı öğesi projeden silindi.'
                   : '  ·  Eski timeline duruyorsa elle silin.'));
      } else {
        subsNot('Yerleştirilemedi; dosyayı proje panelinden sürükleyebilirsiniz.');
        btn.disabled = false;
      }
    }).catch(function (e) {
      subsNot('Yerleştirilemedi: ' + e.message);
      btn.disabled = false;
    });
  }

  function subsNot(msg) {
    var el = $('subsNote');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  /* ---------------------------------------------------------------- */
  /*  Yerel kayit (ucretsiz ve Pro ortak)                             */
  /* ---------------------------------------------------------------- */

  var sonAltyaziYolu = null;   // son uretilen altyazi dosyasi

  function yerelOku(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }
  function yerelYaz(k, v) {
    try { window.localStorage.setItem(k, v); } catch (e) {}
  }

  /* ---------------------------------------------------------------- */
  /*  Sekmeler                                                         */
  /* ---------------------------------------------------------------- */

  var SEKME_ANAHTAR = 'tkcaption.tab';

  /**
   * Uc bolum arasinda gecis. Son secilen sekme hatirlaniyor: panel her
   * acildiginda kullaniciyi ayni yere birakmak, onu her seferinde
   * aradigi bolume gitmeye zorlamaktan iyi.
   */
  function initTabs() {
    var tablar = document.querySelectorAll('.tab');
    if (!tablar.length) return;

    function gec(ad) {
      // Pro yuklu degilse Pro sekmesinin sayfasi yok: tanitim sayfasi acilir
      var kilitli = !$('tab-' + ad);
      for (var i = 0; i < tablar.length; i++) {
        var t = tablar[i];
        var secili = t.getAttribute('data-tab') === ad;
        t.classList.toggle('on', secili);
        var govde = $('tab-' + t.getAttribute('data-tab'));
        if (govde) govde.hidden = !secili;
        if (secili && kilitli) setText('proOzellik', t.textContent.replace('PRO', '').trim());
      }
      var tanitim = $('tab-pro');
      if (tanitim) tanitim.hidden = !kilitli;
      try { window.localStorage.setItem(SEKME_ANAHTAR, ad); } catch (e) {}
    }

    for (var i = 0; i < tablar.length; i++) {
      tablar[i].addEventListener('click', function () {
        gec(this.getAttribute('data-tab'));
      });
    }

    var kayitli = null;
    try { kayitli = window.localStorage.getItem(SEKME_ANAHTAR); } catch (e) {}
    // Eski surumden kalan ya da artik olmayan bir sekme kayitliysa Altyazi'dan basla
    gec(kayitli && $('tab-' + kayitli) ? kayitli : 'alt');
  }

  /** Cip gorunumu onay kutusunu takip etsin (CSS :has'e guvenmiyoruz) */
  function cipleriTazele() {
    var kutular = document.querySelectorAll('.chip input');
    for (var i = 0; i < kutular.length; i++) {
      var lab = kutular[i].parentNode;
      var temel = lab.className.indexOf('subtle') >= 0 ? 'chip subtle' : 'chip';
      lab.className = kutular[i].checked ? temel + ' on' : temel;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Ortak yardimcilar (0.10 araclari)                                */
  /* ---------------------------------------------------------------- */

  /** Bir aracin gunluk kutusu ve ilerleme cubugu */
  function gunluk(outId, barId, fillId) {
    return {
      temizle: function () { var el = $(outId); if (el) { el.innerHTML = ''; el.hidden = true; } },
      yaz: function (html) {
        var el = $(outId);
        if (!el) return;
        el.hidden = false;
        el.innerHTML += html + '\n';
        el.scrollTop = el.scrollHeight;
        log.push(el.textContent);
      },
      bar: function (oran) {
        var b = $(barId), f = $(fillId);
        if (b) b.hidden = oran === null;
        if (f && oran !== null) f.style.width = Math.round(Math.max(0, Math.min(1, oran)) * 100) + '%';
      }
    };
  }

  function hataMetni(e) { return esc((e && e.message) || String(e)); }

  /** Kaydirici dolgusu: secili kisim turkuaz gorunsun */
  function aralikBoya(el) {
    var min = Number(el.min) || 0, max = Number(el.max) || 100;
    var p = max > min ? (Number(el.value) - min) / (max - min) * 100 : 0;
    el.style.setProperty('--p', p.toFixed(1) + '%');
  }
  function aralikBoyaHepsi() {
    var hepsi = document.querySelectorAll('input[type=range]');
    for (var i = 0; i < hepsi.length; i++) {
      aralikBoya(hepsi[i]);
      hepsi[i].addEventListener('input', function () { aralikBoya(this); });
    }
  }

  /**
   * Sekans sesini WAV'a aktarir, 16 kHz'e indirir ve konusma bolgelerini
   * SANIYE olarak dondurur. Auto Cut'in kullandigi yolun aynisi; dolgu ve
   * zoom ayni olcumu paylasiyor.
   *
   * @returns {Promise<{seq, wav, sure, konusma:[{start,end}]}>}
   */
  function sesVeKonusma(etiket, vadAyar, g) {
    var core = resolveCore();
    if (!core) return Promise.reject(new Error('Çekirdek bulunamadı.'));
    var dir = npath.join(nos.tmpdir(), 'tkcaption-' + etiket + '-' + Date.now().toString(36));
    try { nfs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    var wav = npath.join(dir, 'sekans.wav');
    var seq = null;
    return CEP.call('trGetSequenceInfo()').then(function (d) {
      seq = d;
      g.yaz('<span class="dim">sekans:</span> ' + esc(d.name) + '  ' + Number(d.durationSec).toFixed(1) + ' sn');
      g.yaz('<span class="dim">ses çıkarılıyor…</span>');
      g.bar(0.08);
      var sesArg = kapsamSes.length ? kapsamSes.join(',') : '';
      return CEP.call('trExportAudioAuto("' + esPath(wav) + '", 0, "' + sesArg + '")');
    }).then(function () {
      g.bar(0.25);
      var au = nodeReq(npath.join(core, 'src', 'audio.js'));
      var vad = nodeReq(npath.join(core, 'src', 'vad.js'));
      var dec = au.decodeWav(wav);
      var pcm = au.resample(dec.samples, dec.sampleRate, 16000);
      var r = vad.detectSpeech(pcm, 16000, vadAyar || {}) || [];
      var konusma = r.map(function (b) { return { start: b.start / 16000, end: b.end / 16000 }; });
      return { seq: seq, wav: wav, dir: dir, sure: dec.durationSec, konusma: konusma };
    });
  }

  /** Bolgeleri kare izgarasina oturtur; bir kareden kisa olanlari atar */
  function kareyeOtur(bolgeler, fps) {
    var f = Number(fps) || 25;
    var out = [];
    for (var i = 0; i < bolgeler.length; i++) {
      var s = Math.round(bolgeler[i].start * f) / f;
      var e = Math.round(bolgeler[i].end * f) / f;
      if (e - s >= 1 / f - 1e-6) out.push({ start: +s.toFixed(5), end: +e.toFixed(5), ad: bolgeler[i].ad });
    }
    return out;
  }

  function mmss(sn) {
    var t = Math.max(0, sn);
    var m = Math.floor(t / 60);
    var s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  /* ---------------------------------------------------------------- */
  /*  Duz metin                                                        */
  /* ---------------------------------------------------------------- */

  function duzMetin() {
    if (!subsBloklar || !subsBloklar.length) return '';
    try {
      var srtMod = nodeReq(npath.join(resolveCore(), 'src', 'srt.js'));
      return srtMod.toPlainText(subsBloklar);
    } catch (e) { return ''; }
  }

  function panoyaKopyala(metin) {
    var ta = document.createElement('textarea');
    ta.value = metin;
    document.body.appendChild(ta);
    ta.select();
    var ok2 = false;
    try { ok2 = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok2;
  }

  function metniKopyala() {
    var m = duzMetin();
    if (!m) { subsNot('Önce altyazı üretin.'); return; }
    subsNot(panoyaKopyala(m) ? 'Metin panoya kopyalandı.' : 'Kopyalanamadı.');
  }

  function metniKaydet() {
    var m = duzMetin();
    if (!m || !subsYol) { subsNot('Önce altyazı üretin.'); return; }
    var yol = String(subsYol).replace(/(-d\d+)?\.[^.\\\/]+$/, '') + '.txt';
    try {
      // Basta BOM: Not Defteri Turkce karakterleri ancak boyle dogru gosteriyor
      nfs.writeFileSync(yol, '﻿' + m.replace(/\n/g, '\r\n'), 'utf8');
      subsNot('Kaydedildi: ' + yol);
    } catch (e) { subsNot('Kaydedilemedi: ' + e.message); }
  }

  /* ---------------------------------------------------------------- */
  /*  ffmpeg                                                           */
  /* ---------------------------------------------------------------- */

  function ffmpegModul() {
    try { return nodeReq(npath.join(resolveCore(), 'src', 'models.js')); } catch (e) { return null; }
  }

  function ffmpegDurum() {
    var m = ffmpegModul();
    var btn = $('btnFfmpeg');
    if (!m || !m.findFfmpeg) { field('ffDurum', 'çekirdek okunamadı', 'dim'); if (btn) btn.hidden = true; return; }
    var yol = m.findFfmpeg();
    field('ffDurum', yol ? 'hazır' : 'yok', yol ? 'ok' : 'dim');
    if (btn) { btn.hidden = !!yol; btn.disabled = false; btn.textContent = 'İndir'; }
  }

  function ffmpegIndir() {
    var m = ffmpegModul();
    var btn = $('btnFfmpeg');
    if (!m) return;
    btn.disabled = true;
    m.ensureFfmpeg(function (p) {
      if (p.phase === 'download' && p.total) btn.textContent = Math.round(p.pct * 100) + '%';
    }).then(function () {
      ffmpegDurum();
    }).catch(function (e) {
      field('ffDurum', 'indirilemedi: ' + e.message, 'err');
      btn.disabled = false;
      btn.textContent = 'Tekrar dene';
    });
  }

  /** 0.10 araclarinin baglantilari */
  function yeniAraclariBagla() {
    if ($('btnFfmpeg')) $('btnFfmpeg').addEventListener('click', ffmpegIndir);
    ffmpegDurum();
    aralikBoyaHepsi();

    // Cipler: onay kutusu degisince gorunum (CSS :has'e guvenmiyoruz)
    document.addEventListener('change', function (e) {
      if (e.target && e.target.parentNode && /chip/.test(e.target.parentNode.className)) cipleriTazele();
    });

    // Duz metin
    $('btnTxtCopy').addEventListener('click', metniKopyala);
    $('btnTxtSave').addEventListener('click', metniKaydet);
  }

  /* ---------------------------------------------------------------- */
  /*  ASIL AKIS: sekans -> ses -> altyazi -> pist                       */
  /* ---------------------------------------------------------------- */

  var running = false;
  var cancelFn = null;
  var lastResult = null;
  var sonKelimeler = null;   // {seqID, sure, words} — son tum-sekans taramasi

  function cancelRun() {
    if (cancelFn) {
      appendRun('<span class="warn">iptal ediliyor…</span>');
      cancelFn();
      cancelFn = null;
    }
    $('cancelRow').hidden = true;
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
    // SRT gecici degil KALICI: zamanlama sikayetlerinde SRT'nin mi yoksa
    // Premiere'e yerlestirmenin mi hatali oldugunu ancak boyle ayirabiliyoruz.
    var srtPath = npath.join(tmp, 'altyazi.srt');

    var seqInfo = null;

    // 1) Sekans bilgisi — kare hizi ve baslangic zaman kodu
    CEP.call('trGetSequenceInfo()').then(function (d) {
      seqInfo = d;
      // SRT'yi proje klasorune kalici olarak yaz
      var fmt = $('optFormat') ? $('optFormat').value : 'srt';
      // OLCULDU (Premiere 2026): ayni TTML icerigi uc uzantiyla denendi.
      //   .ttml -> "File format not supported" ile REDDEDILIYOR
      //   .dfxp -> kabul ediliyor
      //   .xml  -> Final Cut Pro XML sanilma riski var, kullanmiyoruz
      // Uzanti .ttml kaldigi surece TTML her seferinde reddedilip SRT'ye
      // dusuluyordu; yani kare hizini dosyada tasima cozumu hic devreye
      // girmemisti. Icerik yine TTML, yalnizca uzanti .dfxp.
      var uzanti = fmt === 'ttml' ? '.dfxp' : '.srt';
      // Ceviri dosyasi Turkce altyazinin uzerine yazmasin
      var dosyaAdi = d.name + (kapsamDil === 'en' ? ' EN' : '');
      return CEP.call('trSuggestSrtPath("' + esPath(dosyaAdi) + '", "' + uzanti + '")')
        .then(function (s) { srtPath = s.path; })
        .catch(function () { /* gecici yolda kalir */ })
        .then(function () { return d; });
    }).then(function (d) {
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
      // Aralik: In/Out secildiyse Premiere'in kendi sabitini kullaniyoruz;
      // sabit sayi yazmak belgelenmemis bir varsayim olurdu.
      var aralik = (kapsamAralik === 'inout') ? 1 : 0;
      // Kapsam kararini acikca yaziyoruz: In/Out secili sanilip tum
      // sekansin islendigi bir durum yasandi ve sebebi loga bakilarak
      // ayirt edilemedi (dugme mi kapaliydi, isaret mi okunamadi).
      appendRun('<span class="dim">kapsam:</span> ' + kapsamAralik +
                '  in=' + Number(d.inSec).toFixed(2) +
                '  out=' + Number(d.outSec).toFixed(2) +
                '  isaretVar=' + String(d.hasInOut));
      var sesArg = kapsamSes.length ? kapsamSes.join(',') : '';
      if (kapsamAralik === 'inout') {
        appendRun('<span class="dim">kapsam:</span> In → Out  ' +
                  (Number(d.outSec) - Number(d.inSec)).toFixed(1) + ' sn');
      }
      if (sesArg) appendRun('<span class="dim">ses pistleri:</span> ' + esc(sesArg));
      return CEP.call('trExportAudioAuto("' + esPath(wav) + '", ' + aralik +
                      ', "' + sesArg + '")');
    }).then(function (e) {
      var tries = asArray(e.attempts);
      // Ilk preset tutmadiysa hangilerinin elendigini gormek isteriz
      for (var i = 0; i < tries.length - 1; i++) {
        appendRun('<span class="dim">' + esc(tries[i]) + '</span>');
      }
      appendRun('<span class="ok">ses hazır</span> ' + esc(e.preset) + '  ' +
                (Number(e.bytes) / 1048576).toFixed(1) + ' MB, ' +
                Number(e.elapsedSec).toFixed(1) + ' sn');

      /* SES BEKLENEN KADAR MI?
       *
       * Yanlis aralik turu ile disari aktarilirsa ses beklenenden kisa
       * cikar ve altyazi sekansin kucuk bir bolumune sikisir. Sessizce
       * gecerse sebebi bulmak cok zor — bu yuzden WAV'in gercek suresini
       * okuyup karsilastiriyoruz.
       *
       * ONEMLI: In/Out secildiginde sesin kisa olmasi BEKLENEN durumdur.
       * Onceden burada her durumda sekans suresiyle karsilastiriliyordu
       * ve kullanici bilerek In/Out sectiginde de kirmizi uyari
       * goruyordu — dogru calisan bir islemde yanlis alarm. */
      try {
        var au = nodeReq(npath.join(core, 'src', 'audio.js'));
        var dec = au.decodeWav(wav);
        var seqSec = Number(seqInfo.durationSec) || 0;
        var inout = (kapsamAralik === 'inout');
        var beklenen = inout
          ? Math.max(0, Number(seqInfo.outSec) - Number(seqInfo.inSec))
          : seqSec;

        appendRun('<span class="dim">ses süresi:</span> ' + dec.durationSec.toFixed(1) +
                  ' sn / ' + (inout ? 'seçili aralık ' : 'sekans ') +
                  beklenen.toFixed(1) + ' sn');

        if (beklenen > 1 && dec.durationSec < beklenen * 0.9) {
          appendRun('<span class="err">UYARI: ses beklenenden ' +
            (beklenen - dec.durationSec).toFixed(1) + ' sn kısa. ' +
            (inout
              ? 'In/Out işareti değişmiş olabilir — altyazı eksik kalabilir.'
              : 'Sekansta in/out işareti veya work area sınırı olabilir — ' +
                'altyazı yalnızca bu bölümü kapsayacak.') + '</span>');
        }
      } catch (err) {
        appendRun('<span class="dim">ses süresi okunamadı: ' + esc(err.message) + '</span>');
      }
      setBar(0.15);

      // 4) Boru hattini CEP'in Node'unda calistir
      var pipeline = nodeReq(npath.join(core, 'src', 'pipeline.js'));
      var configMod = nodeReq(npath.join(core, 'src', 'config.js'));
      var cfg = configMod.load();

      cfg.whisper.model = $('optModel').value;
      /* CEVIRI: whisper'in kendi ceviri gorevi — konusma dilinden Ingilizce.
       * Turbo modeller ceviri verisiyle egitilmedi (OpenAI'nin notu), ceviri
       * icin large-v3'e geciyoruz. Turkce'ye ozel son islem (kesme isareti,
       * ozel isim, cumle basi) Ingilizce metni bozar; kapatiyoruz. Baslangic
       * ipucu da Ingilizce olmali, yoksa cikti Turkce'ye kayar. */
      if (kapsamDil === 'en') {
        cfg.whisper.translate = true;
        if (/turbo/.test(cfg.whisper.model)) cfg.whisper.model = 'large-v3-q5_0';
        cfg.whisper.initialPrompt = 'Hello, today I am going to talk about an important topic. Yes, you heard that right.';
        cfg.turkish.enabled = false;
        appendRun('<span class="dim">dil:</span> İngilizce çeviri — model ' + esc(cfg.whisper.model) +
                  ' (ilk kullanımda bir kez ~1 GB iner)');
      }
      cfg.layout.maxCharsPerLine = parseInt($('optChars').value, 10) || 42;
      cfg.layout.maxCps = parseFloat($('optCps').value) || 17;
      cfg.layout.fps = Number(seqInfo.fps) || 25;
      // Kisa / tek kelime bicimi (Reels tarzi). 0 = klasik bolucu.
      cfg.layout.maxWords = kapsamBicim;
      if (kapsamBicim) appendRun('<span class="dim">biçim:</span> blok başına en çok ' + kapsamBicim + ' kelime');
      // Zaman kodu kaymasini SRT'nin ICINE yaziyoruz. createCaptionTrack'in
      // ikinci argümaninin anlami belgelenmemis; 0 her durumda gecerli
      // oldugu icin bu yol o belirsizlige bagimli degil.
      // In/Out disari aktarildiginda WAV 0'dan baslar ama o ses sekansta
      // IN NOKTASINA denk gelir; farki eklemezsek altyazi sekansin basina
      // yigilir. Tum sekansta bu fark sifirdir.
      var inKayma = (kapsamAralik === 'inout') ? (Number(seqInfo.inSec) || 0) : 0;
      cfg.output.timecodeOffsetSec = (Number(seqInfo.zeroPointSec) || 0) + inKayma;
      // TTML kare hizini dosyanin icinde tasir; SRT tasimadigi icin Premiere
      // 30 fps varsayiyor ve 60 fps sekansta altyazi kayiyor.
      cfg.output.format = $('optFormat') ? $('optFormat').value : 'srt';

      return pipeline.run({
        input: wav,
        out: srtPath,
        cfg: cfg,
        onPhase: function (ph, msg) { appendRun('<span class="dim">' + esc(ph) + ':</span> ' + esc(msg)); },
        onProgress: function (ph, pct) { setBar(0.15 + (pct || 0) * 0.75); },
        // Cozumleme baslayinca iptal kolu gelir; uzun sekanslarda sart
        onCancellable: function (stop) {
          cancelFn = stop;
          $('cancelRow').hidden = false;
        }
      });
    }).then(function (res) {
      lastResult = res;
      // Dolgu kesici ayni konusma tanimayi yeniden kullanabilsin. Yalnizca
      // TUM SEKANS taramasi gecerli: In/Out'ta kelime zamanlari aralik
      // basina gore ve sekansin geri kalani hic taranmamis.
      if (res.wordList && kapsamAralik === 'entire') {
        sonKelimeler = { seqID: String(seqInfo.sequenceID), sure: Number(seqInfo.durationSec),
                         words: res.wordList };
      }
      // Stilize altyazi bolumu bu dosyayi okuyup MOGRT olarak dizecek
      sonAltyaziYolu = srtPath;
      subsYukle(srtPath);
      if (PRO.mogrtDurumTazele) PRO.mogrtDurumTazele();
      setBar(0.95);
      appendRun('<span class="ok">' + res.blocks + ' blok, ' + res.words + ' kelime</span>  ' +
                res.elapsedSec + ' sn (' + res.speedRealtime + 'x)');
      if (res.removed) appendRun('<span class="dim">' + res.removed + ' şüpheli segment atıldı</span>');
      if (res.cpsViolations) {
        appendRun('<span class="warn">' + res.cpsViolations + ' blok okuma hızını aşıyor</span> ' +
                  '<span class="dim">— konuşma hızlıysa bu kaçınılmazdır</span>');
      }

      /* Uretilen altyazinin KAPSAMI — zamanlama hatalarini gormenin
       * en hizli yolu. Sekans 10 dakikayken altyazi 1 dakikada bitiyorsa
       * burada aninda gorulur. */
      try {
        var srtMod = nodeReq(npath.join(core, 'src', 'srt.js'));
        var parsed = srtMod.parseSrt(nfs.readFileSync(srtPath, 'utf8'));
        if (parsed.length) {
          var ilk = parsed[0].start;
          var son = parsed[parsed.length - 1].end;
          var seqSec2 = Number(seqInfo.durationSec) || 0;
          appendRun('<span class="dim">altyazı kapsamı:</span> ' +
            ilk.toFixed(1) + ' - ' + son.toFixed(1) + ' sn');
          if (seqSec2 > 5 && son < seqSec2 * 0.7) {
            appendRun('<span class="err">UYARI: altyazı sekansın yalnızca ilk %' +
              Math.round(son / seqSec2 * 100) + "'ini kapsıyor.</span>");
          }
        }
      } catch (err) { /* kapsam bilgisi kritik degil */ }

      // 5) Sekansa yerlestir
      // Iki bicimi de sirayla dene. TTML kare hizini tasir ama Premiere'in
      // hangi uzantiyi altyazi olarak kabul ettigi belirsiz; SRT calisiyor
      // ama kare hizi tasimiyor. Tahmin etmek yerine ikisini de veriyoruz.
      /*
       * ONCE DUZENLE secilmisse burada duruyoruz.
       *
       * Akisin sirasi yanlisti: uret -> yerlestir -> duzenle -> yeniden
       * yerlestir. Premiere altyazi timeline'ini betige acmadigi icin
       * ikinci yerlestirme her zaman YENI bir timeline yaratiyor ve
       * eskisi sekansta kaliyordu. Duzenlemeyi yerlestirmeden ONCE
       * yapinca tek timeline yetiyor.
       */
      var yerlestirmeModu = kapsamYerlestirme;
      if (yerlestirmeModu === 'manual') {
        appendRun('<span class="ok">Altyazı hazır — aşağıdan düzenleyip ' +
                  'Yerleştir düğmesine basın.</span>');
        $('btnSubsPlace').disabled = false;
        return null;
      }

      // Hedef GRAFIK ise altyazi timeline'ina hic dokunmuyoruz; ayni
      // altyazi MOGRT klipleri olarak grafik timeline'a diziliyor.
      if (kapsamHedef === 'graphic') {
        sonAltyaziYolu = srtPath;
        if (!PRO.mogrtYerlestir) throw new Error('Grafik timeline TK Caption Pro\'da.');
        return PRO.mogrtYerlestir().then(function (r) {
          // Ortak rapor bicimi: sonraki adim ikisini de ayni sekilde okur
          return { placed: 'true', grafik: true, konan: r.placed, attempts: [] };
        });
      }

      var adaylar = [srtPath];
      if (lastResult && lastResult.secondaryOutput) adaylar.push(lastResult.secondaryOutput);
      return CEP.call('trPlaceCaptions("' + esPath(adaylar.join(';')) + '")');
    }).then(function (pl) {
      setBar(1);
      if (!pl) { setStatus('tamam'); return; }   // 'önce düzenle' modunda
      if (pl && pl.grafik) {
        // Grafik yolunda rapor zaten mogrtYerlestir icinde yazildi;
        // asagidaki altyazi-timeline raporu burada anlamsiz olurdu.
        setStatus('tamam');
        return;
      }
      // Hangi bicimin kabul edildigi kritik bilgi — tahmin etmeyelim
      var denemeler = asArray(pl.attempts);
      for (var di = 0; di < denemeler.length; di++) {
        var dcls = denemeler[di].indexOf('OK ') === 0 ? 'ok' : 'dim';
        appendRun('<span class="' + dcls + '">' + esc(denemeler[di]) + '</span>');
      }
      if (String(pl.placed) === 'true') {
        appendRun('<span class="ok">Altyazı timeline’ı oluşturuldu' + (pl.usedFile ? ' — ' + esc(pl.usedFile) : '') + '</span>');
        appendRun('<span class="dim">Dosya:</span> ' + esc(srtPath));
      } else {
        appendRun('<span class="warn">Dosya projeye alındı ama timeline’a yerleştirilemedi' +
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
      $('cancelRow').hidden = true;
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
           'Node: ' + (CEP.nodeVersion() || 'yok') +
           (nos ? '  ·  ' + nos.platform() + ' ' + nos.release() + ' ' + nos.arch() : '') +
           '\n\n' + text;
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

  /**
   * Paneli yeniden yukler — Premiere'i kapatmadan.
   *
   * IKI PARCA var ve ikincisi kolayca atlaniyor:
   *   1. Panel sayfasi (HTML/CSS/JS) — location.reload() yetiyor.
   *   2. Kopru (bridge.jsx) — Premiere onu bir kez yukleyip BELLEKTE
   *      tutuyor. Sayfayi yenilemek onu tazelemiyor; $.evalFile ile
   *      acikca yeniden okutmak gerekiyor. Guncelleme sonrasi kopru eski
   *      kalirsa panel yeni, kopru eski olur ve hata "sebepsiz" gorunur.
   *
   * Kopru tazelenemezse yine de sayfayi yeniliyoruz: yarim yenileme
   * hic yenilememekten iyi, ve kullaniciya durumu soyluyoruz.
   */
  function reloadPanel() {
    var btn = $('btnReload');
    if (btn) { btn.disabled = true; btn.className = 'iconbtn spin'; }

    var ext = CEP.available() ? CEP.extensionPath() : null;
    var bitir = function () { window.location.reload(); };

    if (!ext) { bitir(); return; }

    var jsx = ext + '/jsx/bridge.jsx';
    CEP.evalScript('$.evalFile("' + esPath(jsx) + '")')
      .catch(function () { /* kopru tazelenemedi; sayfa yine de yenilensin */ })
      .then(bitir);
  }

  document.addEventListener('DOMContentLoaded', function () {
    checkEnvironment();
    readSequence(true);
    initAutoRefresh();
    checkUpdate();  // sekans ozeti dugme beklemeden gorunsun
    $('btnReload').addEventListener('click', reloadPanel);
    $('btnUpdate').addEventListener('click', runUpdate);
    $('btnRun').addEventListener('click', generate);
    yeniAraclariBagla();
    proYukle();
    if ($('btnProAl')) $('btnProAl').addEventListener('click', function () {
      var u = 'https://labs.tkcreative.io/tk-caption';
      // CEP'te window.open panelin icinde acar; varsayilan tarayiciya gonder
      try { window.cep.util.openURLInDefaultBrowser(u); } catch (e) { window.open(u); }
    });
    $('btnSubsSave').addEventListener('click', subsKaydet);
    $('btnSubsPlace').addEventListener('click', subsYerlestir);

    initScope();
    initTabs();
    $('btnCancel').addEventListener('click', cancelRun);
    $('btnSeq').addEventListener('click', function () { readSequence(false); });
    $('btnProbe').addEventListener('click', runProbe);
    $('btnCaption').addEventListener('click', testCaptionTrack);
    $('btnExportProbe').addEventListener('click', probeExport);
    $('btnPresets').addEventListener('click', listPresets);
    $('btnCopy').addEventListener('click', copyAll);
    $('btnAdv').addEventListener('click', function () {
      var g = $('advBody');
      g.hidden = !g.hidden;
      this.className = g.hidden ? 'btn small' : 'btn small on';
    });
  });
}());
