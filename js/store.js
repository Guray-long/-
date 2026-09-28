/* ChowHuay Pro — local state store (cached, derived queries) */
(function (global) {
  'use strict';

  const S = {
    products: [],      // {id,barcode,name,category,unit,cost,sell,stock,minStock,imgId,created,updated}
    sales: [],         // {id,code,date,items(json),subtotal,discount,total,profit,payment,cashReceived,change}
    purchases: [],     // {id,date,description,total}
    categories: [],
    settings: {},
    syncedAt: null,
    loaded: false
  };

  function persist() {
    if (S.settings && Object.prototype.hasOwnProperty.call(S.settings, 'passcode')) delete S.settings.passcode;
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
        products: S.products, sales: S.sales, purchases: S.purchases,
        categories: S.categories, settings: S.settings, syncedAt: S.syncedAt
      }));
    } catch (e) { /* quota — ignore */ }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      S.products = d.products || [];
      S.sales = d.sales || [];
      S.purchases = d.purchases || [];
      S.categories = d.categories || [];
      S.settings = d.settings || {};
      if (Object.prototype.hasOwnProperty.call(S.settings, 'passcode')) {
        delete S.settings.passcode;
        persist();
      }
      S.syncedAt = d.syncedAt || null;
    } catch (e) { /* corrupted cache — ignore */ }
  }

  function mergeDelta(current, incoming, deleted) {
    const map = {};
    current.forEach((r) => { map[String(r.id)] = r; });
    (incoming || []).forEach((r) => { map[String(r.id)] = r; });
    (deleted || []).forEach((id) => { delete map[String(id)]; });
    return Object.keys(map).map((k) => map[k]);
  }

  function applySnapshot(data, delta) {
    if (delta) {
      S.sales = mergeDelta(S.sales, data.sales, data.deletedSales);
      S.purchases = mergeDelta(S.purchases, data.purchases, data.deletedPurchases);
    } else {
      S.sales = data.sales || [];
      S.purchases = data.purchases || [];
    }
    S.products = data.products || [];
    S.categories = data.categories || [];
    S.settings = data.settings || {};
    S.syncedAt = data.syncedAt || new Date().toISOString();
    S.loaded = true;
    persist();
  }

  function refresh() {
    const since = S.syncedAt || null;
    return Api.loadAll(since).then((data) => {
      applySnapshot(data, !!since);
      return S;
    });
  }

  // ---- derived helpers ----
  function products() {
    return S.products.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));
  }

  function productById(id) {
    return S.products.find((p) => String(p.id) === String(id));
  }

  function byBarcode(code) {
    if (!code) return null;
    const c = String(code).trim();
    return S.products.find((p) => String(p.barcode || '').trim() === c);
  }

  function parseItems(sale) {
    try { return JSON.parse(sale.items || '[]'); } catch (e) { return []; }
  }

  function inRange(date, from, to) {
    if (!date) return false;
    const t = new Date(date).getTime();
    if (isNaN(t)) return false;
    const fromD = from ? new Date(from) : null;
    if (fromD && !isNaN(fromD.getTime()) && t < fromD.getTime()) return false;
    if (to) {
      const end = new Date(to); end.setHours(23, 59, 59, 999);
      if (!isNaN(end.getTime()) && t > end.getTime()) return false;
    }
    return true;
  }

  // [{date: Date, revenue, expense, profit}]
  function summaryByRange(from, to) {
    let revenue = 0, expense = 0, profit = 0, count = 0;
    S.sales.forEach((s) => {
      if (!inRange(s.date, from, to)) return;
      revenue += U.num(s.total);
      profit += U.num(s.profit);
      count++;
    });
    S.purchases.forEach((p) => {
      if (!inRange(p.date, from, to)) return;
      expense += U.num(p.total);
    });
    return { revenue: U.round2(revenue), expense: U.round2(expense), profit: U.round2(profit), count };
  }

  // best sellers within range: flatten sale items
  function bestSellers(from, to, limit) {
    const map = {};
    S.sales.forEach((s) => {
      if (!inRange(s.date, from, to)) return;
      parseItems(s).forEach((it) => {
        const key = String(it.id);
        if (!map[key]) map[key] = { id: it.id, name: it.name, qty: 0, revenue: 0, profit: 0 };
        map[key].qty += U.num(it.qty);
        map[key].revenue += U.num(it.sell) * U.num(it.qty);
        map[key].profit += (U.num(it.sell) - U.num(it.cost)) * U.num(it.qty);
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, limit || 5);
  }

  // slow moving: products with stock>0 but no sales in N days
  function slowMoving(days, limit) {
    const since = new Date();
    since.setDate(since.getDate() - (days || 30));
    const soldIds = new Set();
    S.sales.forEach((s) => {
      if (!inRange(s.date, since, null)) return;
      parseItems(s).forEach((it) => soldIds.add(String(it.id)));
    });
    return S.products
      .filter((p) => U.num(p.stock) > 0 && !soldIds.has(String(p.id)))
      .sort((a, b) => U.num(b.stock) - U.num(a.stock))
      .slice(0, limit || 10);
  }

  function lowStock() {
    return S.products
      .filter((p) => U.num(p.stock) <= U.num(p.minStock))
      .sort((a, b) => U.num(a.stock) - U.num(b.stock));
  }

  function outOfStock() {
    return S.products.filter((p) => U.num(p.stock) <= 0);
  }

  // weekly buckets (Mon..Sun) of the current week
  function weeklySales() {
    const start = U.startOfWeek();
    const buckets = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      buckets.push({ date: d, revenue: 0, profit: 0, count: 0, label: d.toLocaleDateString('th-TH', { weekday: 'short' }) });
    }
    S.sales.forEach((s) => {
      const t = new Date(s.date); if (isNaN(t)) return;
      const day = (t.getDay() + 6) % 7;
      const bucket = buckets[day];
      if (!bucket) return;
      if (t.getFullYear() === bucket.date.getFullYear() && t.getMonth() === bucket.date.getMonth() && t.getDate() === bucket.date.getDate()) {
        bucket.revenue += U.num(s.total);
        bucket.profit += U.num(s.profit);
        bucket.count++;
      }
    });
    return buckets.map((b) => ({ label: b.label, revenue: U.round2(b.revenue), profit: U.round2(b.profit), count: b.count }));
  }

  function recentSales(limit) {
    return S.sales.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, limit || 10);
  }

  global.Store = {
    state: S, products, productById, byBarcode, parseItems, inRange,
    summaryByRange, bestSellers, slowMoving, lowStock, outOfStock, weeklySales,
    recentSales, persist, loadCache, applySnapshot, refresh
  };
})(window);
