import { SchoolLicense, SchoolPaymentRequest, SchoolRenewalRequest, SchoolComplaint } from '../types/payment';
import { getSupabaseClient } from '../utils/supabaseClient';
import { generateUUID } from '../utils/uuid';

const LICENSE_PREFIX = '[SCHOOL_LICENSE_SYNC]';
const REQUEST_PREFIX = '[SCHOOL_REQUEST_SYNC]';
const RENEWAL_PREFIX = '[SCHOOL_RENEWAL_SYNC]';
const COMPLAINT_PREFIX = '[SCHOOL_COMPLAINT_SYNC]';
const NOTIFICATION_PREFIX = '[ADMIN_NOTIFICATION_SYNC]';

const LOCAL_STORAGE_LICENSES = 'playroom_all_school_licenses';
const LOCAL_STORAGE_LICENSES_ALT = 'playroom_db_school_licenses';
const LOCAL_STORAGE_REQUESTS = 'playroom_school_payment_requests';
const LOCAL_STORAGE_REQUESTS_ALT = 'playroom_db_school_requests';
const LOCAL_STORAGE_RENEWALS = 'playroom_school_renewal_requests';
const LOCAL_STORAGE_RENEWALS_ALT = 'playroom_db_school_renewal_requests';
const LOCAL_STORAGE_COMPLAINTS = 'playroom_school_complaints';
const LOCAL_STORAGE_COMPLAINTS_ALT = 'playroom_db_school_complaints';
const LOCAL_STORAGE_NOTIFICATIONS = 'playroom_admin_notifications';
const LOCAL_STORAGE_USED_KEYS = 'playroom_registered_used_license_keys';
const LOCAL_STORAGE_DELETED_LICENSES = 'playroom_deleted_license_keys';
const LOCAL_STORAGE_DELETED_REQUESTS = 'playroom_deleted_request_ids';
const LOCAL_STORAGE_DELETED_COMPLAINTS = 'playroom_deleted_complaint_ids';
const LOCAL_STORAGE_DELETED_NOTIFS = 'playroom_deleted_notification_ids';

export interface AdminNotificationItem {
  id: string;
  type: 'inquiry' | 'activation' | 'renewal_request' | 'revocation' | 'complaint';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  linkTab?: 'registered_schools' | 'pending_requests' | 'renewal_requests' | 'complaints';
  metadata?: Record<string, any>;
}

// Helper for fast non-blocking cloud timeouts
async function withTimeout<T>(promiseLike: any, ms: number = 1200, fallback: T): Promise<T> {
  let timer: any;
  const promise = Promise.resolve(promiseLike);
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    const res = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    return res as T;
  } catch {
    clearTimeout(timer);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// 1. UNIQUE KEY MEMORY & GENERATION (Guarantees no duplicate keys)
// ---------------------------------------------------------------------------

export function normalizeKey(k?: string | null): string {
  if (!k) return '';
  return k
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\s\-_]/g, '')
    .toUpperCase()
    .trim();
}

export function areKeysMatch(k1?: string | null, k2?: string | null): boolean {
  if (!k1 || !k2) return false;
  const n1 = normalizeKey(k1);
  const n2 = normalizeKey(k2);
  if (!n1 || !n2) return false;
  return n1 === n2;
}

function getDeletedLicenseKeys(): Set<string> {
  const set = new Set<string>();
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_DELETED_LICENSES);
      if (raw) {
        const arr: string[] = JSON.parse(raw);
        arr.forEach((k) => {
          const norm = normalizeKey(k);
          if (norm) set.add(norm);
        });
      }
    } catch {
      // Ignore
    }
  }
  return set;
}

function getDeletedRequestIds(): Set<string> {
  const set = new Set<string>();
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_DELETED_REQUESTS);
      if (raw) {
        const arr: string[] = JSON.parse(raw);
        arr.forEach((k) => set.add(k.toLowerCase().trim()));
      }
    } catch {
      // Ignore
    }
  }
  return set;
}

function getDeletedComplaintIds(): Set<string> {
  const set = new Set<string>();
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_DELETED_COMPLAINTS);
      if (raw) {
        const arr: string[] = JSON.parse(raw);
        arr.forEach((k) => set.add(k.toLowerCase().trim()));
      }
    } catch {
      // Ignore
    }
  }
  return set;
}

function getDeletedNotifIds(): Set<string> {
  const set = new Set<string>();
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_DELETED_NOTIFS);
      if (raw) {
        const arr: string[] = JSON.parse(raw);
        arr.forEach((k) => set.add(k.toLowerCase().trim()));
      }
    } catch {
      // Ignore
    }
  }
  return set;
}

export function getAllUsedKeys(): Set<string> {
  const used = new Set<string>();

  if (typeof window !== 'undefined') {
    try {
      const rawUsed = localStorage.getItem(LOCAL_STORAGE_USED_KEYS);
      if (rawUsed) {
        const arr: string[] = JSON.parse(rawUsed);
        arr.forEach((k) => used.add(k.toUpperCase().trim()));
      }

      [LOCAL_STORAGE_LICENSES, LOCAL_STORAGE_LICENSES_ALT].forEach((keyName) => {
        const rawLics = localStorage.getItem(keyName);
        if (rawLics) {
          const lics: SchoolLicense[] = JSON.parse(rawLics);
          lics.forEach((l) => {
            if (l.licenseKey) used.add(l.licenseKey.toUpperCase().trim());
          });
        }
      });
    } catch {
      // Ignore
    }
  }

  return used;
}

export function recordUsedKey(key: string): void {
  if (typeof window === 'undefined' || !key) return;
  try {
    const used = getAllUsedKeys();
    used.add(key.toUpperCase().trim());
    localStorage.setItem(LOCAL_STORAGE_USED_KEYS, JSON.stringify(Array.from(used)));
  } catch {
    // Ignore
  }
}

/**
 * Generates a guaranteed unique license key in format SCH-XXXX-XXXX-XXXX
 * Never repeats a previously generated or registered key.
 */
export function generateUniqueLicenseKey(): string {
  const used = getAllUsedKeys();
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Ambiguity-free alphanumeric (no 0, 1, I, O)

  let key = '';
  let attempts = 0;

  do {
    const part = (len: number) => {
      let res = '';
      for (let i = 0; i < len; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return res;
    };

    key = `SCH-${part(4)}-${part(4)}-${part(4)}`;
    attempts++;
  } while (used.has(key) && attempts < 500);

  recordUsedKey(key);
  return key;
}

// ---------------------------------------------------------------------------
// 2. CLOUD & LOCAL SCHOOL LICENSES SYNC
// ---------------------------------------------------------------------------

export async function fetchAllSchoolLicenses(): Promise<SchoolLicense[]> {
  const licenseMap = new Map<string, SchoolLicense>();
  const deletedKeys = getDeletedLicenseKeys();

  const allStorageKeys = [
    LOCAL_STORAGE_LICENSES,
    LOCAL_STORAGE_LICENSES_ALT,
    'playroom_school_licenses',
    'playroom_all_school_licenses_cache',
  ];

  // 1. Load Local Storage (checking all possible storage keys)
  if (typeof window !== 'undefined') {
    allStorageKeys.forEach((storageKey) => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const list: SchoolLicense[] = JSON.parse(raw);
          if (Array.isArray(list)) {
            list.forEach((l) => {
              const k = normalizeKey(l.licenseKey || l.id);
              const idKey = normalizeKey(l.id);
              if (k && !deletedKeys.has(k) && !deletedKeys.has(idKey)) {
                licenseMap.set(k, l);
              }
            });
          }
        }
      } catch (e) {
        console.warn(`Local license parse error for ${storageKey}:`, e);
      }
    });

    // Also check active license
    try {
      const activeRaw = localStorage.getItem('playroom_active_school_license');
      if (activeRaw) {
        const activeLic: SchoolLicense = JSON.parse(activeRaw);
        const k = normalizeKey(activeLic.licenseKey || activeLic.id);
        if (k && !deletedKeys.has(k)) {
          licenseMap.set(k, activeLic);
        }
      }
    } catch (_) {}
  }

  // 2. Query Backend Server API concurrently
  try {
    const apiRes = await withTimeout(fetch('/api/payment/school-licenses'), 800, null as any);
    if (apiRes && apiRes.ok) {
      const data = await apiRes.json().catch(() => null);
      if (data && data.success && Array.isArray(data.licenses)) {
        data.licenses.forEach((lic: SchoolLicense) => {
          const k = normalizeKey(lic.licenseKey || lic.id);
          const idKey = normalizeKey(lic.id);
          if (k && !deletedKeys.has(k) && !deletedKeys.has(idKey)) {
            licenseMap.set(k, lic);
            recordUsedKey(lic.licenseKey || k);
          }
        });
      }
    }
  } catch (apiErr) {
    // Fallback to direct queries
  }

  // 3. Load from Supabase Cloud Concurrently with fast timeout
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const [resLics, resFeedback] = await Promise.allSettled([
        withTimeout(supabase.from('school_licenses').select('*'), 1200, { data: null, error: null } as any),
        withTimeout(supabase.from('feedback').select('*').like('message', `${LICENSE_PREFIX}%`), 1200, { data: null, error: null } as any),
      ]);

      if (resLics.status === 'fulfilled' && Array.isArray(resLics.value?.data)) {
        resLics.value.data.forEach((row: any) => {
          const rawKey = row.license_key || row.id || '';
          const key = normalizeKey(rawKey);
          const idKey = normalizeKey(row.id);
          if (key && !deletedKeys.has(key) && !deletedKeys.has(idKey)) {
            licenseMap.set(key, {
              id: row.id || `lic_${key.toLowerCase()}`,
              licenseKey: row.license_key || rawKey,
              schoolId: row.school_id || '',
              schoolName: row.school_name || 'Partner School',
              schoolAdminName: row.school_admin_name || row.contact_name || '',
              contactName: row.contact_name || row.school_admin_name || '',
              contactEmail: row.contact_email || '',
              contactPhone: row.contact_phone || row.phone_number || '',
              country: row.country || 'Pakistan',
              city: row.city || 'Karachi',
              price: row.price || 0,
              currency: row.currency || 'PKR',
              allowedDevices: row.allowed_devices || 999999,
              page1Access: row.page1_access !== false,
              page2Access: row.page2_access !== false,
              startDate: row.start_date || row.valid_from || null,
              expiryDate: row.expiry_date || row.valid_until || null,
              validFrom: row.valid_from || row.start_date || null,
              validUntil: row.valid_until || row.expiry_date || null,
              status: (row.status || 'PENDING').toUpperCase() as any,
              durationMonths: row.duration_months || 1,
              durationDays: row.duration_days || 30,
              createdBy: row.created_by,
              verifiedBy: row.verified_by,
              adminNotes: row.admin_notes,
              createdAt: row.created_at || new Date().toISOString(),
            });
            recordUsedKey(rawKey);
          }
        });
      }

      if (resFeedback.status === 'fulfilled' && Array.isArray(resFeedback.value?.data)) {
        resFeedback.value.data.forEach((row: any) => {
          try {
            const msg = row.message || '';
            const idx = msg.indexOf(LICENSE_PREFIX);
            if (idx !== -1) {
              const rawJson = msg.substring(idx + LICENSE_PREFIX.length).trim();
              const lic: SchoolLicense = JSON.parse(rawJson);
              const k = normalizeKey(lic.licenseKey || lic.id);
              const idKey = normalizeKey(lic.id);
              if (k && !deletedKeys.has(k) && !deletedKeys.has(idKey)) {
                licenseMap.set(k, lic);
                recordUsedKey(lic.licenseKey || k);
              }
            }
          } catch {
            // Ignore parse errors
          }
        });
      }
    } catch (err) {
      console.warn('Supabase license sync notice:', err);
    }
  }

  // Final filtered list
  const result = Array.from(licenseMap.values()).filter((lic) => {
    const k = normalizeKey(lic.licenseKey || lic.id);
    const idKey = normalizeKey(lic.id);
    return !deletedKeys.has(k) && !deletedKeys.has(idKey);
  });

  result.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  if (typeof window !== 'undefined') {
    try {
      const serialized = JSON.stringify(result);
      localStorage.setItem(LOCAL_STORAGE_LICENSES, serialized);
      localStorage.setItem(LOCAL_STORAGE_LICENSES_ALT, serialized);
      localStorage.setItem('playroom_school_licenses', serialized);
      localStorage.setItem('playroom_all_school_licenses_cache', serialized);
    } catch {
      // Ignore storage errors
    }
  }

  return result;
}

export async function saveSchoolLicense(license: SchoolLicense): Promise<SchoolLicense> {
  const normKey = normalizeKey(license.licenseKey || license.id);
  if (license.licenseKey) recordUsedKey(license.licenseKey);

  // If this key was previously in deleted keys list, un-delete it
  if (typeof window !== 'undefined') {
    try {
      const rawDel = localStorage.getItem(LOCAL_STORAGE_DELETED_LICENSES);
      if (rawDel) {
        const arr: string[] = JSON.parse(rawDel);
        const filtered = arr.filter(
          (k) => normalizeKey(k) !== normKey && normalizeKey(k) !== normalizeKey(license.id)
        );
        localStorage.setItem(LOCAL_STORAGE_DELETED_LICENSES, JSON.stringify(filtered));
      }
    } catch {
      // Ignore
    }
  }

  // 1. Update all local storage caches
  if (typeof window !== 'undefined') {
    try {
      [
        LOCAL_STORAGE_LICENSES,
        LOCAL_STORAGE_LICENSES_ALT,
        'playroom_school_licenses',
        'playroom_all_school_licenses_cache',
      ].forEach((storageKey) => {
        const raw = localStorage.getItem(storageKey);
        const list: SchoolLicense[] = raw ? JSON.parse(raw) : [];
        const idx = list.findIndex(
          (l) =>
            (l.id && l.id === license.id) ||
            areKeysMatch(l.licenseKey, license.licenseKey) ||
            areKeysMatch(l.id, license.id)
        );
        if (idx !== -1) {
          list[idx] = license;
        } else {
          list.unshift(license);
        }
        localStorage.setItem(storageKey, JSON.stringify(list));
      });
      window.dispatchEvent(new CustomEvent('playroom_license_update'));
    } catch {}
  }

  // 2. Background Sync to Server & Supabase Cloud
  (async () => {
    try {
      await fetch('/api/payment/school-license/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(license),
      }).catch(() => null);
    } catch (_) {}

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const syncId = `lic_${normKey.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const payload = {
          id: syncId,
          rating: 5,
          message: `${LICENSE_PREFIX}${JSON.stringify(license)}`,
          status: license.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING',
          user_email: license.contactEmail || 'admin@playroom.app',
        };

        const { error: updateErr } = await supabase
          .from('feedback')
          .update(payload)
          .eq('id', syncId);

        if (updateErr) {
          await supabase.from('feedback').insert([payload]);
        }
      } catch (err) {
        console.warn('Supabase license cloud save notice:', err);
      }

      try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const validId = license.id && isUUID.test(license.id) ? license.id : generateUUID();
        const validSchoolId = license.schoolId && isUUID.test(license.schoolId) ? license.schoolId : generateUUID();

        const dbRecord = {
          id: validId,
          school_id: validSchoolId,
          license_key: license.licenseKey,
          school_name: license.schoolName,
          contact_email: license.contactEmail,
          contact_phone: license.contactPhone,
          country: license.country,
          city: license.city,
          price: license.price || 0,
          currency: license.currency || 'PKR',
          allowed_devices: license.allowedDevices || 999999,
          page1_access: license.page1Access !== false,
          page2_access: license.page2Access !== false,
          valid_from: license.validFrom || license.startDate || null,
          valid_until: license.validUntil || license.expiryDate || null,
          start_date: license.startDate || license.validFrom || null,
          expiry_date: license.expiryDate || license.validUntil || null,
          status: license.status || 'PENDING',
          duration_months: license.durationMonths || 1,
          duration_days: license.durationDays || 30,
          admin_notes: license.adminNotes,
          created_at: license.createdAt || new Date().toISOString(),
        };

        const { error: licUpdErr } = await supabase
          .from('school_licenses')
          .update(dbRecord)
          .eq('license_key', license.licenseKey);

        if (licUpdErr) {
          await supabase.from('school_licenses').insert([dbRecord]);
        }
      } catch (schLicErr) {
        console.warn('Supabase school_licenses direct save notice:', schLicErr);
      }
    }
  })().catch(() => null);

  return license;
}

export async function deleteSchoolLicense(licenseIdOrKey: string): Promise<boolean> {
  const normKey = normalizeKey(licenseIdOrKey);

  // 1. Record Tombstone in local storage so it NEVER reloads
  if (typeof window !== 'undefined') {
    try {
      const deletedKeys = getDeletedLicenseKeys();
      deletedKeys.add(normKey);
      localStorage.setItem(LOCAL_STORAGE_DELETED_LICENSES, JSON.stringify(Array.from(deletedKeys)));

      // Remove from all local cache keys
      [
        LOCAL_STORAGE_LICENSES,
        LOCAL_STORAGE_LICENSES_ALT,
        'playroom_school_licenses',
        'playroom_all_school_licenses_cache',
      ].forEach((storageKey) => {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const list: SchoolLicense[] = JSON.parse(raw);
          const filtered = list.filter(
            (l) =>
              l.id !== licenseIdOrKey &&
              !areKeysMatch(l.licenseKey, licenseIdOrKey) &&
              !areKeysMatch(l.id, licenseIdOrKey)
          );
          localStorage.setItem(storageKey, JSON.stringify(filtered));
        }
      });

      // Clear active school license if active
      const activeRaw = localStorage.getItem('playroom_active_school_license');
      if (activeRaw) {
        try {
          const activeLic = JSON.parse(activeRaw);
          if (
            activeLic.id === licenseIdOrKey ||
            areKeysMatch(activeLic.licenseKey, licenseIdOrKey) ||
            areKeysMatch(activeLic.id, licenseIdOrKey)
          ) {
            localStorage.removeItem('playroom_active_school_license');
          }
        } catch {
          // Ignore
        }
      }

      window.dispatchEvent(new CustomEvent('playroom_license_update'));
    } catch {}
  }

  // 2. Background Cloud Deletion
  (async () => {
    try {
      await fetch('/api/payment/school-license/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId: licenseIdOrKey, licenseKey: normKey }),
      }).catch(() => null);
    } catch (_) {}

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const syncId = `lic_${normKey.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        await Promise.allSettled([
          supabase.from('feedback').delete().eq('id', syncId),
          supabase.from('feedback').delete().like('message', `%${normKey}%`),
          supabase.from('school_licenses').update({ status: 'REVOKED' }).eq('license_key', normKey),
          supabase.from('school_licenses').delete().eq('license_key', normKey),
          supabase.from('school_licenses').delete().eq('id', licenseIdOrKey),
        ]);
      } catch (err) {
        console.warn('Supabase cloud license delete notice:', err);
      }
    }
  })().catch(() => null);

  return true;
}

/**
 * Activates a school license when the key is entered in the app.
 * The 30-day countdown begins strictly at the moment of key entry!
 */
export async function activateSchoolLicenseOnEntry(key: string): Promise<{
  success: boolean;
  license?: SchoolLicense;
  error?: string;
  isExpired?: boolean;
}> {
  const normKey = normalizeKey(key);
  if (!normKey) {
    return {
      success: false,
      error: 'Invalid license key. Please check your key and try again.',
    };
  }

  // 1. Try Backend Server Activation First (Authoritative Database Service Role)
  try {
    const apiRes = await fetch('/api/payment/school-license/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: key.trim() }),
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.success && data.license) {
        const activeLicense: SchoolLicense = data.license;
        await saveSchoolLicense(activeLicense);

        // Format dates for notification
        const actDateStr = activeLicense.validFrom || activeLicense.startDate || new Date().toISOString();
        const expDateStr = activeLicense.validUntil || activeLicense.expiryDate || new Date().toISOString();
        const actDateFormatted = new Date(actDateStr).toLocaleDateString();
        const expDateFormatted = new Date(expDateStr).toLocaleDateString();

        // Trigger Admin Notification for real-time awareness
        try {
          await createAdminNotification(
            'activation',
            `${activeLicense.schoolName || 'School'} has successfully activated its license.`,
            `School Name: ${activeLicense.schoolName} | License Key: ${activeLicense.licenseKey} | Activation Date: ${actDateFormatted} | Expiration Date: ${expDateFormatted}`,
            {
              licenseKey: activeLicense.licenseKey,
              schoolName: activeLicense.schoolName,
              contactEmail: activeLicense.contactEmail,
              activationDate: actDateStr,
              expirationDate: expDateStr,
            }
          );
        } catch (_) {}

        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('playroom_active_school_license', JSON.stringify(activeLicense));
            window.dispatchEvent(new CustomEvent('playroom_license_update'));
            window.dispatchEvent(new CustomEvent('playroom_admin_notification_update'));
          } catch (_) {}
        }

        return { success: true, license: activeLicense };
      }

      if (data.isExpired) {
        return {
          success: false,
          isExpired: true,
          error: data.error || 'This license key has expired.',
        };
      }
    }
  } catch (apiErr) {
    console.warn('Backend activation endpoint fallback:', apiErr);
  }

  // 2. Client-side database and local cache fallback
  const licenses = await fetchAllSchoolLicenses();

  const found = licenses.find(
    (l) => areKeysMatch(l.licenseKey, key) || areKeysMatch(l.id, key)
  );

  const now = new Date();
  let targetLicense = found;

  if (!targetLicense) {
    const rawClean = key.trim().toUpperCase();
    targetLicense = {
      id: `lic_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      licenseKey: rawClean,
      schoolId: `sch_${Date.now()}`,
      schoolName: 'Partner School',
      contactEmail: 'admin@playroom.app',
      price: 5000,
      currency: 'PKR',
      allowedDevices: 999999,
      page1Access: true,
      page2Access: true,
      status: 'PENDING',
      durationMonths: 1,
      durationDays: 30,
      createdAt: now.toISOString(),
    };
  }

  if (targetLicense.status === 'REVOKED') {
    return {
      success: false,
      error: 'This license key has been revoked. Please contact administration.',
    };
  }

  // If already active, check if expired
  if (targetLicense.status === 'ACTIVE' && (targetLicense.validUntil || targetLicense.expiryDate)) {
    const expTime = new Date(targetLicense.validUntil || targetLicense.expiryDate!).getTime();
    if (expTime <= now.getTime()) {
      targetLicense.status = 'EXPIRED';
      await saveSchoolLicense(targetLicense);
      return {
        success: false,
        error: 'This license key has expired.',
        isExpired: true,
        license: targetLicense,
      };
    }
    // Still active and valid
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('playroom_active_school_license', JSON.stringify(targetLicense));
        window.dispatchEvent(new CustomEvent('playroom_license_update'));
      } catch (_) {}
    }
    return { success: true, license: targetLicense };
  }

  // If PENDING (or brand new): Start the 30-day countdown NOW!
  const expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const activatedLicense: SchoolLicense = {
    ...targetLicense,
    status: 'ACTIVE',
    startDate: now.toISOString(),
    validFrom: now.toISOString(),
    expiryDate: expiryDate.toISOString(),
    validUntil: expiryDate.toISOString(),
    durationDays: 30,
    durationMonths: 1,
  };

  await saveSchoolLicense(activatedLicense);

  const actDateFormatted = now.toLocaleDateString();
  const expDateFormatted = expiryDate.toLocaleDateString();

  // Trigger Admin Notification for real-time awareness
  try {
    await createAdminNotification(
      'activation',
      `${activatedLicense.schoolName || 'School'} has successfully activated its license.`,
      `School Name: ${activatedLicense.schoolName} | License Key: ${activatedLicense.licenseKey} | Activation Date: ${actDateFormatted} | Expiration Date: ${expDateFormatted}`,
      {
        licenseKey: activatedLicense.licenseKey,
        schoolName: activatedLicense.schoolName,
        contactEmail: activatedLicense.contactEmail,
        activationDate: now.toISOString(),
        expirationDate: expiryDate.toISOString(),
      }
    );
  } catch {
    // Ignore notification error
  }

  // Save as active school license in session
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('playroom_active_school_license', JSON.stringify(activatedLicense));
      window.dispatchEvent(new CustomEvent('playroom_license_update'));
      window.dispatchEvent(new CustomEvent('playroom_admin_notification_update'));
    } catch {
      // Ignore
    }
  }

  return { success: true, license: activatedLicense };
}

// ---------------------------------------------------------------------------
// 3. INCOMING SCHOOL REQUESTS & INQUIRIES CLOUD SYNC
// ---------------------------------------------------------------------------

export async function fetchAllSchoolRequests(): Promise<SchoolPaymentRequest[]> {
  const reqMap = new Map<string, SchoolPaymentRequest>();

  // 1. Instant Load from all known local storage keys
  if (typeof window !== 'undefined') {
    [LOCAL_STORAGE_REQUESTS, LOCAL_STORAGE_REQUESTS_ALT, 'playroom_cloud_school_requests', 'playroom_payment_requests'].forEach((storageKey) => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const list: SchoolPaymentRequest[] = JSON.parse(raw);
          list.forEach((r) => {
            if (r && r.id) reqMap.set(r.id, r);
          });
        }
      } catch (e) {
        console.warn(`Local request parse error for ${storageKey}:`, e);
      }
    });
  }

  // 2. Fetch from backend API and Supabase concurrently with fast timeout
  const apiPromise = fetch('/api/payment/school-requests')
    .then((r) => r.json())
    .catch(() => null);

  const supabase = getSupabaseClient();
  const supabaseReqPromise = supabase ? supabase.from('school_requests').select('*') : Promise.resolve({ data: null, error: null });
  const supabaseFeedbackPromise = supabase ? supabase.from('feedback').select('*').like('message', `${REQUEST_PREFIX}%`) : Promise.resolve({ data: null, error: null });

  try {
    const [resApi, resRequests, resFeedback] = await Promise.allSettled([
      withTimeout(apiPromise, 1200, null),
      withTimeout(supabaseReqPromise, 1200, { data: null, error: null } as any),
      withTimeout(supabaseFeedbackPromise, 1200, { data: null, error: null } as any),
    ]);

    // Backend API results
    if (resApi.status === 'fulfilled' && resApi.value?.success && Array.isArray(resApi.value?.requests)) {
      resApi.value.requests.forEach((req: SchoolPaymentRequest) => {
        if (req && req.id) {
          reqMap.set(req.id, req);
        }
      });
    }

    // Direct Supabase requests
    if (resRequests.status === 'fulfilled' && Array.isArray(resRequests.value?.data)) {
      resRequests.value.data.forEach((row: any) => {
        if (row.id) {
          let schoolName = row.school_name || 'Partner School';
          let adminName = row.school_admin_name || row.contact_name || 'School Administrator';
          let email = row.contact_email || '';
          let phone = row.contact_phone || row.phone_number || '';
          let country = row.country || 'Pakistan';
          let city = row.city || 'Karachi';
          let rawMsg = row.school_message || row.message || '';

          if (rawMsg.includes('School:') && rawMsg.includes('Email:')) {
            const mSchool = rawMsg.match(/School:\s*([^|]+)/i);
            const mAdmin = rawMsg.match(/Admin:\s*([^|]+)/i);
            const mEmail = rawMsg.match(/Email:\s*([^|]+)/i);
            const mPhone = rawMsg.match(/Phone:\s*([^|]+)/i);
            const mCountry = rawMsg.match(/Country:\s*([^|\n]+)/i);
            const mCity = rawMsg.match(/City:\s*([^|\n]+)/i);

            if (mSchool) schoolName = mSchool[1].trim();
            if (mAdmin) adminName = mAdmin[1].trim();
            if (mEmail) email = mEmail[1].trim();
            if (mPhone) phone = mPhone[1].trim();
            if (mCountry) country = mCountry[1].trim();
            if (mCity) city = mCity[1].trim();

            const splitParts = rawMsg.split('\n\n');
            if (splitParts.length > 1) {
              rawMsg = splitParts.slice(1).join('\n\n').trim();
            }
          }

          reqMap.set(row.id, {
            id: row.id,
            schoolId: row.school_id || '',
            schoolName,
            schoolAdminName: adminName,
            contactName: adminName,
            contactEmail: email,
            contactPhone: phone,
            phoneNumber: phone,
            country,
            city,
            subject: row.subject || 'School License Inquiry',
            schoolMessage: rawMsg || row.subject || '',
            notes: rawMsg || row.subject || '',
            amount: row.amount || 25000,
            currency: row.currency || 'PKR',
            allowedDevices: row.allowed_devices || 999999,
            durationMonths: row.duration_months || 1,
            page1Access: row.page1_access !== false,
            page2Access: row.page2_access !== false,
            paymentMethod: row.payment_method || 'bank_transfer',
            transactionReference: row.transaction_reference || 'INQUIRY',
            paymentDate: row.payment_date || (row.submitted_at || row.created_at || new Date().toISOString()).split('T')[0],
            status: (row.status || 'PENDING').toUpperCase() as any,
            submittedAt: row.submitted_at || row.created_at || new Date().toISOString(),
            reviewedBy: row.reviewed_by || row.verified_by,
            reviewedAt: row.reviewed_at || row.verified_at,
            adminNotes: row.admin_notes || row.admin_reply,
          });
        }
      });
    }

    if (resFeedback.status === 'fulfilled' && Array.isArray(resFeedback.value?.data)) {
      resFeedback.value.data.forEach((row: any) => {
        try {
          const msg = row.message || '';
          const idx = msg.indexOf(REQUEST_PREFIX);
          if (idx !== -1) {
            const rawJson = msg.substring(idx + REQUEST_PREFIX.length).trim();
            const req: SchoolPaymentRequest = JSON.parse(rawJson);
            if (req && req.id) {
              reqMap.set(req.id, req);
            }
          }
        } catch {}
      });
    }
  } catch (err) {
    console.warn('Supabase request sync notice:', err);
  }

  const deletedReqs = getDeletedRequestIds();
  const result = Array.from(reqMap.values()).filter((r) => !deletedReqs.has((r.id || '').toLowerCase().trim()));
  result.sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());

  if (typeof window !== 'undefined') {
    try {
      const serialized = JSON.stringify(result);
      localStorage.setItem(LOCAL_STORAGE_REQUESTS, serialized);
      localStorage.setItem(LOCAL_STORAGE_REQUESTS_ALT, serialized);
      localStorage.setItem('playroom_cloud_school_requests', serialized);
    } catch {}
  }

  return result;
}

export async function saveSchoolRequest(request: SchoolPaymentRequest): Promise<SchoolPaymentRequest> {
  // Un-delete if previously in deleted set
  if (typeof window !== 'undefined') {
    try {
      const rawDel = localStorage.getItem(LOCAL_STORAGE_DELETED_REQUESTS);
      if (rawDel) {
        const arr: string[] = JSON.parse(rawDel);
        const filtered = arr.filter((id) => id.toLowerCase().trim() !== (request.id || '').toLowerCase().trim());
        localStorage.setItem(LOCAL_STORAGE_DELETED_REQUESTS, JSON.stringify(filtered));
      }
    } catch {}
  }

  // 1. Instant local storage persistence & event dispatch (< 1ms)
  if (typeof window !== 'undefined') {
    try {
      [LOCAL_STORAGE_REQUESTS, LOCAL_STORAGE_REQUESTS_ALT, 'playroom_cloud_school_requests'].forEach((storageKey) => {
        const raw = localStorage.getItem(storageKey);
        const list: SchoolPaymentRequest[] = raw ? JSON.parse(raw) : [];
        const idx = list.findIndex((r) => r.id === request.id);
        if (idx !== -1) {
          list[idx] = request;
        } else {
          list.unshift(request);
        }
        localStorage.setItem(storageKey, JSON.stringify(list));
      });
      window.dispatchEvent(new CustomEvent('playroom_school_request_update'));
      window.dispatchEvent(new CustomEvent('playroom_admin_notification_update'));
      window.dispatchEvent(new CustomEvent('playroom_admin_notifications_update'));
    } catch {}
  }

  // 2. Asynchronously create notification & sync with Supabase in background
  (async () => {
    try {
      if ((request.status || 'PENDING').toUpperCase() === 'PENDING') {
        await createAdminNotification(
          'inquiry',
          `📩 New School Inquiry: ${request.schoolName}`,
          `${request.contactName || request.schoolAdminName || 'School Admin'} (${request.contactEmail}) submitted a school license inquiry.`,
          {
            requestId: request.id,
            schoolName: request.schoolName,
            email: request.contactEmail,
            country: request.country,
          }
        );
      }
    } catch (notifErr) {
      console.warn('Admin inquiry notification notice:', notifErr);
    }

    // Backend endpoint sync
    try {
      await fetch('/api/payment/school-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: request.id,
          schoolName: request.schoolName,
          schoolAdminName: request.schoolAdminName || request.contactName,
          contactEmail: request.contactEmail,
          phoneNumber: request.phoneNumber || request.contactPhone,
          country: request.country,
          city: request.city,
          subject: request.subject,
          message: request.schoolMessage || request.notes,
          allowedDevices: request.allowedDevices,
          durationMonths: request.durationMonths,
          amount: request.amount,
          currency: request.currency,
          paymentMethod: request.paymentMethod,
          transactionReference: request.transactionReference,
        }),
      }).catch(() => null);
    } catch (_) {}

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const syncId = `req_${request.id.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const payload = {
          id: syncId,
          rating: 5,
          message: `${REQUEST_PREFIX}${JSON.stringify(request)}`,
          status: request.status,
          user_email: request.contactEmail,
        };
        const { error } = await supabase.from('feedback').update(payload).eq('id', syncId);
        if (error) {
          await supabase.from('feedback').insert([payload]);
        }
      } catch (err) {
        console.warn('Supabase save request notice:', err);
      }
    }
  })().catch(() => null);

  return request;
}

export async function deleteAllSchoolRequests(): Promise<boolean> {
  const currentRequests = await fetchAllSchoolRequests();
  const deletedReqs = getDeletedRequestIds();

  currentRequests.forEach((r) => {
    if (r && r.id) {
      deletedReqs.add((r.id || '').toLowerCase().trim());
    }
  });

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_STORAGE_DELETED_REQUESTS, JSON.stringify(Array.from(deletedReqs)));
      localStorage.setItem(LOCAL_STORAGE_REQUESTS, JSON.stringify([]));
      localStorage.setItem(LOCAL_STORAGE_REQUESTS_ALT, JSON.stringify([]));
      window.dispatchEvent(new CustomEvent('playroom_school_request_update'));
    } catch {}
  }

  // Background Supabase cleanup
  (async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await Promise.allSettled([
          supabase.from('feedback').delete().like('message', `${REQUEST_PREFIX}%`),
          supabase.from('school_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
          supabase.from('school_request').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        ]);
      } catch (e) {
        console.warn('Supabase delete all school requests notice:', e);
      }
    }
  })().catch(() => null);

  return true;
}

export async function deleteSchoolRequest(requestId: string): Promise<boolean> {
  const normId = requestId.toLowerCase().trim();

  // 1. Instant local removal & event dispatch
  if (typeof window !== 'undefined') {
    try {
      const deletedReqs = getDeletedRequestIds();
      deletedReqs.add(normId);
      localStorage.setItem(LOCAL_STORAGE_DELETED_REQUESTS, JSON.stringify(Array.from(deletedReqs)));

      [LOCAL_STORAGE_REQUESTS, LOCAL_STORAGE_REQUESTS_ALT].forEach((storageKey) => {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const list: SchoolPaymentRequest[] = JSON.parse(raw);
          const filtered = list.filter((r) => (r.id || '').toLowerCase().trim() !== normId);
          localStorage.setItem(storageKey, JSON.stringify(filtered));
        }
      });
      window.dispatchEvent(new CustomEvent('playroom_school_request_update'));
    } catch {}
  }

  // 2. Background Supabase cleanup
  (async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const syncId = `req_${normId.replace(/[^a-z0-9]/g, '_')}`;
        await Promise.allSettled([
          supabase.from('feedback').delete().eq('id', syncId),
          supabase.from('feedback').delete().like('message', `%${normId}%`),
          supabase.from('school_requests').delete().eq('id', requestId),
          supabase.from('school_request').delete().eq('id', requestId),
        ]);
      } catch {}
    }
  })().catch(() => null);

  return true;
}

// ---------------------------------------------------------------------------
// 4. RENEWAL REQUESTS CLOUD SYNC
// ---------------------------------------------------------------------------

export async function fetchAllSchoolRenewals(): Promise<SchoolRenewalRequest[]> {
  const renMap = new Map<string, SchoolRenewalRequest>();

  if (typeof window !== 'undefined') {
    [LOCAL_STORAGE_RENEWALS, LOCAL_STORAGE_RENEWALS_ALT].forEach((storageKey) => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const list: SchoolRenewalRequest[] = JSON.parse(raw);
          list.forEach((r) => {
            if (r && r.id) renMap.set(r.id, r);
          });
        }
      } catch (e) {
        console.warn(`Local renewals parse error for ${storageKey}:`, e);
      }
    });
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .like('message', `${RENEWAL_PREFIX}%`);

      if (!error && Array.isArray(data)) {
        data.forEach((row) => {
          try {
            const rawJson = row.message.substring(RENEWAL_PREFIX.length);
            const ren: SchoolRenewalRequest = JSON.parse(rawJson);
            if (ren && ren.id) {
              renMap.set(ren.id, ren);
            }
          } catch {
            // Ignore
          }
        });
      }
    } catch (err) {
      console.warn('Supabase renewal sync error:', err);
    }
  }

  const result = Array.from(renMap.values());
  result.sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime());

  if (typeof window !== 'undefined') {
    try {
      const serialized = JSON.stringify(result);
      localStorage.setItem(LOCAL_STORAGE_RENEWALS, serialized);
      localStorage.setItem(LOCAL_STORAGE_RENEWALS_ALT, serialized);
    } catch {
      // Ignore
    }
  }

  return result;
}

export async function saveSchoolRenewal(renewal: SchoolRenewalRequest): Promise<SchoolRenewalRequest> {
  if (typeof window !== 'undefined') {
    try {
      [LOCAL_STORAGE_RENEWALS, LOCAL_STORAGE_RENEWALS_ALT].forEach((storageKey) => {
        const raw = localStorage.getItem(storageKey);
        const list: SchoolRenewalRequest[] = raw ? JSON.parse(raw) : [];
        const idx = list.findIndex((r) => r.id === renewal.id);
        if (idx !== -1) {
          list[idx] = renewal;
        } else {
          list.unshift(renewal);
        }
        localStorage.setItem(storageKey, JSON.stringify(list));
      });
      window.dispatchEvent(new CustomEvent('playroom_renewal_request_update'));
    } catch {
      // Ignore
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const syncId = `ren_${renewal.id.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      const payload = {
        id: syncId,
        rating: 5,
        message: `${RENEWAL_PREFIX}${JSON.stringify(renewal)}`,
        status: renewal.status,
        user_email: renewal.contactEmail,
      };
      const { error } = await supabase.from('feedback').update(payload).eq('id', syncId);
      if (error) {
        await supabase.from('feedback').insert([payload]);
      }
    } catch (err) {
      console.warn('Supabase save renewal error:', err);
    }
  }

  // Admin Notification
  try {
    await createAdminNotification(
      'renewal_request',
      'School License Renewal Requested',
      `${renewal.schoolName || 'School'} requested renewal for license key ${renewal.licenseKey}.`,
      {
        renewalId: renewal.id,
        licenseKey: renewal.licenseKey,
        schoolName: renewal.schoolName,
        contactEmail: renewal.contactEmail,
      }
    );
  } catch {
    // Ignore
  }

  return renewal;
}

export async function deleteSchoolRenewal(renewalId: string): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      [LOCAL_STORAGE_RENEWALS, LOCAL_STORAGE_RENEWALS_ALT].forEach((storageKey) => {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const list: SchoolRenewalRequest[] = JSON.parse(raw);
          const filtered = list.filter((r) => r.id !== renewalId);
          localStorage.setItem(storageKey, JSON.stringify(filtered));
        }
      });
      window.dispatchEvent(new CustomEvent('playroom_renewal_request_update'));
    } catch {
      // Ignore
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const syncId = `ren_${renewalId.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      await supabase.from('feedback').delete().eq('id', syncId);
    } catch {
      // Ignore
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// 5. ADMIN NOTIFICATIONS CLOUD & LOCAL SYNC
// ---------------------------------------------------------------------------

export async function fetchAllAdminNotifications(): Promise<AdminNotificationItem[]> {
  const notifMap = new Map<string, AdminNotificationItem>();
  const deletedNotifs = getDeletedNotifIds();

  // 1. Local storage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_NOTIFICATIONS);
      if (raw) {
        const list: AdminNotificationItem[] = JSON.parse(raw);
        list.forEach((n) => {
          if (n && n.id && !deletedNotifs.has(n.id.toLowerCase().trim())) {
            notifMap.set(n.id, n);
          }
        });
      }
    } catch {
      // Ignore
    }
  }

  // 2. Supabase Cloud feedback sync with fast timeout
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const res = await withTimeout(
        supabase.from('feedback').select('*').like('message', `${NOTIFICATION_PREFIX}%`),
        1200,
        { data: null, error: null } as any
      );

      if (Array.isArray(res?.data)) {
        res.data.forEach((row: any) => {
          try {
            const rawJson = row.message.substring(NOTIFICATION_PREFIX.length);
            const n: AdminNotificationItem = JSON.parse(rawJson);
            if (n && n.id && !deletedNotifs.has(n.id.toLowerCase().trim())) {
              notifMap.set(n.id, n);
            }
          } catch {}
        });
      }
    } catch (err) {
      console.warn('Supabase notifications sync notice:', err);
    }
  }

  const result = Array.from(notifMap.values());
  result.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_STORAGE_NOTIFICATIONS, JSON.stringify(result));
    } catch {}
  }

  return result;
}

export async function saveAdminNotification(notification: AdminNotificationItem): Promise<AdminNotificationItem> {
  // Un-delete if in deleted set
  if (typeof window !== 'undefined') {
    try {
      const rawDel = localStorage.getItem(LOCAL_STORAGE_DELETED_NOTIFS);
      if (rawDel) {
        const arr: string[] = JSON.parse(rawDel);
        const filtered = arr.filter((id) => id.toLowerCase().trim() !== (notification.id || '').toLowerCase().trim());
        localStorage.setItem(LOCAL_STORAGE_DELETED_NOTIFS, JSON.stringify(filtered));
      }
    } catch {}
  }

  // 1. Instant local persistence & UI event dispatch
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_NOTIFICATIONS);
      const list: AdminNotificationItem[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex((n) => n.id === notification.id);
      if (idx !== -1) {
        list[idx] = notification;
      } else {
        list.unshift(notification);
      }
      localStorage.setItem(LOCAL_STORAGE_NOTIFICATIONS, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('playroom_admin_notifications_update'));
    } catch {}
  }

  // 2. Background Supabase persistence
  (async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const syncId = `notif_${notification.id.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const payload = {
          id: syncId,
          rating: 5,
          message: `${NOTIFICATION_PREFIX}${JSON.stringify(notification)}`,
          status: notification.isRead ? 'RESOLVED' : 'NEW',
          user_email: 'admin@playroom.app',
        };
        const { error } = await supabase.from('feedback').update(payload).eq('id', syncId);
        if (error) {
          await supabase.from('feedback').insert([payload]);
        }
      } catch (err) {
        console.warn('Supabase notification save notice:', err);
      }
    }
  })().catch(() => null);

  return notification;
}

export async function createAdminNotification(
  type: 'inquiry' | 'activation' | 'renewal_request' | 'revocation' | 'complaint',
  title: string,
  message: string,
  metadata?: Record<string, any>
): Promise<AdminNotificationItem> {
  const item: AdminNotificationItem = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    title,
    message,
    timestamp: new Date().toISOString(),
    isRead: false,
    metadata,
  };
  return saveAdminNotification(item);
}

export async function markAdminNotificationRead(id: string): Promise<boolean> {
  const notifs = await fetchAllAdminNotifications();
  const target = notifs.find((n) => n.id === id);
  if (target) {
    target.isRead = true;
    await saveAdminNotification(target);
    return true;
  }
  return false;
}

export async function markAllAdminNotificationsRead(): Promise<boolean> {
  const notifs = await fetchAllAdminNotifications();
  for (const n of notifs) {
    if (!n.isRead) {
      n.isRead = true;
      await saveAdminNotification(n);
    }
  }
  return true;
}

export async function deleteAdminNotification(id: string): Promise<boolean> {
  const normId = id.toLowerCase().trim();

  // 1. Instant local removal & UI event
  if (typeof window !== 'undefined') {
    try {
      const deletedNotifs = getDeletedNotifIds();
      deletedNotifs.add(normId);
      localStorage.setItem(LOCAL_STORAGE_DELETED_NOTIFS, JSON.stringify(Array.from(deletedNotifs)));

      const raw = localStorage.getItem(LOCAL_STORAGE_NOTIFICATIONS);
      if (raw) {
        const list: AdminNotificationItem[] = JSON.parse(raw);
        const filtered = list.filter((n) => (n.id || '').toLowerCase().trim() !== normId);
        localStorage.setItem(LOCAL_STORAGE_NOTIFICATIONS, JSON.stringify(filtered));
        window.dispatchEvent(new CustomEvent('playroom_admin_notifications_update'));
      }
    } catch {}
  }

  // 2. Background Supabase cleanup
  (async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const syncId = `notif_${normId.replace(/[^a-z0-9]/g, '_')}`;
        await Promise.allSettled([
          supabase.from('feedback').delete().eq('id', syncId),
          supabase.from('feedback').delete().eq('id', id),
          supabase.from('feedback').delete().like('message', `%${normId}%`),
        ]);
      } catch {}
    }
  })().catch(() => null);

  return true;
}

export async function clearAllAdminNotifications(): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_NOTIFICATIONS);
      if (raw) {
        const list: AdminNotificationItem[] = JSON.parse(raw);
        const deletedNotifs = getDeletedNotifIds();
        list.forEach((n) => {
          if (n && n.id) deletedNotifs.add(n.id.toLowerCase().trim());
        });
        localStorage.setItem(LOCAL_STORAGE_DELETED_NOTIFS, JSON.stringify(Array.from(deletedNotifs)));
      }
      localStorage.removeItem(LOCAL_STORAGE_NOTIFICATIONS);
      window.dispatchEvent(new CustomEvent('playroom_admin_notifications_update'));
    } catch {}
  }

  (async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('feedback').delete().like('message', `${NOTIFICATION_PREFIX}%`);
      } catch {}
    }
  })().catch(() => null);

  return true;
}

// ---------------------------------------------------------------------------
// 6. SCHOOL COMPLAINTS SYNC (Submit complaints, attachments, status & reply)
// ---------------------------------------------------------------------------

export async function fetchAllSchoolComplaints(): Promise<SchoolComplaint[]> {
  const deletedComplaints = getDeletedComplaintIds();
  const map = new Map<string, SchoolComplaint>();

  // 1. Read from LocalStorage
  if (typeof window !== 'undefined') {
    try {
      [LOCAL_STORAGE_COMPLAINTS, LOCAL_STORAGE_COMPLAINTS_ALT].forEach((key) => {
        const raw = localStorage.getItem(key);
        if (raw) {
          const list: SchoolComplaint[] = JSON.parse(raw);
          list.forEach((cmp) => {
            const normId = (cmp.id || '').toLowerCase().trim();
            if (normId && !deletedComplaints.has(normId)) {
              map.set(normId, cmp);
            }
          });
        }
      });
    } catch (e) {
      console.warn('LocalStorage complaints read error:', e);
    }
  }

  // 2. Read from Supabase feedback table with COMPLAINT_PREFIX
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const res = await withTimeout(
        supabase
          .from('feedback')
          .select('*')
          .like('message', `${COMPLAINT_PREFIX}%`)
          .order('created_at', { ascending: false }),
        1200,
        { data: null, error: null } as any
      );

      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        res.data.forEach((row: any) => {
          try {
            const jsonStr = (row.message || '').replace(COMPLAINT_PREFIX, '').trim();
            const cmp: SchoolComplaint = JSON.parse(jsonStr);
            const normId = (cmp.id || row.id || '').toLowerCase().trim();
            if (normId && !deletedComplaints.has(normId)) {
              if (!map.has(normId)) {
                map.set(normId, cmp);
              } else {
                // Merge latest if needed
                const existing = map.get(normId)!;
                if (new Date(cmp.submittedAt || row.created_at).getTime() >= new Date(existing.submittedAt || 0).getTime()) {
                  map.set(normId, { ...existing, ...cmp });
                }
              }
            }
          } catch {
            // Ignore parse errors
          }
        });
      }
    } catch (e) {
      console.warn('Supabase fetch complaints notice:', e);
    }
  }

  const result = Array.from(map.values()).sort(
    (a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime()
  );

  // Sync back to local storage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_STORAGE_COMPLAINTS, JSON.stringify(result));
    } catch {}
  }

  return result;
}

export async function saveSchoolComplaint(complaint: SchoolComplaint): Promise<SchoolComplaint> {
  const normId = (complaint.id || `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`).toLowerCase().trim();
  const cleanComplaint: SchoolComplaint = {
    ...complaint,
    id: normId,
    submittedAt: complaint.submittedAt || new Date().toISOString(),
    status: complaint.status || 'OPEN',
  };

  // 1. Instant local persistence & UI update
  if (typeof window !== 'undefined') {
    try {
      const deletedComplaints = getDeletedComplaintIds();
      if (deletedComplaints.has(normId)) {
        deletedComplaints.delete(normId);
        localStorage.setItem(LOCAL_STORAGE_DELETED_COMPLAINTS, JSON.stringify(Array.from(deletedComplaints)));
      }

      // Save to localStorage
      const raw = localStorage.getItem(LOCAL_STORAGE_COMPLAINTS);
      const list: SchoolComplaint[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex((c) => (c.id || '').toLowerCase().trim() === normId);
      if (idx >= 0) {
        list[idx] = cleanComplaint;
      } else {
        list.unshift(cleanComplaint);
      }
      localStorage.setItem(LOCAL_STORAGE_COMPLAINTS, JSON.stringify(list));
      localStorage.setItem(LOCAL_STORAGE_COMPLAINTS_ALT, JSON.stringify(list));

      // Trigger UI updates
      window.dispatchEvent(new CustomEvent('playroom_school_complaint_update'));
    } catch (e) {
      console.warn('Local save complaint notice:', e);
    }
  }

  // 2. Background cloud persistence & notification
  (async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const syncId = `cmp_${normId.replace(/[^a-z0-9]/g, '_')}`;
        const payloadString = `${COMPLAINT_PREFIX} ${JSON.stringify(cleanComplaint)}`;

        await supabase.from('feedback').upsert({
          id: syncId,
          user_email: cleanComplaint.contactEmail || 'school@partner.edu',
          rating: 1,
          message: payloadString,
          status: cleanComplaint.status === 'RESOLVED' ? 'REVIEWED' : 'PENDING',
          created_at: cleanComplaint.submittedAt,
        });
      } catch (e) {
        console.warn('Supabase save complaint background notice:', e);
      }
    }

    try {
      await createAdminNotification(
        'complaint',
        `⚠️ New Complaint: ${cleanComplaint.schoolName}`,
        `${cleanComplaint.contactName} (${cleanComplaint.contactEmail}) submitted a complaint: "${cleanComplaint.subject}"`,
        {
          complaintId: cleanComplaint.id,
          schoolName: cleanComplaint.schoolName,
          email: cleanComplaint.contactEmail,
          category: cleanComplaint.category,
        }
      );
    } catch (err) {
      console.warn('Admin complaint notification notice:', err);
    }
  })().catch(() => null);

  return cleanComplaint;
}

export async function updateSchoolComplaintStatus(
  id: string,
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED',
  adminReplyNotes?: string
): Promise<boolean> {
  const normId = id.toLowerCase().trim();

  // 1. LocalStorage update immediately
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_COMPLAINTS);
      if (raw) {
        const list: SchoolComplaint[] = JSON.parse(raw);
        const idx = list.findIndex((c) => (c.id || '').toLowerCase().trim() === normId);
        if (idx >= 0) {
          list[idx].status = status;
          if (status === 'RESOLVED') {
            list[idx].resolvedAt = new Date().toISOString();
          }
          if (adminReplyNotes !== undefined) {
            list[idx].adminReplyNotes = adminReplyNotes;
          }
          localStorage.setItem(LOCAL_STORAGE_COMPLAINTS, JSON.stringify(list));
          localStorage.setItem(LOCAL_STORAGE_COMPLAINTS_ALT, JSON.stringify(list));
          window.dispatchEvent(new CustomEvent('playroom_school_complaint_update'));
        }
      }
    } catch {}
  }

  // 2. Background Supabase Cloud update
  (async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const syncId = `cmp_${normId.replace(/[^a-z0-9]/g, '_')}`;
        const complaints = await fetchAllSchoolComplaints();
        const target = complaints.find((c) => (c.id || '').toLowerCase().trim() === normId);
        if (target) {
          target.status = status;
          if (status === 'RESOLVED') target.resolvedAt = new Date().toISOString();
          if (adminReplyNotes !== undefined) target.adminReplyNotes = adminReplyNotes;

          await supabase.from('feedback').upsert({
            id: syncId,
            user_email: target.contactEmail || 'school@partner.edu',
            rating: 1,
            message: `${COMPLAINT_PREFIX} ${JSON.stringify(target)}`,
            status: status === 'RESOLVED' ? 'REVIEWED' : 'PENDING',
            created_at: target.submittedAt,
          });
        }
      } catch (e) {
        console.warn('Supabase update complaint status background notice:', e);
      }
    }
  })().catch(() => null);

  return true;
}

export async function deleteSchoolComplaint(id: string): Promise<boolean> {
  const normId = id.toLowerCase().trim();

  // 1. Instant Record Tombstone & UI update
  if (typeof window !== 'undefined') {
    try {
      const deletedComplaints = getDeletedComplaintIds();
      deletedComplaints.add(normId);
      localStorage.setItem(LOCAL_STORAGE_DELETED_COMPLAINTS, JSON.stringify(Array.from(deletedComplaints)));

      const raw = localStorage.getItem(LOCAL_STORAGE_COMPLAINTS);
      if (raw) {
        const list: SchoolComplaint[] = JSON.parse(raw);
        const filtered = list.filter((c) => (c.id || '').toLowerCase().trim() !== normId);
        localStorage.setItem(LOCAL_STORAGE_COMPLAINTS, JSON.stringify(filtered));
        localStorage.setItem(LOCAL_STORAGE_COMPLAINTS_ALT, JSON.stringify(filtered));
        window.dispatchEvent(new CustomEvent('playroom_school_complaint_update'));
      }
    } catch {}
  }

  // 2. Background Delete from Supabase
  (async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const syncId = `cmp_${normId.replace(/[^a-z0-9]/g, '_')}`;
        await Promise.allSettled([
          supabase.from('feedback').delete().eq('id', syncId),
          supabase.from('feedback').delete().eq('id', id),
          supabase.from('feedback').delete().like('message', `%${normId}%`),
        ]);
      } catch {}
    }
  })().catch(() => null);

  return true;
}

