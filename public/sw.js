// Playroom PWA Production Service Worker
// Version: 2026.09.21.2
const PLAYROOM_APP_VERSION = '2026.09.21.2';
const CACHE_NAME = `playroom-pwa-${PLAYROOM_APP_VERSION}`;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.png',
];

// Install: Precache shell assets and optionally activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn('[SW] Precache non-blocking error:', err);
        });
      })
      .then(() => {
        // Automatically skip waiting during installation so existing PWAs update seamlessly
        return self.skipWaiting();
      })
  );
});

// Activate: Delete all obsolete cache versions and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              console.log('[SW] Purging obsolete cache:', name);
              return caches.delete(name);
            }
            return Promise.resolve();
          })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

// Listen for direct SKIP_WAITING message from client version detector
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch Strategy:
// 1. Never cache dynamic APIs, version.json, Google Billing, or Supabase
// 2. Navigation / HTML: NETWORK-FIRST (fetch latest from network when online to discover updates; fallback to cache only when offline)
// 3. Static assets (JS/CSS/images): Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Real-time & bypass checks: version.json, APIs, Supabase, Google Play
  if (
    url.pathname === '/version.json' ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('play.google.com') ||
    url.hostname.includes('googleapis') ||
    request.method !== 'GET'
  ) {
    // Direct network pass-through, no caching
    return;
  }

  // 2. Navigation requests (HTML document): Network-First
  // Guarantees existing PWAs immediately get the newest HTML when online
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone).catch(() => {});
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback
          return caches.match('/index.html').then((cached) => {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // 3. Static hashed assets (JS/CSS/images): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone).catch(() => {});
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
