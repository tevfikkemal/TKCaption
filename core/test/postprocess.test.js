'use strict';
const pp = require('../src/postprocess.js');
const base = require('../src/config.js').load();

let fail = 0;
function eq(got, want, label) {
  const good = got === want;
  console.log((good ? '  OK   ' : '  HATA ') + label);
  if (!good) { console.log('         beklenen: ' + want); console.log('         gelen   : ' + got); fail++; }
}

const cfg = JSON.parse(JSON.stringify(base));

console.log('=== KESME ISARETI (cekim eki alir) ===');
eq(pp.processText('Türkiyede yaşıyorum', cfg), "Türkiye'de yaşıyorum", 'Türkiyede -> Türkiye\'de');
eq(pp.processText('İstanbuldan geldim', cfg), "İstanbul'dan geldim", 'İstanbuldan -> İstanbul\'dan');
eq(pp.processText('Ankaraya gidiyorum', cfg), "Ankara'ya gidiyorum", 'Ankaraya -> Ankara\'ya');
eq(pp.processText('Adobeun politikası', cfg), "Adobe'un politikası", 'Adobeun -> Adobe\'un');

console.log('\n=== YAPIM EKI KESME ALMAZ (yanlis pozitif testi) ===');
eq(pp.processText('Türkiyeli sanatçılar', cfg), 'Türkiyeli sanatçılar', 'Türkiyeli bozulmadi');
eq(pp.processText('Ahmetler geldi', cfg), 'Ahmetler geldi', 'Ahmetler (cogul) bozulmadi');
eq(pp.processText("Türkiye'de zaten var", cfg), "Türkiye'de zaten var", 'mevcut kesme cift yazilmadi');

console.log('\n=== SAYI EKLERI ===');
eq(pp.processText('2000 de doğdum', cfg), "2000'de doğdum", '2000 de -> 2000\'de');
eq(pp.processText('Saat 5 e geliyorum', cfg), "Saat 5'e geliyorum", '5 e -> 5\'e');

console.log('\n=== NOKTALAMA VE BOSLUK ===');
eq(pp.processText('merhaba , nasılsın ?', cfg), 'Merhaba, nasılsın?', 'bosluk ve buyuk harf');
eq(pp.processText('bir  iki   üç', cfg), 'Bir iki üç', 'coklu bosluk');
eq(pp.processText('bekle... geliyorum', cfg), 'Bekle… geliyorum', 'uc nokta -> tek karakter');

console.log('\n=== TURKCE BUYUK HARF (i -> İ) ===');
eq(pp.upperFirstTr('istanbul'), 'İstanbul', 'i -> İ (I degil)');
eq(pp.upperFirstTr('ışık'), 'Işık', 'ı -> I');
eq(pp.processText('iyi günler. iyi akşamlar.', cfg), 'İyi günler. İyi akşamlar.', 'cumle basi İ');

console.log('\n=== KULLANICI SOZLUGU ===');
const cfgDict = JSON.parse(JSON.stringify(base));
cfgDict.turkish.dictionary = [
  { from: 'tevfik kemal', to: 'Tevfik Kemal' },
  { from: 'premyer', to: 'Premiere' },
  'Kadıköy'
];
eq(pp.processText('merhaba tevfik kemal ben premyer kullanıyorum', cfgDict),
   'Merhaba Tevfik Kemal ben Premiere kullanıyorum', 'yanlis duyulan isimler duzeltildi');
eq(pp.processText('Kadıköyde buluşalım', cfgDict), "Kadıköy'de buluşalım", 'sozlukteki isim kesme aldi');

console.log('\n=== ZAMAN DAMGASI KORUNUYOR MU (kritik) ===');
const words = [
  { text: 'Türkiyede', start: 0.0, end: 0.7, p: 0.9 },
  { text: 'yaşıyorum', start: 0.8, end: 1.5, p: 0.95 }
];
const out = pp.processWords(words, cfg);
eq(out.length, 2, 'kelime sayisi degismedi');
eq(out[0].text, "Türkiye'de", 'metin duzeldi');
eq(out[0].start + '/' + out[0].end, '0/0.7', 'zaman damgasi aynen korundu');
eq(out[1].start + '/' + out[1].end, '0.8/1.5', 'ikinci kelimenin zamani korundu');

// Kelime sayisini degistiren durum: guvenli yola dusmeli, zamanlar bozulmamali
const w2 = [
  { text: '2000', start: 0, end: 0.5 },
  { text: 'de', start: 0.6, end: 0.8 },
  { text: 'doğdum', start: 0.9, end: 1.6 }
];
const o2 = pp.processWords(w2, cfg);
eq(o2.length, 3, 'birlesme durumunda kelime sayisi korundu (zaman damgasi guvende)');
eq(o2[2].start + '/' + o2[2].end, '0.9/1.6', 'son kelimenin zamani korundu');

console.log('\n================================');
console.log(fail === 0 ? 'TUM TESTLER GECTI' : fail + ' TEST BASARISIZ');
process.exit(fail === 0 ? 0 : 1);
