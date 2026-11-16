/* Offline support: serve saved files first, refresh them in the background.
   Bump CACHE when you want every device to drop its old copy immediately. */
const CACHE = 'clymait-v6';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'css/theme.css',
  'js/app.js',
  'js/rules.js',
  'js/rotation-engine.js',
  'js/fields.js',
  'js/planner-engine.js',
  'js/planner.js',
  'js/dashboard.js',
  'data/site_data.js',
  'assets/clymait.svg',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { event.waitUntil(network); return hit; }
    return (await network) || (await cache.match('index.html')) || Response.error();
  })());
});
