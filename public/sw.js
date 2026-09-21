// Self-unregistering Service Worker: Purges all offline storage to require online connection
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      return self.registration.unregister();
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Do not intercept or cache any fetch requests
self.addEventListener('fetch', (event) => {
  // Let network handle directly
});
