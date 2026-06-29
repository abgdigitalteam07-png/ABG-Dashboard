import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DASHBOARD_URL  = Deno.env.get("DASHBOARD_URL") ?? "https://brand-performance-hub.lovable.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Determine which schedules are due right now.
    // Called by pg_cron every hour — we check if the current UTC hour + day_of_week match.
    const now = new Date();
    const currentDow  = now.getUTCDay();    // 0=Sun … 6=Sat
    const currentHour = now.getUTCHours();  // 0–23

    // Allow manual trigger with specific schedule id
    let schedules: any[] = [];
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    if (body.schedule_id) {
      const { data } = await supabase
        .from("email_schedules")
        .select("*")
        .eq("id", body.schedule_id)
        .eq("is_active", true);
      schedules = data ?? [];
    } else {
      const { data } = await supabase
        .from("email_schedules")
        .select("*")
        .eq("is_active", true)
        .eq("day_of_week", currentDow)
        .eq("send_hour_utc", currentHour);
      schedules = data ?? [];
    }

    if (!schedules.length) {
      return new Response(JSON.stringify({ sent: 0, message: "No schedules due" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = await Promise.all(schedules.map(async (schedule) => {
      const { brand_name, recipients, date_range_days, id } = schedule;

      if (!recipients?.length) return { id, skipped: true, reason: "no recipients" };

      const dateTo   = new Date();
      const dateFrom = new Date(dateTo.getTime() - date_range_days * 24 * 60 * 60 * 1000);
      const fmtDate  = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const periodLabel = date_range_days === 7 ? "Last 7 days"
        : date_range_days === 30 ? "Last 30 days"
        : date_range_days === 90 ? "Last 90 days"
        : `Last ${date_range_days} days`;

      const dashboardLink = `${DASHBOARD_URL}?brand=${encodeURIComponent(brand_name)}&tab=summary`;

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="background:#0f172a;border-radius:8px 8px 0 0;padding:24px 32px;text-align:center;">
      <p style="margin:0;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.18em;color:#C0272D;">Performance Report Brief</p>
      <h1 style="margin:8px 0 0;font-size:26px;font-weight:900;color:#ffffff;">${brand_name}</h1>
      <p style="margin:6px 0 0;font-size:12px;color:#94a3b8;">${fmtDate(dateFrom)} – ${fmtDate(dateTo)} · ${periodLabel}</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;padding:28px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
        Your <strong>${brand_name}</strong> performance report for <strong>${periodLabel}</strong> is ready.
        Open the dashboard to view the full Summary Report including traffic, search visibility, and AI-generated recommendations.
      </p>

      <div style="text-align:center;margin:28px 0;">
        <a href="${dashboardLink}" style="display:inline-block;background:#C0272D;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.02em;">
          View Summary Report →
        </a>
      </div>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
        ${brand_name} · ${fmtDate(dateFrom)} – ${fmtDate(dateTo)} · GSC data lags 48–72 hours · Confidential<br>
        To manage report schedules, visit the <a href="${DASHBOARD_URL}/admin" style="color:#C0272D;">Admin Panel</a>.
      </p>
    </div>
    <div style="background:#f4f4f5;border-radius:0 0 8px 8px;padding:12px 32px;border:1px solid #e5e7eb;border-top:none;">
      <p style="margin:0;font-size:10px;color:#9ca3af;text-align:center;">ABG Brand Performance Hub · American Bath Group</p>
    </div>
  </div>
</body>
</html>`;

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "ABG Performance <reports@mail.americanbathgroup.com>",
          to: recipients,
          subject: `${brand_name} Performance Report — ${fmtDate(dateFrom)} to ${fmtDate(dateTo)}`,
          html,
        }),
      });

      const emailData = await emailRes.json();

      if (!emailRes.ok) {
        return { id, ok: false, error: emailData };
      }

      // Update last_sent_at
      await supabase.from("email_schedules").update({ last_sent_at: new Date().toISOString() }).eq("id", id);
      return { id, ok: true, recipients: recipients.length, resendId: emailData.id };
    }));

    return new Response(JSON.stringify({ sent: results.filter((r) => r.ok).length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
