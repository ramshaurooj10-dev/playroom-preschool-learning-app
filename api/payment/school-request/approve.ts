import type { IncomingMessage, ServerResponse } from "http";
import crypto from "crypto";
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

function generateServerUniqueLicenseKey(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const part = (len: number) => {
    let r = "";
    for (let i = 0; i < len; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return r;
  };
  return `SCH-${part(4)}-${part(4)}-${part(4)}`;
}

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
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const finalDay = Math.min(startDay, lastDayOfTargetMonth);

  return new Date(Date.UTC(targetYear, targetMonth, finalDay, startHours, startMinutes, startSeconds, startMs));
}

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
    const deadline = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    return deadline.toISOString();
  }
  const d = new Date(str);
  return !isNaN(d.getTime()) ? d.toISOString() : null;
}

export default async function handler(req: any, res: any) {
  // CORS configuration
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: "Method not allowed. Use POST." }));
    return;
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_) {}
    }
    if (!body && typeof req.read === "function") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        body = JSON.parse(raw);
      } catch (_) {
        body = {};
      }
    }

    const {
      requestId,
      customKey,
      adminEmail,
      adminNotes,
      configuredDurationDays,
      durationDays,
      configuredStartDate,
      configuredExpiryDate,
      startDate,
      expiryDate,
    } = body || {};

    if (!requestId) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: false, error: "requestId is required" }));
      return;
    }

    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://puwfsjefjzljbxklljwk.supabase.co";
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

    const dbClient = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
    const now = new Date();
    const adminUser = adminEmail || "school-admin@playroom-learning.edu";

    let targetRequest: any = null;
    let targetSchool: any = null;

    if (dbClient && isValidUUID(requestId)) {
      const { data: reqData } = await dbClient
        .from("school_requests")
        .select("*")
        .eq("id", requestId.trim())
        .maybeSingle();

      if (reqData) {
        targetRequest = reqData;
        if (reqData.school_id && isValidUUID(reqData.school_id)) {
          const { data: schData } = await dbClient
            .from("schools")
            .select("*")
            .eq("id", reqData.school_id)
            .maybeSingle();
          targetSchool = schData;
        }
      }
    }

    // Parse structured message if contact fields aren't direct
    let parsedSchoolName = "";
    let parsedAdminName = "";
    let parsedEmail = "";
    let parsedPhone = "";
    let parsedCountry = "";
    let parsedCity = "";

    const rawMsg = targetRequest?.message || "";
    if (rawMsg.includes("School:") || rawMsg.includes("Email:")) {
      const mSchool = rawMsg.match(/School:\s*([^|\n]+)/i);
      const mAdmin = rawMsg.match(/Admin:\s*([^|\n]+)/i);
      const mEmail = rawMsg.match(/Email:\s*([^|\n]+)/i);
      const mPhone = rawMsg.match(/Phone:\s*([^|\n]+)/i);
      const mCountry = rawMsg.match(/Country:\s*([^|\n]+)/i);
      const mCity = rawMsg.match(/City:\s*([^|\n]+)/i);

      if (mSchool) parsedSchoolName = mSchool[1].trim();
      if (mAdmin) parsedAdminName = mAdmin[1].trim();
      if (mEmail) parsedEmail = mEmail[1].trim();
      if (mPhone) parsedPhone = mPhone[1].trim();
      if (mCountry) parsedCountry = mCountry[1].trim();
      if (mCity) parsedCity = mCity[1].trim();
    }

    // Check for idempotency: if already approved, return existing license
    const isAlreadyApproved = (targetRequest?.status || "").toString().toLowerCase() === "approved";
    if (isAlreadyApproved && dbClient) {
      const targetSchoolId = targetRequest.school_id || targetSchool?.id;
      if (targetSchoolId) {
        const { data: existingLic } = await dbClient
          .from("school_licenses")
          .select("*")
          .eq("school_id", targetSchoolId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingLic) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              success: true,
              alreadyApproved: true,
              message: "School request has already been approved.",
              licenseKey: existingLic.license_key,
              license: {
                id: existingLic.id,
                licenseKey: existingLic.license_key,
                schoolId: existingLic.school_id,
                schoolName: targetSchool?.school_name || body.schoolName || parsedSchoolName || "Partner School",
                contactName: targetSchool?.contact_name || body.contactName || parsedAdminName || "School Administrator",
                contactEmail: targetSchool?.contact_email || body.contactEmail || parsedEmail || "school@playroomapp.com",
                status: existingLic.status,
                startDate: existingLic.valid_from,
                expiryDate: existingLic.valid_until,
                validFrom: existingLic.valid_from,
                validUntil: existingLic.valid_until,
              },
            })
          );
          return;
        }
      }
    }

    const rawSchoolId = targetRequest?.school_id || targetSchool?.id || body.schoolId;
    const schoolId = (rawSchoolId && isValidUUID(rawSchoolId)) ? rawSchoolId : generateUUID();
    const schoolName = body.schoolName || targetSchool?.school_name || targetRequest?.school_name || parsedSchoolName || "Partner School";
    const contactName = body.contactName || body.schoolAdminName || targetSchool?.contact_name || parsedAdminName || "School Administrator";
    const contactEmail = body.contactEmail || targetSchool?.contact_email || parsedEmail || "school@playroomapp.com";
    const contactPhone = body.contactPhone || body.phoneNumber || parsedPhone || "";
    const country = body.country || targetSchool?.country || parsedCountry || "Pakistan";
    const city = body.city || parsedCity || "Karachi";
    const price = Number(body.amount || body.price || 25000);
    const currency = body.currency || targetSchool?.currency || "PKR";
    const allowedDevices = Number(body.allowedDevices || 999999);
    const durationMonths = Number(body.durationMonths || 1);

    // Duration & Expiry Calculation
    const finalStart = (configuredStartDate || startDate) ? new Date(configuredStartDate || startDate) : now;
    let finalExpiry: Date;
    if (configuredExpiryDate || expiryDate) {
      const parsedDeadline = resolveServerExpiryDeadline(configuredExpiryDate || expiryDate);
      finalExpiry = parsedDeadline ? new Date(parsedDeadline) : new Date(finalStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    } else {
      const days = Number(configuredDurationDays || durationDays || targetRequest?.configuredDurationDays) || 30;
      if (days === 30) {
        finalExpiry = calculateCalendarMonthExpiry(finalStart);
      } else {
        finalExpiry = new Date(finalStart.getTime() + days * 24 * 60 * 60 * 1000);
      }
    }

    if (finalExpiry.getTime() <= finalStart.getTime()) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: false, error: "License Expiry Date must be later than the Start Date." }));
      return;
    }

    const effectiveDurationDays = Math.max(1, Math.round((finalExpiry.getTime() - finalStart.getTime()) / (24 * 60 * 60 * 1000)));
    const initialValidFrom = finalStart.toISOString();
    const initialValidUntil = finalExpiry.toISOString();
    const finalLicenseKey = (customKey && customKey.trim()) ? customKey.trim().toUpperCase() : generateServerUniqueLicenseKey();
    const licId = generateUUID();

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
      startDate: initialValidFrom,
      expiryDate: initialValidUntil,
      validFrom: initialValidFrom,
      validUntil: initialValidUntil,
      configuredStartDate: finalStart.toISOString(),
      configuredExpiryDate: finalExpiry.toISOString(),
      configuredDurationDays: effectiveDurationDays,
      status: "ACTIVE",
      isRedeemed: false,
      redeemedAt: null,
      activatedAt: null,
      redemptionHistory: [],
      durationMonths: Math.ceil(effectiveDurationDays / 30) || durationMonths || 1,
      durationDays: effectiveDurationDays,
      createdBy: adminUser,
      verifiedBy: adminUser,
      adminNotes: adminNotes || `Approved school inquiry ${requestId}. Key: ${finalLicenseKey}`,
      createdAt: now.toISOString(),
    };

    if (dbClient) {
      // 1. School Record
      const { error: schoolUpsertErr } = await dbClient.from("schools").upsert([
        {
          id: schoolId,
          school_name: schoolName,
          contact_name: contactName,
          contact_email: contactEmail,
          country: country,
          currency: currency,
          account_status: "active",
          payment_status: "paid",
        },
      ]);

      if (schoolUpsertErr) {
        console.error("Vercel API school upsert error:", schoolUpsertErr);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          success: false,
          error: `Database error creating school record: ${schoolUpsertErr.message}`,
        }));
        return;
      }

      // 2. School License Record
      const { error: licUpsertErr } = await dbClient.from("school_licenses").upsert([
        {
          id: licId,
          school_id: schoolId,
          license_key: finalLicenseKey,
          status: "ACTIVE",
          valid_from: initialValidFrom,
          valid_until: initialValidUntil,
          created_by: (adminUser && isValidUUID(adminUser)) ? adminUser : null,
          notes: adminNotes || `Approved school inquiry ${requestId}. Key: ${finalLicenseKey}`,
        },
      ]);

      if (licUpsertErr) {
        console.error("Vercel API school_licenses upsert error:", licUpsertErr);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          success: false,
          error: `Database error saving school license: ${licUpsertErr.message}`,
        }));
        return;
      }

      // 3. Update Request Status
      const reqIdToUpdate = isValidUUID(requestId) ? requestId.trim() : (isValidUUID(targetRequest?.id) ? targetRequest.id : null);
      if (reqIdToUpdate) {
        const { error: reqUpdErr } = await dbClient
          .from("school_requests")
          .update({
            school_id: schoolId,
            status: "approved",
            admin_reply: adminNotes || `Approved. License key: ${finalLicenseKey}`,
            replied_at: now.toISOString(),
          })
          .eq("id", reqIdToUpdate);

        if (reqUpdErr) {
          console.error("Vercel API school_requests update error:", reqUpdErr);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            success: false,
            error: `Database error updating request status: ${reqUpdErr.message}`,
          }));
          return;
        }
      }

      // 4. Client Real-Time Sync via feedback table
      try {
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

        const reqFeedbackId = `req_${requestId.toString().toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
        await Promise.allSettled([
          dbClient.from("feedback").delete().eq("id", reqFeedbackId),
          dbClient.from("feedback").delete().like("message", `%${requestId}%[SCHOOL_REQUEST_SYNC]%`),
        ]);
      } catch (_) {}
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: true,
        message: "School request approved successfully. License generated and persisted in database.",
        licenseKey: finalLicenseKey,
        license: standardizedLic,
      })
    );
  } catch (err: any) {
    console.error("Vercel API handler exception:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        error: err?.message || "Internal server error processing approval.",
      })
    );
  }
}
