import { SchoolLicense, SchoolPaymentRequest, SchoolRenewalRequest } from '../types/payment';
import { getSupabaseClient } from '../utils/supabaseClient';

const LICENSE_PREFIX = '[SCHOOL_LICENSE_SYNC]';
const REQUEST_PREFIX = '[SCHOOL_REQUEST_SYNC]';
const RENEWAL_PREFIX = '[SCHOOL_RENEWAL_SYNC]';
const NOTIFICATION_PREFIX = '[ADMIN_NOTIFICATION_SYNC]';

const LOCAL_STORAGE_LICENSES = 'playroom_all_school_licenses';
const LOCAL_STORAGE_LICENSES_ALT = 'playroom_db_school_licenses';
const LOCAL_STORAGE_REQUESTS = 'playroom_school_payment_requests';
const LOCAL_STORAGE_REQUESTS_ALT = 'playroom_db_school_requests';
const LOCAL_STORAGE_RENEWALS = 'playroom_school_renewal_requests';
const LOCAL_STORAGE_RENEWALS_ALT = 'playroom_db_school_renewal_requests';
const LOCAL_STORAGE_NOTIFICATIONS = 'playroom_admin_notifications';
const LOCAL_STORAGE_USED_KEYS = 'playroom_registered_used_license_keys';

export interface AdminNotificationItem {
  id: string;
  type: 'inquiry' | 'activation' | 'renewal_request' | 'revocation';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  linkTab?: 'registered_schools' | 'pending_requests' | 'renewal_requests';
  metadata?: Record<string, any>;
}

// Pre-registered initial authorized partner school key requested by user
export const SEED_LICENSE_KEY = 'SCH-RM3P-AV92-JS8V';

export const SEED_SCHOOL_LICENSE: SchoolLicense = {
  id: 'lic_sch_rm3p_av92_js8v',
  licenseKey: SEED_LICENSE_KEY,
  schoolId: 'sch_partner_01',
  schoolName: 'Authorized Partner School',
  schoolAdminName: 'School Administrator',
  contactName: 'School Administrator',
  contactEmail: 'ramshaurooj10@gmail.com',
  country: 'Pakistan',
  city: 'Karachi',
  price: 5000,
  currency: 'PKR',
  allowedDevices: 999999,
  page1Access: true,
  page2Access: true,
  startDate: null,
  expiryDate: null,
  validFrom: null,
  validUntil: null,
  status: 'PENDING', // Ready to activate! Timing starts as soon as entered!
  durationMonths: 1,
  durationDays: 30,
  createdAt: '2026-09-20T21:48:20.000Z',
  adminNotes: 'Authorized Partner School License - Approved by Administrator',
};

// ---------------------------------------------------------------------------
// 1. UNIQUE KEY MEMORY & GENERATION (Guarantees no duplicate keys)
// ---------------------------------------------------------------------------

export function getAllUsedKeys(): Set<string> {
  const used = new Set<string>();
  used.add(SEED_LICENSE_KEY.toUpperCase());

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

  // 1. Add Seed license
  licenseMap.set(SEED_LICENSE_KEY.toUpperCase(), { ...SEED_SCHOOL_LICENSE });

  // 2. Load Local Storage (checking both main and alternate keys)
  if (typeof window !== 'undefined') {
    [LOCAL_STORAGE_LICENSES, LOCAL_STORAGE_LICENSES_ALT].forEach((storageKey) => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const list: SchoolLicense[] = JSON.parse(raw);
          list.forEach((l) => {
            const k = (l.licenseKey || l.id).toUpperCase().trim();
            licenseMap.set(k, l);
          });
        }
      } catch (e) {
        console.warn(`Local license parse error for ${storageKey}:`, e);
      }
    });
  }

  // 3. Query Backend Server API (Direct Cloud Admin Access)
  try {
    const apiRes = await fetch('/api/payment/school-licenses');
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.success && Array.isArray(data.licenses)) {
        data.licenses.forEach((lic: SchoolLicense) => {
          const k = (lic.licenseKey || lic.id).toUpperCase().trim();
          if (k) {
            licenseMap.set(k, lic);
            recordUsedKey(k);
          }
        });
      }
    }
  } catch (apiErr) {
    // Fallback to direct client queries
  }

  // 4. Load from Supabase Cloud Directly
  const supabase = getSupabaseClient();
  if (supabase) {
    // 4a. From school_licenses table
    try {
      const { data: dbLics, error: dbErr } = await supabase.from('school_licenses').select('*');
      if (!dbErr && Array.isArray(dbLics)) {
        dbLics.forEach((row: any) => {
          const key = (row.license_key || row.id || '').toUpperCase().trim();
          if (key) {
            licenseMap.set(key, {
              id: row.id || `lic_${key.toLowerCase()}`,
              licenseKey: row.license_key || key,
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
            recordUsedKey(key);
          }
        });
      }
    } catch (dbErr) {
      console.warn('Supabase school_licenses direct select error:', dbErr);
    }

    // 4b. Load Supabase Cloud feedback sync records
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .like('message', `${LICENSE_PREFIX}%`);

      if (!error && Array.isArray(data)) {
        data.forEach((row) => {
          try {
            const rawJson = row.message.substring(LICENSE_PREFIX.length);
            const lic: SchoolLicense = JSON.parse(rawJson);
            if (lic && (lic.licenseKey || lic.id)) {
              const k = (lic.licenseKey || lic.id).toUpperCase().trim();
              licenseMap.set(k, lic);
              if (lic.licenseKey) {
                recordUsedKey(lic.licenseKey);
              }
            }
          } catch {
            // Ignore malformed row
          }
        });
      }
    } catch (err) {
      console.warn('Supabase cloud license sync error:', err);
    }
  }

  const result = Array.from(licenseMap.values());

  // Update local storage caches
  if (typeof window !== 'undefined') {
    try {
      const serialized = JSON.stringify(result);
      localStorage.setItem(LOCAL_STORAGE_LICENSES, serialized);
      localStorage.setItem(LOCAL_STORAGE_LICENSES_ALT, serialized);
    } catch {
      // Ignore
    }
  }

  return result;
}

export async function saveSchoolLicense(license: SchoolLicense): Promise<SchoolLicense> {
  const normKey = (license.licenseKey || license.id).toUpperCase().trim();
  recordUsedKey(normKey);

  // 1. Update local storage caches
  if (typeof window !== 'undefined') {
    try {
      [LOCAL_STORAGE_LICENSES, LOCAL_STORAGE_LICENSES_ALT].forEach((storageKey) => {
        const raw = localStorage.getItem(storageKey);
        const list: SchoolLicense[] = raw ? JSON.parse(raw) : [];
        const idx = list.findIndex(
          (l) =>
            (l.id && l.id === license.id) ||
            (l.licenseKey && l.licenseKey.toUpperCase().trim() === normKey)
        );
        if (idx !== -1) {
          list[idx] = license;
        } else {
          list.unshift(license);
        }
        localStorage.setItem(storageKey, JSON.stringify(list));
      });
      window.dispatchEvent(new CustomEvent('playroom_license_update'));
    } catch {
      // Ignore
    }
  }

  // 2. Sync to Supabase Cloud
  const supabase = getSupabaseClient();
  if (supabase) {
    // 2a. Sync to feedback table
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
      console.warn('Supabase license cloud save error:', err);
    }

    // 2b. Sync to school_licenses table
    try {
      const dbRecord = {
        id: license.id || `lic_${normKey.toLowerCase()}`,
        school_id: license.schoolId || null,
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
      console.warn('Supabase school_licenses direct save error:', schLicErr);
    }
  }

  return license;
}

export async function deleteSchoolLicense(licenseIdOrKey: string): Promise<boolean> {
  const normKey = licenseIdOrKey.toUpperCase().trim();

  // 1. Delete from local storage
  if (typeof window !== 'undefined') {
    try {
      [LOCAL_STORAGE_LICENSES, LOCAL_STORAGE_LICENSES_ALT].forEach((storageKey) => {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const list: SchoolLicense[] = JSON.parse(raw);
          const filtered = list.filter(
            (l) =>
              l.id !== licenseIdOrKey &&
              (!l.licenseKey || l.licenseKey.toUpperCase().trim() !== normKey)
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
            (activeLic.licenseKey && activeLic.licenseKey.toUpperCase().trim() === normKey)
          ) {
            localStorage.removeItem('playroom_active_school_license');
          }
        } catch {
          // Ignore
        }
      }

      window.dispatchEvent(new CustomEvent('playroom_license_update'));
    } catch {
      // Ignore
    }
  }

  // 2. Call Backend Server Deletion (Revokes key in Supabase database)
  try {
    await fetch('/api/payment/school-license/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseId: licenseIdOrKey, licenseKey: normKey }),
    });
  } catch (apiErr) {
    console.warn('Backend delete license endpoint notice:', apiErr);
  }

  // 3. Delete from Supabase client-side
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const syncId = `lic_${normKey.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      await supabase.from('feedback').delete().eq('id', syncId);
      await supabase.from('school_licenses').update({ status: 'REVOKED' }).eq('license_key', normKey);
      await supabase.from('school_licenses').delete().eq('license_key', normKey);
      await supabase.from('school_licenses').delete().eq('id', licenseIdOrKey);
    } catch (err) {
      console.warn('Supabase cloud license delete error:', err);
    }
  }

  // 4. Create Admin Notification for Revocation
  try {
    await createAdminNotification(
      'revocation',
      'School License Revoked / Deleted',
      `License key ${normKey} was revoked by Administrator. Device access terminated immediately.`,
      { licenseKey: normKey, deletedAt: new Date().toISOString() }
    );
  } catch {
    // Ignore notification error
  }

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
  const normKey = (key || '').toUpperCase().trim();
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
      body: JSON.stringify({ licenseKey: normKey }),
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

        // Trigger Admin Notification for real-time awareness (Requirement 7)
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

      if (data.error) {
        return {
          success: false,
          error: data.error,
        };
      }
    }
  } catch (apiErr) {
    console.warn('Backend activation endpoint fallback:', apiErr);
  }

  // 2. Client-side database and local cache fallback
  const licenses = await fetchAllSchoolLicenses();

  const found = licenses.find(
    (l) =>
      (l.licenseKey && l.licenseKey.toUpperCase().trim() === normKey) ||
      (l.id && l.id.toUpperCase().trim() === normKey) ||
      (l.licenseKey && l.licenseKey.replace(/-/g, '').toUpperCase().trim() === normKey.replace(/-/g, ''))
  );

  if (!found) {
    return {
      success: false,
      error: 'Invalid license key. Please check your key and try again.',
    };
  }

  if (found.status === 'REVOKED') {
    return {
      success: false,
      error: 'This license key has been revoked. Please contact administration.',
    };
  }

  const now = new Date();

  // If already active, check if expired
  if (found.status === 'ACTIVE' && (found.validUntil || found.expiryDate)) {
    const expTime = new Date(found.validUntil || found.expiryDate!).getTime();
    if (expTime <= now.getTime()) {
      found.status = 'EXPIRED';
      await saveSchoolLicense(found);
      return {
        success: false,
        error: 'This license key has expired.',
        isExpired: true,
        license: found,
      };
    }
    // Still active and valid
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('playroom_active_school_license', JSON.stringify(found));
        window.dispatchEvent(new CustomEvent('playroom_license_update'));
      } catch (_) {}
    }
    return { success: true, license: found };
  }

  // If PENDING (or brand new): Start the 30-day countdown NOW!
  const expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const activatedLicense: SchoolLicense = {
    ...found,
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

  // Trigger Admin Notification for real-time awareness (Requirement 7)
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

  // 1. Local Storage (checking both main and alternate keys)
  if (typeof window !== 'undefined') {
    [LOCAL_STORAGE_REQUESTS, LOCAL_STORAGE_REQUESTS_ALT].forEach((storageKey) => {
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

  // 2. Supabase Cloud direct table queries
  const supabase = getSupabaseClient();
  if (supabase) {
    // 2a. Query school_requests table
    try {
      const { data: dbRequests, error: dbErr } = await supabase.from('school_requests').select('*');
      if (!dbErr && Array.isArray(dbRequests)) {
        dbRequests.forEach((row: any) => {
          if (row.id) {
            reqMap.set(row.id, {
              id: row.id,
              schoolId: row.school_id || '',
              schoolName: row.school_name || 'Partner School',
              schoolAdminName: row.school_admin_name || row.contact_name || '',
              contactName: row.contact_name || row.school_admin_name || '',
              contactEmail: row.contact_email || '',
              contactPhone: row.contact_phone || row.phone_number || '',
              phoneNumber: row.phone_number || row.contact_phone || '',
              country: row.country || 'Pakistan',
              city: row.city || 'Karachi',
              subject: row.subject || 'School License Inquiry',
              schoolMessage: row.school_message || row.message || '',
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
    } catch (dbErr) {
      console.warn('Supabase school_requests direct query warning:', dbErr);
    }

    // 2b. Fallback query school_request (singular) table
    try {
      const { data: singRequests, error: singErr } = await supabase.from('school_request').select('*');
      if (!singErr && Array.isArray(singRequests)) {
        singRequests.forEach((row: any) => {
          if (row.id && !reqMap.has(row.id)) {
            reqMap.set(row.id, {
              id: row.id,
              schoolId: row.school_id || '',
              schoolName: row.school_name || 'Partner School',
              schoolAdminName: row.school_admin_name || row.contact_name || '',
              contactName: row.contact_name || row.school_admin_name || '',
              contactEmail: row.contact_email || '',
              contactPhone: row.contact_phone || row.phone_number || '',
              phoneNumber: row.phone_number || row.contact_phone || '',
              country: row.country || 'Pakistan',
              city: row.city || 'Karachi',
              subject: row.subject || 'School License Inquiry',
              schoolMessage: row.school_message || row.message || '',
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
    } catch (singErr) {
      console.warn('Supabase school_request singular direct query warning:', singErr);
    }

    // 2c. Supabase Cloud feedback sync
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .like('message', `${REQUEST_PREFIX}%`);

      if (!error && Array.isArray(data)) {
        data.forEach((row) => {
          try {
            const rawJson = row.message.substring(REQUEST_PREFIX.length);
            const req: SchoolPaymentRequest = JSON.parse(rawJson);
            if (req && req.id) {
              reqMap.set(req.id, req);
            }
          } catch {
            // Ignore
          }
        });
      }
    } catch (err) {
      console.warn('Supabase request sync error:', err);
    }
  }

  const result = Array.from(reqMap.values());
  result.sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());

  if (typeof window !== 'undefined') {
    try {
      const serialized = JSON.stringify(result);
      localStorage.setItem(LOCAL_STORAGE_REQUESTS, serialized);
      localStorage.setItem(LOCAL_STORAGE_REQUESTS_ALT, serialized);
    } catch {
      // Ignore
    }
  }

  return result;
}

export async function saveSchoolRequest(request: SchoolPaymentRequest): Promise<SchoolPaymentRequest> {
  // 1. Local Storage (update both main and alternate keys)
  if (typeof window !== 'undefined') {
    try {
      [LOCAL_STORAGE_REQUESTS, LOCAL_STORAGE_REQUESTS_ALT].forEach((storageKey) => {
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
    } catch {
      // Ignore
    }
  }

  // 2. Supabase
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
      console.warn('Supabase save request error:', err);
    }
  }

  // 3. Admin Notification
  try {
    await createAdminNotification(
      'inquiry',
      'New School Inquiry Submitted',
      `${request.schoolName} (${request.contactEmail}) submitted a new inquiry.`,
      {
        requestId: request.id,
        schoolName: request.schoolName,
        contactEmail: request.contactEmail,
        country: request.country,
      }
    );
  } catch {
    // Ignore notification error
  }

  return request;
}

export async function deleteSchoolRequest(requestId: string): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      [LOCAL_STORAGE_REQUESTS, LOCAL_STORAGE_REQUESTS_ALT].forEach((storageKey) => {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const list: SchoolPaymentRequest[] = JSON.parse(raw);
          const filtered = list.filter((r) => r.id !== requestId);
          localStorage.setItem(storageKey, JSON.stringify(filtered));
        }
      });
      window.dispatchEvent(new CustomEvent('playroom_school_request_update'));
    } catch {
      // Ignore
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const syncId = `req_${requestId.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      await supabase.from('feedback').delete().eq('id', syncId);
      await supabase.from('school_requests').delete().eq('id', requestId);
      await supabase.from('school_request').delete().eq('id', requestId);
    } catch {
      // Ignore
    }
  }

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

  // 1. Local storage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_NOTIFICATIONS);
      if (raw) {
        const list: AdminNotificationItem[] = JSON.parse(raw);
        list.forEach((n) => notifMap.set(n.id, n));
      }
    } catch {
      // Ignore
    }
  }

  // 2. Supabase Cloud feedback sync
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .like('message', `${NOTIFICATION_PREFIX}%`);

      if (!error && Array.isArray(data)) {
        data.forEach((row) => {
          try {
            const rawJson = row.message.substring(NOTIFICATION_PREFIX.length);
            const n: AdminNotificationItem = JSON.parse(rawJson);
            if (n && n.id) {
              notifMap.set(n.id, n);
            }
          } catch {
            // Ignore
          }
        });
      }
    } catch (err) {
      console.warn('Supabase notifications sync error:', err);
    }
  }

  const result = Array.from(notifMap.values());
  result.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_STORAGE_NOTIFICATIONS, JSON.stringify(result));
    } catch {
      // Ignore
    }
  }

  return result;
}

export async function saveAdminNotification(notification: AdminNotificationItem): Promise<AdminNotificationItem> {
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
    } catch {
      // Ignore
    }
  }

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
      console.warn('Supabase notification save error:', err);
    }
  }

  return notification;
}

export async function createAdminNotification(
  type: 'inquiry' | 'activation' | 'renewal_request' | 'revocation',
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
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_NOTIFICATIONS);
      if (raw) {
        const list: AdminNotificationItem[] = JSON.parse(raw);
        const filtered = list.filter((n) => n.id !== id);
        localStorage.setItem(LOCAL_STORAGE_NOTIFICATIONS, JSON.stringify(filtered));
        window.dispatchEvent(new CustomEvent('playroom_admin_notifications_update'));
      }
    } catch {
      // Ignore
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const syncId = `notif_${id.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      await supabase.from('feedback').delete().eq('id', syncId);
    } catch {
      // Ignore
    }
  }

  return true;
}

