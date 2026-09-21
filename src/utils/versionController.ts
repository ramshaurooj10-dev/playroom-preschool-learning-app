// Playroom Remote Update and Application Version Controller
// Production-safe remote PWA update detection, service worker lifecycle, and cache/entitlement invalidator.

import { purgeLegacyEntitlements } from './licenseService';

export const PLAYROOM_APP_VERSION = '2026.09.21.2';
export const ENTITLEMENT_SCHEMA_VERSION = 3;

const RELOAD_GUARD_KEY = 'playroom_sw_reloaded_at';
const MIN_RELOAD_INTERVAL_MS = 15000; // 15 seconds guard against infinite reload loops

let isCheckingForUpdate = false;
let swRegistration: ServiceWorkerRegistration | null = null;

export interface AppVersionInfo {
  currentVersion: string;
  serverVersion?: string;
  hasUpdate: boolean;
  lastCheckedAt?: string;
}

/**
 * Fetch /version.json from the server using cache: 'no-store' to bypass any intermediate caching
 */
export async function fetchServerAppVersion(): Promise<{
  version: string;
  schemaVersion?: number;
  buildTimestamp?: string;
} | null> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return null;
  }

  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.debug('[VersionController] Remote version check skipped (offline or network error):', error);
    return null;
  }
}

/**
 * Compare local running app version with server app version.
 * If a new version exists, triggers service worker update and client reload.
 */
export async function checkForAppUpdates(forceReloadIfOutdated = true): Promise<AppVersionInfo> {
  if (isCheckingForUpdate || typeof window === 'undefined') {
    return {
      currentVersion: PLAYROOM_APP_VERSION,
      hasUpdate: false,
    };
  }

  isCheckingForUpdate = true;

  try {
    // 1. If service worker registration is available, trigger an update check
    if (swRegistration) {
      try {
        await swRegistration.update();
      } catch (err) {
        console.debug('[VersionController] swRegistration.update error:', err);
      }
    }

    // 2. Query /version.json
    const serverData = await fetchServerAppVersion();

    if (!serverData || !serverData.version) {
      return {
        currentVersion: PLAYROOM_APP_VERSION,
        hasUpdate: false,
        lastCheckedAt: new Date().toISOString(),
      };
    }

    const hasUpdate = serverData.version !== PLAYROOM_APP_VERSION;

    if (hasUpdate) {
      console.log(
        `[VersionController] New version detected! Running: ${PLAYROOM_APP_VERSION}, Server: ${serverData.version}`
      );

      // Invalidate legacy entitlements immediately
      purgeLegacyEntitlements();

      // Dispatch event to inform UI / components
      window.dispatchEvent(
        new CustomEvent('playroom_app_update_available', {
          detail: {
            currentVersion: PLAYROOM_APP_VERSION,
            newVersion: serverData.version,
          },
        })
      );

      // If a service worker is waiting, activate it immediately
      if (swRegistration?.waiting) {
        swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      if (forceReloadIfOutdated) {
        applyAppUpdateReload();
      }
    }

    return {
      currentVersion: PLAYROOM_APP_VERSION,
      serverVersion: serverData.version,
      hasUpdate,
      lastCheckedAt: new Date().toISOString(),
    };
  } finally {
    isCheckingForUpdate = false;
  }
}

/**
 * Reloads the client into the new application version safely without entering reload loops.
 */
export function applyAppUpdateReload(): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  const lastReloaded = parseInt(sessionStorage.getItem(RELOAD_GUARD_KEY) || '0', 10);

  if (now - lastReloaded < MIN_RELOAD_INTERVAL_MS) {
    console.warn('[VersionController] Reload debounced to prevent loop.');
    return;
  }

  sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
  console.log('[VersionController] Reloading onto newest PWA application build...');
  window.location.reload();
}

/**
 * Initialize Service Worker lifecycle and automatic background update polling
 */
export function initPwaUpdateEngine(): void {
  if (typeof window === 'undefined') return;

  // Invalidate legacy entitlements upon every application boot
  purgeLegacyEntitlements();

  if ('serviceWorker' in navigator) {
    // Listen for controller changes (when a newly installed SW takes control of the page)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[VersionController] New Service Worker activated and controlling client.');
      purgeLegacyEntitlements();
      applyAppUpdateReload();
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          swRegistration = reg;
          console.log(`[SW] Playroom v${PLAYROOM_APP_VERSION} Service Worker active.`);

          // If a new worker is currently waiting, activate it
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          // Listen for new worker installations
          reg.addEventListener('updatefound', () => {
            const installingWorker = reg.installing;
            if (!installingWorker) return;

            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('[SW] New version downloaded in background. Activating now...');
                  installingWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              }
            });
          });

          // Perform initial version comparison check
          checkForAppUpdates(false);
        })
        .catch((err) => {
          console.warn('[SW] Registration error:', err);
        });
    });

    // When the user gets back online, check for updates immediately
    window.addEventListener('online', () => {
      console.log('[VersionController] Device back online. Checking for PWA updates...');
      checkForAppUpdates(true);
    });

    // When the user switches tabs / returns to the app
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        checkForAppUpdates(false);
      }
    });

    // Periodic check every 2 minutes when online
    setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        checkForAppUpdates(false);
      }
    }, 120000);
  }
}
