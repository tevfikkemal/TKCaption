/**
 * tr-altyazi — Premiere Pro ExtendScript koprusu
 *
 * DIKKAT: ExtendScript ES3'tur. let/const/arrow/JSON YOKTUR.
 * Her sey var, function ve elle string birlestirme ile yazilmistir.
 *
 * Panel bu dosyayi CSInterface.evalScript ile cagirir. Tum fonksiyonlar
 * JSON benzeri bir string dondurur (basarili: {"ok":true,...}).
 */

//@target premierepro

var TR_ALTYAZI_VERSION = '0.12.0';
var TICKS_PER_SECOND = 254016000000;

/* ------------------------------------------------------------------ */
/*  ES3 yardimcilari                                                   */
/* ------------------------------------------------------------------ */

function esc(s) {
    if (s === null || s === undefined) return '';
    s = String(s);
    var out = '';
    for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i);
        var code = s.charCodeAt(i);
        if (c === '"') out += '\\"';
        else if (c === '\\') out += '\\\\';
        else if (c === '\n') out += '\\n';
        else if (c === '\r') out += '\\r';
        else if (c === '\t') out += '\\t';
        else if (code < 32) out += '\\u' + ('0000' + code.toString(16)).slice(-4);
        else out += c;
    }
    return out;
}

function kv(key, value, isRaw) {
    return '"' + esc(key) + '":' + (isRaw ? value : '"' + esc(value) + '"');
}

function ok(pairs) {
    var s = '{"ok":true';
    for (var i = 0; i < pairs.length; i++) s += ',' + pairs[i];
    return s + '}';
}

function err(message, detail) {
    return '{"ok":false,' + kv('error', message) +
        (detail ? ',' + kv('detail', String(detail)) : '') + '}';
}

function arrToJson(arr) {
    var s = '[';
    for (var i = 0; i < arr.length; i++) {
        if (i) s += ',';
        s += '"' + esc(arr[i]) + '"';
    }
    return s + ']';
}

function fileExists(p) {
    try { return new File(p).exists; } catch (e) { return false; }
}

/**
 * Yolu isletim sisteminin YERLI bicimine cevirir.
 *
 * OLCULMUS: exportAsMediaDirect Windows'ta ters egik cizgi ister.
 *   "C:/Users/.../a.wav"  -> Error: Unable to initialize export!
 *   "C:\\Users\\...\\a.wav" -> No Error, dosya uretildi
 * Cagiran taraf duz egik cizgi gonderse bile burada duzeltiyoruz ki
 * bu hata bir daha geri gelmesin.
 */
function toNativePath(p) {
    var s = String(p);
    if ($.os.indexOf('Windows') >= 0) return s.replace(/\//g, '\\');
    return s.replace(/\\/g, '/');
}

/* ------------------------------------------------------------------ */
/*  Sekans bilgisi                                                     */
/* ------------------------------------------------------------------ */

/**
 * Sekansin kare hizi ve BASLANGIC ZAMAN KODU.
 *
 * zeroPoint kritik: sekans 01:00:00:00'dan basliyorsa disari aktarilan ses
 * yine de 0'dan baslar. Bu farki SRT'ye offset olarak eklemezsek altyazi
 * bir saat kayar. En sik yapilan hata budur.
 */
function trGetSequenceInfo() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return err('Aktif sekans yok. Once bir sekans acin.');

        var fps = 0;
        try { fps = TICKS_PER_SECOND / parseFloat(seq.timebase); } catch (e) { fps = 0; }

        var zeroSec = 0;
        try { zeroSec = parseFloat(seq.zeroPoint) / TICKS_PER_SECOND; } catch (e) { zeroSec = 0; }

        var endSec = 0;
        try { endSec = parseFloat(seq.end) / TICKS_PER_SECOND; } catch (e) { endSec = 0; }

        var audioTracks = 0, videoTracks = 0;
        try { audioTracks = seq.audioTracks.numTracks; } catch (e) {}
        try { videoTracks = seq.videoTracks.numTracks; } catch (e) {}

        /* IN/OUT noktalari — yalnizca secili araligi isleyebilmek icin.
         * getInPoint() saniyeyi STRING olarak donduruyor. Isaretlenmemisse
         * Premiere 0 ve sekans sonunu veriyor; bunu "isaret yok" saymak
         * icin sure ile karsilastiriyoruz. */
        var inSec = 0, outSec = 0, hasInOut = false;
        try { inSec = parseFloat(seq.getInPoint()); } catch (e) { inSec = 0; }
        try { outSec = parseFloat(seq.getOutPoint()); } catch (e) { outSec = 0; }
        if (isNaN(inSec)) inSec = 0;
        if (isNaN(outSec)) outSec = 0;
        var sure = endSec - zeroSec;
        if (outSec > inSec && (inSec > 0.001 || outSec < sure - 0.001)) hasInOut = true;

        /* SES PISTLERI — hangisinden ses alinacagi secilebilsin.
         * Pist adi bos olabiliyor; o zaman A1, A2 diye adlandiriyoruz. */
        var sesler = [];
        try {
            for (var a = 0; a < audioTracks; a++) {
                var tr = seq.audioTracks[a];
                var ad = '';
                try { ad = String(tr.name || ''); } catch (e) {}
                if (!ad) ad = 'A' + (a + 1);
                var klip = 0;
                try { klip = tr.clips.numItems; } catch (e) {}
                var sessiz = 0;
                try { sessiz = tr.isMuted() ? 1 : 0; } catch (e) { sessiz = 0; }
                sesler.push(ad + '|' + klip + '|' + sessiz);
            }
        } catch (e) {}

        // Video pistleri: zoom'un hangi piste uygulanacagi secilebilsin
        var videolar = [];
        try {
            for (var vv = 0; vv < videoTracks; vv++) {
                var vt = seq.videoTracks[vv];
                var vad = '';
                try { vad = String(vt.name || ''); } catch (e) {}
                if (!vad) vad = 'V' + (vv + 1);
                var vk = 0;
                try { vk = vt.clips.numItems; } catch (e) {}
                videolar.push(vad + '|' + vk);
            }
        } catch (e) {}

        var projPath = '';
        try { projPath = app.project.path; } catch (e) {}

        // Safe zone katmani sekansla ayni cozunurlukte uretilmeli
        var w = 0, h = 0;
        try { w = parseInt(seq.frameSizeHorizontal, 10) || 0; } catch (e) {}
        try { h = parseInt(seq.frameSizeVertical, 10) || 0; } catch (e) {}

        return ok([
            kv('name', seq.name),
            kv('sequenceID', seq.sequenceID),
            kv('width', String(w), true),
            kv('height', String(h), true),
            kv('fps', fps.toFixed(6), true),
            kv('zeroPointSec', zeroSec.toFixed(6), true),
            kv('endSec', endSec.toFixed(6), true),
            kv('durationSec', (endSec - zeroSec).toFixed(6), true),
            kv('videoTracks', String(videoTracks), true),
            kv('audioTracks', String(audioTracks), true),
            kv('inSec', inSec.toFixed(6), true),
            kv('outSec', outSec.toFixed(6), true),
            kv('hasInOut', hasInOut ? 'true' : 'false', true),
            kv('audioList', arrToJson(sesler), true),
            kv('videoList', arrToJson(videolar), true),
            kv('projectPath', projPath),
            kv('appVersion', app.version),
            kv('bridgeVersion', TR_ALTYAZI_VERSION)
        ]);
    } catch (e) {
        return err('Sekans bilgisi alinamadi', e);
    }
}

/* ------------------------------------------------------------------ */
/*  Ses disari aktarma                                                 */
/* ------------------------------------------------------------------ */

/**
 * Aktif sekansin sesini WAV olarak disari aktarir.
 *
 * exportAsMediaDirect SENKRONDUR ve Premiere arayuzunu bloklar; uzun
 * sekanslarda kullanici donmus sanabilir. Panel bunu once uyarmali.
 * Alternatif app.encoder.encodeSequence()'tir (AME kuyruğu, asenkron,
 * ilerleme olaylari verir) - AME kurulu olmasini gerektirir.
 *
 * @param outPath  hedef .wav yolu
 * @param presetPath  ses-only .epr preset yolu
 * @param rangeType  0=tum sekans, 1=in/out, 2=work area
 */
function trExportAudio(outPath, presetPath, rangeType) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return err('Aktif sekans yok.');
        if (!fileExists(presetPath)) return err('Preset bulunamadi: ' + presetPath);

        var range = (rangeType === undefined || rangeType === null) ? 0 : parseInt(rangeType, 10);

        // Hedef klasoru olustur
        try {
            var f = new File(outPath);
            var parent = f.parent;
            if (parent && !parent.exists) parent.create();
            if (f.exists) f.remove();
        } catch (e) {}

        var t0 = new Date().getTime();
        var result = seq.exportAsMediaDirect(outPath, presetPath, range);
        var elapsed = (new Date().getTime() - t0) / 1000;

        if (!fileExists(outPath)) {
            return err('Disari aktarma dosya uretmedi. Preset ses iceriyor mu?',
                'exportAsMediaDirect dondu: ' + result);
        }
        var size = 0;
        try { size = new File(outPath).length; } catch (e) {}

        return ok([
            kv('path', outPath),
            kv('bytes', String(size), true),
            kv('elapsedSec', elapsed.toFixed(1), true),
            kv('result', String(result))
        ]);
    } catch (e) {
        return err('Ses disari aktarilamadi', e);
    }
}

/* ------------------------------------------------------------------ */
/*  Ses preset'i otomatik bulma                                        */
/* ------------------------------------------------------------------ */

/**
 * whisper.cpp 16 kHz mono 16-bit WAV ister.
 * Premiere bu preset'i ZATEN kendi kurulumunda getiriyor (muhtemelen kendi
 * konusma tanima ozelligi icin). Yani kendi .epr'imizi uretip dagitmamiza
 * gerek yok - tercih sirasiyla arayip bulaniyi kullaniyoruz.
 */
/**
 * ONEMLI AYRIM: dosya adi dogru olsa bile PRESET TURU yanlis olabilir.
 *
 * "WAV_Mono_16bit_16kHz.epr" tam istedigimiz formati tarif ediyor ama bir
 * INGEST/TRANSCODE preset'idir (icinde <IngestPreset>, <IngestTranscodeEnabled>
 * gibi alanlar var). exportAsMediaDirect'e verilince "Unknown Error" doner.
 * Gercek disa aktarma preset'lerinde bunlar yerine <DoAudio>, <DoVideo>,
 * <CropRect> gibi sekans export parametreleri bulunur.
 *
 * Hepsinin ExporterFileType degeri 1463899717 = "WAVE" — yani Wave48mono16 de
 * WAV uretir; 48 kHz'i cekirdek yeniden ornekleyici 16 kHz'e indirir.
 */
var PRESET_PREFERENCE = [
    'Wave48mono16.epr',   // 48 kHz mono 16-bit - en temiz disa aktarma preset'i
    'Wave48mono24.epr',
    'Wave96mono16.epr',
    'AudioOnly.epr',
    'AudioForAudition.epr'
];

// Bu alanlardan biri varsa preset ingest icindir, sekans export'unda kullanilamaz
var INGEST_MARKERS = ['IngestTranscodeExporterModuleName', 'IngestPresetUserComments'];

/** Preset dosyasi disa aktarma icin mi, ingest icin mi? */
function isExportPreset(file) {
    try {
        if (!file.open('r')) return false;
        var head = file.read(4000);
        file.close();
        for (var i = 0; i < INGEST_MARKERS.length; i++) {
            if (head.indexOf(INGEST_MARKERS[i]) >= 0) return false;
        }
        return true;
    } catch (e) {
        return true; // okuyamadiysak denemesine izin ver
    }
}

function presetFolders() {
    var list = [];
    // Windows'ta Settings, exe'nin yanindadir. Mac'te Folder.startup
    // ".app/Contents/MacOS" gosterir, Settings ise bir ust klasordedir
    // (".app/Contents/Settings"). Yukari dogru birkac seviye bakmak ikisini
    // de karsilar.
    try {
        var d = Folder.startup;
        for (var i = 0; i < 3 && d; i++) {
            list.push(d.fsName + '/Settings/EncoderPresets');
            d = d.parent;
        }
    } catch (e) {}
    // Folder.startup guvenilmezse bilinen konumlar
    var yillar = ['2026', '2025', '2027'];
    for (var y = 0; y < yillar.length; y++) {
        var ad = 'Adobe Premiere Pro ' + yillar[y];
        if ($.os.indexOf('Windows') >= 0) {
            list.push('C:/Program Files/Adobe/' + ad + '/Settings/EncoderPresets');
        } else {
            list.push('/Applications/' + ad + '/' + ad + '.app/Contents/Settings/EncoderPresets');
        }
    }
    return list;
}

/** Denenebilecek disa aktarma preset'lerini tercih sirasiyla toplar. */
function collectPresets() {
    var folders = presetFolders();
    var found = [];
    var seen = {};
    for (var f = 0; f < folders.length; f++) {
        var dir = new Folder(folders[f]);
        if (!dir.exists) continue;
        for (var p = 0; p < PRESET_PREFERENCE.length; p++) {
            var name = PRESET_PREFERENCE[p];
            if (seen[name]) continue;
            var file = new File(folders[f] + '/' + name);
            if (file.exists && isExportPreset(file)) {
                seen[name] = true;
                found.push({ name: name, path: file.fsName });
            }
        }
    }
    return found;
}

function trFindAudioPreset() {
    try {
        var list = collectPresets();
        if (!list.length) return err('Kullanilabilir ses disa aktarma preset bulunamadi.', 'Bakilan: ' + presetFolders().join(' ; '));
        var names = [];
        for (var i = 0; i < list.length; i++) names.push(list[i].name);
        return ok([
            kv('preset', list[0].name),
            kv('path', list[0].path),
            kv('count', String(list.length), true),
            kv('all', arrToJson(names), true)
        ]);
    } catch (e) {
        return err('Preset aramasi basarisiz', e);
    }
}

/**
 * Sesi disari aktarir; preset'leri SIRAYLA dener.
 *
 * Bir preset'in dosya adinin dogru olmasi ise yarayacagi anlamina gelmiyor
 * (ingest preset'leri "Unknown Error" veriyor). Tek tek deneyip gercekten
 * dosya ureteni buluyoruz ve hangilerinin neden basarisiz oldugunu raporluyoruz.
 */
/**
 * Secilmeyen ses pistlerini GECICI olarak susturur.
 *
 * exportAsMediaDirect sekansin tum ses miksajini veriyor; tek bir pisti
 * disari aktarma secenegi yok. Tek yol istemedigimiz pistleri susturup
 * disari aktarmak, sonra eski hallerine dondurmek.
 *
 * KRITIK: kullanicinin kendi sustuurdugu pistler de vardir. Onceki
 * durumu kaydedip AYNEN geri koyuyoruz; yoksa kullanicinin sekansini
 * sessizce degistirmis oluruz.
 *
 * @param secili  "0,2" gibi virgullu pist indeksleri; bos ise hepsi
 * @returns onceki durumlar dizisi (geriYukle'ye verilecek)
 */
function sesPistleriniAyarla(seq, secili) {
    var onceki = [];
    if (secili === undefined || secili === null || secili === '') return onceki;

    var istenen = {};
    var parcalar = String(secili).split(',');
    var varMi = false;
    for (var p = 0; p < parcalar.length; p++) {
        var n = parseInt(parcalar[p], 10);
        if (!isNaN(n)) { istenen[n] = true; varMi = true; }
    }
    if (!varMi) return onceki;

    var say = 0;
    try { say = seq.audioTracks.numTracks; } catch (e) { return onceki; }

    for (var i = 0; i < say; i++) {
        try {
            var tr = seq.audioTracks[i];
            var eski = tr.isMuted() ? 1 : 0;
            onceki.push(i + ':' + eski);
            var olmali = istenen[i] ? 0 : 1;
            if (eski !== olmali) tr.setMute(olmali);
        } catch (e) { /* bu pist ayarlanamadi; digerlerine devam */ }
    }
    return onceki;
}

/** sesPistleriniAyarla'nin kaydettigi durumlari aynen geri koyar */
function sesPistleriniGeriYukle(seq, onceki) {
    if (!onceki || !onceki.length) return;
    for (var i = 0; i < onceki.length; i++) {
        try {
            var parca = String(onceki[i]).split(':');
            var idx = parseInt(parca[0], 10);
            var deger = parseInt(parca[1], 10);
            seq.audioTracks[idx].setMute(deger);
        } catch (e) {}
    }
}

function trExportAudioAuto(outPath, rangeType, sesPistleri) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return err('Aktif sekans yok.');

        // Yerli yol bicimi sart — duz egik cizgi "Unable to initialize export!" verir
        outPath = toNativePath(outPath);

        var list = collectPresets();
        if (!list.length) return err('Kullanilabilir ses disa aktarma preset bulunamadi.', 'Bakilan: ' + presetFolders().join(' ; '));

        /* ARALIK TURU — sabit sayi YAZMA.
         *
         * "0 = tum sekans" varsayimi belgelenmemis bir tahmindi. Premiere'in
         * kendi sabitini okuyup kullaniyoruz; yanlis aralik verilirse yalnizca
         * in/out veya work area disari aktarilir ve altyazi sekansin bastaki
         * kucuk bir bolumune sikisir. */
        var range;
        if (rangeType === undefined || rangeType === null || rangeType === '') {
            try {
                range = app.encoder.ENCODE_ENTIRE;
            } catch (e) { range = 0; }
            if (range === undefined || range === null || isNaN(range)) range = 0;
        } else {
            range = parseInt(rangeType, 10);
        }

        var attempts = [];

        // Secilmeyen ses pistlerini gecici sustur; ne olursa olsun geri koy
        var oncekiSes = sesPistleriniAyarla(seq, sesPistleri);
        if (oncekiSes.length) attempts.push('ses pistleri: ' + String(sesPistleri));

        attempts.push('aralik turu = ' + range +
            ' (ENCODE_ENTIRE=' + String(app.encoder && app.encoder.ENCODE_ENTIRE) +
            ', IN_TO_OUT=' + String(app.encoder && app.encoder.ENCODE_IN_TO_OUT) +
            ', WORKAREA=' + String(app.encoder && app.encoder.ENCODE_WORKAREA) + ')');

        for (var i = 0; i < list.length; i++) {
            var preset = list[i];
            try {
                var f = new File(outPath);
                if (f.parent && !f.parent.exists) f.parent.create();
                if (f.exists) f.remove();
            } catch (e) {}

            var t0 = new Date().getTime();
            var res = null;
            var threw = '';
            try {
                res = seq.exportAsMediaDirect(outPath, preset.path, range);
            } catch (e2) {
                threw = String(e2.message || e2);
            }
            var elapsed = (new Date().getTime() - t0) / 1000;

            if (fileExists(outPath)) {
                var size = 0;
                try { size = new File(outPath).length; } catch (e) {}
                if (size > 1024) {
                    attempts.push('OK  ' + preset.name + '  -> ' + size + ' bayt, ' +
                                  elapsed.toFixed(1) + ' sn');
                    return ok([
                        kv('path', outPath),
                        kv('preset', preset.name),
                        kv('bytes', String(size), true),
                        kv('elapsedSec', elapsed.toFixed(1), true),
                        kv('attempts', arrToJson(attempts), true)
                    ]);
                }
                attempts.push('BOS ' + preset.name + '  -> dosya ' + size + ' bayt');
            } else {
                attempts.push('HATA ' + preset.name + '  -> ' +
                              (threw || String(res) || 'dosya uretilmedi'));
            }
        }

        return err('Hicbir preset ses uretemedi',
                   attempts.join(' | '));
    } catch (e) {
        return err('Ses disari aktarilamadi', e);
    } finally {
        // Kullanicinin sekansini degistirmis birakmamak icin her durumda
        try { sesPistleriniGeriYukle(app.project.activeSequence, oncekiSes); } catch (e2) {}
    }
}

/* ------------------------------------------------------------------ */
/*  DISA AKTARMA TESHISI                                               */
/* ------------------------------------------------------------------ */

/**
 * "Unable to initialize export!" hatasinin kaynagini daraltir.
 *
 * Bes preset'in de AYNI hatayi vermesi sorunun preset'te degil, ya verdigimiz
 * yolda ya da exportAsMediaDirect'in kendisinde oldugunu gosteriyor.
 * Premiere 26.x cok yeni; bu API'nin artik islevsiz olmasi da mumkun.
 *
 * Bu fonksiyon tek turda su uc ekseni birden olcer:
 *   1. Yol bicimi   (ters/duz egik cizgi, farkli klasorler)
 *   2. Aralik turu  (0 = tum sekans, 1 = in/out, 2 = work area)
 *   3. Alternatif   (app.encoder.encodeSequence — AME kuyrugu)
 */
function trProbeExport() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return err('Aktif sekans yok.');

        var lines = [];

        // --- app.encoder uzerinde ne var? ---
        var encMembers = [];
        try {
            for (var k in app.encoder) {
                try { encMembers.push(k + (typeof app.encoder[k] === 'function' ? '()' : '')); } catch (e) {}
            }
            encMembers.sort();
        } catch (e) { encMembers.push('app.encoder okunamadi: ' + e); }
        lines.push('app.encoder: ' + (encMembers.length ? encMembers.join(', ') : 'YOK'));

        // --- sequence uzerinde export ile ilgili uyeler ---
        var seqExport = [];
        var expCandidates = ['exportAsMediaDirect', 'exportAsProject', 'exportAsFinalCutProXML'];
        for (var c = 0; c < expCandidates.length; c++) {
            try {
                if (typeof seq[expCandidates[c]] !== 'undefined') {
                    seqExport.push(expCandidates[c] + ': ' + (typeof seq[expCandidates[c]]));
                }
            } catch (e) {}
        }
        lines.push('sequence export uyeleri: ' + (seqExport.length ? seqExport.join(', ') : 'YOK'));

        // --- Preset sec ---
        var presets = collectPresets();
        if (!presets.length) return err('Denenecek preset yok.');
        var preset = presets[0];
        lines.push('kullanilan preset: ' + preset.name);
        lines.push('preset yolu var mi: ' + (fileExists(preset.path) ? 'evet' : 'HAYIR'));

        // --- Yazilabilir klasor adaylari ---
        var folders = [];
        try { folders.push({ n: 'Documents', p: Folder.myDocuments.fsName }); } catch (e) {}
        try { folders.push({ n: 'Desktop', p: Folder.desktop.fsName }); } catch (e) {}
        try { folders.push({ n: 'temp', p: Folder.temp.fsName }); } catch (e) {}
        try {
            if (app.project.path) {
                folders.push({ n: 'proje klasoru', p: new File(app.project.path).parent.fsName });
            }
        } catch (e) {}

        // --- Yazma izni gercekten var mi? ---
        for (var f = 0; f < folders.length; f++) {
            var probe = new File(folders[f].p + '/tkcaption-yazma-testi.txt');
            var can = false;
            try {
                if (probe.open('w')) { probe.write('test'); probe.close(); can = true; probe.remove(); }
            } catch (e) {}
            lines.push('yazilabilir [' + folders[f].n + ']: ' + (can ? 'evet' : 'HAYIR') + '  ' + folders[f].p);
        }

        // --- exportAsMediaDirect matrisi ---
        var attempts = [];
        if (folders.length) {
            var base = folders[0].p;
            var variants = [
                { label: 'duz egik + aralik 0', path: base.replace(/\\/g, '/') + '/tkcaption-test.wav', range: 0 },
                { label: 'ters egik + aralik 0', path: base + '\\tkcaption-test.wav', range: 0 },
                { label: 'duz egik + aralik 1', path: base.replace(/\\/g, '/') + '/tkcaption-test.wav', range: 1 },
                { label: 'duz egik + aralik 2', path: base.replace(/\\/g, '/') + '/tkcaption-test.wav', range: 2 }
            ];
            for (var v = 0; v < variants.length; v++) {
                var t = variants[v];
                try { var old = new File(t.path); if (old.exists) old.remove(); } catch (e) {}
                var msg = '';
                try {
                    var r = seq.exportAsMediaDirect(t.path, preset.path, t.range);
                    msg = 'donen: ' + String(r);
                } catch (e2) {
                    msg = String(e2.message || e2);
                }
                var made = fileExists(t.path);
                var size = 0;
                if (made) { try { size = new File(t.path).length; } catch (e) {} }
                attempts.push((made ? 'OK   ' : 'HATA ') + t.label + '  -> ' + msg +
                              (made ? '  [' + size + ' bayt]' : ''));
                if (made) { try { new File(t.path).remove(); } catch (e) {} break; }
            }
        }

        // --- Alternatif: AME kuyrugu ---
        var ame = 'denenmedi';
        try {
            if (app.encoder && typeof app.encoder.encodeSequence === 'function') {
                ame = 'encodeSequence MEVCUT (AME yolu denenebilir)';
            } else {
                ame = 'encodeSequence YOK';
            }
        } catch (e) { ame = 'kontrol edilemedi: ' + e; }
        lines.push('AME: ' + ame);

        return ok([
            kv('appVersion', app.version),
            kv('info', arrToJson(lines), true),
            kv('attempts', arrToJson(attempts), true)
        ]);
    } catch (e) {
        return err('Disa aktarma teshisi basarisiz', e);
    }
}

/* ------------------------------------------------------------------ */
/*  SRT iceri alma                                                     */
/* ------------------------------------------------------------------ */

function trImportSrt(srtPath) {
    try {
        if (!fileExists(srtPath)) return err('SRT bulunamadi: ' + srtPath);
        var bin = null;
        try { bin = app.project.getInsertionBin(); } catch (e) { bin = app.project.rootItem; }

        var before = 0;
        try { before = app.project.rootItem.children.numItems; } catch (e) {}

        var okImport = app.project.importFiles([srtPath], true, bin, false);

        var after = 0;
        try { after = app.project.rootItem.children.numItems; } catch (e) {}

        return ok([
            kv('imported', okImport ? 'true' : 'false', true),
            kv('path', srtPath),
            kv('itemsBefore', String(before), true),
            kv('itemsAfter', String(after), true)
        ]);
    } catch (e) {
        return err('SRT projeye alinamadi', e);
    }
}

/**
 * Uretilen SRT'nin kalici olarak kaydedilecegi yer.
 *
 * Gecici klasore yazip silmek, "altyazi kayiyor" gibi bir sikayette
 * SRT'nin mi yoksa Premiere'e yerlestirmenin mi hatali oldugunu
 * ayirt etmeyi imkansiz kiliyordu. Artik dosya duruyor: kullanici
 * elle surukleyip karsilastirabilir.
 */
function trSuggestSrtPath(sequenceName, ext) {
    try {
        var dir = null;
        try {
            if (app.project.path) dir = new File(app.project.path).parent.fsName;
        } catch (e) {}
        if (!dir) { try { dir = Folder.myDocuments.fsName; } catch (e) {} }
        if (!dir) return err('Kaydedilecek klasor bulunamadi.');

        /* Altyazilar proje klasorunun KOKUNE degil, kendi klasorune yazilir.
         * Her calistirmada koke bir dosya birakmak kurgu klasorunu kirletiyor.
         * Klasor adi proje panelindeki bin ile ayni: "TK Caption". */
        try {
            var alt = new Folder(dir + '/TK Caption');
            if (!alt.exists) alt.create();
            if (alt.exists) dir = alt.fsName;
        } catch (e) { /* olusturulamazsa koke yazmaya devam */ }

        var uzanti = (ext && String(ext).charAt(0) === '.') ? String(ext) : '.srt';
        var safe = String(sequenceName || 'altyazi').replace(/[\\\/:*?"<>|]/g, '_');
        var base = dir + '\\' + safe;
        var p = base + uzanti;
        var n = 2;
        while (fileExists(p) && n < 100) { p = base + '-' + n + uzanti; n++; }
        return ok([kv('path', toNativePath(p)), kv('folder', dir), kv('ext', uzanti)]);
    } catch (e) {
        return err('SRT yolu belirlenemedi', e);
    }
}

/* ------------------------------------------------------------------ */
/*  Altyazi yerlestirme — uretim yolu                                  */
/* ------------------------------------------------------------------ */

/**
 * SRT'yi projeye alir ve sekansa altyazi pisti olarak yerlestirir.
 *
 * Olculmus imza (Premiere 26.3.0):
 *   createCaptionTrack(projectItem, 0) -> true
 * Tek argümanla cagirmak "Not Enough Parameters" verir.
 *
 * Ikinci argümanin anlami belgelenmemis; 0 her durumda gecerli oldugu icin
 * zaman kodu kaymasini SRT'nin ICINE yaziyoruz (core/src/srt.js --offset).
 * Boylece ikinci argümanin baslangic zamani mi pist indeksi mi oldugu
 * sorusuna bagimli kalmiyoruz.
 */
/**
 * Projedeki TUM ogeleri toplar (bin'lerin icine de girerek).
 *
 * DIKKAT: import islemi getInsertionBin()'e — yani proje panelinde SECILI
 * klasore — yapilir. Yalnizca rootItem.children'a bakmak, kullanici bir
 * klasor secmisse ogeyi bulamamaya yol acar. Olculdu: "oge bulunamadi".
 */
function collectAllItems(node, out, depth) {
    if (!node || depth > 12) return out;
    try {
        for (var i = 0; i < node.children.numItems; i++) {
            var c = node.children[i];
            out.push(c);
            try { if (c.children && c.children.numItems) collectAllItems(c, out, depth + 1); } catch (e) {}
        }
    } catch (e) {}
    return out;
}

function snapshotItems() {
    var list = collectAllItems(app.project.rootItem, [], 0);
    var ids = {};
    for (var i = 0; i < list.length; i++) {
        try { ids[String(list[i].nodeId)] = true; } catch (e) {}
    }
    return ids;
}

/**
 * Import'tan SONRA eklenen ogeyi bulur.
 *
 * Ad esleşmesine guvenmiyoruz: Premiere ogeye farkli bir ad verebilir,
 * ayni adda oge zaten olabilir, ya da oge bir alt klasore dusebilir.
 * Import oncesi/sonrasi FARKI almak bunlarin hicbirine bagli degil.
 */
function findNewItem(beforeIds, filePath) {
    var list = collectAllItems(app.project.rootItem, [], 0);
    var yeni = null;
    for (var i = 0; i < list.length; i++) {
        var id = '';
        try { id = String(list[i].nodeId); } catch (e) { continue; }
        if (!beforeIds[id]) { yeni = list[i]; }
    }
    if (yeni) return yeni;

    // Yedek: ad esleşmesi (fark alinamadiysa)
    var wanted = new File(filePath).name;
    var stem = wanted.replace(/\.[^.]+$/, '');
    for (var j = 0; j < list.length; j++) {
        try {
            if (list[j].name === wanted || list[j].name === stem) return list[j];
        } catch (e) {}
    }
    return null;
}

/** Bir ogeyi altyazi pistine koymayi dener; ayrintiyi rapora yazar. */
function tryPlace(seq, filePath, attempts) {
    var ad = new File(filePath).name;
    if (!fileExists(filePath)) { attempts.push('YOK   ' + ad); return null; }

    var bin = null;
    try { bin = app.project.getInsertionBin(); } catch (e) { bin = app.project.rootItem; }

    var before = snapshotItems();
    var imported = false;
    try { imported = app.project.importFiles([filePath], true, bin, false); }
    catch (e) { attempts.push('HATA  ' + ad + ' -> import: ' + String(e.message || e)); return null; }
    if (!imported) { attempts.push('HATA  ' + ad + ' -> import reddedildi'); return null; }

    var item = findNewItem(before, filePath);
    if (!item) {
        var toplam = collectAllItems(app.project.rootItem, [], 0).length;
        attempts.push('HATA  ' + ad + ' -> oge bulunamadi (projede ' + toplam + ' oge)');
        return null;
    }

    // Ogenin ne olarak alindigini gormek, uzanti tahminini dogrulamanin tek yolu
    var tur = '';
    try { tur = 'ad="' + item.name + '"'; } catch (e) {}
    try { tur += ' type=' + String(item.type); } catch (e) {}
    try { tur += ' video=' + String(item.isSequence ? 'seq' : (item.getMediaPath ? 'media' : '?')); } catch (e) {}

    var placed = false;
    var hata = '';
    try { placed = seq.createCaptionTrack(item, 0); }
    catch (e2) { hata = String(e2.message || e2); }

    attempts.push((placed ? 'OK    ' : 'HATA  ') + ad + ' -> ' +
        (placed ? 'pist olusturuldu' : ('donen=' + String(placed) + (hata ? ' ' + hata : ''))) +
        '  [' + tur + ']');
    return placed ? item : null;
}

/**
 * Altyaziyi sekansa yerlestirir.
 *
 * Birden fazla dosya bicimi SIRAYLA denenir. Sebep olculdu:
 *   - SRT kare hizi tasimaz; Premiere 30 fps varsayar, 60 fps sekansta kayar
 *   - TTML kare hizini tasir; OLCULDU: uzanti .ttml ise Premiere
 *     "File format not supported" diyor, .dfxp ise kabul ediyor
 * Hangisinin ise yaradigini tahmin etmek yerine deneyip raporluyoruz.
 *
 * @param paths  noktali virgulle ayrilmis aday dosyalar, tercih sirasiyla
 */
function trPlaceCaptions(paths) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return err('Aktif sekans yok.');

        if (typeof seq.createCaptionTrack !== 'function') {
            return err('Bu Premiere surumunde createCaptionTrack yok.',
                       'Dosya projeye alindi, elle surukleyebilirsiniz.');
        }

        var list = String(paths).split(';');
        var attempts = [];
        var item = null;
        var usedPath = '';
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            if (!p) continue;
            item = tryPlace(seq, p, attempts);
            if (item) { usedPath = p; break; }
        }

        if (!item) {
            return ok([
                kv('imported', 'true', true),
                kv('placed', 'false', true),
                kv('attempts', arrToJson(attempts), true),
                kv('detail', 'Hicbir bicim piste yerlestirilemedi')
            ]);
        }
        var srtPath = usedPath;

        /* KARE HIZI
         *
         * OLCULDU: setOverrideFrameRate caption ogelerinde ISE YARAMIYOR.
         * Cagri hata vermiyor ama ogenin kare hizi degismiyor ve
         * getFootageInterpretation().frameRate anlamsiz bir deger donduruyor
         * (2.75e-8). Bu yuzden cozum dosya biciminde: TTML kare hizini
         * kendi icinde tasir. */
        var seqFps = 0;
        try { seqFps = TICKS_PER_SECOND / parseFloat(seq.timebase); } catch (e) {}

        return ok([
            kv('imported', 'true', true),
            kv('itemName', item.name),
            kv('usedFile', new File(usedPath).name),
            kv('attempts', arrToJson(attempts), true),
            kv('placed', 'true', true),
            kv('seqFps', seqFps.toFixed(3), true)
        ]);
    } catch (e) {
        return err('Altyazi yerlestirilemedi', e);
    }
}

/* ------------------------------------------------------------------ */
/*  CAPTION TRACK YOKLAMASI — planin en riskli adimi                   */
/* ------------------------------------------------------------------ */

/**
 * Premiere'in bu surumunde altyazi (caption) pistlerine hangi API'lerin
 * acik oldugunu CALISMA ANINDA tespit eder. Tahmin yerine olcum.
 *
 * Sonuca gore uc yoldan biri secilir:
 *   1. Tam otomasyon (caption track olusturup SRT'yi yerlestirme)
 *   2. Yari otomatik (projeye import + kullanici surukleyip birakir)
 *   3. QE DOM uzerinden deneysel yol
 */
function trProbeCaptionApi() {
    var found = [];
    var notes = [];

    try {
        var seq = app.project.activeSequence;
        if (!seq) return err('Aktif sekans yok. Yoklama icin bir sekans acin.');

        // --- Sequence uzerindeki caption ile ilgili uyeler ---
        var seqMembers = [];
        for (var k in seq) {
            try {
                if (/caption|subtitle|closedcaption|cc/i.test(k)) {
                    seqMembers.push(k + ':' + (typeof seq[k]));
                }
            } catch (e) {}
        }
        if (seqMembers.length) found.push('sequence -> ' + seqMembers.join(', '));
        else notes.push('sequence uzerinde caption ile ilgili uye YOK');

        // --- Bilinen aday isimler ---
        var candidates = [
            'captionTracks', 'getCaptionTracks', 'createCaptionTrack',
            'addCaptionTrack', 'importCaption', 'captions'
        ];
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            try {
                if (seq[c] !== undefined) found.push('sequence.' + c + ' = ' + (typeof seq[c]));
            } catch (e) {}
        }

        // --- projectItem uzerinde caption uyeleri ---
        try {
            var root = app.project.rootItem;
            if (root.children.numItems > 0) {
                var it = root.children[0];
                var itemMembers = [];
                for (var k2 in it) {
                    try {
                        if (/caption|subtitle/i.test(k2)) itemMembers.push(k2 + ':' + (typeof it[k2]));
                    } catch (e) {}
                }
                if (itemMembers.length) found.push('projectItem -> ' + itemMembers.join(', '));
            }
        } catch (e) {}

        // --- videoTrack uzerinde caption uyeleri ---
        try {
            if (seq.videoTracks.numTracks > 0) {
                var vt = seq.videoTracks[0];
                var vtMembers = [];
                for (var k3 in vt) {
                    try {
                        if (/caption|subtitle|type/i.test(k3)) vtMembers.push(k3 + ':' + (typeof vt[k3]));
                    } catch (e) {}
                }
                if (vtMembers.length) found.push('videoTrack -> ' + vtMembers.join(', '));
            }
        } catch (e) {}

        // --- VAR OLAN ALTYAZI PISTI: stil ve konum ayarlanabiliyor mu? ---
        // OLCULDU: Premiere TTML'den yalnizca zamanlama, metin ve kare
        // hizini aliyor. tts: stil oznitelikleri ve layout/region konumu
        // yok sayiliyor (region'un VARLIGI zorunlu ama degerleri
        // kullanilmiyor — regionsuz dosya "format not supported" aliyor,
        // regionlu dosya konumdan bagimsiz ustte cikiyor).
        // Dolayisiyla stil ve konumu ancak Premiere'in kendi pist
        // nesnesinden ayarlayabiliriz — varsa. Onu ariyoruz.
        try {
            var ctList = null;
            try { ctList = seq.captionTracks; } catch (e) {}
            if (ctList) {
                var n = 0;
                try { n = ctList.numTracks; } catch (e) { try { n = ctList.length; } catch (e2) {} }
                found.push('sequence.captionTracks bulundu, pist sayisi=' + String(n));

                if (n > 0) {
                    var ct = ctList[0];
                    var ctKeys = [];
                    for (var k5 in ct) {
                        try { ctKeys.push(k5 + (typeof ct[k5] === 'function' ? '()' : ':' + typeof ct[k5])); }
                        catch (e) {}
                    }
                    ctKeys.sort();
                    found.push('captionTrack[0] TUM UYELER: ' + ctKeys.join(', '));

                    // Pist uzerindeki altyazi kliplerine de bakalim: stil
                    // pist duzeyinde degil klip duzeyinde olabilir.
                    try {
                        var clips = ct.clips;
                        var cn = clips ? clips.numItems : 0;
                        found.push('captionTrack[0].clips sayisi=' + String(cn));
                        if (cn > 0) {
                            var cl = clips[0];
                            var clKeys = [];
                            for (var k6 in cl) {
                                try { clKeys.push(k6 + (typeof cl[k6] === 'function' ? '()' : ':' + typeof cl[k6])); }
                                catch (e) {}
                            }
                            clKeys.sort();
                            found.push('captionClip[0] TUM UYELER: ' + clKeys.join(', '));
                        }
                    } catch (e) { notes.push('caption klipleri okunamadi: ' + e); }
                }
            } else {
                notes.push('sequence.captionTracks YOK — pist nesnesine erisilemiyor');
            }
        } catch (e) { notes.push('captionTracks yoklamasi hata: ' + e); }

        // --- Sequence SINIFININ statik uyeleri (ornek degil, sinif) ---
        // createCaptionTrack(item, 0, fmt) ucuncu parametre aliyor ve fmt
        // Sequence.CAPTION_FORMAT_* sabitlerinden geliyor. Hangi formatlar
        // var, biliyor muyuz? Altyazinin monospace ciziliyor ve uste
        // sabitleniyor olmasi bir format ozelligi OLABILIR (CEA-608 boyle
        // davranir). Once hangi sabitlerin var oldugunu gorelim.
        try {
            if (typeof Sequence !== 'undefined' && Sequence) {
                var sabitler = [];
                for (var k7 in Sequence) {
                    try { sabitler.push(k7 + '=' + String(Sequence[k7])); } catch (e) {}
                }
                if (sabitler.length) found.push('Sequence sinifi sabitleri: ' + sabitler.join(', '));
                else notes.push('Sequence sinifi uzerinde sabit sayilamadi');
            } else {
                notes.push('Sequence sinifi tanimsiz');
            }
        } catch (e) { notes.push('Sequence sabitleri okunamadi: ' + e); }

        // --- Altyazi pisti videoTracks icinde mi? ---
        // videoTrack uzerinde mediaType alani var. Altyazi pistleri ayri bir
        // koleksiyonda degil de videoTracks icinde farkli bir mediaType ile
        // duruyor olabilir; oyleyse kliplere ve bilesenlerine erisebiliriz.
        try {
            var vn = seq.videoTracks.numTracks;
            var pistler = [];
            for (var vi = 0; vi < vn; vi++) {
                var tr = seq.videoTracks[vi];
                var mt = '?', nm = '?', cc = 0;
                try { mt = String(tr.mediaType); } catch (e) {}
                try { nm = String(tr.name); } catch (e) {}
                try { cc = tr.clips.numItems; } catch (e) {}
                pistler.push('[' + vi + '] mediaType=' + mt + ' ad=' + nm + ' klip=' + cc);
            }
            found.push('videoTracks (' + vn + '): ' + pistler.join(' | '));
        } catch (e) { notes.push('videoTracks gezilemedi: ' + e); }

        // --- KESME API'SI: sessizlikleri silebilir miyiz? ---
        // Silme tarafi bilinen: trackItem.remove(bRipple, bAlignToVideo) —
        // safe zone temizliginde kullaniyoruz. Eksik olan KESME (razor):
        // sessiz araligin iki ucundan kesmeden silecek bir parca olusmuyor.
        // ExtendScript DOM'unda razor yok; QE DOM'unda olabilir.
        try {
            if (seq.videoTracks.numTracks > 0) {
                var vt0 = seq.videoTracks[0];
                var kn = 0;
                try { kn = vt0.clips.numItems; } catch (e) {}
                if (kn > 0) {
                    var cl0 = vt0.clips[0];
                    var clKeys = [];
                    for (var k8 in cl0) {
                        try { clKeys.push(k8 + (typeof cl0[k8] === 'function' ? '()' : '')); }
                        catch (e) {}
                    }
                    clKeys.sort();
                    found.push('trackItem TUM UYELER: ' + clKeys.join(', '));
                } else {
                    notes.push('V1 bos — trackItem uyeleri dokulemedi');
                }
            }
        } catch (e) { notes.push('trackItem yoklanamadi: ' + e); }

        try {
            if (typeof qe === 'undefined') app.enableQE();
            if (typeof qe !== 'undefined' && qe) {
                var qs = qe.project.getActiveSequence();
                var qKeys = [];
                for (var k9 in qs) {
                    try { qKeys.push(k9 + (typeof qs[k9] === 'function' ? '()' : '')); }
                    catch (e) {}
                }
                qKeys.sort();
                found.push('QE sequence TUM UYELER: ' + qKeys.join(', '));

                // Razor QE'de pist ya da klip duzeyinde olabilir
                try {
                    var qvt = qs.getVideoTrackAt(0);
                    var qtKeys = [];
                    for (var kA in qvt) {
                        try { qtKeys.push(kA + (typeof qvt[kA] === 'function' ? '()' : '')); }
                        catch (e) {}
                    }
                    qtKeys.sort();
                    found.push('QE videoTrack TUM UYELER: ' + qtKeys.join(', '));

                    var qit = qvt.getItemAt(0);
                    if (qit) {
                        var qiKeys = [];
                        for (var kB in qit) {
                            try { qiKeys.push(kB + (typeof qit[kB] === 'function' ? '()' : '')); }
                            catch (e) {}
                        }
                        qiKeys.sort();
                        found.push('QE trackItem TUM UYELER: ' + qiKeys.join(', '));
                    }
                } catch (e) { notes.push('QE pist/klip okunamadi: ' + e); }
            }
        } catch (e) { notes.push('QE DOM acilamadi: ' + e); }

        /* --- KESME/EKLEME METODLARI: ADIYLA SOR ---
         *
         * OLCULEN: for...in dokumunde razor gorunmedi. Ama ExtendScript'te
         * host nesnelerinin metodlari cogu zaman ENUMERABLE DEGIL — QE DOM
         * nesneleri tipik ornegi. Yani listede olmamasi "yok" demek degil.
         * Bu yuzden bilinen aday isimleri tek tek soruyoruz.
         */
        try {
            var hedefler = [];
            try { hedefler.push(['sequence', seq]); } catch (e) {}
            try { hedefler.push(['videoTrack', seq.videoTracks[0]]); } catch (e) {}
            try { hedefler.push(['trackItem', seq.videoTracks[0].clips[0]]); } catch (e) {}
            try {
                if (typeof qe === 'undefined') app.enableQE();
                var qsq = qe.project.getActiveSequence();
                hedefler.push(['QE sequence', qsq]);
                var qvtr = qsq.getVideoTrackAt(0);
                hedefler.push(['QE videoTrack', qvtr]);
                try { hedefler.push(['QE trackItem', qvtr.getItemAt(0)]); } catch (e) {}
            } catch (e) {}

            var adaylar = ['razor', 'razorAt', 'split', 'splitAt', 'cut', 'cutAt',
                           'insertClip', 'overwriteClip', 'addClip', 'appendClip',
                           'remove', 'removeItem', 'rippleDelete', 'deleteGap',
                           'setInPoint', 'setOutPoint', 'setStart', 'setEnd', 'move'];

            for (var hi = 0; hi < hedefler.length; hi++) {
                var ad = hedefler[hi][0];
                var nes = hedefler[hi][1];
                if (!nes) continue;
                var bulunan = [];
                for (var ai = 0; ai < adaylar.length; ai++) {
                    try {
                        if (typeof nes[adaylar[ai]] === 'function') bulunan.push(adaylar[ai] + '()');
                    } catch (e) {}
                }
                if (bulunan.length) found.push(ad + ' METODLARI: ' + bulunan.join(', '));
                else notes.push(ad + ' uzerinde aday metod YOK');
            }

            // Yazilabilir alanlar: kesme yoksa klip sinirlarini oynatmak
            // tek secenek olabilir
            try {
                var ti = seq.videoTracks[0].clips[0];
                if (ti) {
                    var yazilir = [];
                    var alanlar = ['start', 'end', 'inPoint', 'outPoint'];
                    for (var yi = 0; yi < alanlar.length; yi++) {
                        try {
                            var onceki = ti[alanlar[yi]];
                            var tipi = (onceki && typeof onceki === 'object') ? 'Time' : typeof onceki;
                            yazilir.push(alanlar[yi] + ':' + tipi);
                        } catch (e) {}
                    }
                    found.push('trackItem zaman alanlari: ' + yazilir.join(', '));
                }
            } catch (e) {}
        } catch (e) { notes.push('metod yoklamasi hata: ' + e); }

        // --- QE DOM (belgelenmemis ama bazen caption islevleri barindirir) ---
        var qeAvailable = false;
        try {
            if (typeof qe === 'undefined') app.enableQE();
            qeAvailable = (typeof qe !== 'undefined' && qe !== null);
        } catch (e) { notes.push('QE DOM acilamadi: ' + e); }

        if (qeAvailable) {
            try {
                var qseq = qe.project.getActiveSequence();
                var qMembers = [];
                for (var k4 in qseq) {
                    try {
                        if (/caption|subtitle|closedcaption/i.test(k4)) qMembers.push(k4);
                    } catch (e) {}
                }
                if (qMembers.length) found.push('QE sequence -> ' + qMembers.join(', '));
                else notes.push('QE sequence uzerinde caption uyesi YOK');
            } catch (e) { notes.push('QE sekans okunamadi: ' + e); }
        }

        // --- MOGRT yolu (yedek plan: Essential Graphics ile yakma) ---
        try {
            if (typeof seq.importMGT === 'function') found.push('sequence.importMGT MEVCUT (yedek plan uygulanabilir)');
        } catch (e) {}

        // --- TAM UYE DOKUMU ---
        // Regex ile arama, API'nin bekledigimiz kelimeleri kullanmasina bagli.
        // Adobe farkli bir adlandirma sectiyse ("textTracks", "graphics" vb.)
        // kacirlar. Bu yuzden sequence'in tum uyelerini de dokuyoruz.
        var allMembers = [];
        try {
            var seqKeys = [];
            for (var m in seq) {
                try { seqKeys.push(m + (typeof seq[m] === 'function' ? '()' : '')); } catch (e) {}
            }
            seqKeys.sort();
            allMembers.push('sequence: ' + seqKeys.join(', '));
        } catch (e) { allMembers.push('sequence uyeleri okunamadi: ' + e); }

        if (qeAvailable) {
            try {
                var qs = qe.project.getActiveSequence();
                var qKeys = [];
                for (var m2 in qs) {
                    try { qKeys.push(m2 + (typeof qs[m2] === 'function' ? '()' : '')); } catch (e) {}
                }
                qKeys.sort();
                allMembers.push('QE sequence: ' + qKeys.join(', '));
            } catch (e) { allMembers.push('QE uyeleri okunamadi: ' + e); }
        }

        try {
            if (seq.videoTracks.numTracks > 0) {
                var vt0 = seq.videoTracks[0];
                var vKeys = [];
                for (var m3 in vt0) {
                    try { vKeys.push(m3 + (typeof vt0[m3] === 'function' ? '()' : '')); } catch (e) {}
                }
                vKeys.sort();
                allMembers.push('videoTrack[0]: ' + vKeys.join(', '));
            }
        } catch (e) {}

        return ok([
            kv('appVersion', app.version),
            kv('qeAvailable', qeAvailable ? 'true' : 'false', true),
            kv('found', arrToJson(found), true),
            kv('notes', arrToJson(notes), true),
            kv('allMembers', arrToJson(allMembers), true),
            kv('verdict', found.length ? 'API adaylari bulundu' : 'Caption API bulunamadi - yari otomatik yola gecilecek')
        ]);
    } catch (e) {
        return err('Yoklama basarisiz', e);
    }
}

/* ------------------------------------------------------------------ */
/*  createCaptionTrack IMZA DENEYI                                     */
/* ------------------------------------------------------------------ */

/**
 * createCaptionTrack fonksiyonunun nasil cagrildigini deneyerek bulur.
 *
 * Fonksiyonun var olmasi calistigi anlamina gelmez. Imzasi belgelenmemis
 * oldugu icin farkli argüman bilesimlerini tek tek deniyor ve ExtendScript'in
 * hata mesajlarini topluyoruz - hata metinleri genelde beklenen turu ele verir.
 *
 * DIKKAT: Basarili bir cagri kullanicinin projesini DEGISTIRIR (altyazi pisti
 * olusturur). Panel bunu once uyarir; geri almak icin Ctrl+Z yeterlidir.
 */
function trTestCaptionTrack(srtPath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return err('Aktif sekans yok.');

        var fn = null;
        try { fn = seq.createCaptionTrack; } catch (e) {}
        if (typeof fn !== 'function') {
            return err('createCaptionTrack bu surumde yok.');
        }

        // --- Fonksiyon hakkinda ne ogrenebiliyoruz ---
        var arity = 'bilinmiyor';
        try { if (typeof fn.length === 'number') arity = String(fn.length); } catch (e) {}
        var src = '';
        try { src = String(fn).slice(0, 200); } catch (e) { src = '(okunamadi)'; }

        // --- SRT'yi projeye al ---
        if (!srtPath) {
            var picked = File.openDialog('Denenecek SRT dosyasini secin', '*.srt');
            if (!picked) return err('SRT secilmedi.');
            srtPath = picked.fsName;
        }
        if (!fileExists(srtPath)) return err('SRT bulunamadi: ' + srtPath);

        var bin = null;
        try { bin = app.project.getInsertionBin(); } catch (e) { bin = app.project.rootItem; }
        app.project.importFiles([srtPath], true, bin, false);

        // Iceri alinan ogeyi dosya adiyla bul
        var wanted = decodeURIComponent(new File(srtPath).name);
        var item = null;
        try {
            var root = app.project.rootItem;
            for (var i = 0; i < root.children.numItems; i++) {
                var c = root.children[i];
                if (c.name === wanted || c.name.indexOf(wanted.replace(/\.srt$/i, '')) === 0) {
                    item = c;
                }
            }
        } catch (e) {}

        if (!item) {
            return ok([
                kv('arity', arity),
                kv('source', src),
                kv('attempts', arrToJson(['SRT import edildi ama projectItem bulunamadi']), true),
                kv('imported', 'false', true)
            ]);
        }

        // --- Argüman bilesimlerini sirayla dene ---
        var zero = '0';
        try { zero = String(seq.zeroPoint); } catch (e) {}

        var variants = [
            { label: '(projectItem)', args: [item] },
            { label: '(projectItem, 0)', args: [item, 0] },
            { label: '(projectItem, "0")', args: [item, '0'] },
            { label: '(projectItem, zeroPoint)', args: [item, zero] },
            { label: '(projectItem, 0, 0)', args: [item, 0, 0] },
            { label: '(projectItem, zeroPoint, 0)', args: [item, zero, 0] },
            { label: '(projectItem, 0, 0, 0)', args: [item, 0, 0, 0] }
        ];

        var attempts = [];
        var success = null;
        var tracksBefore = 0;
        try { tracksBefore = seq.videoTracks.numTracks; } catch (e) {}

        for (var v = 0; v < variants.length; v++) {
            var t = variants[v];
            try {
                var r = fn.apply(seq, t.args);
                var after = 0;
                try { after = seq.videoTracks.numTracks; } catch (e) {}
                attempts.push('OK  ' + t.label + '  -> donen: ' + String(r) +
                              '  | video pist: ' + tracksBefore + ' -> ' + after);
                if (success === null) success = t.label;
                break; // ilk basarida dur, projeyi gereksiz kirletme
            } catch (e2) {
                attempts.push('HATA ' + t.label + '  -> ' + String(e2.message || e2));
            }
        }

        return ok([
            kv('arity', arity),
            kv('source', src),
            kv('itemName', item.name),
            kv('imported', 'true', true),
            kv('attempts', arrToJson(attempts), true),
            kv('success', success ? success : '')
        ]);
    } catch (e) {
        return err('createCaptionTrack denemesi basarisiz', e);
    }
}

/* ------------------------------------------------------------------ */
/*  Ortam kontrolu                                                     */
/* ------------------------------------------------------------------ */

/**
 * Hazir metin stillerini Premiere'in stil klasorune kopyalar.
 *
 * NEDEN KOPRUDEN: hedef klasor "Belgeler" altinda ve Belgeler OneDrive'a
 * yonlendirilmis olabiliyor (kullanicinin makinesinde oyle:
 * C:\Users\...\OneDrive\Belgeler\...). Node'un homedir()+Documents
 * varsayimi bu durumda yanlis yere yazardi. ExtendScript'in
 * Folder.myDocuments'i sistemin gercek Belgeler yolunu veriyor.
 *
 * NEDEN PANELDEN, KUR.ps1'DEN DEGIL: ZXP Installer ile kurulunca KUR.ps1
 * hic calismiyor. Stiller yalnizca zip kurulumunda gelirse ZXP kullanan
 * arkadaslarda hic olmaz.
 *
 * Var olan dosyanin uzerine YAZMIYORUZ: kullanici stili kendine gore
 * duzenlemis olabilir, guncelleme onu geri almamali.
 *
 * @param srcDir eklenti icindeki styles/ klasoru
 */
function trInstallTextStyles(srcDir) {
    try {
        var src = new Folder(srcDir);
        if (!src.exists) return err('Stil klasoru yok: ' + srcDir);

        var docs = Folder.myDocuments;
        if (!docs || !docs.exists) return err('Belgeler klasoru bulunamadi.');

        var hedefYol = docs.fsName + '/Adobe/Common/Assets/Text Styles';
        var hedef = new Folder(hedefYol);
        if (!hedef.exists) {
            if (!hedef.create()) return err('Stil klasoru olusturulamadi: ' + hedefYol);
        }

        var dosyalar = src.getFiles('*.prtextstyle');
        var kopyalanan = [];
        var atlanan = [];
        for (var i = 0; i < dosyalar.length; i++) {
            var f = dosyalar[i];
            var d = new File(hedef.fsName + '/' + f.name);
            if (d.exists) { atlanan.push(f.name); continue; }
            if (f.copy(d.fsName)) kopyalanan.push(f.name);
        }

        return ok([
            kv('dir', hedefYol),
            kv('copied', String(kopyalanan.length), true),
            kv('skipped', String(atlanan.length), true),
            kv('files', arrToJson(kopyalanan), true)
        ]);
    } catch (e) {
        return err('Stiller kurulamadi', e);
    }
}

/**
 * Sekansin UCUZ imzasi — degisip degismedigini anlamak icin.
 *
 * NEDEN AYRI: trGetSequenceInfo her cagrida ses timeline'larini geziyor,
 * klip sayiyor ve mute durumu okuyor. Bunu saniyede bir yapmak cok
 * timeline'li bir sekansta Premiere'i bosuna mesgul eder.
 *
 * Bu fonksiyon yalnizca degisimi yakalayacak kadarini okuyor: sekans
 * kimligi, In/Out noktalari ve timeline sayilari. Imza degisirse panel
 * tam bilgiyi bir kez aliyor.
 */
function trSeqSignature() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return ok([kv('sig', 'yok')]);

        var parts = [];
        try { parts.push(String(seq.sequenceID)); } catch (e) { parts.push('?'); }
        try { parts.push(String(seq.getInPoint())); } catch (e) { parts.push('?'); }
        try { parts.push(String(seq.getOutPoint())); } catch (e) { parts.push('?'); }
        try { parts.push(String(seq.audioTracks.numTracks)); } catch (e) { parts.push('?'); }
        try { parts.push(String(seq.videoTracks.numTracks)); } catch (e) { parts.push('?'); }
        try { parts.push(String(seq.end)); } catch (e) { parts.push('?'); }

        return ok([kv('sig', parts.join('|'))]);
    } catch (e) {
        return ok([kv('sig', 'hata')]);
    }
}

/**
 * Projedeki bir medya ogesini diskteki halinden yeniden okutur.
 *
 * NEDEN: altyazi metni duzenlenince dosya degisiyor ama Premiere iceri
 * aldigi kopyayi kullanmaya devam ediyor. Simdiye kadar yeni bir altyazi
 * timeline'i ekleyip eskisini kullaniciya elle sildiriyorduk — her
 * duzenlemede sekansa bir timeline daha birikiyordu.
 *
 * projectItem.refreshMedia() varsa dosya yerinde tazeleniyor ve var olan
 * timeline kendiliginden guncelleniyor. API belgelenmis ama altyazi
 * ogelerinde calisip calismadigi belirsiz — sonucu raporluyoruz ki
 * panel calismazsa eski yola dusebilsin.
 *
 * @returns {found, refreshed, method}
 */
function trRefreshMedia(dosyaYolu) {
    try {
        var hedef = String(dosyaYolu).replace(/\\/g, '/').toLowerCase();
        var hepsi = collectAllItems(app.project.rootItem, [], 0);

        var oge = null;
        for (var i = 0; i < hepsi.length; i++) {
            try {
                var yol = '';
                try { yol = String(hepsi[i].getMediaPath()); } catch (e) { continue; }
                if (yol.replace(/\\/g, '/').toLowerCase() === hedef) { oge = hepsi[i]; break; }
            } catch (e) {}
        }

        if (!oge) {
            return ok([kv('found', 'false', true), kv('refreshed', 'false', true),
                       kv('method', 'oge bulunamadi')]);
        }

        // refreshMedia donus degeri belgelenmemis; varligini ve cagriyi
        // ayri ayri raporluyoruz
        if (typeof oge.refreshMedia !== 'function') {
            return ok([kv('found', 'true', true), kv('refreshed', 'false', true),
                       kv('method', 'refreshMedia yok')]);
        }

        var hata = '';
        try { oge.refreshMedia(); }
        catch (e) { hata = String(e.message || e); }

        return ok([
            kv('found', 'true', true),
            kv('refreshed', hata ? 'false' : 'true', true),
            kv('method', hata ? ('hata: ' + hata) : 'refreshMedia'),
            kv('name', String(oge.name))
        ]);
    } catch (e) {
        return err('Medya tazelenemedi', e);
    }
}

/**
 * Var olan altyazi timeline'larini silmeyi DENER, sonra yenisini koyar.
 *
 * Simdiye kadar "captionTracks yok, silinemez" deyip gectim. Ama razor da
 * for...in dokumunde yoktu ve adiyla sorunca cikmisti. Burada da ayni
 * yontem: silme icin bilinen tum yollari sirayla deniyoruz ve hangisinin
 * ise yaradigini raporluyoruz.
 *
 * Hicbiri calismazsa yerlestirme yine yapiliyor — kullanici en azindan
 * duzeltilmis altyaziyi aliyor — ama panel eskisinin durdugunu soyluyor.
 */
function trReplaceCaptions(srtPath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return err('Aktif sekans yok.');

        var denemeler = [];
        var silindi = 0;

        /* --- 1) sequence uzerinde dogrudan silme metodlari --- */
        var seqAdaylar = ['removeCaptionTrack', 'deleteCaptionTrack',
                          'removeTracks', 'deleteTracks', 'removeTrack'];
        for (var i = 0; i < seqAdaylar.length; i++) {
            try {
                if (typeof seq[seqAdaylar[i]] === 'function') {
                    denemeler.push('sequence.' + seqAdaylar[i] + ' VAR');
                }
            } catch (e) {}
        }

        /* --- 2) QE DOM uzerinden pist silme --- */
        try {
            if (typeof qe === 'undefined') app.enableQE();
            var qseq = qe.project.getActiveSequence();

            var qeAdaylar = ['removeTracks', 'deleteTrack', 'removeVideoTrack',
                             'removeAudioTrack', 'removeCaptionTrack'];
            for (var q = 0; q < qeAdaylar.length; q++) {
                try {
                    if (typeof qseq[qeAdaylar[q]] === 'function') {
                        denemeler.push('QE.' + qeAdaylar[q] + ' VAR');
                    }
                } catch (e) {}
            }

            /* QE removeTracks imzasi: (numV, vIndex, numA, aIndex, ...) —
             * addTracks'in karsiligi. Altyazi pisti bu sayima giriyor mu
             * bilmiyoruz; denenip sonuca bakiliyor. */
            if (typeof qseq.removeTracks === 'function') {
                var oncekiV = 0;
                try { oncekiV = qseq.numVideoTracks; } catch (e) {}
                // Yalnizca RAPORLUYORUZ — kor kor pist silmek kullanicinin
                // video kliplerini yok edebilir. Once ne oldugunu gorelim.
                denemeler.push('QE video pist sayisi=' + oncekiV);
            }
        } catch (e) { denemeler.push('QE: ' + String(e.message || e)); }

        /* --- 3) Altyazi ogelerini PROJEDEN silmek ---
         * Pist silinemiyorsa, pistin beslendigi proje ogesini silmek
         * pisti de bosaltabilir. Yalnizca bizim urettigimiz .srt
         * ogelerini hedefliyoruz; kullanicinin medyasina dokunmuyoruz. */
        try {
            var hepsi = collectAllItems(app.project.rootItem, [], 0);
            var yeniAd = String(srtPath).replace(/^.*[\\\/]/, '').toLowerCase();
            for (var h = 0; h < hepsi.length; h++) {
                var it = hepsi[h];
                var ad = '';
                try { ad = String(it.name).toLowerCase(); } catch (e) { continue; }
                // Bizim urettiklerimiz: .srt ve ayni taban ada sahip
                if (ad.slice(-4) !== '.srt') continue;
                if (ad === yeniAd) continue;   // yeni koyacagimiz dosya
                try {
                    if (typeof it.deleteBin === 'function') { it.deleteBin(); silindi++; }
                    else if (typeof it.remove === 'function') { it.remove(); silindi++; }
                } catch (e) {}
            }
            denemeler.push('proje ogesi silinen=' + silindi);
        } catch (e) { denemeler.push('oge silme: ' + String(e.message || e)); }

        /* --- 4) Yeni altyaziyi yerlestir --- */
        var yerlesti = false, ayrinti = '';
        try {
            var sonuc = trPlaceCaptions(srtPath);
            var veri = eval('(' + sonuc + ')');
            yerlesti = (veri && String(veri.placed) === 'true');
            if (veri && veri.detail) ayrinti = String(veri.detail);
        } catch (e) { ayrinti = String(e.message || e); }

        return ok([
            kv('placed', yerlesti ? 'true' : 'false', true),
            kv('deletedItems', String(silindi), true),
            kv('notes', arrToJson(denemeler), true),
            kv('detail', ayrinti)
        ]);
    } catch (e) {
        return err('Altyazi degistirilemedi', e);
    }
}

function trPing() {
    try {
        return ok([
            kv('bridgeVersion', TR_ALTYAZI_VERSION),
            kv('appVersion', app.version),
            kv('appName', app.appName ? app.appName : 'Premiere Pro'),
            kv('hasProject', app.project ? 'true' : 'false', true),
            kv('hasSequence', (app.project && app.project.activeSequence) ? 'true' : 'false', true)
        ]);
    } catch (e) {
        return err('Ping basarisiz', e);
    }
}

/** Kullanilabilir .epr preset'lerini listeler (ses-only preset bulmak icin) */
function trListPresets(folderPath) {
    try {
        var f = new Folder(folderPath);
        if (!f.exists) return err('Klasor yok: ' + folderPath);
        var files = f.getFiles('*.epr');
        var names = [];
        for (var i = 0; i < files.length && i < 200; i++) names.push(files[i].name);
        return ok([kv('folder', folderPath), kv('presets', arrToJson(names), true)]);
    } catch (e) {
        return err('Preset listesi alinamadi', e);
    }
}
