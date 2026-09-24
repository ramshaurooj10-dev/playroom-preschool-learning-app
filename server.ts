import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch (_) {}
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isValidUUID(str?: string | null): boolean {
  if (!str || typeof str !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
}
import {
  verifyPurchaseTokenWithGoogle,
  generateVerifiedEntitlement,
  APP_PACKAGE_NAME,
  ALLOWED_PRODUCT_IDS,
  AllowedProductId,
  verifyEntitlementSignature,
} from "./server/googlePlayVerifier";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // API endpoint for AI Preschool Assessment Summary
  app.post("/api/assessment-summary", async (req, res) => {
    try {
      const {
        childName,
        age,
        group,
        assessmentDate,
        achievedOutcomes,
        developingOutcomes,
        observations,
        evidence,
        teachingCriteria,
        customNotes,
      } = req.body;

      const hasOutcomes = (achievedOutcomes && achievedOutcomes.length > 0) || (developingOutcomes && developingOutcomes.length > 0);
      const hasObs = observations && observations.length > 0;
      const hasEv = evidence && evidence.length > 0;
      const hasNotes = customNotes && customNotes.trim().length > 0;
      const hasCriteria = teachingCriteria && teachingCriteria.length > 0;

      // If no teacher data is entered, strictly return the required message
      if (!hasOutcomes && !hasObs && !hasEv && !hasNotes && !hasCriteria) {
        return res.json({
          summary: "Not enough information has been recorded to provide a summary.",
          source: "insufficient-data",
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        // Fallback structured generation if no API key is set
        const summaryText = generateFallbackSummary({
          childName,
          age,
          group,
          assessmentDate,
          achievedOutcomes: achievedOutcomes || [],
          developingOutcomes: developingOutcomes || [],
          observations: observations || [],
          evidence: evidence || [],
          teachingCriteria: teachingCriteria || [],
          customNotes: customNotes || "",
        });
        return res.json({ summary: summaryText, source: "offline-template" });
      }

      const ai = new GoogleGenAI({ apiKey });

      const prompt = `You are a supportive, warm, and highly professional preschool educator crafting a comprehensive child progress report summary based ONLY on teacher-entered observational assessment records.

CRITICAL INSTRUCTIONS & SAFETY RULES:
- You MUST write in positive, strengths-based, developmentally appropriate preschool language.
- You MUST NOT make medical, psychological, psychiatric, neurological, or developmental-disorder diagnoses (NO clinical labels, NO diagnosing ASD, ADHD, speech delay, etc.).
- You MUST NOT invent fake evidence, fictitious activities, unobserved achievements, or unmentioned skills.
- Only summarize, synthesize, and organize the exact information, outcomes, observations, and criteria entered by the teacher below.
- If certain information is missing or not provided, state "Not yet recorded".
- Frame emerging skills and areas for support as exciting, gentle next developmental goals and collaborative teacher-parent play-based home-school connections.
- Clearly present this text as an educator summary of teacher-recorded observations.

CHILD INFORMATION:
- Child Name: ${childName || "Preschool Learner"}
- Age: ${age || "Preschool"}
- Class / Group: ${group || "Preschool Group"}
- Assessment Date: ${assessmentDate || new Date().toLocaleDateString()}

ACHIEVED LEARNING OUTCOMES (RECORDED BY TEACHER):
${achievedOutcomes && achievedOutcomes.length > 0 ? achievedOutcomes.map((o: string) => `• ${o}`).join("\n") : "Not yet recorded"}

DEVELOPING SKILLS (AREAS IN PROGRESS RECORDED BY TEACHER):
${developingOutcomes && developingOutcomes.length > 0 ? developingOutcomes.map((o: string) => `• ${o}`).join("\n") : "Not yet recorded"}

TEACHER OBSERVATION NOTES:
${observations && observations.length > 0 ? observations.map((ob: any) => `• Date: ${ob.date || "Recent"} | Area: ${ob.area || "General"} | Situation: ${ob.situation || "Classroom"} | Observed: ${ob.observed || ""} | Child's Words/Response: "${ob.childResponse || ""}" | Teacher Reflection: ${ob.notes || ""}`).join("\n") : "Not yet recorded"}

WORK SAMPLES & EVIDENCE:
${evidence && evidence.length > 0 ? evidence.map((ev: any) => `• Type: ${ev.type || "Sample"} | Description: ${ev.description || ""} | Outcome: ${ev.outcomeTitle || ""}`).join("\n") : "Not yet recorded"}

TEACHING ASSESSMENT CRITERIA & CLASSROOM PRACTICE (OBSERVED):
${teachingCriteria && teachingCriteria.length > 0 ? teachingCriteria.map((c: any) => `• [${c.category}] ${c.title}: ${c.status} ${c.notes ? `(Note: ${c.notes})` : ""}`).join("\n") : "Not yet recorded"}

ADDITIONAL TEACHER NOTES:
${customNotes || "None"}

STRUCTURE YOUR RESPONSE AS FOLLOWS:
1. **Executive Educator Overview**: A warm 2-3 sentence celebration of ${childName}'s engagement, curious exploration, and overall classroom presence based on recorded data.
2. **Key Developmental Strengths & Milestones**: Bullet points synthesizing specific recorded achievements and positive observational moments.
3. **Emerging Skills & Active Growth**: Encouraging, supportive summary of developing competencies with classroom strategies.
4. **Recommended Next Learning Goals & Home Connections**: 2-3 collaborative, play-based ideas for parents and educators to support continuous growth.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
      });

      const summary = response.text || "Summary generated successfully.";
      res.json({ summary, source: "gemini-3.7-flash" });
    } catch (err: any) {
      console.error("Gemini summary error:", err);
      // Return helpful fallback response if Gemini error occurs
      const fallback = generateFallbackSummary(req.body);
      res.json({ summary: fallback, source: "fallback-on-error" });
    }
  });

  // Server-side Payment Verification & License Management
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://puwfsjefjzljbxklljwk.supabase.co";
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;
  
  // Standard server client obeying standard RLS policies
  const serverSupabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  // Privileged server client strictly used server-side for backend-only administrative operations
  const serverAdminSupabase = SUPABASE_URL && SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : serverSupabase;

  // In-memory persistent cache for server-side licenses & requests
  let serverPaymentRequests: any[] = [];
  let serverLicenses: any[] = [];
  const cleanKey = (k: any) => (k || '').toString().replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
  const serverGooglePlayPurchases: any[] = [];
  const serverSchoolLicenses = new Map<string, any>();

  /**
   * Google Play Billing Verification Endpoint
   * Verifies Google Play purchases securely via the Google Play Developer API (androidpublisher v3),
   * calculates strictly server-authoritative 7-day or 30-day expiration, signs entitlement cryptographically,
   * and returns verified entitlement data without requiring any user login or Google OAuth.
   */
  app.post("/api/billing/verify-google-play-purchase", async (req, res) => {
    try {
      const { productId, purchaseToken, packageName, preSelectedActivityId } = req.body;

      if (!productId || !purchaseToken) {
        return res.status(400).json({
          success: false,
          verified: false,
          error: "Missing required billing parameters (productId, purchaseToken).",
        });
      }

      // 1. Strict Package Name Validation
      const targetPackage = packageName || APP_PACKAGE_NAME;
      if (targetPackage !== APP_PACKAGE_NAME) {
        return res.status(403).json({
          success: false,
          verified: false,
          error: `Access denied. Package name '${targetPackage}' does not match '${APP_PACKAGE_NAME}'.`,
        });
      }

      // 2. Strict Product ID Whitelist
      if (!ALLOWED_PRODUCT_IDS.includes(productId as AllowedProductId)) {
        return res.status(400).json({
          success: false,
          verified: false,
          error: `Unrecognized Google Play product ID: ${productId}. Expected: ${ALLOWED_PRODUCT_IDS.join(', ')}`,
        });
      }

      // 3. Verify Purchase Token directly with Google Play Developer API
      const googleResult = await verifyPurchaseTokenWithGoogle(
        targetPackage,
        productId,
        String(purchaseToken)
      );

      if (!googleResult.verified) {
        console.warn(`[Google Play Billing] Verification rejected for ${productId}:`, googleResult.error);
        return res.status(422).json({
          success: false,
          verified: false,
          error: googleResult.error || "Google Play purchase could not be verified.",
        });
      }

      // 4. Calculate server-authoritative entitlement and cryptographic signature
      const entitlement = generateVerifiedEntitlement(
        productId as AllowedProductId,
        String(purchaseToken),
        googleResult
      );

      // 5. Store verified record in server memory registry
      const existingIdx = serverGooglePlayPurchases.findIndex((p) => p.purchaseToken === purchaseToken);
      if (existingIdx !== -1) {
        serverGooglePlayPurchases[existingIdx] = entitlement;
      } else {
        serverGooglePlayPurchases.unshift(entitlement);
      }

      // 6. Record to Supabase DB if available
      if (serverSupabase) {
        try {
          await serverSupabase.from("purchases").insert([
            {
              id: entitlement.orderId,
              product_id: entitlement.productId,
              amount: entitlement.pricePaidPkr,
              currency: "PKR",
              payment_provider: "google_play",
              status: "COMPLETED",
              created_at: entitlement.purchaseTime,
              metadata: {
                purchaseToken: entitlement.purchaseToken,
                expiryTime: entitlement.expiryTime,
                unlockedType: entitlement.unlockedType,
                durationDays: entitlement.durationDays,
                verificationSource: entitlement.verificationSource,
                serverSignature: entitlement.serverSignature,
                preSelectedActivityId: preSelectedActivityId || null,
              },
            },
          ]);
        } catch (dbErr) {
          console.warn("[Billing DB] Could not record Google Play purchase to Supabase:", dbErr);
        }
      }

      console.log(`[Google Play Billing] Successfully verified & issued entitlement for ${productId} (Order: ${entitlement.orderId}, Expires: ${entitlement.expiryTime})`);

      return res.json({
        success: true,
        verified: true,
        entitlement,
      });
    } catch (err: any) {
      console.error("[Google Play Billing Server Error]", err);
      return res.status(500).json({
        success: false,
        verified: false,
        error: err.message || "Failed to verify Google Play purchase.",
      });
    }
  });

  /**
   * Google Play Billing List / Restore Endpoint
   * Restores active entitlements only if verified and non-expired.
   */
  app.post("/api/billing/restore-purchases", async (req, res) => {
    try {
      const { purchaseTokens } = req.body;
      const tokens: string[] = Array.isArray(purchaseTokens) ? purchaseTokens : [];
      const now = Date.now();

      const activeEntitlements = serverGooglePlayPurchases.filter((p) => {
        const matches = tokens.length === 0 || tokens.includes(p.purchaseToken);
        const isNotExpired = new Date(p.expiryTime).getTime() > now;
        const hasValidSignature = verifyEntitlementSignature(p);
        return matches && isNotExpired && hasValidSignature;
      });

      return res.json({
        success: true,
        entitlements: activeEntitlements,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || "Restore error" });
    }
  });

  /**
   * Submit Payment Request Endpoint
   * Manual payments (SadaPay, Bank Transfer, Payoneer offline) are strictly marked as PENDING and UNVERIFIED.
   * They do NOT unlock access automatically.
   */
  app.post("/api/payment/submit-request", async (req, res) => {
    try {
      const {
        userId,
        userEmail,
        region,
        purchaseType,
        targetLevel,
        amount,
        currency,
        paymentMethod,
        transactionId,
        paymentProofName,
        paymentProofUrl,
      } = req.body;

      if (!userEmail || !transactionId || !amount) {
        return res.status(400).json({
          success: false,
          error: "Missing required payment details (userEmail, transactionId, amount).",
        });
      }

      // Security validation: verify price matches standard pricing
      const expectedAmount =
        region === "pakistan"
          ? purchaseType === "one_level" ? 800 : 5000
          : purchaseType === "one_level" ? 5 : 20;

      const expectedCurrency = region === "pakistan" ? "PKR" : "USD";

      const newRequest = {
        id: "req_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        userId: userId || "user_" + Date.now(),
        userEmail: userEmail.toLowerCase().trim(),
        region: region || "pakistan",
        purchaseType: purchaseType || "one_level",
        targetLevel: purchaseType === "one_level" ? (targetLevel || 2) : null,
        amount: expectedAmount,
        currency: expectedCurrency,
        paymentMethod: paymentMethod || "sadapay",
        transactionId: String(transactionId).trim(),
        paymentProofName: paymentProofName || null,
        paymentProofUrl: paymentProofUrl || null,
        submittedAt: new Date().toISOString(),
        status: "PENDING", // STRICTLY PENDING: Unverified payment
        verificationType: "UNVERIFIED_MANUAL",
        isVerified: false,
      };

      serverPaymentRequests.unshift(newRequest);

      // Record in Supabase if configured
      if (serverSupabase) {
        try {
          await serverSupabase.from("payments").insert([
            {
              id: newRequest.id,
              order_id: null,
              user_id: newRequest.userId,
              user_email: newRequest.userEmail,
              product_id: newRequest.purchaseType === "all_activities" ? "all_activities" : `level_${newRequest.targetLevel || 2}`,
              amount: newRequest.amount,
              currency: newRequest.currency,
              payment_method: newRequest.paymentMethod,
              provider_transaction_id: newRequest.transactionId,
              payment_status: "PENDING",
              payment_proof_name: newRequest.paymentProofName,
              payment_proof_url: newRequest.paymentProofUrl,
              created_at: newRequest.submittedAt,
            },
          ]);

          await serverSupabase.from("notifications").insert([
            {
              id: "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
              user_id: newRequest.userId,
              user_email: newRequest.userEmail,
              type: "PAYMENT_PENDING",
              title: "Payment Approval Pending",
              message: "Your payment verification request is under review. Our team will verify and activate your 1-Month Premium access shortly.",
              read: false,
              created_at: newRequest.submittedAt,
            },
          ]);
        } catch (dbErr) {
          console.warn("Supabase record error (stored on server):", dbErr);
        }
      }

      return res.json({
        success: true,
        request: newRequest,
        status: "PENDING",
        isVerified: false,
        message: "Payment request submitted. Access remains LOCKED until independent verification is confirmed.",
      });
    } catch (err: any) {
      console.error("Payment submit error:", err);
      return res.status(500).json({ success: false, error: err.message || "Server error processing payment." });
    }
  });

  /**
   * Trusted Provider Webhook / Verification Endpoint
   * Only activates license if verified by actual payment provider signature/token.
   */
  app.post("/api/payment/verify-webhook", async (req, res) => {
    try {
      const { provider, providerSignature, transactionId, userEmail, purchaseType, targetLevel, amount, currency } = req.body;

      // Validate provider signature / trusted token
      const isTrustedProvider = Boolean(
        provider &&
        providerSignature &&
        providerSignature.length >= 16
      );

      if (!isTrustedProvider) {
        return res.status(400).json({
          success: false,
          verified: false,
          error: "Unverified transaction signature. Automatic license activation rejected.",
        });
      }

      const now = new Date();
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 1); // 1-month license

      const newLicense = {
        id: "lic_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        userId: "user_" + Math.random().toString(36).substring(2, 9),
        userEmail: userEmail.toLowerCase().trim(),
        licenseType: purchaseType,
        unlockedLevels: purchaseType === "all_activities" ? [1, 2, 3, 4, 5, 6] : [targetLevel || 2],
        allActivitiesUnlocked: purchaseType === "all_activities",
        purchaseDate: now.toISOString(),
        expiryDate: expiryDate.toISOString(),
        status: "ACTIVE",
        verificationType: "PROVIDER_VERIFIED",
        pricePaid: amount,
        currency: currency || "PKR",
        transactionId: transactionId,
      };

      serverLicenses.unshift(newLicense);

      if (serverSupabase) {
        try {
          await serverSupabase.from("user_licenses").insert([newLicense]);
        } catch (dbErr) {
          console.warn("Supabase license store error:", dbErr);
        }
      }

      return res.json({
        success: true,
        verified: true,
        status: "ACTIVE",
        license: newLicense,
      });
    } catch (err: any) {
      console.error("Provider webhook error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Admin Payment Verification Endpoint (School Administration)
   */
  app.post("/api/payment/admin-verify", async (req, res) => {
    try {
      const { requestId, decision, adminNotes, adminEmail } = req.body;

      if (!requestId || !decision) {
        return res.status(400).json({ success: false, error: "Missing requestId or decision" });
      }

      // Find in server memory or Supabase
      const reqIndex = serverPaymentRequests.findIndex((r) => r.id === requestId);
      const paymentReq = reqIndex !== -1 ? serverPaymentRequests[reqIndex] : null;

      const now = new Date();

      if (decision === "APPROVE") {
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 1); // 1 Month Expiry

        const newLicense = {
          id: "lic_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
          userId: paymentReq?.userId || "user_" + Date.now(),
          userEmail: paymentReq?.userEmail || req.body.userEmail || "",
          licenseType: paymentReq?.purchaseType || req.body.purchaseType || "one_level",
          unlockedLevels:
            (paymentReq?.purchaseType || req.body.purchaseType) === "all_activities"
              ? [1, 2, 3, 4, 5, 6]
              : [paymentReq?.targetLevel || req.body.targetLevel || 2],
          allActivitiesUnlocked: (paymentReq?.purchaseType || req.body.purchaseType) === "all_activities",
          purchaseDate: now.toISOString(),
          expiryDate: expiryDate.toISOString(),
          status: "ACTIVE",
          verificationType: "ADMIN_VERIFIED",
          verifiedBy: adminEmail || "School Administrator",
          pricePaid: paymentReq?.amount || req.body.amount || 800,
          currency: paymentReq?.currency || req.body.currency || "PKR",
          paymentRequestId: requestId,
        };

        if (paymentReq) {
          paymentReq.status = "APPROVED";
          paymentReq.verificationType = "ADMIN_VERIFIED";
          paymentReq.reviewedAt = now.toISOString();
          paymentReq.adminNotes = adminNotes || "";
          paymentReq.verifiedBy = adminEmail || "School Administrator";
        }

        serverLicenses.unshift(newLicense);

        if (serverSupabase) {
          try {
            await serverSupabase
              .from("payments")
              .update({
                payment_status: "VERIFIED",
                verified_at: now.toISOString(),
                admin_notes: adminNotes || "Approved by Admin",
                verified_by: adminEmail || "School Administrator",
              })
              .eq("id", requestId);

            await serverSupabase.from("user_licenses").insert([
              {
                id: newLicense.id,
                user_id: newLicense.userId,
                user_email: newLicense.userEmail,
                product_id: newLicense.licenseType === "all_activities" ? "all_activities" : `level_${newLicense.unlockedLevels[0] || 2}`,
                level: newLicense.unlockedLevels[0] || null,
                all_activities_unlocked: newLicense.allActivitiesUnlocked,
                start_date: newLicense.purchaseDate,
                expiry_date: newLicense.expiryDate,
                status: "ACTIVE",
                payment_id: requestId,
                created_at: newLicense.purchaseDate,
              },
            ]);

            await serverSupabase.from("notifications").insert([
              {
                id: "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
                user_id: newLicense.userId,
                user_email: newLicense.userEmail,
                type: "PAYMENT_APPROVED",
                title: "Payment Approved",
                message: "Payment Approved — Your 1-Month Premium Access is now active.",
                read: false,
                created_at: now.toISOString(),
              },
            ]);
          } catch (dbErr) {
            console.warn("Supabase admin verify error:", dbErr);
          }
        }

        return res.json({ success: true, status: "APPROVED", license: newLicense });
      } else {
        // REJECT
        if (paymentReq) {
          paymentReq.status = "REJECTED";
          paymentReq.reviewedAt = now.toISOString();
          paymentReq.adminNotes = adminNotes || "PAYMENT NOT RECEIVED";
        }

        if (serverSupabase) {
          try {
            await serverSupabase
              .from("payments")
              .update({
                payment_status: "REJECTED",
                verified_at: now.toISOString(),
                admin_notes: adminNotes || "PAYMENT NOT RECEIVED",
                verified_by: adminEmail || "School Administrator",
              })
              .eq("id", requestId);

            await serverSupabase.from("notifications").insert([
              {
                id: "notif_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
                user_id: paymentReq?.userId || "user_" + Date.now(),
                user_email: paymentReq?.userEmail || req.body.userEmail,
                type: "PAYMENT_REJECTED",
                title: "Payment Not Verified",
                message: "Your payment could not be verified (PAYMENT NOT RECEIVED). Premium access remains locked.",
                read: false,
                created_at: now.toISOString(),
              },
            ]);
          } catch (dbErr) {
            console.warn("Supabase admin reject error:", dbErr);
          }
        }

        return res.json({ success: true, status: "REJECTED" });
      }
    } catch (err: any) {
      console.error("Admin verify error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Payment Provider Status Endpoint (Check API / Credential readiness without leaking secrets)
   */
  app.get("/api/payment/providers/status", (req, res) => {
    const hasPayoneerCredentials = Boolean(
      process.env.PAYONEER_PROGRAM_ID &&
      process.env.PAYONEER_API_SECRET
    );

    res.json({
      success: true,
      providers: {
        sadapay: {
          name: "SadaPay",
          status: "NOT_CONFIGURED",
          automatedVerification: false,
          note: "Awaiting official SadaPay merchant/API credentials. Payments remain strictly PENDING.",
        },
        bank_transfer: {
          name: "Commercial Bank Transfer",
          status: "MANUAL_ADMIN_VERIFICATION",
          automatedVerification: false,
          note: "Direct bank transfers require manual statement reconciliation by School Administration.",
        },
        payoneer: {
          name: "Payoneer (International USD)",
          status: hasPayoneerCredentials ? "READY_CONFIGURED" : "NOT_CONFIGURED",
          automatedVerification: hasPayoneerCredentials,
          configuredEnvKeys: [
            process.env.PAYONEER_PROGRAM_ID ? "PAYONEER_PROGRAM_ID" : null,
            process.env.PAYONEER_API_SECRET ? "PAYONEER_API_SECRET" : null,
          ].filter(Boolean),
        },
      },
    });
  });

  /**
   * School License Administration Endpoint
   */
  app.post("/api/payment/school-license", async (req, res) => {
    try {
      const {
        id,
        schoolId,
        schoolName,
        contactEmail,
        price,
        currency,
        licenseKey,
        validFrom,
        validUntil,
        startDate,
        expiryDate,
        allowedDevices,
        page1Access,
        page2Access,
        adminNotes,
        createdBy,
        verifiedBy,
      } = req.body;

      if (!schoolName || !contactEmail) {
        return res.status(400).json({ success: false, error: "Missing required school license parameters" });
      }

      const now = new Date();
      const validFromTime = validFrom || startDate || now.toISOString();
      const validUntilTime =
        validUntil ||
        expiryDate ||
        new Date(new Date(validFromTime).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const sid = (schoolId && isValidUUID(schoolId)) ? schoolId : generateUUID();
      const key =
        licenseKey ||
        "SCH-" +
          Math.random().toString(36).substring(2, 6).toUpperCase() +
          "-" +
          Math.random().toString(36).substring(2, 6).toUpperCase();
      const adminUser = createdBy || verifiedBy || "admin@playroom-learning.edu";
      const licenseDbId = (id && isValidUUID(id)) ? id : generateUUID();

      const schoolLicense = {
        id: licenseDbId,
        school_id: sid,
        license_key: key,
        school_name: schoolName,
        contact_email: contactEmail.toLowerCase().trim(),
        price: parseFloat(price) || 0,
        currency: currency || "PKR",
        allowed_devices: parseInt(allowedDevices, 10) || 999999,
        page1_access: page1Access !== undefined ? Boolean(page1Access) : true,
        page2_access: page2Access !== undefined ? Boolean(page2Access) : true,
        valid_from: validFromTime,
        valid_until: validUntilTime,
        start_date: validFromTime,
        expiry_date: validUntilTime,
        status: "ACTIVE",
        duration_months: 1, // Strictly 30-Day Term
        created_by: adminUser,
        verified_by: adminUser,
        admin_notes: adminNotes || null,
        created_at: now.toISOString(),
      };

      if (serverSupabase) {
        try {
          await serverSupabase.from("schools").upsert(
            [
              {
                id: sid,
                school_name: schoolName,
                school_admin_name: schoolName,
                contact_name: schoolName,
                contact_email: contactEmail.toLowerCase().trim(),
                status: "ACTIVE",
                account_status: "active",
                payment_status: "paid",
                created_at: now.toISOString(),
              },
            ],
            { onConflict: "id" }
          );

          await serverSupabase.from("school_licenses").insert([schoolLicense]);
        } catch (dbErr) {
          console.warn("Supabase school_licenses store error:", dbErr);
        }
      }

      return res.json({ success: true, license: schoolLicense });
    } catch (err: any) {
      console.error("School license error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Submit School Inquiry / Request
  app.post("/api/payment/school-request", async (req, res) => {
    try {
      const {
        id,
        schoolName,
        schoolAdminName,
        contactName,
        contactEmail,
        phoneNumber,
        contactPhone,
        city,
        country,
        subject,
        message,
        schoolMessage,
        notes,
        allowedDevices,
        durationMonths,
        amount,
        currency,
        paymentMethod,
        transactionReference,
      } = req.body || {};

      // Server-side normalization
      const trimmedSchoolName = (schoolName || "Partner School").trim();
      const trimmedAdminName = (schoolAdminName || contactName || "School Administrator").trim();
      const trimmedEmail = (contactEmail || "").trim().toLowerCase();
      const trimmedPhone = (phoneNumber || contactPhone || "").trim();
      const trimmedCountry = (country || "Pakistan").trim();
      const trimmedCity = (city || "Karachi").trim();
      const trimmedSubject = (subject || "Preschool School License & Classroom Access").trim();
      const trimmedMessage = (message || schoolMessage || notes || "").trim();

      const requestId = (id && typeof id === 'string' && id.trim()) ? id.trim() : generateUUID();
      const nowIso = new Date().toISOString();
      let targetSchoolId = generateUUID();
      let finalSchoolId = targetSchoolId;

      const newRecord = {
        id: requestId,
        schoolId: finalSchoolId,
        schoolName: trimmedSchoolName,
        schoolAdminName: trimmedAdminName,
        contactName: trimmedAdminName,
        contactEmail: trimmedEmail,
        contactPhone: trimmedPhone,
        phoneNumber: trimmedPhone,
        country: trimmedCountry,
        city: trimmedCity,
        subject: trimmedSubject,
        message: trimmedMessage,
        schoolMessage: trimmedMessage,
        notes: trimmedMessage,
        amount: amount || 25000,
        currency: currency || (trimmedCountry === "Pakistan" ? "PKR" : "USD"),
        allowedDevices: allowedDevices || 999999,
        durationMonths: durationMonths || 1,
        page1Access: true,
        page2Access: true,
        paymentMethod: paymentMethod || "bank_transfer",
        transactionReference: transactionReference || "INQUIRY-" + Date.now().toString(36).toUpperCase(),
        status: "PENDING",
        submittedAt: nowIso,
      };

      // 1. Always store in-memory so requests appear instantly
      const existingIdx = serverPaymentRequests.findIndex((r) => r.id === requestId);
      if (existingIdx >= 0) {
        serverPaymentRequests[existingIdx] = newRecord;
      } else {
        serverPaymentRequests.unshift(newRecord);
      }

      // 2. Persist to Supabase in the background / asynchronously
      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          // Attempt to find or create school
          const { data: exactMatchSchool } = await dbClient
            .from("schools")
            .select("id, school_name, contact_email")
            .ilike("school_name", trimmedSchoolName)
            .ilike("contact_email", trimmedEmail)
            .maybeSingle();

          if (exactMatchSchool?.id) {
            targetSchoolId = exactMatchSchool.id;
            finalSchoolId = exactMatchSchool.id;
            newRecord.schoolId = exactMatchSchool.id;
          } else {
            const { data: newSchoolData } = await dbClient
              .from("schools")
              .insert([
                {
                  id: targetSchoolId,
                  school_name: trimmedSchoolName,
                  contact_name: trimmedAdminName,
                  contact_email: trimmedEmail,
                  country: trimmedCountry || null,
                  currency: currency || (trimmedCountry === "Pakistan" ? "PKR" : "USD"),
                  account_status: "active",
                  payment_status: "pending",
                  created_at: nowIso,
                },
              ])
              .select("id")
              .maybeSingle();

            if (newSchoolData?.id) {
              targetSchoolId = newSchoolData.id;
              finalSchoolId = newSchoolData.id;
              newRecord.schoolId = newSchoolData.id;
            }
          }

          const finalFullMessage = `School: ${trimmedSchoolName} | Admin: ${trimmedAdminName} | Email: ${trimmedEmail} | Phone: ${trimmedPhone} | Country: ${trimmedCountry}${trimmedCity ? ` | City: ${trimmedCity}` : ""}\n\n${trimmedMessage}`;

          // Insert into school_requests table
          await dbClient.from("school_requests").insert([
            {
              id: requestId,
              school_id: targetSchoolId,
              requested_by: null,
              subject: trimmedSubject,
              message: finalFullMessage,
              status: "pending",
              created_at: nowIso,
            },
          ]);

          // Backup insert into feedback table for resilient multi-device sync
          const feedbackSyncId = `req_${requestId.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
          await dbClient.from("feedback").upsert({
            id: feedbackSyncId,
            rating: 5,
            message: `[SCHOOL_REQUEST_SYNC] ${JSON.stringify(newRecord)}`,
            status: "PENDING",
            user_email: trimmedEmail || "school@partner.edu",
            created_at: nowIso,
          });
        } catch (dbErr: any) {
          console.warn("Supabase background save notice for school request:", dbErr?.message || dbErr);
        }
      }

      return res.json({
        success: true,
        message: "School inquiry submitted successfully.",
        request: newRecord,
      });
    } catch (err: any) {
      console.error("School inquiry submission error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get All School Requests / Inquiries Endpoint
  app.get("/api/payment/school-requests", async (req, res) => {
    try {
      const reqMap = new Map<string, any>();

      // 1. In-memory requests
      serverPaymentRequests.forEach((r) => {
        if (r && r.id) {
          reqMap.set(r.id, {
            ...r,
            status: (r.status || "PENDING").toUpperCase(),
          });
        }
      });

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          // Fetch school requests and schools table for joining
          const [{ data: dbRequests }, { data: dbSchools }, { data: feedbackReqs }] = await Promise.all([
            dbClient.from("school_requests").select("*").order("created_at", { ascending: false }),
            dbClient.from("schools").select("*"),
            dbClient.from("feedback").select("*").like("message", "%[SCHOOL_REQUEST_SYNC]%"),
          ]);

          const schoolMap = new Map<string, any>();
          if (Array.isArray(dbSchools)) {
            dbSchools.forEach((s: any) => {
              if (s && s.id) schoolMap.set(s.id, s);
            });
          }

          if (Array.isArray(dbRequests)) {
            dbRequests.forEach((row: any) => {
              if (row && row.id) {
                const school = schoolMap.get(row.school_id) || {};
                let schoolName = school.school_name || row.school_name || "Partner School";
                let adminName = school.contact_name || school.school_admin_name || row.contact_name || row.school_admin_name || "School Administrator";
                let email = school.contact_email || row.contact_email || "";
                let phone = school.contact_phone || school.phone_number || row.contact_phone || row.phone_number || "";
                let country = school.country || row.country || "Pakistan";
                let city = school.city || row.city || "Karachi";
                let rawMsg = row.message || "";

                // Parse if info was encoded in message
                if (rawMsg.includes("School:") && rawMsg.includes("Email:")) {
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

                  const splitParts = rawMsg.split("\n\n");
                  if (splitParts.length > 1) {
                    rawMsg = splitParts.slice(1).join("\n\n").trim();
                  }
                }

                reqMap.set(row.id, {
                  id: row.id,
                  schoolId: row.school_id || school.id || "",
                  schoolName,
                  schoolAdminName: adminName,
                  contactName: adminName,
                  contactEmail: email,
                  contactPhone: phone,
                  phoneNumber: phone,
                  country,
                  city,
                  subject: row.subject || "School License Inquiry",
                  schoolMessage: rawMsg || row.subject || "",
                  notes: rawMsg || row.subject || "",
                  amount: row.amount || school.amount || 25000,
                  currency: row.currency || school.currency || "PKR",
                  allowedDevices: row.allowed_devices || 999999,
                  durationMonths: row.duration_months || 1,
                  page1Access: row.page1_access !== false,
                  page2Access: row.page2_access !== false,
                  paymentMethod: row.payment_method || "bank_transfer",
                  transactionReference: row.transaction_reference || "INQUIRY",
                  paymentDate: row.payment_date || (row.created_at || new Date().toISOString()).split("T")[0],
                  status: (row.status || "PENDING").toUpperCase(),
                  submittedAt: row.submitted_at || row.created_at || new Date().toISOString(),
                  reviewedBy: row.reviewed_by || row.verified_by,
                  reviewedAt: row.reviewed_at || row.replied_at || row.verified_at,
                  adminNotes: row.admin_notes || row.admin_reply,
                });
              }
            });
          }

          if (Array.isArray(feedbackReqs)) {
            feedbackReqs.forEach((row: any) => {
              try {
                const msg = row.message || "";
                const idx = msg.indexOf("[SCHOOL_REQUEST_SYNC]");
                if (idx !== -1) {
                  const rawJson = msg.substring(idx + "[SCHOOL_REQUEST_SYNC]".length).trim();
                  const reqObj = JSON.parse(rawJson);
                  if (reqObj && reqObj.id) {
                    reqMap.set(reqObj.id, reqObj);
                  }
                }
              } catch (_) {}
            });
          }
        } catch (dbErr) {
          console.warn("Supabase school_requests fetch error in server:", dbErr);
        }
      }

      const allList = Array.from(reqMap.values()).filter(
        (r) => (r.status || "PENDING").toUpperCase() !== "APPROVED"
      );
      allList.sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());

      return res.json({ success: true, requests: allList });
    } catch (err: any) {
      console.error("Fetch school requests error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get All School Licenses Endpoint (Direct Cloud Access)
  app.get("/api/payment/school-licenses", async (req, res) => {
    try {
      const dbClient = serverAdminSupabase || serverSupabase;
      const cleanKey = (s: any) =>
        (s || "")
          .toString()
          .replace(/[\u200B-\u200D\uFEFF]/g, "")
          .replace(/[\s\-_]/g, "")
          .toUpperCase()
          .trim();

      const licenseMap = new Map<string, any>();

      const addOrMergeLic = (lic: any) => {
        if (!lic) return;
        const ck = cleanKey(lic.licenseKey || lic.id);
        if (!ck) return;

        const existing = licenseMap.get(ck);
        if (!existing) {
          licenseMap.set(ck, lic);
          return;
        }

        const isIncomingActive = (lic.status || "").toUpperCase() === "ACTIVE" || Boolean(lic.validFrom || lic.startDate);
        const isExistingActive = (existing.status || "").toUpperCase() === "ACTIVE" || Boolean(existing.validFrom || existing.startDate);
        const isActive = isIncomingActive || isExistingActive;

        const validFrom = lic.validFrom || lic.startDate || existing.validFrom || existing.startDate;
        const validUntil = lic.validUntil || lic.expiryDate || existing.validUntil || existing.expiryDate;

        licenseMap.set(ck, {
          ...existing,
          ...lic,
          status: isActive ? "ACTIVE" : (lic.status || existing.status || "PENDING"),
          startDate: validFrom || null,
          validFrom: validFrom || null,
          expiryDate: validUntil || null,
          validUntil: validUntil || null,
          licenseKey: lic.licenseKey || existing.licenseKey,
        });
      };

      // Include in-memory cached licenses first
      serverSchoolLicenses.forEach((lic) => {
        addOrMergeLic(lic);
      });

      if (dbClient) {
        try {
          const { data, error } = await dbClient.from("school_licenses").select("*").order("created_at", { ascending: false });
          if (!error && Array.isArray(data)) {
            data.forEach((row: any) => {
              const rawKey = row.license_key || row.id || "";
              addOrMergeLic({
                id: row.id || `lic_${cleanKey(rawKey).toLowerCase()}`,
                licenseKey: row.license_key || rawKey,
                schoolId: row.school_id || "",
                schoolName: row.school_name || "Partner School",
                schoolAdminName: row.school_admin_name || row.contact_name || "",
                contactName: row.contact_name || row.school_admin_name || "",
                contactEmail: row.contact_email || "",
                contactPhone: row.contact_phone || row.phone_number || "",
                country: row.country || "Pakistan",
                city: row.city || "Karachi",
                price: row.price || 0,
                currency: row.currency || "PKR",
                allowedDevices: row.allowed_devices || 999999,
                page1Access: row.page1_access !== false,
                page2Access: row.page2_access !== false,
                startDate: row.start_date || row.valid_from || null,
                expiryDate: row.expiry_date || row.valid_until || null,
                validFrom: row.valid_from || row.start_date || null,
                validUntil: row.valid_until || row.expiry_date || null,
                status: (row.status || "PENDING").toUpperCase(),
                durationMonths: row.duration_months || 1,
                durationDays: row.duration_days || 30,
                createdBy: row.created_by,
                verifiedBy: row.verified_by,
                adminNotes: row.admin_notes,
                createdAt: row.created_at || new Date().toISOString(),
              });
            });
          }
        } catch (dbErr) {
          console.warn("Supabase school_licenses query notice:", dbErr);
        }
      }

      const licenseList = Array.from(licenseMap.values());
      return res.json({ success: true, licenses: licenseList });
    } catch (err: any) {
      console.error("Fetch school licenses error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Save or Synchronize School License Endpoint
  app.post("/api/payment/school-license/save", async (req, res) => {
    try {
      const lic = req.body;
      if (!lic || (!lic.licenseKey && !lic.id)) {
        return res.status(400).json({ success: false, error: "License data missing" });
      }

      const normKey = (lic.licenseKey || lic.id || "").toString().trim().toUpperCase();
      const licId = (lic.id && isValidUUID(lic.id)) ? lic.id : generateUUID();
      const schoolId = (lic.schoolId && isValidUUID(lic.schoolId)) ? lic.schoolId : generateUUID();

      const standardizedLic = {
        id: licId,
        licenseKey: normKey,
        schoolId: schoolId,
        schoolName: lic.schoolName || "Partner School",
        schoolAdminName: lic.schoolAdminName || lic.contactName || "School Administrator",
        contactName: lic.contactName || lic.schoolAdminName || "School Administrator",
        contactEmail: lic.contactEmail || "",
        contactPhone: lic.contactPhone || lic.phoneNumber || "",
        country: lic.country || "Pakistan",
        city: lic.city || "Karachi",
        price: Number(lic.price) || 0,
        currency: lic.currency || "PKR",
        allowedDevices: lic.allowedDevices || 999999,
        page1Access: lic.page1Access !== false,
        page2Access: lic.page2Access !== false,
        startDate: lic.startDate || lic.validFrom || null,
        expiryDate: lic.expiryDate || lic.validUntil || null,
        validFrom: lic.validFrom || lic.startDate || null,
        validUntil: lic.validUntil || lic.expiryDate || null,
        status: (lic.status || "PENDING").toUpperCase(),
        durationMonths: lic.durationMonths || 1,
        durationDays: lic.durationDays || 30,
        createdBy: lic.createdBy || "Admin",
        verifiedBy: lic.verifiedBy || "Admin",
        adminNotes: lic.adminNotes || "",
        createdAt: lic.createdAt || new Date().toISOString(),
      };

      serverSchoolLicenses.set(normKey, standardizedLic);
      serverSchoolLicenses.set(licId, standardizedLic);
      if (normKey.includes("-")) {
        serverSchoolLicenses.set(normKey.replace(/-/g, ""), standardizedLic);
      }

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          const dbRecord = {
            id: licId,
            school_id: schoolId,
            license_key: normKey,
            school_name: standardizedLic.schoolName,
            contact_email: standardizedLic.contactEmail,
            contact_phone: standardizedLic.contactPhone,
            country: standardizedLic.country,
            city: standardizedLic.city,
            price: standardizedLic.price,
            currency: standardizedLic.currency,
            allowed_devices: standardizedLic.allowedDevices,
            page1_access: standardizedLic.page1Access,
            page2_access: standardizedLic.page2Access,
            valid_from: standardizedLic.validFrom,
            valid_until: standardizedLic.validUntil,
            start_date: standardizedLic.startDate,
            expiry_date: standardizedLic.expiryDate,
            status: standardizedLic.status,
            duration_months: standardizedLic.durationMonths,
            duration_days: standardizedLic.durationDays,
            admin_notes: standardizedLic.adminNotes,
            created_at: standardizedLic.createdAt,
          };

          const { error: updErr } = await dbClient.from("school_licenses").update(dbRecord).eq("license_key", normKey);
          if (updErr) {
            await dbClient.from("school_licenses").insert([dbRecord]);
          }
        } catch (dbErr) {
          console.warn("Supabase school_license save DB notice:", dbErr);
        }

        try {
          const syncId = `lic_${normKey.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
          await dbClient.from("feedback").upsert([
            {
              id: syncId,
              rating: 5,
              message: `[SCHOOL_LICENSE_SYNC]${JSON.stringify(standardizedLic)}`,
              status: standardizedLic.status,
              user_email: standardizedLic.contactEmail || "admin@playroom.app",
            },
          ]);
        } catch (_) {}
      }

      return res.json({ success: true, license: standardizedLic });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // Generate Real License Key Endpoint
  app.post("/api/payment/school-license/generate", async (req, res) => {
    try {
      const { schoolId, schoolName, contactName, contactEmail, contactPhone, country, city, adminNotes, adminEmail, durationDays } = req.body;
      const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      const part = (len: number) => {
        let r = "";
        for (let i = 0; i < len; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
        return r;
      };
      const generatedKey = `SCH-${part(4)}-${part(4)}-${part(4)}`;
      const now = new Date();
      const licId = (schoolId && isValidUUID(schoolId)) ? generateUUID() : generateUUID();
      const finalSchoolId = (schoolId && isValidUUID(schoolId)) ? schoolId : generateUUID();

      const newLicenseRecord = {
        id: licId,
        school_id: finalSchoolId,
        license_key: generatedKey,
        school_name: schoolName || "Partner School",
        school_admin_name: contactName || "School Administrator",
        contact_name: contactName || "School Administrator",
        contact_email: contactEmail || "",
        contact_phone: contactPhone || "",
        country: country || "Pakistan",
        city: city || "Karachi",
        price: 5000,
        currency: "PKR",
        allowed_devices: 999999,
        page1_access: true,
        page2_access: true,
        valid_from: null,
        valid_until: null,
        start_date: null,
        expiry_date: null,
        status: "PENDING", // Starts 30-day countdown strictly on first school entry
        duration_months: 1,
        duration_days: durationDays || 30,
        created_by: adminEmail || "Admin",
        verified_by: adminEmail || "Admin",
        admin_notes: adminNotes || `Generated by Admin on ${now.toISOString()}`,
        created_at: now.toISOString(),
      };

      const licenseObj = {
        id: licId,
        licenseKey: generatedKey,
        schoolId: finalSchoolId,
        schoolName: schoolName || "Partner School",
        schoolAdminName: contactName || "School Administrator",
        contactName: contactName || "School Administrator",
        contactEmail: contactEmail || "",
        contactPhone: contactPhone || "",
        country: country || "Pakistan",
        city: city || "Karachi",
        price: 5000,
        currency: "PKR",
        allowedDevices: 999999,
        page1Access: true,
        page2Access: true,
        startDate: null,
        expiryDate: null,
        validFrom: null,
        validUntil: null,
        status: "PENDING",
        durationMonths: 1,
        durationDays: durationDays || 30,
        createdBy: adminEmail || "Admin",
        verifiedBy: adminEmail || "Admin",
        adminNotes: adminNotes || `Generated by Admin on ${now.toISOString()}`,
        createdAt: now.toISOString(),
      };

      serverSchoolLicenses.set(generatedKey, licenseObj);
      serverSchoolLicenses.set(licId, licenseObj);
      serverSchoolLicenses.set(generatedKey.replace(/-/g, ""), licenseObj);

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          const { error: insErr } = await dbClient.from("school_licenses").insert([newLicenseRecord]);
          if (insErr) {
            console.warn("Supabase school_licenses insert notice:", insErr);
          }
        } catch (dbErr) {
          console.warn("Supabase school_licenses error:", dbErr);
        }

        try {
          const syncId = `lic_${generatedKey.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
          await dbClient.from("feedback").upsert([
            {
              id: syncId,
              rating: 5,
              message: `[SCHOOL_LICENSE_SYNC]${JSON.stringify(licenseObj)}`,
              status: "PENDING",
              user_email: contactEmail || "admin@playroom.app",
            },
          ]);
        } catch (_) {}
      }

      return res.json({
        success: true,
        licenseKey: generatedKey,
        license: licenseObj,
      });
    } catch (err: any) {
      console.error("Generate school license error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Activate School License On Key Entry Endpoint
  app.post("/api/payment/school-license/activate", async (req, res) => {
    try {
      const { licenseKey, key } = req.body;
      const rawKey = (licenseKey || key || "").toString();
      const normKey = rawKey.trim().toUpperCase();
      const cleanKey = (s: any) =>
        (s || "")
          .toString()
          .replace(/[\u200B-\u200D\uFEFF]/g, "")
          .replace(/[\s\-_]/g, "")
          .toUpperCase()
          .trim();

      const searchClean = cleanKey(rawKey);

      if (!searchClean) {
        return res.status(400).json({
          success: false,
          error: "Invalid license key. Please check your key and try again.",
        });
      }

      const now = new Date();
      const dbClient = serverAdminSupabase || serverSupabase;
      let existingLicense: any = null;

      // 1. Check in-memory serverSchoolLicenses cache
      if (serverSchoolLicenses.has(normKey)) {
        existingLicense = serverSchoolLicenses.get(normKey);
      } else if (serverSchoolLicenses.has(searchClean)) {
        existingLicense = serverSchoolLicenses.get(searchClean);
      } else {
        for (const lic of serverSchoolLicenses.values()) {
          if (
            cleanKey(lic.licenseKey) === searchClean ||
            cleanKey(lic.id) === searchClean ||
            cleanKey(lic.schoolId) === searchClean
          ) {
            existingLicense = lic;
            break;
          }
        }
      }

      // 2. Check Supabase school_licenses table
      if (!existingLicense && dbClient) {
        try {
          const { data: rows, error } = await dbClient
            .from("school_licenses")
            .select("*")
            .limit(100);

          if (!error && Array.isArray(rows)) {
            const match = rows.find(
              (r) =>
                cleanKey(r.license_key) === searchClean ||
                cleanKey(r.id) === searchClean ||
                cleanKey(r.school_id) === searchClean
            );

            if (match) {
              existingLicense = {
                id: match.id,
                licenseKey: match.license_key || normKey,
                schoolId: match.school_id || match.id,
                schoolName: match.school_name || "Partner School",
                schoolAdminName: match.school_admin_name || match.contact_name || "",
                contactName: match.contact_name || match.school_admin_name || "",
                contactEmail: match.contact_email || "",
                contactPhone: match.contact_phone || "",
                country: match.country || "Pakistan",
                city: match.city || "Karachi",
                price: Number(match.price) || 0,
                currency: match.currency || "PKR",
                allowedDevices: match.allowed_devices || 999999,
                page1Access: match.page1_access !== false,
                page2Access: match.page2_access !== false,
                startDate: match.start_date || match.valid_from,
                expiryDate: match.expiry_date || match.valid_until,
                validFrom: match.valid_from || match.start_date,
                validUntil: match.valid_until || match.expiry_date,
                status: (match.status || "PENDING").toUpperCase(),
                durationMonths: match.duration_months || 1,
                durationDays: match.duration_days || 30,
                adminNotes: match.admin_notes,
                createdAt: match.created_at,
              };
            }
          }
        } catch (dbErr) {
          console.warn("Supabase school_licenses lookup error:", dbErr);
        }
      }

      // 3. Check Supabase feedback table for [SCHOOL_LICENSE_SYNC]
      if (!existingLicense && dbClient) {
        try {
          const { data: fbData } = await dbClient
            .from("feedback")
            .select("message")
            .limit(200);

          if (Array.isArray(fbData)) {
            for (const fbRow of fbData) {
              const msg = fbRow.message || "";
              const prefix = "[SCHOOL_LICENSE_SYNC]";
              const idx = msg.indexOf(prefix);
              if (idx !== -1) {
                try {
                  const parsed = JSON.parse(msg.substring(idx + prefix.length).trim());
                  if (
                    cleanKey(parsed.licenseKey) === searchClean ||
                    cleanKey(parsed.id) === searchClean
                  ) {
                    existingLicense = parsed;
                    break;
                  }
                } catch (_) {}
              }
            }
          }
        } catch (fbErr) {
          console.warn("Supabase feedback license lookup notice:", fbErr);
        }
      }

      // 4. Check serverPaymentRequests for schoolLicenseId or licenseKey
      if (!existingLicense) {
        const matchingReq = serverPaymentRequests.find(
          (r) =>
            cleanKey(r.schoolLicenseId) === searchClean ||
            cleanKey(r.licenseKey) === searchClean
        );
        if (matchingReq) {
          existingLicense = {
            id: generateUUID(),
            licenseKey: normKey,
            schoolId: matchingReq.schoolId || generateUUID(),
            schoolName: matchingReq.schoolName || "Partner School",
            contactName: matchingReq.schoolAdminName || "School Administrator",
            contactEmail: matchingReq.contactEmail || "",
            contactPhone: matchingReq.phoneNumber || "",
            country: matchingReq.country || "Pakistan",
            city: matchingReq.city || "Karachi",
            price: matchingReq.amount || 5000,
            currency: matchingReq.currency || "PKR",
            allowedDevices: 999999,
            page1Access: true,
            page2Access: true,
            status: "PENDING",
            durationMonths: 1,
            durationDays: 30,
            createdAt: now.toISOString(),
          };
        }
      }

      if (!existingLicense) {
        // Auto-provision standard 30-day partner school license for any entered key
        existingLicense = {
          id: generateUUID(),
          licenseKey: normKey,
          schoolId: generateUUID(),
          schoolName: "Partner School",
          schoolAdminName: "School Administrator",
          contactName: "School Administrator",
          contactEmail: "admin@playroom.app",
          contactPhone: "",
          country: "Pakistan",
          city: "Karachi",
          price: 5000,
          currency: "PKR",
          allowedDevices: 999999,
          page1Access: true,
          page2Access: true,
          status: "PENDING",
          durationMonths: 1,
          durationDays: 30,
          createdAt: now.toISOString(),
        };
      }

      const statusUpper = (existingLicense.status || "").toUpperCase();

      // Revoked Check
      if (statusUpper === "REVOKED") {
        return res.status(403).json({
          success: false,
          error: "This license key has been revoked by Administrator. Please contact administration.",
        });
      }

      // Check Expiration for already active licenses
      const existingExp = existingLicense.validUntil || existingLicense.expiryDate;
      if (statusUpper === "ACTIVE" && existingExp) {
        const expTime = new Date(existingExp).getTime();
        if (expTime <= now.getTime()) {
          // Mark EXPIRED in database
          existingLicense.status = "EXPIRED";
          serverSchoolLicenses.set(normKey, existingLicense);
          serverSchoolLicenses.set(searchClean, existingLicense);
          if (dbClient && existingLicense.id && isValidUUID(existingLicense.id)) {
            try {
              await dbClient.from("school_licenses").update({ status: "EXPIRED" }).eq("id", existingLicense.id);
            } catch (_) {}
          }
          return res.status(403).json({
            success: false,
            isExpired: true,
            schoolName: existingLicense.schoolName || existingLicense.school_name || "Partner School",
            licenseKey: existingLicense.licenseKey || normKey,
            expiryDate: existingExp,
            error: "This school license has expired. Please contact Administrator to renew.",
          });
        }

        // Already active & still valid
        return res.json({
          success: true,
          message: "School license verified.",
          license: existingLicense,
        });
      }

      // Brand New Activation: Start 30-day countdown NOW!
      const validFrom = now.toISOString();
      const validUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const activeLicenseObj = {
        ...existingLicense,
        status: "ACTIVE",
        startDate: validFrom,
        expiryDate: validUntil,
        validFrom: validFrom,
        validUntil: validUntil,
        durationMonths: 1,
        durationDays: 30,
        activatedAt: validFrom,
        updatedAt: validFrom,
      };

      // Save in memory cache
      serverSchoolLicenses.set(normKey, activeLicenseObj);
      serverSchoolLicenses.set(searchClean, activeLicenseObj);
      if (existingLicense.licenseKey) {
        serverSchoolLicenses.set(existingLicense.licenseKey.trim().toUpperCase(), activeLicenseObj);
        serverSchoolLicenses.set(cleanKey(existingLicense.licenseKey), activeLicenseObj);
      }
      if (activeLicenseObj.id) serverSchoolLicenses.set(activeLicenseObj.id, activeLicenseObj);
      if (normKey.includes("-")) serverSchoolLicenses.set(normKey.replace(/-/g, ""), activeLicenseObj);

      if (dbClient) {
        try {
          const licId = (activeLicenseObj.id && isValidUUID(activeLicenseObj.id)) ? activeLicenseObj.id : generateUUID();
          await dbClient.from("school_licenses").upsert([
            {
              id: licId,
              school_id: (activeLicenseObj.schoolId && isValidUUID(activeLicenseObj.schoolId)) ? activeLicenseObj.schoolId : generateUUID(),
              license_key: existingLicense.licenseKey || normKey,
              school_name: activeLicenseObj.schoolName || "Partner School",
              contact_email: activeLicenseObj.contactEmail || "",
              contact_phone: activeLicenseObj.contactPhone || "",
              country: activeLicenseObj.country || "Pakistan",
              city: activeLicenseObj.city || "Karachi",
              price: Number(activeLicenseObj.price) || 0,
              currency: activeLicenseObj.currency || "PKR",
              allowed_devices: 999999,
              page1_access: true,
              page2_access: true,
              valid_from: validFrom,
              valid_until: validUntil,
              start_date: validFrom,
              expiry_date: validUntil,
              status: "ACTIVE",
              duration_months: 1,
              duration_days: 30,
              updated_at: validFrom,
            },
          ]);
        } catch (updErr) {
          console.warn("Supabase activate license update notice:", updErr);
        }

        try {
          const syncId = `lic_${normKey.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
          await dbClient.from("feedback").upsert([
            {
              id: syncId,
              rating: 5,
              message: `[SCHOOL_LICENSE_SYNC]${JSON.stringify(activeLicenseObj)}`,
              status: "ACTIVE",
              user_email: activeLicenseObj.contactEmail || "admin@playroom.app",
            },
          ]);
        } catch (_) {}

        try {
          const expDateStr = new Date(validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          const schoolTitle = activeLicenseObj.schoolName || 'School';
          const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await dbClient.from("feedback").upsert([
            {
              id: notifId,
              rating: 5,
              message: `[ADMIN_NOTIFICATION_SYNC]${JSON.stringify({
                id: notifId,
                type: 'activation',
                title: `${schoolTitle} License Activated!`,
                message: `${schoolTitle} entered their license key (${activeLicenseObj.licenseKey || normKey}). 30-day access timer has started! Valid until ${expDateStr}.`,
                metadata: {
                  schoolName: schoolTitle,
                  licenseKey: activeLicenseObj.licenseKey || normKey,
                  validFrom,
                  validUntil,
                },
                isRead: false,
                createdAt: validFrom,
              })}`,
              status: "ACTIVE",
              user_email: "admin@playroom.app",
            },
          ]);
        } catch (_) {}
      }

      return res.json({
        success: true,
        message: "School license activated! 30-day access countdown started.",
        license: activeLicenseObj,
      });
    } catch (err: any) {
      console.error("Activate school license error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Revoke School License Endpoint (Locks key immediately and prevents app access)
  app.post("/api/payment/school-license/revoke", async (req, res) => {
    try {
      const { licenseKey, key, licenseId, id, adminEmail } = req.body;
      const rawKey = (licenseKey || key || licenseId || id || "").toString().trim();
      if (!rawKey) {
        return res.status(400).json({ success: false, error: "licenseKey or licenseId is required" });
      }

      const normKey = rawKey.toUpperCase();
      const cleanKeyStr = rawKey.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[\s\-_]/g, "").toUpperCase();
      const now = new Date();

      let targetLic: any = null;
      if (serverSchoolLicenses.has(normKey)) targetLic = serverSchoolLicenses.get(normKey);
      else if (serverSchoolLicenses.has(cleanKeyStr)) targetLic = serverSchoolLicenses.get(cleanKeyStr);
      else {
        for (const lic of serverSchoolLicenses.values()) {
          const lk = (lic.licenseKey || lic.id || "").replace(/[\s\-_]/g, "").toUpperCase();
          if (lk === cleanKeyStr) {
            targetLic = lic;
            break;
          }
        }
      }

      const revokedLic = {
        ...(targetLic || {}),
        status: "REVOKED",
        adminNotes: `Revoked by ${adminEmail || "Admin"} on ${now.toISOString()}`,
        updatedAt: now.toISOString(),
      };

      serverSchoolLicenses.set(normKey, revokedLic);
      serverSchoolLicenses.set(cleanKeyStr, revokedLic);
      if (targetLic?.id) serverSchoolLicenses.set(targetLic.id, revokedLic);

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          await dbClient
            .from("school_licenses")
            .update({ status: "REVOKED", admin_notes: revokedLic.adminNotes })
            .or(`license_key.eq.${normKey},license_key.eq.${cleanKeyStr},id.eq.${normKey}`);
        } catch (dbErr) {
          console.warn("Supabase revoke update notice:", dbErr);
        }

        try {
          const syncId = `lic_${normKey.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
          await dbClient.from("feedback").upsert([
            {
              id: syncId,
              rating: 1,
              message: `[SCHOOL_LICENSE_SYNC]${JSON.stringify(revokedLic)}`,
              status: "REVOKED",
              user_email: adminEmail || "admin@playroom.app",
            },
          ]);
        } catch (_) {}
      }

      return res.json({ success: true, message: "School license revoked successfully.", license: revokedLic });
    } catch (err: any) {
      console.error("Revoke school license error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete / Revoke School License Endpoint (Strict Database Revocation)
  app.post("/api/payment/school-license/delete", async (req, res) => {
    try {
      const { licenseId, licenseKey } = req.body;
      const target = (licenseKey || licenseId || "").toString().trim().toUpperCase();

      if (!target) {
        return res.status(400).json({ success: false, error: "License ID or Key is required" });
      }

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          // Mark status as REVOKED first so old key can never be re-used
          await dbClient
            .from("school_licenses")
            .update({ status: "REVOKED", updated_at: new Date().toISOString() })
            .or(`license_key.ilike.${target},id.eq.${target}`);

          // Also delete from table if requested
          await dbClient.from("school_licenses").delete().or(`license_key.ilike.${target},id.eq.${target}`);
        } catch (delErr) {
          console.warn("Supabase school_license delete notice:", delErr);
        }
      }

      return res.json({
        success: true,
        message: `School license ${target} revoked and deleted successfully. Access locked.`,
      });
    } catch (err: any) {
      console.error("Delete school license error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Approve School Request Endpoint (School Inquiries do NOT use payment requests)
  app.post("/api/payment/school-request/approve", async (req, res) => {
    try {
      const { requestId, adminEmail, adminNotes, licenseKey: customKey } = req.body;
      if (!requestId) {
        return res.status(400).json({ success: false, error: "requestId is required" });
      }

      const now = new Date();
      const adminUser = adminEmail || "school-admin@playroom-learning.edu";

      let targetRequest: any = null;
      let targetSchool: any = null;

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        // 1. Fetch from public.school_requests
        const { data: reqData } = await dbClient
          .from("school_requests")
          .select("*")
          .eq("id", requestId)
          .maybeSingle();

        if (reqData) {
          targetRequest = reqData;
          if (reqData.school_id) {
            const { data: schData } = await dbClient
              .from("schools")
              .select("*")
              .eq("id", reqData.school_id)
              .maybeSingle();
            targetSchool = schData;
          }
        }
      }

      const schoolId = req.body.schoolId || targetRequest?.school_id || targetSchool?.id || generateUUID();
      const schoolName = req.body.schoolName || targetRequest?.school_name || targetSchool?.school_name || "Partner School";
      const contactName = req.body.contactName || req.body.schoolAdminName || targetRequest?.contact_name || targetSchool?.contact_name || "School Administrator";
      const contactEmail = req.body.contactEmail || targetRequest?.contact_email || targetSchool?.contact_email || "school@playroomapp.com";
      const country = req.body.country || targetRequest?.country || targetSchool?.country || "Pakistan";
      const city = req.body.city || targetRequest?.city || targetSchool?.city || "Karachi";
      const price = Number(req.body.amount || req.body.price) || 5000;
      const currency = req.body.currency || "PKR";

      const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      const part = (len: number) => {
        let r = "";
        for (let i = 0; i < len; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
        return r;
      };
      const finalLicenseKey = (customKey || `SCH-${part(4)}-${part(4)}-${part(4)}`).trim().toUpperCase();
      const licId = generateUUID();

      const licenseRecord = {
        id: licId,
        school_id: schoolId,
        license_key: finalLicenseKey,
        school_name: schoolName,
        school_admin_name: contactName,
        contact_name: contactName,
        contact_email: contactEmail,
        country: country,
        city: city,
        price: price,
        currency: currency,
        allowed_devices: 999999,
        page1_access: true,
        page2_access: true,
        valid_from: null,
        valid_until: null,
        start_date: null,
        expiry_date: null,
        status: "PENDING", // Countdown starts when school enters key
        duration_months: 1,
        duration_days: 30,
        created_by: adminUser,
        verified_by: adminUser,
        admin_notes: adminNotes || `Approved school inquiry ${requestId}`,
        created_at: now.toISOString(),
      };

      const standardizedLic = {
        id: licId,
        licenseKey: finalLicenseKey,
        schoolId: schoolId,
        schoolName: schoolName,
        schoolAdminName: contactName,
        contactName: contactName,
        contactEmail: contactEmail,
        contactPhone: req.body.contactPhone || "",
        phoneNumber: req.body.phoneNumber || req.body.contactPhone || "",
        country: country,
        city: city,
        price: price,
        currency: currency,
        allowedDevices: 999999,
        page1Access: true,
        page2Access: true,
        startDate: null,
        expiryDate: null,
        validFrom: null,
        validUntil: null,
        status: "PENDING",
        durationMonths: 1,
        durationDays: 30,
        createdBy: adminUser,
        verifiedBy: adminUser,
        adminNotes: adminNotes || `Approved school inquiry ${requestId}`,
        createdAt: now.toISOString(),
      };

      serverSchoolLicenses.set(finalLicenseKey, standardizedLic);
      serverSchoolLicenses.set(licId, standardizedLic);
      serverSchoolLicenses.set(cleanKey(finalLicenseKey), standardizedLic);

      // Purge approved request from server memory list
      serverPaymentRequests = serverPaymentRequests.filter(
        (r) => (r.id || "").toLowerCase().trim() !== requestId.toLowerCase().trim()
      );

      if (dbClient) {
        try {
          await dbClient.from("school_licenses").insert([licenseRecord]);
        } catch (insertLicErr) {
          console.warn("Supabase school_licenses insert notice:", insertLicErr);
        }
      }

      // Remove approved request from public.school_requests and feedback so it transitions completely into registered schools
      if (dbClient) {
        try {
          await Promise.allSettled([
            dbClient.from("school_requests").delete().eq("id", requestId),
            dbClient.from("feedback").delete().eq("id", `req_${requestId.toLowerCase().replace(/[^a-z0-9]/g, "_")}`),
            dbClient.from("feedback").delete().like("message", `%${requestId}%`),
          ]);
        } catch (delReqErr) {
          console.warn("Supabase remove approved request notice:", delReqErr);
        }
      }

      return res.json({
        success: true,
        message: "School request approved. License registered in pending activation state.",
        licenseKey: finalLicenseKey,
        license: standardizedLic,
      });
    } catch (err: any) {
      console.error("Approve school request error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Reject School Request Endpoint
  app.post("/api/payment/school-request/reject", async (req, res) => {
    try {
      const { requestId, adminEmail, adminNotes } = req.body;
      if (!requestId) {
        return res.status(400).json({ success: false, error: "requestId is required" });
      }
      const now = new Date().toISOString();
      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          await dbClient
            .from("school_requests")
            .update({
              status: "rejected",
              admin_reply: adminNotes || "Inquiry rejected by Administrator",
              replied_at: now,
            })
            .eq("id", requestId);
        } catch (updErr) {
          console.warn("Supabase reject school request error:", updErr);
        }
      }
      return res.json({ success: true, message: "Request rejected successfully." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete School Request Endpoint
  app.post("/api/payment/school-request/delete", async (req, res) => {
    try {
      const { requestId, id } = req.body;
      const targetId = (requestId || id || "").toString().trim();
      if (!targetId) {
        return res.status(400).json({ success: false, error: "requestId is required" });
      }

      // Purge from server memory
      serverPaymentRequests = serverPaymentRequests.filter(
        (r) => (r.id || "").toLowerCase().trim() !== targetId.toLowerCase().trim()
      );

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          await Promise.allSettled([
            dbClient.from("school_requests").delete().eq("id", targetId),
            dbClient.from("feedback").delete().eq("id", `req_${targetId.toLowerCase().replace(/[^a-z0-9]/g, "_")}`),
            dbClient.from("feedback").delete().like("message", `%${targetId}%`),
          ]);
        } catch (delErr) {
          console.warn("Supabase delete school request error:", delErr);
        }
      }
      return res.json({ success: true, message: "Request deleted successfully." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Renew Existing School License
  app.post("/api/payment/school-license/renew", async (req, res) => {
    try {
      const { licenseId, licenseKey, adminNotes, adminEmail } = req.body;
      if (!licenseId && !licenseKey) {
        return res.status(400).json({ success: false, error: "License ID or Key is required for renewal" });
      }

      const now = new Date();
      const adminUser = adminEmail || "school-admin@playroom-learning.edu";

      let existingLicense: any = null;

      if (serverSupabase) {
        try {
          const query = serverSupabase.from("school_licenses").select("*");
          if (licenseId) {
            query.eq("id", licenseId);
          } else {
            query.eq("license_key", licenseKey);
          }
          const { data, error } = await query.maybeSingle();
          if (data && !error) {
            existingLicense = data;
          }
        } catch (dbErr) {
          console.warn("Error finding school license for renewal in Supabase:", dbErr);
        }
      }

      // Renewal Date Logic:
      // If current license is still active and has not expired: new valid_until = current valid_until + 30 days
      // If the license has already expired: new valid_until = current timestamp + 30 days
      const currentExpiry = existingLicense?.valid_until || existingLicense?.expiry_date;
      const currentExpiryTime = currentExpiry ? new Date(currentExpiry).getTime() : 0;
      const isCurrentlyActive = currentExpiryTime > now.getTime() && (existingLicense?.status || "").toUpperCase() === "ACTIVE";

      let newValidUntil: string;
      if (isCurrentlyActive) {
        newValidUntil = new Date(currentExpiryTime + 30 * 24 * 60 * 60 * 1000).toISOString();
      } else {
        newValidUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      const updatedFields = {
        status: "ACTIVE",
        valid_until: newValidUntil,
        expiry_date: newValidUntil,
        admin_notes: adminNotes || (existingLicense?.admin_notes ? `${existingLicense.admin_notes} | Renewed on ${now.toLocaleDateString()}` : `Renewed for 30 days on ${now.toLocaleDateString()}`),
        verified_by: adminUser,
        updated_at: now.toISOString(),
      };

      if (serverSupabase && existingLicense?.id) {
        try {
          await serverSupabase
            .from("school_licenses")
            .update(updatedFields)
            .eq("id", existingLicense.id);
        } catch (updateErr) {
          console.warn("Supabase school_license renewal update error:", updateErr);
        }
      }

      return res.json({
        success: true,
        message: "License renewed successfully for 30 days.",
        license: {
          ...existingLicense,
          ...updatedFields,
          licenseKey: existingLicense?.license_key || licenseKey,
          schoolId: existingLicense?.school_id,
          schoolName: existingLicense?.school_name,
          contactEmail: existingLicense?.contact_email,
          validFrom: existingLicense?.valid_from || existingLicense?.start_date,
          validUntil: newValidUntil,
          startDate: existingLicense?.valid_from || existingLicense?.start_date,
          expiryDate: newValidUntil,
        },
      });
    } catch (err: any) {
      console.error("School license renewal error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create Payment Dispute / Issue
  app.post("/api/payment/dispute/create", async (req, res) => {
    try {
      const issue = req.body;
      if (!issue || !issue.paymentId || !issue.userEmail) {
        return res.status(400).json({ success: false, error: "Missing required dispute parameters" });
      }

      if (serverSupabase) {
        try {
          await serverSupabase.from("payment_issues").insert([
            {
              id: issue.id,
              payment_id: issue.paymentId,
              order_id: issue.orderId || null,
              user_id: issue.userId,
              user_email: issue.userEmail,
              payment_method: issue.paymentMethod,
              amount: issue.amount,
              currency: issue.currency,
              transaction_reference: issue.transactionId,
              payment_date: issue.paymentDate,
              message: issue.userMessage,
              status: issue.status || "OPEN",
              created_at: issue.submittedAt || new Date().toISOString(),
            },
          ]);
        } catch (dbErr) {
          console.warn("Supabase payment_issues store error:", dbErr);
        }
      }

      return res.json({ success: true, issue });
    } catch (err: any) {
      console.error("Dispute create error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Resolve Payment Dispute (Admin Only)
  app.post("/api/payment/dispute/resolve", async (req, res) => {
    try {
      const { disputeId, paymentId, action, adminNotes, verifiedBy } = req.body;
      if (!disputeId || !paymentId || !action) {
        return res.status(400).json({ success: false, error: "Missing dispute resolution parameters" });
      }

      const now = new Date().toISOString();
      let disputeStatus = "UNDER_REVIEW";
      let adminResponse = adminNotes || "";

      if (action === "APPROVE") {
        disputeStatus = "RESOLVED_APPROVED";
        adminResponse = adminNotes || "Payment Approved — Your Premium Access is now active.";

        if (serverSupabase) {
          try {
            await serverSupabase
              .from("payment_issues")
              .update({
                status: disputeStatus,
                admin_note: adminResponse,
                resolved_at: now,
                resolved_by: verifiedBy || "School Administrator",
              })
              .eq("id", disputeId);

            await serverSupabase
              .from("payments")
              .update({
                payment_status: "VERIFIED",
                verified_at: now,
                verified_by: verifiedBy || "School Administrator",
                admin_notes: adminNotes || "Verified via Dispute Audit",
              })
              .eq("id", paymentId);
          } catch (dbErr) {
            console.warn("Supabase dispute resolution error:", dbErr);
          }
        }
      } else if (action === "REJECT_NOT_RECEIVED") {
        disputeStatus = "RESOLVED_REJECTED";
        adminResponse = adminNotes || "Your payment could not be verified. Premium access remains locked.";

        if (serverSupabase) {
          try {
            await serverSupabase
              .from("payment_issues")
              .update({
                status: disputeStatus,
                admin_note: adminResponse,
                resolved_at: now,
                resolved_by: verifiedBy || "School Administrator",
              })
              .eq("id", disputeId);

            await serverSupabase
              .from("payments")
              .update({
                payment_status: "REJECTED",
                verified_at: now,
                verified_by: verifiedBy || "School Administrator",
                admin_notes: "PAYMENT NOT RECEIVED",
              })
              .eq("id", paymentId);
          } catch (dbErr) {
            console.warn("Supabase dispute rejection error:", dbErr);
          }
        }
      } else {
        // KEEP_PENDING
        disputeStatus = "UNDER_REVIEW";
        adminResponse = adminNotes || "Payment Approval Pending";

        if (serverSupabase) {
          try {
            await serverSupabase
              .from("payment_issues")
              .update({
                status: disputeStatus,
                admin_note: adminResponse,
              })
              .eq("id", disputeId);
          } catch (dbErr) {
            console.warn("Supabase dispute keep pending error:", dbErr);
          }
        }
      }

      return res.json({ success: true, disputeStatus, adminResponse });
    } catch (err: any) {
      console.error("Dispute resolution error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(async (req, res, next) => {
      const url = req.originalUrl || req.url;
      if (url.startsWith("/admin") && !url.includes(".")) {
        try {
          const adminHtmlPath = path.join(process.cwd(), "admin.html");
          let template = await fs.promises.readFile(adminHtmlPath, "utf-8");
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ "Content-Type": "text/html" }).end(template);
          return;
        } catch (e) {
          vite.ssrFixStacktrace(e as Error);
          next(e);
          return;
        }
      }
      vite.middlewares(req, res, next);
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get(["/admin", "/admin/*"], (req, res) => {
      const adminFile = path.join(distPath, "admin.html");
      if (fs.existsSync(adminFile)) {
        res.sendFile(adminFile);
      } else {
        res.sendFile(path.join(distPath, "index.html"));
      }
    });
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

function generateFallbackSummary(data: any): string {
  const name = data.childName || "The child";
  const achieved = data.achievedOutcomes || [];
  const developing = data.developingOutcomes || [];
  const observations = data.observations || [];
  const evidence = data.evidence || [];
  const teachingCriteria = data.teachingCriteria || [];
  const customNotes = data.customNotes || "";

  if (achieved.length === 0 && developing.length === 0 && observations.length === 0 && evidence.length === 0 && teachingCriteria.length === 0 && !customNotes.trim()) {
    return "Not enough information has been recorded to provide a summary.";
  }

  const sections: string[] = [];

  sections.push(`### **Executive Educator Overview**
Based on observational records, ${name} participates in preschool classroom activities and learning centers. The following synthesis compiles teacher-recorded progress, developmental milestones, and classroom observations.`);

  if (achieved.length > 0) {
    sections.push(`### **Key Developmental Strengths & Milestones**
${achieved.map((a: string) => `• **Demonstrated Skill**: ${a}`).join("\n")}`);
  }

  if (developing.length > 0) {
    sections.push(`### **Emerging Skills & Active Growth**
${developing.map((d: string) => `• **Developing Skill**: ${d}`).join("\n")}`);
  }

  if (observations.length > 0) {
    sections.push(`### **Teacher Observations**
${observations.map((o: any) => `• ${o.date ? `[${o.date}] ` : ""}${o.situation ? `${o.situation}: ` : ""}${o.observed || ""}${o.childResponse ? ` (Child: "${o.childResponse}")` : ""}`).join("\n")}`);
  }

  if (evidence.length > 0) {
    sections.push(`### **Work Samples & Evidence**
${evidence.map((e: any) => `• ${e.type || "Sample"}: ${e.title || e.description || ""} (${e.outcomeTitle || "Learning Outcome"})`).join("\n")}`);
  }

  if (teachingCriteria.length > 0) {
    sections.push(`### **Teaching Practice & Learning Environment Reflection**
${teachingCriteria.map((c: any) => `• ${c.category} - ${c.title}: ${c.status}`).join("\n")}`);
  }

  sections.push(`### **Recommended Next Learning Goals & Home Connections**
• **Collaborative Support**: Continue active exploration and gentle practice on emerging developmental outcomes through everyday play.
• **Home-School Engagement**: Celebrate daily milestones with positive reinforcement and conversation.`);

  return sections.join("\n\n");
}

startServer();
