// sw.js
// Service Worker básico con estrategia Cache First (App Shell).
// Asincronía solo con .then(), .catch() y Promise.all().

const CACHE_STATIC_NAME = 'static-camara-v4';
const STATIC_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Instalando', CACHE_STATIC_NAME);
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME)
      // cache: 'reload' ignora la caché HTTP del navegador (GitHub Pages usa max-age=600)
      // para que la nueva versión no precachee archivos viejos
      .then((cache) => cache.addAll(
        STATIC_FILES.map((url) => new Request(url, { cache: 'reload' }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activando', CACHE_STATIC_NAME);
  event.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_STATIC_NAME)
          .map((nombre) => caches.delete(nombre))
      ))
      .then(() => self.clients.claim())
  );
});

// Cache First: primero la caché; si no está, la red (y se guarda para después)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true })
      .then((respuestaCache) => {
        if (respuestaCache) return respuestaCache;

        return fetch(req).then((respuestaRed) => {
          if (respuestaRed && respuestaRed.ok) {
            const copia = respuestaRed.clone();
            caches.open(CACHE_STATIC_NAME).then((cache) => cache.put(req, copia));
          }
          return respuestaRed;
        });
      })
      .catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 503, statusText: 'Offline' });
      })
  );
});
