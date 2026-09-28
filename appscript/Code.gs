/**
 * ChowHuay Pro — Google Apps Script Backend
 * =========================================
 * Google Sheets = database, Google Drive = image storage.
 *
 * HOW TO DEPLOY:
 * 1) Open https://script.google.com/  -> New project -> paste this file.
 * 2) In the editor left panel, "+" -> "Drive API" -> enable (advanced service).
 * 3) Deploy -> New deployment -> type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4) Copy the /exec URL, paste into the app's Settings screen.
 *
 * Frontend talks to this via fetch POST with Content-Type: text/plain
 * (avoids CORS preflight). JSON payload in the body, action in ?action=
 */

var SCRIPT_VER = '1.3.0';
var SESSION_TTL_SECONDS = 21600;
var MAX_IMAGE_BYTES = 5 * 1024 * 1024;

var SHEET_PRODUCTS = 'Products';
var SHEET_SALES = 'Sales';
var SHEET_PURCHASES = 'Purchases';
var SHEET_SETTINGS = 'Settings';
var SHEET_CATEGORIES = 'Categories';
var SHEET_TOMBSTONES = 'Tombstones';
var FOLDER_NAME = 'ChowHuay Pro Images';
var TOMBSTONE_DAYS = 180;

var PRODUCT_HEADERS = ['id', 'barcode', 'name', 'category', 'unit', 'cost', 'sell', 'stock', 'minStock', 'imgId', 'created', 'updated'];
var SALE_HEADERS = ['id', 'code', 'date', 'items', 'subtotal', 'discount', 'total', 'profit', 'payment', 'cashReceived', 'change', 'updated'];
var PURCHASE_HEADERS = ['id', 'date', 'description', 'total', 'updated'];
var SETTING_HEADERS = ['key', 'value'];
var CATEGORY_HEADERS = ['name'];
var TOMBSTONE_HEADERS = ['table', 'id', 'updated'];

// When the request URL carries ?sheet=test, every read/write targets a
// dedicated TEST spreadsheet (auto-created clone) so e2e runs can never
// touch the real store data or images.
var TEST_MODE = false;

/* ------------------------------------------------------------------ *
 *  Entry points
 * ------------------------------------------------------------------ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  return route(p.action, p, {});
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  var body = {};
  try {
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    body = {};
  }
  return route(p.action, p, body);
}

function route(action, params, body) {
  var wantsTest = !!(params && params.sheet === 'test');
  TEST_MODE = false;
  try {
    if (action === 'ping') return jsonOk(handle(action, params, body));
    if (action === 'auth:login') return jsonOk(authLogin(body && body.pin));
    requireAuth(params, body);
    TEST_MODE = wantsTest;
    var result = isMutationAction(action)
      ? withScriptLock(function () { return handle(action, params, body); })
      : handle(action, params, body);
    return jsonOk(result);
  } catch (err) {
    Logger.log('route error: %s %s', action, err.stack || err);
    return jsonErr(String(err.message || err), err.code || 'API_ERROR');
  }
}

function handle(action, params, body) {
  switch (action) {
    case 'ping': return { ok: true, ver: SCRIPT_VER, time: new Date().toISOString(), authRequired: true };
    case 'auth:logout': return authLogout(body && body.token);
    case 'init': return initSheets();
    case 'getAll': return getAll(body.since);
    case 'test:reset': return testReset();
    case 'product:create': return createProduct(body.product || {});
    case 'product:update': return updateProduct(body.product || {});
    case 'product:delete': return deleteProduct((body.product && body.product.id) || body.id);
    case 'product:adjust': return adjustStock(body.id, body.delta);
    case 'product:adjustBatch': return adjustStocks(body.adjustments || []);
    case 'sale:create': return createSale(body.sale || {});
    case 'sale:delete': return deleteSale(body.id);
    case 'purchase:create': return createPurchase(body.purchase || {});
    case 'purchase:update': return updatePurchase(body.purchase || {});
    case 'purchase:delete': return deletePurchase(body.id);
    case 'category:create': return createCategory(body.name);
    case 'category:delete': return deleteCategory(body.name);
    case 'settings:get': return { settings: safeSettings(getSettings()) };
    case 'settings:set': return setPublicSetting(body.key, body.value);
    case 'image:upload': return uploadImage(body.b64, body.filename);
    case 'image:delete': return deleteImage(body.id);
    case 'image:repairShare': return repairImageSharing();
    default: throw appError('UNKNOWN_ACTION', 'ไม่รู้จักคำสั่งที่ร้องขอ');
  }
}

function appError(code, message) {
  var err = new Error(message);
  err.code = code;
  return err;
}

function authLogin(pin) {
  pin = String(pin || '');
  if (!/^\d{4}$/.test(pin)) throw appError('INVALID_PIN', 'รหัสผ่านไม่ถูกต้อง');
  var props = PropertiesService.getScriptProperties();
  var propKey = 'PIN_HASH';
  var stored = props.getProperty(propKey);
  var cfg = getSettings();
  if (stored) {
    var parts = stored.split(':');
    if (parts.length !== 2 || pinDigest(pin, parts[0]) !== parts[1]) {
      throw appError('INVALID_PIN', 'รหัสผ่านไม่ถูกต้อง');
    }
  } else {
    var expected = String(cfg.passcode || '1234');
    if (pin !== expected) throw appError('INVALID_PIN', 'รหัสผ่านไม่ถูกต้อง');
    storePinHash(pin, propKey);
    removeSetting('passcode');
  }
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('session:' + token, '1', SESSION_TTL_SECONDS);
  return { ok: true, token: token, expiresIn: SESSION_TTL_SECONDS, settings: safeSettings(cfg) };
}

function pinDigest(pin, salt) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    'chowhuay-pro:' + String(salt) + ':' + String(pin),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function storePinHash(pin, key) {
  var salt = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(key || 'PIN_HASH', salt + ':' + pinDigest(pin, salt));
}

function authLogout(token) {
  if (token) CacheService.getScriptCache().remove('session:' + String(token));
  return { ok: true };
}

function requireAuth(params, body) {
  var token = (body && body.token) || (params && params.token) || '';
  if (!token || CacheService.getScriptCache().get('session:' + String(token)) !== '1') {
    throw appError('AUTH_REQUIRED', 'เซสชันหมดอายุ กรุณาใส่รหัสผ่านอีกครั้ง');
  }
}

function safeSettings(cfg) {
  var out = {};
  Object.keys(cfg || {}).forEach(function (key) {
    if (key !== 'passcode' && key !== 'imgFolderId') out[key] = cfg[key];
  });
  return out;
}

function isMutationAction(action) {
  return [
    'init', 'test:reset', 'product:create', 'product:update', 'product:delete',
    'product:adjust', 'product:adjustBatch', 'sale:create', 'sale:delete', 'purchase:create',
    'purchase:update', 'purchase:delete', 'category:create', 'category:delete',
    'settings:set', 'image:delete', 'image:repairShare'
  ].indexOf(action) >= 0;
}

function withScriptLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw appError('BUSY', 'ระบบกำลังบันทึกรายการอื่น กรุณาลองอีกครั้ง');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ------------------------------------------------------------------ *
 *  Sheets bootstrap
 * ------------------------------------------------------------------ */

function getSS() {
  if (TEST_MODE) return ensureTestSS();
  return SpreadsheetApp.getActiveSpreadsheet();
}

// Lazily create (once) a dedicated TEST spreadsheet cloned from the live one.
function ensureTestSS() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('TEST_SS_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) {}
  }
  var live = SpreadsheetApp.getActiveSpreadsheet();
  var test = SpreadsheetApp.create('ChowHuay Pro (TEST) ' + Date.now());
  live.getSheets().forEach(function (s) {
    var dest = test.getSheetByName(s.getName());
    if (!dest) dest = test.insertSheet(s.getName());
    var vals = s.getDataRange().getValues();
    if (vals.length) dest.getRange(1, 1, vals.length, vals[0].length).setValues(vals);
  });
  var def = test.getSheetByName('Sheet1');
  if (def) test.deleteSheet(def);
  props.setProperty('TEST_SS_ID', test.getId());
  return test;
}

function testReset() {
  if (!TEST_MODE) throw new Error('test:reset only allowed in test mode');
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('TEST_PIN_HASH');
  var id = props.getProperty('TEST_SS_ID');
  if (id) {
    try {
      DriveApp.getFileById(SpreadsheetApp.openById(id).getId()).setTrashed(true);
    } catch (e) { Logger.log('test ss trash failed: %s', e.message); }
    props.deleteProperty('TEST_SS_ID');
  }
  try {
    var folders = DriveApp.getFoldersByName(FOLDER_NAME + ' (TEST)');
    if (folders.hasNext()) {
      var f = folders.next();
      var files = f.getFiles();
      while (files.hasNext()) files.next().setTrashed(true);
      f.setTrashed(true);
    }
  } catch (e) { Logger.log('test folder cleanup failed: %s', e.message); }
  return { ok: true, reset: true };
}

function sheet(name, headers) {
  var ss = getSS();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers) {
      sh.appendRow(headers);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function initSheets() {
  sheet(SHEET_PRODUCTS, PRODUCT_HEADERS);
  sheet(SHEET_SALES, SALE_HEADERS);
  sheet(SHEET_PURCHASES, PURCHASE_HEADERS);
  sheet(SHEET_SETTINGS, SETTING_HEADERS);
  sheet(SHEET_CATEGORIES, CATEGORY_HEADERS);
  sheet(SHEET_TOMBSTONES, TOMBSTONE_HEADERS);
  ensureColumns();
  var cfg = getSettings();
  if (!cfg.storeName) setSetting('storeName', 'ร้านโชว์ห่วยของฉัน');
  if (!cfg.theme) setSetting('theme', 'blue');
  ensureImageFolder();
  return { ok: true, msg: 'sheets ready' };
}

// One-time migration: backfill the `updated` column on Sales/Purchases so
// incremental (delta) syncs work on existing sheets.
function ensureColumns() {
  ensureColumn(sheet(SHEET_SALES, SALE_HEADERS), 'updated', 3);
  ensureColumn(sheet(SHEET_PURCHASES, PURCHASE_HEADERS), 'updated', 2);
}

function ensureColumn(sh, colName, dateCol) {
  var hs = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (hs.indexOf(colName) >= 0) return;
  var idx = hs.length + 1;
  sh.getRange(1, idx).setValue(colName);
  var n = sh.getLastRow();
  if (n > 1) {
    var dates = sh.getRange(2, dateCol, n - 1, 1).getValues();
    var now = nowIso();
    sh.getRange(2, idx, n - 1, 1).setValues(dates.map(function (r) {
      var t = new Date(r[0]).getTime();
      return [isNaN(t) ? now : new Date(t).toISOString()];
    }));
  }
}

/* ------------------------------------------------------------------ *
 *  Generic table helpers (Products / Sales / Purchases)
 * ------------------------------------------------------------------ */

function tableToObjects(sh) {
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = values[r][c];
    out.push(obj);
  }
  return out;
}

function findRowById(sh, id) {
  if (!id) return -1;
  var values = sh.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]) === String(id)) return r + 1;
  }
  return -1;
}

function uid(prefix) {
  return (prefix || 'id') + '_' + new Date().getTime().toString(36) + '_' + Math.floor(Math.random() * 46656).toString(36);
}

function nowIso() {
  return new Date().toISOString();
}

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

/* ------------------------------------------------------------------ *
 *  getAll — full snapshot for the frontend cache
 * ------------------------------------------------------------------ */

function getAll(since) {
  ensureColumns();
  var categories = tableToObjects(sheet(SHEET_CATEGORIES, CATEGORY_HEADERS)).map(function (r) { return r.name; });
  var settings = safeSettings(getSettings());
  var sales = tableToObjects(sheet(SHEET_SALES, SALE_HEADERS));
  var purchases = tableToObjects(sheet(SHEET_PURCHASES, PURCHASE_HEADERS));
  var sinceT = since ? new Date(since).getTime() : null;
  if (sinceT) {
    sales = sales.filter(function (r) { return new Date(r.updated || r.date).getTime() >= sinceT; });
    purchases = purchases.filter(function (r) { return new Date(r.updated || r.date).getTime() >= sinceT; });
  }
  var tombs = getTombstonesSince(sinceT);
  return {
    ok: true,
    products: tableToObjects(sheet(SHEET_PRODUCTS, PRODUCT_HEADERS)),
    sales: sales,
    purchases: purchases,
    categories: categories,
    settings: settings,
    deletedSales: tombs.sales,
    deletedPurchases: tombs.purchases,
    syncedAt: nowIso(),
    ver: SCRIPT_VER
  };
}

/* ---- tombstones (for incremental delete propagation) ---- */

function addTombstone(table, id) {
  var sh = sheet(SHEET_TOMBSTONES, TOMBSTONE_HEADERS);
  sh.appendRow([table, String(id), nowIso()]);
}

function getTombstonesSince(sinceT) {
  var out = { sales: [], purchases: [] };
  var sh = sheet(SHEET_TOMBSTONES, TOMBSTONE_HEADERS);
  var values = sh.getDataRange().getValues();
  var cutoff = new Date().getTime() - TOMBSTONE_DAYS * 24 * 3600 * 1000;
  var doomed = [];
  for (var r = 1; r < values.length; r++) {
    var t = new Date(values[r][2]).getTime() || 0;
    if (sinceT && t >= sinceT) {
      if (values[r][0] === 'sale') out.sales.push(String(values[r][1]));
      else if (values[r][0] === 'purchase') out.purchases.push(String(values[r][1]));
    }
    if (t < cutoff) doomed.push(r + 1);
  }
  for (var i = doomed.length - 1; i >= 0; i--) sh.deleteRow(doomed[i]);
  return out;
}

/* ------------------------------------------------------------------ *
 *  Products CRUD
 * ------------------------------------------------------------------ */

function buildProductRow(p) {
  return [
    p.id, p.barcode, p.name, p.category, p.unit,
    num(p.cost), num(p.sell), num(p.stock), num(p.minStock),
    p.imgId || '', p.created || nowIso(), p.updated || nowIso()
  ];
}

function assertUniqueBarcode(sh, barcode, excludeId) {
  if (isBlank(barcode)) return;
  var values = sh.getDataRange().getValues();
  var want = String(barcode).trim();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]) === String(excludeId || '')) continue;
    if (String(values[r][1]).trim() === want) throw new Error('มีสินค้าบาร์โค้ด "' + want + '" ในระบบแล้ว');
  }
}

function createProduct(p) {
  validateProduct(p);
  var sh = sheet(SHEET_PRODUCTS, PRODUCT_HEADERS);
  assertUniqueBarcode(sh, p.barcode, null);
  var id = p.id || uid('p');
  p.id = id;
  p.created = p.created || nowIso();
  p.updated = nowIso();
  sh.appendRow(buildProductRow(p));
  return { ok: true, product: p };
}

function updateProduct(p) {
  validateProduct(p);
  var sh = sheet(SHEET_PRODUCTS, PRODUCT_HEADERS);
  var row = findRowById(sh, p.id);
  if (row < 0) throw new Error('ไม่พบสินค้า #' + p.id);
  assertUniqueBarcode(sh, p.barcode, p.id);
  var existing = tableToObjects(sh).find(function (o) { return String(o.id) === String(p.id); });
  var merged = {};
  PRODUCT_HEADERS.forEach(function (h) { merged[h] = (p[h] !== undefined) ? p[h] : (existing ? existing[h] : ''); });
  merged.id = existing.id;
  merged.updated = nowIso();
  sh.getRange(row, 1, 1, PRODUCT_HEADERS.length).setValues([buildProductRow(merged)]);
  return { ok: true, product: merged };
}

function deleteProduct(id) {
  var sh = sheet(SHEET_PRODUCTS, PRODUCT_HEADERS);
  var row = findRowById(sh, id);
  if (row < 0) throw new Error('ไม่พบสินค้า');
  var imgId = sh.getRange(row, 10).getValue();
  sh.deleteRow(row);
  if (imgId) {
    try { deleteImage(String(imgId)); } catch (e) { /* keep going */ }
  }
  return { ok: true, id: id };
}

function adjustStock(id, delta) {
  var sh = sheet(SHEET_PRODUCTS, PRODUCT_HEADERS);
  var row = findRowById(sh, id);
  if (row < 0) throw new Error('ไม่พบสินค้า');
  var current = num(sh.getRange(row, 8).getValue());
  var change = num(delta);
  if (!isFinite(change) || change === 0) throw new Error('จำนวนปรับสต็อกไม่ถูกต้อง');
  var next = current + change;
  if (next < 0) throw new Error('สต็อกไม่พอ (' + current + ' ชิ้น)');
  sh.getRange(row, 8).setValue(next);
  sh.getRange(row, 12).setValue(nowIso());
  return { ok: true, stock: next };
}

function adjustStocks(adjustments) {
  if (!Array.isArray(adjustments) || !adjustments.length) throw new Error('ไม่มีรายการปรับสต็อก');
  if (adjustments.length > 500) throw new Error('ปรับสต็อกได้สูงสุด 500 รายการต่อครั้ง');

  var sh = sheet(SHEET_PRODUCTS, PRODUCT_HEADERS);
  var values = sh.getDataRange().getValues();
  var byId = {};
  for (var r = 1; r < values.length; r++) byId[String(values[r][0])] = r;

  var seen = {};
  var changes = [];
  adjustments.forEach(function (item) {
    var id = String(item && item.id || '');
    var delta = num(item && item.delta);
    if (!id || seen[id]) throw new Error('รายการปรับสต็อกซ้ำหรือไม่ถูกต้อง');
    if (!isFinite(delta) || delta === 0) throw new Error('จำนวนปรับสต็อกไม่ถูกต้อง');
    if (byId[id] === undefined) throw new Error('ไม่พบสินค้า: ' + id);
    var index = byId[id];
    var current = num(values[index][7]);
    var next = current + delta;
    if (next < 0) throw new Error('สต็อกไม่พอสำหรับ ' + String(values[index][2] || id) + ' (' + current + ' ชิ้น)');
    seen[id] = true;
    changes.push({ id: id, index: index, stock: next });
  });

  // Validate every item before the first write, then update both columns in two
  // batched writes. This replaces N API calls + N full refreshes in the old UI.
  var updated = nowIso();
  changes.forEach(function (change) {
    values[change.index][7] = change.stock;
    values[change.index][11] = updated;
  });
  var dataRows = values.slice(1);
  sh.getRange(2, 8, dataRows.length, 1).setValues(dataRows.map(function (row) { return [row[7]]; }));
  sh.getRange(2, 12, dataRows.length, 1).setValues(dataRows.map(function (row) { return [row[11]]; }));
  return {
    ok: true,
    stocks: changes.map(function (change) { return { id: change.id, stock: change.stock, updated: updated }; })
  };
}

function validateProduct(p) {
  if (isBlank(p.name)) throw new Error('ต้องระบุชื่อสินค้า');
  ['cost', 'sell', 'stock', 'minStock'].forEach(function (key) {
    if (p[key] !== undefined && num(p[key]) < 0) throw new Error('ค่า ' + key + ' ต้องไม่ติดลบ');
  });
}

/* ------------------------------------------------------------------ *
 *  Sales
 * ------------------------------------------------------------------ */

function createSale(sale) {
  if (!sale.items || !sale.items.length) throw new Error('ไม่มีสินค้าในรายการ');

  var pSheet = sheet(SHEET_PRODUCTS, PRODUCT_HEADERS);
  var products = tableToObjects(pSheet);
  var pRow = {}; // id -> row number
  products.forEach(function (o) { pRow[String(o.id)] = o; });

  // Validate + build items with authoritative prices
  var totalCost = 0, subtotal = 0;
  var items = sale.items.map(function (it) {
    var prod = pRow[String(it.id)];
    if (!prod) throw new Error('ไม่พบสินค้าบางรายการ');
    var qty = num(it.qty);
    if (qty <= 0) throw new Error('จำนวนไม่ถูกต้อง');
    var stock = num(prod.stock);
    if (qty > stock) throw new Error('สต็อกไม่พอ: ' + prod.name + ' (เหลือ ' + stock + ')');
    var line = {
      id: prod.id, name: prod.name, unit: prod.unit || '',
      qty: qty, cost: num(prod.cost), sell: num(prod.sell)
    };
    subtotal += line.sell * qty;
    totalCost += line.cost * qty;
    return line;
  });

  var discount = num(sale.discount);
  if (discount < 0 || discount > subtotal) throw new Error('ส่วนลดต้องอยู่ระหว่าง 0 ถึงยอดรวม');
  var total = Math.max(0, subtotal - discount);
  var profit = total - totalCost;
  var payment = sale.payment || 'cash';
  if (['cash', 'promptpay', 'card'].indexOf(payment) < 0) throw new Error('วิธีชำระเงินไม่ถูกต้อง');
  var cashReceived = num(sale.cashReceived);
  if (payment === 'cash' && cashReceived < total) throw new Error('จำนวนเงินที่รับมายังไม่ครบ');
  var change = payment === 'cash' && cashReceived > total ? cashReceived - total : 0;

  // Decrement stock
  items.forEach(function (it) {
    var row = findRowById(pSheet, it.id);
    var stock = num(pSheet.getRange(row, 8).getValue());
    pSheet.getRange(row, 8).setValue(stock - it.qty);
    pSheet.getRange(row, 12).setValue(nowIso());
  });
  SpreadsheetApp.flush();

  // Append sale row
  var sSheet = sheet(SHEET_SALES, SALE_HEADERS);
  var code = nextSaleCode(sSheet);
  var updated = nowIso();
  var saleRow = [
    uid('s'), code, updated, JSON.stringify(items),
    round2(subtotal), round2(discount), round2(total), round2(profit),
    payment, cashReceived ? round2(cashReceived) : '', round2(change), updated
  ];
  sSheet.appendRow(saleRow);

  return { ok: true, sale: { id: saleRow[0], code: code, date: saleRow[2], items: items, subtotal: round2(subtotal), discount: round2(discount), total: round2(total), profit: round2(profit), payment: payment, cashReceived: cashReceived, change: round2(change), updated: updated } };
}

function nextSaleCode(sh) {
  var d = new Date();
  var ymd = Utilities.formatDate(d, 'GMT+7', 'yyyyMMdd');
  var prefix = 'CH-' + ymd + '-';
  var last = 0;
  var values = sh.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    var code = String(values[r][1] || '');
    if (code.indexOf(prefix) === 0) {
      var n = parseInt(code.substring(prefix.length), 10) || 0;
      if (n > last) last = n;
    }
  }
  return prefix + String(last + 1).padStart(3, '0');
}

function deleteSale(id) {
  var sh = sheet(SHEET_SALES, SALE_HEADERS);
  var row = findRowById(sh, id);
  if (row < 0) throw new Error('ไม่พบรายการขาย');
  var items = [];
  try { items = JSON.parse(sh.getRange(row, 4).getValue() || '[]'); } catch (e) {}
  // restore stock
  if (items.length) {
    var pSheet = sheet(SHEET_PRODUCTS, PRODUCT_HEADERS);
    items.forEach(function (it) {
      var prow = findRowById(pSheet, it.id);
      if (prow > 0) {
        var stock = num(pSheet.getRange(prow, 8).getValue());
        pSheet.getRange(prow, 8).setValue(stock + num(it.qty));
        pSheet.getRange(prow, 12).setValue(nowIso());
      }
    });
    SpreadsheetApp.flush();
  }
  sh.deleteRow(row);
  addTombstone('sale', id);
  return { ok: true, id: id };
}

/* ------------------------------------------------------------------ *
 *  Purchases (bulk cost / ต้นทุนเหมาจ่าย)
 * ------------------------------------------------------------------ */

function buildPurchaseRow(p) {
  return [p.id, p.date || nowIso(), p.description || '', num(p.total), p.updated || nowIso()];
}

function createPurchase(p) {
  validatePurchase(p);
  var sh = sheet(SHEET_PURCHASES, PURCHASE_HEADERS);
  p.id = p.id || uid('b');
  p.date = p.date || nowIso();
  p.updated = p.updated || nowIso();
  sh.appendRow(buildPurchaseRow(p));
  return { ok: true, purchase: p };
}

function updatePurchase(p) {
  validatePurchase(p);
  var sh = sheet(SHEET_PURCHASES, PURCHASE_HEADERS);
  var row = findRowById(sh, p.id);
  if (row < 0) throw new Error('ไม่พบรายการซื้อ');
  var existing = tableToObjects(sh).find(function (o) { return String(o.id) === String(p.id); });
  var merged = {};
  PURCHASE_HEADERS.forEach(function (h) { merged[h] = (p[h] !== undefined) ? p[h] : existing[h]; });
  merged.id = existing.id;
  merged.updated = nowIso();
  sh.getRange(row, 1, 1, PURCHASE_HEADERS.length).setValues([buildPurchaseRow(merged)]);
  return { ok: true, purchase: merged };
}

function validatePurchase(p) {
  if (p.total !== undefined && num(p.total) < 0) throw new Error('ต้นทุนต้องไม่ติดลบ');
  if (p.date && isNaN(new Date(p.date).getTime())) throw new Error('วันที่ไม่ถูกต้อง');
}

function deletePurchase(id) {
  var sh = sheet(SHEET_PURCHASES, PURCHASE_HEADERS);
  var row = findRowById(sh, id);
  if (row < 0) throw new Error('ไม่พบรายการซื้อ');
  sh.deleteRow(row);
  addTombstone('purchase', id);
  return { ok: true, id: id };
}

/* ------------------------------------------------------------------ *
 *  Categories
 * ------------------------------------------------------------------ */

function createCategory(name) {
  if (isBlank(name)) throw new Error('ต้องระบุชื่อหมวดหมู่');
  name = String(name).trim();
  var sh = sheet(SHEET_CATEGORIES, CATEGORY_HEADERS);
  var values = sh.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim() === name) return { ok: true, name: name, dup: true };
  }
  sh.appendRow([name]);
  return { ok: true, name: name };
}

function deleteCategory(name) {
  var sh = sheet(SHEET_CATEGORIES, CATEGORY_HEADERS);
  var values = sh.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim() === String(name)) { sh.deleteRow(r + 1); break; }
  }
  return { ok: true, name: name };
}

/* ------------------------------------------------------------------ *
 *  Settings
 * ------------------------------------------------------------------ */

function getSettings() {
  var sh = sheet(SHEET_SETTINGS, SETTING_HEADERS);
  var out = {};
  tableToObjects(sh).forEach(function (r) { out[r.key] = r.value; });
  return out;
}

function setPublicSetting(key, value) {
  var allowed = ['storeName', 'theme', 'themeColor', 'dark', 'passcode'];
  if (allowed.indexOf(String(key)) < 0) throw appError('INVALID_SETTING', 'ไม่อนุญาตให้แก้ไขการตั้งค่านี้');
  if (key === 'passcode' && !/^\d{4}$/.test(String(value || ''))) {
    throw new Error('รหัสผ่านต้องเป็นตัวเลข 4 หลัก');
  }
  if (key === 'storeName' && (isBlank(value) || String(value).length > 100)) {
    throw new Error('ชื่อร้านต้องมี 1-100 ตัวอักษร');
  }
  if (key === 'themeColor' && !/^#[0-9a-f]{6}$/i.test(String(value || ''))) {
    throw new Error('รหัสสีธีมไม่ถูกต้อง');
  }
  if (key === 'passcode') {
    storePinHash(String(value), TEST_MODE ? 'TEST_PIN_HASH' : 'PIN_HASH');
    removeSetting('passcode');
    return { ok: true, key: key };
  }
  return setSetting(key, value);
}

function setSetting(key, value) {
  var sh = sheet(SHEET_SETTINGS, SETTING_HEADERS);
  var values = sh.getDataRange().getValues();
  var found = false;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]) === String(key)) {
      sh.getRange(r + 1, 2).setValue(value);
      found = true;
    }
  }
  if (!found) sh.appendRow([key, value]);
  return { ok: true, key: key, value: value };
}

function removeSetting(key) {
  var sh = sheet(SHEET_SETTINGS, SETTING_HEADERS);
  var values = sh.getDataRange().getValues();
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][0]) === String(key)) sh.deleteRow(r + 1);
  }
}

/* ------------------------------------------------------------------ *
 *  Drive images
 * ------------------------------------------------------------------ */

function ensureImageFolder() {
  // Test mode always uses its own folder so test uploads never land in the
  // real store's image collection (even though settings were cloned from it).
  var folderName = TEST_MODE ? FOLDER_NAME + ' (TEST)' : FOLDER_NAME;
  var cfg = getSettings();
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    var folder = folders.next();
    if (!TEST_MODE) setSetting('imgFolderId', folder.getId());
    return folder;
  }
  if (!TEST_MODE && cfg.imgFolderId) {
    try { return DriveApp.getFolderById(cfg.imgFolderId); } catch (e) {}
  }
  var created = DriveApp.createFolder(folderName);
  setSetting('imgFolderId', created.getId());
  tryShareFolder(created);
  return created;
}

function tryShareFolder(folder) {
  try {
    if (typeof Drive !== 'undefined' && Drive.Files) {
      Drive.Files.update({ 'writersCanShare': false }, folder.getId(), null, { 'addParents': folder.getId(), 'supportsAllDrives': true });
      // update sharing with anyone-with-link (view)
      var body = {
        role: 'reader',
        type: 'anyone',
        allowFileDiscovery: false
      };
      Drive.Permissions.insert(body, folder.getId());
    }
  } catch (e) {
    Logger.log('share folder failed: %s', e.message);
  }
}

function uploadImage(b64, filename) {
  if (isBlank(b64)) throw new Error('ไม่มีข้อมูลรูปภาพ');
  var raw = String(b64);
  var mimeMatch = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,/i);
  if (!mimeMatch) throw new Error('รองรับเฉพาะรูป JPEG, PNG หรือ WebP');
  var mime = mimeMatch[1].toLowerCase();
  var payload = raw.split(',')[1] || '';
  if (payload.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 16) throw new Error('รูปภาพมีขนาดใหญ่เกิน 5 MB');
  var folder = ensureImageFolder();
  var name = String(filename || 'img_' + uid('i') + '.jpg').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  var bytes = Utilities.base64Decode(payload);
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('รูปภาพมีขนาดใหญ่เกิน 5 MB');
  var blob = Utilities.newBlob(bytes, mime, name);
  var file = folder.createFile(blob);
  var id = file.getId();
  shareFilePublic(file);
  var cfg = getSettings();
  // delete old image if re-uploading to same product is handled on the client; here we just return id
  return { ok: true, imgId: id };
}

// New files created via createFile() do NOT inherit the folder's sharing.
// Without "anyone with link" the Drive thumbnail URL redirects to a sign-in
// page for visitors who aren't logged into the owning Google account (i.e.
// the shop phone). Share every uploaded image publicly so thumbnails load.
function shareFilePublic(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log('share file %s failed: %s', file.getName(), e.message);
  }
}

// One-off repair: re-share every image already in the folder so old products
// show thumbnails on phones too. Trigger: action=image:repairShare
function repairImageSharing() {
  var folder = ensureImageFolder();
  var it = folder.getFiles();
  var shared = 0, failed = 0;
  while (it.hasNext()) {
    var f = it.next();
    try {
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      shared++;
    } catch (e) {
      failed++;
      Logger.log('repair share %s failed: %s', f.getName(), e.message);
    }
  }
  return { ok: true, shared: shared, failed: failed };
}

function deleteImage(id) {
  if (!id) return { ok: true };
  try {
    var file = DriveApp.getFileById(String(id));
    file.setTrashed(true);
  } catch (e) {
    Logger.log('delete image %s failed: %s', id, e.message);
  }
  return { ok: true, id: id };
}

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */

function num(v) {
  var n = parseFloat(String(v === undefined || v === null ? 0 : v).replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function round2(n) {
  return Math.round((num(n) + Number.EPSILON) * 100) / 100;
}

function jsonOk(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function jsonErr(msg, code) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, code: code || 'API_ERROR', error: msg })).setMimeType(ContentService.MimeType.JSON);
}
