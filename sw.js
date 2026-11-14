'use strict';

const CACHE_NAME = 'campus-auditoria-v16-5-2-seguranca-cache';
const APP_CACHE_PREFIX = 'campus-auditoria-';
const LOCAL_ASSETS = [
  './', './index.html', './styles.css', './app.js', './campus-data.js',
  './audit-data.js', './audit-storage.js', './audit-sync-core.js', './audit-remote.js', './audit-app.js',
  './campus-insights.js', './patrimonio.js', './audit-validation.js', './audit-backup.js',
  './supabase-config.js', './manifest.webmanifest'
];
const SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js';
// Não armazenar recursos arbitrários da origem: somente arquivos desta PWA.
const CACHED_PATHS = new Set(LOCAL_ASSETS.map(asset => new URL(asset, self.registration.scope).pathname));

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
    await Promise.all(keys.filter(key => key.startsWith(APP_CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;
  const isPinnedSdk = event.request.url === SUPABASE_SDK;
  // Somente a entrada estática do app é atendida offline. Não interceptar
  // rotas de outros serviços da mesma origem (ex.: respostas de API).
  const isPageNavigation = isLocal && event.request.mode === 'navigate' &&
    CACHED_PATHS.has(url.pathname);
  const isLocalAsset = isLocal && CACHED_PATHS.has(url.pathname);
  if (!isPageNavigation && !isLocalAsset && !isPinnedSdk) return;

  if (isPageNavigation || (isLocalAsset && url.pathname.endsWith('/supabase-config.js'))) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        // URLs de login podem carregar ?code=, ?token= ou outros dados:
        // nunca persistir variantes com parâmetros de autenticação.
        if (response.ok && !url.search) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
          } catch (error) { console.warn('[ServiceWorker] Falha ao armazenar página, sem bloquear navegação:', error); }
        }
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
    if (response.ok || (isPinnedSdk && response.type === 'opaque')) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      } catch (error) { console.warn('[ServiceWorker] Espaço de cache insuficiente; recurso entregue pela rede:', error); }
    }
    return response;
  })());
});
