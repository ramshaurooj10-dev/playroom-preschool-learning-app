// Service Worker & PWA Lifecycle Initialization
import { initPwaUpdateEngine, checkForAppUpdates, applyAppUpdateReload, PLAYROOM_APP_VERSION } from './utils/versionController';

export function registerServiceWorker() {
  initPwaUpdateEngine();
}

export { checkForAppUpdates, applyAppUpdateReload, PLAYROOM_APP_VERSION };
