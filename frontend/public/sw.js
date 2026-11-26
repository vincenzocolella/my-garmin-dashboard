// Offline shell for the installed app. Only same-origin files are cached: API calls (Render backend,
// Gemini, OpenAI) always go to the network, data offline comes from the app's own localStorage cache.
const CACHE = 'garmin-dashboard-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const put = (res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? '/' : req, copy));
    }
    return res;
  };
  // pages: network first, so a new deploy shows up immediately; cached shell when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(put).catch(() => caches.match('/')));
    return;
  }
  // hashed build assets never change: cache first
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then(put)));
    return;
  }
  // everything else: cached copy right away, refreshed in the background
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then(put).catch(() => hit);
    return hit ?? net;
  }));
});
