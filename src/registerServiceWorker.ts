// Service Worker Management - Unregister offline caches to mandate online connectivity
export function registerServiceWorker() {
  if (typeof window === 'undefined') return;

  // 1. Purge all CacheStorage caches
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach((name) => {
        caches.delete(name).catch(() => {});
      });
    }).catch(() => {});
  }

  // 2. Unregister any existing service workers across all scopes
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().catch(() => {});
      }
    }).catch(() => {});
  }
}
