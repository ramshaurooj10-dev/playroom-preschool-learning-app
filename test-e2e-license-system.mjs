import http from 'http';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (_) {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const post = (path, body) => request('POST', path, body);
const get = (path) => request('GET', path);

async function runCompleteE2EVerification() {
  console.log('================================================================================');
  console.log('   PLAYROOM SCHOOL LICENSE: REAL END-TO-END VERIFICATION & AUDIT SUITE           ');
  console.log('================================================================================\n');

  const results = {};

  // TEST 1: School submits request & it appears in admin panel
  console.log('--- TEST 1: School Submits Request & Appears in Admin Panel ---');
  const testSchool1Name = 'Comprehensive E2E Verification Academy';
  const req1 = await post('/api/payment/school-request', {
    schoolName: testSchool1Name,
    contactName: 'Dean Dr. Haris Farooq',
    contactEmail: 'haris.farooq@e2e-audit-academy.edu',
    phoneNumber: '+923001234567',
    country: 'Pakistan',
    city: 'Lahore',
    subject: 'Institutional License Application',
    schoolMessage: 'Formal inquiry for Playroom school license verification suite.',
  });
  console.log('Submit Request Response Status:', req1.status);
  console.log('Submit Request Response Body:', JSON.stringify(req1.body, null, 2));

  const submittedRequestId = req1.body?.request?.id;
  const submittedSchoolId = req1.body?.request?.schoolId;

  // Verify request appears in Admin Requests
  const adminRequests = await get('/api/payment/school-requests');
  console.log('Get Admin School Requests Status:', adminRequests.status);
  const foundInAdmin = Array.isArray(adminRequests.body?.requests) &&
    adminRequests.body.requests.some(r => r.id === submittedRequestId || r.school_name === testSchool1Name);
  console.log('Request located in Admin Requests list:', foundInAdmin);

  results['TEST_1'] = req1.status === 200 && req1.body?.success === true && foundInAdmin;

  // TEST 2: Admin approval generates unique one-time license key linked to correct school
  console.log('\n--- TEST 2: Admin Approval Generates Unique One-Time License Key ---');
  const app1 = await post('/api/payment/school-request/approve', {
    requestId: submittedRequestId,
    adminEmail: 'admin@playroom.app',
    adminNotes: 'Approved during E2E verification',
  });
  console.log('Approve Request Response Status:', app1.status);
  console.log('Approve Request Response Body:', JSON.stringify(app1.body, null, 2));

  const key1 = app1.body?.licenseKey;
  const approvedLic = app1.body?.license;
  console.log(`Generated Key: ${key1}`);
  console.log(`Linked School Name: ${approvedLic?.schoolName}`);
  console.log(`Initial Status: ${approvedLic?.status}`);

  results['TEST_2'] = app1.status === 200 &&
    Boolean(key1 && key1.startsWith('SCH-')) &&
    approvedLic?.schoolName === testSchool1Name &&
    approvedLic?.status === 'PENDING';

  // TEST 3: One-month license period starts ONLY on first successful activation
  console.log('\n--- TEST 3: 1-Month Period Starts ONLY on First Activation ---');
  // Check that prior to activation, status is PENDING and timestamps are not active
  const checkPending = await post('/api/license/status', { licenseKey: key1 });
  console.log('Pre-activation Status Check:', checkPending.body?.status);
  const isPreActivationPending = checkPending.body?.status === 'PENDING';

  // Perform first activation
  const act1 = await post('/api/license/activate', {
    licenseKey: key1,
    deviceId: 'audit_device_primary_01',
  });
  console.log('Activation Response Status:', act1.status);
  console.log('Activation Response Body:', JSON.stringify(act1.body, null, 2));

  const origValidFrom = act1.body?.license?.validFrom;
  const origValidUntil = act1.body?.license?.validUntil;
  const origActivatedAt = act1.body?.license?.activatedAt;
  const startMs = new Date(origValidFrom).getTime();
  const endMs = new Date(origValidUntil).getTime();
  const durationDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
  console.log(`Duration in Days: ${durationDays} (Calendar Month: ~28 to 31 days)`);

  results['TEST_3'] = isPreActivationPending &&
    act1.status === 200 &&
    act1.body?.success === true &&
    act1.body?.license?.status === 'ACTIVE' &&
    durationDays >= 28 && durationDays <= 31;

  // TEST 4: Duplicate activation NEVER resets or extends original expiration timestamp
  console.log('\n--- TEST 4: Duplicate Activation Never Resets or Extends Expiration Timestamp ---');
  // Simulate another device or same device activating the active key
  const duplicateAct = await post('/api/license/activate', {
    licenseKey: key1,
    deviceId: 'audit_device_secondary_02',
  });
  console.log('Duplicate Activation Response Status:', duplicateAct.status);
  console.log('Duplicate Activation Response Body:', JSON.stringify(duplicateAct.body, null, 2));

  const dupValidFrom = duplicateAct.body?.license?.validFrom;
  const dupValidUntil = duplicateAct.body?.license?.validUntil;
  const dupActivatedAt = duplicateAct.body?.license?.activatedAt;

  const timestampsIdentical = dupValidFrom === origValidFrom &&
    dupValidUntil === origValidUntil &&
    dupActivatedAt === origActivatedAt;
  console.log('Timestamps strictly preserved:', timestampsIdentical);

  results['TEST_4'] = duplicateAct.status === 200 &&
    duplicateAct.body?.isAlreadyActive === true &&
    timestampsIdentical;

  // TEST 5 & 8: Server-side expiry validation & client device clock immunity
  console.log('\n--- TEST 5 & 8: Server-Side Expiry Validation & Device Date Immunity ---');
  // Simulate time reaching expiration in controlled test database record
  const pastExpiryIso = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
  const simExpiryUpdate = await post('/api/payment/school-license/save', {
    license: {
      ...act1.body?.license,
      validUntil: pastExpiryIso,
      expiryDate: pastExpiryIso,
      status: 'EXPIRED',
    }
  });
  console.log('Simulated Expiry Save Status:', simExpiryUpdate.status);

  // Validate on backend
  const validateExpired = await post('/api/license/validate', { licenseKey: key1 });
  console.log('Validate Expired Key Status:', validateExpired.status);
  console.log('Validate Expired Key Body:', JSON.stringify(validateExpired.body, null, 2));

  const serverValidationFailsClosed = validateExpired.body?.isExpired === true &&
    validateExpired.body?.isValid === false &&
    validateExpired.body?.status === 'EXPIRED';

  // Confirm that client passing a future or past date cannot override server validation
  const clientSpoofCheck = await post('/api/license/validate', {
    licenseKey: key1,
    clientTime: '2026-10-01T00:00:00.000Z', // Spoofed client clock
  });
  const clientSpoofBlocked = clientSpoofCheck.body?.isExpired === true &&
    clientSpoofCheck.body?.isValid === false;
  console.log('Client clock spoofing blocked by server-authoritative clock:', clientSpoofBlocked);

  results['TEST_5_8'] = serverValidationFailsClosed && clientSpoofBlocked;

  // TEST 6: Expired or previously redeemed license can never unlock the app again
  console.log('\n--- TEST 6: Expired License Re-activation Rejection via Actual API ---');
  const reactivateExpiredAttempt = await post('/api/license/activate', {
    licenseKey: key1,
    deviceId: 'audit_device_retry_03',
  });
  console.log('Re-activation Attempt Response Status:', reactivateExpiredAttempt.status);
  console.log('Re-activation Attempt Response Body:', JSON.stringify(reactivateExpiredAttempt.body, null, 2));

  const step6Blocked = reactivateExpiredAttempt.status === 403 &&
    reactivateExpiredAttempt.body?.isExpired === true &&
    reactivateExpiredAttempt.body?.isValid === false &&
    reactivateExpiredAttempt.body?.error?.includes('expired and cannot be reused');
  console.log('Reactivation permanently blocked with HTTP 403 Forbidden:', step6Blocked);

  results['TEST_6'] = step6Blocked;

  // TEST 7: Manual renewal and revocation endpoints remain disabled
  console.log('\n--- TEST 7: Manual Renewal and Revocation Endpoints Disabled ---');
  const renewEndpointRes = await post('/api/payment/school-license/renew', { licenseKey: key1 });
  console.log('POST /api/payment/school-license/renew Status:', renewEndpointRes.status);
  console.log('POST /api/payment/school-license/renew Error:', renewEndpointRes.body?.error);

  const renewApproveRes = await post('/api/license/renew-request/approve', { licenseKey: key1 });
  console.log('POST /api/license/renew-request/approve Status:', renewApproveRes.status);
  console.log('POST /api/license/renew-request/approve Error:', renewApproveRes.body?.error);

  const revokeEndpointRes = await post('/api/license/revoke', { licenseKey: key1 });
  console.log('POST /api/license/revoke Status:', revokeEndpointRes.status);
  console.log('POST /api/license/revoke Error:', revokeEndpointRes.body?.error);

  const schoolRevokeRes = await post('/api/payment/school-license/revoke', { licenseKey: key1 });
  console.log('POST /api/payment/school-license/revoke Status:', schoolRevokeRes.status);
  console.log('POST /api/payment/school-license/revoke Error:', schoolRevokeRes.body?.error);

  const allManualEndpointsDisabled = renewEndpointRes.status === 400 &&
    renewApproveRes.status === 400 &&
    revokeEndpointRes.status === 400 &&
    schoolRevokeRes.status === 400;
  console.log('All manual renewal & revocation endpoints strictly return HTTP 400:', allManualEndpointsDisabled);

  results['TEST_7'] = allManualEndpointsDisabled;

  // TEST 9 & 10: New approved license generated & activated; Old license permanently unusable
  console.log('\n--- TEST 9 & 10: New License Request & Permanent Lock of Old Key ---');
  const req2 = await post('/api/payment/school-request', {
    schoolName: testSchool1Name,
    contactName: 'Dean Dr. Haris Farooq',
    contactEmail: 'haris.farooq@e2e-audit-academy.edu',
    phoneNumber: '+923001234567',
    country: 'Pakistan',
    city: 'Lahore',
    subject: 'Subsequent Term School License Request',
    schoolMessage: 'New inquiry following expiration of previous term.',
  });
  const reqId2 = req2.body?.request?.id;

  const app2 = await post('/api/payment/school-request/approve', {
    requestId: reqId2,
    adminEmail: 'admin@playroom.app',
    adminNotes: 'Approved subsequent term license',
  });
  const key2 = app2.body?.licenseKey;
  console.log(`Generated Key 2: ${key2}`);
  console.log(`Different Keys Check: ${key2 !== key1}`);

  const act2 = await post('/api/license/activate', {
    licenseKey: key2,
    deviceId: 'audit_device_new_01',
  });
  console.log('Activation of New Key 2 Status:', act2.status);
  console.log('Activation of New Key 2 Body:', JSON.stringify(act2.body, null, 2));

  // Verify that OLD key 1 remains unusable even after key 2 is active
  const oldKeyValidate = await post('/api/license/validate', { licenseKey: key1 });
  const oldKeyActivate = await post('/api/license/activate', {
    licenseKey: key1,
    deviceId: 'audit_device_old_retry',
  });
  console.log('Old Key Validation Status:', oldKeyValidate.body?.status, 'isExpired:', oldKeyValidate.body?.isExpired);
  console.log('Old Key Re-activation Status:', oldKeyActivate.status);

  const oldPermanentlyDead = oldKeyValidate.body?.isExpired === true &&
    oldKeyActivate.status === 403 &&
    act2.status === 200 &&
    key2 !== key1;

  results['TEST_9_10'] = oldPermanentlyDead;

  console.log('\n================================================================================');
  console.log('                           AUDIT RESULTS SUMMARY                                ');
  console.log('================================================================================');
  for (const [key, val] of Object.entries(results)) {
    console.log(`- ${key.padEnd(20)}: [${val ? 'PASS' : 'FAIL'}]`);
  }
}

runCompleteE2EVerification().catch(console.error);
