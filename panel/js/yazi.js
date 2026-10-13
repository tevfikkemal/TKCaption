/**
 * Yazi Studyosu — stilli, animasyonlu yazi cizer.
 *
 * NEDEN CANVAS + PNG DIZISI: Premiere'in betik API'si metin katmani
 * olusturamiyor (yalnizca MOGRT, o da baskasinin tasarimi olmali). Biz
 * yaziyi panelde kare kare cizip numarali PNG dizisi olarak yaziyoruz;
 * Premiere bunu TEK BIR klip olarak iceri aliyor. ffmpeg gerekmiyor.
 *
 * Ayni ciz() fonksiyonu hem paneldeki onizlemeyi hem Premiere'e giden
 * kareleri ciziyor — onizlemede gorulen, timeline'a gidenin aynisi.
 *
 * Stiller TK Labs'in kendi tasarimi. Yazi tipleri OFL lisansli
 * (panel/fonts/OFL-*.txt) ve Turkce karakterlerin tamami dogrulandi.
 */
(function (kok) {
  'use strict';

  var MONT = 'TK Montserrat';
  var ANTON = 'TK Anton';
  var PLAY = 'TK Playfair';

  /*
   * Stil alanlari:
   *   font, agirlik, buyuk (TUMU BUYUK), dolgu (renk ya da [ust, alt] gradyan),
   *   vurgu (*kelime* rengi), kontur [kalinlik orani, renk], golge [bulaniklik, renk, dy],
   *   parilti [bulaniklik, renk], kutu (satir arkasi), vurguKutu (vurgu kelimesi hap icinde)
   */
  var STILLER = [
    { id: 'temiz', ad: 'Temiz', grup: 'Sade', font: MONT, agirlik: 800, dolgu: '#ffffff', vurgu: '#ffffff',
      golge: [18, 'rgba(0,0,0,.55)', 4] },
    { id: 'kalin', ad: 'Kalın Kontur', grup: 'Sade', font: MONT, agirlik: 900, dolgu: '#ffffff', vurgu: '#ffffff',
      kontur: [0.16, '#000000'] },
    { id: 'kutu', ad: 'Kutulu', grup: 'Sade', font: MONT, agirlik: 700, dolgu: '#ffffff', vurgu: '#ffffff',
      kutu: 'rgba(8,10,10,.82)' },
    { id: 'manset', ad: 'Manşet', grup: 'Sade', font: ANTON, agirlik: 400, buyuk: true, dolgu: '#ffffff', vurgu: '#ffffff',
      golge: [14, 'rgba(0,0,0,.6)', 3], aralik: 0.01 },
    { id: 'zarif', ad: 'Zarif', grup: 'Sade', font: PLAY, agirlik: 600, italik: true, dolgu: '#ffffff', vurgu: '#ffffff',
      golge: [16, 'rgba(0,0,0,.5)', 3] },

    { id: 'turkuaz', ad: 'Turkuaz Vurgu', grup: 'Renkli', font: MONT, agirlik: 900, dolgu: '#ffffff', vurgu: '#2dd4bf',
      kontur: [0.12, '#04110f'] },
    { id: 'sari', ad: 'Sarı Vurgu', grup: 'Renkli', font: MONT, agirlik: 900, buyuk: true, dolgu: '#ffffff', vurgu: '#ffd60a',
      kontur: [0.14, '#000000'] },
    { id: 'hap', ad: 'Hap Vurgu', grup: 'Renkli', font: MONT, agirlik: 800, dolgu: '#ffffff', vurgu: '#0b0d0d',
      vurguKutu: '#ffd60a', golge: [14, 'rgba(0,0,0,.5)', 3] },
    { id: 'neon', ad: 'Neon', grup: 'Renkli', font: MONT, agirlik: 800, dolgu: '#e9fffd', vurgu: '#e9fffd',
      parilti: [26, 'rgba(45,212,191,.95)'] },
    { id: 'altin', ad: 'Altın', grup: 'Renkli', font: ANTON, agirlik: 400, buyuk: true, dolgu: ['#fff1b8', '#f5a400'],
      vurgu: ['#ffffff', '#ffd25e'], parilti: [22, 'rgba(255,150,0,.55)'] }
  ];

  var ANIMLER = [
    { id: 'yok', ad: 'Sabit' },
    { id: 'pop', ad: 'Pop' },
    { id: 'yukari', ad: 'Yukarı' },
    { id: 'kelime', ad: 'Kelime' },
    { id: 'daktilo', ad: 'Daktilo' }
  ];

  function stil(id) {
    for (var i = 0; i < STILLER.length; i++) if (STILLER[i].id === id) return STILLER[i];
    return STILLER[0];
  }

  /* ---------------------------------------------------------------- */
  /*  Yazi tipleri                                                     */
  /* ---------------------------------------------------------------- */

  var fontSozu = null;
  /**
   * Yazi tiplerini yukler. Canvas, CSS'teki @font-face'i ancak YUKLENMIS
   * ise kullanir; yuklenmeden cizilirse sessizce sistem yazi tipine duser
   * ve ilk kareler farkli gorunur.
   */
  function fontlariYukle(tabanUrl) {
    if (fontSozu) return fontSozu;
    var liste = [
      [MONT, 'Montserrat.ttf', { weight: '100 900' }],
      [ANTON, 'Anton.ttf', {}],
      [PLAY, 'PlayfairDisplay-Italic.ttf', { weight: '400 900', style: 'italic' }]
    ];
    if (typeof FontFace === 'undefined' || !document.fonts) {
      fontSozu = Promise.resolve(false);
      return fontSozu;
    }
    fontSozu = Promise.all(liste.map(function (f) {
      var ff = new FontFace(f[0], 'url("' + tabanUrl + f[1] + '")', f[2]);
      return ff.load().then(function (y) { document.fonts.add(y); return true; })
        .catch(function () { return false; });
    })).then(function (r) { return r.every(Boolean); });
    return fontSozu;
  }

  /* ---------------------------------------------------------------- */
  /*  Metin cozumleme ve yerlesim                                      */
  /* ---------------------------------------------------------------- */

  /** "Bu *iz kalmaz*" -> satirlar -> [{metin, vurgu}] */
  function coz(metin, buyuk) {
    var satirlar = String(metin || '').replace(/\r/g, '').split('\n');
    var vurguda = false;
    return satirlar.map(function (s) {
      var kelimeler = [];
      var parcalar = s.split(/(\*)/);
      for (var i = 0; i < parcalar.length; i++) {
        var p = parcalar[i];
        if (p === '*') { vurguda = !vurguda; continue; }
        var ws = p.split(/\s+/);
        for (var j = 0; j < ws.length; j++) {
          if (!ws[j]) continue;
          kelimeler.push({ metin: buyuk ? ws[j].toLocaleUpperCase('tr') : ws[j], vurgu: vurguda });
        }
      }
      return kelimeler;
    }).filter(function (k) { return k.length; });
  }

  function fontDizgi(st, px) {
    return (st.italik ? 'italic ' : '') + st.agirlik + ' ' + Math.round(px) + 'px "' + st.font + '", sans-serif';
  }

  /**
   * Kelimelerin yerlerini hesaplar. Uzun satirlar genislige gore sarilir.
   * @returns {{kelimeler:[], px, satirYuk}}
   */
  function yerlesim(g, W, H, metin, st, o) {
    var px = W * 0.082 * (o.boyut || 1);
    if (st.buyuk) px *= 0.95;
    g.font = fontDizgi(st, px);
    var bosluk = g.measureText(' ').width;
    var maxW = W * 0.84;
    var satirYuk = px * (st.font === ANTON ? 1.12 : 1.22);

    // Sar
    var satirlar = [];
    coz(metin, st.buyuk).forEach(function (sat) {
      var cur = [], curW = 0;
      sat.forEach(function (k) {
        var w = g.measureText(k.metin).width;
        if (cur.length && curW + bosluk + w > maxW) { satirlar.push(cur); cur = []; curW = 0; }
        cur.push({ metin: k.metin, vurgu: k.vurgu, w: w });
        curW += (cur.length > 1 ? bosluk : 0) + w;
      });
      if (cur.length) satirlar.push(cur);
    });

    // Hap kutusu kelimenin iki yanina tasar; yalnizca vurgulu kelimenin
    // yanina pay birak, digerleri normal aralikta kalsin
    var hapPay = st.vurguKutu ? px * 0.22 : 0;
    function ara(onceki, k) {
      return bosluk + (onceki.vurgu ? hapPay : 0) + (k.vurgu ? hapPay : 0);
    }
    var toplamH = satirlar.length * satirYuk;
    var y0 = H * (o.konum == null ? 0.5 : o.konum) - toplamH / 2 + satirYuk / 2;
    var hepsi = [];
    var sira = 0;
    satirlar.forEach(function (sat, si) {
      var genislik = 0;
      sat.forEach(function (k, i) { genislik += k.w + (i ? ara(sat[i - 1], k) : 0); });
      var x = W / 2 - genislik / 2;
      sat.forEach(function (k, i) {
        if (i) x += ara(sat[i - 1], k);
        hepsi.push({ metin: k.metin, vurgu: k.vurgu, w: k.w, x: x, y: y0 + si * satirYuk, satir: si, sira: sira++ });
        x += k.w;
      });
    });
    return { kelimeler: hepsi, px: px, satirYuk: satirYuk, satirSayisi: satirlar.length };
  }

  /* ---------------------------------------------------------------- */
  /*  Animasyon                                                        */
  /* ---------------------------------------------------------------- */

  function sinirla(x) { return Math.max(0, Math.min(1, x)); }
  function cikis(x) { return 1 - Math.pow(1 - x, 3); }
  function geriTepme(x) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  /** Giris animasyonunun suresi (saniye) — kac karenin degisecegini belirler */
  function girisSuresi(anim, yer) {
    var n = yer.kelimeler.length;
    var harf = 0;
    yer.kelimeler.forEach(function (k) { harf += k.metin.length; });
    switch (anim) {
      case 'pop': return 0.38;
      case 'yukari': return 0.45;
      case 'kelime': return Math.min(2.2, 0.13 * n + 0.25);
      case 'daktilo': return Math.min(1.8, 0.045 * harf + 0.1);
      default: return 0;
    }
  }
  var CIKIS_SN = 0.25;

  /**
   * t anindaki her kelimenin durumu: gorunurluk, olcek, dikey kayma,
   * gorunen harf sayisi.
   */
  function durum(anim, yer, t, sure) {
    var giris = girisSuresi(anim, yer);
    var genelAlfa = 1;
    if (anim !== 'yok' && sure > CIKIS_SN * 2) {
      genelAlfa = sinirla((sure - t) / CIKIS_SN);
    }
    var n = yer.kelimeler.length;
    var harfToplam = 0;
    yer.kelimeler.forEach(function (k) { harfToplam += k.metin.length; });
    var harfSayac = 0;

    return yer.kelimeler.map(function (k) {
      var d = { a: genelAlfa, s: 1, dy: 0, harf: k.metin.length };
      if (anim === 'pop') {
        var p = sinirla(t / giris);
        d.s = 0.55 + 0.45 * geriTepme(p);
        d.a *= sinirla(p * 3);
      } else if (anim === 'yukari') {
        var q = cikis(sinirla(t / giris));
        d.dy = (1 - q) * yer.px * 0.6;
        d.a *= q;
      } else if (anim === 'kelime') {
        var basla = n > 1 ? (k.sira / n) * (giris - 0.25) : 0;
        var r = sinirla((t - basla) / 0.22);
        d.s = 0.7 + 0.3 * geriTepme(r);
        d.a *= sinirla(r * 2.5);
      } else if (anim === 'daktilo') {
        var gorunen = Math.floor(sinirla(t / giris) * harfToplam + 1e-6);
        d.harf = Math.max(0, Math.min(k.metin.length, gorunen - harfSayac));
        harfSayac += k.metin.length;
      }
      return d;
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Cizim                                                            */
  /* ---------------------------------------------------------------- */

  function yuvarlakKutu(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function boya(g, renk, y, px) {
    if (Object.prototype.toString.call(renk) === '[object Array]') {
      var gr = g.createLinearGradient(0, y - px * 0.5, 0, y + px * 0.4);
      gr.addColorStop(0, renk[0]);
      gr.addColorStop(1, renk[1]);
      return gr;
    }
    return renk;
  }

  /**
   * Tek kareyi cizer. g'nin tuvali W x H ve saydam olmali.
   * @param {Object} o {metin, stil, anim, t, sure, boyut, konum}
   */
  function ciz(g, W, H, o) {
    var st = stil(o.stil);
    g.clearRect(0, 0, W, H);
    var yer = yerlesim(g, W, H, o.metin, st, o);
    if (!yer.kelimeler.length) return yer;
    var dur = durum(o.anim || 'yok', yer, o.t || 0, o.sure || 3);
    var px = yer.px;
    g.font = fontDizgi(st, px);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.lineJoin = 'round';
    if ('letterSpacing' in g && st.aralik) g.letterSpacing = (st.aralik * px) + 'px';

    // Satir kutusu (Kutulu stil): satirin tamamina, gorunen kelimelere gore
    if (st.kutu) {
      for (var s = 0; s < yer.satirSayisi; s++) {
        var ilk = null, son = null, alfa = 0;
        for (var i = 0; i < yer.kelimeler.length; i++) {
          var kk = yer.kelimeler[i];
          if (kk.satir !== s || dur[i].a <= 0 || dur[i].harf <= 0) continue;
          if (!ilk) ilk = kk;
          son = kk;
          alfa = Math.max(alfa, dur[i].a);
        }
        if (!ilk) continue;
        var sonW = son === ilk || !son ? ilk.w : son.w;
        var px2 = px * 0.38, py2 = px * 0.16;
        g.save();
        g.globalAlpha = alfa;
        g.fillStyle = st.kutu;
        yuvarlakKutu(g, ilk.x - px2, ilk.y - yer.satirYuk / 2 + py2 * 0.4,
          (son.x + sonW) - ilk.x + px2 * 2, yer.satirYuk - py2 * 0.4, px * 0.22);
        g.fill();
        g.restore();
      }
    }

    for (var j = 0; j < yer.kelimeler.length; j++) {
      var k = yer.kelimeler[j];
      var d = dur[j];
      if (d.a <= 0.001 || d.harf <= 0) continue;
      var metin = d.harf < k.metin.length ? k.metin.slice(0, d.harf) : k.metin;
      var cx = k.x + k.w / 2, cy = k.y;

      g.save();
      g.globalAlpha = d.a;
      g.translate(cx, cy + d.dy);
      g.scale(d.s, d.s);
      g.translate(-cx, -cy);

      // Vurgu hapi
      if (k.vurgu && st.vurguKutu) {
        var hp = px * 0.22;
        g.fillStyle = st.vurguKutu;
        yuvarlakKutu(g, k.x - hp, k.y - px * 0.58, k.w + hp * 2, px * 1.12, px * 0.2);
        g.fill();
      }

      var renk = boya(g, k.vurgu ? st.vurgu : st.dolgu, k.y, px);

      // Golge / parilti: once ayri bir gecis — kontur ve dolgu keskin kalsin
      if (st.golge || st.parilti) {
        var gl = st.parilti || st.golge;
        g.shadowColor = gl[1];
        g.shadowBlur = gl[0] * (W / 1080);
        g.shadowOffsetY = st.golge ? (st.golge[2] || 0) * (W / 1080) : 0;
        g.fillStyle = renk;
        g.fillText(metin, k.x, k.y);
        if (st.parilti) g.fillText(metin, k.x, k.y);   // parilti iki kat
        g.shadowColor = 'transparent';
        g.shadowBlur = 0;
        g.shadowOffsetY = 0;
      }
      if (st.kontur) {
        g.lineWidth = px * st.kontur[0];
        g.strokeStyle = st.kontur[1];
        g.strokeText(metin, k.x, k.y);
      }
      g.fillStyle = renk;
      g.fillText(metin, k.x, k.y);
      g.restore();
    }
    return yer;
  }

  /* ---------------------------------------------------------------- */
  /*  PNG dizisi                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Butun kareleri cizip yazar.
   *
   * Giris ve cikis disindaki kareler birbirinin aynisi: PNG'yi bir kez
   * kodlayip ayni baytlari tekrar yaziyoruz. 3 saniyelik bir yazida
   * 90 kare yerine ~20 kodlama — fark saniyeler.
   *
   * @param {Object} o  ciz() secenekleri + fps, sure
   * @param {Function} yaz  (kareNo, base64) -> void
   * @param {Function} [ilerleme]  (oran) -> void
   * @returns {Promise<{kare, kodlanan}>}
   */
  function kareleriUret(W, H, o, yaz, ilerleme) {
    var cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    var g = cv.getContext('2d');
    var fps = o.fps || 30;
    var sure = Math.max(0.3, o.sure || 3);
    var anim = o.anim || 'yok';
    var toplam = Math.max(1, Math.round(sure * fps));

    var yer = yerlesim(g, W, H, o.metin, stil(o.stil), o);
    var giris = girisSuresi(anim, yer);
    var cikisBas = anim === 'yok' ? Infinity : sure - CIKIS_SN;

    var onbellek = null;
    var kodlanan = 0;
    var i = 0;

    return new Promise(function (coz2, red) {
      function adim() {
        try {
          // Arayuz donmasin diye parca parca
          var bitis = Math.min(toplam, i + 6);
          for (; i < bitis; i++) {
            var t = i / fps;
            var sabit = t >= giris && t < cikisBas;
            var veri;
            if (sabit && onbellek) {
              veri = onbellek;
            } else {
              ciz(g, W, H, { metin: o.metin, stil: o.stil, anim: anim, t: t, sure: sure,
                             boyut: o.boyut, konum: o.konum });
              veri = cv.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
              kodlanan++;
              if (sabit) onbellek = veri;
            }
            yaz(i, veri);
          }
          if (ilerleme) ilerleme(i / toplam);
          if (i < toplam) setTimeout(adim, 0);
          else coz2({ kare: toplam, kodlanan: kodlanan });
        } catch (e) { red(e); }
      }
      adim();
    });
  }

  kok.TKYazi = {
    STILLER: STILLER, ANIMLER: ANIMLER, stil: stil,
    fontlariYukle: fontlariYukle, coz: coz, ciz: ciz,
    girisSuresi: girisSuresi, kareleriUret: kareleriUret, CIKIS_SN: CIKIS_SN
  };
})(typeof window !== 'undefined' ? window : this);
