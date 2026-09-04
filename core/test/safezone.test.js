'use strict';
/**
 * Safe zone hesabi testleri.
 *
 * Kritik nokta: oranlar cozunurlukten BAGIMSIZ olmali. Ayni preset
 * 1080x1920'de de 720x1280'de de ayni goreli alani vermeli — piksel
 * yazsaydik yalnizca tek cozunurlukte dogru olurdu.
 */
const sz = require('../src/safezone.js');

let fail = 0;
function ok(cond, label, extra) {
  console.log((cond ? '  OK   ' : '  HATA ') + label);
  if (!cond) { if (extra) console.log('         ' + extra); fail++; }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('=== PRESET LISTESI ===');
{
  const l = sz.list();
  ok(l.length >= 5, l.length + ' preset tanimli');
  const ids = l.map((x) => x.id);
  for (const gerekli of ['instagram-reels', 'tiktok', 'youtube-shorts']) {
    ok(ids.indexOf(gerekli) >= 0, gerekli + ' var');
  }
  ok(l.every((x) => x.label && x.aspect), 'hepsinin adi ve en-boy orani var');
}

console.log('\n=== 1080x1920 PIKSEL KARSILIGI ===');
{
  const r = sz.toRect('instagram-reels', 1080, 1920);
  console.log('    reels: x=' + r.x + ' y=' + r.y + ' w=' + r.w + ' h=' + r.h);
  ok(r.y === 250, 'üst kenar 250 px (' + r.y + ')');
  ok(r.x === 59, 'sol kenar ~59 px (' + r.x + ')');
  ok(near(r.h, 1920 - 250 - 422, 2), 'yükseklik alt bandı dışlıyor (' + r.h + ')');
  ok(r.x + r.w <= 1080 && r.y + r.h <= 1920, 'kare sınırlarını aşmıyor');
}
{
  const t = sz.toRect('tiktok', 1080, 1920);
  const i = sz.toRect('instagram-reels', 1080, 1920);
  ok(t.y + t.h < i.y + i.h, 'TikTok alt bandı Instagram’dan geniş');
}

console.log('\n=== COZUNURLUKTEN BAGIMSIZLIK ===');
{
  const a = sz.toRect('instagram-reels', 1080, 1920);
  const b = sz.toRect('instagram-reels', 720, 1280);
  const c = sz.toRect('instagram-reels', 2160, 3840);
  const oran = (r, W, H) => [r.x / W, r.y / H, r.w / W, r.h / H];
  const [ax, ay, aw, ah] = oran(a, 1080, 1920);
  const [bx, by, bw, bh] = oran(b, 720, 1280);
  const [cx, cy, cw, ch] = oran(c, 2160, 3840);
  ok(near(ax, bx, 0.002) && near(ax, cx, 0.002), 'sol oran her çözünürlükte aynı');
  ok(near(ay, by, 0.002) && near(ay, cy, 0.002), 'üst oran her çözünürlükte aynı');
  ok(near(aw, bw, 0.002) && near(aw, cw, 0.002), 'genişlik oranı aynı');
  ok(near(ah, bh, 0.002) && near(ah, ch, 0.002), 'yükseklik oranı aynı');
}

console.log('\n=== YATAY YOUTUBE: IKI SEVIYE ===');
{
  const action = sz.toRect('youtube-16x9', 1920, 1080);
  const title = sz.toTitleRect('youtube-16x9', 1920, 1080);
  ok(title !== null, 'başlık güvenli alanı tanımlı');
  ok(title.x > action.x && title.y > action.y, 'başlık alanı eylem alanının içinde');
  ok(title.w < action.w && title.h < action.h, 'başlık alanı daha küçük');
}
{
  ok(sz.toTitleRect('instagram-reels', 1080, 1920) === null,
     'dikey preset’lerde ikinci seviye yok');
}

console.log('\n=== ARAYUZ ELEMANLARI ===');
{
  const W = 1080, H = 1920;
  for (const id of ['instagram-reels', 'tiktok', 'youtube-shorts', 'instagram-story']) {
    const r = sz.toRect(id, W, H);
    const els = sz.uiElements(id, W, H);
    ok(els.length > 0, id + ': ' + els.length + ' eleman tanımlı');
    // Elemanlar guvenli alanin DISINDA olmali — yasak bolgeyi temsil ediyorlar
    const icerde = els.filter((e) => e.x > r.x && e.x < r.x + r.w && e.y > r.y && e.y < r.y + r.h);
    ok(icerde.length === 0, id + ': hiçbiri güvenli alanın içinde değil');
    const tasan = els.filter((e) => e.x < 0 || e.x > W || e.y < 0 || e.y > H);
    ok(tasan.length === 0, id + ': hiçbiri kare dışına taşmıyor');
  }
}
{
  const a = sz.uiElements('instagram-reels', 1080, 1920);
  const b = sz.uiElements('instagram-reels', 540, 960);
  ok(a.length === b.length, 'eleman sayısı çözünürlükten bağımsız');
  ok(Math.abs(a[0].x / 1080 - b[0].x / 540) < 0.01, 'eleman konumu oransal');
}
{
  ok(sz.uiElements('youtube-16x9', 1920, 1080).length === 0,
     'yatay YouTube’da arayüz elemanı yok (doğru)');
  ok(sz.uiElements('olmayan', 1080, 1920).length === 0,
     'bilinmeyen preset boş dizi döndürür');
}

console.log('\n=== SINIR DURUMLARI ===');
{
  const r = sz.toRect('instagram-reels', 100, 100);
  ok(r.w >= 1 && r.h >= 1, 'çok küçük karede bile geçerli dikdörtgen (' + r.w + 'x' + r.h + ')');
}
{
  let threw = false;
  try { sz.toRect('olmayan-platform', 1080, 1920); } catch (e) { threw = true; }
  ok(threw, 'bilinmeyen preset hata veriyor');
}

console.log('\n================================');
console.log(fail === 0 ? 'TUM TESTLER GECTI' : fail + ' TEST BASARISIZ');
process.exit(fail === 0 ? 0 : 1);
