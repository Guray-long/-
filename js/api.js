/* ChowHuay Pro — Google Apps Script API client */
(function (global) {
  'use strict';

  class ApiError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }

  const SESSION_KEY = 'ch_session_v1';
  const PIN_HASH_KEY = 'ch_pin_hash_v1';

  function getSetup() {
    try {
      const setup = JSON.parse(localStorage.getItem(CONFIG.SETUP_KEY) || '{}');
      if (Object.prototype.hasOwnProperty.call(setup, 'passcode')) {
        delete setup.passcode;
        localStorage.setItem(CONFIG.SETUP_KEY, JSON.stringify(setup));
      }
      return setup;
    } catch (e) { return {}; }
  }
  function saveSetup(s) {
    localStorage.setItem(CONFIG.SETUP_KEY, JSON.stringify(s));
  }
  function gasUrl() {
    const s = getSetup();
    return (s.url || CONFIG.GAS_URL || '').trim().replace(/\/+$/, '');
  }
  function isConfigured() { return !!gasUrl(); }

  function sessionToken() {
    try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch (e) { return ''; }
  }
  function setSession(token) {
    try {
      if (token) sessionStorage.setItem(SESSION_KEY, token);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  async function pinHash(pin, salt) {
    if (!global.crypto || !global.crypto.subtle || !global.TextEncoder) return '';
    const bytes = new TextEncoder().encode('chowhuay-pro:' + String(salt) + ':' + String(pin));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((n) => n.toString(16).padStart(2, '0')).join('');
  }

  async function rememberPin(pin) {
    if (!global.crypto || !global.crypto.getRandomValues) return;
    const random = new Uint32Array(4);
    global.crypto.getRandomValues(random);
    const salt = Array.from(random).map((n) => n.toString(16).padStart(8, '0')).join('');
    const hash = await pinHash(pin, salt);
    if (hash) localStorage.setItem(PIN_HASH_KEY, salt + ':' + hash);
  }

  async function verifyRememberedPin(pin) {
    const saved = localStorage.getItem(PIN_HASH_KEY) || '';
    const parts = saved.split(':');
    return parts.length === 2 && !!parts[0] && parts[1] === await pinHash(pin, parts[0]);
  }

  async function call(action, body, opts) {
    const options = opts || {};
    const url = gasUrl();
    if (!url) throw new ApiError('NO_SETUP', 'ยังไม่ได้ตั้งค่า Apps Script URL');
    const sep = url.indexOf('?') >= 0 ? '&' : '?';
    const payload = Object.assign({}, body || {});
    if (!options.public) {
      const token = sessionToken();
      if (!token) throw new ApiError('AUTH_REQUIRED', 'กรุณาใส่รหัสผ่านเพื่อเชื่อมต่อข้อมูล');
      payload.token = token;
    }
    let res;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), options.timeout || 20000) : null;
    try {
      const testSuffix = window.__TEST_MODE && action !== 'auth:login' ? '&sheet=test' : '';
      res = await fetch(url + sep + 'action=' + encodeURIComponent(action) + '&_=' + Date.now() + testSuffix, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      });
    } catch (e) {
      const timedOut = e && e.name === 'AbortError';
      throw new ApiError(timedOut ? 'TIMEOUT' : 'NETWORK', timedOut ? 'เซิร์ฟเวอร์ตอบช้าเกินไป กรุณาลองอีกครั้ง' : 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      if (timer) clearTimeout(timer);
    }
    let data, txt = '';
    try {
      txt = await res.text();
      data = JSON.parse(txt);
    } catch (e) {
      throw new ApiError('BAD_RESPONSE', 'ตอบกลับผิดรูปแบบ: ' + txt.slice(0, 200));
    }
    if (!data || data.ok !== true) {
      if (data && data.code === 'AUTH_REQUIRED') {
        setSession('');
        global.dispatchEvent(new CustomEvent('app:auth-required'));
      }
      throw new ApiError((data && data.code) || 'API', (data && data.error) || 'ข้อผิดพลาดจากเซิร์ฟเวอร์');
    }
    return data;
  }

  async function ping() { return call('ping', {}, { public: true, timeout: 12000 }); }

  async function login(pin) {
    const data = await call('auth:login', { pin: String(pin) }, { public: true, timeout: 20000 });
    setSession(data.token);
    await rememberPin(pin);
    return data;
  }

  async function logout() {
    const token = sessionToken();
    if (token) await call('auth:logout', {}).catch(() => {});
    setSession('');
  }

  async function loadAll(since) {
    return call('getAll', since ? { since } : {});
  }

  const Api = {
    call, ping, loadAll,
    gasUrl, isConfigured, getSetup, saveSetup,
    auth: { login, logout, clear: () => setSession(''), hasSession: () => !!sessionToken(), rememberPin, verifyRememberedPin },
    product: {
      create: (p) => call('product:create', { product: p }),
      update: (p) => call('product:update', { product: p }),
      remove: (id) => call('product:delete', { id }),
      adjust: (id, delta) => call('product:adjust', { id, delta }),
      adjustBatch: (adjustments) => call('product:adjustBatch', { adjustments }, { timeout: 45000 })
    },
    sale: {
      create: (s) => call('sale:create', { sale: s }),
      remove: (id) => call('sale:delete', { id })
    },
    purchase: {
      create: (p) => call('purchase:create', { purchase: p }),
      update: (p) => call('purchase:update', { purchase: p }),
      remove: (id) => call('purchase:delete', { id })
    },
    category: {
      create: (name) => call('category:create', { name }),
      remove: (name) => call('category:delete', { name })
    },
    settings: {
      get: () => call('settings:get', {}),
      set: (key, value) => call('settings:set', { key, value })
    },
    image: {
      upload: (b64, filename) => call('image:upload', { b64, filename }),
      remove: (id) => call('image:delete', { id })
    }
  };

  global.ApiError = ApiError;
  global.Api = Api;
})(window);
