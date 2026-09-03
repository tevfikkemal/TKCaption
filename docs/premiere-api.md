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
