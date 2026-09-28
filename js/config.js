/* ChowHuay Pro — Config */
window.CONFIG = {
  APP_VERSION: '1.3.0',
  // Bump when a deploy changes cacheable assets. App compares this against
  // localStorage and self-reloads once so stale PWAs pick up the new bundle.
  BOOT_VERSION: 16,
  // ตั้งค่า URL ของ Google Apps Script Web App (จบด้วย /exec)
  // ตัวอย่าง: 'https://script.google.com/macros/s/AKfycb.../exec'
  GAS_URL: 'https://script.google.com/macros/s/AKfycbwhCyCvUC2RNWJN_wSITsPAPAJSz5jKSoqEJrWq_8YIpy4nPzl475lM8shbpFkSKfg6kA/exec',
  // ขนาดรูป thumbnail ที่โหลดจาก Google Drive (w320 = เบา/เร็ว)
  IMG_SIZE: 'w320',
  STORAGE_KEY: 'ch_data_v1',
  SETUP_KEY: 'ch_setup_v1',
  THEME_KEY: 'ch_theme_v1',
  // ระบบชื่อหน้า (hash router)
  ROUTES: ['dashboard', 'pos', 'inventory', 'reports', 'settings']
};
