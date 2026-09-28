/* ChowHuay Pro — Reports view (summary + export Excel/PDF) */
(function (global) {
  'use strict';

  let range = 'today'; // today | week | month | all | custom
  let customFrom = '';
  let customTo = '';
  let exportReady = false;

  function dateRange() {
    const now = new Date();
    let from = null, to = null;
    if (range === 'today') { from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
    else if (range === 'week') { from = U.startOfWeek(); }
    else if (range === 'month') { from = U.startOfMonth(); }
    else if (range === 'custom') {
      if (customFrom) from = new Date(customFrom + 'T00:00:00');
      if (customTo) to = new Date(customTo + 'T23:59:59');
    }
    return { from, to };
  }

  function render(container) {
    const { from, to } = dateRange();
    const sum = Store.summaryByRange(from, to);
    const sales = Store.state.sales
      .filter((s) => Store.inRange(s.date, from, to))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const purchases = Store.state.purchases
      .filter((p) => Store.inRange(p.date, from, to))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const margin = sum.revenue > 0 ? (sum.profit / sum.revenue) * 100 : 0;

    // merge transactions
    const tx = [];
    sales.forEach((s) => tx.push({ kind: 'sale', date: s.date, id: s.id, code: s.code, label: txLabel(s), detail: s.items, amount: s.total, profit: s.profit, type: 'รายรับ', sale: s }));
    purchases.forEach((p) => tx.push({ kind: 'purchase', date: p.date, id: p.id, code: '', label: p.description || '(ทุนรวม)', detail: '', amount: p.total, type: 'รายจ่าย', sale: null }));
    tx.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
        <div>
          <h1 class="h2">รายงานยอดขาย</h1>
          <p class="caption">สรุปผลประกอบการและประวัติการขาย</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="r-pdf">${UI.icon('description')} ส่งออก PDF</button>
          <button class="btn btn-tonal btn-sm" id="r-excel">${UI.icon('table')} ส่งออก Excel</button>
        </div>
      </div>

      <div class="segmented mb" id="r-range" style="max-width:100%;">
        <button class="${range === 'today' ? 'active' : ''}" data-range="today">วันนี้</button>
        <button class="${range === 'week' ? 'active' : ''}" data-range="week">สัปดาห์นี้</button>
        <button class="${range === 'month' ? 'active' : ''}" data-range="month">เดือนนี้</button>
        <button class="${range === 'all' ? 'active' : ''}" data-range="all">ทั้งหมด</button>
        <button class="${range === 'custom' ? 'active' : ''}" data-range="custom">กำหนดเอง</button>
      </div>
      <div id="r-custom" class="${range === 'custom' ? '' : 'hidden'}" style="display:${range === 'custom' ? 'flex' : 'none'};gap:8px;margin-bottom:16px;">
        <input class="input grow" id="r-from" type="date" value="${customFrom}">
        <span class="caption" style="align-self:center;">ถึง</span>
        <input class="input grow" id="r-to" type="date" value="${customTo}">
      </div>

      <div class="grid-3 mb">
        <div class="card card-body stat-card">
          <div style="position:absolute;top:16px;right:16px;width:44px;height:44px;border-radius:50%;background:var(--secondary-container);display:flex;align-items:center;justify-content:center;color:var(--on-secondary-container);">${UI.icon('trending_up')}</div>
          <div class="caption">รายรับรวม</div>
          <div class="stat-value text-primary">${U.fmtMoney(sum.revenue)}</div>
          <div class="caption">${U.fmtInt(sum.count)} บิล</div>
        </div>
        <div class="card card-body stat-card">
          <div style="position:absolute;top:16px;right:16px;width:44px;height:44px;border-radius:50%;background:var(--error-container);display:flex;align-items:center;justify-content:center;color:var(--error);">${UI.icon('trending_down')}</div>
          <div class="caption">รายจ่าย / ต้นทุนรวม</div>
          <div class="stat-value">${U.fmtMoney(sum.expense)}</div>
          <div class="caption">${U.fmtInt(purchases.length)} รายการซื้อ</div>
        </div>
        <div class="card card-body stat-card" style="background:var(--primary);color:var(--on-primary);border:none;">
          <div style="position:absolute;top:16px;right:16px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;">${UI.icon('account_balance_wallet')}</div>
          <div class="caption" style="color:rgba(255,255,255,0.8);">กำไรสุทธิ</div>
          <div class="stat-value">${U.fmtMoney(sum.profit)}</div>
          <div class="caption" style="color:rgba(255,255,255,0.8);">อัตรากำไร ${margin.toFixed(1)}%</div>
        </div>
      </div>

      <div class="card mb">
        <div class="card-body" style="padding-bottom:8px;"><h3 class="h3">สินค้าขายดี</h3></div>
        ${renderBestTable(from, to)}
      </div>

      <div class="card">
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;padding-bottom:8px;">
          <h3 class="h3">รายการล่าสุด</h3>
          <span class="caption">${tx.length} รายการ</span>
        </div>
        ${tx.length ? `
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>วัน/เวลา</th><th>รายการ</th><th style="text-align:right;">จำนวนเงิน</th><th>ประเภท</th><th></th></tr></thead>
              <tbody>${tx.map((t) => txRow(t)).join('')}</tbody>
            </table>
          </div>
        ` : '<div class="empty-state"><span class="material-symbols-outlined" aria-hidden="true">receipt_long</span><p>ไม่มีรายการในช่วงนี้</p></div>'}
      </div>
      <div style="height:16px;"></div>
    `;

    container.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
      range = b.dataset.range;
      if (range === 'custom') {
        if (!customFrom) customFrom = U.todayStr();
        if (!customTo) customTo = U.todayStr();
      }
      render(container);
    }));
    const rf = container.querySelector('#r-from'), rt = container.querySelector('#r-to');
    if (rf) rf.addEventListener('change', () => { customFrom = rf.value; render(container); });
    if (rt) rt.addEventListener('change', () => { customTo = rt.value; render(container); });
    container.querySelector('#r-excel').addEventListener('click', exportExcel);
    container.querySelector('#r-pdf').addEventListener('click', () => exportPdf(container));
    wireTxEvents(container);
  }

  function txLabel(s) {
    const items = Store.parseItems(s);
    if (!items.length) return s.code;
    const names = items.slice(0, 3).map((i) => i.name);
    return (names.join(', ') + (items.length > 3 ? ' และอื่นๆ' : ''));
  }

  function txRow(t) {
    const detailBtn = t.kind === 'sale'
      ? `<button class="btn-icon" data-sview="${U.esc(t.sale.id)}" aria-label="ดูรายละเอียดการขาย">${UI.icon('visibility')}</button>
         <button class="btn-icon" data-sdel="${U.esc(t.sale.id)}" aria-label="ลบรายการขาย">${UI.icon('delete', 'text-error')}</button>`
      : `<button class="btn-icon" data-pedit="${U.esc(t.id)}" aria-label="แก้ไขรายการต้นทุน">${UI.icon('edit')}</button>
         <button class="btn-icon" data-pdel="${U.esc(t.id)}" aria-label="ลบรายการต้นทุน">${UI.icon('delete', 'text-error')}</button>`;
    return `
      <tr>
        <td style="white-space:nowrap;">${U.fmtDate(t.date)}<br><span class="caption">${U.fmtTime(t.date)}</span></td>
        <td><div class="title truncate" style="max-width:320px;">${U.esc(t.label)}</div>${t.kind === 'sale' ? '<span class="caption">' + U.esc(t.code) + '</span>' : ''}</td>
        <td style="text-align:right;font-weight:700;white-space:nowrap;color:${t.kind === 'sale' ? 'var(--primary)' : 'inherit'};">${U.fmtMoney(t.amount)}</td>
        <td>${t.kind === 'sale' ? UI.badge('success', 'รายรับ') : UI.badge('warning', 'รายจ่าย')}</td>
        <td><div class="flex gap-sm" style="justify-content:flex-end;">${detailBtn}</div></td>
      </tr>`;
  }

  function renderBestTable(from, to) {
    const best = Store.bestSellers(from, to, 10);
    if (!best.length) return '<div class="empty-state"><span class="material-symbols-outlined" aria-hidden="true">emoji_events</span><p>ยังไม่มีข้อมูลขาย</p></div>';
    return `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>#</th><th>สินค้า</th><th style="text-align:right;">จำนวน</th><th style="text-align:right;">รายได้</th><th style="text-align:right;">กำไร</th></tr></thead>
          <tbody>${best.map((b, i) => `
            <tr>
              <td class="label">${i + 1}</td>
              <td class="title">${U.esc(b.name)}</td>
              <td style="text-align:right;">${U.fmtInt(b.qty)}</td>
              <td style="text-align:right;">${U.fmtMoney(b.revenue)}</td>
              <td style="text-align:right;color:var(--secondary);">${U.fmtMoney(b.profit)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function wireTxEvents(container) {
    container.addEventListener('click', (e) => {
      const sdel = e.target.closest('[data-sdel]');
      if (sdel) {
        UI.confirmDialog('ลบรายการขาย', 'ลบบิลนี้? สต็อกสินค้าจะถูกคืนกลับอัตโนมัติ', async () => {
          try { await Api.sale.remove(sdel.dataset.sdel); await Store.refresh(); UI.toast('ลบรายการขายแล้ว'); render(container); }
          catch (err) { UI.toast(err.message, 'error'); }
        });
        return;
      }
      const sview = e.target.closest('[data-sview]');
      if (sview) { viewSaleDetail(sview.dataset.sview); return; }
      const pdel = e.target.closest('[data-pdel]');
      if (pdel) {
        UI.confirmDialog('ลบรายการทุน', 'ลบรายการทุนรวมนี้?', async () => {
          try { await Api.purchase.remove(pdel.dataset.pdel); await Store.refresh(); UI.toast('ลบแล้ว'); render(container); }
          catch (err) { UI.toast(err.message, 'error'); }
        });
        return;
      }
      const pedit = e.target.closest('[data-pedit]');
      if (pedit) { editPurchase(pedit.dataset.pedit, container); }
    });
  }

  function viewSaleDetail(id) {
    const s = Store.state.sales.find((x) => String(x.id) === String(id));
    if (!s) return;
    const items = Store.parseItems(s);
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="mb"><div class="h3">${U.esc(s.code)}</div><div class="caption">${U.fmtDateTime(s.date)}</div></div>
      <div class="list mb">
        ${items.map((it) => `<div class="list-row"><div style="flex:1;"><div class="label">${U.esc(it.name)}</div><div class="caption">${it.qty} × ${U.fmtMoney(it.sell)}</div></div><div class="label">${U.fmtMoney(it.qty * it.sell)}</div></div>`).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span class="caption">รวม</span><span class="label">${U.fmtMoney(U.num(s.subtotal))}</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span class="caption">ส่วนลด</span><span class="label">-${U.fmtMoney(U.num(s.discount))}</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span class="h3">ยอดสุทธิ</span><span class="price text-primary">${U.fmtMoney(U.num(s.total))}</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span class="caption">กำไรบิลนี้</span><span class="label text-secondary">${U.fmtMoney(U.num(s.profit))}</span></div>
    `;
    UI.openModal({ title: 'รายละเอียดบิล', body, foot: [UI.modalBtn('ปิด', 'btn-ghost', () => UI.closeModal())] });
  }

  function editPurchase(id, container) {
    const p = Store.state.purchases.find((x) => String(x.id) === String(id));
    if (!p) return;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="field"><label>วันที่</label><input class="input" id="pe-date" type="date" value="${String(p.date).slice(0, 10)}"></div>
      <div class="field"><label>รายละเอียด</label><textarea class="textarea" id="pe-desc">${U.esc(p.description || '')}</textarea></div>
      <div class="field"><label>ราคาทุนทั้งหมด (บาท)</label><input class="input" id="pe-total" type="number" min="0" step="0.01" value="${p.total}"></div>
    `;
    const saveBtn = UI.modalBtn('บันทึก', 'btn-secondary btn-block btn-lg', async () => {
      try {
        await Api.purchase.update({ id: p.id, date: new Date(body.querySelector('#pe-date').value).toISOString(), description: body.querySelector('#pe-desc').value.trim(), total: U.num(body.querySelector('#pe-total').value) });
        await Store.refresh(); UI.closeModal(); UI.toast('อัปเดตแล้ว'); render(container);
      } catch (err) { UI.toast(err.message, 'error'); }
    });
    UI.openModal({ title: 'แก้ไขทุนรวม', body, foot: [saveBtn] });
  }

  // ---- export ----
  function ensureXLSX() {
    return new Promise((resolve, reject) => {
      if (window.XLSX) return resolve();
      const s = document.createElement('script');
      s.src = 'vendor/xlsx.full.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('โหลดไลบรารี Excel ไม่สำเร็จ'));
      document.head.appendChild(s);
    });
  }

  async function exportExcel() {
    try {
      await ensureXLSX();
    } catch (err) {
      UI.toast(err.message, 'error');
      return;
    }
    const { from, to } = dateRange();
    const sum = Store.summaryByRange(from, to);
    const sales = Store.state.sales.filter((s) => Store.inRange(s.date, from, to));
    const purchases = Store.state.purchases.filter((p) => Store.inRange(p.date, from, to));

    const pad = (n) => String(n).padStart(2, '0');
    const fmtDateTh = (iso) => {
      const d = new Date(iso); if (isNaN(d)) return '';
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    };
    const num2 = (n) => U.round2(n);

    const wb = XLSX.utils.book_new();
    const rowsSales = [
      ['รหัสบิล', 'วันที่', 'รายการสินค้า', 'ยอดรวม', 'ส่วนลด', 'สุทธิ', 'กำไร', 'ชำระ'],
      ...sales.map((s) => {
        const items = Store.parseItems(s).map((i) => i.name + ' x' + i.qty).join(', ');
        return [s.code, fmtDateTh(s.date), items, num2(s.subtotal), num2(s.discount), num2(s.total), num2(s.profit), s.payment];
      })
    ];
    const wsSales = XLSX.utils.aoa_to_sheet(rowsSales);
    XLSX.utils.book_append_sheet(wb, wsSales, 'การขาย');

    const wsPurchases = XLSX.utils.aoa_to_sheet([
      ['วันที่', 'รายละเอียด', 'ยอด'],
      ...purchases.map((p) => [fmtDateTh(p.date), p.description || '', num2(p.total)])
    ]);
    XLSX.utils.book_append_sheet(wb, wsPurchases, 'ทุนรวม');

    const wsProducts = XLSX.utils.aoa_to_sheet([
      ['บาร์โค้ด', 'ชื่อสินค้า', 'หมวดหมู่', 'หน่วย', 'ต้นทุน', 'ราคาขาย', 'สต็อก', 'สต็อกขั้นต่ำ'],
      ...Store.state.products.map((p) => [p.barcode, p.name, p.category, p.unit, num2(p.cost), num2(p.sell), num2(p.stock), num2(p.minStock)])
    ]);
    XLSX.utils.book_append_sheet(wb, wsProducts, 'สินค้า');

    const wsSummary = XLSX.utils.aoa_to_sheet([
      ['รายงานยอดขาย — ' + new Date().toLocaleString('th-TH')],
      ['รายรับรวม', sum.revenue],
      ['รายจ่าย/ต้นทุน', sum.expense],
      ['กำไรสุทธิ', sum.profit],
      ['จำนวนบิล', sum.count]
    ]);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุป');

    const rangeLabel = (from ? fmtDateTh(from).slice(0, 10) : 'เริ่ม') + '_ถึง_' + (to ? fmtDateTh(to).slice(0, 10) : 'ปัจจุบัน');
    XLSX.writeFile(wb, 'ChowHuay_รายงาน_' + rangeLabel + '.xlsx');
    UI.toast('ส่งออก Excel แล้ว');
  }

  function exportPdf(container) {
    const { from, to } = dateRange();
    const sum = Store.summaryByRange(from, to);
    const cfg = Store.state.settings;
    const tx = [];
    Store.state.sales.filter((s) => Store.inRange(s.date, from, to)).forEach((s) => tx.push({ kind: 'sale', date: s.date, code: s.code, label: txLabel(s), amount: s.total }));
    Store.state.purchases.filter((p) => Store.inRange(p.date, from, to)).forEach((p) => tx.push({ kind: 'purchase', date: p.date, code: '', label: p.description || '(ทุนรวม)', amount: p.total }));
    tx.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    U.printHTML(`<html><head><meta charset="utf-8"><title>รายงาน ChowHuay Pro</title>
      <style>
        body{font-family:system-ui,-apple-system,sans-serif;color:#0b1c30;padding:32px;font-size:13px;}
        h1{font-size:22px;margin:0 0 4px;} h2{font-size:15px;margin:18px 0 8px;color:#003d9b;}
        table{width:100%;border-collapse:collapse;margin-top:6px;}
        th{text-align:left;background:#e5eeff;padding:7px 8px;font-size:12px;}
        td{padding:7px 8px;border-bottom:1px solid #ddd;}
        .r{text-align:right;} .sum{font-size:14px;margin:4px 0;}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #003d9b;padding-bottom:12px;}
        .cards{display:flex;gap:12px;margin:14px 0;}
        .card{flex:1;border:1px solid #ddd;border-radius:10px;padding:10px 14px;}
        .card b{font-size:18px;} .muted{color:#666;font-size:11px;}
        @media print { body{padding:0;} .no-print{display:none;} }
      </style></head><body>
      <div class="head">
        <div><h1>${cfg.storeName || 'ร้านโชว์ห่วยของฉัน'}</h1>
        <div class="muted">รายงานยอดขาย · ${new Date().toLocaleString('th-TH')}</div></div>
        <div class="muted">ช่วง: ${from ? U.fmtDate(from.toISOString()) : 'เริ่มแรก'} ถึง ${to ? U.fmtDate(to.toISOString()) : 'ปัจจุบัน'}</div>
      </div>
      <div class="cards">
        <div class="card"><div class="muted">รายรับรวม</div><b>${U.fmtMoney(sum.revenue)}</b></div>
        <div class="card"><div class="muted">รายจ่าย/ต้นทุน</div><b>${U.fmtMoney(sum.expense)}</b></div>
        <div class="card"><div class="muted">กำไรสุทธิ</div><b>${U.fmtMoney(sum.profit)}</b></div>
        <div class="card"><div class="muted">จำนวนบิล</div><b>${sum.count}</b></div>
      </div>
      <h2>รายการทั้งหมด (${tx.length})</h2>
      <table>
        <tr><th>วันที่</th><th>รายการ</th><th class="r">จำนวนเงิน</th><th>ประเภท</th></tr>
        ${tx.map((t) => `<tr><td>${U.fmtDateTime(t.date)}</td><td>${U.esc(t.label)}${t.code ? ' <span style="color:#888">(' + U.esc(t.code) + ')</span>' : ''}</td><td class="r">${U.fmtMoney(t.amount)}</td><td>${t.kind === 'sale' ? 'รายรับ' : 'รายจ่าย'}</td></tr>`).join('')}
      </table>
      <div style="margin-top:24px;text-align:center;color:#999;font-size:11px;">จัดทำโดย ChowHuay Pro</div>
      </body></html>`);
  }

  global.ViewReports = { render };
})(window);
