// Local e2e driver. Injected into a copy of index.html served from localhost.
// Drives the real UI through the live Apps Script backend, then leaves a
// __DONE title marker for test/run.mjs to read.
//
// window.__SCENARIO:
//   'smoke'  — read-only render check of all 5 views + chart
//   'full'   — full business flow (data-changing; run cleanup after)

(function () {
  const SCENARIO = window.__SCENARIO || 'full';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (window.__log = []);
  const ok = (n) => log.push('OK ' + n);
  const bad = (n, x) => log.push('FAIL ' + n + ' ' + (x || ''));
  const errs = (window.__errs = []);
  window.addEventListener('error', (e) => errs.push('err:' + e.message));
  window.addEventListener('unhandledrejection', (e) => errs.push('rej:' + String((e.reason && e.reason.message) || e.reason)));

  // --- notification stub (installed before boot so any early alert is caught) ---
  window.__notifyCount = 0;
  window.__lastNotify = null;
  try {
    window.Notification = function (title, opts) {
      window.__notifyCount++;
      window.__lastNotify = { title: String(title), body: (opts && opts.body) || '' };
      return { close: function () {} };
    };
    window.Notification.permission = 'granted';
    window.Notification.requestPermission = () => Promise.resolve('granted');
    if (window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype) {
      window.ServiceWorkerRegistration.prototype.showNotification = function (title, opts) {
        window.__notifyCount++;
        window.__lastNotify = { title: String(title), body: (opts && opts.body) || '' };
        return Promise.resolve();
      };
    }
  } catch (e) {}

  async function until(fn, ms, step) {
    const t = Date.now();
    while (Date.now() - t < ms) {
      if (fn()) return true;
      await wait(step || 400);
    }
    return false;
  }

  async function boot() {
    for (let i = 0; i < 100 && !(window.Store && window.Store.state && window.App && typeof window.enterPin === 'function'); i++) await wait(100);
  }

  async function ensureSeedProduct() {
    if (!byBarcode(8851888041847)) {
      await window.Api.product.create({
        barcode: 8851888041847,
        name: 'ปลากระป๋องปู',
        category: 'ของแห้ง',
        unit: 'กระป๋อง',
        cost: 18,
        sell: 25,
        stock: 3,
        minStock: 10
      });
      await window.Store.refresh();
    }
    const seed = byBarcode(8851888041847);
    const delta = 3 - Number(seed.stock || 0);
    if (delta) {
      await window.Api.product.adjust(seed.id, delta);
      await window.Store.refresh();
    }
  }

  async function unlock() {
    const expected = String(window.__TEST_PIN || '1234');
    expected.split('').forEach((d) => window.enterPin(Number(d)));
    const opened = await until(() => document.getElementById('passcode-overlay').classList.contains('hidden'), 30000);
    if (!opened) throw new Error('PIN unlock timed out');
    await until(() => window.Store.state.loaded === true, 30000);
    await ensureSeedProduct();
  }

  function setVal(sel, v) {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function byBarcode(bc) {
    return window.Store.state.products.find((p) => String(p.barcode) === String(bc));
  }

  function closeModalIfOpen() {
    const m = document.querySelector('.modal-sheet [data-scan-close], .modal-sheet [data-mclose]');
    if (m) m.click();
  }

  function confirmDelete() {
    const b = document.querySelector('.modal-sheet .modal-foot .btn-danger');
    if (b) b.click();
  }

  async function smoke() {
    await boot();
    await unlock();
    await until(() => window.Store.state.products.length, 25000);
    ok('boot+data products=' + window.Store.state.products.length);

    for (const hash of ['#/dashboard', '#/pos', '#/inventory', '#/reports', '#/settings']) {
      location.hash = hash;
      await wait(800);
      const v = document.querySelector('.view.active');
      ok('view ' + hash + ': ' + (v ? v.id : 'none'));
    }
    location.hash = '#/dashboard';
    await wait(800);
    await until(() => document.querySelector('#view-dashboard canvas'), 10000);
    ok('chart canvas: ' + !!document.querySelector('#view-dashboard canvas'));

    if (errs.length) bad('JS ERRORS: ' + errs.join(' | '));
    else ok('no JS errors');
  }

  async function full() {
    await boot();
    await unlock();
    await until(() => window.Store.state.products.length, 25000);
    ok('boot+data products=' + window.Store.state.products.length);

    // --- settings ---
    location.hash = '#/settings';
    await wait(900);
    const root = document.documentElement;
    document.querySelector('[data-theme-set="green"]').click();
    await wait(400);
    ok('theme green: ' + (root.dataset.theme === 'green'));
    const dark = document.getElementById('s-dark');
    if (dark) {
      dark.click();
      await wait(400);
      ok('dark mode: ' + (root.dataset.mode === 'dark'));
      dark.click();
      await wait(300);
    } else bad('dark toggle missing');

    setVal('#s-custom-hex', '#0f766e');
    document.getElementById('s-apply-custom').click();
    await wait(400);
    ok('custom theme applied: ' + (root.dataset.theme === 'custom' && !!root.style.getPropertyValue('--primary')));

    const store = document.getElementById('s-store');
    if (store) {
      store.value = 'ร้านทดสอบ';
      store.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('s-save-store').click();
      await until(() => window.Store.state.settings.storeName === 'ร้านทดสอบ', 20000);
      ok('store name saved: ' + (window.Store.state.settings.storeName === 'ร้านทดสอบ'));
    } else bad('store input missing');

    const pass = document.getElementById('s-pass');
    if (pass) {
      pass.value = '9999';
      pass.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('s-save-pass').click();
      let passSaved = false;
      for (let i = 0; i < 40 && !passSaved; i++) {
        await wait(500);
        passSaved = await window.Api.auth.verifyRememberedPin('9999');
      }
      if (passSaved) ok('passcode saved securely: true');
      else bad('passcode hash was not updated');
    } else bad('pass input missing');

    const notify = document.getElementById('s-notify');
    if (notify) {
      notify.click();
      await wait(900);
      ok('notify toggle saved: ' + (window.Api.getSetup().notify === true));
    } else bad('notify toggle missing');

    // --- POS: sale with discount + cash ---
    location.hash = '#/pos';
    await wait(900);
    document.getElementById('pos-scan').click();
    await wait(900);
    ok('scan modal opened: ' + !!document.querySelector('.modal-sheet'));
    closeModalIfOpen();
    await wait(300);

    const pMain = byBarcode(8851888041847);
    if (!pMain) bad('pMain missing');
    document.querySelector('#view-pos [data-add="' + pMain.id + '"]').click();
    await wait(400);
    const cartItems = document.querySelectorAll('#view-pos .cart-item').length;
    ok('cart has item: ' + (cartItems >= 1));
    ok('selected card has cart badge + stock row: ' + (!!document.querySelector('#view-pos [data-add="' + pMain.id + '"] .cart-qty-badge') && !!document.querySelector('#view-pos [data-add="' + pMain.id + '"] .product-stock')));
    document.querySelector('#view-pos [data-checkout]').click();
    await wait(400);
    const discountSet = setVal('#co-discount', '5');
    setVal('#co-cash', '50');
    await wait(200);
    ok('checkout total/change: total=' + document.getElementById('co-total').textContent + ' change=' + document.getElementById('co-change').textContent);
    const payCash = document.querySelector('input[name="co-pay"][value="cash"]');
    if (payCash) payCash.click();
    document.querySelector('.modal-sheet .modal-foot .btn').click();
    const salesBefore = window.Store.state.sales.length;
    await until(() => window.Store.state.sales.length > salesBefore, 30000);
    const sale = window.Store.state.sales[window.Store.state.sales.length - 1];
    window.__createdSaleId = sale.id;
    ok('sale created: code=' + sale.code + ' discount=' + sale.discount + ' total=' + sale.total + ' cash=' + sale.cashReceived + ' change=' + sale.change);
    const sOk = sale.discount === 5 && sale.total === 20 && sale.cashReceived === 50 && sale.change === 30;
    if (sOk) ok('discount/cash math correct (25-5=20, 50-20=30)'); else bad('discount math wrong', JSON.stringify(sale));
    const receiptBtns = document.querySelectorAll('.modal-sheet .modal-foot .btn');
    if (receiptBtns.length) receiptBtns[receiptBtns.length - 1].click();
    await wait(300);

    // --- dashboard restock ---
    location.hash = '#/dashboard';
    await wait(900);
    const rb = document.querySelector('[data-act="restock"]');
    if (rb) {
      rb.click();
      await wait(500);
      ok('restock modal: ' + !!document.querySelector('#r-qty'));
      setVal('#r-qty', '30');
      const rbtn = document.querySelector('.modal-sheet .modal-foot .btn');
      if (rbtn) rbtn.click();
      const restocked = await until(() => byBarcode(8851888041847) && Number(byBarcode(8851888041847).stock) >= 30, 30000);
      const stk = byBarcode(8851888041847);
      if (restocked) ok('restock applied stock=' + (stk ? stk.stock : 'n/a'));
      else bad('restock did not apply stock=' + (stk ? stk.stock : 'n/a'), document.querySelector('.toast') && document.querySelector('.toast').textContent);
    } else bad('restock button missing (low stock?)');

    // --- inventory: add product via UI ---
    location.hash = '#/inventory';
    await wait(900);
    document.getElementById('inv-add').click();
    await wait(400);
    ok('add product modal: ' + !!document.querySelector('#f-name'));
    const newBarcode = '8851888' + String(Date.now()).slice(-6);
    setVal('#f-name', 'สินค้าใหม่ผ่านUI');
    setVal('#f-barcode', newBarcode);
    setVal('#f-cat', 'ของใช้');
    setVal('#f-unit', 'ชิ้น');
    setVal('#f-cost', '10');
    setVal('#f-sell', '15');
    setVal('#f-stock', '5');
    setVal('#f-min', '2');
    document.querySelector('.modal-sheet .modal-foot .btn').click();
    await until(() => byBarcode(newBarcode), 30000);
    ok('product added via UI: ' + (!!byBarcode(newBarcode)));

    // --- image upload via DataTransfer ---
    const uiProd = byBarcode(newBarcode);
    document.querySelector('[data-edit="' + uiProd.id + '"]').click();
    await wait(500);
    const png = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    const bytes = new Uint8Array(png.length);
    for (let i = 0; i < png.length; i++) bytes[i] = png.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'img.png', { type: 'image/png' }));
    const fileInput = document.getElementById('img-file');
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(1000);
    ok('image picked+preview: ' + (!!document.querySelector('#img-preview img')));
    document.querySelector('.modal-sheet .modal-foot .btn').click();
    await until(() => byBarcode(newBarcode) && byBarcode(newBarcode).imgId, 30000);
    ok('image uploaded (imgId set): ' + (!!byBarcode(newBarcode).imgId));

    // --- inventory: adjust multiple items locally, save with one API request ---
    const batchStockBefore = Number(byBarcode(newBarcode).stock);
    document.querySelector('#view-inventory #inv-stock-mode').click();
    await wait(300);
    const plus = document.querySelector('#view-inventory [data-stock-delta="1"][data-id="' + byBarcode(newBarcode).id + '"]');
    if (plus) {
      plus.click();
      await wait(150);
      document.querySelector('#view-inventory [data-stock-delta="1"][data-id="' + byBarcode(newBarcode).id + '"]').click();
      await wait(150);
      ok('stock edits stay pending: ' + (Number(byBarcode(newBarcode).stock) === batchStockBefore && !!document.querySelector('#view-inventory .stock-delta.positive')));
      document.querySelector('#view-inventory [data-stock-save]').click();
      const batchSaved = await until(() => Number(byBarcode(newBarcode).stock) === batchStockBefore + 2, 30000);
      ok('batch stock saved once: ' + batchSaved);
    } else bad('batch stock controls missing');

    // --- duplicate barcode guard ---
    const dupErr = await window.Api.product.create({ barcode: 8851888041847, name: 'สินค้าบาร์โค้ดซ้ำ' }).then(
      () => 'no-error',
      (e) => e.message || String(e)
    );
    ok('duplicate barcode rejected: ' + (dupErr && String(dupErr).includes('มีสินค้าบาร์โค้ด')));

    // --- category add via UI ---
    const catName = 'หมวดทดสอบ' + Math.floor(Math.random() * 1000);
    document.getElementById('inv-add').click();
    await wait(400);
    setVal('#f-cat', catName);
    document.getElementById('f-cat-add').click();
    await until(() => window.Store.state.categories.includes(catName), 20000);
    ok('category added via UI: ' + window.Store.state.categories.includes(catName));
    closeModalIfOpen();
    await wait(300);

    // --- bulk: add purchase via UI ---
    document.querySelector('[data-mode="bulk"]').click();
    await wait(600);
    const purDesc = 'ทุนรวมผ่านUI' + Date.now();
    setVal('#b-desc', purDesc);
    setVal('#b-total', '99.50');
    document.getElementById('bulk-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const purAdded = await until(() => window.Store.state.purchases.some((p) => p && p.description === purDesc), 20000);
    ok('purchase added via UI: ' + purAdded);
    await until(() => document.querySelector('[data-bdel]'), 10000);
    const targetPur = window.Store.state.purchases.find((p) => p && p.description === purDesc);
    const pDel = document.querySelector('[data-bdel="' + ((targetPur || {}).id || '') + '"]') || document.querySelector('[data-bdel]');
    if (pDel && targetPur) {
      pDel.click();
      await wait(500);
      confirmDelete();
      const purGone = await until(() => !window.Store.state.purchases.some((p) => p && p.id === targetPur.id), 20000);
      ok('purchase deleted via UI: ' + purGone);
    } else bad('purchase delete target missing', purAdded ? '' : '(add failed first)');

    // --- reports: delete sale → stock restored ---
    location.hash = '#/reports';
    await wait(900);
    await until(() => document.querySelector('[data-sdel]'), 15000);
    const stockBeforeDel = byBarcode(8851888041847).stock;
    const createdSaleDelete = document.querySelector('[data-sdel="' + window.__createdSaleId + '"]');
    if (!createdSaleDelete) throw new Error('created sale delete button missing');
    createdSaleDelete.click();
    await wait(500);
    confirmDelete();
    await until(() => !window.Store.state.sales.some((s) => s.id === window.__createdSaleId), 30000);
    const stockAfterDel = byBarcode(8851888041847).stock;
    ok('sale deleted, stock restored ' + stockBeforeDel + '->' + stockAfterDel + ': ' + (stockAfterDel === stockBeforeDel + 1));

    // --- reports: excel export ---
    document.getElementById('r-excel').click();
    await until(() => window.XLSX, 10000);
    await wait(1200);
    ok('excel export: XLSX loaded=' + !!window.XLSX);

    // --- reports: pdf export ---
    window.__printHTML = null;
    document.getElementById('r-pdf').click();
    await wait(600);
    ok('pdf export: report printed=' + (window.__printHTML && window.__printHTML.includes('รายงาน')));

    // --- reports: range buttons ---
    document.querySelector('[data-range="week"]').click();
    await wait(300);
    document.querySelector('[data-range="month"]').click();
    await wait(300);
    document.querySelector('[data-range="all"]').click();
    await wait(300);
    ok('range toggles clickable');

    // --- low-stock notification fires ---
    const pNotif = byBarcode(8851888041847);
    try { localStorage.removeItem(window.CONFIG.STORAGE_KEY + '_alerted'); } catch (e) {}
    const toLowStock = 3 - Number(pNotif.stock || 0);
    if (toLowStock) {
      await window.Api.product.adjust(pNotif.id, toLowStock);
      await window.Store.refresh();
    }
    await wait(2200);
    const beforeNotify = window.__notifyCount;
    window.App.checkAlerts();
    await wait(800);
    const fired = window.__notifyCount > beforeNotify;
    ok('notification fired: ' + fired + ' title=' + ((window.__lastNotify && window.__lastNotify.title) || 'none'));
    await wait(2200);
    const beforeRepeat = window.__notifyCount;
    window.App.checkAlerts();
    await wait(800);
    ok('notification repeats on next check: ' + (window.__notifyCount > beforeRepeat));

    if (errs.length) bad('JS ERRORS: ' + errs.join(' | '));
    else ok('no JS errors');
  }

  async function run() {
    try {
      if (SCENARIO === 'smoke') await smoke();
      else await full();
    } catch (e) {
      bad('FATAL ' + (e && e.message));
    }
    document.title = '__DONE ' + log.length + ' | ' + log.join(' ; ');
  }
  run();
})();
