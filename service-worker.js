/* Date Night Decider service worker — cache reset for build 2.5.1.
   Local app assets are network-first so deployments update promptly; cache is
   used as a fallback when offline. */
'use strict';

const CACHE_NAME = 'date-night-decider-v2.5.1';
const LEGACY_CACHE_PREFIX = 'date-night-decider-';
const APP_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(LEGACY_CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);

  // Preserve a cache-assisted path for the external libraries used by the app.
  if (url.origin !== self.location.origin) {
    if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'unpkg.com') {
      event.respondWith(
        caches.match(request).then(async cached => {
          try {
            const response = await fetch(request);
            if (response && (response.ok || response.type === 'opaque')) {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(request, response.clone());
            }
            return response;
          } catch (error) {
            if (cached) return cached;
            throw error;
          }
        })
      );
    }
    return;
  }

  // Let requests outside this app's GitHub Pages folder behave normally.
  if (!url.pathname.startsWith(scopeUrl.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = request.mode === 'navigate'
      ? new URL('./index.html', self.registration.scope).href
      : request;

    try {
      // Network-first prevents an old app.js/index.html staying visible online.
      const response = await fetch(request);
      if (response && response.ok) {
        await cache.put(cacheKey, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request, { ignoreSearch: true })
        || await cache.match(cacheKey, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const indexFallback = await cache.match(new URL('./index.html', self.registration.scope).href);
        if (indexFallback) return indexFallback;
      }
      throw error;
    }
  })());
});
