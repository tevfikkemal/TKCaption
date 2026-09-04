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

function list() {
  return Object.keys(PRESETS).map((id) => ({
    id,
    label: PRESETS[id].label,
    aspect: PRESETS[id].aspect,
    note: PRESETS[id].note
  }));
}

module.exports = { PRESETS, toRect, toTitleRect, list };
