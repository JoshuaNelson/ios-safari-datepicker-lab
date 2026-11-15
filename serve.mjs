// Tiny dependency-free server for the lab page.
//   /?v=<version>  serves the page with that version's picker script/CSS as ordinary static tags
//   /api/busy      reserved days: a full week (days 8-14) of next month, plus two days the month after
// Only GET/HEAD are accepted; there is nothing to write to.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site');
const PORT = Number(process.env.PORT || 8080);
export const VERSIONS = {
  original: { js: 'original.js' },
  'fix1-touch-action': { js: 'original.js', css: 'fix1-touch-action.css' },
  'fix2-keep-buttons': { js: 'fix2-keep-buttons.js' },
  'fix3-stop-propagation': { js: 'fix3-stop-propagation.js' },
  'fix4-popup-outside-label': { js: 'fix4-popup-outside-label.js' },
  'fix5-combined': { js: 'fix5-combined.js', css: 'fix1-touch-action.css' },
  'fix7-layout': { js: 'fix7-layout.js', css: 'fix7-layout.css' },
  'fix8-final': { js: 'fix8-final.js', css: 'fix8-final.css' },
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.ttf': 'font/ttf', '.txt': 'text/plain', '.json': 'application/json' };

function busy() {
  const n = new Date(), y = n.getUTCFullYear(), m = n.getUTCMonth();
  const d = (mm, dd) => new Date(Date.UTC(y, mm, dd)).toISOString().slice(0, 10);
  return [8, 9, 10, 11, 12, 13, 14].map(dd => d(m + 1, dd)).concat([d(m + 2, 5), d(m + 2, 6)]);
}

const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  const url = new URL(req.url, 'http://lab');
  if (url.pathname === '/api/busy') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ busy: busy() })); return; }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const name = url.searchParams.get('v') || 'original', v = VERSIONS[name];
    if (!v) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`unknown version ${name}`); return; }
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
      .replace('{{VERSION}}', name)
      .replace('{{FIX_CSS}}', v.css ? `<link rel="stylesheet" href="picker/${v.css}">` : '')
      .replace('{{FIX_JS}}', `<script src="picker/${v.js}"></script>`);
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' }).end(html); return;
  }
  const file = path.join(ROOT, path.normalize(url.pathname));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(PORT, () => console.log(`lab on http://localhost:${PORT}`));
