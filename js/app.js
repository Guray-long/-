/* ChowHuay Pro — App boot: passcode, router, nav, sync, PWA */
(function (global) {
  'use strict';

  // Self-heal: when the deployed bundle version changes, clear stale caches and
  // reload once so installed PWAs never run an old bundle. Skipped in test mode.
  (async function selfHeal() {
    if (global.__TEST_MODE) return;
    try {
      const key = CONFIG.SETUP_KEY + ':v';
      if (String(localStorage.getItem(key)) === String(CONFIG.BOOT_VERSION)) return;
      localStorage.setItem(key, String(CONFIG.BOOT_VERSION));
      if (window.caches && window.caches.keys) {
        const keys = await window.caches.keys();
        if (keys.length) await Promise.all(keys.map((c) => window.caches.delete(c)));
      }
      if (location.reload) location.reload();
    } catch (e) { /* keep going */ }
  })();

  let unlocked = false;
  let pin = '';
  let lastLowStockAlertAt = 0;
  const MAX_PIN = 4;

  const App = {
    route: 'dashboard',
    offline: false,

    init() {
      Store.loadCache();
      applySavedTheme();
      Store.state.settings = Store.state.settings || {};

      bindNav();
      bindPasscode();
      bindTopbar();
      bindGlobal();

      // PWA
      window.addEventListener('beforeinstallprompt', (e) => ViewSettings.captureInstall(e));
      registerSW();
      checkConnection();

      document.addEventListener('app:restock', (e) => {
        const prod = e.detail;
        location.hash = '#/inventory';
        setTimeout(() => ViewInventory.openRestock(prod), 60);
      });
    },

    unlock(pinOk) {
      unlocked = true;
      const overlay = document.getElementById('passcode-overlay');
      const shell = document.getElementById('app-shell');
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      shell.classList.remove('hidden');
      shell.removeAttribute('aria-hidden');
      route();
    },

    lock(message) {
      unlocked = false;
      pin = '';
      const overlay = document.getElementById('passcode-overlay');
      const shell = document.getElementById('app-shell');
      shell.classList.add('hidden');
      shell.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('hidden');
      overlay.removeAttribute('aria-hidden');
      document.querySelectorAll('.pin-dot').forEach((d) => { d.className = 'pin-dot'; });
      const status = document.getElementById('pin-status');
      if (status) status.textContent = message || 'กรุณาใส่รหัสผ่านอีกครั้ง';
      const firstKey = overlay.querySelector('.numpad button');
      if (firstKey) firstKey.focus();
    },

    renderView() {
      if (!unlocked) return;
      const containers = {
        dashboard: document.getElementById('view-dashboard'),
        pos: document.getElementById('view-pos'),
        inventory: document.getElementById('view-inventory'),
        reports: document.getElementById('view-reports'),
        settings: document.getElementById('view-settings')
      };
      const c = containers[this.route] || containers.dashboard;
      Object.keys(containers).forEach((k) => containers[k].classList.remove('active'));
      c.classList.add('active');
      try {
        if (this.route === 'dashboard') ViewDashboard.render(c);
        else if (this.route === 'pos') ViewPos.render(c);
        else if (this.route === 'inventory') ViewInventory.render(c);
        else if (this.route === 'reports') ViewReports.render(c);
        else if (this.route === 'settings') ViewSettings.render(c);
      } catch (err) {
        c.innerHTML = '<div class="empty-state" role="alert"><span class="material-symbols-outlined" aria-hidden="true">error</span><p class="body">เปิดหน้านี้ไม่สำเร็จ: ' + U.esc(err.message || err) + '</p><button class="btn btn-primary" data-retry-view>ลองอีกครั้ง</button></div>';
      }
      if (!Api.isConfigured() && !Store.state.syncedAt && this.route !== 'settings') {
        UI.toast('ยังไม่ได้เชื่อมต่อฐานข้อมูล ไปที่การตั้งค่าเพื่อตั้งค่า Apps Script', 'error');
      }
    },

    refresh() {
      return refreshSilent();
    },

    checkAlerts() {
      checkLowStockAlerts();
    }
  };

  function applySavedTheme() {
    let t = { theme: 'blue', mode: 'light' };
    try { t = Object.assign(t, JSON.parse(localStorage.getItem(CONFIG.THEME_KEY) || '{}')); } catch (e) {}
    const root = document.documentElement;
    root.dataset.theme = t.theme;
    root.dataset.mode = t.mode;
    if (t.theme === 'custom' && U.validHex(t.customColor)) U.applyCustomTheme(root, t.customColor, t.mode);
    else U.clearCustomTheme(root);
  }

  function refreshSilent() {
    return Api.isConfigured() && Api.auth.hasSession()
      ? Store.refresh().then(() => {
        App.offline = false;
        updateSyncStatus('synced');
        ViewSettings.updateInstallButton();
        checkLowStockAlerts();
      }).catch((err) => {
        updateSyncStatus('error');
        console.warn('sync fail', err);
        throw err;
      })
      : Promise.resolve();
  }

  function checkConnection() {
    updateSyncStatus('checking');
    if (!Api.isConfigured()) { updateSyncStatus('setup'); return; }
    Api.ping().then(() => updateSyncStatus('ready')).catch(() => updateSyncStatus('offline'));
  }

  function updateSyncStatus(state) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    const labels = {
      checking: 'กำลังตรวจสอบการเชื่อมต่อ', ready: 'พร้อมเชื่อมต่อ', syncing: 'กำลังซิงก์ข้อมูล',
      synced: 'ข้อมูลเป็นปัจจุบัน', error: 'ซิงก์ไม่สำเร็จ กดลองใหม่', offline: 'ออฟไลน์ ใช้ข้อมูลล่าสุดในเครื่อง',
      setup: 'ยังไม่ได้เชื่อมต่อฐานข้อมูล'
    };
    el.dataset.state = state;
    el.textContent = labels[state] || '';
  }

  // ---- low-stock browser notifications (every completed app check/sync) ----
  async function checkLowStockAlerts() {
    if (!U.notifySupported() || U.notifyPermission() !== 'granted') return;
    const setup = Api.getSetup();
    if (!setup.notify) return;
    // lowStock and outOfStock can overlap; keep one authoritative entry per product.
    const low = Array.from(new Map(
      Store.lowStock().concat(Store.outOfStock()).map((p) => [String(p.id), p])
    ).values());
    if (!low.length) return;

    // Store.refresh and the view can finish together. Collapse only that accidental
    // double-fire; a later open or sync always alerts again as requested.
    const now = Date.now();
    if (now - lastLowStockAlertAt < 2000) return;
    lastLowStockAlertAt = now;

    const storeName = (Store.state.settings && Store.state.settings.storeName) || 'ChowHuay Pro';
    const outCount = low.filter((p) => U.num(p.stock) <= 0).length;
    const preview = low.slice(0, 3).map((p) =>
      p.name + ' เหลือ ' + U.fmtInt(p.stock) + ' ' + (p.unit || 'ชิ้น')
    ).join(' · ');
    const more = low.length > 3 ? ' · และอีก ' + (low.length - 3) + ' รายการ' : '';
    const title = storeName + ': สต็อกต่ำ ' + low.length + ' รายการ';
    const url = location.origin + location.pathname + '#/inventory';
    await U.notifyShow(title, {
      body: preview + more + (outCount ? ' (หมด ' + outCount + ' รายการ)' : ''),
      icon: new URL('icons/icon-192.png', location.href).href,
      badge: new URL('icons/icon-192.png', location.href).href,
      tag: 'chowhuay-low-stock',
      renotify: true,
      silent: false,
      data: { url: url }
    });
  }

  function route() {
    const h = (location.hash || '#/dashboard').replace(/^#\/?/, '');
    App.route = CONFIG.ROUTES.includes(h) ? h : 'dashboard';
    document.querySelectorAll('[data-route]').forEach((el) => {
      const on = el.dataset.route === App.route;
      el.classList.toggle('active', on);
      if (on) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    App.renderView();
    window.scrollTo(0, 0);
    const main = document.getElementById('main-content');
    if (main) main.focus({ preventScroll: true });
  }

  function bindNav() {
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-route]');
      if (nav) {
        location.hash = '#/' + nav.dataset.route;
      }
    });
    window.addEventListener('hashchange', route);
  }

  function bindTopbar() {
    const syncBtn = document.getElementById('topbar-sync');
    if (syncBtn) syncBtn.addEventListener('click', async () => {
      if (syncBtn.disabled) return;
      if (Api.isConfigured() && !Api.auth.hasSession()) {
        App.lock('ใส่รหัสผ่านเพื่อซิงก์ข้อมูลล่าสุด');
        return;
      }
      syncBtn.disabled = true;
      syncBtn.setAttribute('aria-busy', 'true');
      updateSyncStatus('syncing');
      syncBtn.style.transform = 'rotate(360deg)';
      syncBtn.style.transition = 'transform 0.4s';
      if (Api.isConfigured()) {
        try {
          await refreshSilent();
          UI.toast('ข้อมูลเป็นปัจจุบันแล้ว');
        } catch (err) {
          UI.toast(err.message || 'ซิงก์ไม่สำเร็จ กดลองอีกครั้ง', 'error');
        }
      } else {
        UI.toast('ยังไม่ได้ตั้งค่า Apps Script URL', 'error');
        location.hash = '#/settings';
      }
      setTimeout(() => { syncBtn.style.transform = ''; syncBtn.style.transition = ''; }, 450);
      syncBtn.disabled = false;
      syncBtn.removeAttribute('aria-busy');
      App.renderView();
    });
  }

  // ---- passcode ----
  function bindPasscode() {
    const dots = document.querySelectorAll('.pin-dot');
    window.enterPin = function (n) {
      if (pin.length >= MAX_PIN) return;
      pin += n;
      updateDots(dots);
      if (pin.length === MAX_PIN) {
        setTimeout(() => verifyPin(dots), 120);
      }
    };
    window.deletePin = function () {
      pin = pin.slice(0, -1);
      updateDots(dots);
    };

    const status = document.getElementById('pin-status');
    const setStatus = (t) => { if (status) status.textContent = t || ''; };

    const retry = document.getElementById('pin-retry');
    if (retry) retry.addEventListener('click', async () => {
      retry.disabled = true;
      setStatus('กำลังตรวจสอบการเชื่อมต่อ...');
      try {
        await Api.ping();
        setStatus('เชื่อมต่อได้แล้ว กรุณาใส่รหัสผ่าน');
        updateSyncStatus('ready');
      } catch (err) {
        setStatus('ยังเชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง');
        updateSyncStatus('offline');
      }
      retry.disabled = false;
    });

    const reset = document.getElementById('pin-reset');
    if (reset) reset.addEventListener('click', () => {
      if (reset.dataset.arm !== '1') {
        reset.dataset.arm = '1';
        reset.textContent = 'แน่ใจ? กดอีกครั้ง';
        setTimeout(() => { reset.dataset.arm = ''; reset.textContent = 'รีเซ็ตแอป'; }, 3000);
        return;
      }
      try {
        if (navigator.serviceWorker) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
        if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
      } catch (e) {}
      Object.keys(localStorage).forEach((k) => { if (k.indexOf('ch_') === 0 && k !== 'ch_setup_v1') localStorage.removeItem(k); });
      location.reload();
    });

  }

  function updateDots(dots) {
    dots.forEach((d, i) => {
      d.className = 'pin-dot' + (i < pin.length ? ' filled' : '');
    });
  }

  async function verifyPin(dots) {
    const status = document.getElementById('pin-status');
    const setStatus = (t) => { if (status) status.textContent = t || ''; };
    setStatus('กำลังตรวจสอบและโหลดข้อมูล...');
    let accepted = false;
    try {
      if (!Api.isConfigured()) throw new ApiError('NO_SETUP', 'ยังไม่ได้เชื่อมต่อฐานข้อมูล');
      const auth = await Api.auth.login(pin);
      Store.state.settings = auth.settings || {};
      await Store.refresh();
      accepted = true;
      App.offline = false;
      updateSyncStatus('synced');
    } catch (err) {
      if ((err.code === 'NETWORK' || err.code === 'TIMEOUT') && Store.state.syncedAt && await Api.auth.verifyRememberedPin(pin)) {
        accepted = true;
        App.offline = true;
        updateSyncStatus('offline');
        UI.toast('เปิดแบบออฟไลน์ ใช้ข้อมูลล่าสุดในเครื่อง', 'error');
      } else {
        setStatus(err.message || 'ตรวจสอบรหัสผ่านไม่สำเร็จ กรุณาลองอีกครั้ง');
      }
    }
    if (accepted) {
      setStatus('');
      dots.forEach((d) => d.classList.add('success'));
      setTimeout(() => {
        pin = '';
        updateDots(dots);
        App.unlock(true);
      }, 250);
    } else {
      dots.forEach((d) => d.classList.add('error'));
      const wrap = document.querySelector('.pin-dots');
      if (wrap) wrap.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 350 });
      setTimeout(() => {
        pin = '';
        updateDots(dots);
      }, 450);
    }
  }

  function bindGlobal() {
    document.addEventListener('keydown', (e) => {
      if (!unlocked && /^\d$/.test(e.key)) { e.preventDefault(); window.enterPin(Number(e.key)); }
      else if (!unlocked && e.key === 'Backspace') { e.preventDefault(); window.deletePin(); }
    });
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-retry-view]')) App.renderView();
    });
    window.addEventListener('online', () => { checkConnection(); UI.toast('กลับมาออนไลน์แล้ว กดซิงก์เพื่ออัปเดตข้อมูล'); });
    window.addEventListener('offline', () => { App.offline = true; updateSyncStatus('offline'); });
    window.addEventListener('app:auth-required', () => App.lock('เซสชันหมดอายุ กรุณาใส่รหัสผ่านอีกครั้ง'));
  }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW fail', err));
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'navigate' && e.data.hash) location.hash = e.data.hash;
      });
    }
  }

  global.App = App;
})(window);
