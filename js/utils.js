/* ChowHuay Pro — utils */
(function (global) {
  'use strict';

  function num(v) {
    const n = parseFloat(String(v === undefined || v === null ? 0 : v).replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function round2(n) { return Math.round((num(n) + Number.EPSILON) * 100) / 100; }

  function fmtMoney(n, withSymbol) {
    const v = round2(n);
    const s = v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return withSymbol === false ? s : '฿' + s;
  }

  function fmtInt(n) { return num(n).toLocaleString('th-TH'); }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return fmtDate(iso) + ' ' + fmtTime(iso);
  }

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 46656).toString(36);
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), ms);
    };
  }

  function loadImage(fileOrUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      if (typeof fileOrUrl === 'string') img.src = fileOrUrl;
      else img.src = URL.createObjectURL(fileOrUrl);
    });
  }

  // บีบอัดรูปเป็น dataURL (JPEG) เพื่อ upload ไป Drive — เร็ว/เบา
  async function compressImage(file, maxDim, quality) {
    const max = maxDim || 600;
    const q = quality || 0.82;
    const img = await loadImage(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    let scale = 1;
    if (w > max || h > max) scale = Math.min(max / w, max / h);
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    return canvas.toDataURL('image/jpeg', q);
  }

  function imgUrl(imgId, size) {
    if (!imgId) return '';
    return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(String(imgId)) + '&sz=' + (size || CONFIG.IMG_SIZE);
  }

  function sameDay(iso, dayStart) {
    const d = new Date(iso);
    if (isNaN(d)) return false;
    const ref = dayStart || new Date();
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
  }

  function startOfWeek() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7; // Monday=0
    d.setDate(d.getDate() - day);
    return d;
  }

  function startOfMonth() {
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  }

  function download(filename, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // Print an HTML document without window.open() — mobile browsers block popups
  // and kill the new window, which crashed the PDF/print flow. Uses a hidden
  // iframe instead; falls back to a Blob tab if iframe printing is unsupported.
  function printHTML(docHtml) {
    window.__printHTML = docHtml;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    const doc = win.document;
    doc.open();
    doc.write(docHtml);
    doc.close();
    const fire = () => {
      try {
        win.focus();
        win.print();
      } catch (e) {
        const url = URL.createObjectURL(new Blob([docHtml], { type: 'text/html;charset=utf-8' }));
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    };
    setTimeout(fire, 350);
    setTimeout(() => iframe.remove(), 60000);
  }

  // ---- browser notifications ----
  function notifySupported() {
    return typeof window.Notification !== 'undefined' && 'serviceWorker' in navigator;
  }
  function notifyPermission() {
    if (!notifySupported()) return 'unsupported';
    return Notification.permission; // granted | denied | default
  }
  function notifyRequest() {
    if (!notifySupported()) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    try { return Notification.requestPermission(); } catch (e) { return Promise.resolve('denied'); }
  }
  async function notifyShow(title, opts) {
    if (!notifySupported() || Notification.permission !== 'granted') return false;
    const options = Object.assign({}, opts || {});
    try {
      // Mobile Chrome/Android does not reliably support `new Notification()`.
      // A ServiceWorkerRegistration is the cross-platform PWA notification path.
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      return true;
    } catch (swError) {
      // Desktop fallback for browsers that expose Notification but reject SW display.
      try { new Notification(title, options); return true; } catch (e) { return false; }
    }
  }

  // ---- custom theme palette ----
  const CUSTOM_THEME_PROPS = [
    '--primary', '--on-primary', '--primary-container', '--on-primary-container',
    '--primary-fixed', '--on-primary-fixed', '--primary-fixed-dim', '--secondary',
    '--on-secondary', '--secondary-container', '--on-secondary-container',
    '--secondary-fixed', '--secondary-fixed-dim', '--tertiary', '--on-tertiary',
    '--tertiary-container', '--on-tertiary-container', '--surface-tint'
  ];

  function validHex(value) { return /^#[0-9a-f]{6}$/i.test(String(value || '')); }

  function hexToHsl(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hsl(h, s, l) {
    return 'hsl(' + ((h % 360) + 360) % 360 + ' ' + Math.max(0, Math.min(100, s)) + '% ' + Math.max(0, Math.min(100, l)) + '%)';
  }

  function relativeLuminance(hue, saturation, lightness) {
    const s = saturation / 100, l = lightness / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let rgb;
    if (hue < 60) rgb = [c, x, 0];
    else if (hue < 120) rgb = [x, c, 0];
    else if (hue < 180) rgb = [0, c, x];
    else if (hue < 240) rgb = [0, x, c];
    else if (hue < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    const linear = rgb.map((v) => {
      const channel = v + m;
      return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }

  function contrastText(hue, saturation, lightness) {
    return relativeLuminance(((hue % 360) + 360) % 360, saturation, lightness) > 0.179 ? '#101418' : '#ffffff';
  }

  function clearCustomTheme(root) {
    CUSTOM_THEME_PROPS.forEach((name) => root.style.removeProperty(name));
  }

  function applyCustomTheme(root, hex, mode) {
    if (!validHex(hex)) return false;
    const base = hexToHsl(hex);
    const saturation = Math.max(36, Math.min(86, base.s));
    const dark = mode === 'dark';
    const primaryL = dark ? 76 : Math.max(28, Math.min(48, base.l));
    const containerL = dark ? 34 : 88;
    const fixedL = dark ? 82 : 91;
    const secondaryH = base.h + 38;
    const tertiaryH = base.h + 155;
    const secondaryS = Math.max(28, Math.round(saturation * 0.62));
    const secondaryL = dark ? 74 : 36;
    const tertiaryL = dark ? 74 : 34;
    const values = {
      '--primary': hsl(base.h, saturation, primaryL),
      '--on-primary': contrastText(base.h, saturation, primaryL),
      '--primary-container': hsl(base.h, Math.max(30, saturation - 8), containerL),
      '--on-primary-container': contrastText(base.h, Math.max(30, saturation - 8), containerL),
      '--primary-fixed': hsl(base.h, Math.max(30, saturation - 12), fixedL),
      '--on-primary-fixed': contrastText(base.h, Math.max(30, saturation - 12), fixedL),
      '--primary-fixed-dim': hsl(base.h, Math.max(30, saturation - 10), dark ? 72 : 80),
      '--secondary': hsl(secondaryH, secondaryS, secondaryL),
      '--on-secondary': contrastText(secondaryH, secondaryS, secondaryL),
      '--secondary-container': hsl(secondaryH, Math.max(24, secondaryS - 6), dark ? 32 : 88),
      '--on-secondary-container': contrastText(secondaryH, Math.max(24, secondaryS - 6), dark ? 32 : 88),
      '--secondary-fixed': hsl(secondaryH, Math.max(24, secondaryS - 6), 88),
      '--secondary-fixed-dim': hsl(secondaryH, Math.max(24, secondaryS - 6), 78),
      '--tertiary': hsl(tertiaryH, Math.max(32, saturation - 16), tertiaryL),
      '--on-tertiary': contrastText(tertiaryH, Math.max(32, saturation - 16), tertiaryL),
      '--tertiary-container': hsl(tertiaryH, Math.max(26, saturation - 22), dark ? 32 : 88),
      '--on-tertiary-container': contrastText(tertiaryH, Math.max(26, saturation - 22), dark ? 32 : 88),
      '--surface-tint': hsl(base.h, saturation, primaryL)
    };
    Object.keys(values).forEach((name) => root.style.setProperty(name, values[name]));
    return true;
  }

  global.U = {
    num, round2, fmtMoney, fmtInt, fmtDate, fmtTime, fmtDateTime, todayStr,
    esc, uid, debounce, loadImage, compressImage, imgUrl, sameDay,
    startOfWeek, startOfMonth, download, printHTML,
    notifySupported, notifyPermission, notifyRequest, notifyShow,
    validHex, clearCustomTheme, applyCustomTheme
  };
})(window);
