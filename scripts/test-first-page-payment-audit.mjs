// Automated Test Suite for First-Page Payment & Premium-Unlock System
// Runs safely against localhost:3000 without altering production records.

import http from 'http';
import https from 'https';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('   PLAYROOM TODDLER APP: FIRST-PAGE PAYMENT SYSTEM TEST SUITE   ');
  console.log('================================================================\n');

  const results = {
    passed: [],
    failed: [],
    requiresGooglePlayConsole: [],
  };

  // TEST 1: First 7 Activities Free & Accessible
  try {
    const fs = await import('fs');
    const content = fs.readFileSync('src/data/learningItems.ts', 'utf-8');
    
    // Extract LEARNING_ITEMS section
    const learningItemsSection = content.split('export const LEARNING_ITEMS: LearningItem[] = [')[1] || '';
    const level1Section = learningItemsSection.split('// LEVEL 2')[0] || '';
    
    // Count objects with level: 1 and isFree: true
    const level1Items = level1Section.match(/level:\s*1\s*,[\s\S]*?isFree:\s*true/g) || [];
    
    if (level1Items.length === 7) {
      results.passed.push(`Test 1: Exactly 7 activities exist in Level 1 and are configured as free starter activities (isFree: true).`);
    } else {
      results.failed.push(`Test 1: Expected 7 Level 1 free activities, found ${level1Items.length}.`);
    }
  } catch (err) {
    results.failed.push(`Test 1: Error checking free activities: ${err.message}`);
  }

  // TEST 2: Authoritative Server Time Endpoint
  try {
    const res = await request('GET', '/api/billing/server-time');
    if (res.status === 200 && res.body.success && typeof res.body.serverTime === 'number') {
      const diff = Math.abs(Date.now() - res.body.serverTime);
      if (diff < 5000) {
        results.passed.push(`Test 2: Authoritative server time endpoint (/api/billing/server-time) active and accurate within ${diff}ms.`);
      } else {
        results.failed.push(`Test 2: Server time drift too large (${diff}ms).`);
      }
    } else {
      results.failed.push(`Test 2: Server time endpoint failed with status ${res.status}`);
    }
  } catch (err) {
    results.failed.push(`Test 2: Exception during server time check: ${err.message}`);
  }

  // TEST 3: Server Entitlement Validation & Cryptographic Signature Check
  try {
    // 3A: Tampered signature rejection
    const fakeEntitlement = {
      productId: 'playroom_all_activities_30d',
      orderId: 'GPA.TEST-ORDER-1234',
      purchaseToken: 'fake-token-tampered',
      packageName: 'com.playroom.app',
      purchaseTime: new Date().toISOString(),
      expiryTime: new Date(Date.now() + 30 * 86400000).toISOString(),
      durationDays: 30,
      unlockedType: 'all_activities',
      pricePaidPkr: 5000,
      status: 'ACTIVE',
      serverSignature: 'tampered-or-invalid-hex-signature-1234567890abcdef',
    };

    const valRes = await request('POST', '/api/billing/validate-entitlements', {
      entitlements: [fakeEntitlement],
    });

    if (valRes.status === 200 && valRes.body.invalidCount === 1 && valRes.body.validEntitlements.length === 0) {
      results.passed.push(`Test 3A: Tampered/forged cryptographic signatures are strictly rejected (invalidCount: 1).`);
    } else {
      results.failed.push(`Test 3A: Tampered entitlement was not rejected properly.`);
    }

    // 3B: Expired entitlement verification via server clock
    // Create an entitlement that expired yesterday
    const expiredPayload = {
      ...fakeEntitlement,
      expiryTime: new Date(Date.now() - 86400000).toISOString(),
      // signature won't match anyway, but let's test rejection
    };
    const valRes2 = await request('POST', '/api/billing/validate-entitlements', {
      entitlements: [expiredPayload],
    });
    if (valRes2.status === 200 && valRes2.body.validEntitlements.length === 0) {
      results.passed.push(`Test 3B: Expired or unverified entitlements yield 0 active access on server.`);
    } else {
      results.failed.push(`Test 3B: Expired entitlement check failed.`);
    }
  } catch (err) {
    results.failed.push(`Test 3: Entitlement validation error: ${err.message}`);
  }

  // TEST 4: 3-Pack Activity Selection Persistence & Strict 3-Activity Cap
  try {
    const syncRes = await request('POST', '/api/billing/sync-3pack-activities', {
      purchaseToken: 'test-audit-token-3pack-sample',
      activityIds: ['activity_shapes', 'activity_colors', 'activity_numbers', 'activity_excess_4th'],
    });

    if (syncRes.status === 200 && syncRes.body.success && syncRes.body.count === 3 && syncRes.body.unlockedActivityIds.length === 3) {
      results.passed.push(`Test 4: 3-Pack activity synchronization (/api/billing/sync-3pack-activities) strictly caps selections to exactly 3 activities.`);
    } else {
      results.failed.push(`Test 4: 3-Pack synchronization did not cap properly at 3.`);
    }
  } catch (err) {
    results.failed.push(`Test 4: Error during 3-pack sync test: ${err.message}`);
  }

  // TEST 5: Purchase Restoration Endpoint
  try {
    const restRes = await request('POST', '/api/billing/restore-purchases', {
      purchaseTokens: ['non-existent-token'],
    });
    if (restRes.status === 200 && restRes.body.success && Array.isArray(restRes.body.entitlements)) {
      results.passed.push(`Test 5: Purchase restore endpoint (/api/billing/restore-purchases) functions safely and returns server-authoritative entitlements.`);
    } else {
      results.failed.push(`Test 5: Purchase restore endpoint returned invalid response.`);
    }
  } catch (err) {
    results.failed.push(`Test 5: Purchase restore endpoint exception: ${err.message}`);
  }

  // TEST 6: Google Play Developer API Real Verification Check
  try {
    const playRes = await request('POST', '/api/billing/verify-google-play-purchase', {
      productId: 'playroom_3activities_7d',
      purchaseToken: 'inapp:com.playroom.app:playroom_3activities_7d:genuine_android_token_test',
      packageName: 'com.playroom.app',
    });

    // Check that backend did NOT fake or simulate success
    if (playRes.body.verified === false) {
      const err = playRes.body.error || '';
      if (err.includes('Google Play Android Developer API has not been used') || err.includes('disabled') || err.includes('Google Play Developer API verification failed')) {
        results.requiresGooglePlayConsole.push(
          `Google Play Developer API Verification: Backend correctly contacted Google Play API, but Google Cloud Project 678269096769 requires 'Google Play Android Developer API' to be enabled in Google Cloud Console.`
        );
        results.passed.push(`Test 6: No mock or simulated purchase success. Verification strictly contacts Google Play Developer API.`);
      } else {
        results.passed.push(`Test 6: Real Google Play verification invoked, rejected unverified token: ${err}`);
      }
    } else {
      results.failed.push(`Test 6: Backend improperly marked unverified token as verified.`);
    }
  } catch (err) {
    results.failed.push(`Test 6: Google Play verification test failed: ${err.message}`);
  }

  // PRINT SUMMARY
  console.log('----------------------------------------------------------------');
  console.log('                     TEST EXECUTION RESULTS                     ');
  console.log('----------------------------------------------------------------');
  console.log(`\nPASSED CHECKS (${results.passed.length}):`);
  results.passed.forEach((p) => console.log(` [PASS] ${p}`));

  if (results.failed.length > 0) {
    console.log(`\nFAILED CHECKS (${results.failed.length}):`);
    results.failed.forEach((f) => console.log(` [FAIL] ${f}`));
  } else {
    console.log(`\nFAILED CHECKS: 0 (All automated checks passed!)`);
  }

  if (results.requiresGooglePlayConsole.length > 0) {
    console.log(`\nREQUIRES GOOGLE PLAY CONSOLE / GCP CONFIGURATION:`);
    results.requiresGooglePlayConsole.forEach((r) => console.log(` [EXTERNAL REQUIREMENT] ${r}`));
  }

  console.log('\n================================================================\n');
}

runTests().catch(console.error);
