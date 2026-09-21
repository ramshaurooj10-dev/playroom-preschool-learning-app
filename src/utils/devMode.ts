import { useState, useEffect } from 'react';

/**
 * STRICT ACCESS CONTROLLER
 * - Public Users / Downloaded Version: Developer mode is STRICTLY FALSE.
 * - Only Level 1 is Free.
 * - Levels 2 to 6 are 100% Locked.
 */

const STORAGE_KEY = 'playroom_developer_mode_active';
const EVENT_NAME = 'playroom_dev_mode_change';

// Aggressively purge legacy persistent dev & unlocked cache keys
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('playroom_developer_mode_active');
    localStorage.removeItem('playroom_dev_mode');
    localStorage.removeItem('playroom_ad_unlocked_activities');
    localStorage.removeItem('playroom_3activities_unlocked');
    localStorage.removeItem('playroom_gp_entitlements');
    localStorage.removeItem('playroom_3pack_unlocked_activities');
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // Ignore storage errors
  }
}

// Always strictly false for all normal/downloaded users
export const isDeveloperMode = (): boolean => {
  return false;
};

export const isDevPreviewEnvironment = (): boolean => {
  return false;
};

export const setDeveloperMode = (_enabled: boolean): void => {
  // Developer mode disabled for security
};

export const toggleDeveloperMode = (): boolean => {
  return false;
};

export const useDeveloperMode = () => {
  return { isDeveloperMode: false, toggleDeveloperMode: () => false };
};
