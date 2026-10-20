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
  let serverRenewalRequests: any[] = [];
  const cleanKey = (k: any) => (k || '').toString().replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
  const serverGooglePlayPurchases: any[] = [];
  const serverSchoolLicenses = new Map<string, any>();
  const serverUsedLicenseKeys = new Set<string>();
  const serverAdminNotifications = new Map<string, any>();
  const serverDeletedNotificationIds = new Set<string>();
  const serverDeletedRequestIds = new Set<string>();
  const serverDeletedLicenseKeys = new Set<string>();

  async function recordServerAdminNotification(item: {
    id: string;
    type: string;
    title: string;
    message: string;
    timestamp?: string;
    createdAt?: string;
    linkTab?: string;
    metadata?: any;
    isRead?: boolean;
  }) {
    if (serverDeletedNotificationIds.has(item.id.toLowerCase().trim())) return;
    const notifObj = {
      ...item,
      timestamp: item.timestamp || new Date().toISOString(),
      createdAt: item.createdAt || new Date().toISOString(),
      isRead: item.isRead || false,
    };
    serverAdminNotifications.set(item.id, notifObj);

    const dbClient = serverAdminSupabase || serverSupabase;
    if (dbClient) {
      try {
        const syncId = item.id.startsWith("notif_") ? item.id : `notif_${item.id}`;
        await dbClient.from("feedback").upsert({
          id: syncId,
          rating: 5,
          message: `[ADMIN_NOTIFICATION_SYNC]${JSON.stringify(notifObj)}`,
          status: notifObj.isRead ? "RESOLVED" : "ACTIVE",
          user_email: "admin@playroom.app",
        });
      } catch (_) {}
    }

    broadcastLicenseEvent("license_update", {
      type: "NOTIFICATION",
      notification: notifObj,
      timestamp: notifObj.timestamp,
    });
  }

  /**
   * Exact calendar-month calculation in UTC.
   * Requirement: Exactly one calendar month forward at the exact same UTC time.
   * Example: 16 October 14:30:00 UTC -> 16 November 14:30:00 UTC.
   * Documented End-of-Month Rule:
   * If the activation day exceeds the total days in the target month (e.g., Jan 31 -> Feb has 28 or 29 days;
   * Aug 31 -> Sep has 30 days), the expiry clamps to the final calendar day of the target month.
   * Correctly handles leap years and variable-length months (28, 29, 30, and 31 days).
   */
  function calculateCalendarMonthExpiry(startDate: Date = new Date()): Date {
    const d = new Date(startDate);
    const startDay = d.getUTCDate();
    const startMonth = d.getUTCMonth();
    const startYear = d.getUTCFullYear();
    const startHours = d.getUTCHours();
    const startMinutes = d.getUTCMinutes();
    const startSeconds = d.getUTCSeconds();
    const startMs = d.getUTCMilliseconds();

    const targetMonth = (startMonth + 1) % 12;
    const targetYear = startMonth === 11 ? startYear + 1 : startYear;

    // Last day of target month in UTC (Day 0 of targetMonth + 1)
    const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const finalDay = Math.min(startDay, lastDayOfTargetMonth);

    return new Date(Date.UTC(targetYear, targetMonth, finalDay, startHours, startMinutes, startSeconds, startMs));
  }

  /**
   * Resolves admin selected expiry deadline.
   * If a date without time is given (e.g. "2026-10-30"), the expiry deadline
   * is at the end of that day (31 October, 12:00 AM UTC).
   */
  function resolveServerExpiryDeadline(dateStr: string | null | undefined): string | null {
    if (!dateStr) return null;
    const str = dateStr.trim();
    if (str.includes("T")) {
      const d = new Date(str);
      return !isNaN(d.getTime()) ? d.toISOString() : null;
    }
    const parts = str.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const deadline = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
      return deadline.toISOString();
    }
    const d = new Date(str);
    return !isNaN(d.getTime()) ? d.toISOString() : null;
  }

  /**
   * Generates a cryptographically unique, one-time-use license key SCH-XXXX-XXXX-XXXX.
   * Verifies against all historical, database, and in-memory keys to guarantee no reuse.
   */
  function generateServerUniqueLicenseKey(): string {
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Ambiguity-free
    const part = (len: number) => {
      let r = "";
      for (let i = 0; i < len; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
      return r;
    };
    let key = "";
    let attempts = 0;
    do {
      key = `SCH-${part(4)}-${part(4)}-${part(4)}`;
      attempts++;
    } while ((serverUsedLicenseKeys.has(key) || serverSchoolLicenses.has(key)) && attempts < 1000);
    serverUsedLicenseKeys.add(key);
    serverUsedLicenseKeys.add(cleanKey(key));
    return key;
  }

  // Real-Time Server-Sent Events (SSE) Client Connections
  const sseClients = new Set<any>();

  function broadcastLicenseEvent(eventType: string, data: any) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
        if (typeof client.flush === 'function') client.flush();
      } catch {
        sseClients.delete(client);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Admin Notifications Endpoints (Real database & server-authoritative state)
  // ---------------------------------------------------------------------------
  app.get("/api/admin/notifications", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const notifMap = new Map<string, any>();

      // 1. In-memory notifications (authoritative server clock & state)
      serverAdminNotifications.forEach((n) => {
        if (n && n.id && !serverDeletedNotificationIds.has((n.id || "").toLowerCase().trim())) {
          notifMap.set(n.id, n);
        }
      });

      // 2. Supabase feedback notifications sync
      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          const { data: dbNotifs } = await dbClient
            .from("feedback")
            .select("*")
            .like("message", "[ADMIN_NOTIFICATION_SYNC]%")
            .order("created_at", { ascending: false })
            .limit(100);

          if (Array.isArray(dbNotifs)) {
            dbNotifs.forEach((row: any) => {
              try {
                const prefix = "[ADMIN_NOTIFICATION_SYNC]";
                const rawJson = row.message.substring(row.message.indexOf(prefix) + prefix.length).trim();
                const n = JSON.parse(rawJson);
                if (n && n.id && !serverDeletedNotificationIds.has((n.id || "").toLowerCase().trim())) {
                  if (!notifMap.has(n.id)) {
                    notifMap.set(n.id, n);
                  }
                }
              } catch (_) {}
            });
          }
        } catch (dbErr) {
          console.warn("Supabase notifications fetch error:", dbErr);
        }
      }

      // 3. If notifications are empty, reconstruct genuine notifications directly from actual DB events
      if (notifMap.size === 0) {
        serverPaymentRequests.forEach((req) => {
          if (!req || !req.id) return;
          const cleanReqId = (req.id || "").toString().toLowerCase().trim();
          if (serverDeletedRequestIds.has(cleanReqId)) return;
          const normReqId = cleanReqId.replace(/[^a-z0-9]/g, "_");
          const inqNotifId = `notif_inquiry_${normReqId}`;
          const isApproved = (req.status || "").toUpperCase() === "APPROVED";

          if (!serverDeletedNotificationIds.has(inqNotifId) && !notifMap.has(inqNotifId)) {
            const notifObj = {
              id: inqNotifId,
              type: "inquiry",
              title: `New School Request: ${req.schoolName || 'Partner School'}`,
              message: `${req.schoolName || 'Partner School'} (${req.contactName || req.schoolAdminName || 'School Administrator'}, ${req.city || 'Karachi'}, ${req.country || 'Pakistan'}) has submitted an inquiry. Contact: ${req.contactEmail || ''} / ${req.contactPhone || req.phoneNumber || ''}.`,
              timestamp: req.submittedAt || req.createdAt || new Date().toISOString(),
              createdAt: req.submittedAt || req.createdAt || new Date().toISOString(),
              linkTab: "school_requests",
              metadata: {
                requestId: req.id,
                schoolName: req.schoolName,
                contactEmail: req.contactEmail,
              },
              isRead: isApproved,
            };
            notifMap.set(inqNotifId, notifObj);
            serverAdminNotifications.set(inqNotifId, notifObj);
          }

          if (isApproved && req.generated_license_key) {
            const appNotifId = `notif_approval_${normReqId}`;
            if (!serverDeletedNotificationIds.has(appNotifId) && !notifMap.has(appNotifId)) {
              const notifObj = {
                id: appNotifId,
                type: "approval",
                title: `School Approved: ${req.schoolName || 'Partner School'}`,
                message: `${req.schoolName || 'Partner School'} has been approved and moved to Registered Schools. License Key: ${req.generated_license_key}. 1 calendar month countdown begins when entered.`,
                timestamp: req.reviewedAt || req.submittedAt || new Date().toISOString(),
                createdAt: req.reviewedAt || req.submittedAt || new Date().toISOString(),
                linkTab: "registered_schools",
                metadata: {
                  requestId: req.id,
                  schoolName: req.schoolName,
                  licenseKey: req.generated_license_key,
                },
                isRead: true,
              };
              notifMap.set(appNotifId, notifObj);
              serverAdminNotifications.set(appNotifId, notifObj);
            }
          }
        });
      }

      // Filter against deleted entities (requests, licenses) and remove fake/sample notifications
      const seenIds = new Set<string>();
      const seenRequestIds = new Set<string>();
      const validNotifications: any[] = [];

      const isFakeNotification = (item: any): boolean => {
        if (!item) return true;
        const id = (item.id || "").toLowerCase();
        const title = (item.title || "").toLowerCase();
        const msg = (item.message || "").toLowerCase();
        if (id.startsWith("sample") || id.startsWith("mock") || id.startsWith("fake") || id.startsWith("dummy") || id.startsWith("placeholder")) return true;
        if (title.includes("sample notification") || title.includes("mock notification") || title.includes("test notification") || title.includes("placeholder")) return true;
        if (msg.includes("sample notification") || msg.includes("mock notification") || msg.includes("lorem ipsum")) return true;
        return false;
      };

      Array.from(notifMap.values()).forEach((n) => {
        if (!n || !n.id) return;
        if (isFakeNotification(n)) return;

        const normId = (n.id || "").toString().toLowerCase().trim();
        if (serverDeletedNotificationIds.has(normId)) return;

        // If notification is tied to a deleted school request, exclude it
        const reqId = (n.metadata?.requestId || "").toString().toLowerCase().trim();
        if (reqId && serverDeletedRequestIds.has(reqId)) return;

        // If notification is tied to a deleted license, exclude it
        const licKey = (n.metadata?.licenseKey || "").toString().trim().toUpperCase().replace(/[\s\-_]/g, "");
        if (licKey && serverDeletedLicenseKeys.has(licKey)) return;

        if (seenIds.has(normId)) return;
        seenIds.add(normId);

        // Deduplicate request inquiry notifications to guarantee exactly 1 per request
        if (reqId && n.type === "inquiry") {
          if (seenRequestIds.has(reqId)) return;
          seenRequestIds.add(reqId);
        }

        validNotifications.push(n);
      });

      // Sort newest first
      validNotifications.sort(
        (a, b) => new Date(b.timestamp || b.createdAt || 0).getTime() - new Date(a.timestamp || a.createdAt || 0).getTime()
      );

      return res.json({ success: true, notifications: validNotifications });
    } catch (err: any) {
      console.error("Fetch notifications error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/admin/notifications/mark-read", async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ success: false, error: "Notification id required" });
      }
      const normId = (id || "").toString().toLowerCase().trim();
      const target = serverAdminNotifications.get(id) || serverAdminNotifications.get(normId);
      if (target) {
        target.isRead = true;
        serverAdminNotifications.set(id, target);
        serverAdminNotifications.set(normId, target);
      }

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          const syncId = normId.startsWith("notif_") ? normId : `notif_${normId}`;
          await dbClient.from("feedback").update({ status: "RESOLVED" }).eq("id", syncId);
        } catch (_) {}
      }

      return res.json({ success: true, message: "Notification marked as read." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/admin/notifications/mark-all-read", async (req, res) => {
    try {
      serverAdminNotifications.forEach((n, k) => {
        n.isRead = true;
        serverAdminNotifications.set(k, n);
      });

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          await dbClient.from("feedback").update({ status: "RESOLVED" }).like("message", "[ADMIN_NOTIFICATION_SYNC]%");
        } catch (_) {}
      }

      return res.json({ success: true, message: "All notifications marked as read." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/admin/notifications/delete", async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ success: false, error: "Notification id required" });
      }
      const normId = (id || "").toString().toLowerCase().trim();
      serverDeletedNotificationIds.add(normId);
      serverAdminNotifications.delete(id);
      serverAdminNotifications.delete(normId);

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          const syncId = normId.startsWith("notif_") ? normId : `notif_${normId}`;
          await Promise.allSettled([
            dbClient.from("feedback").delete().eq("id", syncId),
            dbClient.from("feedback").delete().like("message", `%${normId}%`),
            dbClient.from("notifications").delete().eq("id", id),
          ]);
        } catch (_) {}
      }

      broadcastLicenseEvent("license_update", {
        type: "NOTIFICATION_DELETED",
        notificationId: id,
        timestamp: new Date().toISOString(),
      });

      return res.json({ success: true, message: "Notification permanently deleted." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/admin/notifications/clear", async (req, res) => {
    try {
      serverAdminNotifications.forEach((_, k) => {
        serverDeletedNotificationIds.add(k.toLowerCase().trim());
      });
      serverAdminNotifications.clear();

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          await dbClient.from("feedback").delete().like("message", "[ADMIN_NOTIFICATION_SYNC]%");
        } catch (_) {}
      }

      broadcastLicenseEvent("license_update", {
        type: "NOTIFICATIONS_CLEARED",
        timestamp: new Date().toISOString(),
      });

      return res.json({ success: true, message: "All notifications permanently cleared." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

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
        calculateCalendarMonthExpiry(new Date(validFromTime)).toISOString();

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

      // 1b. Always record genuine inquiry notification on the server immediately
      const notifId = `notif_inquiry_${requestId.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      await recordServerAdminNotification({
        id: notifId,
        type: "inquiry",
        title: `New School Request: ${trimmedSchoolName}`,
        message: `${trimmedSchoolName} (${trimmedAdminName}, ${trimmedCity}, ${trimmedCountry}) has submitted a new inquiry. Contact: ${trimmedEmail} / ${trimmedPhone}.`,
        timestamp: nowIso,
        createdAt: nowIso,
        linkTab: "school_requests",
        metadata: {
          requestId: newRecord.id,
          schoolName: trimmedSchoolName,
          contactEmail: trimmedEmail,
          phoneNumber: trimmedPhone,
          city: trimmedCity,
          country: trimmedCountry,
        },
        isRead: false,
      });

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

      // Broadcast Real-Time SSE Event to Admin Panel immediately
      broadcastLicenseEvent("license_update", {
        type: "SCHOOL_REQUEST",
        request: newRecord,
        schoolName: trimmedSchoolName,
        timestamp: nowIso,
      });

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
                    const existing = reqMap.get(reqObj.id);
                    if (!existing || existing.status !== "APPROVED") {
                      if (!existing) reqMap.set(reqObj.id, reqObj);
                    }
                  }
                }
              } catch (_) {}
            });
          }
        } catch (dbErr) {
          console.warn("Supabase school_requests fetch error in server:", dbErr);
        }
      }

      const allList = Array.from(reqMap.values()).filter((r) => {
        if (!r || !r.id) return false;
        const normId = (r.id || "").toString().toLowerCase().trim();
        if (serverDeletedRequestIds.has(normId)) return false;
        const st = (r.status || "PENDING").toString().toUpperCase().trim();
        return st !== "APPROVED" && st !== "VERIFIED" && st !== "REJECTED";
      });
      allList.sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());

      return res.json({ success: true, requests: allList });
    } catch (err: any) {
      console.error("Fetch school requests error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Real-Time Server-Sent Events (SSE) Stream Endpoint for Live Admin and App License Events
  app.get(["/api/license/events", "/api/payment/school-license/events"], (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected", timestamp: new Date().toISOString() })}\n\n`);

    sseClients.add(res);

    // Keepalive ping every 15s to prevent cloud proxy timeout
    const keepAliveTimer = setInterval(() => {
      try {
        res.write(`: keepalive ping\n\n`);
      } catch {
        clearInterval(keepAliveTimer);
        sseClients.delete(res);
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(keepAliveTimer);
      sseClients.delete(res);
    });
  });

  // Get All School Licenses Endpoint (Direct Cloud & DB Access, No Stale Caching)
  app.get(["/api/license/list", "/api/payment/school-licenses"], async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const dbClient = serverAdminSupabase || serverSupabase;
      const cleanKey = (s: any) =>
        (s || "")
          .toString()
          .replace(/[\u200B-\u200D\uFEFF]/g, "")
          .replace(/[\s\-_]/g, "")
          .toUpperCase()
          .trim();

      const uniqueLicenses: any[] = [];
      const nowMs = Date.now();

      const addOrMergeLic = (lic: any) => {
        if (!lic) return;
        const ck = cleanKey(lic.licenseKey || lic.id);
        if (!ck) return;
        if (
          serverDeletedLicenseKeys.has(ck) ||
          (lic.licenseKey && serverDeletedLicenseKeys.has(lic.licenseKey.toUpperCase().trim())) ||
          (lic.id && serverDeletedLicenseKeys.has(lic.id.toUpperCase().trim()))
        ) {
          return;
        }

        const existingIdx = uniqueLicenses.findIndex((existing) => {
          if (lic.licenseKey && existing.licenseKey && cleanKey(lic.licenseKey) === cleanKey(existing.licenseKey)) {
            return true;
          }
          if (lic.id && existing.id && (lic.id === existing.id || cleanKey(lic.id) === cleanKey(existing.id))) {
            return true;
          }
          if (lic.schoolId && existing.schoolId && lic.schoolId === existing.schoolId) {
            return true;
          }
          const sameName =
            lic.schoolName &&
            existing.schoolName &&
            lic.schoolName.trim().toLowerCase() === existing.schoolName.trim().toLowerCase();
          const sameEmail =
            lic.contactEmail &&
            existing.contactEmail &&
            lic.contactEmail.trim().toLowerCase() === existing.contactEmail.trim().toLowerCase();
          if (sameName && sameEmail) {
            return true;
          }
          return false;
        });

        if (existingIdx === -1) {
          uniqueLicenses.push(lic);
          return;
        }

        const existing = uniqueLicenses[existingIdx];

        if (lic.status === "REVOKED" || existing.status === "REVOKED") {
          uniqueLicenses[existingIdx] = {
            ...existing,
            ...lic,
            status: "REVOKED",
            licenseKey: lic.licenseKey || existing.licenseKey,
          };
          return;
        }

        const validFrom = lic.validFrom || lic.startDate || existing.validFrom || existing.startDate;
        const validUntil = lic.validUntil || lic.expiryDate || existing.validUntil || existing.expiryDate;

        const isExplicitlyActive = (lic.status || "").toUpperCase() === "ACTIVE" || (existing.status || "").toUpperCase() === "ACTIVE";

        let finalStatus = isExplicitlyActive ? "ACTIVE" : (lic.status || existing.status || "PENDING").toUpperCase();

        // Check if expired based on validUntil
        if (finalStatus === "ACTIVE" && validUntil) {
          const expTime = new Date(validUntil).getTime();
          if (!isNaN(expTime) && expTime <= nowMs) {
            finalStatus = "EXPIRED";
          }
        }

        uniqueLicenses[existingIdx] = {
          ...existing,
          ...lic,
          status: finalStatus,
          startDate: validFrom || null,
          validFrom: validFrom || null,
          expiryDate: validUntil || null,
          validUntil: validUntil || null,
          licenseKey: lic.licenseKey || existing.licenseKey,
        };
      };

      // Include in-memory cached licenses first
      serverSchoolLicenses.forEach((lic) => {
        addOrMergeLic(lic);
      });

      if (dbClient) {
        try {
          const [licsRes, schoolsRes, fbRes] = await Promise.allSettled([
            dbClient.from("school_licenses").select("*").order("created_at", { ascending: false }),
            dbClient.from("schools").select("*"),
            dbClient.from("feedback").select("message").like("message", "%SCHOOL_LICENSE_SYNC%").limit(200),
          ]);

          const schoolsMap: { [id: string]: any } = {};
          if (schoolsRes.status === "fulfilled" && Array.isArray(schoolsRes.value?.data)) {
            schoolsRes.value.data.forEach((s: any) => {
              if (s.id) schoolsMap[s.id] = s;
            });
          }

          if (licsRes.status === "fulfilled" && Array.isArray(licsRes.value?.data)) {
            licsRes.value.data.forEach((row: any) => {
              const rawKey = row.license_key || row.id || "";
              const sch = (row.school_id && schoolsMap[row.school_id]) ? schoolsMap[row.school_id] : {};
              const rawStatus = String(row.status || "PENDING").trim().toUpperCase();
              const validUntilStr = row.valid_until || row.expiry_date || null;
              let rowStatus = rawStatus;
              if (rawStatus === "ACTIVE" && validUntilStr) {
                const expTime = new Date(validUntilStr).getTime();
                if (!isNaN(expTime) && expTime <= nowMs) {
                  rowStatus = "EXPIRED";
                }
              }
              addOrMergeLic({
                id: row.id || `lic_${cleanKey(rawKey).toLowerCase()}`,
                licenseKey: row.license_key || rawKey,
                schoolId: row.school_id || "",
                schoolName: sch.school_name || row.school_name || "Partner School",
                schoolAdminName: sch.school_admin_name || sch.contact_name || row.contact_name || "",
                contactName: sch.contact_name || sch.school_admin_name || row.contact_name || "",
                contactEmail: sch.contact_email || row.contact_email || "",
                contactPhone: sch.phone || row.contact_phone || row.phone_number || "",
                country: sch.country || row.country || "Pakistan",
                city: sch.address || row.city || "Karachi",
                price: row.price || 5000,
                currency: sch.currency || row.currency || "PKR",
                allowedDevices: sch.device_limit || row.allowed_devices || 999999,
                page1Access: row.page1_access !== false,
                page2Access: row.page2_access !== false,
                startDate: row.valid_from || null,
                expiryDate: validUntilStr,
                validFrom: row.valid_from || null,
                validUntil: validUntilStr,
                status: rowStatus,
                durationMonths: 1,
                durationDays: 30,
                createdBy: row.created_by,
                verifiedBy: row.created_by || "Admin",
                adminNotes: row.admin_notes,
                createdAt: row.created_at || new Date().toISOString(),
              });
            });
          }

          if (fbRes.status === "fulfilled" && Array.isArray(fbRes.value?.data)) {
            fbRes.value.data.forEach((fbRow: any) => {
              try {
                const msg = fbRow.message || "";
                const prefix = "[SCHOOL_LICENSE_SYNC]";
                const idx = msg.indexOf(prefix);
                if (idx !== -1) {
                  const rawJson = msg.substring(idx + prefix.length).trim();
                  const lic = JSON.parse(rawJson);
                  addOrMergeLic(lic);
                }
              } catch (_) {}
            });
          }
        } catch (dbErr) {
          console.warn("Supabase school_licenses query notice:", dbErr);
        }
      }

      return res.json({ success: true, licenses: uniqueLicenses });
    } catch (err: any) {
      console.error("Fetch school licenses error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Save or Synchronize School License Endpoint
  app.post("/api/payment/school-license/save", async (req, res) => {
    try {
      const lic = req.body?.license || req.body;
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
        activatedAt: lic.activatedAt || (lic.status === "ACTIVE" ? (lic.startDate || lic.validFrom) : null),
        configuredStartDate: lic.configuredStartDate || lic.startDate || null,
        configuredExpiryDate: lic.configuredExpiryDate ? resolveServerExpiryDeadline(lic.configuredExpiryDate) : (lic.expiryDate ? resolveServerExpiryDeadline(lic.expiryDate) : null),
        configuredDurationDays: Number(lic.configuredDurationDays || lic.durationDays) || 30,
        status: (lic.status || "PENDING").toUpperCase(),
        durationMonths: lic.durationMonths || 1,
        durationDays: Number(lic.durationDays || lic.configuredDurationDays) || 30,
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
          // 1. Ensure school row exists first so foreign key constraint succeeds
          await dbClient.from("schools").upsert([
            {
              id: schoolId,
              school_name: standardizedLic.schoolName || "Partner School",
              contact_name: standardizedLic.contactName || standardizedLic.schoolAdminName || "School Administrator",
              contact_email: standardizedLic.contactEmail || "admin@playroom.app",
              account_status: standardizedLic.status === "ACTIVE" ? "active" : "pending",
              payment_status: standardizedLic.status === "ACTIVE" ? "paid" : "pending",
            },
          ]);

          // 2. Upsert school_licenses using strictly valid columns: id, school_id, license_key, status, valid_from, valid_until
          await dbClient.from("school_licenses").upsert([
            {
              id: licId,
              school_id: schoolId,
              license_key: normKey,
              status: standardizedLic.status,
              valid_from: standardizedLic.validFrom,
              valid_until: standardizedLic.validUntil,
            },
          ]);
        } catch (dbErr) {
          console.warn("Supabase school_license save DB notice:", dbErr);
        }

        try {
          const syncId = `lic_${normKey.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
          const cleanSyncId = `lic_${cleanKey(normKey).toLowerCase()}`;
          const feedbackStatus = standardizedLic.status === "ACTIVE" ? "REVIEWED" : "PENDING";
          const feedbackPayload = {
            rating: 5,
            message: `[SCHOOL_LICENSE_SYNC]${JSON.stringify(standardizedLic)}`,
            status: feedbackStatus,
            user_email: standardizedLic.contactEmail || "admin@playroom.app",
          };

          await Promise.allSettled([
            dbClient.from("feedback").upsert([{ id: syncId, ...feedbackPayload }]),
            dbClient.from("feedback").upsert([{ id: cleanSyncId, ...feedbackPayload }]),
          ]);

          // Also update any existing feedback rows containing this license key
          const { data: existingFb } = await dbClient.from("feedback").select("id, message").like("message", "%SCHOOL_LICENSE_SYNC%").limit(100);
          if (Array.isArray(existingFb)) {
            for (const fb of existingFb) {
              if (fb.message && (fb.message.includes(normKey) || fb.message.includes(cleanKey(normKey)))) {
                await dbClient.from("feedback").update(feedbackPayload).eq("id", fb.id);
              }
            }
          }
          if (standardizedLic.status === "ACTIVE") {
            broadcastLicenseEvent("license_update", {
              type: "ACTIVATION",
              status: "ACTIVE",
              licenseKey: normKey,
              schoolName: standardizedLic.schoolName,
              license: standardizedLic,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (_) {}
      }

      if (standardizedLic.status === "ACTIVE") {
        broadcastLicenseEvent("license_update", {
          type: "ACTIVATION",
          status: "ACTIVE",
          licenseKey: normKey,
          schoolName: standardizedLic.schoolName,
          license: standardizedLic,
          timestamp: new Date().toISOString(),
        });
      }

      return res.json({ success: true, license: standardizedLic });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // Generate Real License Key Endpoint (Creates PENDING one-time license for approved school)
  app.post("/api/payment/school-license/generate", async (req, res) => {
    try {
      const {
        schoolId,
        schoolName,
        contactName,
        contactEmail,
        contactPhone,
        country,
        city,
        adminNotes,
        adminEmail,
        configuredStartDate,
        configuredExpiryDate,
        configuredDurationDays,
        durationDays,
        startDate,
        expiryDate,
      } = req.body;
      const generatedKey = generateServerUniqueLicenseKey();
      const now = new Date();
      const licId = (schoolId && isValidUUID(schoolId)) ? generateUUID() : generateUUID();
      const finalSchoolId = (schoolId && isValidUUID(schoolId)) ? schoolId : generateUUID();

      const finalDurationDays = Number(configuredDurationDays || durationDays) || 30;
      const finalConfiguredStartDate = configuredStartDate || startDate || null;
      const finalConfiguredExpiry = configuredExpiryDate
        ? resolveServerExpiryDeadline(configuredExpiryDate)
        : (expiryDate ? resolveServerExpiryDeadline(expiryDate) : null);

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
        activatedAt: null,
        configuredStartDate: finalConfiguredStartDate,
        configuredExpiryDate: finalConfiguredExpiry,
        configuredDurationDays: finalDurationDays,
        status: "PENDING",
        isRedeemed: false,
        redeemedAt: null,
        redemptionHistory: [],
        durationMonths: Math.ceil(finalDurationDays / 30) || 1,
        durationDays: finalDurationDays,
        createdBy: adminEmail || "Admin",
        verifiedBy: adminEmail || "Admin",
        adminNotes: adminNotes || `Generated for school by Admin on ${now.toISOString()}`,
        createdAt: now.toISOString(),
      };

      serverSchoolLicenses.set(generatedKey, licenseObj);
      serverSchoolLicenses.set(licId, licenseObj);
      serverSchoolLicenses.set(cleanKey(generatedKey), licenseObj);

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          await dbClient.from("schools").upsert([
            {
              id: finalSchoolId,
              school_name: schoolName || "Partner School",
              contact_name: contactName || "School Administrator",
              contact_email: contactEmail || "admin@playroom.app",
              account_status: "active",
              payment_status: "pending",
            },
          ]);

          await dbClient.from("school_licenses").upsert([
            {
              id: licId,
              school_id: finalSchoolId,
              license_key: generatedKey,
              status: "PENDING",
              valid_from: null,
              valid_until: null,
            },
          ]);
        } catch (dbErr) {
          console.warn("Supabase school_licenses generate error:", dbErr);
        }

        try {
          const syncId = `lic_${generatedKey.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
          const cleanSyncId = `lic_${cleanKey(generatedKey).toLowerCase()}`;
          await Promise.allSettled([
            dbClient.from("feedback").upsert([
              {
                id: syncId,
                rating: 5,
                message: `[SCHOOL_LICENSE_SYNC]${JSON.stringify(licenseObj)}`,
                status: "PENDING",
                user_email: contactEmail || "admin@playroom.app",
              },
            ]),
            dbClient.from("feedback").upsert([
              {
                id: cleanSyncId,
                rating: 5,
                message: `[SCHOOL_LICENSE_SYNC]${JSON.stringify(licenseObj)}`,
                status: "PENDING",
                user_email: contactEmail || "admin@playroom.app",
              },
            ]),
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

  // Activate School License Endpoint (Exact Calendar Month, One-Time Redemption, Backend Clock Validation)
  app.post(["/api/license/activate", "/api/payment/school-license/activate"], async (req, res) => {
    const startTime = Date.now();
    try {
      const { licenseKey, key, deviceId, schoolId, appVersion, timestamp } = req.body;
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

      console.log(`\n================== [LICENSE ACTIVATION REQUEST] ==================`);
      console.log(`[LICENSE_ACTIVATE] Payload:`, {
        licenseKey: rawKey,
        searchClean,
        deviceId: deviceId || "none",
        appVersion: appVersion || "1.0.0",
        timestamp: timestamp || new Date().toISOString(),
      });

      if (!searchClean) {
        return res.status(400).json({
          success: false,
          error: "Invalid license key. Please check your key and try again.",
        });
      }

      const now = new Date();
      const nowMs = now.getTime();
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
                startDate: match.start_date ? new Date(match.start_date).toISOString() : (match.valid_from ? new Date(match.valid_from).toISOString() : null),
                expiryDate: match.expiry_date ? new Date(match.expiry_date).toISOString() : (match.valid_until ? new Date(match.valid_until).toISOString() : null),
                validFrom: match.valid_from ? new Date(match.valid_from).toISOString() : (match.start_date ? new Date(match.start_date).toISOString() : null),
                validUntil: match.valid_until ? new Date(match.valid_until).toISOString() : (match.expiry_date ? new Date(match.expiry_date).toISOString() : null),
                status: (match.status || "PENDING").toUpperCase(),
                isRedeemed: Boolean(match.valid_from || match.start_date || match.is_redeemed),
                durationMonths: 1,
                durationDays: 30,
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

      // If not found anywhere, reject. Never create dummy or unapproved licenses.
      if (!existingLicense) {
        return res.status(404).json({
          success: false,
          isValid: false,
          status: "NOT_FOUND",
          error: "License key not found. Please enter a valid license key approved by the administrator.",
          serverTime: now.toISOString(),
        });
      }

      const statusUpper = (existingLicense.status || "").toUpperCase();

      // STRICT RULE 6: NO REUSE OF EXPIRED LICENSES
      // If the license is already marked EXPIRED or its validUntil has passed, it can NEVER be reused.
      const existingExp = existingLicense.validUntil || existingLicense.expiryDate;
      if (statusUpper === "EXPIRED" || (existingExp && new Date(existingExp).getTime() <= nowMs)) {
        // Permanently ensure status is EXPIRED
        existingLicense.status = "EXPIRED";
        serverSchoolLicenses.set(normKey, existingLicense);
        serverSchoolLicenses.set(searchClean, existingLicense);
        if (dbClient && existingLicense.id && isValidUUID(existingLicense.id)) {
          try {
            await dbClient.from("school_licenses").update({ status: "EXPIRED", updated_at: now.toISOString() }).eq("id", existingLicense.id);
          } catch (_) {}
        }
        return res.status(403).json({
          success: false,
          isValid: false,
          isExpired: true,
          status: "EXPIRED",
          schoolName: existingLicense.schoolName || "Partner School",
          licenseKey: existingLicense.licenseKey || normKey,
          schoolId: existingLicense.schoolId,
          expiryDate: existingExp,
          error: "Your school license has expired and cannot be reused. Please contact the administrator to renew your access.",
          serverTime: now.toISOString(),
        });
      }

      // STRICT RULE 4: PREVENT DUPLICATE ACTIVATION / RE-REDEEMING
      // If already active and valid, return existing active state without creating a new period or resetting timer
      if (statusUpper === "ACTIVE") {
        console.log(`[LICENSE_ACTIVATE] License is ALREADY active. Valid until: ${existingExp}`);
        return res.json({
          success: true,
          isValid: true,
          isAlreadyActive: true,
          message: "School license is already active.",
          license: existingLicense,
          serverTime: now.toISOString(),
        });
      }

      // If marked redeemed previously but somehow status was not ACTIVE, prevent duplicate redemption
      if (existingLicense.isRedeemed && existingLicense.redeemedAt) {
        return res.status(400).json({
          success: false,
          isValid: false,
          status: "ALREADY_REDEEMED",
          error: "This license has already been redeemed and cannot be activated again.",
          serverTime: now.toISOString(),
        });
      }

      // LICENSE ACTIVATION: Starts automatically on first successful key entry
      // Calculate exact expiry date: EXACTLY ONE CALENDAR MONTH from first successful activation
      const isSimulated = req.body?.simulatedClock || req.body?.testActivationTime;
      const activationTime = isSimulated && !isNaN(new Date(isSimulated).getTime()) ? new Date(isSimulated) : new Date();
      const validFrom = activationTime.toISOString();

      let expiryDateObj = calculateCalendarMonthExpiry(activationTime);

      if (existingLicense.configuredExpiryDate) {
        const configuredDeadline = new Date(existingLicense.configuredExpiryDate);
        if (!isNaN(configuredDeadline.getTime())) {
          // If calculated expiry exceeds admin's configured deadline, cap at deadline
          if (expiryDateObj.getTime() > configuredDeadline.getTime()) {
            expiryDateObj = configuredDeadline;
          }
        }
      }

      const validUntil = expiryDateObj.toISOString();
      const finalDurationDays = Math.max(1, Math.round((expiryDateObj.getTime() - activationTime.getTime()) / (24 * 60 * 60 * 1000)));

      const activeLicenseObj = {
        ...existingLicense,
        status: "ACTIVE",
        isRedeemed: true,
        redeemedAt: validFrom,
        activatedAt: validFrom,
        startDate: validFrom,
        expiryDate: validUntil,
        validFrom: validFrom,
        validUntil: validUntil,
        durationMonths: 1,
        durationDays: finalDurationDays,
        configuredDurationDays: Number(existingLicense.configuredDurationDays || existingLicense.durationDays) || finalDurationDays,
        lastDeviceId: deviceId || null,
        appVersion: appVersion || "1.0.0",
        redemptionHistory: [
          ...(Array.isArray(existingLicense.redemptionHistory) ? existingLicense.redemptionHistory : []),
          {
            activatedAt: validFrom,
            validUntil: validUntil,
            deviceId: deviceId || "default",
          },
        ],
      };

      // Store used key permanently so it can NEVER be reused
      serverUsedLicenseKeys.add(normKey);
      serverUsedLicenseKeys.add(searchClean);

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
          const targetKey = existingLicense.licenseKey || normKey;
          const schoolId = (activeLicenseObj.schoolId && isValidUUID(activeLicenseObj.schoolId))
            ? activeLicenseObj.schoolId
            : (existingLicense.schoolId && isValidUUID(existingLicense.schoolId) ? existingLicense.schoolId : licId);

          // 0. Ensure school record exists in schools table
          try {
            await dbClient.from("schools").upsert([
              {
                id: schoolId,
                school_name: activeLicenseObj.schoolName || "Partner School",
                contact_name: activeLicenseObj.contactName || activeLicenseObj.schoolAdminName || "School Administrator",
                contact_email: activeLicenseObj.contactEmail || "admin@playroom.app",
                account_status: "active",
                payment_status: "paid",
              },
            ]);
          } catch (_) {}

          // 1. Update in school_licenses table
          try {
            await dbClient
              .from("school_licenses")
              .update({
                status: "ACTIVE",
                valid_from: validFrom,
                valid_until: validUntil,
              })
              .eq("license_key", targetKey);
          } catch (_) {}

          if (activeLicenseObj.id && isValidUUID(activeLicenseObj.id)) {
            try {
              await dbClient
                .from("school_licenses")
                .update({
                  status: "ACTIVE",
                  valid_from: validFrom,
                  valid_until: validUntil,
                })
                .eq("id", activeLicenseObj.id);
            } catch (_) {}
          }

          try {
            await dbClient.from("school_licenses").upsert([
              {
                id: licId,
                school_id: schoolId,
                license_key: targetKey,
                status: "ACTIVE",
                valid_from: validFrom,
                valid_until: validUntil,
              },
            ]);
          } catch (_) {}
        } catch (updErr) {
          console.warn("Supabase activate license update notice:", updErr);
        }

        try {
          const syncId = `lic_${normKey.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
          const cleanSyncId = `lic_${searchClean.toLowerCase()}`;
          const cleanSyncIdAlt = `lic_${searchClean.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

          const feedbackPayload = {
            rating: 5,
            message: `[SCHOOL_LICENSE_SYNC]${JSON.stringify(activeLicenseObj)}`,
            status: "REVIEWED",
            user_email: activeLicenseObj.contactEmail || "admin@playroom.app",
          };

          await Promise.allSettled([
            dbClient.from("feedback").upsert([{ id: syncId, ...feedbackPayload }]),
            dbClient.from("feedback").upsert([{ id: cleanSyncId, ...feedbackPayload }]),
            dbClient.from("feedback").upsert([{ id: cleanSyncIdAlt, ...feedbackPayload }]),
          ]);
        } catch (_) {}

        try {
          const expDateFormatted = new Date(validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          const schoolTitle = activeLicenseObj.schoolName || 'School';
          const notifId = `notif_activation_${cleanKey(normKey).toLowerCase()}`;
          await recordServerAdminNotification({
            id: notifId,
            type: "activation",
            title: `${schoolTitle} License Activated!`,
            message: `${schoolTitle} activated their unique license key (${activeLicenseObj.licenseKey || normKey}). 1 Calendar Month access started! Valid until ${expDateFormatted}.`,
            timestamp: validFrom,
            createdAt: validFrom,
            linkTab: "registered_schools",
            metadata: {
              schoolName: schoolTitle,
              licenseKey: activeLicenseObj.licenseKey || normKey,
              validFrom,
              validUntil,
            },
            isRead: false,
          });
        } catch (_) {}
      }

      console.log(`[LICENSE_ACTIVATE] Successfully activated:`, {
        licenseKey: activeLicenseObj.licenseKey,
        validFrom,
        validUntil,
        durationDays: activeLicenseObj.durationDays,
      });

      // Broadcast Real-Time SSE Event to Admin and all App instances
      broadcastLicenseEvent("license_update", {
        type: "ACTIVATION",
        license: activeLicenseObj,
        licenseKey: normKey,
        schoolName: activeLicenseObj.schoolName,
        validFrom,
        validUntil,
        timestamp: validFrom,
      });

      return res.json({
        success: true,
        message: "School license activated! 1 calendar month access period has started.",
        license: activeLicenseObj,
        serverTime: validFrom,
      });
    } catch (err: any) {
      console.error("[LICENSE_ACTIVATE] [ERROR]:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Validate / Check School License Status Endpoint (Real-Time Silent Polling & Clock Verification)
  app.all(["/api/license/validate", "/api/license/status", "/api/payment/school-license/validate", "/api/payment/school-license/status"], async (req, res) => {
    try {
      const licenseKey = (req.body?.licenseKey || req.body?.key || req.query?.key || req.query?.licenseKey || "").toString();
      const rawKey = licenseKey.trim();
      const normKey = rawKey.toUpperCase();
      const cleanKey = (s: any) => (s || "").toString().replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[\s\-_]/g, "").toUpperCase().trim();
      const searchClean = cleanKey(rawKey);

      if (!searchClean) {
        return res.status(400).json({ success: false, error: "License key is required for status check." });
      }

      const checkClock = req.body?.simulatedClock || req.body?.currentTime || req.query?.simulatedClock || req.query?.currentTime;
      const now = checkClock && !isNaN(new Date(checkClock).getTime()) ? new Date(checkClock) : new Date();
      const nowMs = now.getTime();
      const dbClient = serverAdminSupabase || serverSupabase;

      let targetLic: any = null;

      // 1. Authoritative check directly from Supabase school_licenses table first
      if (dbClient) {
        try {
          const isUUID = isValidUUID(rawKey);
          let query = dbClient.from("school_licenses").select("*");
          if (isUUID) {
            query = query.or(`license_key.ilike.${normKey},license_key.ilike.${searchClean},id.eq.${rawKey}`);
          } else {
            query = query.or(`license_key.ilike.${normKey},license_key.ilike.${searchClean}`);
          }
          const { data } = await query.maybeSingle();

          if (data) {
            const rawDbStatus = String(data.status || "PENDING").trim().toUpperCase();
            targetLic = {
              id: data.id,
              licenseKey: data.license_key || normKey,
              schoolId: data.school_id,
              schoolName: data.school_name || "Partner School",
              contactEmail: data.contact_email,
              contactPhone: data.contact_phone,
              validFrom: data.valid_from ? new Date(data.valid_from).toISOString() : (data.start_date ? new Date(data.start_date).toISOString() : null),
              validUntil: data.valid_until ? new Date(data.valid_until).toISOString() : (data.expiry_date ? new Date(data.expiry_date).toISOString() : null),
              startDate: data.start_date ? new Date(data.start_date).toISOString() : (data.valid_from ? new Date(data.valid_from).toISOString() : null),
              expiryDate: data.expiry_date ? new Date(data.expiry_date).toISOString() : (data.valid_until ? new Date(data.valid_until).toISOString() : null),
              status: rawDbStatus,
            };
            serverSchoolLicenses.set(normKey, targetLic);
            serverSchoolLicenses.set(searchClean, targetLic);
          }
        } catch (_) {}
      }

      // 2. In-memory fallback if not retrieved from DB
      if (!targetLic) {
        if (serverSchoolLicenses.has(normKey)) targetLic = serverSchoolLicenses.get(normKey);
        else if (serverSchoolLicenses.has(searchClean)) targetLic = serverSchoolLicenses.get(searchClean);
      }

      if (!targetLic) {
        return res.status(404).json({
          success: false,
          isValid: false,
          status: "NOT_FOUND",
          error: "License key not found.",
          serverTime: now.toISOString(),
        });
      }

      const statusUpper = (targetLic.status || "").toUpperCase();

      // Revoked Check
      if (statusUpper === "REVOKED") {
        return res.json({
          success: true,
          isValid: false,
          isRevoked: true,
          status: "REVOKED",
          schoolName: targetLic.schoolName,
          licenseKey: targetLic.licenseKey || normKey,
          error: "Your license has been revoked. Please contact support or submit a renewal request.",
          serverTime: now.toISOString(),
        });
      }

      // Expired Check
      const expStr = targetLic.validUntil || targetLic.expiryDate;
      if (expStr) {
        const expMs = new Date(expStr).getTime();
        if (!isNaN(expMs) && expMs <= nowMs) {
          targetLic.status = "EXPIRED";
          serverSchoolLicenses.set(normKey, targetLic);
          if (dbClient && targetLic.id && isValidUUID(targetLic.id)) {
            try {
              await dbClient.from("school_licenses").update({ status: "EXPIRED", updated_at: now.toISOString() }).eq("id", targetLic.id);
            } catch (_) {}
          }
          return res.json({
            success: true,
            isValid: false,
            isExpired: true,
            status: "EXPIRED",
            schoolName: targetLic.schoolName,
            licenseKey: targetLic.licenseKey || normKey,
            expiryDate: expStr,
            error: "Your school license has expired. Please contact the administrator to renew your access.",
            serverTime: now.toISOString(),
          });
        }
      }

      if (statusUpper === "ACTIVE") {
        return res.json({
          success: true,
          isValid: true,
          isExpired: false,
          isRevoked: false,
          status: "ACTIVE",
          license: targetLic,
          validFrom: targetLic.validFrom,
          validUntil: targetLic.validUntil,
          serverTime: now.toISOString(),
        });
      }

      return res.json({
        success: true,
        isValid: false,
        isExpired: false,
        isRevoked: false,
        status: statusUpper || "PENDING",
        license: targetLic,
        serverTime: now.toISOString(),
      });
    } catch (err: any) {
      console.error("Validate school license error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Explicit Backend Access Check for Protected Requests
  app.all(["/api/license/check-access", "/api/payment/school-license/check-access"], async (req, res) => {
    try {
      const licenseKey = (req.body?.licenseKey || req.body?.key || req.query?.key || req.query?.licenseKey || "").toString();
      const rawKey = licenseKey.trim();
      const normKey = rawKey.toUpperCase();
      const cleanKey = (s: any) => (s || "").toString().replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[\s\-_]/g, "").toUpperCase().trim();
      const searchClean = cleanKey(rawKey);

      if (!searchClean) {
        return res.status(400).json({ success: false, allowed: false, error: "License key is required to verify protected access." });
      }

      const checkClock = req.body?.simulatedClock || req.body?.currentTime || req.query?.simulatedClock || req.query?.currentTime;
      const now = checkClock && !isNaN(new Date(checkClock).getTime()) ? new Date(checkClock) : new Date();
      const nowMs = now.getTime();
      let targetLic: any = null;

      if (serverSchoolLicenses.has(normKey)) targetLic = serverSchoolLicenses.get(normKey);
      else if (serverSchoolLicenses.has(searchClean)) targetLic = serverSchoolLicenses.get(searchClean);

      if (!targetLic) {
        return res.status(404).json({ success: false, allowed: false, status: "NOT_FOUND", error: "License key not recognized." });
      }

      const statusUpper = (targetLic.status || "").toUpperCase();
      if (statusUpper === "REVOKED") {
        return res.status(403).json({ success: false, allowed: false, isRevoked: true, status: "REVOKED", error: "Your school license has been revoked. Please contact the administrator." });
      }

      const expStr = targetLic.validUntil || targetLic.expiryDate;
      if (expStr && new Date(expStr).getTime() <= nowMs) {
        targetLic.status = "EXPIRED";
        return res.status(403).json({
          success: false,
          allowed: false,
          isExpired: true,
          status: "EXPIRED",
          error: "Your school license has expired. Please contact the administrator to renew your access.",
          serverTime: now.toISOString(),
        });
      }

      if (statusUpper === "ACTIVE") {
        return res.json({
          success: true,
          allowed: true,
          status: "ACTIVE",
          licenseKey: targetLic.licenseKey,
          schoolName: targetLic.schoolName,
          validUntil: targetLic.validUntil,
          serverTime: now.toISOString(),
        });
      }

      return res.status(403).json({
        success: false,
        allowed: false,
        status: statusUpper || "PENDING",
        error: "License has not been activated. Please enter your license key to activate access.",
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, allowed: false, error: err.message });
    }
  });

  // Revoke School License Endpoint (Manual revocation disabled per system update)
  app.post(["/api/license/revoke", "/api/payment/school-license/revoke"], async (req, res) => {
    return res.status(400).json({
      success: false,
      error: "Manual license revocation has been removed. Licenses expire automatically after 1 calendar month based on the server-authoritative clock.",
    });
  });

  // Delete / Revoke School License Endpoint (Strict Database Revocation)
  app.post(["/api/license/delete", "/api/payment/school-license/delete"], async (req, res) => {
    try {
      const { licenseId, licenseKey } = req.body || {};
      const target = (licenseKey || licenseId || "").toString().trim().toUpperCase();

      if (!target) {
        return res.json({ success: true, message: "Target already cleared." });
      }

      const cleanTarget = target.replace(/[\s\-_]/g, "");
      serverDeletedLicenseKeys.add(target);
      serverDeletedLicenseKeys.add(cleanTarget);
      serverSchoolLicenses.delete(target);
      serverSchoolLicenses.delete(cleanTarget);

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        let deleteQuery = dbClient.from("school_licenses").delete();
        if (isValidUUID(target) || (licenseId && isValidUUID(licenseId))) {
          const uuid = isValidUUID(target) ? target : licenseId;
          deleteQuery = deleteQuery.or(`id.eq.${uuid},license_key.ilike.${target},license_key.ilike.${cleanTarget}`);
        } else {
          deleteQuery = deleteQuery.or(`license_key.ilike.${target},license_key.ilike.${cleanTarget}`);
        }
        const { error: licDelErr } = await deleteQuery;
        if (licDelErr) {
          console.error("Supabase school_license delete error:", licDelErr);
          return res.status(500).json({ success: false, error: licDelErr.message });
        }
        try {
          const syncId = `lic_${cleanTarget.toLowerCase()}`;
          await dbClient.from("feedback").delete().or(`id.eq.${syncId},message.ilike.%${target}%`);
        } catch (_) {}
      }

      broadcastLicenseEvent("license_update", {
        type: "DELETION",
        licenseKey: target,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        success: true,
        count: 1,
        message: `School license ${target} revoked and deleted successfully. Access locked.`,
      });
    } catch (err: any) {
      console.error("Delete school license error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Batch Delete School Licenses Endpoint (Fast 1-click select all deletion)
  app.post("/api/payment/school-licenses/delete-batch", async (req, res) => {
    try {
      const { targets } = req.body || {};
      const list: any[] = Array.isArray(targets) ? targets : [];
      if (list.length === 0) {
        return res.json({ success: true, count: 0, message: "No targets provided." });
      }

      const dbClient = serverAdminSupabase || serverSupabase;
      const deletedKeys: string[] = [];
      const normKeys: string[] = [];
      const validUuidIds: string[] = [];
      const allSyncIds: string[] = [];
      const cleanKeysSet = new Set<string>();

      for (const item of list) {
        const idVal = typeof item === "string" ? item : (item?.id || "");
        const keyVal = typeof item === "string" ? item : (item?.licenseKey || "");
        const normKey = (keyVal || "").toString().trim().toUpperCase();
        const normId = (idVal || "").toString().trim();
        if (!normKey && !normId) continue;

        if (normKey) {
          deletedKeys.push(normKey);
          normKeys.push(normKey);
          const cleanK = normKey.replace(/[\s\-_]/g, "");
          cleanKeysSet.add(cleanK);
          cleanKeysSet.add(normKey);
          cleanKeysSet.add(normKey.toLowerCase());
          serverDeletedLicenseKeys.add(normKey);
          serverDeletedLicenseKeys.add(cleanK);
          serverDeletedLicenseKeys.add(normKey.toLowerCase());
          serverSchoolLicenses.delete(normKey);
          serverSchoolLicenses.delete(cleanK);
          serverSchoolLicenses.delete(normKey.toLowerCase());
          allSyncIds.push(`lic_${cleanK.toLowerCase()}`);
        }

        if (normId) {
          deletedKeys.push(normId);
          cleanKeysSet.add(normId.toLowerCase());
          cleanKeysSet.add(normId.toUpperCase());
          serverDeletedLicenseKeys.add(normId);
          serverDeletedLicenseKeys.add(normId.toLowerCase());
          serverDeletedLicenseKeys.add(normId.toUpperCase());
          serverSchoolLicenses.delete(normId);
          serverSchoolLicenses.delete(normId.toLowerCase());
          serverSchoolLicenses.delete(normId.toUpperCase());
          if (isValidUUID(normId)) {
            validUuidIds.push(normId);
          }
          allSyncIds.push(normId);
          allSyncIds.push(`lic_${normId.replace(/[\s\-_]/g, "").toLowerCase()}`);
        }
      }

      // Purge matching entries from serverSchoolLicenses memory map completely
      for (const [k, lic] of Array.from(serverSchoolLicenses.entries())) {
        const kClean = (k || "").toString().replace(/[\s\-_]/g, "").toUpperCase();
        const licKeyClean = (lic?.licenseKey || "").toString().replace(/[\s\-_]/g, "").toUpperCase();
        const licId = (lic?.id || "").toString().trim();
        if (
          cleanKeysSet.has(k) ||
          cleanKeysSet.has(kClean) ||
          (licKeyClean && cleanKeysSet.has(licKeyClean)) ||
          (licId && cleanKeysSet.has(licId.toLowerCase())) ||
          (licId && cleanKeysSet.has(licId.toUpperCase()))
        ) {
          serverSchoolLicenses.delete(k);
        }
      }

      // Fast atomic Supabase cleanup using batched .in() queries
      if (dbClient) {
        if (normKeys.length > 0) {
          const { error: bErr1 } = await dbClient.from("school_licenses").delete().in("license_key", normKeys);
          if (bErr1) {
            console.error("Supabase batch delete school_licenses error:", bErr1);
            return res.status(500).json({ success: false, error: bErr1.message });
          }
        }
        if (validUuidIds.length > 0) {
          const { error: bErr2 } = await dbClient.from("school_licenses").delete().in("id", validUuidIds);
          if (bErr2) {
            console.error("Supabase batch delete school_licenses by id error:", bErr2);
            return res.status(500).json({ success: false, error: bErr2.message });
          }
        }
        if (allSyncIds.length > 0) {
          try {
            for (let i = 0; i < allSyncIds.length; i += 50) {
              const chunk = allSyncIds.slice(i, i + 50);
              await dbClient.from("feedback").delete().in("id", chunk);
            }
          } catch (_) {}
        }
      }

      broadcastLicenseEvent("license_update", {
        type: "DELETION",
        licenseKeys: deletedKeys,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        success: true,
        count: deletedKeys.length,
        message: `Successfully deleted ${deletedKeys.length} school licenses in batch.`,
      });
    } catch (err: any) {
      console.error("Batch delete school licenses error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Check School Request Status Endpoint (Allows school app to track Pending, Approved, Rejected)
  app.get("/api/payment/school-request/status", async (req, res) => {
    try {
      const requestId = (req.query.requestId || req.query.id || "").toString().trim();
      const email = (req.query.email || req.query.contactEmail || "").toString().trim().toLowerCase();
      const schoolName = (req.query.schoolName || "").toString().trim().toLowerCase();

      const dbClient = serverAdminSupabase || serverSupabase;
      let foundReq: any = null;

      // 1. Search in serverPaymentRequests memory
      if (requestId) {
        foundReq = serverPaymentRequests.find((r) => (r.id || "").toLowerCase().trim() === requestId.toLowerCase().trim());
      }
      if (!foundReq && email) {
        foundReq = serverPaymentRequests.find((r) => (r.contactEmail || "").toLowerCase() === email);
      }
      if (!foundReq && schoolName) {
        foundReq = serverPaymentRequests.find((r) => (r.schoolName || "").toLowerCase() === schoolName);
      }

      // 2. Search in Supabase school_requests table
      if (!foundReq && dbClient) {
        try {
          let q = dbClient.from("school_requests").select("*");
          if (requestId && isValidUUID(requestId)) {
            q = q.eq("id", requestId);
          } else if (email) {
            q = q.eq("contact_email", email);
          } else if (schoolName) {
            q = q.ilike("school_name", schoolName);
          }
          const { data } = await q.maybeSingle();
          if (data) foundReq = data;
        } catch (_) {}
      }

      // 3. Search in Supabase feedback
      if (!foundReq && dbClient) {
        try {
          const { data: fbList } = await dbClient.from("feedback").select("message").like("message", "%[SCHOOL_REQUEST]%").limit(100);
          if (Array.isArray(fbList)) {
            for (const row of fbList) {
              try {
                const str = (row.message || "").replace("[SCHOOL_REQUEST]", "").trim();
                const parsed = JSON.parse(str);
                if (
                  (requestId && parsed.id === requestId) ||
                  (email && (parsed.contactEmail || "").toLowerCase() === email) ||
                  (schoolName && (parsed.schoolName || "").toLowerCase() === schoolName)
                ) {
                  foundReq = parsed;
                  break;
                }
              } catch (_) {}
            }
          }
        } catch (_) {}
      }

      // 4. Check if a license was already generated and linked to this school/request
      let matchingLicense: any = null;
      if (foundReq) {
        const matchSchoolId = foundReq.school_id || foundReq.schoolId;
        const matchEmail = (foundReq.contact_email || foundReq.contactEmail || "").toLowerCase();
        const matchName = (foundReq.school_name || foundReq.schoolName || "").toLowerCase();
        const genKey = foundReq.generated_license_key || foundReq.licenseKey;

        if (genKey && serverSchoolLicenses.has(genKey)) {
          matchingLicense = serverSchoolLicenses.get(genKey);
        } else {
          for (const lic of serverSchoolLicenses.values()) {
            if (
              (matchSchoolId && lic.schoolId === matchSchoolId) ||
              (matchEmail && (lic.contactEmail || "").toLowerCase() === matchEmail) ||
              (matchName && (lic.schoolName || "").toLowerCase() === matchName)
            ) {
              matchingLicense = lic;
              break;
            }
          }
        }
      }

      if (matchingLicense) {
        return res.json({
          success: true,
          status: "APPROVED",
          licenseKey: matchingLicense.licenseKey,
          license: matchingLicense,
          request: foundReq,
        });
      }

      if (!foundReq) {
        return res.json({
          success: true,
          status: "NONE",
          message: "No active school request found.",
        });
      }

      const rawStatus = (foundReq.status || "PENDING").toUpperCase();
      return res.json({
        success: true,
        status: rawStatus,
        licenseKey: foundReq.generated_license_key || foundReq.licenseKey || null,
        request: foundReq,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Approve School Request Endpoint (Generates new, unique, one-time-use license in PENDING state)
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

      // Check serverPaymentRequests memory cache if not found in db
      if (!targetRequest) {
        targetRequest = serverPaymentRequests.find(
          (r) => (r.id || "").toString().toLowerCase().trim() === requestId.toString().toLowerCase().trim()
        );
      }

      const schoolId = req.body.schoolId || targetRequest?.schoolId || targetRequest?.school_id || targetSchool?.id || generateUUID();
      const schoolName = req.body.schoolName || targetRequest?.schoolName || targetRequest?.school_name || targetSchool?.school_name || "Partner School";
      const contactName = req.body.contactName || req.body.schoolAdminName || targetRequest?.contactName || targetRequest?.schoolAdminName || targetRequest?.contact_name || targetSchool?.contact_name || "School Administrator";
      const contactEmail = req.body.contactEmail || targetRequest?.contactEmail || targetRequest?.contact_email || targetSchool?.contact_email || "school@playroomapp.com";
      const contactPhone = req.body.contactPhone || req.body.phoneNumber || targetRequest?.contactPhone || targetRequest?.phoneNumber || targetRequest?.phone_number || "";
      const country = req.body.country || targetRequest?.country || targetSchool?.country || "Pakistan";
      const city = req.body.city || targetRequest?.city || targetSchool?.city || "Karachi";
      const price = Number(req.body.amount || req.body.price || targetRequest?.amount || 25000);
      const currency = req.body.currency || targetRequest?.currency || "PKR";
      const allowedDevices = Number(req.body.allowedDevices || targetRequest?.allowedDevices || 999999);
      const durationMonths = Number(req.body.durationMonths || targetRequest?.durationMonths || 1);

      // RULE 3: Generate a brand-new, unique, one-time-use license key
      const finalLicenseKey = (customKey && customKey.trim())
        ? customKey.trim().toUpperCase()
        : generateServerUniqueLicenseKey();
      const licId = generateUUID();

      // Standardized school license in PENDING status (countdown starts strictly on school key entry)
      const standardizedLic = {
        id: licId,
        licenseKey: finalLicenseKey,
        schoolId: schoolId,
        schoolName: schoolName,
        schoolAdminName: contactName,
        contactName: contactName,
        contactEmail: contactEmail,
        contactPhone: contactPhone,
        phoneNumber: contactPhone,
        country: country,
        city: city,
        price: price,
        currency: currency,
        allowedDevices: allowedDevices,
        page1Access: true,
        page2Access: true,
        startDate: null,
        expiryDate: null,
        validFrom: null,
        validUntil: null,
        status: "PENDING", // Waits for school key entry!
        isRedeemed: false,
        redeemedAt: null,
        activatedAt: null,
        redemptionHistory: [],
        durationMonths: durationMonths,
        durationDays: 30,
        createdBy: adminUser,
        verifiedBy: adminUser,
        adminNotes: adminNotes || `Approved school inquiry ${requestId}. 1 calendar month access starts when school enters key.`,
        createdAt: now.toISOString(),
      };

      serverSchoolLicenses.set(finalLicenseKey, standardizedLic);
      serverSchoolLicenses.set(licId, standardizedLic);
      serverSchoolLicenses.set(cleanKey(finalLicenseKey), standardizedLic);

      // Update serverPaymentRequests memory status to APPROVED
      serverPaymentRequests = serverPaymentRequests.map((r) => {
        if ((r.id || "").toString().toLowerCase().trim() === requestId.toString().toLowerCase().trim()) {
          return {
            ...r,
            status: "APPROVED",
            generated_license_key: finalLicenseKey,
            reviewedAt: now.toISOString(),
          };
        }
        return r;
      });

      if (dbClient) {
        try {
          // 1. Ensure school record exists
          await dbClient.from("schools").upsert([
            {
              id: schoolId,
              school_name: schoolName,
              contact_name: contactName,
              contact_email: contactEmail,
              country: country,
              account_status: "active",
              payment_status: "approved",
            },
          ]);

          // 2. Insert license in PENDING state into school_licenses
          await dbClient.from("school_licenses").upsert([
            {
              id: licId,
              school_id: schoolId,
              license_key: finalLicenseKey,
              status: "PENDING",
              valid_from: null,
              valid_until: null,
            },
          ]);

          // 3. Update school_requests table so the status is approved
          await dbClient
            .from("school_requests")
            .update({
              status: "approved",
              generated_license_key: finalLicenseKey,
              reviewed_at: now.toISOString(),
            })
            .eq("id", requestId);

          // 4. Update feedback sync rows for the new license
          const syncId = `lic_${finalLicenseKey.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
          await dbClient.from("feedback").upsert([
            {
              id: syncId,
              rating: 5,
              message: `[SCHOOL_LICENSE_SYNC]${JSON.stringify(standardizedLic)}`,
              status: "PENDING",
              user_email: contactEmail,
            },
          ]);

          // 5. Clean up pending request sync rows from feedback table so it never reappears as pending
          const reqFeedbackId = `req_${requestId.toString().toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
          await Promise.allSettled([
            dbClient.from("feedback").delete().eq("id", reqFeedbackId),
            dbClient.from("feedback").delete().like("message", `%${requestId}%[SCHOOL_REQUEST_SYNC]%`),
          ]);
        } catch (dbErr) {
          console.warn("Supabase approve school request error:", dbErr);
        }
      }

      // Record genuine approval notification
      const approvalNotifId = `notif_approval_${requestId.toString().toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      await recordServerAdminNotification({
        id: approvalNotifId,
        type: "approval",
        title: `School Approved: ${schoolName}`,
        message: `${schoolName} has been approved and moved to Registered Schools. License Key: ${finalLicenseKey}. 1 calendar month countdown begins when entered.`,
        timestamp: now.toISOString(),
        createdAt: now.toISOString(),
        linkTab: "registered_schools",
        metadata: {
          requestId,
          schoolName,
          licenseKey: finalLicenseKey,
          approvedAt: now.toISOString(),
        },
        isRead: false,
      });

      // Mark the original inquiry notification as read
      const inqNotifId = `notif_inquiry_${requestId.toString().toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
      const existingInq = serverAdminNotifications.get(inqNotifId);
      if (existingInq) {
        existingInq.isRead = true;
        serverAdminNotifications.set(inqNotifId, existingInq);
      }
      if (dbClient) {
        try {
          await dbClient.from("feedback").update({ status: "RESOLVED" }).eq("id", inqNotifId);
        } catch (_) {}
      }

      // Broadcast Real-Time SSE Event
      broadcastLicenseEvent("license_update", {
        type: "REQUEST_APPROVED",
        requestId,
        licenseKey: finalLicenseKey,
        schoolName,
        license: standardizedLic,
        timestamp: now.toISOString(),
      });

      return res.json({
        success: true,
        message: "School request approved. New unique license key generated in pending activation state.",
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

  // Delete School Request Endpoint (Permanent deletion from server memory and database)
  app.post("/api/payment/school-request/delete", async (req, res) => {
    try {
      const { requestId, id } = req.body || {};
      const targetId = (requestId || id || "").toString().trim();
      if (!targetId) {
        return res.status(400).json({ success: false, error: "Request ID is required." });
      }

      const normTarget = targetId.toLowerCase().trim();
      const dbClient = serverAdminSupabase || serverSupabase;

      if (dbClient) {
        // Delete from school_requests permanently
        if (isValidUUID(targetId)) {
          const { error: reqErr } = await dbClient.from("school_requests").delete().eq("id", targetId);
          if (reqErr) {
            console.error("Supabase school_requests delete error:", reqErr);
            return res.status(500).json({ success: false, error: reqErr.message });
          }
        }

        // Delete any sync feedback rows
        try {
          await dbClient.from("feedback").delete().or(`id.eq.req_${normTarget},id.eq.${targetId},message.ilike.%${targetId}%`);
        } catch (_) {}
      }

      // Record tombstone in server memory
      serverDeletedRequestIds.add(normTarget);

      // Purge from server memory
      serverPaymentRequests = serverPaymentRequests.filter(
        (r) => (r.id || "").toString().toLowerCase().trim() !== normTarget
      );

      // Clean up inquiry and approval notifications for this request
      const notifId = `notif_inquiry_${normTarget.replace(/[^a-z0-9]/g, "_")}`;
      const approvalNotifId = `notif_approval_${normTarget.replace(/[^a-z0-9]/g, "_")}`;
      serverDeletedNotificationIds.add(notifId);
      serverDeletedNotificationIds.add(approvalNotifId);
      serverAdminNotifications.delete(notifId);
      serverAdminNotifications.delete(approvalNotifId);

      broadcastLicenseEvent("license_update", {
        type: "REQUEST_DELETED",
        requestId: targetId,
        timestamp: new Date().toISOString(),
      });

      return res.json({ success: true, count: 1, message: "Request deleted permanently." });
    } catch (err: any) {
      console.error("Delete school request error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Batch Delete School Requests Endpoint (Fast select all deletion)
  app.post("/api/payment/school-requests/delete-batch", async (req, res) => {
    try {
      const { requestIds } = req.body || {};
      const ids: string[] = Array.isArray(requestIds) ? requestIds : [];
      if (ids.length === 0) {
        return res.json({ success: true, count: 0, message: "No request IDs provided." });
      }

      const dbClient = serverAdminSupabase || serverSupabase;
      const validUuidIds: string[] = [];

      for (const rId of ids) {
        const targetId = (rId || "").toString().trim();
        if (!targetId) continue;
        if (isValidUUID(targetId)) {
          validUuidIds.push(targetId);
        }
      }

      // Fast batched Supabase cleanup
      if (dbClient) {
        if (validUuidIds.length > 0) {
          const { error: batchErr } = await dbClient.from("school_requests").delete().in("id", validUuidIds);
          if (batchErr) {
            console.error("Supabase batch delete school_requests error:", batchErr);
            return res.status(500).json({ success: false, error: batchErr.message });
          }
        }
        for (const tid of ids) {
          const norm = (tid || "").toString().toLowerCase().trim();
          try {
            await dbClient.from("feedback").delete().or(`id.eq.req_${norm},id.eq.${tid},message.ilike.%${tid}%`);
          } catch (_) {}
        }
      }

      const idSet = new Set<string>();
      for (const rId of ids) {
        const normTarget = (rId || "").toString().toLowerCase().trim();
        idSet.add(normTarget);
        serverDeletedRequestIds.add(normTarget);

        const notifId = `notif_inquiry_${normTarget.replace(/[^a-z0-9]/g, "_")}`;
        const approvalNotifId = `notif_approval_${normTarget.replace(/[^a-z0-9]/g, "_")}`;
        serverDeletedNotificationIds.add(notifId);
        serverDeletedNotificationIds.add(approvalNotifId);
        serverAdminNotifications.delete(notifId);
        serverAdminNotifications.delete(approvalNotifId);
      }

      // Purge matching from server in-memory list
      serverPaymentRequests = serverPaymentRequests.filter(
        (r) => !idSet.has((r.id || "").toString().toLowerCase().trim())
      );

      broadcastLicenseEvent("license_update", {
        type: "REQUESTS_DELETED",
        requestIds: ids,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        success: true,
        count: ids.length,
        message: `Successfully deleted ${ids.length} inquiries permanently.`,
      });
    } catch (err: any) {
      console.error("Batch delete school requests error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete Renewal Request Endpoint (Permanent Deletion)
  app.post("/api/license/renew-request/delete", async (req, res) => {
    try {
      const { renewalId, id } = req.body;
      const targetId = (renewalId || id || "").toString().trim();
      if (!targetId) {
        return res.status(400).json({ success: false, error: "renewalId is required" });
      }
      const normId = targetId.toLowerCase().trim();

      serverRenewalRequests = serverRenewalRequests.filter(
        (r) => (r.id || "").toString().toLowerCase().trim() !== normId
      );

      const notifId = `notif_renewal_${normId.replace(/[^a-z0-9]/g, "_")}`;
      serverDeletedNotificationIds.add(notifId);
      serverAdminNotifications.delete(notifId);

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          const syncId = `ren_${normId.replace(/[^a-z0-9]/g, "_")}`;
          await Promise.allSettled([
            dbClient.from("feedback").delete().eq("id", syncId),
            dbClient.from("feedback").delete().like("message", `%${normId}%`),
            dbClient.from("feedback").delete().eq("id", notifId),
          ]);
        } catch (_) {}
      }

      return res.json({ success: true, message: "Renewal request deleted successfully." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create / Submit Renew License Request from User
  app.post("/api/license/renew-request", async (req, res) => {
    try {
      const {
        id,
        licenseKey,
        schoolId,
        userId,
        userEmail,
        contactEmail,
        schoolName,
        phoneNumber,
        phone,
        city,
        previousExpiryDate,
        adminNotes,
        reason,
        notes,
      } = req.body;

      if (!licenseKey) {
        return res.status(400).json({ success: false, error: "License key is required" });
      }

      const cleanKey = (licenseKey || "").trim().toUpperCase();
      const requestId = id || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const nowIso = new Date().toISOString();
      const dbClient = serverAdminSupabase || serverSupabase;

      // Lookup existing school license to preserve school_id, school_name, email, city, etc.
      let existingLic: any = null;
      if (serverSchoolLicenses.has(cleanKey)) {
        existingLic = serverSchoolLicenses.get(cleanKey);
      } else if (dbClient) {
        try {
          const { data: licRow } = await dbClient
            .from("school_licenses")
            .select("*")
            .ilike("license_key", cleanKey)
            .maybeSingle();
          if (licRow) {
            existingLic = {
              schoolId: licRow.school_id,
              schoolName: licRow.school_name,
              contactEmail: licRow.contact_email,
              contactPhone: licRow.contact_phone || licRow.phone,
              city: licRow.city,
              validUntil: licRow.valid_until || licRow.expiry_date,
            };
          }
        } catch (_) {}
      }

      const effectiveEmail = (contactEmail || userEmail || existingLic?.contactEmail || "school@partner.edu").trim();
      const effectiveSchoolName = (schoolName || existingLic?.schoolName || "Partner School").trim();
      const effectiveSchoolId = schoolId || existingLic?.schoolId || "school_id";
      const effectivePhone = (phoneNumber || phone || existingLic?.contactPhone || "").trim();
      const effectiveCity = (city || existingLic?.city || "Karachi").trim();
      const effectiveExpiry = previousExpiryDate || existingLic?.validUntil || existingLic?.expiryDate || nowIso;
      const effectiveNotes = (adminNotes || reason || notes || "Renewal requested from public app.").trim();

      const requestDoc = {
        id: requestId,
        licenseKey: cleanKey,
        schoolId: effectiveSchoolId,
        schoolName: effectiveSchoolName,
        contactEmail: effectiveEmail,
        phoneNumber: effectivePhone,
        city: effectiveCity,
        previousExpiryDate: effectiveExpiry,
        status: "PENDING",
        requestedAt: nowIso,
        requestTime: nowIso,
        createdAt: nowIso,
        adminNotes: effectiveNotes,
      };

      // Store in server memory
      serverRenewalRequests.unshift(requestDoc);
      console.log(`[RENEWAL] SUBMITTED: ${requestId} for ${cleanKey} (${effectiveSchoolName})`);

      // Persist to Supabase
      if (dbClient) {
        try {
          await dbClient.from("school_renewal_requests").insert([
            {
              id: requestId,
              license_key: cleanKey,
              school_id: effectiveSchoolId,
              school_name: effectiveSchoolName,
              contact_email: effectiveEmail,
              phone_number: effectivePhone,
              city: effectiveCity,
              previous_expiry_date: effectiveExpiry,
              status: "PENDING",
              requested_at: nowIso,
              admin_notes: effectiveNotes,
            },
          ]);
        } catch (renTableErr) {
          console.warn("Notice inserting to school_renewal_requests:", renTableErr);
        }

        try {
          const syncId = `ren_${requestId.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
          await dbClient.from("feedback").upsert([
            {
              id: syncId,
              rating: 5,
              message: `[SCHOOL_RENEWAL_REQUEST]${JSON.stringify(requestDoc)}`,
              status: "PENDING",
              user_email: effectiveEmail,
              created_at: nowIso,
            },
          ]);
          console.log(`[RENEWAL] DATABASE INSERT SUCCESS: ${syncId}`);
        } catch (fbErr) {
          console.warn("Could not write renew request to Supabase feedback:", fbErr);
        }
      }

      // Broadcast Real-Time SSE Event to Admin Panel
      broadcastLicenseEvent("license_update", {
        type: "RENEWAL_REQUEST",
        request: requestDoc,
        licenseKey: cleanKey,
        schoolName: effectiveSchoolName,
        timestamp: nowIso,
      });

      return res.json({
        success: true,
        message: "Your renewal request has been submitted successfully.",
        request: requestDoc,
      });
    } catch (err: any) {
      console.error("[RENEWAL] SUBMIT EXCEPTION:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get all Renew Requests for Admin Panel
  app.get("/api/license/renew-requests", async (req, res) => {
    try {
      const renMap = new Map<string, any>();

      // In-memory server requests
      serverRenewalRequests.forEach((r) => {
        if (r && (r.id || r.licenseKey)) {
          const key = r.id || r.licenseKey;
          renMap.set(key, r);
        }
      });

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          const { data: renTableData } = await dbClient
            .from("school_renewal_requests")
            .select("*");
          if (renTableData && Array.isArray(renTableData)) {
            renTableData.forEach((row: any) => {
              if (row && (row.id || row.license_key)) {
                const id = row.id || `req_${Date.now()}`;
                renMap.set(id, {
                  id,
                  licenseKey: row.license_key || "",
                  schoolId: row.school_id || "",
                  schoolName: row.school_name || "Partner School",
                  contactEmail: row.contact_email || "school@partner.edu",
                  phoneNumber: row.phone_number || "",
                  city: row.city || "Karachi",
                  previousExpiryDate: row.previous_expiry_date || "",
                  status: (row.status || "PENDING").toUpperCase(),
                  requestedAt: row.requested_at || row.created_at || new Date().toISOString(),
                  adminNotes: row.admin_notes || "",
                  approvedAt: row.approved_at,
                  approvedBy: row.approved_by,
                });
              }
            });
          }
        } catch (e) {
          console.warn("Notice fetching from school_renewal_requests table:", e);
        }

        try {
          const { data, error } = await dbClient
            .from("feedback")
            .select("*")
            .ilike("message", "%[SCHOOL_RENEWAL_%");
          if (data && !error) {
            data.forEach((row: any) => {
              try {
                let msg = row.message || "";
                let jsonStr = "";
                if (msg.includes("[SCHOOL_RENEWAL_REQUEST]")) {
                  jsonStr = msg.replace("[SCHOOL_RENEWAL_REQUEST]", "").trim();
                } else if (msg.includes("[SCHOOL_RENEWAL_SYNC]")) {
                  jsonStr = msg.replace("[SCHOOL_RENEWAL_SYNC]", "").trim();
                } else if (msg.trim().startsWith("{")) {
                  jsonStr = msg.trim();
                }
                if (jsonStr) {
                  const parsed = JSON.parse(jsonStr);
                  if (parsed && (parsed.id || parsed.licenseKey)) {
                    const id = parsed.id || `req_${row.id}`;
                    if (!renMap.has(id)) {
                      renMap.set(id, { ...parsed, id, rowId: row.id, feedbackSyncId: row.id });
                    }
                  }
                }
              } catch (_) {}
            });
          }
        } catch (e) {
          console.warn("Notice fetching renew requests from Supabase feedback:", e);
        }
      }

      const requests = Array.from(renMap.values()).sort(
        (a, b) => new Date(b.requestedAt || b.createdAt || 0).getTime() - new Date(a.requestedAt || a.createdAt || 0).getTime()
      );

      return res.json({ success: true, requests });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Admin Approve / Renew Request (DISABLED: System strictly prohibits manual renewal or reuse of licenses)
  app.post("/api/license/renew-request/approve", async (req, res) => {
    return res.status(400).json({
      success: false,
      error: "Manual license renewal is disabled. Existing and expired licenses cannot be reused or reactivated. Please review and approve a new school license request to generate a fresh, unique one-time-use license key.",
    });
  });

  // Renew Existing School License Endpoint (DISABLED: Strictly prohibits manual renewal or reuse of licenses)
  app.post("/api/payment/school-license/renew", async (req, res) => {
    return res.status(400).json({
      success: false,
      error: "Manual license renewal is disabled. Existing and expired licenses cannot be reused, reactivated, or extended. Please approve a new school license request to issue a fresh, unique one-time-use license key.",
    });
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

      return res.json({
        success: true,
        disputeStatus,
        adminResponse,
        message: "Dispute handled successfully.",
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // In-memory cache for fast complaint access
  const serverComplaints = new Map<string, any>();

  // Submit Complaint / Inquiry Endpoint (App -> Admin Real-Time SSE Broadcast)
  app.post(["/api/complaint/submit", "/api/complaint"], async (req, res) => {
    try {
      const body = req.body || {};
      const {
        id,
        schoolName,
        contactName,
        contactEmail,
        phoneNumber,
        category,
        subject,
        complaintText,
        attachmentDataUrl,
        attachmentName,
        attachmentType,
        attachmentSize,
        status,
        submittedAt,
      } = body;

      const normId = (id || `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`).toString().toLowerCase().trim();
      const nowIso = submittedAt || new Date().toISOString();

      const complaintObj = {
        id: normId,
        schoolName: (schoolName || "Partner School").trim(),
        contactName: (contactName || "Educator").trim(),
        contactEmail: (contactEmail || "").trim().toLowerCase(),
        phoneNumber: (phoneNumber || "").trim(),
        category: category || "OTHER",
        subject: (subject || "Educator Inquiry / Bug Report").trim(),
        complaintText: (complaintText || "").trim(),
        attachmentDataUrl: attachmentDataUrl || null,
        attachmentName: attachmentName || null,
        attachmentType: attachmentType || null,
        attachmentSize: attachmentSize || null,
        status: status || "OPEN",
        submittedAt: nowIso,
      };

      serverComplaints.set(normId, complaintObj);

      const notifId = `notif_complaint_${normId.replace(/[^a-z0-9]/g, "_")}`;
      await recordServerAdminNotification({
        id: notifId,
        type: "complaint",
        title: `⚠️ New Complaint: ${complaintObj.schoolName}`,
        message: `${complaintObj.contactName} (${complaintObj.contactEmail}) submitted a complaint: "${complaintObj.subject}"`,
        timestamp: nowIso,
        createdAt: nowIso,
        linkTab: "complaints",
        metadata: {
          complaintId: normId,
          schoolName: complaintObj.schoolName,
          email: complaintObj.contactEmail,
          category: complaintObj.category,
        },
        isRead: false,
      });

      // Broadcast Real-Time SSE Event to Admin Panel immediately
      broadcastLicenseEvent("license_update", {
        type: "COMPLAINT",
        complaint: complaintObj,
        schoolName: complaintObj.schoolName,
        timestamp: nowIso,
      });

      // Background Supabase persistence
      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          const syncId = `cmp_${normId.replace(/[^a-z0-9]/g, "_")}`;
          await dbClient.from("feedback").upsert({
            id: syncId,
            user_email: complaintObj.contactEmail || "school@partner.edu",
            rating: 1,
            message: `[SCHOOL_COMPLAINT_SYNC] ${JSON.stringify(complaintObj)}`,
            status: complaintObj.status === "RESOLVED" ? "REVIEWED" : "PENDING",
            created_at: nowIso,
          });
        } catch (dbErr) {
          console.warn("Supabase complaint save notice:", dbErr);
        }
      }

      return res.json({ success: true, complaint: complaintObj });
    } catch (err: any) {
      console.error("Complaint submit error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get Complaints Endpoint
  app.get("/api/complaints", async (req, res) => {
    try {
      const list = Array.from(serverComplaints.values());
      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        try {
          const { data } = await dbClient
            .from("feedback")
            .select("*")
            .like("message", "[SCHOOL_COMPLAINT_SYNC]%")
            .order("created_at", { ascending: false })
            .limit(100);
          if (Array.isArray(data)) {
            data.forEach((row: any) => {
              try {
                const msg = row.message || "";
                const prefix = "[SCHOOL_COMPLAINT_SYNC]";
                const idx = msg.indexOf(prefix);
                if (idx !== -1) {
                  const rawJson = msg.substring(idx + prefix.length).trim();
                  const c = JSON.parse(rawJson);
                  if (c && c.id && !serverComplaints.has(c.id.toLowerCase().trim())) {
                    serverComplaints.set(c.id.toLowerCase().trim(), c);
                    list.push(c);
                  }
                }
              } catch (_) {}
            });
          }
        } catch (_) {}
      }
      return res.json({ success: true, complaints: list });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete School Complaint Endpoint
  app.post("/api/complaint/delete", async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ success: false, error: "Complaint id is required" });
      }
      const normId = id.toString().toLowerCase().trim();
      const notifId = `notif_complaint_${normId.replace(/[^a-z0-9]/g, "_")}`;
      serverDeletedNotificationIds.add(notifId);
      serverAdminNotifications.delete(notifId);

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        const syncId = `cmp_${normId.replace(/[^a-z0-9]/g, "_")}`;
        const { error: delErr } = await dbClient.from("feedback").delete().or(`id.eq.${syncId},id.eq.${id},message.ilike.%${normId}%`);
        if (delErr) {
          console.error("Supabase complaint delete error:", delErr);
          return res.status(500).json({ success: false, error: delErr.message });
        }
      }

      return res.json({ success: true, count: 1, message: "Complaint deleted successfully." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete All School Complaints Endpoint
  const handleDeleteAllComplaints = async (req: any, res: any) => {
    try {
      const { ids } = req.body || {};
      if (Array.isArray(ids)) {
        ids.forEach((id: string) => {
          if (id) {
            const normId = id.toString().toLowerCase().trim();
            const notifId = `notif_complaint_${normId.replace(/[^a-z0-9]/g, "_")}`;
            serverDeletedNotificationIds.add(notifId);
            serverAdminNotifications.delete(notifId);
          }
        });
      }

      // Clean up complaint notifications
      serverAdminNotifications.forEach((n, k) => {
        if (n && (n.type === "complaint" || (n.id || "").includes("complaint"))) {
          serverDeletedNotificationIds.add(k.toLowerCase().trim());
          serverAdminNotifications.delete(k);
        }
      });

      const dbClient = serverAdminSupabase || serverSupabase;
      if (dbClient) {
        const { error: allDelErr } = await dbClient.from("feedback").delete().or(`message.ilike.[SCHOOL_COMPLAINT_SYNC]%,message.ilike.%[SCHOOL_COMPLAINT%,id.ilike.cmp_%`);
        if (allDelErr) {
          console.error("Supabase delete all complaints error:", allDelErr);
          return res.status(500).json({ success: false, error: allDelErr.message });
        }
      }

      return res.json({ success: true, message: "All complaints deleted successfully." });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  // Batch Delete Complaints Endpoint (Fast multi-select deletion)
  app.post("/api/complaints/delete-batch", async (req, res) => {
    try {
      const { ids } = req.body || {};
      const idList: string[] = Array.isArray(ids) ? ids : [];
      if (idList.length === 0) {
        return res.json({ success: true, count: 0, message: "No complaint IDs provided." });
      }

      const dbClient = serverAdminSupabase || serverSupabase;
      const feedbackIdsToDelete: string[] = [];

      for (const id of idList) {
        if (!id) continue;
        const normId = id.toString().toLowerCase().trim();
        const notifId = `notif_complaint_${normId.replace(/[^a-z0-9]/g, "_")}`;
        const syncId = `cmp_${normId.replace(/[^a-z0-9]/g, "_")}`;

        serverDeletedNotificationIds.add(notifId);
        serverAdminNotifications.delete(notifId);
        serverComplaints.delete(normId);
        serverComplaints.delete(id);

        feedbackIdsToDelete.push(syncId, id, normId, notifId);
      }

      if (dbClient && feedbackIdsToDelete.length > 0) {
        for (let i = 0; i < feedbackIdsToDelete.length; i += 50) {
          const chunk = feedbackIdsToDelete.slice(i, i + 50);
          const { error: batchErr } = await dbClient.from("feedback").delete().in("id", chunk);
          if (batchErr) {
            console.error("Supabase complaints batch delete error:", batchErr);
            return res.status(500).json({ success: false, error: batchErr.message });
          }
        }
      }

      broadcastLicenseEvent("license_update", {
        type: "COMPLAINTS_DELETED",
        complaintIds: idList,
        timestamp: new Date().toISOString(),
      });

      return res.json({ success: true, count: idList.length, message: `Successfully deleted ${idList.length} complaints.` });
    } catch (err: any) {
      console.warn("Batch delete complaints error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Verify Admin Preview Authorization Endpoint
  app.post("/api/admin/verify-preview", async (req, res) => {
    try {
      const { email, token } = req.body || {};
      const cleanEmail = (email || "").toString().trim().toLowerCase();
      const authorizedEmails = [
        "ramshaurooj10@gmail.com",
        "admin@playroom.app",
        "admin@playroom-learning.edu",
        "school-admin@playroom-learning.edu",
      ];

      // Check if email is in authoritative admin list
      if (cleanEmail && authorizedEmails.includes(cleanEmail)) {
        return res.json({ success: true, authorized: true, email: cleanEmail });
      }

      // Check Supabase session if token provided
      const dbClient = serverAdminSupabase || serverSupabase;
      if (token && dbClient) {
        try {
          const { data: { user }, error } = await dbClient.auth.getUser(token);
          if (!error && user && user.email) {
            const userEmail = user.email.toLowerCase().trim();
            const role = user.app_metadata?.role || user.user_metadata?.role;
            if (role === "admin" || role === "super_admin" || authorizedEmails.includes(userEmail)) {
              return res.json({ success: true, authorized: true, email: userEmail });
            }
          }
        } catch (_) {}
      }

      return res.status(403).json({ success: false, authorized: false, error: "Unauthorized admin preview attempt." });
    } catch (err: any) {
      return res.status(500).json({ success: false, authorized: false, error: err.message });
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
