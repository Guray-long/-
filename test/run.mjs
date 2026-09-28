// Local e2e test runner.
//   node test/run.mjs [--scenario full|smoke] [--chrome-port 9222]
//
// Steps: (1) regenerate test/index.test.html from index.html + test/driver.js,
// (2) make sure a Chrome instance with --remote-debugging-port is up,
// (3) open the page, (4) poll the document title until the driver stamps
// __DONE, (5) print the results and backend state.
//
// Prereq: a static server on PORT serving the project root. Example:
//   python3 -m http.server 8765

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const scenario = (args.find((a) => a.startsWith('--scenario=')) || '--scenario=full').split('=')[1];
const TEST_PIN = process.env.CHOWHUAY_TEST_PIN || '1234';
const GAS_URL_OVERRIDE = process.env.CHOWHUAY_GAS_URL || '';
const PORT = Number(process.env.CHOWHUAY_TEST_PORT || 8765);
const CDP = 'http://127.0.0.1:9222';
const URL = `http://localhost:${PORT}/index.test.html`;
const DL = '/tmp/chowhuay-dl';
rmSync(DL, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });

// --- 1. generate test page ---------------------------------------------------
const driver = readFileSync(join(__dirname, 'driver.js'), 'utf8');
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
html = html.replace('</body>', `<script>window.__SCENARIO=${JSON.stringify(scenario)};window.__TEST_PIN=${JSON.stringify(TEST_PIN)};window.__TEST_MODE=true;if(${JSON.stringify(GAS_URL_OVERRIDE)})window.CONFIG.GAS_URL=${JSON.stringify(GAS_URL_OVERRIDE)};</script>\n<script>${driver}</script>\n</body>`);
mkdirSync(join(__dirname, 'test'), { recursive: true });
writeFileSync(join(ROOT, 'index.test.html'), html);
console.log(`[1/4] generated index.test.html (scenario=${scenario})`);

// --- 2. ensure server + chrome ------------------------------------------------
async function reach(url) {
  try {
    const r = await fetch(url);
    return r.ok;
  } catch {
    return false;
  }
}
if (!(await reach(`http://localhost:${PORT}/index.html`))) {
  console.error(`[2/4] static server NOT running on :${PORT}. Start it, e.g.:`);
  console.error('      python3 -m http.server 8765');
  process.exit(1);
}

// Always run against a FRESH Chrome profile so localStorage/PIN state from a
// previous run can't leak into this one (caused stale-cache flakiness).
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = `/tmp/chowhuay-test-${Date.now()}`;
spawnSync('pkill', ['-f', 'remote-debugging-port=9222']);
await new Promise((r) => setTimeout(r, 800));
spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9222', `--user-data-dir=${profile}`], {
  stdio: 'ignore',
  detached: true
}).unref();
let up = false;
for (let i = 0; i < 20 && !up; i++) {
  await new Promise((r) => setTimeout(r, 500));
  up = await reach(CDP + '/json');
}
if (!up) {
  console.error('[2/4] could not start Chrome with remote debugging');
  process.exit(1);
}
console.log('[2/4] server + fresh chrome ready');

// --- 3. drive the page --------------------------------------------------------
function cdpConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    let id = 0;
    ws.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const mid = ++id;
            pending.set(mid, { res, rej });
            ws.send(JSON.stringify({ id: mid, method, params }));
          }),
        close: () => ws.close()
      });
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      }
    };
    ws.onerror = (e) => reject(new Error('ws error ' + JSON.stringify(e).slice(0, 80)));
  });
}

async function evalIn(cdp, page, expression, awaitPromise = false) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

const tabs = await (await fetch(CDP + '/json')).json();
const page = tabs.find((t) => t.type === 'page');
if (!page) {
  console.error('[3/4] no page tab found — open a tab first');
  process.exit(1);
}
const cdp = await cdpConnect(page.webSocketDebuggerUrl);
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
await cdp.send('Browser.grantPermissions', { origin: URL, permissions: ['notifications'] });
await cdp.send('Page.navigate', { url: URL });
console.log('[3/4] navigated, waiting for __DONE title...');

let done = false;
let title = '';
let logStr = '';
let pollErr = '';
for (let i = 0; i < 300 && !done; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    title = await evalIn(cdp, page, 'document.title');
    if (title.startsWith('__DONE')) {
      done = true;
      logStr = title.slice(6);
    }
  } catch (e) {
    pollErr = e.message;
  }
}
if (!done) {
  // grab anything stamped before dying
  try {
    logStr = (await evalIn(cdp, page, 'JSON.stringify(window.__log || [])')) || '';
  } catch {}
  console.error(`[4/4] TIMEOUT after 300s (${pollErr}). Partial: ${logStr}`);
  cdp.close();
  process.exit(1);
}
cdp.close();

// --- 4. report ----------------------------------------------------------------
let dlNote = '';
try {
  const files = readdirSync(DL);
  const xlsx = files.filter((f) => f.endsWith('.xlsx'));
  dlNote = xlsx.length
    ? `\n       [download] Excel file saved: ${xlsx.map((f) => f + ' (' + statSync(join(DL, f)).size + 'B)').join(', ')}`
    : '\n       [download] WARN: no .xlsx file in download dir';
} catch {
  dlNote = '\n       [download] WARN: download dir missing';
}
console.log('[4/4] RESULT: ' + logStr.replace(/ \| /g, '\n       ') + dlNote);
const fails = (logStr.match(/FAIL/g) || []).length;
const oks = (logStr.match(/OK/g) || []).length;
console.log(`       ${oks} OK / ${fails} FAIL / ${oks + fails} total`);
process.exit(fails ? 1 : 0);
