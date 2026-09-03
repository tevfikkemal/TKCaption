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
