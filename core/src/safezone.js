'use strict';

/**
 * Sosyal medya guvenli alan (safe zone) tanimlari.
 *
 * Neden ORAN, piksel degil: guvenli alani belirleyen sey platformun arayuz
 * elemanlaridir (profil, begeni butonlari, aciklama alani) ve bunlar telefon
 * ekranina gore olceklenir. Piksel yazarsak yalnizca 1080x1920'de dogru olur;
 * oran yazinca 720p, 4K, hatta 1:1 sekansta da dogru kalir.
 *
 * DIKKAT — bu degerler YAKLASIKTIR. Platformlarin arayuzu surekli degisiyor
 * ve hicbiri resmi, sabit bir olcu yayinlamiyor. Yaygin kullanilan degerleri
 * temel aldik; kesin garanti vermiyoruz. Panelden ayarlanabilir olmasinin
 * sebebi budur — kendi olcumunuzu yapip degistirebilirsiniz.
 */

const PRESETS = {
  'instagram-reels': {
    label: 'Instagram Reels',
    aspect: '9:16',
    // Ust: kullanici adi ve ses bilgisi. Alt: aciklama metni ve alt cubuk.
    // Sag: begeni / yorum / paylas / daha fazla butonlari.
    top: 0.13,
    bottom: 0.22,
    left: 0.055,
    right: 0.17,
    note: 'Sağ kenar etkileşim butonları için geniş bırakılır.'
  },
  'instagram-story': {
    label: 'Instagram Story',
    aspect: '9:16',
    top: 0.13,
    bottom: 0.14,
    left: 0.055,
    right: 0.055,
    note: 'Reels’e göre sağ kenar dar; buton sütunu yok.'
  },
  'instagram-feed': {
    label: 'Instagram Feed (4:5)',
    aspect: '4:5',
    top: 0.06,
    bottom: 0.06,
    left: 0.05,
    right: 0.05,
    note: 'Akışta arayüz videonun üstünü kapatmaz; yalnızca kenar payı.'
  },
  'tiktok': {
    label: 'TikTok',
    aspect: '9:16',
    // Alt bant Instagram’dan daha yuksek: kullanici adi + aciklama + muzik satiri
    top: 0.07,
    bottom: 0.25,
    left: 0.055,
    right: 0.12,
    note: 'Alt bant en geniş olan platform.'
  },
  'youtube-shorts': {
    label: 'YouTube Shorts',
    aspect: '9:16',
    top: 0.07,
    bottom: 0.21,
    left: 0.055,
    right: 0.09,
    note: 'Alt kısımda başlık ve kanal satırı bulunur.'
  },
  'youtube-16x9': {
    label: 'YouTube (yatay)',
    aspect: '16:9',
    // Klasik yayin olculeri: baslik guvenli alani %10, eylem alani %5
    top: 0.05,
    bottom: 0.05,
    left: 0.05,
    right: 0.05,
    titleSafe: 0.10,
    note: 'Yayın standardı: dış çizgi eylem, iç çizgi başlık güvenli alanı.'
  }
};

/**
 * Bir preset'i verilen cozunurluk icin PIKSEL dikdortgenine cevirir.
 * @returns {{x,y,w,h}} guvenli alan
 */
function toRect(preset, width, height) {
  const p = typeof preset === 'string' ? PRESETS[preset] : preset;
  if (!p) throw new Error('Bilinmeyen safe zone: ' + preset);
  const x = Math.round(width * p.left);
  const y = Math.round(height * p.top);
  const w = Math.round(width * (1 - p.left - p.right));
  const h = Math.round(height * (1 - p.top - p.bottom));
  return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
}

/** Ikinci (baslik) guvenli alani varsa dondurur, yoksa null */
function toTitleRect(preset, width, height) {
  const p = typeof preset === 'string' ? PRESETS[preset] : preset;
  if (!p || !p.titleSafe) return null;
  const m = p.titleSafe;
  return {
    x: Math.round(width * m),
    y: Math.round(height * m),
    w: Math.round(width * (1 - 2 * m)),
    h: Math.round(height * (1 - 2 * m))
  };
}

/**
 * Platform arayuz elemanlarinin yerlesimi (oran cinsinden).
 *
 * Sadece cizgi gostermek "burasi neden yasak?" sorusunu cevapsiz birakiyor.
 * Begeni kalbi, yorum balonu, kullanici adi gibi elemanlari da cizince
 * kurgucu nereye ne gelecegini goruyor.
 *
 * Bunlar TEMSILIDIR — gercek ikonlarin kopyasi degil, yer tutucudur.
 * Konumlar platform arayuzu degistikce kayar.
 */
const UI = {
  'instagram-reels': [
    { t: 'heart',   x: 0.90, y: 0.585, s: 0.075 },
    { t: 'comment', x: 0.90, y: 0.670, s: 0.075 },
    { t: 'share',   x: 0.90, y: 0.755, s: 0.075 },
    { t: 'more',    x: 0.90, y: 0.838, s: 0.055 },
    { t: 'avatar',  x: 0.09, y: 0.862, s: 0.085 },
    { t: 'text',    x: 0.15, y: 0.855, w: 0.30, h: 0.016 },   // kullanıcı adı
    { t: 'text',    x: 0.06, y: 0.897, w: 0.62, h: 0.014 },   // açıklama 1
    { t: 'text',    x: 0.06, y: 0.919, w: 0.45, h: 0.014 },   // açıklama 2
    { t: 'music',   x: 0.06, y: 0.947, w: 0.40, h: 0.014 }
  ],
  'instagram-story': [
    { t: 'avatar',  x: 0.08, y: 0.055, s: 0.075 },
    { t: 'text',    x: 0.15, y: 0.048, w: 0.28, h: 0.014 },
    { t: 'more',    x: 0.93, y: 0.055, s: 0.050 },
    { t: 'box',     x: 0.06, y: 0.915, w: 0.68, h: 0.045 },   // "mesaj gönder"
    { t: 'heart',   x: 0.83, y: 0.937, s: 0.060 },
    { t: 'share',   x: 0.93, y: 0.937, s: 0.060 }
  ],
  'instagram-feed': [
    { t: 'heart',   x: 0.08, y: 0.965, s: 0.060 },
    { t: 'comment', x: 0.18, y: 0.965, s: 0.060 },
    { t: 'share',   x: 0.28, y: 0.965, s: 0.060 }
  ],
  'tiktok': [
    { t: 'avatar',  x: 0.91, y: 0.520, s: 0.095 },
    { t: 'heart',   x: 0.91, y: 0.625, s: 0.080 },
    { t: 'comment', x: 0.91, y: 0.712, s: 0.080 },
    { t: 'share',   x: 0.91, y: 0.798, s: 0.080 },
    { t: 'disc',    x: 0.91, y: 0.888, s: 0.090 },
    { t: 'text',    x: 0.05, y: 0.800, w: 0.32, h: 0.018 },   // @kullanıcı
    { t: 'text',    x: 0.05, y: 0.842, w: 0.60, h: 0.014 },
    { t: 'text',    x: 0.05, y: 0.864, w: 0.48, h: 0.014 },
    { t: 'music',   x: 0.05, y: 0.905, w: 0.42, h: 0.014 }
  ],
  'youtube-shorts': [
    { t: 'heart',   x: 0.92, y: 0.590, s: 0.075 },
    { t: 'comment', x: 0.92, y: 0.690, s: 0.075 },
    { t: 'share',   x: 0.92, y: 0.785, s: 0.075 },
    { t: 'more',    x: 0.92, y: 0.870, s: 0.055 },
    { t: 'avatar',  x: 0.08, y: 0.845, s: 0.075 },
    { t: 'text',    x: 0.15, y: 0.838, w: 0.28, h: 0.016 },   // kanal
    { t: 'text',    x: 0.06, y: 0.888, w: 0.62, h: 0.014 },   // başlık
    { t: 'music',   x: 0.06, y: 0.928, w: 0.38, h: 0.014 }
  ],
  'youtube-16x9': []
};

/** Bir preset'in arayuz elemanlarini PIKSEL konumlarina cevirir. */
function uiElements(preset, width, height) {
  const id = typeof preset === 'string' ? preset : null;
  const list = (id && UI[id]) || [];
  return list.map((e) => {
    const out = { type: e.t, x: Math.round(width * e.x), y: Math.round(height * e.y) };
    if (e.s !== undefined) out.size = Math.round(width * e.s);
    if (e.w !== undefined) out.w = Math.round(width * e.w);
    if (e.h !== undefined) out.h = Math.round(height * e.h);
    return out;
  });
}

function list() {
  return Object.keys(PRESETS).map((id) => ({
    id,
    label: PRESETS[id].label,
    aspect: PRESETS[id].aspect,
    note: PRESETS[id].note
  }));
}

module.exports = { PRESETS, UI, toRect, toTitleRect, uiElements, list };
