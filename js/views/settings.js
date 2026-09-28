/* ChowHuay Pro — Settings view */
(function (global) {
  'use strict';

  let testing = false;

  const THEMES = [
    { id: 'blue', label: 'น้ำเงินร้านค้า', color: '#003d9b' },
    { id: 'green', label: 'เขียวสด', color: '#006a3d' },
    { id: 'orange', label: 'ส้มอบอุ่น', color: '#9a3412' },
    { id: 'purple', label: 'ม่วงเข้ม', color: '#6d28d9' },
    { id: 'brown', label: 'น้ำตาลนุ่ม', color: '#5d4037' }
  ];

  function render(container) {
    const cfg = Store.state.settings;
    const setup = Api.getSetup();
    const configured = Api.isConfigured();
    const dark = document.documentElement.dataset.mode === 'dark';
    const theme = document.documentElement.dataset.theme || 'blue';
    let savedTheme = {};
    try { savedTheme = JSON.parse(localStorage.getItem(CONFIG.THEME_KEY) || '{}'); } catch (e) {}
    const customColor = U.validHex(savedTheme.customColor) ? savedTheme.customColor : '#0f766e';
    const lastSync = Store.state.syncedAt;
    const notifyStatus = notificationStatus();

    container.innerHTML = `
      <div style="margin-bottom:16px;"><h1 class="h2">การตั้งค่า</h1><p class="caption">เชื่อมต่อฐานข้อมูล ธีม และความปลอดภัย</p></div>

      <div class="card mb">
        <div class="card-body">
          <h3 class="h3 mb">เชื่อมต่อ Google Apps Script (ฐานข้อมูล)</h3>
          ${configured
            ? `<div class="mb-sm" style="display:flex;align-items:center;gap:8px;">${UI.badge('success', 'เชื่อมต่อแล้ว')}<span class="caption" style="word-break:break-all;min-width:0;">${U.esc(Api.gasUrl())}</span></div>`
            : `<div class="mb-sm">${UI.badge('warning', 'ยังไม่ได้ตั้งค่า')}</div>`}
          <div class="field">
            <label for="s-url">URL ของ Web App (ลงท้ายด้วย /exec)</label>
            <input class="input" id="s-url" type="url" value="${U.esc(Api.gasUrl())}" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="url">
          </div>
          <div class="flex gap" style="flex-wrap:wrap;">
            <button class="btn btn-primary" id="s-test">${UI.icon('bolt')} ทดสอบการเชื่อมต่อ</button>
            <button class="btn btn-outline" id="s-save-url">บันทึก URL</button>
          </div>
          <details class="setup-help mt"><summary>ดูวิธีเชื่อมต่อสำหรับผู้ดูแลระบบ</summary><p class="caption mt-sm">เปิด Apps Script วาง Code.gs เปิด Drive API แล้ว Deploy เป็น Web app จากนั้นคัดลอก URL ที่ลงท้ายด้วย /exec มาวางที่นี่</p></details>
          <p class="caption mt-sm">อัปเดตล่าสุด: ${lastSync ? U.fmtDateTime(lastSync) : 'ยังไม่เคยซิงก์'}</p>
        </div>
      </div>

      <div class="card mb">
        <div class="card-body">
          <h3 class="h3 mb">ข้อมูลร้านค้า</h3>
          <div class="field"><label>ชื่อร้าน</label><input class="input" id="s-store" type="text" value="${U.esc(cfg.storeName || '')}" placeholder="ชื่อร้าน"></div>
          <button class="btn btn-secondary" id="s-save-store">${UI.icon('save')} บันทึกข้อมูลร้าน</button>
        </div>
      </div>

      <div class="card mb">
        <div class="card-body">
          <h3 class="h3 mb">การปรับแต่งหน้าตาแอป</h3>
          <div class="field"><label>ธีมสี</label>
            <div class="grid-3" style="gap:10px;">
              ${THEMES.map((t) => `
                <button class="theme-btn ${theme === t.id ? 'theme-active' : ''}" data-theme-set="${t.id}" aria-pressed="${theme === t.id}" style="cursor:pointer;border:2px solid ${theme === t.id ? 'var(--primary)' : 'var(--outline-variant)'};background:var(--surface-container-lowest);border-radius:12px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:8px;">
                  <div style="width:40px;height:40px;border-radius:50%;background:${t.color};box-shadow:var(--elev-1);"></div>
                  <span class="caption" style="font-weight:600;color:var(--on-surface);">${t.label}</span>
                </button>`).join('')}
            </div>
            <div class="custom-theme-panel ${theme === 'custom' ? 'theme-active' : ''}">
              <div class="custom-theme-copy">
                <span class="title">เลือกสีเอง</span>
                <span class="caption">ระบบจะปรับเฉดข้อความและปุ่มให้อ่านง่ายอัตโนมัติ</span>
              </div>
              <div class="custom-theme-controls">
                <label class="color-picker" aria-label="เลือกสีธีม">
                  <input id="s-custom-color" type="color" value="${customColor}">
                  <span style="background:${customColor};"></span>
                </label>
                <input class="input color-hex-input" id="s-custom-hex" value="${customColor}" inputmode="text" maxlength="7" aria-label="รหัสสีธีม" spellcheck="false">
                <button class="btn btn-outline" id="s-apply-custom" type="button">ใช้สีนี้</button>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;">
            <span class="title">โหมดมืด</span>
            <label style="position:relative;display:inline-block;cursor:pointer;">
              <input type="checkbox" id="s-dark" ${dark ? 'checked' : ''} class="sr-only-input" aria-label="เปิดโหมดมืด">
              <div style="width:48px;height:28px;background:${dark ? 'var(--primary)' : 'var(--outline-variant)'};border-radius:999px;transition:background 0.2s;position:relative;">
                <span style="position:absolute;top:3px;left:${dark ? '23px' : '3px'};width:22px;height:22px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:var(--elev-1);"></span>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div class="card mb">
        <div class="card-body">
          <h3 class="h3 mb">ความปลอดภัย</h3>
          <div class="field"><label for="s-pass">ตั้งรหัสผ่านใหม่ 4 หลัก</label>
            <input class="input" id="s-pass" type="password" inputmode="numeric" minlength="4" maxlength="4" pattern="[0-9]{4}" value="" autocomplete="new-password" placeholder="กรอกรหัสใหม่ 4 หลัก">
          </div>
          <p class="caption mb">ระบบไม่เก็บรหัสจริงในเครื่อง โดยใช้ค่าแฮชแบบมี salt สำหรับเปิดแคชเมื่อออฟไลน์</p>
          <button class="btn btn-outline" id="s-save-pass">${UI.icon('lock')} บันทึกรหัสผ่าน</button>
        </div>
      </div>

      <div class="card mb">
        <div class="card-body">
          <h3 class="h3 mb">ติดตั้งเป็นแอป (PWA)</h3>
          <p class="caption mb">เพิ่มไอคอนไว้หน้าจอหลัก ใช้งานเหมือนแอปจริง โหลดเร็วและรองรับออฟไลน์</p>
          <button class="btn btn-secondary" id="s-install">${UI.icon('download')} เพิ่มลงหน้าจอหลัก</button>
          <p class="caption mt-sm" id="s-install-ios"></p>
        </div>
      </div>

      <div class="card mb">
        <div class="card-body">
          <h3 class="h3 mb">การแจ้งเตือน</h3>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div>
              <span class="title">แจ้งเตือนสินค้าใกล้หมด</span>
              <p class="caption" id="s-notify-status">${notifyStatus}</p>
            </div>
            <label style="position:relative;display:inline-block;cursor:pointer;">
              <input type="checkbox" id="s-notify" ${setup.notify ? 'checked' : ''} class="sr-only-input" aria-label="แจ้งเตือนสินค้าใกล้หมด">
              <div style="width:48px;height:28px;background:${setup.notify ? 'var(--primary)' : 'var(--outline-variant)'};border-radius:999px;transition:background 0.2s;position:relative;">
                <span style="position:absolute;top:3px;left:${setup.notify ? '23px' : '3px'};width:22px;height:22px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:var(--elev-1);"></span>
              </div>
            </label>
          </div>
          <div class="notify-actions mt">
            <button class="btn btn-outline btn-sm" id="s-notify-test" type="button" ${U.notifyPermission() !== 'granted' ? 'disabled' : ''}>${UI.icon('notifications_active')} ทดสอบบนอุปกรณ์นี้</button>
            <p class="caption">แจ้งเตือนซ้ำทุกครั้งที่เปิดหรือซิงก์แอปและยังพบสต็อกต่ำ การแจ้งขณะปิดแอปสนิทต้องใช้ระบบ Web Push เพิ่มเติม</p>
          </div>
        </div>
      </div>

      <div class="card mb">
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <h3 class="h3">ข้อมูลเครื่อง (แคช)</h3>
            <p class="caption">ล้างข้อมูลชั่วคราวบนเครื่อง (ไม่กระทบข้อมูลใน Google Sheets)</p>
          </div>
          <button class="btn btn-outline btn-sm text-error" id="s-clear">${UI.icon('delete_sweep')} ล้างแคช</button>
        </div>
      </div>

      <p class="caption" style="text-align:center;color:var(--outline);">ChowHuay Pro v${CONFIG.APP_VERSION} · ออกแบบให้โชว์ห่วยไทย</p>
      <div style="height:16px;"></div>
    `;

    wire(container);
    updateInstallButton();
    const ios = document.getElementById('s-install-ios');
    if (ios && isIOS()) ios.innerHTML = '<b>iOS:</b> กดปุ่มแชร์ (⎋) ใน Safari แล้วเลือก "เพิ่มไปที่หน้าจอโฮม"';

    if (document.getElementById('s-dark')) {
      document.getElementById('s-dark').addEventListener('change', (e) => {
        applyTheme(document.documentElement.dataset.theme, e.target.checked ? 'dark' : 'light', customColor);
        render(container);
      });
    }
    const notifyToggle = document.getElementById('s-notify');
    if (notifyToggle) {
      notifyToggle.addEventListener('change', async (e) => {
        const on = e.target.checked;
        if (on) {
          const p = await U.notifyRequest();
          if (p === 'granted') {
            Api.saveSetup(Object.assign(Api.getSetup(), { notify: true }));
            UI.toast('เปิดการแจ้งเตือนแล้ว ลองกดปุ่มทดสอบบนอุปกรณ์นี้');
            render(container);
          } else if (p === 'denied') {
            UI.toast('การแจ้งเตือนถูกบล็อก กรุณาอนุญาตในตั้งค่าเบราว์เซอร์', 'error');
            e.target.checked = false;
            render(container);
          } else {
            Api.saveSetup(Object.assign(Api.getSetup(), { notify: true }));
            UI.toast('เปิดแล้ว (ยังไม่ได้อนุญาต)');
          }
        } else {
          Api.saveSetup(Object.assign(Api.getSetup(), { notify: false }));
          UI.toast('ปิดการแจ้งเตือนแล้ว');
        }
      });
    }
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function notificationStatus() {
    if (!U.notifySupported()) return 'อุปกรณ์หรือเบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือน PWA';
    const permission = U.notifyPermission();
    if (permission === 'granted') return 'พร้อมแจ้งเตือนบนอุปกรณ์นี้';
    if (permission === 'denied') return 'ถูกบล็อกในอุปกรณ์นี้ กรุณาอนุญาต Notifications ในการตั้งค่าระบบ';
    return 'เปิดสวิตช์เพื่อขอสิทธิ์แจ้งเตือนจากอุปกรณ์นี้';
  }

  function applyTheme(theme, mode, customColor) {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.mode = mode;
    let previous = {};
    try { previous = JSON.parse(localStorage.getItem(CONFIG.THEME_KEY) || '{}'); } catch (e) {}
    const color = U.validHex(customColor) ? customColor.toLowerCase()
      : U.validHex(previous.customColor) ? previous.customColor.toLowerCase() : '#0f766e';
    if (theme === 'custom') U.applyCustomTheme(root, color, mode);
    else U.clearCustomTheme(root);
    localStorage.setItem(CONFIG.THEME_KEY, JSON.stringify({ theme, mode, customColor: color }));
    if (Store.state.settings) {
      Api.settings.set('theme', theme).catch(() => {});
      Api.settings.set('dark', mode === 'dark' ? '1' : '0').catch(() => {});
      if (theme === 'custom') Api.settings.set('themeColor', color).catch(() => {});
    }
  }

  function wire(container) {
    if (container.__wired) return;
    container.__wired = true;

    container.addEventListener('click', (e) => {
      const themeBtn = e.target.closest('[data-theme-set]');
      if (themeBtn) {
        const t = themeBtn.dataset.themeSet;
        applyTheme(t, document.documentElement.dataset.mode);
        render(container);
        return;
      }
      if (e.target.closest('#s-apply-custom')) { applyCustomTheme(container); return; }
      if (e.target.closest('#s-notify-test')) { testNotification(); return; }
      if (e.target.closest('#s-test')) testConnection(container);
      if (e.target.closest('#s-save-url')) saveUrl(container);
      if (e.target.closest('#s-save-store')) saveStore(container);
      if (e.target.closest('#s-save-pass')) savePass(container);
      if (e.target.closest('#s-install')) installPwa();
      if (e.target.closest('#s-clear')) clearCache(container);
    });
    container.addEventListener('input', (e) => {
      if (e.target.id === 's-custom-color') {
        const hex = e.target.value.toLowerCase();
        const input = container.querySelector('#s-custom-hex');
        const swatch = e.target.nextElementSibling;
        if (input) input.value = hex;
        if (swatch) swatch.style.background = hex;
      }
    });
  }

  function applyCustomTheme(container) {
    const input = container.querySelector('#s-custom-hex');
    const color = String(input && input.value || '').trim();
    if (!U.validHex(color)) { UI.toast('รหัสสีต้องอยู่ในรูปแบบ #RRGGBB เช่น #0f766e', 'error'); return; }
    applyTheme('custom', document.documentElement.dataset.mode || 'light', color);
    UI.toast('ใช้สีธีมที่เลือกแล้ว');
    render(container);
  }

  async function testNotification() {
    const btn = document.getElementById('s-notify-test');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const ok = await U.notifyShow('ChowHuay Pro: ทดสอบสำเร็จ', {
      body: 'อุปกรณ์นี้พร้อมรับการแจ้งเตือนสต็อกต่ำแล้ว',
      icon: new URL('icons/icon-192.png', location.href).href,
      badge: new URL('icons/icon-192.png', location.href).href,
      tag: 'chowhuay-notification-test',
      renotify: true,
      data: { url: location.origin + location.pathname + '#/inventory' }
    });
    UI.toast(ok ? 'ส่งการแจ้งเตือนทดสอบแล้ว' : 'ส่งไม่สำเร็จ กรุณาตรวจสิทธิ์ Notifications ของอุปกรณ์', ok ? undefined : 'error');
    btn.disabled = false;
  }

  async function testConnection(container) {
    const btn = document.getElementById('s-test');
    if (testing) return;
    testing = true;
    const url = document.getElementById('s-url').value.trim();
    const previousUrl = Api.gasUrl();
    if (!validGasUrl(url)) { UI.toast('URL ต้องเป็น Google Apps Script และลงท้ายด้วย /exec', 'error'); testing = false; return; }
    Api.saveSetup(Object.assign(Api.getSetup(), { url }));
    btn.innerHTML = UI.icon('progress_activity') + ' กำลังทดสอบ...';
    btn.disabled = true;
    try {
      await Api.ping();
      UI.toast('เชื่อมต่อสำเร็จ ฐานข้อมูลพร้อมใช้งาน');
      if (url === previousUrl && Api.auth.hasSession()) {
        await Store.refresh();
        App.renderView();
      }
    } catch (err) {
      Api.saveSetup(Object.assign(Api.getSetup(), { url: previousUrl }));
      UI.toast('เชื่อมต่อไม่สำเร็จ: ' + err.message, 'error');
    }
    btn.innerHTML = UI.icon('bolt') + ' ทดสอบการเชื่อมต่อ';
    btn.disabled = false;
    testing = false;
    render(container);
  }

  function saveUrl(container) {
    const url = document.getElementById('s-url').value.trim();
    if (!validGasUrl(url)) { UI.toast('URL ต้องเป็น Google Apps Script และลงท้ายด้วย /exec', 'error'); return; }
    Api.auth.clear();
    Api.saveSetup(Object.assign(Api.getSetup(), { url }));
    UI.toast('บันทึก URL แล้ว การเชื่อมต่อครั้งถัดไปจะขอรหัสผ่านใหม่');
    render(container);
  }

  function validGasUrl(url) {
    return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(String(url || ''));
  }

  async function saveStore(container) {
    const name = document.getElementById('s-store').value.trim();
    if (!name) { UI.toast('ระบุชื่อร้านก่อน', 'error'); return; }
    const btn = document.getElementById('s-save-store');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = UI.icon('progress_activity', 'spin') + ' กำลังบันทึก...';
    try {
      await Api.settings.set('storeName', name);
      Store.state.settings.storeName = name;
      Store.persist();
      UI.toast('บันทึกข้อมูลร้านแล้ว');
      render(container);
    } catch (err) { UI.toast(err.message, 'error'); }
    btn.disabled = false;
    btn.innerHTML = UI.icon('save') + ' บันทึกข้อมูลร้าน';
  }

  async function savePass(container) {
    const v = document.getElementById('s-pass').value;
    if (!/^\d{4}$/.test(v)) { UI.toast('รหัสผ่านต้องเป็นตัวเลข 4 หลัก', 'error'); return; }
    const btn = document.getElementById('s-save-pass');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = UI.icon('progress_activity', 'spin') + ' กำลังบันทึก...';
    try {
      await Api.settings.set('passcode', v);
      await Api.auth.rememberPin(v);
      UI.toast('เปลี่ยนรหัสผ่านแล้ว');
      document.getElementById('s-pass').value = '';
    } catch (err) { UI.toast(err.message, 'error'); }
    btn.disabled = false;
    btn.innerHTML = UI.icon('lock') + ' บันทึกรหัสผ่าน';
  }

  function clearCache(container) {
    UI.confirmDialog('ล้างแคชเครื่อง', 'ลบข้อมูลชั่วคราวบนเครื่อง? ข้อมูลใน Google Sheets ยังอยู่ครบ และจะโหลดใหม่เมื่อเชื่อมต่อ', () => {
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      UI.toast('ล้างแคชแล้ว');
      setTimeout(() => location.reload(), 500);
    });
  }

  // ---- PWA install ----
  let deferredPrompt = null;
  function captureInstall(e) {
    e.preventDefault();
    deferredPrompt = e;
  }
  function updateInstallButton() {
    const btn = document.getElementById('s-install');
    if (btn) btn.style.display = (deferredPrompt || window.matchMedia('(display-mode: standalone)').matches || isIOS()) ? '' : 'none';
  }
  function installPwa() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((r) => { if (r.outcome === 'accepted') UI.toast('ติดตั้งแอปแล้ว!'); });
      deferredPrompt = null;
    } else if (isIOS()) {
      UI.openModal({ title: 'ติดตั้งบน iPhone/iPad', body: '<p class="body">แตะปุ่ม <b>แชร์ ⎋</b> ที่แถบ Safari แล้วเลือก <b>"เพิ่มไปที่หน้าจอโฮม"</b> เพื่อติดตั้งแอป</p>', foot: [UI.modalBtn('เข้าใจแล้ว', 'btn-primary', () => UI.closeModal())] });
    } else {
      UI.toast('แตะที่ไอคอนเพิ่ม (＋) ในแถบ URL ของเบราว์เซอร์ แล้วเลือก "ติดตั้งแอป"');
    }
  }

  global.ViewSettings = { render, applyTheme, captureInstall, installPwa, updateInstallButton };
})(window);
