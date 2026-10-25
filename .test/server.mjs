import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const THREE = path.resolve(root, '..', 'vendor', 'three.module.js');
const port = Number(process.env.PORT || 3210);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
};

createServer(async (req, res) => {
  try {
    let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    name = name.replace(/^\/+/, '');
    let p;
    if (name === 'three.module.js') p = THREE;
    else p = path.join(root, name);
    if (p !== THREE && !p.startsWith(root + path.sep)) { res.writeHead(403); return res.end('no'); }
    const data = await readFile(p);
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'access-control-allow-origin': '*' });
    res.end(data);
  } catch (e) {
    res.writeHead(404); res.end('nf');
  }
}).listen(port, '127.0.0.1', () => console.log('test server on ' + port));

