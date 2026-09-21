// Service Worker Registration for PWA Shell Support
export function registerServiceWorker() {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[SW] Service worker registered successfully:', reg.scope);

          // Listen for new worker installation
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[SW] New version available. Refresh recommended.');
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('[SW] Service worker registration failed:', err);
        });
    });
  }
}
