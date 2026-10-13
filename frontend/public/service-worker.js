/* Version the cache when the app-shell caching contract changes. */
const CACHE_NAME = 'construction-erp-shell-v1';
const APP_SHELL = [new URL('./', self.registration.scope).href, new URL('index.html', self.registration.scope).href];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter((name) => name.startsWith('construction-erp-shell-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scopePath)
    || url.pathname.includes('/api/') || url.pathname.includes('/uploads/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new URL('index.html', self.registration.scope), response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(new URL('index.html', self.registration.scope));
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  if (!/\.(?:js|css|woff2?|ttf|otf|svg|png|ico|webmanifest)$/.test(url.pathname)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    const cacheControl = response.headers.get('Cache-Control') || '';
    if (response.ok && !/no-store|private/i.test(cacheControl)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
