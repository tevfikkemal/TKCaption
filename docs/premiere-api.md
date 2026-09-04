# Premiere Pro ExtendScript — ölçülmüş bulgular

Bu dosya **tahmin değil, çalıştırılıp gözlenmiş** sonuçları tutar. Adobe'un
ExtendScript belgeleri altyazı pistleri konusunda sessiz olduğu için her şeyi
`panel/jsx/bridge.jsx` içindeki yoklama fonksiyonlarıyla ölçüyoruz.

Test ortamı: **Premiere Pro 26.3.0**, Windows 11, CEP 11 paneli.

---

## `sequence.createCaptionTrack`

### Durum: MEVCUT

```
typeof seq.createCaptionTrack === 'function'   // true
String(seq.createCaptionTrack)                 // "function createCaptionTrack() { [native code] }"
seq.createCaptionTrack.length                  // 0
```

`.length` değeri **0 ve yanıltıcıdır** — native fonksiyonlarda arity bildirilmez.
Gerçek argüman sayısı ancak çağırarak öğrenilir.

### Neden `for...in` dökümünde görünmüyor

`for (var k in seq)` çıktısı bu metodu **listelemez**:

```
sequence: audioDisplayFormat, audioTracks, end, frameSizeHorizontal,
          frameSizeVertical, id, markers, name, projectItem, sequenceID,
          timebase, videoDisplayFormat, videoTracks, zeroPoint
```

Sebep: ExtendScript host nesnelerinde metotlar prototipte durur ve sayılabilir
(enumerable) değildir. **Bir API'nin yokluğunu `for...in` ile kanıtlayamazsınız** —
doğrudan erişimle ayrıca kontrol etmek gerekir. Yoklama fonksiyonu bu yüzden
hem regex taraması hem aday-isim listesi kullanır.

### Ölçülen imza

| Çağrı | Sonuç |
|---|---|
| `createCaptionTrack(projectItem)` | `Not Enough Parameters` |
| `createCaptionTrack(projectItem, 0)` | `true` döndü — **altyazı pisti görsel olarak doğrulandı** |

En az **2 argüman** alıyor.

### Doğrulama

`true` dönüşü tek başına kanıt sayılmadı; zaman çizelgesinde altyazı pistinin
gerçekten oluştuğu **gözle teyit edildi**. Video pist sayısı değişmedi (3 → 3),
çünkü altyazı pistleri video pistlerinden ayrı sayılır — dolayısıyla pist
sayımı bu iş için geçerli bir doğrulama yöntemi değildir.

**Sonuç: tam otomasyon mümkün.** Kullanıcının sürükle-bırak yapmasına gerek yok.

### Henüz bilinmeyenler

- **İkinci argüman ne anlama geliyor?** En olası aday başlangıç zamanı (tick).
  Doğrulanmadı. Bu, zaman kodu kaymasını nasıl çözeceğimizi belirler:
  - Eğer başlangıç zamanıysa → `seq.zeroPoint` geçilir, SRT 0'dan başlar
  - Eğer pist indeksiyse → kayma SRT'nin içine yazılır (`--offset`)

  `0` değeri her hâlükârda geçerli olduğu için, sekansı `00:00:00:00`'dan
  başlayan projelerde bu belirsizlik sorun çıkarmaz. Yalnızca `01:00:00:00`
  gibi kaydırılmış sekanslarda önem kazanır.
- Üçüncü ve sonraki argümanlar var mı, ne işe yarıyor?
- Aynı sekansta ikinci kez çağrılırsa ne olur (yeni pist mi, üzerine mi yazar)?
- Oluşan pist hangi altyazı biçiminde (CEA-608 / CEA-708 / Subtitle / SRT)?

---

## Diğer bulgular

### `sequence.importMGT` — mevcut

Essential Graphics şablonu yerleştirebiliyor. Yedek plan: altyazıyı MOGRT
olarak yakmak. Ağır bir yol (blok başına bir grafik öğesi) ve ancak
`createCaptionTrack` çalışmazsa düşünülmeli.

### `videoTrack.mediaType` — mevcut

Pist türünü ayırt etmeye yarayabilir. Altyazı pistlerini bulmak için
kullanılabilir mi, denenmedi.

### QE DOM — açık ama altyazı üyesi yok

```
qe.project.getActiveSequence() üyeleri:
  CTI, audioDisplayFormat, audioFrameRate, editingMode, fieldType, guid,
  inPoint, multicam, name, numAudioTracks, numVideoTracks, outPoint, par,
  player, presetList, previewPresetCodec, previewPresetPath, useMaxBitDepth,
  useMaxRenderQuality, videoDisplayFormat, videoFrameRate, workInPoint,
  workOutPoint
```

Altyazıya dair hiçbir şey yok. QE DOM bu iş için gereksiz.

---

## `sequence.zeroPoint` — zaman kodu kayması

Sekanslar çoğu zaman `00:00:00:00`'dan başlamaz; yayın işinde `01:00:00:00`
standarttır. Dışa aktarılan ses **her zaman 0'dan** başlar. Bu fark
kapatılmazsa altyazı sekansa bir saat kaymış olarak düşer.

```js
var TICKS_PER_SECOND = 254016000000;
var zeroSec = parseFloat(seq.zeroPoint) / TICKS_PER_SECOND;
```

Çekirdek CLI bunu `--offset` ile alıyor (`core/src/srt.js`), drop-frame NTSC
zaman kodu çevrimi dahil.

---

## `.epr` preset'leri — ingest ile export ayrımı

`exportAsMediaDirect` yalnızca **dışa aktarma** preset'lerini kabul eder.
Premiere'in preset klasöründe ikisi bir arada durur ve **dosya adından
ayırt edilemez**.

`WAV_Mono_16bit_16kHz.epr` adı whisper.cpp'nin istediği formatı birebir
tarif ediyor, ama bir ingest preset'idir. `exportAsMediaDirect`'e verilince:

```
Error: Unknown Error
```

Hata mesajı sebebi hiç açıklamıyor — bu yüzden ayrımı XML içeriğinden yapıyoruz.

| | İngest preset'i | Export preset'i |
|---|---|---|
| Ayırt edici alanlar | `IngestPreset`, `IngestTranscodeEnabled`, `IngestTranscodeExporterModuleName`, `IngestPresetUserComments` | `DoAudio`, `DoVideo`, `CropRect`, `DeinterlaceState` |
| Örnek | `WAV_Mono_16bit_16kHz.epr`, `RawPCM_mono_16khz_nometadata.epr` | `Wave48mono16.epr`, `AudioOnly.epr` |

Üçünün de `ExporterFileType` değeri `1463899717` = `"WAVE"`, yani hepsi WAV
üretir — fark biçimde değil, preset'in **kullanım amacındadır**.

### Uygulanan çözüm

`bridge.jsx` preset dosyasının ilk 4 KB'ını okuyup ingest işaretlerini arar,
bulursa o preset'i eler. Kalanları `exportAsMediaDirect` ile **sırayla dener**
ve gerçekten dosya üreteni kullanır. Böylece hangi Premiere sürümünde hangi
preset'in çalıştığını önceden bilmek zorunda değiliz.

Tercih sırası `Wave48mono16.epr` ile başlar: 48 kHz mono 16-bit WAV üretir,
çekirdek yeniden örnekleyici bunu 16 kHz'e indirir (10 saniyelik ses için ~9 ms).

---

## `exportAsMediaDirect` — yol biçimi ZORUNLU

Ölçülen davranış (Premiere 26.3.0, Windows):

| Yol | Sonuç |
|---|---|
| `C:/Users/.../test.wav` | `Error: Unable to initialize export!` |
| `C:\Users\...\test.wav` | `No Error` — 1.406.322 bayt üretildi |

**Windows'ta yerel ters eğik çizgi zorunludur.** Düz eğik çizgi verilirse
Premiere dışa aktarma motorunu hiç başlatamaz. Hata mesajı yol biçiminden
hiç söz etmediği için sebebi tahmin etmek çok zor — bu yüzden ölçülüp
belgelenmiştir.

CEP panelinden çağırırken tuzak şu: yolu ExtendScript kaynak koduna gömmek
için kaçışlamak gerekir ve akla ilk gelen "ters eğikleri düz eğiğe çevir"
kısayolu tam da hatayı üretir. Doğrusu ters eğiği **korumak** ve yalnızca
kaynak kodu için ikilemektir:

```js
function esPath(p) {
  return String(p).replace(/\/g, '\\').replace(/"/g, '\\"');
}
```

Köprü tarafında ayrıca `toNativePath()` savunması vardır: çağıran taraf düz
eğik çizgi gönderse bile yerel biçime çevrilir. `core/test/espath.test.js`
bu zinciri uçtan uca doğrular.

### Doğrulanan preset çıktısı

`Wave48mono16.epr` ile 14,6 saniyelik sekans → 1.406.322 bayt.

```
1.406.322 ÷ 2 bayt ÷ 48000 Hz = 14,65 sn
```

Yani preset gerçekten **48 kHz mono 16-bit** üretiyor. Çekirdek yeniden
örnekleyici bunu 16 kHz'e indiriyor.

### `app.encoder` üyeleri

```
ENCODE_ENTIRE, ENCODE_IN_TO_OUT, ENCODE_WORKAREA, bind(), setTimeout(), unbind()
```

`encodeSequence` doğrudan erişimle **mevcut** (yine `for...in` dökümünde
görünmüyor). `exportAsMediaDirect` çalıştığı için şimdilik gerekmiyor, ancak
senkron olmayan alternatif olarak dururd — Premiere'i dondurmama avantajı var.

---

## SRT içe aktarma — KARE HIZI kaybı

`app.project.importFiles()` ile içe alınan bir `.srt` dosyasına Premiere
**kendi kare hızı varsayımını atar**. Ölçülen: 60 fps'lik bir sekansta
SRT öğesi **30 fps** olarak geliyor.

SRT formatı zaman bazlıdır (`HH:MM:SS,mmm`) ve kare hızı taşımaz. Premiere
bu boşluğu tahminle doldurur; tahmin sekansla uyuşmazsa altyazı kayar.

Belirti: altyazılar doğru sırada ama sesle senkron değil; kayma sekans
boyunca birikir.

### Çözüm: TTML

TTML kare hızını dosyanın **içinde** taşır:

```xml
<tt ttp:timeBase="media" ttp:frameRate="60" ttp:frameRateMultiplier="1 1">
```

NTSC kare hızları tam sayı + çarpan olarak yazılır — 29.97 için
`frameRate="30" frameRateMultiplier="1000 1001"`. `core/src/ttml.js` bunu
otomatik yapar.

Premiere `.xml` uzantılı TTML dosyalarını altyazı olarak içe alır.

### İkinci savunma: `setOverrideFrameRate`

İçe alınan öğenin kare hızı `projectItem.setOverrideFrameRate(fps)` ile
sekansınkine eşitlenmeye çalışılır. Desteklenmiyorsa sessizce geçilir;
panel günlüğünde öğenin kare hızı öncesi/sonrası yazılır.

### Ölçüm aracı

```bash
node core/tools/sync-check.js <ses|video> <altyazi.srt>
```

Konuşma başlangıçları ile altyazı başlangıçları arasındaki **sistematik
kaymayı** sayıyla verir. "Göz kararı kayıyor gibi" yerine ölçülebilir
bir sayı üretir.
