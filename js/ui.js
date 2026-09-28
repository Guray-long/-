/* ChowHuay Pro — UI helpers: toast, modal, confirm, icons, badges */
(function (global) {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function icon(name, cls) {
    return '<span class="material-symbols-outlined ' + (cls || '') + '" aria-hidden="true">' + name + '</span>';
  }

  // ---- toast ----
  const toastWrap = document.createElement('div');
  toastWrap.className = 'toast-wrap';
  toastWrap.setAttribute('aria-live', 'polite');
  toastWrap.setAttribute('aria-atomic', 'true');
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(toastWrap));

  function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'success');
    t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    t.innerHTML = '<span class="toast-ic material-symbols-outlined" aria-hidden="true">' + (type === 'error' ? 'error' : 'check_circle') + '</span><span>' + U.esc(msg) + '</span>';
    toastWrap.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, 2600);
  }

  // ---- modal (bottom sheet on mobile) ----
  let modalRoot = null;
  let returnFocus = null;
  function ensureModal() {
    if (modalRoot) return modalRoot;
    modalRoot = document.createElement('div');
    modalRoot.className = 'modal-backdrop hidden';
    modalRoot.innerHTML = '<div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h3 class="h3" id="modal-title" data-mtitle></h3><button class="btn-icon" type="button" data-mclose aria-label="ปิดหน้าต่าง">' + icon('close') + '</button></div><div class="modal-body" data-mbody></div><div class="modal-foot" data-mfoot></div></div>';
    modalRoot.addEventListener('click', (e) => {
      if (e.target === modalRoot || e.target.closest('[data-mclose]')) closeModal();
    });
    modalRoot.addEventListener('keydown', trapModalKeys);
    document.body.appendChild(modalRoot);
    return modalRoot;
  }

  function openModal(opts) {
    const root = ensureModal();
    returnFocus = document.activeElement;
    root.querySelector('[data-mtitle]').textContent = opts.title || '';
    const body = root.querySelector('[data-mbody]');
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else { body.innerHTML = ''; body.appendChild(opts.body); }
    const foot = root.querySelector('[data-mfoot]');
    foot.innerHTML = '';
    (opts.foot || []).forEach((btn) => foot.appendChild(btn));
    root.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const focusTarget = root.querySelector('[autofocus], input:not([type="hidden"]), select, textarea, button:not([disabled])');
      if (focusTarget) focusTarget.focus();
    });
  }

  function closeModal() {
    if (!modalRoot) return;
    modalRoot.classList.add('hidden');
    document.body.style.overflow = '';
    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
    returnFocus = null;
  }

  function trapModalKeys(e) {
    if (!modalRoot || modalRoot.classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key !== 'Tab') return;
    const focusable = Array.from(modalRoot.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function modalBtn(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = 'btn ' + (cls || 'btn-tonal');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  // ---- confirm dialog ----
  function confirmDialog(title, message, onOk, opts) {
    const o = opts || {};
    const okBtn = modalBtn(o.okLabel || 'ลบข้อมูล', 'btn-danger', () => { closeModal(); onOk && onOk(); });
    const cancelBtn = modalBtn('ยกเลิก', 'btn-ghost', () => closeModal());
    openModal({
      title,
      body: '<p class="body">' + U.esc(message) + '</p>',
      foot: [cancelBtn, okBtn]
    });
  }

  function loadingHTML(text) {
    return '<div class="empty-state" role="status" aria-live="polite"><span class="material-symbols-outlined" aria-hidden="true">hourglass_empty</span><p class="body">' + U.esc(text || 'กำลังโหลด...') + '</p></div>';
  }

  function badge(type, label) {
    return '<span class="badge badge-' + type + '">' + label + '</span>';
  }

  global.UI = { $, $$, icon, toast, openModal, closeModal, modalBtn, confirmDialog, loadingHTML, badge };
})(window);
