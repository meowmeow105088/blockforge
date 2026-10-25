// Drive headless Chrome over the DevTools protocol. No screenshots —
// captures console/page errors and runs an in-page state probe.
//
// STATUS (last session): The WS client in this harness was fixed for:
//   (1) request-line double space when u.search is empty,
//   (2) `buf` being re-created per data event (const reassignment),
//   (3) client->server frames must be MASKED per RFC6455 (the fix that
//       made Chrome stop closing the connection on the first CDP frame).
// The harness was NOT re-run after fix (3) because the Cline terminal
// wedged (a backgrounded Chrome left an inherited fd open, so the shell
// blocked waiting for EOF). To use:  CDP_PORT=9222 node .test/run.mjs
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { createConnection } from 'node:net';
import crypto from 'node:crypto';

const TARGET = process.env.TARGET || 'http://127.0.0.1:3210/Blockforge-dungeons3d.html';
const CDP_PORT = Number(process.env.CDP_PORT || 9222);
const TIMEOUT = Number(process.env.TIMEOUT_MS || 90000);

function httpJson(path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: CDP_PORT, path, method: 'GET' }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.end();
  });
}
function connectWS(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const sock = createConnection({ host: u.hostname, port: Number(u.port) || 80 }, () => {
      const reqLine = 'GET ' + u.pathname + (u.search ? u.search : '') + ' HTTP/1.1\r\n' +
        'Host: ' + u.host + '\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\n' +
        'Sec-WebSocket-Version: 13\r\n\r\n';
      sock.write(reqLine);
    });
    let buf = Buffer.alloc(0);
    let upgraded = false;
    const handlers = { message: null };
    sock.on('data', raw => {
      buf = Buffer.concat([buf, raw]);
      if (!upgraded) {
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;
        const head = buf.slice(0, idx).toString('latin1');
        if (!/HTTP\/1\.[01]\s+101/.test(head)) { reject(new Error('WS handshake failed: ' + head.split('\n')[0])); sock.destroy(); return; }
        buf = buf.slice(idx + 4); upgraded = true;
        resolve({ sock, handlers, close: () => { try { sock.write(Buffer.from([0x88, 0x00])); } catch {} setTimeout(() => sock.destroy(), 100); } });
      }
      if (upgraded) readFrames();
    });
    sock.on('error', e => reject(e));
    function readFrames() {
      let guard = 0;
      while (buf.length >= 2 && guard++ < 200) {
        const b0 = buf[0], b1 = buf[1];
        const len1 = b1 & 0x7f; let off = 2;
        if (len1 === 126) { if (buf.length < 4) return; off = 4; }
        else if (len1 === 127) { if (buf.length < 10) return; off = 10; }
        const opcode = b0 & 0x0f, masked = b1 & 0x80;
        let maskKey = null, payStart = off;
        if (masked) { if (buf.length < off + 4) return; maskKey = buf.slice(off, off + 4); payStart = off + 4; }
        let plen = len1;
        if (len1 === 126) plen = buf.readUInt16BE(2);
        else if (len1 === 127) plen = Number(buf.readBigUInt64BE(2));
        if (buf.length < payStart + plen) return;
        const pay = buf.slice(payStart, payStart + plen);
        if (masked) for (let i = 0; i < pay.length; i++) pay[i] ^= maskKey[i & 3];
        buf = buf.slice(payStart + plen);
        if (opcode === 1) handlers.message && handlers.message(pay.toString('utf8'));
        else if (opcode === 8) { sock.destroy(); return; }
      }
    }
  });
}
function wsSend(ws, obj) {
  const data = Buffer.from(JSON.stringify(obj), 'utf8');
  let header;
  if (data.length < 126) header = Buffer.from([0x81, 0x80 | data.length]);
  else if (data.length < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(data.length, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(data.length), 2); }
  // Client-to-server frames MUST be masked (RFC6455).
  const mask = crypto.randomBytes(4);
  const masked = Buffer.from(data);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
  ws.sock.write(Buffer.concat([header, mask, masked]));
}

const profile = '/tmp/bf-chrome-' + Date.now();
console.log('LAUNCHING chrome');
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--window-size=1280,800', '--hide-scrollbars',
  '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
  'about:blank'
], { stdio: 'ignore' });
setTimeout(() => { console.log('WATCHDOG: forced exit (no progress)'); try { chrome.kill('SIGKILL'); } catch {} process.exit(3); }, 110000).unref();
let ws = null, booted = false;
const events = [];
let send;
try {
  console.log('WAITING for page target');
  const deadline = Date.now() + 15000;
  let target = null;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const list = await httpJson('/json');
      target = list.find(t => t.type === 'page');
      if (target) break;
    } catch {}
  }
  if (!target) throw new Error('no page target found');
  console.log('FOUND target, connecting WS');
  ws = await connectWS(target.webSocketDebuggerUrl);
  console.log('WS connected, enabling domains');
  let id = 0;
  const pending = new Map();
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    wsSend(ws, { id: mid, method, params });
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error('send timeout: ' + method)); } }, 10000);
  });
  ws.handlers.message = raw => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    else if (m.method) {
      events.push(m);
      // live echo of console/errors so we see what's happening in the page
      if (m.method === 'Runtime.consoleAPICalled') console.log('  [console:' + m.params.type + '] ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
      if (m.method === 'Runtime.exceptionThrown') console.log('  [PAGE EXC] ' + ((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text || '').split('\n').slice(0, 8).join(' ').slice(0, 400));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Page.navigate', { url: TARGET });
  const bootDeadline = Date.now() + TIMEOUT;
  let pollN = 0;
  console.log('  polling for boot (timeout ' + Math.round(TIMEOUT/1000) + 's)...');
  while (Date.now() < bootDeadline) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const r = await send('Runtime.evaluate', { expression: '!!window.__bf', returnByValue: true });
      pollN++;
      if (pollN % 4 === 0) console.log('  ... boot poll #' + pollN + ' val=' + (r && r.result ? r.result.value : 'n/a') + ' at ' + ((pollN*0.5)).toFixed(0) + 's');
      if (r && r.result && r.result.value) { booted = true; console.log('  BOOTED after ' + ((pollN*0.5)).toFixed(1) + 's'); break; }
    } catch (e) {
      if (pollN % 8 === 0) console.log('  ... poll error: ' + e.message);
    }
  }
  if (!booted) console.log('  boot timed out after ' + (pollN*0.5).toFixed(0) + 's (' + pollN + ' polls)');
  console.log('BOOTED(window.__bf)=' + booted);
} catch (e) {
  console.log('HARNESS_ERROR ' + e.message);
}
try {
  if (!booted) throw new Error('boot failed');
  await new Promise(r => setTimeout(r, 300));
  const probe = `(() => {
    try {
      const el = id => document.getElementById(id);
      const state = {
        hasBF: !!window.__bf,
        coreObj: (typeof window.coreObj !== 'undefined' && !!window.coreObj) || (window.__bf && !!window.__bf.coreObj),
        coreBaseY: (typeof window.coreBaseY !== 'undefined') ? window.coreBaseY : null,
        worldIndex: window.__bf ? window.__bf.game.worldIndex : null,
        playerPos: window.__bf ? window.__bf.player.pos.toArray() : null,
        playerDead: window.__bf ? window.__bf.player.dead : null,
        titleHidden: el('title') ? el('title').classList.contains('hidden') : null,
        hudHidden: el('hud') ? el('hud').classList.contains('hidden') : null,
        dialogHidden: el('dialog') ? el('dialog').classList.contains('hidden') : null,
        pauseHidden: el('pause') ? el('pause').classList.contains('hidden') : null,
        deathHidden: el('death') ? el('death').classList.contains('hidden') : null,
        canvasSize: el('scene') ? [el('scene').width, el('scene').height] : null,
      };
      return state;
    } catch (e) { return { probeError: String(e) }; }
  })()`;
  let probeResult = null;
  try { probeResult = (await send('Runtime.evaluate', { expression: probe, returnByValue: true })).result.value; }
  catch (e) { probeResult = { probeError: String(e) }; }
  console.log('===== PROBE =====');
  console.log(JSON.stringify(probeResult, null, 2));
  const c = { pageErrors: [], consoleErrors: [], unhandled: [], logs: [] };
  for (const e of events) {
    if (e.method === 'Runtime.exceptionThrown') c.pageErrors.push(e.params.exceptionDetails);
    if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') c.consoleErrors.push(e.params.args.map(a => a.value ?? a.description).join(' '));
    if (e.method === 'Runtime.unhandledrejection') c.unhandled.push((e.params.reason && e.params.reason.description) || 'unknown');
    if (e.method === 'Runtime.consoleAPICalled') c.logs.push(`[${e.params.type}] ${e.params.args.map(a => a.value ?? a.description).join(' ')}`);
    if (e.method === 'Log.entryAdded') c.logs.push(`[log:${e.params.entry.level}] ${e.params.entry.text}`);
  }
  console.log('===== PAGE ERRORS =====');
  for (const e of c.pageErrors) console.log('  ', (e.text || '') + ' | ' + ((e.exception && e.exception.description) || '').split('\n').slice(0, 6).join(' '));
  console.log('===== CONSOLE ERRORS =====');
  for (const e of c.consoleErrors) console.log('  ', e);
  console.log('===== UNHANDLED REJECTIONS =====');
  for (const e of c.unhandled) console.log('  ', e);
  console.log('===== ALL LOGS =====');
  for (const e of c.logs) console.log('  ', e);
  ws.close();
} finally {
  chrome.kill('SIGKILL');
}
process.exit(0);

