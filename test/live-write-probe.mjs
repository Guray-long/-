// Live write-path probe: add + delete a ZZTEST product against the LIVE backend.
// Spawns fresh headless Chrome, opens the live site (establishes Apps Script session),
// then POSTs product:create and product:delete from page context (mirrors api.js).
import { spawn, spawnSync } from 'node:child_process';

const CDP = 'http://127.0.0.1:9223';
const LIVE = 'https://alphaphius.github.io/chowhuay-pro/';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = `/tmp/chowhuay-live-${Date.now()}`;

function reach(url, tries = 20) {
  return new Promise(async (resolve) => {
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(url); if (r.ok) return resolve(true); } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    resolve(false);
  });
}

function cdpConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    let id = 0;
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res, rej) => {
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
        if (m.error) p.rej(new Error(m.error.message));
        else p.res(m.result);
      }
    };
    ws.onerror = reject;
  });
}

spawnSync('pkill', ['-f', 'remote-debugging-port=9223']);
await new Promise((r) => setTimeout(r, 800));
spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9223', `--user-data-dir=${profile}`], { stdio: 'ignore', detached: true }).unref();
if (!(await reach(CDP + '/json'))) { console.error('chrome not up'); process.exit(1); }

const targets = await (await fetch(CDP + '/json')).json();
const page = targets.find((t) => t.type === 'page') || targets[0];
const c = await cdpConnect(page.webSocketDebuggerUrl);
const send = c.send;

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: LIVE });
await new Promise((r) => setTimeout(r, 6000));

const r = await send('Runtime.evaluate', {
  expression: `(async () => {
    const url = 'https://script.google.com/macros/s/AKfycbwhCyCvUC2RNWJN_wSITsPAPAJSz5jKSoqEJrWq_8YIpy4nPzl475lM8shbpFkSKfg6kA/exec?action=' + encodeURIComponent('product:create');
    const prod = { barcode: '8880000000009', name: 'ZZTEST-lobdai', category: 'test', unit: 'pcs', cost: 1, sell: 2, stock: 1, minStock: 0 };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ product: prod }) });
    const created = await res.json();
    let out = { create: created };
    if (created && created.product && created.product.id) {
      const url2 = 'https://script.google.com/macros/s/AKfycbwhCyCvUC2RNWJN_wSITsPAPAJSz5jKSoqEJrWq_8YIpy4nPzl475lM8shbpFkSKfg6kA/exec?action=' + encodeURIComponent('product:delete');
      const res2 = await fetch(url2, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ id: created.product.id }) });
      out.delete = await res2.json();
    }
    const g = await fetch('https://script.google.com/macros/s/AKfycbwhCyCvUC2RNWJN_wSITsPAPAJSz5jKSoqEJrWq_8YIpy4nPzl475lM8shbpFkSKfg6kA/exec?action=getAll', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({}) });
    const all = await g.json();
    out.counts = { products: all.products ? all.products.length : null };
    return JSON.stringify(out);
  })()`,
  awaitPromise: true,
  returnByValue: true
});

if (r.exceptionDetails) {
  console.log('EXCEPTION:', JSON.stringify(r.exceptionDetails, null, 2).slice(0, 800));
} else {
  console.log(JSON.stringify(JSON.parse(r.result.value), null, 2).slice(0, 1500));
}
c.close();
process.exit(0);
