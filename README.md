# TK Caption

**Adobe Premiere Pro için Türkçe otomatik altyazı.**
Bilgisayarınızda çalışır, sesiniz hiçbir yere gitmez, ücretsizdir — hep öyle kalacak.

*by TK Labs · Türkiye'ye armağandır.*

---

## Neden var

Premiere Pro'nun kendi altyazı özelliği 18 dil biliyor. Türkçe bunlardan biri değil — yıllardır da eklenmedi. Piyasadaki Türkçe eklentiler ya ücretli ya da sesinizi buluta gönderip dakika başı ücret alıyor.

TK Caption ikisini de yapmaz.

## Neler yapar

**Altyazı** — Sekanstaki konuşmayı dinler, Türkçe altyazıyı üretir ve zaman çizgisine yerleştirir. Tek tık.

Altyazıları düz bölmez, Türkçe'ye göre böler: `geldi | de`, `açıklamaya | göre`, `bu | özelliği` gibi yanlış kesimler yapmaz. Satır uzunluğu ve okuma hızı TRT/Netflix Türkçe ölçülerine uyar.

**Seçili aralık** — Tüm sekansı değil, sadece In/Out arasını işleyebilir.

**Ses kanalı seçimi** — Müzik ya da efekt ayrı kanaldaysa sadece konuşma kanalını dinletebilirsiniz.

**Düzenleme** — Üretilen altyazıyı panelde görüp düzeltebilirsiniz. Özel isimler, marka adları, teknik terimler için.

**Auto Cut** — Sessiz bölümleri bulup keser, kalan klipleri birleştirir. Ne kadar sürenin kesileceğini önce gösterir, onaylarsanız uygular.

**Güvenli alan** — Instagram, TikTok, YouTube için ekranın hangi kısmının arayüz altında kalacağını gösterir. Altyazıyı doğru yere koymak için.

## Kurulum

**1.** [ZXP Installer](https://zxpinstaller.com)'ı indirip kurun (ücretsiz).

**2.** `TKCaption-x.x.x.zxp` dosyasını ZXP Installer'a sürükleyin.

**3.** Premiere'i açın → **Pencere → Uzantılar → TK Caption**

### Mac (deneme aşamasında)

ZXP Installer Mac'te bu paketi kurmayabiliyor; onun yerine **Terminal**'i açıp (Uygulamalar → İzlenceler → Terminal) şu satırı yapıştırın, Enter'a basın:

```
curl -fsSL https://raw.githubusercontent.com/tevfikkemal/TKCaption/main/tools/install-mac.sh | bash
```

Parola sormaz. Sonra Premiere'i tamamen kapatıp (Cmd+Q) açın → **Pencere → Uzantılar → TK Caption**. Apple Silicon (M1 ve sonrası) Mac'lerde ekran kartı kullanılır.

**İlk çalıştırmada** konuşma tanıma modeli iner (~570 MB). Bir kez iner, sonra internet gerekmez. NVIDIA ekran kartınız varsa daha hızlı çalışan sürüm otomatik seçilir.

## Kullanım

1. Premiere'de bir sekans açın
2. Panelde **Altyazı Oluştur**'a basın
3. Bitti — altyazı zaman çizgisinde

Ana düğmenin altındaki seçenekler:

| | |
|---|---|
| **Nereye** | Altyazı timeline'ı (kapatılabilir) ya da grafik timeline (videoya gömülü, şablonlu) |
| **Kapsam** | Tüm sekans ya da sadece In/Out arası |
| **Yerleştir** | Hemen ya da önce düzelttikten sonra |
| **Ses** | Hangi ses kanalının dinleneceği |

### Altyazıyı düzeltmek istiyorsanız

**Yerleştir → "Düzelttikten sonra"** seçin. Altyazı üretilir ama sekansa konmaz; panelde liste açılır. Düzeltip **Kaydet**, sonra **Yerleştir**.

Neden böyle: Premiere, altyazı timeline'ı bir kez yerleştikten sonra eklentilerin onu değiştirmesine izin vermiyor. Düzeltmeyi yerleştirmeden önce yapınca sekansta tek, doğru bir altyazı olur.

## Güncelleme

Panel yeni sürüm çıkınca kendisi haber verir. **Güncelle**'ye basın, Windows izin isterse **Evet** deyin (Mac'te parola isteyebilir), sonra sağ üstteki yenileme düğmesine basın. Premiere'i kapatmanız gerekmez.

## Sık sorulanlar

**Sesim internete gidiyor mu?**
Hayır. Her şey bilgisayarınızda çalışır. İnternet yalnızca ilk kurulumda model indirmek ve güncelleme kontrolü için kullanılır.

**Hangi Premiere sürümleri?**
Premiere Pro 2026 (26.x) üzerinde test edildi. 2025 (25.x) sürümüne kurulur ama orada denenmedi — sorun yaşarsanız bildirin.

**Mac'te çalışır mı?**
Deneme aşamasında — kurulum yukarıda. Sorun yaşarsanız panelin altındaki **Sorun giderme** raporunu gönderin.

**Altyazılar ekranda üç satıra sarıyor.**
Premiere altyazıyı kendi yazı tipiyle çizer ve bu tip geniştir. Ayarlar'dan satır uzunluğunu 30–34'e düşürün.

**Panel açılmıyor.**
Premiere'i tamamen kapatıp açın. Olmazsa panelin altındaki **Sorun giderme**'ye basıp çıkan raporu bize gönderin.

**Güncelleme gelmiyor.**
Birkaç dakika bekleyin; yeni sürümün yayılması zaman alabilir. Panelin altındaki **Sorun giderme** bölümünde durumu görebilirsiniz.

## Teşekkür

Konuşma tanıma: [whisper.cpp](https://github.com/ggml-org/whisper.cpp) — Georgi Gerganov ve katkıda bulunanlar. TK Caption onun üzerine kurulu.

## Lisans

MIT. Kullanın, değiştirin, dağıtın. Satmak isterseniz satın, ama ücretsiz halinin var olduğunu söyleyin.

---

*Geliştirici misiniz? Derleme, test ve mimari için → [docs/GELISTIRICI.md](docs/GELISTIRICI.md)*
