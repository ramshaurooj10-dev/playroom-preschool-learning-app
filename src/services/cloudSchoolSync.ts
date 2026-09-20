import { SchoolLicense, SchoolPaymentRequest, SchoolRenewalRequest } from '../types/payment';
import { getSupabaseClient } from '../utils/supabaseClient';

const LICENSE_PREFIX = '[SCHOOL_LICENSE_SYNC]';
const REQUEST_PREFIX = '[SCHOOL_REQUEST_SYNC]';
const RENEWAL_PREFIX = '[SCHOOL_RENEWAL_SYNC]';

const LOCAL_STORAGE_LICENSES = 'playroom_all_school_licenses';
const LOCAL_STORAGE_REQUESTS = 'playroom_school_payment_requests';
const LOCAL_STORAGE_RENEWALS = 'playroom_school_renewal_requests';
const LOCAL_STORAGE_USED_KEYS = 'playroom_registered_used_license_keys';

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

      const rawLics = localStorage.getItem(LOCAL_STORAGE_LICENSES);
      if (rawLics) {
        const lics: SchoolLicense[] = JSON.parse(rawLics);
        lics.forEach((l) => {
          if (l.licenseKey) used.add(l.licenseKey.toUpperCase().trim());
        });
      }
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

  // 2. Load Local Storage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_LICENSES);
      if (raw) {
        const list: SchoolLicense[] = JSON.parse(raw);
        list.forEach((l) => {
          const k = (l.licenseKey || l.id).toUpperCase().trim();
          licenseMap.set(k, l);
        });
      }
    } catch (e) {
      console.warn('Local license parse error:', e);
    }
  }

  // 3. Load Supabase Cloud feedback sync records
  const supabase = getSupabaseClient();
  if (supabase) {
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

  // Update local storage cache
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_STORAGE_LICENSES, JSON.stringify(result));
    } catch {
      // Ignore
    }
  }

  return result;
}

export async function saveSchoolLicense(license: SchoolLicense): Promise<SchoolLicense> {
  const normKey = (license.licenseKey || license.id).toUpperCase().trim();
  recordUsedKey(normKey);

  // 1. Update local storage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_LICENSES);
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
      localStorage.setItem(LOCAL_STORAGE_LICENSES, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('playroom_license_update'));
    } catch {
      // Ignore
    }
  }

  // 2. Sync to Supabase Cloud
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

      // Try update first
      const { error: updateErr } = await supabase
        .from('feedback')
        .update(payload)
        .eq('id', syncId);

      if (updateErr) {
        // If row doesn't exist, insert
        await supabase.from('feedback').insert([payload]);
      }
    } catch (err) {
      console.warn('Supabase license cloud save error:', err);
    }
  }

  return license;
}

export async function deleteSchoolLicense(licenseIdOrKey: string): Promise<boolean> {
  const normKey = licenseIdOrKey.toUpperCase().trim();

  // 1. Delete from local storage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_LICENSES);
      if (raw) {
        const list: SchoolLicense[] = JSON.parse(raw);
        const filtered = list.filter(
          (l) =>
            l.id !== licenseIdOrKey &&
            (!l.licenseKey || l.licenseKey.toUpperCase().trim() !== normKey)
        );
        localStorage.setItem(LOCAL_STORAGE_LICENSES, JSON.stringify(filtered));
        window.dispatchEvent(new CustomEvent('playroom_license_update'));
      }
    } catch {
      // Ignore
    }
  }

  // 2. Delete from Supabase
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const syncId = `lic_${normKey.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      await supabase.from('feedback').delete().eq('id', syncId);
    } catch (err) {
      console.warn('Supabase cloud license delete error:', err);
    }
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
  const normKey = key.toUpperCase().trim();
  const licenses = await fetchAllSchoolLicenses();

  const found = licenses.find(
    (l) =>
      (l.licenseKey && l.licenseKey.toUpperCase().trim() === normKey) ||
      (l.id && l.id.toUpperCase().trim() === normKey)
  );

  if (!found) {
    return {
      success: false,
      error: 'Invalid license key. Please check your key and try again.',
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

  // Save as active school license in session
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('playroom_active_school_license', JSON.stringify(activatedLicense));
      window.dispatchEvent(new CustomEvent('playroom_license_update'));
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

  // 1. Local Storage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_REQUESTS);
      if (raw) {
        const list: SchoolPaymentRequest[] = JSON.parse(raw);
        list.forEach((r) => reqMap.set(r.id, r));
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
      localStorage.setItem(LOCAL_STORAGE_REQUESTS, JSON.stringify(result));
    } catch {
      // Ignore
    }
  }

  return result;
}

export async function saveSchoolRequest(request: SchoolPaymentRequest): Promise<SchoolPaymentRequest> {
  // 1. Local Storage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_REQUESTS);
      const list: SchoolPaymentRequest[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex((r) => r.id === request.id);
      if (idx !== -1) {
        list[idx] = request;
      } else {
        list.unshift(request);
      }
      localStorage.setItem(LOCAL_STORAGE_REQUESTS, JSON.stringify(list));
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

  return request;
}

export async function deleteSchoolRequest(requestId: string): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_REQUESTS);
      if (raw) {
        const list: SchoolPaymentRequest[] = JSON.parse(raw);
        const filtered = list.filter((r) => r.id !== requestId);
        localStorage.setItem(LOCAL_STORAGE_REQUESTS, JSON.stringify(filtered));
        window.dispatchEvent(new CustomEvent('playroom_school_request_update'));
      }
    } catch {
      // Ignore
    }
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const syncId = `req_${requestId.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      await supabase.from('feedback').delete().eq('id', syncId);
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
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_RENEWALS);
      if (raw) {
        const list: SchoolRenewalRequest[] = JSON.parse(raw);
        list.forEach((r) => renMap.set(r.id, r));
      }
    } catch {
      // Ignore
    }
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
      localStorage.setItem(LOCAL_STORAGE_RENEWALS, JSON.stringify(result));
    } catch {
      // Ignore
    }
  }

  return result;
}

export async function saveSchoolRenewal(renewal: SchoolRenewalRequest): Promise<SchoolRenewalRequest> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_RENEWALS);
      const list: SchoolRenewalRequest[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex((r) => r.id === renewal.id);
      if (idx !== -1) {
        list[idx] = renewal;
      } else {
        list.unshift(renewal);
      }
      localStorage.setItem(LOCAL_STORAGE_RENEWALS, JSON.stringify(list));
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

  return renewal;
}

export async function deleteSchoolRenewal(renewalId: string): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_RENEWALS);
      if (raw) {
        const list: SchoolRenewalRequest[] = JSON.parse(raw);
        const filtered = list.filter((r) => r.id !== renewalId);
        localStorage.setItem(LOCAL_STORAGE_RENEWALS, JSON.stringify(filtered));
        window.dispatchEvent(new CustomEvent('playroom_renewal_request_update'));
      }
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
