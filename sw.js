// BFW Service Worker v3.0
// Bump CACHE with every deploy
const CACHE = 'bfw-v52';
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;700;800&family=DM+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  './fonts/DepartureMono-Regular.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CDN_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Skip non-GET requests
  if (e.request.method !== 'GET') return;

  // Dynamic APIs (game state, uploads, geo services): do NOT mediate at all.
  // Returning without respondWith lets the browser handle the request
  // natively — the SW can never turn a live connection into a phantom
  // "offline" failure, and API responses are never cached.
  if (
    url.includes('firebaseio.com') ||
    url.includes('cloudinary.com') ||
    url.includes('overpass') ||
    url.includes('nominatim')
  ) {
    return;
  }

  // Cache-first ONLY for CDN assets (fonts, leaflet)
  if (
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com') ||
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('DepartureMono')
  ) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // App shell & tiles: network-first, fall back to cache when offline.
  // The fallback must resolve to a real Response — an undefined from a
  // cache miss would poison the fetch with an opaque TypeError.
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(async () => (await caches.match(e.request)) || Response.error())
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Focus (or open) the app when a notification is tapped
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});

// Handle real push payloads (requires a push server / FCM to deliver these)
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { title: 'Transit Tournament', body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'Transit Tournament';
  e.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: data.tag || 'tt-push',
      renotify: true,
      vibrate: [60, 30, 60],
    })
  );
});
