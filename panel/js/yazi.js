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
 * ANIMASYON MODELI: yazi BIRIMLERE bolunur (harf, kelime ya da satir).
 * Her birim sirayla, "ara" kadar gecikmeyle baslar ve "sure" boyunca
 * 0'dan 1'e ilerler. Animasyon bu ilerlemeyi bir donusume cevirir:
 * saydamlik, kayma, olcek, donme, bulaniklik, iz (harf araligi), silme.
 * Yeni bir animasyon eklemek tek satir.
 *
 * Stiller ve animasyonlar TK Labs'in. Yazi tipleri OFL lisansli
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
      golge: [14, 'rgba(0,0,0,.6)', 3] },
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

  function stil(id) {
    for (var i = 0; i < STILLER.length; i++) if (STILLER[i].id === id) return STILLER[i];
    return STILLER[0];
  }

  /* ---------------------------------------------------------------- */
  /*  Yumusatma egrileri (standart Penner egrileri)                    */
  /* ---------------------------------------------------------------- */

  function sinirla(x) { return Math.max(0, Math.min(1, x)); }
  var Y = {
    cikis: function (u) { return 1 - Math.pow(1 - u, 3); },
    ikiYan: function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    geri: function (u) {
      var c1 = 1.7, c3 = c1 + 1;
      return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
    },
    sicra: function (u) {
      var n = 7.5625, d = 2.75;
      if (u < 1 / d) return n * u * u;
      if (u < 2 / d) { u -= 1.5 / d; return n * u * u + 0.75; }
      if (u < 2.5 / d) { u -= 2.25 / d; return n * u * u + 0.9375; }
      u -= 2.625 / d; return n * u * u + 0.984375;
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Animasyonlar                                                     */
  /* ---------------------------------------------------------------- */

  /*
   * birim: 'harf' | 'kelime' | 'satir'
   * ara: birimler arasi gecikme (sn), sure: bir birimin animasyonu (sn)
   * f(p, r): p 0->1 ilerleme, r birime ozgu sabit rastgele sayi.
   *   Donen alanlar (hepsi istege bagli):
   *   a saydamlik, dx/dy kayma (yazi boyu cinsinden), s olcek, sy dikey olcek,
   *   don donme (radyan), bul bulaniklik (yazi boyu cinsinden),
   *   iz harf araligi (yazi boyu cinsinden), sil soldan aciklik (0-1),
   *   isik vurgu rengine gecis (0-1), rgb renk kaymasi (yazi boyu cinsinden)
   * maske: satirin disina tasan kisim gorunmez (asagidan yukselme icin)
   * karisik: birimler rastgele sirayla gelir
   * imlec: daktilo imleci
   */
  var ANIMLER = [
    { id: 'h-belir', ad: 'Belirme', grup: 'Harf', birim: 'harf', ara: 0.028, sure: 0.35,
      f: function (p) { return { a: p }; } },
    { id: 'h-daktilo', ad: 'Daktilo', grup: 'Harf', birim: 'harf', ara: 0.05, sure: 0.001, imlec: true,
      f: function (p) { return { a: p > 0 ? 1 : 0 }; } },
    { id: 'h-karisik', ad: 'Karışık', grup: 'Harf', birim: 'harf', ara: 0.026, sure: 0.4, karisik: true,
      f: function (p) { return { a: Y.cikis(p) }; } },
    { id: 'h-yukari', ad: 'Yükselme', grup: 'Harf', birim: 'harf', ara: 0.028, sure: 0.45,
      f: function (p) { return { a: sinirla(p * 2), dy: (1 - Y.cikis(p)) * 0.55 }; } },
    { id: 'h-pop', ad: 'Pop', grup: 'Harf', birim: 'harf', ara: 0.032, sure: 0.4,
      f: function (p) { return { a: sinirla(p * 3), s: Y.geri(p) }; } },
    { id: 'h-bulanik', ad: 'Netleşme', grup: 'Harf', birim: 'harf', ara: 0.028, sure: 0.5,
      f: function (p) { var q = 1 - Y.cikis(p); return { a: p, bul: q * 0.22, s: 1 + q * 0.2 }; } },
    { id: 'h-sicra', ad: 'Sıçrama', grup: 'Harf', birim: 'harf', ara: 0.036, sure: 0.6,
      f: function (p) { return { a: sinirla(p * 3), dy: (1 - Y.sicra(p)) * 0.85 }; } },
    { id: 'h-don', ad: 'Dönerek', grup: 'Harf', birim: 'harf', ara: 0.032, sure: 0.5,
      f: function (p) { return { a: sinirla(p * 2), don: (1 - Y.geri(p)) * 0.85, dy: (1 - Y.cikis(p)) * 0.3 }; } },
    { id: 'h-cevir', ad: 'Çevirme', grup: 'Harf', birim: 'harf', ara: 0.036, sure: 0.5,
      f: function (p) { return { a: sinirla(p * 2), sy: Y.geri(p) }; } },
    { id: 'h-iz', ad: 'Açılma', grup: 'Harf', birim: 'satir', ara: 0.1, sure: 0.9,
      f: function (p) { var q = 1 - Y.cikis(p); return { a: sinirla(p * 1.6), iz: q * 0.45, bul: q * 0.07 }; } },
    { id: 'h-bozuk', ad: 'Bozulma', grup: 'Harf', birim: 'harf', ara: 0.02, sure: 0.38, karisik: true,
      f: function (p, r) {
        return { a: p > 0.05 ? (p < 0.6 ? (r > 0.5 ? 1 : 0.25) : 1) : 0,
                 dx: p < 0.7 ? (r - 0.5) * 0.35 : 0, rgb: p < 0.7 ? 0.05 : 0 };
      } },

    { id: 'k-belir', ad: 'Belirme', grup: 'Kelime', birim: 'kelime', ara: 0.11, sure: 0.4,
      f: function (p) { return { a: p, dy: (1 - Y.cikis(p)) * 0.15 }; } },
    { id: 'k-karisik', ad: 'Karışık', grup: 'Kelime', birim: 'kelime', ara: 0.1, sure: 0.4, karisik: true,
      f: function (p) { return { a: p, s: 0.9 + 0.1 * Y.cikis(p) }; } },
    { id: 'k-yukari', ad: 'Yükselme', grup: 'Kelime', birim: 'kelime', ara: 0.1, sure: 0.5,
      f: function (p) { return { a: sinirla(p * 2), dy: (1 - Y.cikis(p)) * 0.7 }; } },
    { id: 'k-sol', ad: 'Soldan', grup: 'Kelime', birim: 'kelime', ara: 0.1, sure: 0.5,
      f: function (p) { return { a: sinirla(p * 2), dx: -(1 - Y.cikis(p)) * 1.1 }; } },
    { id: 'k-sag', ad: 'Sağdan', grup: 'Kelime', birim: 'kelime', ara: 0.1, sure: 0.5,
      f: function (p) { return { a: sinirla(p * 2), dx: (1 - Y.cikis(p)) * 1.1 }; } },
    { id: 'k-pop', ad: 'Pop', grup: 'Kelime', birim: 'kelime', ara: 0.12, sure: 0.45,
      f: function (p) { return { a: sinirla(p * 3), s: Y.geri(p) }; } },
    { id: 'k-bulanik', ad: 'Netleşme', grup: 'Kelime', birim: 'kelime', ara: 0.12, sure: 0.55,
      f: function (p) { return { a: p, bul: (1 - Y.cikis(p)) * 0.28 }; } },
    { id: 'k-akis', ad: 'Vurgu Akışı', grup: 'Kelime', birim: 'kelime', ara: 0.24, sure: 0.22,
      f: function (p) { return { a: 0.35 + 0.65 * p, isik: p < 1 ? p : 0 }; } },
    { id: 'k-dusus', ad: 'Düşüş', grup: 'Kelime', birim: 'kelime', ara: 0.1, sure: 0.6,
      f: function (p) { return { a: sinirla(p * 3), dy: -(1 - Y.sicra(p)) * 1.1 }; } },

    { id: 's-maske', ad: 'Maskeden', grup: 'Satır', birim: 'satir', ara: 0.12, sure: 0.6, maske: true,
      f: function (p) { return { dy: (1 - Y.cikis(p)) * 1.1 }; } },
    { id: 's-sil', ad: 'Silerek', grup: 'Satır', birim: 'satir', ara: 0.15, sure: 0.6,
      f: function (p) { return { sil: Y.ikiYan(p) }; } },
    { id: 's-zoom', ad: 'Zoom Vuruş', grup: 'Satır', birim: 'satir', ara: 0.1, sure: 0.45,
      f: function (p) { var q = Y.cikis(p); return { a: sinirla(p * 2.5), s: 1.55 - 0.55 * q, bul: (1 - q) * 0.1 }; } },
    { id: 's-belir', ad: 'Yumuşak', grup: 'Satır', birim: 'satir', ara: 0.15, sure: 0.7,
      f: function (p) { return { a: Y.ikiYan(p), dy: (1 - Y.cikis(p)) * 0.12 }; } },
    { id: 'yok', ad: 'Sabit', grup: 'Satır', birim: 'satir', ara: 0, sure: 0, f: function () { return {}; } }
  ];

  /* Cikis animasyonlari: yazinin tamamina, son CIKIS_SN saniyede */
  var CIKISLAR = [
    { id: 'yok', ad: 'Yok' },
    { id: 'solma', ad: 'Solma' },
    { id: 'asagi', ad: 'Aşağı' },
    { id: 'bulanik', ad: 'Bulanık' },
    { id: 'kucul', ad: 'Küçül' },
    { id: 'sil', ad: 'Sil' }
  ];
  var CIKIS_SN = 0.3;

  function anim(id) {
    for (var i = 0; i < ANIMLER.length; i++) if (ANIMLER[i].id === id) return ANIMLER[i];
    // Eski surumden kayitli kimlikler
    var eski = { pop: 'k-pop', yukari: 'k-yukari', kelime: 'k-pop', daktilo: 'h-daktilo' };
    if (eski[id]) return anim(eski[id]);
    return anim('yok');
  }

  /* ---------------------------------------------------------------- */
  /*  Yazi tipleri                                                     */
  /* ---------------------------------------------------------------- */

  var fontSozu = null;
  /**
   * Yazi tiplerini yukler. Canvas, @font-face'i ancak YUKLENMIS ise
   * kullanir; yuklenmeden cizilirse sessizce sistem yazi tipine duser
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
   * Kelime ve HARF konumlarini hesaplar. Harf konumu onceki harflerin
   * olculen genisligi: tek tek cizilen harfler, butun cizilen kelimeyle
   * ayni yere duser (kerning dahil).
   */
  function yerlesim(g, W, H, metin, st, o) {
    var px = W * 0.082 * (o.boyut || 1);
    if (st.buyuk) px *= 0.95;
    g.font = fontDizgi(st, px);
    var bosluk = g.measureText(' ').width;
    var maxW = W * 0.84;
    var satirYuk = px * (st.font === ANTON ? 1.12 : 1.22);

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

    // Hap kutusu yalnizca vurgulu kelimenin yanina tasar
    var hapPay = st.vurguKutu ? px * 0.22 : 0;
    function ara(onceki, k) {
      return bosluk + (onceki.vurgu ? hapPay : 0) + (k.vurgu ? hapPay : 0);
    }

    var toplamH = satirlar.length * satirYuk;
    var y0 = H * (o.konum == null ? 0.5 : o.konum) - toplamH / 2 + satirYuk / 2;
    var kelimeler = [], harfler = [], satirBilgi = [];
    var ks = 0, hs = 0;
    satirlar.forEach(function (sat, si) {
      var genislik = 0;
      sat.forEach(function (k, i) { genislik += k.w + (i ? ara(sat[i - 1], k) : 0); });
      var x = W / 2 - genislik / 2;
      var y = y0 + si * satirYuk;
      var satirHarf = 0;
      satirBilgi.push({ x: x, w: genislik, y: y, harfBas: hs });
      sat.forEach(function (k, i) {
        if (i) x += ara(sat[i - 1], k);
        var kel = { metin: k.metin, vurgu: k.vurgu, w: k.w, x: x, y: y, satir: si, sira: ks++, harfler: [] };
        // Turkce buyuk harfler (İ) tek kod noktasi; Array.from yerine
        // dizgi uzerinde dolasmak ES5 uyumlu ve vekil cift sorunu yok
        for (var c = 0; c < k.metin.length; c++) {
          var hx = x + g.measureText(k.metin.slice(0, c)).width;
          var hw = g.measureText(k.metin.charAt(c)).width;
          var h = { ch: k.metin.charAt(c), x: hx, w: hw, y: y, kelime: kel.sira, satir: si,
                    sira: hs++, satirSira: satirHarf++, vurgu: k.vurgu };
          kel.harfler.push(h);
          harfler.push(h);
        }
        kelimeler.push(kel);
        x += k.w;
      });
      satirBilgi[si].harfSay = satirHarf;
    });
    return { kelimeler: kelimeler, harfler: harfler, satirlar: satirBilgi, px: px,
             satirYuk: satirYuk, satirSayisi: satirlar.length,
             ust: y0 - satirYuk / 2, alt: y0 + toplamH - satirYuk / 2 };
  }

  /* ---------------------------------------------------------------- */
  /*  Zamanlama                                                        */
  /* ---------------------------------------------------------------- */

  /** Birim sayisi: harf / kelime / satir */
  function birimSayisi(an, yer) {
    if (an.birim === 'harf') return yer.harfler.length;
    if (an.birim === 'kelime') return yer.kelimeler.length;
    return yer.satirSayisi;
  }

  /** Birimin indeksi */
  function birimNo(an, h) {
    if (an.birim === 'harf') return h.sira;
    if (an.birim === 'kelime') return h.kelime;
    return h.satir;
  }

  /** Sabit tohumlu rastgele: ayni yazi her karede ayni sirayla gelmeli */
  function rastgele(n) {
    var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /** Karisik sira: 0..n-1'in sabit bir permutasyonu */
  function karisikSira(n) {
    var dizi = [];
    for (var i = 0; i < n; i++) dizi.push(i);
    for (var j = n - 1; j > 0; j--) {
      var k = Math.floor(rastgele(j + 7) * (j + 1));
      var t = dizi[j]; dizi[j] = dizi[k]; dizi[k] = t;
    }
    return dizi;
  }

  /** Giris animasyonunun toplam suresi (sn) */
  function girisSuresi(animId, yer) {
    var an = anim(animId);
    if (an.id === 'yok') return 0;
    var n = birimSayisi(an, yer);
    return Math.max(0, n - 1) * an.ara + an.sure;
  }

  /* ---------------------------------------------------------------- */
  /*  Cizim                                                            */
  /* ---------------------------------------------------------------- */

  function yuvarlakKutu(g, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
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

  /** Bir harfi/kelimeyi stilin katmanlariyla cizer (golge, kontur, dolgu) */
  function katmanli(g, st, metin, x, y, renk, olc, rgb, px) {
    if (rgb) {
      // Bozulma: kirmizi/camgobegi kaymis kopyalar
      g.save();
      g.globalAlpha *= 0.7;
      g.fillStyle = 'rgba(255,40,80,.9)';
      g.fillText(metin, x - rgb * px, y);
      g.fillStyle = 'rgba(40,220,255,.9)';
      g.fillText(metin, x + rgb * px, y);
      g.restore();
    }
    if (st.golge || st.parilti) {
      var gl = st.parilti || st.golge;
      g.shadowColor = gl[1];
      g.shadowBlur = gl[0] * olc;
      g.shadowOffsetY = st.golge ? (st.golge[2] || 0) * olc : 0;
      g.fillStyle = renk;
      g.fillText(metin, x, y);
      if (st.parilti) g.fillText(metin, x, y);
      g.shadowColor = 'transparent';
      g.shadowBlur = 0;
      g.shadowOffsetY = 0;
    }
    if (st.kontur) {
      g.lineWidth = px * st.kontur[0];
      g.strokeStyle = st.kontur[1];
      g.strokeText(metin, x, y);
    }
    g.fillStyle = renk;
    g.fillText(metin, x, y);
  }

  /** Renk karisimi (yalnizca #rrggbb) — vurgu akisi icin */
  function karistir(a, b, t) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.charAt(0) !== '#' || b.charAt(0) !== '#') {
      return t > 0.5 ? b : a;
    }
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    var gg = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    var bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return 'rgb(' + r + ',' + gg + ',' + bl + ')';
  }

  /**
   * Tek kareyi cizer. g'nin tuvali W x H ve saydam olmali.
   * @param {Object} o {metin, stil, anim, cikis, t, sure, boyut, konum}
   */
  function ciz(g, W, H, o) {
    var st = stil(o.stil);
    g.clearRect(0, 0, W, H);
    var yer = yerlesim(g, W, H, o.metin, st, o);
    if (!yer.harfler.length) return yer;

    var an = anim(o.anim || 'yok');
    var t = o.t || 0;
    var sure = o.sure || 3;
    var px = yer.px;
    var olc = W / 1080;

    // --- Birim durumlari ---
    var n = birimSayisi(an, yer);
    var sira = an.karisik ? karisikSira(n) : null;
    var durum = [];
    for (var b = 0; b < n; b++) {
      var basla = (sira ? sira[b] : b) * an.ara;
      var p = an.id === 'yok' ? 1 : (an.sure <= 0.001 ? (t >= basla ? 1 : 0) : sinirla((t - basla) / an.sure));
      durum.push(an.f(p, rastgele(b + 1)) || {});
      durum[b].p = p;
    }

    // --- Cikis (yazinin tamami) ---
    var cikis = o.cikis || 'yok';
    var po = 1;
    if (an.id !== 'yok' || cikis !== 'yok') {
      if (cikis !== 'yok' && sure > CIKIS_SN * 2) po = sinirla((sure - t) / CIKIS_SN);
    }
    var co = Y.cikis(po);
    var genel = { a: 1, dy: 0, s: 1, bul: 0, sil: 1 };
    if (po < 1) {
      if (cikis === 'solma') genel.a = co;
      else if (cikis === 'asagi') { genel.a = co; genel.dy = (1 - co) * px * 0.6; }
      else if (cikis === 'bulanik') { genel.a = co; genel.bul = (1 - co) * px * 0.3; }
      else if (cikis === 'kucul') { genel.a = co; genel.s = 0.75 + 0.25 * co; }
      else if (cikis === 'sil') genel.sil = co;
    }

    g.font = fontDizgi(st, px);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.lineJoin = 'round';

    var merkezY = (yer.ust + yer.alt) / 2;
    g.save();
    g.globalAlpha = genel.a;
    if (genel.s !== 1 || genel.dy) {
      g.translate(W / 2, merkezY + genel.dy);
      g.scale(genel.s, genel.s);
      g.translate(-W / 2, -merkezY);
    }
    if (genel.sil < 1) {
      // Cikista soldan saga silinir: gorunen kisim sagda kalir
      var solSinir = W * 0.08 + W * 0.84 * (1 - genel.sil);
      g.beginPath();
      g.rect(solSinir, 0, W, H);
      g.clip();
    }

    // Bir harfin bagli oldugu birimin durumu
    function hd(h) { return durum[birimNo(an, h)] || {}; }

    // --- Satir kutulari (Kutulu stil) ---
    if (st.kutu) {
      for (var s = 0; s < yer.satirlar.length; s++) {
        var sb = yer.satirlar[s];
        var alfa = 0;
        for (var hi = sb.harfBas; hi < sb.harfBas + sb.harfSay; hi++) {
          var d0 = hd(yer.harfler[hi]);
          alfa = Math.max(alfa, d0.a == null ? 1 : d0.a);
        }
        if (alfa <= 0) continue;
        var pdx = px * 0.38, pdy = px * 0.06;
        g.save();
        g.globalAlpha *= alfa;
        // Satir animasyonunda kutu yaziyla birlikte hareket etsin
        if (an.birim === 'satir') {
          var ds = durum[s] || {};
          var scx = sb.x + sb.w / 2;
          g.translate(scx + (ds.dx || 0) * px, sb.y + (ds.dy || 0) * px);
          var sk = ds.s == null ? 1 : ds.s;
          g.scale(sk, sk * (ds.sy == null ? 1 : ds.sy));
          g.translate(-scx, -sb.y);
          if (ds.sil != null) {
            g.beginPath();
            g.rect(sb.x - pdx, sb.y - yer.satirYuk, (sb.w + pdx * 2) * ds.sil, yer.satirYuk * 2);
            g.clip();
          }
        }
        g.fillStyle = st.kutu;
        yuvarlakKutu(g, sb.x - pdx, sb.y - yer.satirYuk / 2 + pdy, sb.w + pdx * 2, yer.satirYuk - pdy, px * 0.22);
        g.fill();
        g.restore();
      }
    }

    // --- Vurgu haplari (Hap stil) ---
    if (st.vurguKutu) {
      for (var vk = 0; vk < yer.kelimeler.length; vk++) {
        var kel = yer.kelimeler[vk];
        if (!kel.vurgu) continue;
        // Hap, kelimenin harflerinin ORTALAMA hareketini izler
        var ka = 0, ks2 = 0, kdx = 0, kdy = 0;
        for (var kh = 0; kh < kel.harfler.length; kh++) {
          var dk = hd(kel.harfler[kh]);
          ka += dk.a == null ? 1 : dk.a;
          ks2 += dk.s == null ? 1 : dk.s;
          kdx += dk.dx || 0;
          kdy += dk.dy || 0;
        }
        var kn = kel.harfler.length;
        ka /= kn; ks2 /= kn; kdx /= kn; kdy /= kn;
        if (ka <= 0) continue;
        var hp = px * 0.22;
        var kcx = kel.x + kel.w / 2;
        g.save();
        g.globalAlpha *= ka;
        g.translate(kcx + kdx * px, kel.y + kdy * px);
        g.scale(ks2, ks2);
        g.translate(-kcx, -kel.y);
        g.fillStyle = st.vurguKutu;
        yuvarlakKutu(g, kel.x - hp, kel.y - px * 0.58, kel.w + hp * 2, px * 1.12, px * 0.2);
        g.fill();
        g.restore();
      }
    }

    // --- Harfler ---
    var imlecX = null, imlecY = 0;
    for (var i = 0; i < yer.harfler.length; i++) {
      var h = yer.harfler[i];
      var d = hd(h);
      var a = d.a == null ? 1 : d.a;
      if (a <= 0.003) continue;
      if (h.ch === ' ') continue;

      // Donusumun ekseni biriminin merkezi: kelime pop'unda kelime
      // butun olarak buyur, harf pop'unda her harf kendi merkezinde
      var cx, cy = h.y;
      if (an.birim === 'harf') cx = h.x + h.w / 2;
      else if (an.birim === 'kelime') { var kk = yer.kelimeler[h.kelime]; cx = kk.x + kk.w / 2; }
      else { var ss = yer.satirlar[h.satir]; cx = ss.x + ss.w / 2; }

      var x = h.x, y = h.y;
      if (d.iz) {
        var sat = yer.satirlar[h.satir];
        x += (h.satirSira - (sat.harfSay - 1) / 2) * d.iz * px * 0.5;
      }

      g.save();
      g.globalAlpha *= a;
      var bul = (d.bul ? d.bul * px : 0) + genel.bul;
      if (bul > 0.3) g.filter = 'blur(' + bul.toFixed(1) + 'px)';

      // Maske ya da silme: satirin kutusu disi gorunmez
      if (an.maske || d.sil != null) {
        var sm = yer.satirlar[h.satir];
        g.beginPath();
        if (d.sil != null) g.rect(sm.x - px, sm.y - yer.satirYuk, (sm.w + px * 2) * d.sil, yer.satirYuk * 2);
        else g.rect(0, sm.y - yer.satirYuk * 0.62, W, yer.satirYuk * 1.24);
        g.clip();
      }

      g.translate(cx + (d.dx || 0) * px, cy + (d.dy || 0) * px);
      if (d.don) g.rotate(d.don);
      var s1 = d.s == null ? 1 : d.s;
      var sy = d.sy == null ? 1 : d.sy;
      if (s1 !== 1 || sy !== 1) g.scale(s1, s1 * sy);
      g.translate(-cx, -cy);

      var renk = h.vurgu ? st.vurgu : st.dolgu;
      if (d.isik) renk = karistir(typeof st.dolgu === 'string' ? st.dolgu : '#ffffff',
                                  typeof st.vurgu === 'string' && st.vurgu !== st.dolgu ? st.vurgu : '#ffd60a', d.isik);
      katmanli(g, st, h.ch, x, y, boya(g, renk, y, px), olc, d.rgb || 0, px);
      g.restore();

      if (an.imlec && a > 0) { imlecX = h.x + h.w; imlecY = h.y; }
    }

    // Daktilo imleci: yazarken gorunur, bitince kaybolur
    if (an.imlec && imlecX !== null && t < girisSuresi(an.id, yer) + 0.15) {
      g.fillStyle = typeof st.dolgu === 'string' ? st.dolgu : '#ffffff';
      g.fillRect(imlecX + px * 0.05, imlecY - px * 0.42, Math.max(2, px * 0.07), px * 0.84);
    }
    g.restore();
    return yer;
  }

  /* ---------------------------------------------------------------- */
  /*  PNG dizisi                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Butun kareleri cizip yazar.
   *
   * Giris ve cikis disindaki kareler birbirinin aynisi: PNG'yi bir kez
   * kodlayip ayni baytlari tekrar yaziyoruz.
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
    var toplam = Math.max(1, Math.round(sure * fps));

    var yer = yerlesim(g, W, H, o.metin, stil(o.stil), o);
    var giris = girisSuresi(o.anim || 'yok', yer) + 0.05;
    var cikisBas = (o.cikis && o.cikis !== 'yok') ? sure - CIKIS_SN : Infinity;

    var onbellek = null;
    var kodlanan = 0;
    var i = 0;

    return new Promise(function (coz2, red) {
      function adim() {
        try {
          var bitis = Math.min(toplam, i + 6);
          for (; i < bitis; i++) {
            var t = i / fps;
            var sabit = t >= giris && t < cikisBas;
            var veri;
            if (sabit && onbellek) {
              veri = onbellek;
            } else {
              ciz(g, W, H, { metin: o.metin, stil: o.stil, anim: o.anim, cikis: o.cikis, t: t,
                             sure: sure, boyut: o.boyut, konum: o.konum });
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
    STILLER: STILLER, ANIMLER: ANIMLER, CIKISLAR: CIKISLAR, stil: stil, anim: anim,
    fontlariYukle: fontlariYukle, coz: coz, ciz: ciz,
    girisSuresi: function (animId, yerOrMetin) { return girisSuresi(animId, yerOrMetin); },
    kareleriUret: kareleriUret, CIKIS_SN: CIKIS_SN
  };
})(typeof window !== 'undefined' ? window : this);
