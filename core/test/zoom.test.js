'use strict';
const z = require('../src/zoom.js');

let ok = 0, hata = 0;
function t(ad, fn) {
  try { fn(); console.log('  OK   ' + ad); ok++; }
  catch (e) { console.log('  HATA ' + ad + ' -> ' + e.message); hata++; }
}
function esit(a, b, m) { if (a !== b) throw new Error((m ? m + ': ' : '') + 'beklenen=' + b + ' gelen=' + a); }
const yakin = (a, b, m) => { if (Math.abs(a - b) > 1e-6) throw new Error((m || '') + ' beklenen=' + b + ' gelen=' + a); };

// 5 ifade, aralarinda 0.6 sn duraklama, her biri 3 sn
const konusma = [0, 3.6, 7.2, 10.8, 14.4].map((s) => ({ start: s, end: s + 3 }));

console.log('\n=== PLANLAMA ===');
t('ilk ifadede gecis yok, sonra sirayla yakin/uzak', function () {
  const a = z.planla(konusma, { oran: 1.2, aralikSn: 3, stil: 'punch', fps: 25 });
  const degerler = [3.6, 7.2, 10.8, 14.4].map((s) => z.degerAt(a, s + 0.1));
  esit(degerler.join(','), '1.2,1,1.2,1');
  yakin(z.degerAt(a, 1), 1);
});
t('punch: gecis bir karede olur', function () {
  const a = z.planla(konusma, { oran: 1.2, aralikSn: 3, stil: 'punch', fps: 25 });
  yakin(z.degerAt(a, 3.6 - 0.04), 1);
  yakin(z.degerAt(a, 3.6), 1.2);
});
t('yumusak: gecis suresi boyunca ara degerler', function () {
  const a = z.planla(konusma, { oran: 1.2, aralikSn: 3, stil: 'yumusak', gecisSn: 0.4 });
  yakin(z.degerAt(a, 3.8), 1.1);
  yakin(z.degerAt(a, 4.0), 1.2);
});
t('aralik: siklik siniri uyulur', function () {
  const a = z.planla(konusma, { oran: 1.2, aralikSn: 7, stil: 'punch' });
  // 0'dan sonra 7.2 ve 14.4'te gecis — 3.6 ve 10.8 atlanir
  esit(z.degerAt(a, 5), 1);
  esit(z.degerAt(a, 8), 1.2);
  esit(z.degerAt(a, 12), 1.2);
  esit(z.degerAt(a, 15), 1);
});
t('kisa duraklamalar ayni ifade sayilir', function () {
  const parcali = [{ start: 0, end: 1 }, { start: 1.1, end: 2 }, { start: 2.1, end: 3 }];
  const a = z.planla(parcali, { oran: 1.2, aralikSn: 0.5, stil: 'punch' });
  esit(a.length, 1, 'tek ifade -> gecis yok');
});

console.log('\n=== KLIPLERE DAGITMA ===');
t('kaynak zamani: sekans - start + inPoint', function () {
  const a = [{ t: 0, v: 1 }, { t: 4.96, v: 1 }, { t: 5, v: 1.2 }];
  const r = z.kliplereDagit(a, [{ i: 0, start: 2, end: 8, inPoint: 10 }]);
  esit(r.length, 1);
  esit(r[0].keys.map((k) => k.t + ':' + k.v).join(' '), '10:1 12.96:1 13:1.2');
});
t('kesimden sonraki klip zoom durumunu devralir', function () {
  const a = [{ t: 0, v: 1 }, { t: 4.96, v: 1 }, { t: 5, v: 1.2 }];
  const r = z.kliplereDagit(a, [
    { i: 0, start: 0, end: 4 }, { i: 1, start: 6, end: 9, inPoint: 0 }
  ]);
  // ilk klip: hep 1, dokunulmaz. ikinci: 1.2'den baslar
  esit(r.length, 1); esit(r[0].i, 1); esit(r[0].keys[0].v, 1.2);
});
t('sinirdaki anahtar kare iki klibe tekrar yazilmaz', function () {
  const a = [{ t: 0, v: 1 }, { t: 3.96, v: 1 }, { t: 4, v: 1.2 }];
  const r = z.kliplereDagit(a, [{ i: 0, start: 0, end: 4 }, { i: 1, start: 4, end: 8 }]);
  const k0 = r.find((x) => x.i === 0);
  if (k0 && k0.keys.some((k) => k.t >= 4)) throw new Error('klip sonuna anahtar kondu');
});

console.log('\n================================');
if (hata === 0) console.log('TUM TESTLER GECTI (' + ok + ')');
else { console.log(hata + ' TEST BASARISIZ'); process.exit(1); }
