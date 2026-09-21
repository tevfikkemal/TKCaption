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
      setText('seqMeta', parca.join(' · '));
      var el = $('seqName');
      if (el) el.className = '';
      kapsamiTazele(d);
    }).catch(function (e) {
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
      updateDurum = 'kurulu v' + r.current + ' / depoda v' + r.latest +
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
      if (r.writable === false) not += ' Windows yönetici izni isteyecek.';
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
        setText('updateNote', 'Windows yetki penceresi açılıyor — “Evet” deyin.');
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
  var kapsamAralik = 'entire';   // 'entire' | 'inout'
  var kapsamSes = [];            // bos = tumu; dolu = secili ses timeline indeksleri
  var sonSeqBilgi = null;

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

    grupSecimi($('targetGrp'), 'data-target', function (v) {
      kapsamHedef = v;
      yerelYaz(HEDEF_ANAHTAR, v);
      hedefiYansit();
    });

    // Son secilen hedefi hatirla
    var kayitli = yerelOku(HEDEF_ANAHTAR);
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
      var it = mogrtSecili ? mogrtItem(mogrtSecili) : null;
      ipucu.textContent = it
        ? 'grafik timeline’a — şablon: ' + it.ad
        : 'grafik timeline’a — önce Stilize Altyazı’dan şablon seçin';
    } else {
      var mod = $('optPlaceMode') ? $('optPlaceMode').value : 'auto';
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

    var html = '<span class="mini-lbl">Ses</span>' +
               '<button class="mini' + (kapsamSes.length ? '' : ' on') +
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
    grp.hidden = gosterilen < 2;
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
  /*  AUTOCUT — sessiz bolumleri kesip silme                           */
  /* ---------------------------------------------------------------- */

  /*
   * IKI ADIM: once tara, sonra uygula.
   *
   * Tek dugme olsaydi kullanici neyin silinecegini gormeden sekansini
   * degistirmis olurdu. Once kac bolge ve kac saniye oldugunu
   * gosteriyoruz; "Uygula" ancak ondan sonra aciliyor.
   *
   * Sessizlik tespiti icin altyazi boru hattinin kullandigi VAD'i
   * kullaniyoruz — ayni ses, ayni olcum. Ayri bir esik mantigi yazmak
   * iki yerde farkli davranan bir sistem uretirdi.
   */

  var kesBolgeler = null;   // [{start,end}] sekans saniyesi
  var kesSeqBilgi = null;

  function kesYaz(html) {
    var el = $('cutOut');
    if (!el) return;
    el.hidden = false;
    el.innerHTML += html + '\n';
    el.scrollTop = el.scrollHeight;
  }

  function kesBar(oran) {
    var b = $('cutBar'), f = $('cutFill');
    if (b) b.hidden = false;
    if (f) f.style.width = Math.round(Math.max(0, Math.min(1, oran)) * 100) + '%';
  }

  /**
   * Kaydirici etiketleri.
   *
   * OLCULEN: kenar payi sessizligi IKI taraftan yiyor, yani gercekte
   * kesilen esik (esik + 2*pay). Yalnizca esigi gostermek kullaniciyi
   * yaniltir — "0.8 dedim ama 1 sn'lik bosluk kesilmedi" der. Efektif
   * degeri de yaziyoruz.
   */
  function kesEtiketleri() {
    var e = kesMinSn(), pd = kesPadSn();
    var efektif = e + 2 * pd;
    setText('cutMinVal', e.toFixed(1) + ' sn');
    setText('cutPadVal', pd.toFixed(1) + ' sn');
    var n = $('cutNote');
    if (n) {
      n.textContent = pd > 0
        ? 'Kenar payı ile birlikte ' + efektif.toFixed(1) +
          ' sn ve üzeri sessizlikler kesilecek.'
        : e.toFixed(1) + ' sn ve üzeri sessizlikler kesilecek.';
    }
  }

  /** Kaydirici degerleri: 8 -> 0.8 sn */
  function kesMinSn() { return (Number($('optCutMin').value) || 8) / 10; }
  function kesPadSn() { return (Number($('optCutPad').value) || 0) / 10; }

  function autocutTara() {
    var btn = $('btnCutScan');
    btn.disabled = true;
    $('btnCutApply').disabled = true;
    $('cutOut').innerHTML = '';
    kesBolgeler = null;
    kesBar(0);

    var core = resolveCore();
    if (!core) { kesYaz('<span class="err">Çekirdek bulunamadı.</span>'); btn.disabled = false; return; }

    var tmp = nos.tmpdir();
    var wav = npath.join(tmp, 'tkcaption-kesim.wav');

    CEP.call('trGetSequenceInfo()').then(function (d) {
      kesSeqBilgi = d;
      kesYaz('<span class="dim">sekans:</span> ' + esc(d.name) + '  ' +
             Number(d.durationSec).toFixed(1) + ' sn');
      kesBar(0.1);
      kesYaz('<span class="dim">ses çıkarılıyor…</span>');
      // Kesim her zaman TUM sekansta calisir: bir bolumu kesip digerini
      // birakmak zaman cizgisini tutarsiz birakirdi.
      return CEP.call('trExportAudioAuto("' + esPath(wav) + '", 0, "")');
    }).then(function (e) {
      kesBar(0.45);
      kesYaz('<span class="ok">ses hazır</span> ' +
             (Number(e.bytes) / 1048576).toFixed(1) + ' MB');

      var au = nodeReq(npath.join(core, 'src', 'audio.js'));
      var vad = nodeReq(npath.join(core, 'src', 'vad.js'));
      var dec = au.decodeWav(wav);
      var pcm = au.resample(dec.samples, dec.sampleRate, 16000);
      kesBar(0.7);

      var pad = kesPadSn();
      var minSn = kesMinSn();

      /* VAD'in varsayilan esigi 2 saniye: altyazi icin dogru, kesim icin
       * degil. O esik whisper'in uydurma metin urettigi UZUN sessizlikleri
       * atmak icin secilmisti; burada kullanicinin verdigi esigi
       * gecirmezsek 0.8 sn ayari hicbir sey yapmaz ve panel sessizce
       * yalan soylemis olur.
       *
       * padMs'i de biz veriyoruz: VAD konusma bolgesini o kadar genisletiyor,
       * yani sessizlik o kadar daraliyor — kullanicinin "kenar payi"
       * ayarinin karsiligi tam olarak bu. */
      var bolgeler = vad.detectSpeech(pcm, 16000, {
        minRemovableSilenceMs: Math.round(minSn * 1000),
        padMs: Math.round(pad * 1000)
      });
      if (!bolgeler || !bolgeler.length) {
        kesYaz('<span class="warn">Konuşma bulunamadı — kesim yapılmayacak.</span>');
        return null;
      }
      var toplamSn = dec.durationSec;
      var sessiz = [];
      var oncekiBitis = 0;

      for (var i = 0; i < bolgeler.length; i++) {
        var bas = bolgeler[i].start / 16000;
        var bit = bolgeler[i].end / 16000;
        // Pay VAD icinde uygulandi; burada tekrar daraltmak cift kirpma olur
        if (bas - oncekiBitis > 0) {
          sessiz.push({ start: oncekiBitis, end: bas });
        }
        oncekiBitis = bit;
      }
      if (toplamSn - oncekiBitis > 0) {
        sessiz.push({ start: oncekiBitis, end: toplamSn });
      }

      // Cok kisa olanlari atiyoruz: her yarim saniyeyi kesmek videoyu
      // tanimaz hale getirir ve yuzlerce kesim yaratir.
      var suzulmus = [];
      for (var s = 0; s < sessiz.length; s++) {
        var uz = sessiz[s].end - sessiz[s].start;
        if (uz >= minSn) suzulmus.push(sessiz[s]);
      }

      kesBar(1);
      if (!suzulmus.length) {
        kesYaz('<span class="warn">' + minSn.toFixed(1) +
               ' sn ve üzeri sessizlik bulunamadı.</span>');
        return null;
      }

      var kazanc = 0;
      for (var k = 0; k < suzulmus.length; k++) kazanc += suzulmus[k].end - suzulmus[k].start;

      kesBolgeler = suzulmus;
      kesYaz('<span class="ok">' + suzulmus.length + ' sessiz bölüm, toplam ' +
             kazanc.toFixed(1) + ' sn</span>');
      kesYaz('<span class="dim">sekans ' + toplamSn.toFixed(1) + ' sn → ' +
             (toplamSn - kazanc).toFixed(1) + ' sn olacak</span>');
      return CEP.call('trAutoCut("' + esPath(JSON.stringify(suzulmus)) + '", ' +
                      Number(kesSeqBilgi.fps) + ', "1")');
    }).then(function (r) {
      if (r) {
        kesYaz('<span class="dim">etkilenecek timeline:</span> ' +
               r.videoTracks + ' video, ' + r.audioTracks + ' ses');
        $('btnCutApply').disabled = false;
      }
    }).catch(function (e) {
      kesYaz('<span class="err">' + esc(e.message || String(e)) + '</span>');
    }).then(function () {
      btn.disabled = false;
    });
  }

  function autocutUygula() {
    if (!kesBolgeler || !kesBolgeler.length) return;
    var btn = $('btnCutApply');
    btn.disabled = true;
    kesYaz('<span class="dim">kesiliyor…</span>');

    CEP.call('trAutoCut("' + esPath(JSON.stringify(kesBolgeler)) + '", ' +
             Number(kesSeqBilgi.fps) + ', "0")').then(function (r) {
      kesYaz('<span class="ok">' + r.cuts + ' kesim, ' + r.removed +
             ' parça silindi</span>');
      kesYaz('<span class="dim">zaman biçimi:</span> ' + esc(r.format));
      var hs = asArray(r.errors);
      if (hs.length) {
        kesYaz('<span class="warn">' + hs.length + ' sorun</span>');
        for (var i = 0; i < Math.min(4, hs.length); i++) {
          kesYaz('<span class="dim">  ' + esc(hs[i]) + '</span>');
        }
      }
      kesBolgeler = null;   // ayni bolgeler iki kez uygulanmasin
    }).catch(function (e) {
      kesYaz('<span class="err">' + esc(e.message || String(e)) + '</span>');
      btn.disabled = false;
    });
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
      for (var i = 0; i < tablar.length; i++) {
        var t = tablar[i];
        var secili = t.getAttribute('data-tab') === ad;
        t.className = secili ? 'tab on' : 'tab';
        var govde = $('tab-' + t.getAttribute('data-tab'));
        if (govde) govde.hidden = !secili;
      }
      try { window.localStorage.setItem(SEKME_ANAHTAR, ad); } catch (e) {}
    }

    for (var i = 0; i < tablar.length; i++) {
      tablar[i].addEventListener('click', function () {
        gec(this.getAttribute('data-tab'));
      });
    }

    var kayitli = null;
    try { kayitli = window.localStorage.getItem(SEKME_ANAHTAR); } catch (e) {}
    gec(kayitli || 'ayar');
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
  /*  STILIZE ALTYAZI — MOGRT sablonuyla video pistine                 */
  /* ---------------------------------------------------------------- */

  /*
   * NEDEN AYRI BIR AKIS: Premiere altyazi pistinin stilini ne dosyadan
   * ne betikten kabul ediyor (olculdu). Yazi tipi/renk vermenin tek yolu
   * altyaziyi grafik olarak koymak. Bedeli de acik: cikti kapatilabilir
   * bir altyazi pisti degil, videoya gomulu yazi oluyor. Bu yuzden
   * mevcut altyazi akisini DEGISTIRMIYORUZ, yanina koyuyoruz.
   *
   * .mogrt dosyalari pakete girmiyor (50 sablon ~114 MB). Katalog ve
   * kucuk onizlemeler pakette; dosyalarin kendisi kullanicinin
   * klasorunden okunuyor.
   */

  var mogrtKatalog = null;
  var mogrtSecili = null;
  var mogrtKlasor = null;
  var sonAltyaziYolu = null;

  var MOGRT_KLASOR_ANAHTAR = 'tkcaption.mogrtDir';
  var MOGRT_SECIM_ANAHTAR = 'tkcaption.mogrtStyle';

  function yerelOku(k) {
    try { return window.localStorage.getItem(k); } catch (e) { return null; }
  }
  function yerelYaz(k, v) {
    try { window.localStorage.setItem(k, v); } catch (e) {}
  }

  var mogrtMod = null;

  /**
   * Katalog PAKETTE DEGIL, calisma aninda uretiliyor.
   *
   * Bir donem hazir katalog ve onizlemeler pakete konmustu; o veriler
   * satin alinmis bir sablon paketinden cikarilmisti ve dagitma hakkimiz
   * yoktu. Artik panel kullanicinin gosterdigi klasoru kendisi tariyor.
   */
  function initMogrt() {
    if (!nodeReq) { mogrtNot('Node.js kapalı — bu bölüm çalışmaz.'); return; }

    var core = resolveCore();
    if (!core) { mogrtNot('Çekirdek bulunamadı.'); return; }

    try {
      mogrtMod = nodeReq(npath.join(core, 'src', 'mogrt.js'));
    } catch (e) {
      mogrtNot('Şablon okuyucu yüklenemedi: ' + e.message);
      return;
    }

    mogrtKlasor = yerelOku(MOGRT_KLASOR_ANAHTAR);
    mogrtSecili = yerelOku(MOGRT_SECIM_ANAHTAR);

    klasorEtiketiTazele();

    if (!mogrtKlasor) {
      setText('mogrtCount', '');
      mogrtNot('Şablon klasörünüzü seçin — .mogrt dosyalarının bulunduğu klasör.');
      mogrtDurumTazele();
      return;
    }

    katalogYukle(false);
  }

  /**
   * Katalogu onbellekten alir; yoksa ya da klasor degistiyse tarar.
   * @param {boolean} zorla onbellegi yok say
   */
  function katalogYukle(zorla) {
    if (!mogrtMod || !mogrtKlasor) return;

    try {
      if (!zorla) {
        var ob = mogrtMod.onbellek(mogrtKlasor);
        if (ob) {
          mogrtKatalog = ob;
          kartlariCiz();
          mogrtDurumTazele();
          return;
        }
      }

      mogrtNot('Şablonlar taranıyor…');
      // Tarama 50 sablonda ~1 sn; arayuzu kilitlememek icin bir sonraki
      // cerceveye birakiyoruz ki "taranıyor" yazisi gorunebilsin.
      window.setTimeout(function () {
        try {
          mogrtKatalog = mogrtMod.tara(mogrtKlasor);
          mogrtNot(mogrtKatalog.atlanan && mogrtKatalog.atlanan.length
            ? mogrtKatalog.atlanan.length + ' şablon atlandı (metin alanı yok)'
            : '');
          kartlariCiz();
          mogrtDurumTazele();
        } catch (e) {
          mogrtNot('Tarama başarısız: ' + e.message);
        }
      }, 30);
    } catch (e) {
      mogrtNot('Katalog okunamadı: ' + e.message);
    }
  }

  /**
   * Kartlari cizer — ama YALNIZCA secili klasorde dosyasi bulunanlari.
   *
   * Katalog 50 sablon tanimliyor; pakete gelen demo klasorunde 3 tane var.
   * Hepsini gostermek kullaniciyi tiklayinca "dosya yok" diyen 47 kartla
   * bas basa birakirdi.
   */
  /** Yerel bir dosyayi img src'de gosterilebilir hale getirir */
  function dosyaUrl(p) {
    return 'file:///' + String(p).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  }

  function kartlariCiz() {
    var grid = $('mogrtGrid');
    if (!grid || !mogrtKatalog) return;

    var thumbKok = mogrtMod.thumbsDir();
    var html = '';
    for (var i = 0; i < mogrtKatalog.items.length; i++) {
      var it = mogrtKatalog.items[i];
      var secili = (it.id === mogrtSecili) ? ' on' : '';
      // Onizlemeler veri klasorunde (pakette degil) — mutlak yol gerekiyor
      var gorsel = it.thumb
        ? '<img src="' + dosyaUrl(npath.join(thumbKok, it.thumb)) + '" alt="">'
        : '<span class="yok">önizleme yok</span>';
      html += '<div class="mogrt-card' + secili + '" data-id="' + esc(it.id) + '">' +
              gorsel + '<span class="ad">' + esc(it.ad) + '</span></div>';
    }
    grid.innerHTML = html;
    grid.hidden = false;
    setText('mogrtCount', mogrtKatalog.items.length + ' şablon');

    var kartlar = grid.querySelectorAll('.mogrt-card');
    for (var k = 0; k < kartlar.length; k++) {
      kartlar[k].addEventListener('click', function () {
        var hepsi = grid.querySelectorAll('.mogrt-card');
        for (var j = 0; j < hepsi.length; j++) hepsi[j].className = 'mogrt-card';
        this.className = 'mogrt-card on';
        mogrtSecili = this.getAttribute('data-id');
        yerelYaz(MOGRT_SECIM_ANAHTAR, mogrtSecili);
        mogrtDurumTazele();
      });
    }
  }

  function klasorEtiketiTazele() {
    if (!mogrtKlasor) { setText('mogrtDirLabel', 'seçilmedi'); return; }
    var varMi = false;
    try { varMi = nfs.existsSync(mogrtKlasor); } catch (e) {}
    setText('mogrtDirLabel', (varMi ? '' : '(bulunamadı) ') + mogrtKlasor);
  }

  function chooseMogrtDir() {
    var r = null;
    try {
      r = window.cep.fs.showOpenDialogEx(false, true, 'MOGRT şablon klasörü',
                                         mogrtKlasor || '');
    } catch (e) {
      try { r = window.cep.fs.showOpenDialog(false, true, 'MOGRT şablon klasörü', ''); }
      catch (e2) { mogrtNot('Klasör seçici açılamadı: ' + e2.message); return; }
    }
    if (!r || !r.data || !r.data.length) return;
    mogrtKlasor = String(r.data[0]);
    yerelYaz(MOGRT_KLASOR_ANAHTAR, mogrtKlasor);
    klasorEtiketiTazele();
    katalogYukle(true);   // yeni klasor: onbellegi yok say
  }

  function mogrtNot(msg) {
    var el = $('mogrtNote');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  /**
   * Sablon durumunu bildirir.
   *
   * Ayri bir "Stilize Altyazi Olustur" dugmesi yok artik — ana eylem
   * hedefe gore dallaniyor. Burada yalnizca eksik olani soyluyoruz ve
   * ana eylemin ipucunu tazeliyoruz.
   */
  function mogrtDurumTazele() {
    if (!mogrtKlasor) { mogrtNot('Şablon klasörünü seçin.'); hedefiYansit(); return; }
    if (!mogrtKatalog) { hedefiYansit(); return; }
    if (!mogrtSecili) { mogrtNot('Bir şablon seçin.'); hedefiYansit(); return; }

    var it = mogrtItem(mogrtSecili);
    if (it) {
      var dosya = npath.join(mogrtKlasor, it.dosya);
      var varMi = false;
      try { varMi = nfs.existsSync(dosya); } catch (e) {}
      if (!varMi) {
        mogrtNot('Seçilen şablon dosyası klasörde yok: ' + it.dosya);
        hedefiYansit();
        return;
      }
    }
    mogrtNot('');
    hedefiYansit();
  }

  function mogrtItem(id) {
    if (!mogrtKatalog) return null;
    for (var i = 0; i < mogrtKatalog.items.length; i++) {
      if (mogrtKatalog.items[i].id === id) return mogrtKatalog.items[i];
    }
    return null;
  }

  function mogrtBar(oran) {
    var b = $('mogrtBar');
    var f = $('mogrtFill');
    if (b) b.hidden = false;
    if (f) f.style.width = Math.round(Math.max(0, Math.min(1, oran)) * 100) + '%';
  }

  function mogrtYaz(html) {
    var el = $('mogrtOut');
    if (!el) return;
    el.hidden = false;
    el.innerHTML += html + '\n';
    el.scrollTop = el.scrollHeight;
  }

  /**
   * Uretilmis altyaziyi MOGRT klipleri olarak grafik timeline'a dizer.
   *
   * Ana eylemden cagriliyor: kullanici 'Nereye: Grafik timeline' sectiyse
   * altyazi uretildikten sonra bu calisiyor. Ayri bir dugme yoktu cunku
   * ayni isin iki dugmesi olmasi kullaniciyi 'hangisine basayim' diye
   * dusundurmustu.
   *
   * @returns {Promise} yerlestirme bitince cozulur
   */
  function mogrtYerlestir() {
    var it = mogrtItem(mogrtSecili);
    if (!it) return Promise.reject(new Error('Şablon seçilmedi.'));
    if (!sonAltyaziYolu) return Promise.reject(new Error('Önce altyazı üretilmeli.'));

    mogrtBar(0);
    mogrtNot('');

    var core = resolveCore();
    var bloklar;
    try {
      var srtMod = nodeReq(npath.join(core, 'src', 'srt.js'));
      bloklar = srtMod.parseSrt(nfs.readFileSync(sonAltyaziYolu, 'utf8'));
    } catch (e) {
      appendRun('<span class="err">Altyazı dosyası okunamadı: ' + esc(e.message) + '</span>');
      return Promise.reject(new Error('Altyazı dosyası okunamadı.'));
    }
    if (!bloklar || !bloklar.length) {
      return Promise.reject(new Error('Altyazı dosyasında blok yok.'));
    }

    var dosya = npath.join(mogrtKlasor, it.dosya);
    appendRun('<span class="dim">şablon:</span> ' + esc(it.ad) + '  ' + bloklar.length + ' blok');

    // SRT zamanlari sekansin BASLANGIC ZAMAN KODUNA gore yazildi (pipeline
    // zeroPoint'i offset olarak ekliyor). importMGT ise sekansin basindan
    // itibaren saniye istiyor. Sekans 01:00:00:00'dan basliyorsa bu farki
    // dusmezsek her klip bir saat ileri gider.
    var zeroSec = 0;
    var olcek = 0;
    var dikey = Number($('optMogrtPos').value) / 100;

    return CEP.call('trGetSequenceInfo()').then(function (si) {
      zeroSec = Number(si.zeroPointSec) || 0;

      // Sablonlarin tamami 16:9 uretilmis; dikey sekansta genislik tasiyor.
      // Elle bir deger verilmediyse sablonu sekans genisligine oturtuyoruz.
      var elle = Number($('optMogrtScale').value) || 0;
      if (elle > 0) {
        olcek = elle;
      } else if (it.en > 0 && Number(si.width) > 0) {
        olcek = Math.round((Number(si.width) / it.en) * 1000) / 10;
        appendRun('<span class="dim">Şablon ' + it.en + 'x' + it.boy +
                 ', sekans ' + si.width + 'x' + si.height +
                 ' — ölçek %' + olcek + '</span>');
      }
      if (zeroSec > 0.0005) {
        appendRun('<span class="dim">Başlangıç zaman kodu düşülüyor:</span> ' +
                 zeroSec.toFixed(3) + ' sn');
      }
      // Once bos bir video pisti bul; var olan klipleri ezmek istemiyoruz
      return CEP.call('trFindFreeVideoTrack()');
    }).then(function (t) {
      var track = Number(t.track);
      appendRun('<span class="dim">timeline:</span> V' + (track + 1) +
               (String(t.created) === 'true' ? ' (yeni eklendi)' : ''));

      // Grup grup gonderiyoruz: tek cagrida panel dakikalarca donardi.
      // Ozyinelemeli zinciri bir Promise'e sariyoruz ki cagiran taraf
      // yerlestirmenin BITTIGINI ogrenebilsin — eskiden bitis sinyali
      // yoktu ve ana akis yerlestirme surerken tamamlanmis sayiyordu.
      var GRUP = 10;
      var i = 0;
      var konan = 0;
      var hatalar = [];

      return new Promise(function (resolve, reject) {
        function sonraki() {
          if (i >= bloklar.length) {
            mogrtBar(1);
            appendRun('<span class="ok">' + konan + ' / ' + bloklar.length +
                     ' altyazı yerleştirildi</span>');
            if (hatalar.length) {
              appendRun('<span class="warn">' + hatalar.length + ' blok atlandı</span>');
              for (var h = 0; h < Math.min(5, hatalar.length); h++) {
                appendRun('<span class="dim">  ' + esc(hatalar[h]) + '</span>');
              }
            }
            resolve({ placed: konan, total: bloklar.length });
            return;
          }

          var grup = [];
          for (var g = 0; g < GRUP && i < bloklar.length; g++, i++) {
            grup.push({
              start: Math.max(0, bloklar[i].start - zeroSec),
              end: Math.max(0.05, bloklar[i].end - zeroSec),
              text: bloklar[i].lines ? bloklar[i].lines.join('\n') : (bloklar[i].text || '')
            });
          }

          var json = JSON.stringify(grup);
          CEP.call('trPlaceMogrtBatch("' + esPath(dosya) + '", "' + esPath(json) +
                   '", ' + track + ', ' + olcek + ', ' + dikey.toFixed(4) + ')')
            .then(function (r) {
              konan += Number(r.placed) || 0;
              var hs = asArray(r.errors);
              for (var e = 0; e < hs.length; e++) hatalar.push(hs[e]);
              mogrtBar(i / bloklar.length);
              sonraki();
            })
            .catch(reject);
        }
        sonraki();
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /*  GUVENLI ALAN katmani                                             */
  /* ---------------------------------------------------------------- */

  var safeOn = false;

  /** Isaretli platformlar. Bos birakilirsa Reels varsayilir. */
  function selectedPresets() {
    var out = [];
    var boxes = document.querySelectorAll('.chips input.sf');
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].checked) out.push(boxes[i].value);
    }
    return out.length ? out : ['instagram-reels'];
  }

  /**
   * Platform arayuz elemanlarini ciz.
   *
   * Bunlar TEMSILIDIR — gercek ikonlarin kopyasi degil, "buraya kalp gelecek"
   * diyen yer tutuculardir. Kurgucu boylece neyin nereyi kapatacagini goruyor.
   */
  function drawUI(g, els, width) {
    var stroke = 'rgba(255,255,255,0.55)';
    var fill = 'rgba(255,255,255,0.22)';
    var lw = Math.max(2, Math.round(width / 500));

    function heart(x, y, s) {
      var r = s / 2;
      g.beginPath();
      g.moveTo(x, y + r * 0.75);
      g.bezierCurveTo(x - r * 1.4, y - r * 0.4, x - r * 0.45, y - r * 1.15, x, y - r * 0.35);
      g.bezierCurveTo(x + r * 0.45, y - r * 1.15, x + r * 1.4, y - r * 0.4, x, y + r * 0.75);
      g.closePath();
      g.fill(); g.stroke();
    }
    function comment(x, y, s) {
      var r = s / 2;
      g.beginPath();
      g.moveTo(x - r, y - r * 0.7);
      g.lineTo(x + r, y - r * 0.7);
      g.lineTo(x + r, y + r * 0.35);
      g.lineTo(x - r * 0.25, y + r * 0.35);
      g.lineTo(x - r * 0.6, y + r * 0.85);   // kuyruk
      g.lineTo(x - r * 0.6, y + r * 0.35);
      g.lineTo(x - r, y + r * 0.35);
      g.closePath();
      g.fill(); g.stroke();
    }
    function share(x, y, s) {
      var r = s / 2;
      g.beginPath();                          // kagit ucak
      g.moveTo(x - r, y - r * 0.35);
      g.lineTo(x + r, y - r * 0.8);
      g.lineTo(x + r * 0.15, y + r * 0.8);
      g.lineTo(x - r * 0.1, y + r * 0.1);
      g.closePath();
      g.fill(); g.stroke();
    }
    function more(x, y, s) {
      var r = Math.max(1.5, s / 9);
      for (var i = -1; i <= 1; i++) {
        g.beginPath();
        g.arc(x, y + i * s * 0.32, r, 0, Math.PI * 2);
        g.fill();
      }
    }
    function circle(x, y, s, inner) {
      g.beginPath(); g.arc(x, y, s / 2, 0, Math.PI * 2); g.fill(); g.stroke();
      if (inner) { g.beginPath(); g.arc(x, y, s / 6, 0, Math.PI * 2); g.stroke(); }
    }
    function bar(x, y, w, h, round) {
      var r = round ? h / 2 : Math.min(h / 2, width / 300);
      g.beginPath();
      g.moveTo(x + r, y);
      g.lineTo(x + w - r, y);
      g.quadraticCurveTo(x + w, y, x + w, y + r);
      g.lineTo(x + w, y + h - r);
      g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      g.lineTo(x + r, y + h);
      g.quadraticCurveTo(x, y + h, x, y + h - r);
      g.lineTo(x, y + r);
      g.quadraticCurveTo(x, y, x + r, y);
      g.closePath();
      g.fill();
    }

    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.fillStyle = fill;

    // Ikonun altindaki sayi da yer kaplar; onu da gostermek daha dogru
    var nfs2 = Math.max(9, Math.round(width / 60));

    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (e.label) {
        var eski = g.fillStyle;
        g.font = '600 ' + nfs2 + 'px sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillText(e.label, e.x, e.y + (e.size || 0) * 0.55);
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.fillStyle = eski;
      }
      switch (e.type) {
        case 'heart': heart(e.x, e.y, e.size); break;
        case 'comment': comment(e.x, e.y, e.size); break;
        case 'share': share(e.x, e.y, e.size); break;
        case 'more': more(e.x, e.y, e.size); break;
        case 'avatar': circle(e.x, e.y, e.size, false); break;
        case 'disc': circle(e.x, e.y, e.size, true); break;
        case 'text': bar(e.x, e.y, e.w, e.h, true); break;
        case 'music': bar(e.x, e.y, e.w, e.h, true); break;
        case 'box':
          g.strokeRect(e.x, e.y, e.w, e.h);
          break;
        default: break;
      }
    }
  }

  /**
   * Kilavuz katmanini canvas'ta cizip PNG olarak yazar.
   *
   * Program Monitor'e dogrudan cizim yapmak betikle mumkun degil; bu yuzden
   * sekansin ustune saydam bir goruntu katmani koyuyoruz.
   */
  function drawSafeZone(presets, width, height, dim) {
    var sz = nodeReq(npath.join(resolveCore(), 'src', 'safezone.js'));
    var ids = [].concat(presets).filter(Boolean);
    var rect = sz.intersectRects(ids, width, height);
    if (!rect) throw new Error('Seçilen platformların ortak güvenli alanı yok.');

    var etiket = ids.map(function (i) { return sz.PRESETS[i].label; }).join(' + ');
    var title = ids.length === 1 ? sz.toTitleRect(ids[0], width, height) : null;

    var cv = document.createElement('canvas');
    cv.width = width;
    cv.height = height;
    var g = cv.getContext('2d');

    /* KIRPILAN ALANLAR KIRMIZI.
     * Notr karartma "burasi neden onemli?" demiyor; kirmizi dogrudan
     * "buraya bir sey koyma" diyor. */
    var a = Math.max(0.12, dim / 100 * 0.8);
    g.fillStyle = 'rgba(214, 38, 78, ' + a + ')';
    g.fillRect(0, 0, width, rect.y);                                   // üst
    g.fillRect(0, rect.y + rect.h, width, height - rect.y - rect.h);   // alt
    g.fillRect(0, rect.y, rect.x, rect.h);                             // sol
    g.fillRect(rect.x + rect.w, rect.y, width - rect.x - rect.w, rect.h); // sağ

    var lw = Math.max(2, Math.round(width / 380));

    // Uyari metni — ust ve alt bantlarda, bant yeterince yuksekse
    var uyari = 'BU ALAN ÇOĞU CİHAZDA KIRPILIR';
    var us = Math.max(10, Math.round(width / 52));
    g.font = '700 ' + us + 'px sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (rect.y > us * 2.2) g.fillText(uyari, width / 2, rect.y / 2);
    var altBant = height - (rect.y + rect.h);
    if (altBant > us * 2.2) {
      g.fillText(uyari, width / 2, rect.y + rect.h + altBant / 2);
    }
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';

    // Guvenli alan siniri
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = lw;
    g.strokeRect(rect.x + lw / 2, rect.y + lw / 2, rect.w - lw, rect.h - lw);

    // Tek platform secildiyse o platformun kendi siniri da ayrica gorunsun
    if (ids.length > 1) {
      g.lineWidth = Math.max(1, lw / 2);
      g.setLineDash([lw * 3, lw * 3]);
      for (var q = 0; q < ids.length; q++) {
        var rq = sz.toRect(ids[q], width, height);
        g.strokeStyle = 'rgba(255,255,255,0.30)';
        g.strokeRect(rq.x, rq.y, rq.w, rq.h);
      }
      g.setLineDash([]);
    }

    // Yatay YouTube'da ikinci seviye: baslik guvenli alani
    if (title) {
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = Math.max(1, lw / 2);
      g.setLineDash([lw * 4, lw * 3]);
      g.strokeRect(title.x, title.y, title.w, title.h);
      g.setLineDash([]);
    }

    // Platform arayuz elemanlari — "burasi neden yasak?" sorusunu cevaplar
    drawUI(g, sz.mergedUi(ids, width, height), width);

    // Etiket
    var fs = Math.max(14, Math.round(width / 36));
    g.font = '600 ' + fs + 'px sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.textBaseline = 'top';
    g.fillText(etiket, rect.x + lw * 2, rect.y + lw * 2);

    // PNG olarak diske yaz
    var data = cv.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
    var dir = npath.join(nos.tmpdir(), 'tkcaption-safezone');
    try { nfs.mkdirSync(dir, { recursive: true }); } catch (e) {}

    /* Dosya adi AYARLARI ICERIR: preset, cozunurluk ve karartma.
     *
     * Boylece ayni gorunum icin hep ayni dosya kullanilir (projede tek oge
     * kalir), ayar degisince de yeni dosya uretilir. Eski dosyalari SILMIYORUZ:
     * Premiere projeye aldigi dosyayi acik tutuyor ve hala kullaniliyor
     * olabilir — silmek ogeyi cevrimdisi birakir. */
    var file = npath.join(dir, 'TKSafeZone_' + ids.join('-') + '_' + width + 'x' + height +
      '_d' + dim + '.png');
    if (!nfs.existsSync(file)) {
      nfs.writeFileSync(file, Buffer.from(data, 'base64'));
    }
    return {
      path: file,
      rect: rect,
      label: etiket,
      note: ids.length === 1 ? sz.PRESETS[ids[0]].note
        : ids.length + ' platformun ortak alanı — en kısıtlayıcı kenarlar geçerli.'
    };
  }

  /**
   * Secim degisince aciklamayi tazele.
   * Birden fazla platform secilirse ortak alanin daralacagini soylemek onemli:
   * kullanici "neden bu kadar dar?" diye sormasin.
   */
  function refreshPlatformNote() {
    var ids = selectedPresets();
    var el = $('safeMulti');
    try {
      var sz = nodeReq(npath.join(resolveCore(), 'src', 'safezone.js'));
      if (ids.length === 1) {
        var nEl = $('safeNote');
        if (nEl) { nEl.hidden = false; nEl.textContent = sz.PRESETS[ids[0]].note; }
        if (el) el.hidden = true;
      } else {
        if ($('safeNote')) $('safeNote').hidden = true;
        if (el) {
          el.hidden = false;
          el.textContent = ids.length + ' platform seçili — gösterilen alan ' +
            'hepsinin ortak (en dar) bölgesidir.';
        }
      }
    } catch (e) {}

    // "Tümü" kutusu gercek durumu yansitsin
    var boxes = document.querySelectorAll('.chips input.sf');
    var hepsi = true;
    for (var i = 0; i < boxes.length; i++) if (!boxes[i].checked) hepsi = false;
    if ($('safeAll')) $('safeAll').checked = hepsi;
  }

  function safeZoneOn() {
    var presets = selectedPresets();
    var dim = parseInt($('optSafeDim').value, 10);

    return CEP.call('trGetSequenceInfo()').then(function (d) {
      var w = parseInt(d.width, 10);
      var h = parseInt(d.height, 10);
      if (!w || !h) throw new Error('Sekans çözünürlüğü okunamadı.');

      /* Ayni preset+cozunurluk icin katman zaten projedeyse yeni PNG
       * URETME. Her acilista dosya uretmek hem diski hem projeyi sisiriyordu. */
      var key = presets.join('-') + '_' + w + 'x' + h + '_d' + dim;
      return CEP.call('trFindSafeZoneItem("' + esPath(key) + '")')
        .then(function (f) {
          return { w: w, h: h, reuse: String(f.found) === 'true', name: f.name };
        });
    }).then(function (ctx) {
      var w = ctx.w, h = ctx.h;
      var drawn;
      if (ctx.reuse) {
        // Mevcut oge kullanilacak; dosya adini ondan turetiyoruz
        var szm = nodeReq(npath.join(resolveCore(), 'src', 'safezone.js'));
        var rr = szm.intersectRects(presets, w, h);
        drawn = {
          path: npath.join(nos.tmpdir(), 'tkcaption-safezone', ctx.name +
                 (/.png$/i.test(ctx.name) ? '' : '.png')),
          rect: rr,
          label: presets.map(function (i) { return szm.PRESETS[i].label; }).join(' + '),
          note: ''
        };
        if (!nfs.existsSync(drawn.path)) drawn = drawSafeZone(presets, w, h, dim);
      } else {
        drawn = drawSafeZone(presets, w, h, dim);
      }
      show('safeOut', '<span class="dim">' + esc(drawn.label) + '  ' + w + '×' + h +
        '  — güvenli alan ' + drawn.rect.w + '×' + drawn.rect.h + ' px</span>');
      setText('safeNote', drawn.note);

      return CEP.call('trPlaceSafeZone("' + esPath(drawn.path) + '", "' +
                      esPath(drawn.label) + '")');
    }).then(function (r) {
      var steps = asArray(r.steps);
      for (var i = 0; i < steps.length; i++) {
        $('safeOut').innerHTML += NL + '<span class="dim">' + esc(steps[i]) + '</span>';
      }
      $('safeOut').innerHTML += NL +
        '<span class="ok">Katman eklendi (video ' + esc(r.track) + ').</span>' + NL +
        '<span class="warn">Dışa aktarmadan önce kapatmayı unutmayın.</span>';
      safeOn = true;
      $('btnSafe').textContent = 'Kapat';
      $('btnSafe').className = 'btn primary';
    });
  }

  function safeZoneOff() {
    return CEP.call('trRemoveSafeZone()').then(function (r) {
      var msg = '<span class="ok">Katman kaldırıldı' +
        (Number(r.removed) ? ' (' + esc(r.removed) + ' klip)' : '') + '.</span>';
      // Silme gercekten oldu mu? Cagrinin donmesi silindigi anlamina gelmiyor.
      if (r.binTried !== undefined) {
        msg += NL + '<span class="dim">proje öğesi: ' + esc(r.binTried) + ' denendi, ' +
               esc(r.binDeleted) + ' silindi, ' + esc(r.binLeft) + ' kaldı' +
               ' (' + esc(r.binMethod) + ')</span>';
        if (Number(r.binLeft) > 0) {
          msg += NL + '<span class="warn">Premiere bu öğeleri silmeye izin vermiyor; ' +
                 'proje panelinden elle silebilirsiniz.</span>';
        }
      }
      show('safeOut', msg);
      safeOn = false;
      $('btnSafe').textContent = 'Aç';
      $('btnSafe').className = 'btn';
    });
  }

  function toggleSafeZone() {
    var btn = $('btnSafe');
    btn.disabled = true;
    setStatus(safeOn ? 'kaldırılıyor…' : 'ekleniyor…');
    var work = safeOn ? safeZoneOff() : safeZoneOn();
    work.catch(function (e) {
      show('safeOut', '<span class="err">' + esc(e.message) + '</span>');
    }).then(function () {
      btn.disabled = false;
      setStatus('');
    });
  }

  /** Panel acilinca katman zaten duruyor mu? Dugme durumu dogru olsun. */
  function refreshSafeState() {
    CEP.call('trHasSafeZone()').then(function (r) {
      safeOn = String(r.present) === 'true';
      $('btnSafe').textContent = safeOn ? 'Kapat' : 'Aç';
      $('btnSafe').className = safeOn ? 'btn primary' : 'btn';
    }).catch(function () { /* sekans yoksa onemli degil */ });
  }

  /* ---------------------------------------------------------------- */
  /*  ASIL AKIS: sekans -> ses -> altyazi -> pist                       */
  /* ---------------------------------------------------------------- */

  var running = false;
  var cancelFn = null;
  var lastResult = null;

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
      return CEP.call('trSuggestSrtPath("' + esPath(d.name) + '", "' + uzanti + '")')
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
      cfg.layout.maxCharsPerLine = parseInt($('optChars').value, 10) || 42;
      cfg.layout.maxCps = parseFloat($('optCps').value) || 17;
      cfg.layout.fps = Number(seqInfo.fps) || 25;
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
      // Stilize altyazi bolumu bu dosyayi okuyup MOGRT olarak dizecek
      sonAltyaziYolu = srtPath;
      subsYukle(srtPath);
      mogrtDurumTazele();
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
      var yerlestirmeModu = $('optPlaceMode') ? $('optPlaceMode').value : 'auto';
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
        return mogrtYerlestir().then(function (r) {
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
    refreshSafeState();
    checkUpdate();  // sekans ozeti dugme beklemeden gorunsun
    $('btnReload').addEventListener('click', reloadPanel);
    $('btnUpdate').addEventListener('click', runUpdate);
    $('btnRun').addEventListener('click', generate);
    $('btnSafe').addEventListener('click', toggleSafeZone);
    // "Tümü" kutusu digerlerini surukler
    $('optSafeDim').addEventListener('input', function () {
      setText('safeDimVal', '%' + $('optSafeDim').value);
    });
    $('safeAll').addEventListener('change', function () {
      var on = $('safeAll').checked;
      var boxes = document.querySelectorAll('.chips input.sf');
      for (var i = 0; i < boxes.length; i++) boxes[i].checked = on;
      refreshPlatformNote();
      cipleriTazele();
    });
    var sfBoxes = document.querySelectorAll('.chips input.sf');
    for (var b = 0; b < sfBoxes.length; b++) {
      sfBoxes[b].addEventListener('change', function () {
        refreshPlatformNote();
        cipleriTazele();
      });
    }
    refreshPlatformNote();
    cipleriTazele();
    $('btnSubsSave').addEventListener('click', subsKaydet);
    $('btnSubsPlace').addEventListener('click', subsYerlestir);
    if ($('optPlaceMode')) $('optPlaceMode').addEventListener('change', hedefiYansit);
    $('btnCutScan').addEventListener('click', autocutTara);
    $('btnCutApply').addEventListener('click', autocutUygula);
    $('optCutMin').addEventListener('input', kesEtiketleri);
    $('optCutPad').addEventListener('input', kesEtiketleri);
    kesEtiketleri();
    initScope();
    initTabs();
    initMogrt();
    $('btnMogrtDir').addEventListener('click', chooseMogrtDir);
    $('optMogrtPos').addEventListener('input', function () {
      setText('mogrtPosVal', '%' + this.value);
    });
    $('optMogrtScale').addEventListener('input', function () {
      // 0 = dokunulmadi: sablon boyutundan otomatik hesaplanacak
      setText('mogrtScaleVal', Number(this.value) > 0 ? '%' + this.value : 'otomatik');
    });
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
      this.className = g.hidden ? 'botlink' : 'botlink on';
    });
  });
}());
