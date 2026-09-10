import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GMAIL_USER         = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const DASHBOARD_URL      = Deno.env.get("DASHBOARD_URL") ?? "https://wholesaledigitaldashboard.lovable.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { recipients, brand_name, date_range_days, pdf_url } = await req.json();

    if (!Array.isArray(recipients) || !recipients.length) {
      return new Response(JSON.stringify({ error: "recipients is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!brand_name) {
      return new Response(JSON.stringify({ error: "brand_name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!pdf_url) {
      return new Response(JSON.stringify({ error: "pdf_url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const days = date_range_days ?? 7;
    const dateTo   = new Date();
    const dateFrom = new Date(dateTo.getTime() - days * 24 * 60 * 60 * 1000);
    const fmtDate  = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const periodLabel = days === 7 ? "Last 7 days"
      : days === 14 ? "Last 14 days"
      : days === 30 ? "Last 30 days"
      : days === 60 ? "Last 60 days"
      : days === 90 ? "Last 90 days"
      : `Last ${days} days`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

    <div style="text-align:center;margin-bottom:12px;">
      <span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;padding:4px 12px;border-radius:999px;">Test Email — Schedule Preview</span>
    </div>

    <!-- Header -->
    <div style="background:#0f172a;border-radius:8px 8px 0 0;padding:24px 32px;text-align:center;">
      <p style="margin:0;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.18em;color:#C0272D;">Performance Report Brief</p>
      <h1 style="margin:8px 0 0;font-size:26px;font-weight:900;color:#ffffff;">${brand_name}</h1>
      <p style="margin:6px 0 0;font-size:12px;color:#94a3b8;">${fmtDate(dateFrom)} – ${fmtDate(dateTo)} · ${periodLabel}</p>
    </div>

    <!-- Body -->
    <div style="background:#ffffff;padding:28px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
        This is a <strong>test email</strong> confirming your scheduled report for <strong>${brand_name}</strong> is configured correctly.
        When the real schedule runs, recipients will receive this same layout with live data for <strong>${periodLabel}</strong>.
      </p>

      <div style="text-align:center;margin:28px 0;">
        <a href="${pdf_url}" style="display:inline-block;background:#C0272D;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.02em;">
          Download Report →
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

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    });

    try {
      await client.send({
        from: `ABG Performance <${GMAIL_USER}>`,
        to: recipients,
        subject: `[TEST] ${brand_name} Performance Report — ${fmtDate(dateFrom)} to ${fmtDate(dateTo)}`,
        html,
        content: "auto",
      });
    } finally {
      await client.close();
    }

    return new Response(JSON.stringify({ ok: true, recipients: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
