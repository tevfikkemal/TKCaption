'use strict';
/**
 * panel/js/main.js icindeki esPath() ve panel/jsx/bridge.jsx icindeki
 * toNativePath() mantiginin dogrulanmasi.
 *
 * Neden ayri test: exportAsMediaDirect Windows'ta TERS egik cizgi ister.
 * Yolu duz egik cizgiye cevirmek "Unable to initialize export!" hatasi verir.
 * Bu davranis olculmustur (docs/premiere-api.md) ve bir daha bozulmamali.
 */

// main.js'teki ile ayni
function esPath(p) {
  return String(p).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// bridge.jsx'teki ile ayni (Windows dali)
function toNativePathWin(p) {
  return String(p).replace(/\//g, '\\');
}

let fail = 0;
function eq(got, want, label) {
  const good = got === want;
  console.log((good ? '  OK   ' : '  HATA ') + label);
  if (!good) { console.log('         beklenen: ' + want); console.log('         gelen   : ' + got); fail++; }
}

const BS = String.fromCharCode(92); // ters egik cizgi

console.log('=== esPath: ExtendScript kaynak kodu icin kacis ===');
{
  const win = 'C:' + BS + 'Users' + BS + 'tevfi' + BS + 'Temp' + BS + 'ses.wav';
  const escaped = esPath(win);
  // ExtendScript kaynagina "..." icinde gomuldugunde geri okunan deger
  const asRead = JSON.parse('"' + escaped + '"');
  eq(asRead, win, 'ters egik cizgiler kacislandi ve aynen geri okunuyor');
  eq(escaped.indexOf('/'), -1, 'duz egik cizgiye CEVRILMEDI (kritik)');
}

{
  const spaced = 'E:' + BS + 'Preimere Plugin Claude' + BS + 'video' + BS + 'a.srt';
  eq(JSON.parse('"' + esPath(spaced) + '"'), spaced, 'bosluklu yol korunuyor');
}

{
  const quoted = 'C:' + BS + 'a"b' + BS + 'c.wav';
  eq(JSON.parse('"' + esPath(quoted) + '"'), quoted, 'cift tirnak kacislandi');
}

console.log(String.fromCharCode(10) + '=== toNativePath: kopru savunmasi ===');
{
  const fwd = 'C:/Users/tevfi/Temp/ses.wav';
  const want = 'C:' + BS + 'Users' + BS + 'tevfi' + BS + 'Temp' + BS + 'ses.wav';
  eq(toNativePathWin(fwd), want, 'duz egik cizgi yerli bicime cevriliyor');
}
{
  const already = 'C:' + BS + 'Users' + BS + 'a.wav';
  eq(toNativePathWin(already), already, 'zaten yerli olan bozulmuyor');
}

console.log(String.fromCharCode(10) + '=== Zincir: main.js -> bridge.jsx ===');
{
  const original = 'C:' + BS + 'Users' + BS + 'tevfi' + BS + 'AppData' + BS + 'Local' + BS +
                   'Temp' + BS + 'tkcaption-abc' + BS + 'sekans.wav';
  const inExtendScript = JSON.parse('"' + esPath(original) + '"'); // koprunun aldigi
  const native = toNativePathWin(inExtendScript);                   // exportAsMediaDirect'e giden
  eq(native, original, 'uctan uca yol bozulmadan gidiyor');
}

console.log(String.fromCharCode(10) + '================================');
console.log(fail === 0 ? 'TUM TESTLER GECTI' : fail + ' TEST BASARISIZ');
process.exit(fail === 0 ? 0 : 1);
