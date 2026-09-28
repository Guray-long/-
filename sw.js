/* ChowHuay Pro — Service Worker
 * Static assets: cache-first (offline app shell).
 * Data (Apps Script POST): never cached by SW (app manages its own cache).
 * Images (Drive thumbs) & fonts: cache-first with background refresh.
 */
const CACHE = 'chowhuay-v16';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/config.js',
  './js/utils.js',
  './js/api.js',
  './js/store.js',
  './js/ui.js',
  './js/views/dashboard.js',
  './js/views/pos.js',
  './js/views/inventory.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './js/app.js',
  './vendor/chart.umd.min.js',
  './vendor/xlsx.full.min.js',
  './vendor/html5-qrcode.min.js',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = req.url;

  // Never touch Apps Script API POSTs
  if (req.method !== 'GET') return;

  // Fonts + Drive images: stale-while-revalidate (fast, refreshes in bg)
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') || url.includes('drive.google.com')) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const cached = await c.match(req);
        const fetchP = fetch(req).then((res) => {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetchP;
      })
    );
    return;
  }

  // Navigations: network first, fall back to cached app shell (offline)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else static: cache-first
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
    )
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || (self.registration.scope + '#/inventory');
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const targetOrigin = new URL(targetUrl).origin;
      for (const client of windows) {
        if (new URL(client.url).origin === targetOrigin) {
          client.postMessage({ type: 'navigate', hash: '#/inventory' });
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    })
  );
});
