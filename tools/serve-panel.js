#!/usr/bin/env node
'use strict';
/**
 * Paneli tarayicida onizlemek icin kucuk statik sunucu.
 * Premiere disinda CEP olmadigi icin panel "CEP yok" durumunu gostermeli —
 * yerlesim ve stil hatalarini Premiere'i yeniden baslatmadan yakalamak icin.
 *
 * Kullanim: node tools/serve-panel.js [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'panel');
const PORT = parseInt(process.argv[2], 10) || 8899;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jsx': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, rel);

  // Klasor disina cikma
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('yasak'); return; }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('bulunamadi: ' + rel); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Panel onizleme: http://localhost:${PORT}`);
  console.log(`Kaynak: ${ROOT}`);
});
