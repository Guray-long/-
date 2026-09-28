/* ChowHuay Pro — Dashboard view */
(function (global) {
  'use strict';

  let chart = null;
  let chartReady = false;

  function ensureChart() {
    return new Promise((resolve) => {
      if (chartReady) return resolve();
      const s = document.createElement('script');
      s.src = 'vendor/chart.umd.min.js';
      s.onload = () => { chartReady = true; resolve(); };
      document.head.appendChild(s);
    });
  }

  function render(container) {
    const state = Store.state;
    const today = new Date();
    const fromToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const sum = Store.summaryByRange(fromToday, null);
    const prevSum = Store.summaryByRange(new Date(fromToday.getTime() - 86400000), new Date(fromToday.getTime() - 1));
    const week = Store.weeklySales();
    const best = Store.bestSellers(fromToday, null, 5);
    const low = Store.lowStock().slice(0, 6);
    const slow = Store.slowMoving(30, 6);
    const todayUnits = state.sales.reduce((acc, s) => {
      if (!U.sameDay(s.date)) return acc;
      return acc + Store.parseItems(s).reduce((a, it) => a + U.num(it.qty), 0);
    }, 0);

    const revenueDelta = prevSum.revenue > 0 ? Math.round(((sum.revenue - prevSum.revenue) / prevSum.revenue) * 100) : 0;
    const profitDelta = prevSum.profit > 0 ? Math.round(((sum.profit - prevSum.profit) / prevSum.profit) * 100) : 0;

    const bestHtml = best.length
      ? best.map((b, i) => `
        <div class="card card-body" style="display:flex;flex-direction:column;gap:6px;position:relative;overflow:hidden;">
          <span class="badge badge-${i === 0 ? 'success' : 'info'}" style="position:absolute;top:12px;right:12px;font-size:11px;">#${i + 1}</span>
          <div class="title truncate">${U.esc(b.name)}</div>
          <div class="caption">ขาย ${U.fmtInt(b.qty)} ชิ้น · รายได้ ${U.fmtMoney(b.revenue)}</div>
          <div class="price-sm text-primary">${U.fmtMoney(b.revenue)}</div>
        </div>`).join('')
      : '<div class="empty-state col-span-2"><span class="material-symbols-outlined" aria-hidden="true">shopping_bag</span><p>ยังไม่มีรายการขายวันนี้</p></div>';

    const lowHtml = low.length
      ? low.map((p) => `
        <div class="list-row">
          <div style="width:40px;height:40px;border-radius:8px;background:var(--surface-variant);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${UI.icon('inventory_2', 'text-muted')}</div>
          <div style="flex:1;min-width:0;">
            <div class="title truncate">${U.esc(p.name)}</div>
            <div class="caption text-error">เหลือ ${U.fmtInt(p.stock)} ${U.esc(p.unit || 'ชิ้น')}</div>
          </div>
          <button class="btn btn-primary btn-sm" data-act="restock" data-id="${U.esc(p.id)}">เติมสต็อก</button>
        </div>`).join('')
      : '<div class="empty-state"><span class="material-symbols-outlined" aria-hidden="true">verified</span><p>สต็อกครบ ไม่มีของใกล้หมด</p></div>';

    const slowHtml = slow.length
      ? slow.map((p) => `
        <div class="list-row">
          <div style="width:40px;height:40px;border-radius:8px;background:var(--surface-variant);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${UI.icon('hourglass_empty', 'text-muted')}</div>
          <div style="flex:1;min-width:0;">
            <div class="title truncate">${U.esc(p.name)}</div>
            <div class="caption">ค้างสต็อก ${U.fmtInt(p.stock)} ${U.esc(p.unit || 'ชิ้น')} · 30 วัน</div>
          </div>
          <button class="btn btn-outline btn-sm" data-route="inventory">ดูในสต็อก</button>
        </div>`).join('')
      : '<div class="empty-state"><span class="material-symbols-outlined" aria-hidden="true">task_alt</span><p>สินค้าทั้งหมดเคลื่อนไหวปกติ</p></div>';

    container.innerHTML = `
      <div class="dashboard-head mb">
        <div><h1 class="h2">ภาพรวมวันนี้</h1><p class="caption">${today.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
        <button class="btn btn-primary" data-route="pos">${UI.icon('point_of_sale')} เริ่มขาย</button>
      </div>
      <!-- Stats -->
      <div class="grid-2 mb">
        <div class="card card-body stat-card">
          ${UI.icon('payments', 'stat-icon')}
          <div class="caption">ยอดขายวันนี้</div>
          <div class="stat-value text-primary">${U.fmtMoney(sum.revenue)}</div>
          <span class="stat-delta badge-${revenueDelta >= 0 ? 'success' : 'warning'}">
            ${revenueDelta >= 0 ? UI.icon('trending_up') : UI.icon('trending_down')} ${Math.abs(revenueDelta)}% เทียบเมื่อวาน
          </span>
        </div>
        <div class="card card-body stat-card">
          ${UI.icon('monitoring', 'stat-icon')}
          <div class="caption">กำไรวันนี้</div>
          <div class="stat-value text-primary">${U.fmtMoney(sum.profit)}</div>
          <span class="stat-delta badge-${profitDelta >= 0 ? 'success' : 'warning'}">
            ${profitDelta >= 0 ? UI.icon('trending_up') : UI.icon('trending_down')} ${Math.abs(profitDelta)}% เทียบเมื่อวาน
          </span>
        </div>
      </div>
      <div class="grid-3 mb">
        <div class="card card-body stat-card">
          ${UI.icon('shopping_bag', 'stat-icon')}
          <div class="caption">ขายได้วันนี้</div>
          <div class="stat-value">${U.fmtInt(todayUnits)}</div>
          <div class="caption">ชิ้น / ${sum.count} บิล</div>
        </div>
        <div class="card card-body stat-card">
          ${UI.icon('receipt_long', 'stat-icon')}
          <div class="caption">ต้นทุนวันนี้</div>
          <div class="stat-value">${U.fmtMoney(prevSum ? sum.revenue - sum.profit : 0)}</div>
          <div class="caption">ต้นทุนสินค้าที่ขาย</div>
        </div>
        <div class="card card-body stat-card">
          ${UI.icon('inventory_2', 'stat-icon')}
          <div class="caption">สินค้าในระบบ</div>
          <div class="stat-value">${U.fmtInt(state.products.length)}</div>
          <div class="caption">${U.fmtInt(Store.outOfStock().length)} รายการหมด</div>
        </div>
      </div>

      <!-- Chart -->
      <div class="card card-body mb">
        <div class="section-title">
          <h3 class="h3">ยอดขายรายสัปดาห์</h3>
          <span class="caption">จ.-อา. สัปดาห์นี้</span>
        </div>
        <div class="chart-box"><canvas id="weekly-chart"></canvas></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr;gap:16px;" class="mb">
        <div class="card">
          <div class="card-body" style="padding-bottom:8px;"><h3 class="h3">สินค้าขายดี</h3></div>
          <div class="grid-3" style="padding:0 16px 16px;">${bestHtml}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr;gap:16px;">
        <div class="card">
          <div class="card-body" style="padding-bottom:0;display:flex;align-items:center;justify-content:space-between;">
            <h3 class="h3">ของใกล้หมด</h3>
            <span class="badge badge-warning">${low.length}</span>
          </div>
          <div class="list">${lowHtml}</div>
        </div>
        <div class="card">
          <div class="card-body" style="padding-bottom:0;display:flex;align-items:center;justify-content:space-between;">
            <h3 class="h3">สินค้าไม่เคลื่อนไหว (30 วัน)</h3>
            <span class="badge badge-info">${slow.length}</span>
          </div>
          <div class="list">${slowHtml}</div>
        </div>
      </div>
      <div style="height:16px;"></div>
    `;

    // wire restock actions once; render replaces only the inner content.
    if (!container.__wired) {
      container.__wired = true;
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act="restock"]');
        if (btn) {
          e.stopPropagation();
          const id = btn.dataset.id;
          const prod = Store.productById(id);
          if (prod) {
            const ev = new CustomEvent('app:restock', { detail: prod });
            document.dispatchEvent(ev);
          }
        }
      });
    }

    renderChart(week);
  }

  function renderChart(week) {
    ensureChart().then(() => {
      const canvas = document.getElementById('weekly-chart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (chart) chart.destroy();
      const css = getComputedStyle(document.documentElement);
      chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: week.map((w) => w.label),
          datasets: [{
            label: 'ยอดขาย (฿)',
            data: week.map((w) => w.revenue),
            backgroundColor: css.getPropertyValue('--primary').trim() || '#003d9b',
            hoverBackgroundColor: css.getPropertyValue('--primary-container').trim() || '#0052cc',
            borderRadius: 6,
            maxBarThickness: 48
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) => ' ยอดขาย ' + U.fmtMoney(c.parsed.y)
              }
            }
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: (v) => U.fmtMoney(v, false) }, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      });
    });
  }

  global.ViewDashboard = { render };
})(window);
