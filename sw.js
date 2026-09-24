// Offline support. Network-first: when online you always get the latest
// version (revalidated past the browser's HTTP cache); the cached copy is
// only used when offline.
const VERSION = 'dinalekha-v11';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fonts/plus-jakarta-sans.woff2',
  './fonts/instrument-serif.woff2',
  './fonts/instrument-serif-italic.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/app.js',
  './js/sync.js',
  './js/remote.js',
  './js/config.js',
  './js/auth.js',
  './js/account.js',
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
  './js/vendor/supabase.js',
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
  // cache: 'reload' skips the browser HTTP cache so a new version never caches stale files
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const key = req.mode === 'navigate' ? './index.html' : req;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(key, res.clone());
      return res;
    } catch {
      return (await cache.match(key, { ignoreSearch: true })) || Response.error();
    }
  })());
});
