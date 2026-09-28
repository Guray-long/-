// Reset the backend to a clean slate + default settings.
// Runs from inside Chrome because direct node->GAS fetch is unreliable on some
// networks. Connect to an existing page, execute the cleanup, print result.
//
//   node test/cleanup.mjs

const CDP = 'http://127.0.0.1:9222';

const tabs = await (await fetch(CDP + '/json')).json();
const page = tabs.find((t) => t.type === 'page');
if (!page) {
  console.error('no page tab found');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let id = 0;
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  }
};
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');

const expr = `(async () => {
  if (window.__TEST_MODE !== true) {
    return JSON.stringify({ error: "REFUSED: window.__TEST_MODE is not true — refusing to touch a non-test backend" });
  }
  const f = await window.Api.call("getAll", {});
  const before = { products: f.products.length, sales: f.sales.length, purchases: f.purchases.length, categories: f.categories.length, settings: f.settings };
  const reset = await window.Api.call("test:reset", {});
  return JSON.stringify({ cleaned: reset.reset === true, before });
})()`;

const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
console.log(r.result.value || JSON.stringify(r.result));
ws.close();
process.exit(0);
