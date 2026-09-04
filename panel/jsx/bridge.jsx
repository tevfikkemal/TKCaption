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

var TR_ALTYAZI_VERSION = '0.6.3';
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
    try { list.push(Folder.startup.fsName + '/Settings/EncoderPresets'); } catch (e) {}
    // Folder.startup guvenilmezse bilinen konumlar
    list.push('C:/Program Files/Adobe/Adobe Premiere Pro 2026/Settings/EncoderPresets');
    list.push('C:/Program Files/Adobe/Adobe Premiere Pro 2025/Settings/EncoderPresets');
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
        if (!list.length) return err('Kullanilabilir ses disa aktarma preset bulunamadi.');
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
function trExportAudioAuto(outPath, rangeType) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return err('Aktif sekans yok.');

        // Yerli yol bicimi sart — duz egik cizgi "Unable to initialize export!" verir
        outPath = toNativePath(outPath);

        var list = collectPresets();
        if (!list.length) return err('Kullanilabilir ses disa aktarma preset bulunamadi.');

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
 *   - TTML kare hizini tasir ama Premiere'in kabul ettigi UZANTI belirsiz
 *     (.xml Final Cut Pro XML ile karisiyor olabilir)
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
/*  SAFE ZONE katmani                                                  */
/* ------------------------------------------------------------------ */

// Kendi kattigimiz klibi bu onekten taniyoruz — kaldirirken kullanicinin
// kendi kliplerine dokunmamak icin sart.
var SAFEZONE_PREFIX = 'TKSafeZone';

/** Sekanstaki safe zone kliplerini bulur. */
function findSafeZoneClips(seq) {
    var found = [];
    try {
        for (var t = 0; t < seq.videoTracks.numTracks; t++) {
            var track = seq.videoTracks[t];
            for (var c = 0; c < track.clips.numItems; c++) {
                var clip = track.clips[c];
                var nm = '';
                try { nm = String(clip.name); } catch (e) {}
                if (nm.indexOf(SAFEZONE_PREFIX) === 0) {
                    found.push({ track: t, clip: c, name: nm, item: clip });
                }
            }
        }
    } catch (e) {}
    return found;
}

var SAFEZONE_BIN = 'TK Caption';

/**
 * Katman ogelerinin konacagi bin. Proje kokunu kirletmemek icin.
 * Bulunamaz veya olusturulamazsa null doner; cagiran koke duser.
 */
function getSafeZoneBin() {
    try {
        var root = app.project.rootItem;
        for (var i = 0; i < root.children.numItems; i++) {
            var c = root.children[i];
            var nm = '';
            try { nm = String(c.name); } catch (e) { continue; }
            if (nm === SAFEZONE_BIN) return c;
        }
        return root.createBin(SAFEZONE_BIN);
    } catch (e) { return null; }
}

/**
 * Projedeki safe zone ogelerini siler.
 *
 * deleteBin() medya ogelerinde guvenilmez — hata vermeden basarisiz
 * olabiliyor. Bu yuzden birden fazla yol deneyip HANGISININ ise yaradigini
 * raporluyoruz; tahmin etmek yerine olcuyoruz.
 */
function cleanSafeZoneBinDetailed() {
    var rapor = { denendi: 0, silindi: 0, yontem: '', kalan: 0 };
    try {
        var hepsi = collectAllItems(app.project.rootItem, [], 0);
        var hedef = [];
        for (var i = 0; i < hepsi.length; i++) {
            var nm = '';
            try { nm = String(hepsi[i].name); } catch (e) { continue; }
            if (nm.indexOf(SAFEZONE_PREFIX) === 0) hedef.push(hepsi[i]);
        }
        rapor.denendi = hedef.length;

        for (var j = hedef.length - 1; j >= 0; j--) {
            var oldu = false;
            try { hedef[j].deleteBin(); oldu = true; rapor.yontem = 'deleteBin'; } catch (e) {}
            if (!oldu) {
                try { hedef[j].remove(); oldu = true; rapor.yontem = 'remove'; } catch (e) {}
            }
            if (oldu) rapor.silindi++;
        }

        // Gercekten gitti mi? Silme cagrisinin donmesi silindigi anlamina gelmiyor.
        var sonra = collectAllItems(app.project.rootItem, [], 0);
        for (var k = 0; k < sonra.length; k++) {
            var n2 = '';
            try { n2 = String(sonra[k].name); } catch (e) { continue; }
            if (n2.indexOf(SAFEZONE_PREFIX) === 0) rapor.kalan++;
        }
    } catch (e) {}
    return rapor;
}

/** Projedeki safe zone ogelerini siler. Kullanicinin kliplerine dokunmaz. */
function cleanSafeZoneBin() {
    var silinen = 0;
    try {
        var hepsi = collectAllItems(app.project.rootItem, [], 0);
        for (var i = 0; i < hepsi.length; i++) {
            var nm = '';
            try { nm = String(hepsi[i].name); } catch (e) { continue; }
            if (nm.indexOf(SAFEZONE_PREFIX) === 0) {
                try { hepsi[i].deleteBin(); silinen++; } catch (e) {}
            }
        }
    } catch (e) {}
    return silinen;
}

/**
 * Bu preset+cozunurluk icin projede zaten bir katman ogesi var mi?
 *
 * Silmek yerine YENIDEN KULLANIYORUZ. Sebebi: deleteBin() medya ogelerinde
 * guvenilir calismiyor ve her acilista projeye bir dosya daha ekleniyordu.
 * Ayni preset acilip kapandiginda tek oge yeter.
 */
function trFindSafeZoneItem(key) {
    try {
        var hepsi = collectAllItems(app.project.rootItem, [], 0);
        for (var i = 0; i < hepsi.length; i++) {
            var nm = '';
            try { nm = String(hepsi[i].name); } catch (e) { continue; }
            if (nm.indexOf(SAFEZONE_PREFIX) === 0 && nm.indexOf(key) >= 0) {
                return ok([kv('found', 'true', true), kv('name', nm)]);
            }
        }
        return ok([kv('found', 'false', true), kv('name', '')]);
    } catch (e) {
        return err('Katman ogesi aranamadi', e);
    }
}

function trHasSafeZone() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return err('Aktif sekans yok.');
        var f = findSafeZoneClips(seq);
        return ok([
            kv('present', f.length ? 'true' : 'false', true),
            kv('count', String(f.length), true),
            kv('name', f.length ? f[0].name : '')
        ]);
    } catch (e) {
        return err('Safe zone durumu okunamadi', e);
    }
}

/**
 * Safe zone PNG'sini sekansin EN USTUNE, tum sekans boyunca yerlestirir.
 *
 * Program Monitor'e dogrudan cizim yapmak betikle mumkun degil; bu yuzden
 * ustte saydam bir katman olarak duruyor. Disa aktarmadan once kapatilmali
 * — panel bunu hatirlatiyor.
 */
function trPlaceSafeZone(pngPath, label) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return err('Aktif sekans yok.');
        pngPath = toNativePath(pngPath);
        if (!fileExists(pngPath)) return err('Katman dosyasi bulunamadi: ' + pngPath);

        var adimlar = [];

        // Sekanstaki eski klipleri kaldir (ust uste binmesin)
        var eski = findSafeZoneClips(seq);
        for (var i = eski.length - 1; i >= 0; i--) {
            try { eski[i].item.remove(false, true); } catch (e) {}
        }
        if (eski.length) adimlar.push(eski.length + ' eski klip kaldirildi');

        /* PROJE OGESINI SILMIYORUZ — yeniden kullaniyoruz.
         *
         * Onceki surumde burada cleanSafeZoneBin() cagriliyordu ve KENDI
         * mantigimizla celisiyordu: oge siliniyor, hemen ardindan "mevcut
         * oge var mi" aramasi bos donuyor ve dosya yeniden import ediliyordu.
         * Projeye dosya eklenmesinin surmesinin sebebi buydu. */
        var item = null;
        var wantedName = new File(pngPath).name;
        var wantedPath = String(pngPath).toLowerCase();
        var mevcut = collectAllItems(app.project.rootItem, [], 0);
        var safeSayisi = 0;

        for (var m = 0; m < mevcut.length; m++) {
            var mn = '';
            try { mn = String(mevcut[m].name); } catch (e) { continue; }
            if (mn.indexOf(SAFEZONE_PREFIX) === 0) safeSayisi++;

            // Ada guvenmek yetmez: Premiere ogeyi yeniden adlandirabilir.
            // Asil olcut medya YOLU.
            var mp = '';
            try { mp = String(mevcut[m].getMediaPath()).toLowerCase(); } catch (e) {}
            if ((mp && mp === wantedPath) ||
                mn === wantedName || mn === wantedName.replace(/\.png$/i, '')) {
                item = mevcut[m];
            }
        }
        adimlar.push('projede ' + safeSayisi + ' katman ogesi var');
        if (item) adimlar.push('mevcut oge kullanildi: ' + item.name);

        if (!item) {
            var before = snapshotItems();
            // Kendi bin'imize koy — proje koku kirlenmesin
            var bin = getSafeZoneBin();
            if (!bin) {
                try { bin = app.project.getInsertionBin(); } catch (e) { bin = app.project.rootItem; }
            }
            if (!app.project.importFiles([pngPath], true, bin, false)) {
                return err('Katman projeye alinamadi.');
            }
            item = findNewItem(before, pngPath);
            if (!item) return err('Katman iceri alindi ama proje ogesi bulunamadi.');
            adimlar.push('oge iceri alindi: ' + item.name);
        }

        // En uste yeni bir video pisti ac (mevcut kliplerin uzerini ortmesin)
        var hedefIndex = seq.videoTracks.numTracks;
        try {
            seq.addTracks(1, hedefIndex, 0);
            adimlar.push('yeni video pisti eklendi (' + (hedefIndex + 1) + ')');
        } catch (e) {
            hedefIndex = seq.videoTracks.numTracks - 1;
            adimlar.push('pist eklenemedi, en ust mevcut pist kullanilacak: ' + String(e.message || e));
        }

        var track = seq.videoTracks[hedefIndex];
        if (!track) return err('Hedef video pisti bulunamadi.', adimlar.join(' | '));

        try {
            track.overwriteClip(item, 0);
            adimlar.push('klip yerlestirildi');
        } catch (e) {
            return err('Klip piste konulamadi', String(e.message || e) + ' | ' + adimlar.join(' | '));
        }

        // Klibi sekansin sonuna kadar uzat (hareketsiz goruntunun varsayilan
        // suresi kisadir; safe zone tum sekans boyunca gorunmeli)
        var uzatildi = 'denenmedi';
        try {
            var clip = track.clips[track.clips.numItems - 1];
            clip.end = seq.end;
            uzatildi = 'sekans sonuna uzatildi';
        } catch (e) {
            uzatildi = 'uzatilamadi: ' + String(e.message || e);
        }
        adimlar.push(uzatildi);

        return ok([
            kv('placed', 'true', true),
            kv('track', String(hedefIndex + 1), true),
            kv('label', label || ''),
            kv('steps', arrToJson(adimlar), true)
        ]);
    } catch (e) {
        return err('Safe zone yerlestirilemedi', e);
    }
}

/** Safe zone katmanini kaldirir. Kullanicinin kendi kliplerine dokunmaz. */
function trRemoveSafeZone() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return err('Aktif sekans yok.');

        var clips = findSafeZoneClips(seq);
        var silinen = 0;
        for (var i = clips.length - 1; i >= 0; i--) {
            try { clips[i].item.remove(false, true); silinen++; } catch (e) {}
        }

        /* Proje ogeleri de temizlensin. Hangi yontemin ise yaradigini
         * ve gercekten silinip silinmedigini raporluyoruz — "silindi"
         * demek yetmiyor, sonradan sayip dogruluyoruz. */
        var r = cleanSafeZoneBinDetailed();

        return ok([
            kv('removed', String(silinen), true),
            kv('binTried', String(r.denendi), true),
            kv('binDeleted', String(r.silindi), true),
            kv('binLeft', String(r.kalan), true),
            kv('binMethod', r.yontem || 'hicbiri')
        ]);
    } catch (e) {
        return err('Safe zone kaldirilamadi', e);
    }
}

/* ------------------------------------------------------------------ */
/*  Ortam kontrolu                                                     */
/* ------------------------------------------------------------------ */

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
