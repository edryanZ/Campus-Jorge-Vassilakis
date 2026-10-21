'use strict';

const CACHE_NAME = 'campus-auditoria-v16-1-6';
const LOCAL_ASSETS = [
  './', './index.html', './styles.css', './app.js', './campus-data.js',
  './audit-data.js', './audit-storage.js', './audit-sync-core.js', './audit-remote.js', './audit-app.js',
  './supabase-config.js', './manifest.webmanifest'
];
const SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(LOCAL_ASSETS);
    try { await cache.add(SUPABASE_SDK); } catch (error) { console.warn('[ServiceWorker] SDK remoto não foi pré-armazenado.', error); }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;
  const isPinnedSdk = event.request.url === SUPABASE_SDK;
  if (!isLocal && !isPinnedSdk) return;

  if (event.request.mode === 'navigate' || url.pathname.endsWith('/supabase-config.js')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
        return response;
      } catch (_error) {
        return (await caches.match(event.request)) || (await caches.match('./index.html'));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, response.clone());
    }
    return response;
  })());
});
