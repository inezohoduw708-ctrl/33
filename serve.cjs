/**
 * Zero-dependency static server for the built game (dist/).
 * Binds 0.0.0.0 so live-preview proxies can reach it, sends headers that allow
 * iframe embedding, and never touches anything outside the build folder.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 8080);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  // root shows a launcher page that embeds the game (and links to it directly)
  if (urlPath === '/' || urlPath === '') {
    fs.readFile(path.join(__dirname, 'preview.html'), (e, page) => {
      if (e) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME['.html'],
        'Cache-Control': 'no-cache',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': 'frame-ancestors *',
      });
      res.end(page);
    });
    return;
  }

  // /play → the game itself, so there is always a direct URL
  if (urlPath === '/play' || urlPath === '/play/') urlPath = '/index.html';

  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA-ish fallback: unknown paths serve the game shell
      fs.readFile(path.join(ROOT, 'index.html'), (e2, shell) => {
        if (e2) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME['.html'],
          'Cache-Control': 'no-cache',
          'X-Frame-Options': 'ALLOWALL',
          'Content-Security-Policy': "frame-ancestors *",
        });
        res.end(shell);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy': "frame-ancestors *",
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TMNT game served from ${ROOT} → http://0.0.0.0:${PORT}`);
});
