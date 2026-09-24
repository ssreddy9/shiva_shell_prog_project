// Offline support: cache the app shell, serve it cache-first, refresh in the background.
const VERSION = 'lifelog-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/backup.js',
  './js/charts.js',
  './js/crypto.js',
  './js/db.js',
  './js/ics.js',
  './js/kinds.js',
  './js/seed.js',
  './js/stats.js',
  './js/theme.js',
  './js/ui.js',
  './js/views/calendar.js',
  './js/views/entry.js',
  './js/views/feed.js',
  './js/views/grow.js',
  './js/views/money.js',
  './js/views/more.js',
  './js/views/schedule.js',
  './js/views/search.js',
  './js/views/settings.js',
  './js/views/today.js',
  './js/views/vault.js',
  './js/views/write.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const key = req.mode === 'navigate' ? './index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    const fresh = fetch(req).then(res => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
