/**
 * Minimal CEP koprusu.
 *
 * Adobe'un resmi CSInterface.js dosyasi ~1500 satirdir ve buyuk kismi bizim
 * kullanmadigimiz olay/tema/pencere API'leridir. Ihtiyacimiz olan uc sey
 * zaten window.__adobe_cep__ uzerindeki ince sarmalayicilardir; onlari
 * burada acikca yaziyoruz. Boylece projede vendor edilmis kod olmuyor.
 *
 * Referans: Adobe-CEP/CEP-Resources
 */
(function (global) {
  'use strict';

  function cep() {
    return global.__adobe_cep__ || null;
  }

  var CEP = {
    /** Panel CEP icinde mi calisiyor, yoksa tarayicida mi? */
    available: function () {
      return !!cep();
    },

    /**
     * ExtendScript calistirir.
     * @param {string} script  ExtendScript ifadesi
     * @returns {Promise<string>} host'un dondurdugu ham string
     */
    evalScript: function (script) {
      return new Promise(function (resolve, reject) {
        var c = cep();
        if (!c) return reject(new Error('CEP ortami yok — bu sayfa Premiere içinde açılmalı.'));
        try {
          c.evalScript(script, function (result) {
            // ExtendScript hata firlatirsa CEP "EvalScript error." dondurur
            if (result === 'EvalScript error.') {
              return reject(new Error('ExtendScript hatası: ' + script.slice(0, 80)));
            }
            resolve(result);
          });
        } catch (e) { reject(e); }
      });
    },

    /**
     * evalScript + JSON ayristirma. bridge.jsx tum fonksiyonlarindan
     * {"ok":true,...} veya {"ok":false,"error":...} doner.
     */
    call: function (fnCall) {
      return CEP.evalScript(fnCall).then(function (raw) {
        var data;
        try {
          data = JSON.parse(raw);
        } catch (e) {
          throw new Error('Köprüden geçersiz yanıt geldi: ' + String(raw).slice(0, 200));
        }
        if (!data.ok) {
          var msg = data.error || 'Bilinmeyen hata';
          if (data.detail) msg += ' — ' + data.detail;
          throw new Error(msg);
        }
        return data;
      });
    },

    /** CEP'in bildigi sistem yollari (extension, userData, common vb.) */
    getSystemPath: function (type) {
      var c = cep();
      if (!c) return null;
      try { return c.getSystemPath(type); } catch (e) { return null; }
    },

    /** Eklentinin kendi klasoru — core/ ve models/ yollarini bundan turetiyoruz */
    extensionPath: function () {
      return CEP.getSystemPath('extension');
    },

    /** Host uygulama bilgisi (surum, dil, id) */
    hostEnvironment: function () {
      var c = cep();
      if (!c) return null;
      try {
        var h = c.getHostEnvironment();
        return typeof h === 'string' ? JSON.parse(h) : h;
      } catch (e) { return null; }
    },

    /** Node.js CEP icinde acik mi? --enable-nodejs bayragi calismis mi? */
    nodeAvailable: function () {
      return typeof global.require === 'function' &&
             typeof global.process !== 'undefined' &&
             !!global.process.versions &&
             !!global.process.versions.node;
    },

    nodeVersion: function () {
      return CEP.nodeAvailable() ? global.process.versions.node : null;
    }
  };

  global.CEP = CEP;
}(typeof window !== 'undefined' ? window : this));
