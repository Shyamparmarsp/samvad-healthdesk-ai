// Writes the responsive clipping measurement to evidence/clipping.json
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4207, CDP = 9347, BASE = `http://127.0.0.1:${PORT}`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let ok = false;
for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/')).ok) { ok = true; break; } } catch {} await sleep(200); }
if (!ok) throw new Error('preview failed');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=/tmp/samvad-clip-${Date.now()}`, '--no-sandbox', '--disable-gpu', '--window-size=1440,900'], { stdio: 'pipe' });
for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok) break; } catch {} await sleep(200); }
const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await send('Page.enable'); await send('Runtime.enable');
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const out = { note: 'Measured on the running build at 390x844 design width. clientWidth excludes the scrollbar.', viewports: {} };
for (const [w, h] of [[360, 800], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 820], [1440, 900]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  await send('Page.navigate', { url: BASE + '/' }); await sleep(900);
  out.viewports[`${w}x${h}`] = await ev(`(() => {
    const de = document.documentElement;
    const shell = document.querySelector('#root > div > div');
    const r = shell ? shell.getBoundingClientRect() : null;
    return { innerWidth: window.innerWidth, clientWidth: de.clientWidth, shellWidth: r ? Math.round(r.width) : null,
      shellLeft: r ? Math.round(r.left) : null, shellRight: r ? Math.round(r.right) : null,
      clippedLeftPx: r ? Math.max(0, -Math.round(r.left)) : null,
      clippedRightPx: r ? Math.max(0, Math.round(r.right) - de.clientWidth) : null };
  })()`);
}
writeFileSync(resolve(ROOT, 'docs/final-audit/evidence/clipping.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
try { ws.close(); } catch {}
try { chrome.kill('SIGKILL'); } catch {}
try { server.kill('SIGKILL'); } catch {}
try { rmSync('/tmp/samvad-clip-*', { recursive: true, force: true }); } catch {}
process.exit(0);
