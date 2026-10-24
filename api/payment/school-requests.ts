import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://puwfsjefjzljbxklljwk.supabase.co";
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

    const dbClient = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
    let requests: any[] = [];

    if (dbClient) {
      const { data, error } = await dbClient
        .from("school_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        requests = data.map((row: any) => {
          let schoolName = row.school_name || "Partner School";
          let adminName = row.school_admin_name || row.contact_name || "School Administrator";
          let email = row.contact_email || "";
          let phone = row.contact_phone || row.phone_number || "";
          let country = row.country || "Pakistan";
          let city = row.city || "Karachi";
          let rawMsg = row.school_message || row.message || "";

          if (rawMsg.includes("School:") && rawMsg.includes("Email:")) {
            const mSchool = rawMsg.match(/School:\s*([^|\n]+)/i);
            const mAdmin = rawMsg.match(/Admin:\s*([^|\n]+)/i);
            const mEmail = rawMsg.match(/Email:\s*([^|\n]+)/i);
            const mPhone = rawMsg.match(/Phone:\s*([^|\n]+)/i);
            const mCountry = rawMsg.match(/Country:\s*([^|\n]+)/i);
            const mCity = rawMsg.match(/City:\s*([^|\n]+)/i);

            if (mSchool) schoolName = mSchool[1].trim();
            if (mAdmin) adminName = mAdmin[1].trim();
            if (mEmail) email = mEmail[1].trim();
            if (mPhone) phone = mPhone[1].trim();
            if (mCountry) country = mCountry[1].trim();
            if (mCity) city = mCity[1].trim();
          }

          return {
            id: row.id,
            schoolId: row.school_id || "",
            schoolName,
            schoolAdminName: adminName,
            contactName: adminName,
            contactEmail: email,
            contactPhone: phone,
            phoneNumber: phone,
            country,
            city,
            subject: row.subject || "School License Inquiry",
            schoolMessage: rawMsg,
            notes: rawMsg,
            status: (row.status || "PENDING").toUpperCase(),
            submittedAt: row.created_at || new Date().toISOString(),
            amount: 25000,
            currency: "PKR",
            allowedDevices: 999999,
            durationMonths: 1,
            configuredDurationDays: 30,
            adminNotes: row.admin_reply,
          };
        });
      }
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true, requests }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: err?.message || "Failed to load requests" }));
  }
}
