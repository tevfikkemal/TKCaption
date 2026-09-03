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

var TR_ALTYAZI_VERSION = '0.1.0';
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

        return ok([
            kv('name', seq.name),
            kv('sequenceID', seq.sequenceID),
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
var PRESET_PREFERENCE = [
    'WAV_Mono_16bit_16kHz.epr',          // birebir istedigimiz format
    'RawPCM_mono_16khz_nometadata.epr',  // yine 16 kHz mono
    'Wave48mono16.epr',                  // 48 kHz mono - CLI yeniden orneklemeye indirir
    'Wave48mono24.epr',
    'AudioOnly.epr'                      // son care
];

function presetFolders() {
    var list = [];
    try { list.push(Folder.startup.fsName + '/Settings/EncoderPresets'); } catch (e) {}
    // Folder.startup guvenilmezse bilinen konumlar
    list.push('C:/Program Files/Adobe/Adobe Premiere Pro 2026/Settings/EncoderPresets');
    list.push('C:/Program Files/Adobe/Adobe Premiere Pro 2025/Settings/EncoderPresets');
    return list;
}

function trFindAudioPreset() {
    try {
        var folders = presetFolders();
        var checked = [];
        for (var f = 0; f < folders.length; f++) {
            var dir = new Folder(folders[f]);
            checked.push(folders[f] + (dir.exists ? ' (var)' : ' (yok)'));
            if (!dir.exists) continue;
            for (var p = 0; p < PRESET_PREFERENCE.length; p++) {
                var candidate = new File(folders[f] + '/' + PRESET_PREFERENCE[p]);
                if (candidate.exists) {
                    return ok([
                        kv('preset', PRESET_PREFERENCE[p]),
                        kv('path', candidate.fsName),
                        kv('folder', folders[f]),
                        kv('rank', String(p), true),
                        kv('exact', p <= 1 ? 'true' : 'false', true),
                        kv('checked', arrToJson(checked), true)
                    ]);
                }
            }
        }
        return err('16 kHz mono WAV preset bulunamadi',
                   'Bakilan klasorler: ' + checked.join(' | '));
    } catch (e) {
        return err('Preset aramasi basarisiz', e);
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
function trPlaceCaptions(srtPath) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return err('Aktif sekans yok.');
        if (!fileExists(srtPath)) return err('SRT bulunamadi: ' + srtPath);

        if (typeof seq.createCaptionTrack !== 'function') {
            return err('Bu Premiere surumunde createCaptionTrack yok.',
                       'SRT projeye alindi, elle surukleyebilirsiniz.');
        }

        var bin = null;
        try { bin = app.project.getInsertionBin(); } catch (e) { bin = app.project.rootItem; }

        var imported = app.project.importFiles([srtPath], true, bin, false);
        if (!imported) return err('SRT projeye alinamadi.');

        // Iceri alinan ogeyi bul
        var wanted = new File(srtPath).name;
        var stem = wanted.replace(/\.srt$/i, '');
        var item = null;
        try {
            var root = app.project.rootItem;
            for (var i = 0; i < root.children.numItems; i++) {
                var c = root.children[i];
                if (c.name === wanted || c.name === stem) item = c;
            }
        } catch (e) {}
        if (!item) return err('SRT iceri alindi ama proje ogesi bulunamadi.');

        var placed = false;
        var detail = '';
        try {
            placed = seq.createCaptionTrack(item, 0);
        } catch (e2) {
            detail = String(e2.message || e2);
        }

        return ok([
            kv('imported', 'true', true),
            kv('itemName', item.name),
            kv('placed', placed ? 'true' : 'false', true),
            kv('detail', detail)
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
