/* ChowHuay Pro — Inventory view (products + bulk cost) */
(function (global) {
  'use strict';

  let mode = 'individual'; // individual | bulk
  let q = '';
  let cat = '__all';
  let editingId = null;
  let pendingImg = null;   // dataURL to upload
  let removeImg = false;
  let stockEditing = false;
  let stockSaving = false;
  const pendingStock = new Map(); // product id -> unsaved delta

  function render(container) {
    container.innerHTML = `
      <div class="inventory-page-head">
        <div>
          <h1 class="h2">จัดการสต็อกและต้นทุน</h1>
          <p class="caption">${stockEditing ? 'เลือกปรับหลายรายการ แล้วบันทึกพร้อมกันครั้งเดียว' : 'เพิ่ม แก้ไข ลบสินค้า และบันทึกทุนรวม'}</p>
        </div>
        <div class="inventory-head-actions">
          <button class="btn btn-outline" id="inv-stock-mode" style="display:${mode === 'individual' && !stockEditing ? 'inline-flex' : 'none'};">${UI.icon('tune')} ปรับสต็อก</button>
          <button class="btn btn-primary" id="inv-add" style="display:${mode === 'individual' && !stockEditing ? 'inline-flex' : 'none'};">${UI.icon('add')} เพิ่มสินค้า</button>
        </div>
      </div>
      <div class="segmented mb">
        <button class="${mode === 'individual' ? 'active' : ''}" data-mode="individual" ${stockEditing ? 'disabled' : ''}>รายชิ้น (สินค้า)</button>
        <button class="${mode === 'bulk' ? 'active' : ''}" data-mode="bulk" ${stockEditing ? 'disabled' : ''}>เหมาจ่าย / ทุนรวม</button>
      </div>
      <div id="inv-pane"></div>
    `;
    container.querySelectorAll('[data-mode]').forEach((b) => {
      b.addEventListener('click', () => { mode = b.dataset.mode; render(container); });
    });
    const addBtn = container.querySelector('#inv-add');
    const stockModeBtn = container.querySelector('#inv-stock-mode');
    if (addBtn) addBtn.addEventListener('click', () => openProductForm(null));
    if (stockModeBtn) stockModeBtn.addEventListener('click', () => {
      stockEditing = true;
      pendingStock.clear();
      render(container);
    });
    wire(container);
    renderPane(container);
  }

  function renderPane(container) {
    const pane = container.querySelector('#inv-pane');
    if (mode === 'individual') {
      const list = Store.products().filter((p) => {
        if (cat !== '__all' && String(p.category || '') !== cat) return false;
        if (q && !(p.name + ' ' + (p.barcode || '')).toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      });
      const cats = ['__all'].concat(Store.state.categories);
      pane.innerHTML = `
        ${stockEditing ? `<div class="stock-edit-intro" role="status">${UI.icon('bolt')}<div><b>โหมดปรับสต็อกแบบเร็ว</b><span>ปุ่ม + / − จะยังไม่ส่งข้อมูล จนกด “บันทึกทั้งหมด”</span></div></div>` : ''}
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <div class="search-bar grow">
            ${UI.icon('search')}
            <input id="inv-search" type="text" placeholder="ค้นหาสินค้า..." value="${U.esc(q)}">
          </div>
        </div>
        <div class="chip-row" id="inv-cats">
          ${cats.map((c) => `<button class="chip ${cat === c ? 'active' : ''}" data-icat="${U.esc(c)}">${c === '__all' ? 'ทั้งหมด' : U.esc(c)}</button>`).join('')}
        </div>
        <div class="mt">
        ${list.length ? `
          <div class="list">
            <div class="list-header" style="grid-template-columns:3fr 1fr 1fr 1fr 80px;">
              <span>สินค้า</span><span class="text-right">สต็อก</span><span class="text-right">ต้นทุน</span><span class="text-right">ขาย</span><span></span>
            </div>
            ${list.map((p, i) => productRow(p, i)).join('')}
          </div>
        ` : `<div class="empty-state"><span class="material-symbols-outlined" aria-hidden="true">inventory_2</span><p>ไม่พบสินค้า${list.length ? '' : ''}</p></div>`}
        </div>
        ${stockEditing ? stockSaveBar() : ''}
      `;
      pane.querySelector('#inv-search').addEventListener('input', (e) => { q = e.target.value; renderPane(container); });
      pane.querySelectorAll('[data-icat]').forEach((b) => b.addEventListener('click', () => { cat = b.dataset.icat; renderPane(container); }));
    } else {
      const purchases = Store.state.purchases.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
      pane.innerHTML = `
        <div class="grid-2" style="grid-template-columns:1fr;">
          <div class="card card-body">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
              <div style="width:40px;height:40px;border-radius:50%;background:var(--secondary-container);color:var(--on-secondary-container);display:flex;align-items:center;justify-content:center;">${UI.icon('receipt_long')}</div>
              <div><h3 class="h3">บันทึกเหมาจ่าย / ทุนรวม</h3><p class="caption">ซื้อของหลายอย่างรวมกัน เช่น "ขนม 4,000 บาท"</p></div>
            </div>
            <form id="bulk-form">
              <div class="field"><label>วันที่</label><input class="input" id="b-date" type="date" value="${U.todayStr()}"></div>
              <div class="field"><label>รายละเอียด</label><textarea class="textarea" id="b-desc" placeholder="เช่น ขนมซื้อมาวันนี้"></textarea></div>
              <div class="field"><label>ราคาทุนทั้งหมด (บาท)</label><input class="input" id="b-total" type="number" min="0" step="0.01" placeholder="0.00"></div>
              <button class="btn btn-secondary btn-block" id="b-save">${UI.icon('check_circle')} บันทึกต้นทุน</button>
            </form>
          </div>
          <div class="list">
            <div class="card-body" style="padding-bottom:8px;"><h3 class="h3">ประวัติทุนรวม</h3></div>
            ${purchases.length ? purchases.map((p) => `
              <div class="list-row">
                <div style="width:40px;height:40px;border-radius:8px;background:var(--surface-variant);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${UI.icon('payments', 'text-muted')}</div>
                <div style="flex:1;min-width:0;">
                  <div class="title truncate">${U.esc(p.description || '(ไม่มีรายละเอียด)')}</div>
                  <div class="caption">${U.fmtDate(p.date)}</div>
                </div>
                <div style="text-align:right;">
                  <div class="price-sm">${U.fmtMoney(p.total)}</div>
                  <div class="flex gap-sm" style="justify-content:flex-end;">
                    <button class="btn-icon" data-bedit="${U.esc(p.id)}" aria-label="แก้ไข ${U.esc(p.description || 'รายการต้นทุน')}">${UI.icon('edit')}</button>
                    <button class="btn-icon" data-bdel="${U.esc(p.id)}" aria-label="ลบ ${U.esc(p.description || 'รายการต้นทุน')}">${UI.icon('delete', 'text-error')}</button>
                  </div>
                </div>
              </div>`).join('')
            : '<div class="empty-state"><span class="material-symbols-outlined" aria-hidden="true">receipt_long</span><p>ยังไม่มีรายการทุนรวม</p></div>'}
          </div>
        </div>
      `;
      const form = pane.querySelector('#bulk-form');
      form.addEventListener('submit', (e) => { e.preventDefault(); saveBulk(); });
    }
  }

  function productRow(p, i) {
    const stock = U.num(p.stock);
    const delta = pendingStock.get(String(p.id)) || 0;
    const next = stock + delta;
    const low = next <= U.num(p.minStock);
    return `
      <div class="list-row inventory-product-row ${stockEditing ? 'stock-editing' : ''} ${stockEditing && delta ? 'has-stock-change' : ''} ${i % 2 ? 'zebra-even' : 'zebra-odd'}">
        <div style="flex:1;min-width:200px;display:flex;gap:12px;align-items:center;">
          <div style="width:48px;height:48px;border-radius:10px;background:var(--surface-variant);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
            ${p.imgId ? `<img loading="lazy" src="${U.imgUrl(p.imgId)}" alt="" style="width:100%;height:100%;object-fit:contain;mix-blend-mode:multiply;padding:4px;">` : UI.icon('inventory_2', 'text-muted')}
          </div>
          <div style="min-width:0;">
            <div class="title truncate">${U.esc(p.name)}</div>
            <div class="caption">${p.barcode ? U.esc(p.barcode) : 'ไม่มีบาร์โค้ด'} · ${U.esc(p.category || 'ไม่จัดหมวด')} · ${U.esc(p.unit || 'ชิ้น')}</div>
          </div>
        </div>
        <div class="inventory-stock-cell">
          ${stockEditing ? `
          <div class="stepper">
            <button data-stock-delta="-1" data-id="${U.esc(p.id)}" aria-label="ลดสต็อก ${U.esc(p.name)}" ${next <= 0 ? 'disabled' : ''}>${UI.icon('remove')}</button>
            <span style="min-width:36px;color:${low ? 'var(--error)' : 'inherit'};font-weight:700;">${U.fmtInt(next)}</span>
            <button data-stock-delta="1" data-id="${U.esc(p.id)}" aria-label="เพิ่มสต็อก ${U.esc(p.name)}">${UI.icon('add')}</button>
          </div>
          ${delta ? `<span class="stock-delta ${delta > 0 ? 'positive' : 'negative'}">${delta > 0 ? '+' : ''}${U.fmtInt(delta)}</span>` : '<span class="caption">ยังไม่เปลี่ยน</span>'}
          ` : `<span class="inventory-stock-value ${low ? 'text-error' : ''}">${U.fmtInt(stock)} <small>${U.esc(p.unit || 'ชิ้น')}</small></span>`}
        </div>
        <div class="caption" style="text-align:right;min-width:70px;">ต้นทุน <b class="text-primary">${U.fmtMoney(p.cost)}</b><br>ขาย <b>${U.fmtMoney(p.sell)}</b></div>
        <div style="display:${stockEditing ? 'none' : 'flex'};gap:4px;">
          <button class="btn-icon" data-edit="${U.esc(p.id)}" aria-label="แก้ไข ${U.esc(p.name)}">${UI.icon('edit')}</button>
          <button class="btn-icon" data-del="${U.esc(p.id)}" aria-label="ลบ ${U.esc(p.name)}">${UI.icon('delete', 'text-error')}</button>
        </div>
      </div>`;
  }

  function stockSaveBar() {
    const count = pendingStock.size;
    return `
      <div class="stock-save-bar" role="region" aria-label="บันทึกการปรับสต็อก">
        <div><b>${count ? 'แก้แล้ว ' + count + ' รายการ' : 'ยังไม่มีรายการเปลี่ยนแปลง'}</b><span>ตรวจสอบตัวเลขก่อนบันทึกลง Google Sheets</span></div>
        <div class="stock-save-actions">
          <button class="btn btn-ghost" type="button" data-stock-cancel ${stockSaving ? 'disabled' : ''}>ยกเลิก</button>
          <button class="btn btn-secondary" type="button" data-stock-save ${!count || stockSaving ? 'disabled' : ''}>${stockSaving ? UI.icon('progress_activity', 'spin') + ' กำลังบันทึก...' : UI.icon('save') + ' บันทึกทั้งหมด'}</button>
        </div>
      </div>`;
  }

  // wire events once on container (delegated — survives re-renders)
  function wire(container) {
    if (container.__wired) return;
    container.__wired = true;
    container.addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-edit]');
      if (edit) { openProductForm(edit.dataset.edit); return; }
      const del = e.target.closest('[data-del]');
      if (del) { deleteProduct(del.dataset.del); return; }
      const adjust = e.target.closest('[data-stock-delta]');
      if (adjust) {
        if (adjust.disabled || !stockEditing || stockSaving) return;
        const id = String(adjust.dataset.id);
        const delta = parseInt(adjust.dataset.stockDelta, 10);
        const product = Store.productById(id);
        const currentDelta = pendingStock.get(id) || 0;
        if (!product || U.num(product.stock) + currentDelta + delta < 0) return;
        const nextDelta = currentDelta + delta;
        if (nextDelta) pendingStock.set(id, nextDelta);
        else pendingStock.delete(id);
        renderPane(container);
        return;
      }
      if (e.target.closest('[data-stock-save]')) { saveStockChanges(container); return; }
      if (e.target.closest('[data-stock-cancel]')) { cancelStockChanges(container); return; }
      const bedit = e.target.closest('[data-bedit]');
      if (bedit) { editBulk(bedit.dataset.bedit); return; }
      const bdel = e.target.closest('[data-bdel]');
      if (bdel) { deleteBulk(bdel.dataset.bdel); return; }
    });
  }

  async function saveStockChanges(container) {
    if (stockSaving || !pendingStock.size) return;
    stockSaving = true;
    renderPane(container);
    const adjustments = Array.from(pendingStock.entries()).map(([id, delta]) => ({ id, delta }));
    try {
      const result = await Api.product.adjustBatch(adjustments);
      (result.stocks || []).forEach((item) => {
        const product = Store.productById(item.id);
        if (product) {
          product.stock = item.stock;
          if (item.updated) product.updated = item.updated;
        }
      });
      Store.persist();
      pendingStock.clear();
      stockEditing = false;
      stockSaving = false;
      render(container);
      UI.toast('บันทึกสต็อก ' + adjustments.length + ' รายการแล้ว');
      App.checkAlerts();
    } catch (err) {
      stockSaving = false;
      renderPane(container);
      UI.toast((err && err.message) || 'บันทึกไม่สำเร็จ การแก้ไขยังอยู่ในหน้านี้', 'error');
    }
  }

  function cancelStockChanges(container) {
    const leave = () => {
      pendingStock.clear();
      stockEditing = false;
      stockSaving = false;
      render(container);
    };
    if (!pendingStock.size) { leave(); return; }
    UI.confirmDialog('ยกเลิกการปรับสต็อก', 'ทิ้งการแก้ไข ' + pendingStock.size + ' รายการที่ยังไม่ได้บันทึก?', leave);
  }
  // ---- product form modal ----
  function openProductForm(id) {
    editingId = id || null;
    pendingImg = null;
    removeImg = false;
    const p = editingId ? Store.productById(editingId) : null;
    const cats = Store.state.categories;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="grid-2" style="grid-template-columns:1fr 1fr;">
        <div class="field" style="grid-column:1/-1;">
          <label>รูปสินค้า</label>
          <div style="display:flex;gap:12px;align-items:center;">
            <div id="img-preview" style="width:84px;height:84px;border-radius:12px;background:var(--surface-variant);border:1px dashed var(--outline);display:flex;align-items:center;justify-content:center;overflow:hidden;">
              ${p && p.imgId && !removeImg ? `<img src="${U.imgUrl(p.imgId, 'w320')}" style="width:100%;height:100%;object-fit:contain;mix-blend-mode:multiply;">` : UI.icon('add_photo_alternate', 'text-muted')}
            </div>
            <div class="flex-col gap-sm" style="flex:1;">
              <input type="file" id="img-file" accept="image/*" class="hidden">
              <button class="btn btn-outline btn-sm" id="img-upload">${UI.icon('upload')} เลือกรูปภาพ</button>
              ${(p && p.imgId) || pendingImg ? '<button class="btn btn-ghost btn-sm text-error" id="img-remove">' + UI.icon('delete') + ' เอารูปออก</button>' : ''}
              <span class="caption">รูปจะถูกบีบอัดอัตโนมัติก่อนอัปโหลด</span>
            </div>
          </div>
        </div>
        <div class="field">
          <label>บาร์โค้ด</label>
          <div class="input-group">
            <input class="input grow" id="f-barcode" type="text" value="${p ? U.esc(p.barcode || '') : ''}" placeholder="สแกนหรือพิมพ์">
            <button class="btn btn-primary" style="width:48px;height:48px;padding:0;" id="f-scan" aria-label="สแกนบาร์โค้ดสินค้า">${UI.icon('barcode_scanner')}</button>
          </div>
        </div>
        <div class="field">
          <label>ชื่อสินค้า *</label>
          <input class="input" id="f-name" type="text" value="${p ? U.esc(p.name) : ''}" placeholder="เช่น มาม่า ต้มยำกุ้ง">
        </div>
        <div class="field">
          <label>หมวดหมู่</label>
          <div class="input-group">
            <input class="input grow" id="f-cat" type="text" list="cat-list" value="${p ? U.esc(p.category || '') : ''}" placeholder="เลือกหรือพิมพ์ใหม่">
            <datalist id="cat-list">${cats.map((c) => `<option value="${U.esc(c)}">`).join('')}</datalist>
            <button class="btn btn-outline" id="f-cat-add" title="เพิ่มหมวดหมู่ใหม่" aria-label="เพิ่มหมวดหมู่ใหม่">${UI.icon('add')}</button>
          </div>
        </div>
        <div class="field">
          <label>หน่วย (ชิ้น/ขวด/ถุง...)</label>
          <input class="input" id="f-unit" type="text" value="${p ? U.esc(p.unit || '') : 'ชิ้น'}" placeholder="ชิ้น">
        </div>
        <div class="field">
          <label>ต้นทุน/หน่วย (บาท)</label>
          <input class="input" id="f-cost" type="number" min="0" step="0.01" value="${p ? p.cost : ''}" placeholder="0.00">
        </div>
        <div class="field">
          <label>ราคาขาย/หน่วย (บาท)</label>
          <input class="input" id="f-sell" type="number" min="0" step="0.01" value="${p ? p.sell : ''}" placeholder="0.00">
        </div>
        <div class="field">
          <label>สต็อกเริ่มต้น/แก้ไข</label>
          <input class="input" id="f-stock" type="number" min="0" value="${p ? p.stock : '0'}">
        </div>
        <div class="field">
          <label>สต็อกขั้นต่ำ (เตือน)</label>
          <input class="input" id="f-min" type="number" min="0" value="${p ? p.minStock : '5'}">
        </div>
      </div>
    `;
    const preview = body.querySelector('#img-preview');
    const updPreview = () => {
      if (pendingImg) preview.innerHTML = `<img src="${pendingImg}" style="width:100%;height:100%;object-fit:contain;">`;
      else if (p && p.imgId && !removeImg) preview.innerHTML = `<img src="${U.imgUrl(p.imgId, 'w320')}" style="width:100%;height:100%;object-fit:contain;mix-blend-mode:multiply;">`;
      else preview.innerHTML = UI.icon('add_photo_alternate', 'text-muted');
    };
    body.querySelector('#img-upload').addEventListener('click', () => body.querySelector('#img-file').click());
    body.querySelector('#img-file').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const d = await U.compressImage(f, 600, 0.82);
        pendingImg = d;
        removeImg = false;
        updPreview();
        UI.toast('เลือกรูปแล้ว — กดบันทึกเพื่ออัปโหลด');
      } catch (err) { UI.toast('อ่านรูปไม่สำเร็จ', 'error'); }
    });
    const rmBtn = body.querySelector('#img-remove');
    if (rmBtn) rmBtn.addEventListener('click', () => { removeImg = true; pendingImg = null; updPreview(); });
    body.querySelector('#f-cat-add').addEventListener('click', async () => {
      const name = body.querySelector('#f-cat').value.trim();
      if (!name) { UI.toast('พิมพ์ชื่อหมวดหมู่ก่อน', 'error'); return; }
      const btn = body.querySelector('#f-cat-add');
      if (btn.disabled) return;
      btn.disabled = true;
      btn.innerHTML = UI.icon('progress_activity', 'spin');
      try {
        await Api.category.create(name);
        await Store.refresh();
        UI.toast('เพิ่มหมวดหมู่ "' + name + '" แล้ว');
      } catch (err) { UI.toast(err.message, 'error'); }
      btn.disabled = false;
      btn.innerHTML = UI.icon('add');
    });
    body.querySelector('#f-scan').addEventListener('click', () => {
      // keep the product form open — scanner stacks above it (backdrop painted later)
      ViewPos.openScanner((code) => {
        const found = Store.byBarcode(code);
        const barcodeEl = document.getElementById('f-barcode');
        if (barcodeEl) barcodeEl.value = code;
        if (found && !editingId) {
          UI.toast('พบสินค้า "' + found.name + '" — นำข้อมูลมาเติม');
          fillFormFromProduct(found);
        } else {
          UI.toast('เพิ่มบาร์โค้ด ' + code + ' แล้ว');
        }
      });
    });

    const saveBtn = UI.modalBtn(p ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า', 'btn-secondary btn-block btn-lg', async () => {
      const name = body.querySelector('#f-name').value.trim();
      if (!name) { UI.toast('ต้องระบุชื่อสินค้า', 'error'); return; }
      saveBtn.disabled = true;
      saveBtn.textContent = 'กำลังบันทึก...';
      try {
        let imgId = (p && p.imgId && !removeImg) ? p.imgId : '';
        if (pendingImg) {
          const res = await Api.image.upload(pendingImg, 'product.jpg');
          imgId = res.imgId;
          if (p && p.imgId && p.imgId !== res.imgId) { try { await Api.image.remove(p.imgId); } catch (e) {} }
        } else if (removeImg && p && p.imgId) {
          try { await Api.image.remove(p.imgId); } catch (e) {}
        }
        const prod = {
          id: editingId || undefined,
          barcode: body.querySelector('#f-barcode').value.trim(),
          name,
          category: body.querySelector('#f-cat').value.trim() || 'ทั่วไป',
          unit: body.querySelector('#f-unit').value.trim() || 'ชิ้น',
          cost: U.num(body.querySelector('#f-cost').value),
          sell: U.num(body.querySelector('#f-sell').value),
          stock: U.num(body.querySelector('#f-stock').value),
          minStock: U.num(body.querySelector('#f-min').value),
          imgId
        };
        if (editingId) await Api.product.update(prod);
        else await Api.product.create(prod);
        await Store.refresh();
        UI.closeModal();
        UI.toast(editingId ? 'บันทึกสินค้าแล้ว' : 'เพิ่มสินค้าแล้ว');
        render(document.getElementById('view-inventory'));
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = p ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า';
        UI.toast(err.message, 'error');
      }
    });
    UI.openModal({ title: p ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่', body, foot: [saveBtn] });
  }

  function fillFormFromProduct(p) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('f-name', p.name); set('f-cat', p.category || ''); set('f-unit', p.unit || '');
    set('f-cost', p.cost); set('f-sell', p.sell); set('f-stock', p.stock); set('f-min', p.minStock || 5);
  }

  function deleteProduct(id) {
    const p = Store.productById(id);
    if (!p) return;
    UI.confirmDialog('ลบสินค้า', 'ลบ "' + p.name + '" ออกจากระบบ? (สต็อกในบิลเก่ายังอยู่ครบ)', async () => {
      try {
        await Api.product.remove(id);
        await Store.refresh();
        UI.toast('ลบสินค้าแล้ว');
        render(document.getElementById('view-inventory'));
      } catch (err) { UI.toast(err.message, 'error'); }
    });
  }

  // ---- bulk purchase ----
  function saveBulk() {
    const date = document.getElementById('b-date').value;
    const desc = document.getElementById('b-desc').value.trim();
    const total = U.num(document.getElementById('b-total').value);
    if (total <= 0) { UI.toast('ต้องระบุยอดทุน', 'error'); return; }
    const btn = document.getElementById('b-save');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = UI.icon('progress_activity', 'spin') + ' กำลังบันทึก...';
    Api.purchase.create({ date: new Date(date).toISOString(), description: desc, total }).then(() => {
      UI.toast('บันทึกต้นทุนแล้ว');
      return Store.refresh();
    }).then(() => {
      render(document.getElementById('view-inventory'));
    }).catch((err) => {
      btn.disabled = false;
      btn.innerHTML = UI.icon('check_circle') + ' บันทึกต้นทุน';
      UI.toast(err.message, 'error');
    });
  }

  function editBulk(id) {
    const p = Store.state.purchases.find((x) => String(x.id) === String(id));
    if (!p) return;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="field"><label>วันที่</label><input class="input" id="e-date" type="date" value="${String(p.date).slice(0, 10)}"></div>
      <div class="field"><label>รายละเอียด</label><textarea class="textarea" id="e-desc">${U.esc(p.description || '')}</textarea></div>
      <div class="field"><label>ราคาทุนทั้งหมด (บาท)</label><input class="input" id="e-total" type="number" min="0" step="0.01" value="${p.total}"></div>
    `;
    const saveBtn = UI.modalBtn('บันทึก', 'btn-secondary btn-block btn-lg', async () => {
      if (saveBtn.disabled) return;
      saveBtn.disabled = true;
      saveBtn.innerHTML = UI.icon('progress_activity', 'spin') + ' กำลังบันทึก...';
      try {
        await Api.purchase.update({
          id: p.id,
          date: new Date(body.querySelector('#e-date').value).toISOString(),
          description: body.querySelector('#e-desc').value.trim(),
          total: U.num(body.querySelector('#e-total').value)
        });
        await Store.refresh();
        UI.closeModal();
        UI.toast('อัปเดตแล้ว');
        render(document.getElementById('view-inventory'));
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = UI.icon('check_circle') + ' บันทึก';
        UI.toast(err.message, 'error');
      }
    });
    UI.openModal({ title: 'แก้ไขทุนรวม', body, foot: [saveBtn] });
  }

  function deleteBulk(id) {
    UI.confirmDialog('ลบรายการทุน', 'ลบรายการทุนรวมนี้? (ยอดรายงานจะลดลง)', async () => {
      try {
        await Api.purchase.remove(id);
        await Store.refresh();
        UI.toast('ลบแล้ว');
        render(document.getElementById('view-inventory'));
      } catch (err) { UI.toast(err.message, 'error'); }
    });
  }

  // restock quick modal (from dashboard)
  function openRestock(p) {
    const body = document.createElement('div');
    body.innerHTML = `
      <p class="body mb">เพิ่มสต็อกให้ <b>${U.esc(p.name)}</b> (ปัจจุบัน ${U.fmtInt(p.stock)} ${U.esc(p.unit || 'ชิ้น')})</p>
      <div class="field"><label>จำนวนที่เพิ่ม</label><input class="input" id="r-qty" type="number" min="1" value="1"></div>
    `;
    const saveBtn = UI.modalBtn('เพิ่มสต็อก', 'btn-secondary btn-block btn-lg', async () => {
      const n = U.num(body.querySelector('#r-qty').value);
      if (n <= 0) { UI.toast('ระบุจำนวนให้ถูกต้อง', 'error'); return; }
      if (saveBtn.disabled) return;
      saveBtn.disabled = true;
      saveBtn.innerHTML = UI.icon('progress_activity', 'spin') + ' กำลังเพิ่ม...';
      const current = Store.productById(p.id);
      const previousStock = current ? U.num(current.stock) : U.num(p.stock);
      if (current) {
        current.stock = previousStock + n;
        current.updated = new Date().toISOString();
        Store.persist();
      }
      UI.closeModal();
      UI.toast('ปรับจำนวนบนหน้าจอแล้ว กำลังบันทึกลง Google Sheets...');
      render(document.getElementById('view-inventory'));
      ViewDashboard.render(document.getElementById('view-dashboard'));
      try {
        const result = await Api.product.adjustBatch([{ id: p.id, delta: n }]);
        const saved = result.stocks && result.stocks[0];
        if (current && saved) {
          current.stock = saved.stock;
          current.updated = saved.updated || new Date().toISOString();
          Store.persist();
        }
        UI.toast('เพิ่มสต็อกแล้ว');
        render(document.getElementById('view-inventory'));
        ViewDashboard.render(document.getElementById('view-dashboard'));
        App.checkAlerts();
      } catch (err) {
        if (current) {
          current.stock = previousStock;
          Store.persist();
        }
        render(document.getElementById('view-inventory'));
        ViewDashboard.render(document.getElementById('view-dashboard'));
        UI.toast(((err && err.message) || 'บันทึกไม่สำเร็จ') + ' คืนจำนวนเดิมแล้ว กรุณาลองอีกครั้ง', 'error');
      }
    });
    UI.openModal({ title: 'เติมสต็อก', body, foot: [saveBtn] });
  }

  global.ViewInventory = {
    render, wire, openRestock
  };
})(window);
