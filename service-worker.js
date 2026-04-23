const CACHE_VERSION = 'v1.4.1';
const CACHE_NAME = `ledger-pwa-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/calendar.css',
  './css/tx-form.css',
  './css/modules.css',
  './js/register-sw.js',
  './js/db-schema.js',
  './js/db-core.js',
  './js/repo-accounts.js',
  './js/repo-categories.js',
  './js/repo-transactions.js',
  './js/repo-misc.js',
  './js/db-seed.js',
  './js/ui-utils.js',
  './js/ui-sheet.js',
  './js/ui-budget-panel.js',
  './js/calendar-view.js',
  './js/year-view.js',
  './js/day-detail.js',
  './js/tx-form.js',
  './js/page-categories.js',
  './js/page-stats.js',
  './js/page-budgets.js',
  './js/page-list.js',
  './js/page-accounts.js',
  './js/page-settings.js',
  './js/page-calendar.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((n) => n.startsWith('ledger-pwa-') && n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        if (resp && resp.status === 200 && url.origin === location.origin) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return resp;
      }).catch(() => {
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
