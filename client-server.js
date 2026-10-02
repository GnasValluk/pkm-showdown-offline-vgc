'use strict';
// Static server cho client offline: http://localhost:8080
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'client');
const PORT = process.env.PS_CLIENT_PORT ? +process.env.PS_CLIENT_PORT : 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

function serve(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  // Chan path traversal
  const safe = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  let file = path.join(ROOT, safe);
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err2, data) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 - Khong tim thay: ' + urlPath);
        return;
      }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(data);
    });
  });
}

if (require.main === module) {
  http.createServer(serve).listen(PORT, '127.0.0.1', () => {
    console.log(`[Web] Client offline: http://localhost:${PORT}`);
    console.log(`[Web] Nho server game chay o port 8000 (node start.js se tu chay).`);
  });
} else {
  module.exports = { serve, ROOT, PORT };
}
