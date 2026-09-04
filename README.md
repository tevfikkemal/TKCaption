# TK Caption

**Adobe Premiere Pro için Türkçe otomatik altyazı — yerelde çalışır, ücretsizdir, hep öyle kalacaktır.**

*by TK Labs*

---

## Neden

Adobe Premiere Pro'nun dahili konuşma tanıma özelliği **18 dil** destekler. Türkçe bunlardan biri değildir.

Bu bir iddia değil, kurulu programın kendi dosyasından okunabilir. Premiere Pro 2026 kurulumunda:

```
C:\Program Files\Adobe\Adobe Premiere Pro 2026\AutoTranscription\SupportedLanguages.json
```

Dosyadaki tam liste: `en-us`, `en-gb`, `cmn-hans`, `cmn-hant`, `zh-hk`, `es-es`, `de-de`, `fr-fr`, `ja-jp`, `pt-pt`, `ko-kr`, `it-it`, `ru-ru`, `hi-in`, `nb-no`, `sv-se`, `da-dk`, `nl-nl`.

Türkçe yok. Yıllardır da eklenmedi.

Piyasadaki Türkçe altyazı eklentileri ya ücretli, ya bulut API'sine para ödetiyor, ya da ikisi birden. TK Caption ikisini de yapmaz: model bilgisayarınızda çalışır, ses hiçbir yere gitmez, hiçbir aşamada para istenmez.

## Ne yapar

Türkçe konuşulan bir ses/video dosyasından, **düzgün bölünmüş** bir `.srt` altyazı dosyası üretir.

"Düzgün bölünmüş" kısmı asıl mesele. Konuşma tanıma motorunun ham çıktısı altyazı için kullanılamaz — cümleleri ortasından keser, satırları rastgele böler. TK Caption kelime bazlı zaman damgalarından altyazı bloklarını Türkçe dilbilgisine göre yeniden kurar:

- **Ekler koparılmaz** — `geldi | de`, `gördün | mü` diye bölmez
- **Edatlar bağlı kalır** — `açıklamaya | göre` olmaz
- **Belirteç–isim bağı korunur** — `bu | özelliği` olmaz
- **Özel isim zincirleri bütün kalır** — `Adobe | Premiere Pro` olmaz
- **Bağlaçlardan önce bölünür** — `ama`, `çünkü`, `ve` satır başına gelir
- **İkilemeler korunur** — `yavaş yavaş`, `koşa koşa` tekrar filtresine takılmaz
- **Kesme işareti düzeltilir** — `Türkiyede` → `Türkiye'de` (ama `Türkiyeli` bozulmaz, yapım eki kesme almaz)

Ayrıca konuşma tanıma motorlarının Türkçe'de sessiz bölümlerde ürettiği uydurma metinleri (`Altyazı M.K.`, `Abone olmayı unutmayın` gibi) filtreler.

## Durum

| Katman | Durum |
|---|---|
| **1 — Çekirdek CLI** (ses → altyazı) | Çalışıyor |
| **2 — ExtendScript köprüsü** (Premiere ↔ çekirdek) | Çalışıyor |
| **3 — CEP paneli** (arayüz) | Çalışıyor |

**Uçtan uca çalışıyor.** Premiere'de bir sekans açıp panelden tek düğmeye
basıyorsunuz; ses çıkarılıyor, yerelde çözümleniyor, Türkçe kurallara göre
bölünüyor ve sekansa altyazı pisti olarak yerleştiriliyor. Sürükle-bırak yok.

### Kurulum paketi

```bash
node tools/build.js
```

`dist/TKCaption-<sürüm>.zip` üretir (~70 KB; model ve motor ilk çalıştırmada
iner). İçindeki `KUR.ps1` `PlayerDebugMode` bayrağını açar ve eklentiyi
kullanıcının CEP klasörüne kopyalar.

Paket **imzasız** dağıtılır. Resmî ZXP imzalama sertifika gerektirir;
Adobe Exchange'e koymak isterseniz ayrı bir adımdır.

### Paneli kurmak (geliştirme)

```powershell
powershell -ExecutionPolicy Bypass -File tools\install-panel.ps1
```

İki şey yapar: Adobe'un imzasız panelleri yüklemesi için gereken `PlayerDebugMode`
bayrağını açar (`HKCU` altında, yönetici gerektirmez) ve CEP eklenti klasöründen
bu depodaki `panel/` klasörüne bir junction kurar — kodu değiştirdiğinizde
kopyalamanız gerekmez.

Premiere'i yeniden başlatın, ardından **Pencere > Uzantılar > TK Caption**.

Geri almak için `-Uninstall` ekleyin.

Paneli Premiere açmadan görmek için:

```bash
node tools/serve-panel.js
```

### Ölçülen sonuç

88 saniyelik Türkçe atölye videosu, RTX 4070 Ti:

```
88.0 sn ses / 3.2 sn işlem  (27x gerçek zaman)
32 altyazı bloğu, 169 kelime

satır uzunluğu ihlali : 0
2'den fazla satır     : 0
süre ihlali           : 0
çakışma               : 0

senkron (sync-check.js):
  medyan kayma        : +0.00 sn
  en erken sapma      : -0.05 sn
```

Zamanlama doğruluğu `core/tools/sync-check.js` ile ölçülür — göz kararıyla
değil, konuşma başlangıçlarıyla altyazı başlangıçları karşılaştırılarak.

## Kurulum

Node.js 16+ dışında hiçbir şey gerekmez. **Sıfır npm bağımlılığı** vardır.

```bash
git clone https://github.com/tevfikkemal/TKCaption.git
cd TKCaption
```

Motor ve model ilk çalıştırmada otomatik iner (`models/` ve `bin/` klasörlerine, repoya girmez).

```bash
node core/tools/fetch.js
```

Ne indirileceğini görmek için:

```bash
node core/src/index.js --list-models
```

| Bileşen | Boyut | Not |
|---|---|---|
| `large-v3-turbo-q5_0` | 547 MB | Varsayılan model |

| whisper.cpp (blas) | 20 MB | Her makinede çalışır |
| whisper.cpp (cuda12) | 640 MB | NVIDIA kartı varsa, çok daha hızlı |

NVIDIA kartınız varsa CUDA yapısı otomatik önerilir.

## Kullanım

```bash
node core/src/index.js -i roportaj.wav -o roportaj.srt
```

Premiere'den gelen bir sekans için (zaman kodu kayması önemli):

```bash
node core/src/index.js -i sekans.wav --offset 01:00:00:00 --fps 25
```

Tüm seçenekler için `--help`.

### Kendi sözlüğünüz

Yanlış duyulan isimleri düzeltmek için bir JSON dosyası verebilirsiniz:

```json
[
  { "from": "premyer", "to": "Premiere" },
  { "from": "tevfik kemâl", "to": "Tevfik Kemal" },
  "Kadıköy"
]
```

```bash
node core/src/index.js -i video.mp4 --dict sozluk.json
```

Düz metin olarak yazılan isimler kesme işareti düzeltmesine dahil edilir (`Kadıköyde` → `Kadıköy'de`).

### Altyazı biçimi

Panel varsayılan olarak **TTML** üretir çünkü kare hızını dosyanın içinde
taşır; SRT taşımaz ve Premiere içe alırken kendi varsayımını uygular.
Her iki dosya da proje klasörüne yazılır, ikisini de kullanabilirsiniz.

### Ayarlar

`config.json` ile satır uzunluğu, okuma hızı, süre sınırları değiştirilebilir. Varsayılanlar TRT ve Netflix Türkçe altyazı ölçülerine dayanır: satır başına 42 karakter, en fazla 2 satır, 17 karakter/saniye, 0.833–7 saniye blok süresi.

## Girdi biçimleri

WAV dosyaları **doğrudan** işlenir — çözümleme ve 16 kHz'e indirgeme saf JavaScript ile yapılır, harici araç gerekmez. Premiere zaten WAV ürettiği için eklentinin ana akışında hiçbir ek bağımlılık yoktur.

MP4, MP3 gibi diğer biçimler için `ffmpeg` gerekir. Kurulu değilse `--ffmpeg <yol>` ile konumunu verebilirsiniz.

## Kalite ölçümü

Üretilen altyazının kurallara uyup uymadığını sayıyla görmek için:

```bash
node core/tools/analyze.js altyazi.srt
```

CPS dağılımı, ihlal sayıları ve en sorunlu blokları listeler.

## Testler

```bash
node core/test/segmenter.test.js
node core/test/srt-hallucination.test.js
node core/test/postprocess.test.js
node core/test/espath.test.js
node core/test/vad.test.js
node core/test/ttml.test.js
```

## Lisans

MIT. Kullanın, değiştirin, dağıtın. Satmayın demiyorum — satın da, ama önce ücretsiz halinin var olduğunu söyleyin.

## Teşekkür

[whisper.cpp](https://github.com/ggml-org/whisper.cpp) — Georgi Gerganov ve katkıda bulunanlar. Bu araç onun üzerine kuruludur.

---

*Türkiye'ye armağandır.*
