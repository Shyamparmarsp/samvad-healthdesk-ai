/**
 * Builds the complete audit PDF (all reports + all evidence) from docs/final-audit.
 *
 *   node docs/final-audit/scripts/generate-audit-pdf.mjs [outputPath]
 *
 * Default output: ~/Downloads/Samvad-HealthDesk-AI-Final-Audit-2026-11-02.pdf
 * Audit tooling only; reads the markdown/evidence and writes a single PDF.
 */
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { resolve, extname, basename, dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');                // docs/final-audit
const DOCS = ROOT;                                   // markdown lives here
const OUT = process.argv[2] || join(homedir(), 'Downloads', 'Samvad-HealthDesk-AI-Final-Audit-2026-11-02.pdf');
const PORT = Number(process.env.PDF_PORT || 4231);
const CDP = Number(process.env.PDF_CDP || 9361);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ------------------------------------------------------------------ markdown */
function inline(s) {
  let t = esc(s);
  // inline code first so ** inside code is not bolded
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // links: keep the text, show the target in small type (cross-document links are not clickable in print)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    if (/\.md(#.*)?$/.test(href) || href.startsWith('#')) return `<span class="xref">${text}</span>`;
    return `${text} <span class="url">${esc(href)}</span>`;
  });
  return t;
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let inCode = false;
  let listType = null;
  let tableBuf = null;

  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  const closeTable = () => {
    if (!tableBuf) return;
    const [head, ...rows] = tableBuf;
    const cells = (row) => row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const th = cells(head).map((c) => `<th>${inline(c)}</th>`).join('');
    const trs = rows.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
    out.push(`<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`);
    tableBuf = null;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      closeList(); closeTable();
      if (inCode) { out.push('</code></pre>'); inCode = false; }
      else { out.push('<pre><code>'); inCode = true; }
      i++; continue;
    }
    if (inCode) { out.push(esc(line)); i++; continue; }

    // table block
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      if (!tableBuf) tableBuf = [];
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const isSeparator = cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
      if (!isSeparator) tableBuf.push(line.trim());
      i++; continue;
    } else if (tableBuf) { closeTable(); }

    if (/^\s*$/.test(line)) { closeList(); out.push(''); i++; continue; }
    if (/^---+$/.test(line.trim())) { closeList(); out.push('<hr/>'); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = h[1].length;
      const id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      out.push(`<h${lvl} id="${id}">${inline(h[2])}</h${lvl}>`);
      i++; continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) { closeList(); out.push(`<blockquote>${inline(quote[1])}</blockquote>`); i++; continue; }

    const ol = line.match(/^\s*(\d+)\.\s+(.*)$/);
    const ul = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (ol || ul) {
      const type = ol ? 'ol' : 'ul';
      const depth = ul ? Math.floor(ul[1].length / 2) : 0;
      if (listType !== type) { closeList(); out.push(`<${type}>`); listType = type; }
      const body = ol ? ol[2] : ul[2];
      out.push(`<li style="margin-left:${depth * 10}mm">${inline(body)}</li>`);
      i++; continue;
    }

    // paragraph (join wrapped lines)
    closeList();
    let para = line;
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#{1,6}\s|```|\s*\||\s*[-*]\s|>\s?|\d+\.\s|---+$)/.test(lines[i + 1])) {
      para += ' ' + lines[i + 1].trim(); i++;
    }
    out.push(`<p>${inline(para)}</p>`);
    i++;
  }
  closeList(); closeTable();
  if (inCode) out.push('</code></pre>');
  return out.join('\n').replace(/(<p><\/p>)/g, '');
}

/* --------------------------------------------------------------- evidence */
const EV = resolve(DOCS, 'evidence');
const list = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith('.') && statSync(join(dir, f)).isFile()).sort() : []);
const caption = (f) => f.replace(/\.(png|svg|json)$/, '').replace(/[-_]/g, ' ');
const imgRow = (rel, cap, cls = 'shot') =>
  `<figure class="${cls}"><img src="/evidence/${rel}" alt="${esc(cap)}"/><figcaption>${esc(cap)}<br/><span class="path">evidence/${esc(rel)}</span></figcaption></figure>`;

function grid(relPaths, cls = 'grid-3') {
  return `<div class="${cls}">${relPaths.map(([rel, cap]) => imgRow(rel, cap)).join('')}</div>`;
}

/* ---------------------------------------------------------------- documents */
const DOCS_ORDER = [
  ['README.md', 'Index'],
  ['EXECUTIVE-REPORT.md', 'Executive report'],
  ['DEFECT-REGISTER.md', 'Defect register'],
  ['RECOMMENDED-CORRECTIONS.md', 'Recommended corrections'],
  ['VISUAL-PARITY-REPORT.md', 'Visual parity report'],
  ['FIGMA-FRAME-INVENTORY.md', 'Figma frame inventory'],
  ['UI-COMPONENT-INVENTORY.md', 'UI component inventory'],
  ['ICON-ASSET-AUDIT.md', 'Icon and asset audit'],
  ['BUTTON-ACTION-MATRIX.md', 'Button and interaction matrix'],
  ['NAVIGATION-AUDIT.md', 'Navigation audit'],
  ['LOGIC-AND-INTEGRATION-AUDIT.md', 'Logic and integration audit'],
  ['SOURCE-FILE-INVENTORY.md', 'Source file inventory'],
  ['TEST-RESULTS.md', 'Test results'],
];

function buildHtml() {
  const docs = DOCS_ORDER.map(([file, title], idx) => {
    const md = readFileSync(resolve(DOCS, file), 'utf8');
    return `<section class="doc" data-title="${esc(title)}">
      <div class="doc-head"><span class="doc-num">Document ${idx + 1} / ${DOCS_ORDER.length}</span><span class="doc-file">${esc(file)}</span></div>
      ${mdToHtml(md)}
    </section>`;
  }).join('\n');

  const comparisons = list(resolve(EV, 'comparison')).filter((f) => f.endsWith('-comparison.png'))
    .map((f) => `comparison/${f}`);
  const sheets = ['contact-sheet-patient.png', 'contact-sheet-doctor.png', 'contact-sheet-master.png']
    .filter((f) => existsSync(resolve(EV, 'comparison', f))).map((f) => `comparison/${f}`);
  const patient = list(resolve(EV, 'implementation')).filter((f) => f.endsWith('.png')).map((f) => `implementation/${f}`);
  const doctor = list(resolve(EV, 'doctor')).filter((f) => f.endsWith('.png')).map((f) => `doctor/${f}`);
  const states = list(resolve(EV, 'states')).filter((f) => f.endsWith('.png')).map((f) => `states/${f}`);
  const responsive = list(resolve(EV, 'responsive')).filter((f) => f.endsWith('.png')).map((f) => `responsive/${f}`);
  const interaction = list(resolve(EV, 'interaction')).filter((f) => f.endsWith('.png')).map((f) => `interaction/${f}`);
  const headDir = list(EV).find((d) => d.startsWith('head-'));
  const head = headDir ? list(resolve(EV, headDir)).filter((f) => f.endsWith('.png')).map((f) => `${headDir}/${f}`) : [];
  const vectors = list(resolve(EV, 'figma-icons')).filter((f) => f.endsWith('.svg')).map((f) => `figma-icons/${f}`);
  const figma = list(resolve(EV, 'figma')).filter((f) => f.endsWith('.png')).map((f) => `figma/${f}`);

  const jsonBlocks = [
    ['evidence/audit-run.json', 'Base-commit probe results and measurements'],
    ['evidence/audit-run-voice.json', 'Real voice-mode and Hindi evidence'],
    ['evidence/audit-run-state.json', 'Refresh/resume and search-state evidence'],
    ['evidence/clipping.json', 'Measured fixed-width clipping per viewport'],
    ...(headDir ? [[`evidence/${headDir}/delta-run.json`, 'Post-audit HEAD delta checks']] : []),
  ].filter(([p]) => existsSync(resolve(EV, p.replace(/^evidence\//, ''))));

  const headShort = headDir ? headDir.replace('head-', '') : 'n/a';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Samvad HealthDesk AI — Final UI, Interaction and Figma Audit</title>
<style>
  @page { size: A4 landscape; margin: 9mm 9mm 14mm 9mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; color:#1b2433; font-size:8.4pt; line-height:1.45; }
  h1 { font-size:19pt; margin:0 0 2mm; letter-spacing:-.2pt; }
  h2 { font-size:13.5pt; margin:7mm 0 2mm; padding-bottom:1.2mm; border-bottom:.5pt solid #cfd6e6; page-break-after:avoid; }
  h3 { font-size:10.5pt; margin:5mm 0 1.5mm; page-break-after:avoid; }
  h4 { font-size:9.2pt; margin:4mm 0 1mm; page-break-after:avoid; }
  p { margin:0 0 2mm; }
  ul, ol { margin:0 0 2mm; padding-left:5mm; }
  li { margin:0 0 .8mm; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.88em; background:#eef2f8; padding:.3mm 1mm; border-radius:1mm; }
  pre { background:#f4f6fa; border:.4pt solid #dbe2ee; border-radius:1.5mm; padding:2mm; overflow:hidden; white-space:pre-wrap; word-break:break-word; font-size:6.6pt; margin:0 0 3mm; }
  pre code { background:none; padding:0; }
  hr { border:0; border-top:.4pt solid #d7deea; margin:4mm 0; }
  blockquote { margin:0 0 2mm; padding:1.5mm 3mm; border-left:1.2mm solid #1f2a44; background:#f2f5fa; }
  table { width:100%; border-collapse:collapse; margin:0 0 3.5mm; font-size:6.7pt; table-layout:fixed; }
  th, td { border:.4pt solid #cfd6e6; padding:1.1mm 1.3mm; text-align:left; vertical-align:top; word-wrap:break-word; overflow-wrap:anywhere; }
  th { background:#1f2a44; color:#fff; font-weight:600; }
  tbody tr:nth-child(even) td { background:#f7f9fc; }
  tr { page-break-inside:avoid; }
  .doc { page-break-before:always; }
  .doc:first-of-type { page-break-before:avoid; }
  .doc-head { display:flex; justify-content:space-between; align-items:baseline; border-bottom:1pt solid #1f2a44; padding-bottom:1.5mm; margin-bottom:4mm; }
  .doc-num { font-size:7pt; letter-spacing:.6pt; text-transform:uppercase; color:#5a6580; }
  .doc-file { font-family:ui-monospace,Menlo,monospace; font-size:7pt; color:#5a6580; }
  .xref { text-decoration:underline dotted #8892a8; }
  .url { font-family:ui-monospace,Menlo,monospace; font-size:.82em; color:#5a6580; word-break:break-all; }
  figure { margin:0 0 4mm; page-break-inside:avoid; text-align:center; }
  figure img { max-width:100%; border:.4pt solid #d7deea; border-radius:1.5mm; }
  figcaption { font-size:6.6pt; color:#4a5470; margin-top:1.2mm; }
  .path { font-family:ui-monospace,Menlo,monospace; font-size:6pt; color:#7b859c; }
  .grid-1, .grid-2, .grid-3, .grid-4 { display:grid; gap:4mm; }
  .grid-1 { grid-template-columns:1fr; }
  .grid-1 figure img { max-height:150mm; width:auto; }
  .grid-4 figure img { max-height:45mm; width:auto; }
  .grid-2 { grid-template-columns:1fr 1fr; }
  .grid-3 { grid-template-columns:1fr 1fr 1fr; }
  .grid-4 { grid-template-columns:repeat(4,1fr); }
  .grid-2 figure img { max-height:120mm; width:auto; }
  .grid-3 figure img { max-height:95mm; width:auto; }
  .grid-4 figure img { max-height:45mm; width:auto; }
  .appendix { page-break-before:always; }
  .cover { height:190mm; display:flex; flex-direction:column; justify-content:center; page-break-after:always; }
  .cover .kicker { font-size:8.5pt; letter-spacing:2pt; text-transform:uppercase; color:#5a6580; margin-bottom:6mm; }
  .cover h1 { font-size:30pt; max-width:230mm; line-height:1.1; }
  .cover .sub { font-size:12pt; color:#3c4761; margin:3mm 0 8mm; max-width:215mm; }
  .cover .meta { display:grid; grid-template-columns:1fr 1fr; gap:2mm 8mm; font-size:8pt; max-width:230mm; }
  .cover .meta b { display:inline-block; min-width:31mm; color:#5a6580; font-weight:600; }
  .cover .verdict { margin-top:8mm; padding:4mm; border:.6pt solid #b9c3d6; border-radius:2mm; background:#f5f7fb; font-size:8.6pt; max-width:230mm; }
  .toc { columns:2; column-gap:12mm; font-size:9pt; }
  .toc div { margin-bottom:1.6mm; break-inside:avoid; }
  .toc .n { display:inline-block; width:7mm; color:#5a6580; font-family:ui-monospace,Menlo,monospace; font-size:8pt; }
  .note { background:#fff8e8; border:.5pt solid #e6cf9a; padding:2.5mm 3mm; border-radius:1.5mm; margin:0 0 4mm; font-size:7.8pt; }
  .pdf-only { display:none; }
</style></head><body>

<section class="cover">
  <div class="kicker">Final audit deliverable · read-only inspection</div>
  <h1>Samvad HealthDesk AI — UI, Interaction, Figma Parity &amp; Application-Logic Audit</h1>
  <div class="sub">Complete evidence-backed assessment of the patient and doctor applications against the original Figma file <i>Samvad HealthDesk AI — V2 Screens</i> (file key PIIKHDaviWGq9EV9yBZcnc).</div>
  <div class="meta">
    <div><b>Audit branch</b> audit/final-ui-logic-figma-review</div>
    <div><b>Final commit</b> ab4ba5b9d7c6464442ddd3d2d9dc523a616c4acd</div>
    <div><b>Primary base</b> 6637841420d33f0345f8ac192d3bf0e7e9a07d75</div>
    <div><b>Delta HEAD</b> 3df09cd466fb01e496b499f05118af323326b6bd</div>
    <div><b>Date</b> 2 November 2026</div>
    <div><b>Figma frames</b> 22 / 22 compared</div>
    <div><b>Open defects</b> 50 — 1 P0 · 10 P1 · 29 P2 · 10 P3</div>
    <div><b>Controls audited</b> 72 · probes 39 (12 failed)</div>
  </div>
  <div class="verdict">
    <strong>Verdict:</strong> a credible, well-engineered demo of the documented flow that is <strong>not yet a faithful reproduction of the Figma file</strong>, and not ready for owner acceptance or hosted deployment. The happy-path patient journey and the doctor read/review journey work. Six Figma frames are materially mismatched, two are not implemented as real screens, one <strong>P0</strong> data-integrity defect and ten <strong>P1</strong> workflow/safety defects are open. Full detail in the Executive Report and Defect Register.
  </div>
</section>

<section class="doc"><h1>Contents</h1>
  <div class="note"><strong>How this PDF is organised.</strong> Part 1 reproduces the thirteen audit documents verbatim (same text as the committed markdown). Part 2 is the complete evidence appendix: original Figma renders, side-by-side comparisons, every running-app screenshot, states, responsive matrix, the post-audit HEAD delta, the exported Figma SVG vectors, and the machine-readable probe logs. All images are at their captured resolution; nothing was cropped or rescaled for the comparison sheets.</div>
  <h2>Part 1 — Audit documents</h2>
  <div class="toc">
    ${DOCS_ORDER.map(([f, t], n) => `<div><span class="n">${String(n + 1).padStart(2, '0')}</span><strong>${esc(t)}</strong> <span class="path">${esc(f)}</span></div>`).join('')}
  </div>
  <h2>Part 2 — Evidence appendix</h2>
  <div class="toc">
    <div><span class="n">A1</span><strong>Contact sheets</strong> — ${sheets.length} overview sheets</div>
    <div><span class="n">A2</span><strong>Per-frame comparisons</strong> — ${comparisons.length} Figma vs implementation sheets</div>
    <div><span class="n">A3</span><strong>Original Figma renders</strong> — ${figma.length} frames at native size</div>
    <div><span class="n">A4</span><strong>Patient screens</strong> — ${patient.length} captures</div>
    <div><span class="n">A5</span><strong>Doctor screens</strong> — ${doctor.length} captures</div>
    <div><span class="n">A6</span><strong>States</strong> — ${states.length} captures</div>
    <div><span class="n">A7</span><strong>Responsive matrix</strong> — ${responsive.length} viewports</div>
    <div><span class="n">A8</span><strong>Interaction captures</strong> — ${interaction.length} captures</div>
    <div><span class="n">A9</span><strong>Post-audit HEAD delta</strong> — ${head.length} captures (${esc(headShort)})</div>
    <div><span class="n">A10</span><strong>Exported Figma vectors</strong> — ${vectors.length} SVGs</div>
    <div><span class="n">A11</span><strong>Probe logs</strong> — ${jsonBlocks.length} JSON records</div>
  </div>
  <h2>Reading order for an automated analyst</h2>
  <p>Executive Report → Defect Register (filter P0/P1) → Recommended Corrections (integration gate) → Visual Parity Report (per screen) → the specific evidence image named in each defect row. Every defect row cites a file and line in the application source and an evidence path that exists in Part 2.</p>
</section>

${docs}

<section class="appendix"><h1>Part 2 — Evidence appendix</h1>
<p>All evidence was produced in this audit from the running build and the original Figma file. Filenames are preserved exactly as committed under <code>docs/final-audit/evidence/</code>.</p>
<h2>A1 — Contact sheets</h2>
${grid(sheets.map((s) => [s, caption(basename(s))]), 'grid-3')}
</section>

<section class="appendix"><h2>A2 — Per-frame comparisons (Figma left, implementation right)</h2>
${comparisons.map((c) => imgRow(c, caption(basename(c)), 'shot')).join('')}
</section>

<section class="appendix"><h2>A3 — Original Figma renders (native size)</h2>
${grid(figma.map((f) => [f, caption(basename(f))]), 'grid-3')}
</section>

<section class="appendix"><h2>A4 — Patient screen captures (390 × 844)</h2>
${grid(patient.map((f) => [f, caption(basename(f))]), 'grid-3')}
</section>

<section class="appendix"><h2>A5 — Doctor screen captures (1280 × 820)</h2>
${grid(doctor.map((f) => [f, caption(basename(f))]), 'grid-1')}
</section>

<section class="appendix"><h2>A6 — Interaction and recorder states</h2>
${grid(states.map((f) => [f, caption(basename(f))]), 'grid-3')}
</section>

<section class="appendix"><h2>A7 — Responsive matrix (360 → 1440)</h2>
${grid(responsive.map((f) => [f, caption(basename(f))]), 'grid-3')}
</section>

<section class="appendix"><h2>A8 — Post-interaction captures</h2>
${grid(interaction.map((f) => [f, caption(basename(f))]), 'grid-3')}
</section>

<section class="appendix"><h2>A9 — Post-audit HEAD delta (${esc(headShort)})</h2>
${grid(head.map((f) => [f, caption(basename(f))]), 'grid-3')}
</section>

<section class="appendix"><h2>A10 — Exported Figma SVG vectors</h2>
<p>These are the original vector layers exported from the Figma file and used for the geometry comparison in the Icon and Asset Audit.</p>
${grid(vectors.map((v) => [v, caption(basename(v))]), 'grid-4')}
</section>

<section class="appendix"><h2>A11 — Machine-readable probe logs</h2>
${jsonBlocks.map(([p, label]) => {
  const raw = readFileSync(resolve(EV, p.replace(/^evidence\//, '')), 'utf8');
  return `<h3>${esc(label)} <span class="path">evidence/${esc(p.replace(/^evidence\//, ''))}</span></h3><pre><code>${esc(raw)}</code></pre>`;
}).join('')}
</section>

</body></html>`;
}

/* ------------------------------------------------------------------- server */
const MIME = { '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/' || url === '/report.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  const file = resolve(ROOT, '.' + url);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

const html = buildHtml();
writeFileSync('/tmp/samvad-audit-preview.html', html);
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=/tmp/samvad-pdf-${Date.now()}`,
  '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1600,1000'], { stdio: 'pipe' });
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok) break; } catch {} await sleep(200); }
const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;

await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/report.html` });
await sleep(1500);
// wait for every image to decode
for (let i = 0; i < 60; i++) {
  const pendingImgs = await ev(`Array.from(document.images).filter(i=>!i.complete).length`);
  if (pendingImgs === 0) break;
  await sleep(500);
}
const audit = await ev(`(() => {
  const imgs = Array.from(document.images);
  return {
    images: imgs.length,
    broken: imgs.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('src')),
    tables: document.querySelectorAll('table').length,
    headings: document.querySelectorAll('h1,h2,h3').length,
    sections: document.querySelectorAll('section').length,
    rawPipeLines: Array.from(document.querySelectorAll('p')).filter(p => /^\\s*\\|/.test(p.textContent)).length,
    heightPx: document.body.scrollHeight,
    chars: document.body.innerText.length,
  };
})()`);
console.log('HTML audit:', JSON.stringify(audit, null, 2));
if (audit.broken.length) throw new Error('Broken images: ' + audit.broken.slice(0, 10).join(', '));

const pdf = await send('Page.printToPDF', {
  landscape: true,
  printBackground: true,
  paperWidth: 11.6929,
  paperHeight: 8.2677,
  marginTop: 0.35, marginBottom: 0.55, marginLeft: 0.35, marginRight: 0.35,
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-size:6pt;color:#8b95aa;width:100%;padding:0 10mm;font-family:Helvetica,Arial;">Samvad HealthDesk AI — Final UI, Interaction &amp; Figma Audit · audit/final-ui-logic-figma-review @ ab4ba5b</div>`,
  footerTemplate: `<div style="font-size:6pt;color:#8b95aa;width:100%;padding:0 10mm;font-family:Helvetica,Arial;display:flex;justify-content:space-between;"><span>Base 6637841 · HEAD delta 3df09cd · read-only audit</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  generateDocumentOutline: true,
  preferCSSPageSize: false,
});
if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.from(pdf.data, 'base64'));

try { ws.close(); } catch {}
try { chrome.kill('SIGKILL'); } catch {}
server.close();
console.log('\nPDF written:', OUT);
console.log('Bytes:', statSync(OUT).size);
process.exit(0);
