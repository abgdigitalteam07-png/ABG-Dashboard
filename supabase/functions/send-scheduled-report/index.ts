import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { jsPDF } from "https://esm.sh/jspdf@4.2.1";

const GMAIL_USER         = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DASHBOARD_URL  = Deno.env.get("DASHBOARD_URL") ?? "https://wholesaledigitaldashboard.lovable.app";
const APIFY_API_TOKEN = Deno.env.get("APIFY_API_TOKEN") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Server-to-server call into another Edge Function — same pattern the
// frontend's api-client.ts uses, just with the service role key since
// there's no user session here.
async function callFunction(name: string, body: unknown): Promise<any | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.error) return null;
    return data;
  } catch {
    return null;
  }
}

// ── Primary PDF path: headless-render the real dashboard ─────────────────
// A Deno Edge Function has no DOM/canvas, so it can't run the chart-
// screenshot code the "Download Report" button uses in the browser
// (src/components/SummaryTab.tsx). Instead this calls an Apify actor that
// drives a real headless Chromium against /print/summary (src/pages/
// PrintSummary.tsx), which renders the exact same SummaryPrintView
// component with live data, then prints it — same visual output as the
// browser-side export, no reimplementation of the report layout.
async function renderReportPdfViaApify(printUrl: string): Promise<Uint8Array | null> {
  if (!APIFY_API_TOKEN) return null;
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/reinventingai~url-to-pdf/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: printUrl,
          printBackground: true,
          paperWidth: "8.27in",
          paperHeight: "11.69in",
          marginTop: "0in",
          marginBottom: "0in",
          marginLeft: "0in",
          marginRight: "0in",
          // Waits for src/pages/PrintSummary.tsx to finish fetching live
          // data and let Recharts paint before Chromium prints the page.
          waitForSelector: "[data-print-ready]",
          waitDelay: "2s",
        }),
      }
    );
    if (!runRes.ok) {
      console.error("Apify url-to-pdf run failed:", runRes.status, await runRes.text());
      return null;
    }
    const items = await runRes.json();
    const fileUrl = items?.[0]?.output?.url;
    if (!fileUrl) return null;

    const pdfRes = await fetch(`${fileUrl}?token=${APIFY_API_TOKEN}`);
    if (!pdfRes.ok) return null;
    return new Uint8Array(await pdfRes.arrayBuffer());
  } catch (err) {
    console.error("Apify PDF render failed:", err);
    return null;
  }
}

// ── Fallback PDF path: plain data tables ──────────────────────────────────
// Used only if the Apify render above fails (quota, timeout, transient
// error) — an email with a simpler PDF beats one with none at all.
function buildReportPdf(brandName: string, dateFrom: Date, dateTo: Date, ga4: any, gsc: any): Uint8Array {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const marginX = 15;
  const pageW = 210;
  const pageBottom = 280;
  let y = 20;

  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const truncate = (s: string, max: number) => (s && s.length > max ? s.slice(0, max - 1) + "…" : (s ?? ""));

  function ensureSpace(rows: number, rowH = 7) {
    if (y + rows * rowH > pageBottom) {
      doc.addPage();
      y = 20;
    }
  }

  function sectionTitle(title: string) {
    ensureSpace(3);
    doc.setFontSize(13);
    doc.setTextColor(192, 39, 45);
    doc.setFont("helvetica", "bold");
    doc.text(title, marginX, y);
    y += 5;
    doc.setDrawColor(224, 224, 224);
    doc.line(marginX, y, pageW - marginX, y);
    y += 7;
  }

  function table(headers: string[], rows: string[][], colWidths: number[]) {
    const rowH = 7;
    ensureSpace(1);
    // Header row
    doc.setFillColor(244, 244, 245);
    doc.rect(marginX, y - 5, colWidths.reduce((a, b) => a + b, 0), rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    let x = marginX;
    headers.forEach((h, i) => {
      doc.text(h, x + 2, y);
      x += colWidths[i];
    });
    y += rowH;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(55, 65, 81);
    rows.forEach((row) => {
      ensureSpace(1);
      x = marginX;
      row.forEach((cell, i) => {
        doc.text(cell, x + 2, y);
        x += colWidths[i];
      });
      y += rowH;
    });
    y += 4;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(`${brandName} Performance Report`, marginX, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`, marginX, y);
  y += 12;

  if (ga4) {
    sectionTitle("Google Analytics");
    table(["Metric", "Value"], [
      ["Sessions", String(ga4.sessions ?? 0)],
      ["Organic Sessions", String(ga4.organicSessions ?? 0)],
      ["Page Views", String(ga4.pageViews ?? 0)],
      ["Active Users", String(ga4.activeUsers1Day ?? 0)],
    ], [80, 40]);

    if (ga4.topPages?.length) {
      sectionTitle("Top Pages");
      table(
        ["Page", "Sessions", "Views"],
        ga4.topPages.slice(0, 8).map((p: any) => [truncate(p.page, 55), String(p.sessions), String(p.views)]),
        [125, 25, 25]
      );
    }
  }

  if (gsc) {
    sectionTitle("Google Search Console");
    table(["Metric", "Value"], [
      ["Clicks", String(gsc.totalClicks ?? 0)],
      ["Impressions", String(gsc.totalImpressions ?? 0)],
      ["Average CTR", `${gsc.averageCTR ?? 0}%`],
      ["Average Position", String(gsc.averagePosition ?? 0)],
    ], [80, 40]);

    if (gsc.topQueries?.length) {
      sectionTitle("Top Search Queries");
      table(
        ["Query", "Clicks", "Impr.", "CTR", "Pos"],
        gsc.topQueries.slice(0, 10).map((q: any) => [
          truncate(q.query, 40), String(q.clicks), String(q.impressions), `${q.ctr}%`, String(q.position),
        ]),
        [85, 20, 25, 20, 20]
      );
    }
  }

  if (!ga4 && !gsc) {
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text("No analytics data sources configured for this brand.", marginX, y);
  }

  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text("ABG Brand Performance Hub · American Bath Group · GSC data lags 48–72 hours", marginX, 290);

  return new Uint8Array(doc.output("arraybuffer"));
}

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
      const { brand_id, brand_name, recipients, date_range_days, id, ga4_property_ids, gsc_site_url } = schedule;

      if (!recipients?.length) return { id, skipped: true, reason: "no recipients" };

      const dateTo   = new Date();
      const dateFrom = new Date(dateTo.getTime() - date_range_days * 24 * 60 * 60 * 1000);
      const fmtDate  = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const isoDate  = (d: Date) => d.toISOString().split("T")[0];
      const periodLabel = date_range_days === 7 ? "Last 7 days"
        : date_range_days === 30 ? "Last 30 days"
        : date_range_days === 90 ? "Last 90 days"
        : `Last ${date_range_days} days`;

      const dashboardLink = `${DASHBOARD_URL}?brand=${encodeURIComponent(brand_name)}&tab=summary`;

      // Build the PDF and upload it — a failure here should never block
      // the email itself from going out.
      let pdfUrl: string | null = null;
      try {
        const printUrl = `${DASHBOARD_URL}/print/summary?brand=${encodeURIComponent(brand_id)}&days=${date_range_days}`;
        let pdfBytes = await renderReportPdfViaApify(printUrl);

        if (!pdfBytes) {
          const [ga4, gsc] = await Promise.all([
            ga4_property_ids?.length
              ? callFunction("ga4-data", { propertyIds: ga4_property_ids, startDate: isoDate(dateFrom), endDate: isoDate(dateTo) })
              : Promise.resolve(null),
            gsc_site_url
              ? callFunction("gsc-data", { siteUrl: gsc_site_url, startDate: isoDate(dateFrom), endDate: isoDate(dateTo) })
              : Promise.resolve(null),
          ]);
          pdfBytes = buildReportPdf(brand_name, dateFrom, dateTo, ga4, gsc);
        }

        const safeName = String(brand_name).replace(/[^a-zA-Z0-9]/g, "_");
        const filename = `${safeName}_${isoDate(dateFrom)}_${isoDate(dateTo)}.pdf`;
        const storagePath = `${brand_id}/scheduled-${crypto.randomUUID()}.pdf`;

        const { error: uploadError } = await supabase.storage
          .from("report-pdfs")
          .upload(storagePath, pdfBytes, { contentType: "application/pdf" });

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from("report-pdfs").getPublicUrl(storagePath);
          pdfUrl = `${publicUrl}?download=${encodeURIComponent(filename)}`;
        }
      } catch (err) {
        console.error(`PDF build failed for schedule ${id}:`, err);
      }

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
        ${pdfUrl ? "Download the attached PDF summary, or open the dashboard for the full interactive report." : "Open the dashboard to view the full Summary Report including traffic, search visibility, and AI-generated recommendations."}
      </p>

      <div style="text-align:center;margin:28px 0;">
        ${pdfUrl ? `
        <a href="${pdfUrl}" style="display:inline-block;background:#C0272D;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.02em;margin:0 6px 10px;">
          Download PDF Report →
        </a><br>
        <a href="${dashboardLink}" style="display:inline-block;color:#C0272D;text-decoration:none;font-size:12px;font-weight:600;margin-top:6px;">
          View Interactive Dashboard →
        </a>` : `
        <a href="${dashboardLink}" style="display:inline-block;background:#C0272D;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.02em;">
          View Summary Report →
        </a>`}
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
          subject: `${brand_name} Performance Report — ${fmtDate(dateFrom)} to ${fmtDate(dateTo)}`,
          html,
          content: "auto",
        });
      } catch (err) {
        return { id, ok: false, error: String(err) };
      } finally {
        await client.close();
      }

      // Update last_sent_at
      await supabase.from("email_schedules").update({ last_sent_at: new Date().toISOString() }).eq("id", id);
      return { id, ok: true, recipients: recipients.length, pdf: !!pdfUrl };
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
