// reddit-publish — pushes a brand's weekly Reddit threads to HubSpot:
//  1. Updates a landing page module (finds the module whose rich-text HTML
//     contains the marker <!--REDDIT_TABLE--> and replaces its content), then republishes.
//  2. Optionally uploads a PDF report to the "Reddit Threads" folder in HubSpot Files.
// Server-side only — uses HUBSPOT_ACCESS_TOKEN from function secrets.
// Requires private-app scopes: CMS Pages (content) + files.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MARKER = "<!--REDDIT_TABLE-->";

interface PublishRequest {
  brandId: string;
  brandName: string;
  landingPageId: string;   // HubSpot page content id, e.g. "370024804043"
  weekOf?: string;         // defaults to latest week with data
  uploadPdf?: boolean;     // also upload PDF to Files (default false until scope confirmed)
}

interface Thread {
  thread_url: string; subreddit: string; title: string; upvotes: number;
  num_comments: number; sentiment: string | null; opportunity: string | null;
  brand_mentioned: boolean; cited_by_ai_count: number;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderTable(brandName: string, weekOf: string, threads: Thread[]): string {
  const rows = threads.map((t, i) => {
    const sent = t.sentiment ?? "Neutral";
    const sentColor = sent === "Positive" ? "#15803d" : sent === "Negative" ? "#b91c1c" : "#5a646e";
    const pri = t.opportunity ?? (t.cited_by_ai_count > 0 ? "HIGH" : "MED");
    const priColor = pri.startsWith("HIGH") ? "#b91c1c" : "#b45309";
    return `<tr style="background:${i % 2 ? "#f6f8fa" : "#ffffff"}">
      <td style="padding:10px 12px;font-size:14px;color:#5a646e">${i + 1}</td>
      <td style="padding:10px 12px"><a href="${esc(t.thread_url)}" target="_blank" style="color:#0091ae;font-weight:600;font-size:14px;text-decoration:none">${esc(t.title)}</a></td>
      <td style="padding:10px 12px;font-size:13px;color:#33475b">${esc(t.subreddit)}</td>
      <td style="padding:10px 12px;font-size:13px;color:#33475b;white-space:nowrap">${t.upvotes} ▲ · ${t.num_comments} 💬</td>
      <td style="padding:10px 12px;font-size:13px;font-weight:600;color:${sentColor}">${esc(sent)}</td>
      <td style="padding:10px 12px;font-size:12px;font-weight:700;color:${priColor}">${esc(pri)}</td>
    </tr>`;
  }).join("");

  return `${MARKER}
<div style="font-family:'Lexend Deca',Helvetica,Arial,sans-serif;max-width:900px;margin:0 auto">
  <h2 style="color:#0f2542;margin:0 0 4px">Weekly Reddit Opportunities — ${esc(brandName)}</h2>
  <p style="color:#5a646e;margin:0 0 4px;font-size:14px">Week of ${esc(weekOf)} · ${threads.length} conversations your customers are having right now.</p>
  <p style="color:#5a646e;margin:0 0 16px;font-size:13px">Click a thread to open it on Reddit. <b>HIGH</b> threads are cited by AI assistants when buyers ask for recommendations — a helpful reply there reaches far beyond Reddit.</p>
  <table style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0">
    <thead><tr style="background:#0f2542">
      <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:left">#</th>
      <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:left">Thread</th>
      <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:left">Subreddit</th>
      <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:left">Activity</th>
      <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:left">Sentiment</th>
      <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:left">Priority</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="color:#8794a3;font-size:12px;margin-top:14px">Updated automatically by the ABG Brand Performance Hub · ${new Date().toISOString().slice(0, 10)}</p>
</div>`;
}

// Recursively walk layoutSections and replace the html param of the module containing MARKER.
function replaceMarkerModule(node: unknown, html: string): boolean {
  if (Array.isArray(node)) return node.some(n => replaceMarkerModule(n, html));
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const params = obj.params as Record<string, unknown> | undefined;
    if (params && typeof params.html === "string" && params.html.includes(MARKER)) {
      params.html = html;
      return true;
    }
    return Object.values(obj).some(v => replaceMarkerModule(v, html));
  }
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });

  const hsToken = Deno.env.get("HUBSPOT_ACCESS_TOKEN");
  if (!hsToken) return json({ error: "HUBSPOT_ACCESS_TOKEN not configured" }, 500);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Admin gate (same pattern as aeo-scan)
  const authHeader = req.headers.get("authorization") ?? "";
  const { data: userData } = await createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { authorization: authHeader } } },
  ).auth.getUser();
  if (userData?.user?.id) {
    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (!isAdmin) return json({ error: "Admins only" }, 403);
  }

  const { brandId, brandName, landingPageId, weekOf, uploadPdf = false }: PublishRequest = await req.json();

  // Latest week with data if not specified
  let week = weekOf;
  if (!week) {
    const { data } = await supabase.from("reddit_threads").select("week_of")
      .eq("brand_id", brandId).order("week_of", { ascending: false }).limit(1);
    week = data?.[0]?.week_of;
  }
  if (!week) return json({ error: `No Reddit data for ${brandId} — run a scan first.` }, 404);

  const { data: threads, error: thErr } = await supabase.from("reddit_threads").select("*")
    .eq("brand_id", brandId).eq("week_of", week)
    .order("cited_by_ai_count", { ascending: false }).order("upvotes", { ascending: false }).limit(15);
  if (thErr) return json({ error: thErr.message }, 500);
  if (!threads?.length) return json({ error: `No threads for ${brandId} week ${week}` }, 404);

  const html = renderTable(brandName, week, threads as Thread[]);
  const hs = (path: string, init: RequestInit = {}) =>
    fetch(`https://api.hubapi.com${path}`, {
      ...init,
      headers: { authorization: `Bearer ${hsToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
    });

  // 1. Read the page draft, replace the marker module, patch, publish.
  const pageRes = await hs(`/cms/v3/pages/landing-pages/${landingPageId}/draft`);
  if (!pageRes.ok) return json({ error: `HubSpot page read failed (${pageRes.status}): ${await pageRes.text()}` }, 502);
  const page = await pageRes.json();

  const replaced = replaceMarkerModule(page.layoutSections, html);
  if (!replaced) {
    return json({
      error: `No module containing the marker ${MARKER} found on page ${landingPageId}. ` +
        `Add a Rich Text module to the page whose source HTML starts with ${MARKER}, save, then retry.`,
    }, 422);
  }

  const patchRes = await hs(`/cms/v3/pages/landing-pages/${landingPageId}/draft`, {
    method: "PATCH",
    body: JSON.stringify({ layoutSections: page.layoutSections }),
  });
  if (!patchRes.ok) return json({ error: `HubSpot page update failed (${patchRes.status}): ${await patchRes.text()}` }, 502);

  const pubRes = await hs(`/cms/v3/pages/landing-pages/${landingPageId}/draft/push-live`, { method: "POST" });
  const published = pubRes.ok;

  // 2. Optional: upload PDF report to Files > Reddit Threads.
  let fileUrl: string | null = null;
  if (uploadPdf) {
    try {
      const { jsPDF } = await import("https://esm.sh/jspdf@4.2.1");
      const { default: autoTable } = await import("https://esm.sh/jspdf-autotable@5.0.7");
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      doc.setFillColor(15, 37, 66); doc.rect(0, 0, 612, 80, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
      doc.text("AMERICAN BATH GROUP", 40, 34);
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      doc.text(`Weekly Reddit Opportunities · ${brandName} · Week of ${week}`, 40, 56);
      autoTable(doc, {
        startY: 100,
        head: [["#", "Thread", "Subreddit", "Activity", "Sentiment", "Priority"]],
        body: (threads as Thread[]).map((t, i) => [String(i + 1), t.title, t.subreddit,
          `${t.upvotes} up / ${t.num_comments} comments`, t.sentiment ?? "Neutral",
          t.opportunity ?? (t.cited_by_ai_count > 0 ? "HIGH" : "MED")]),
        margin: { left: 40, right: 40 },
        styles: { fontSize: 8.5, cellPadding: 5 },
        headStyles: { fillColor: [15, 37, 66] },
        didDrawCell(data: { section: string; column: { index: number }; row: { index: number }; cell: { x: number; y: number; width: number; height: number } }) {
          if (data.section === "body" && data.column.index === 1) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height,
              { url: (threads as Thread[])[data.row.index].thread_url });
          }
        },
      });
      const pdfBytes = new Uint8Array(doc.output("arraybuffer"));
      const form = new FormData();
      form.append("file", new Blob([pdfBytes], { type: "application/pdf" }),
        `${brandId}-reddit-opportunities-${week}.pdf`);
      form.append("options", JSON.stringify({ access: "PUBLIC_NOT_INDEXABLE", overwrite: true }));
      form.append("folderPath", "Reddit Threads");
      const fileRes = await fetch("https://api.hubapi.com/files/v3/files", {
        method: "POST", headers: { authorization: `Bearer ${hsToken}` }, body: form,
      });
      if (fileRes.ok) fileUrl = (await fileRes.json()).url ?? null;
    } catch (e) {
      console.error("PDF upload failed:", e);
    }
  }

  await supabase.from("reddit_threads").update({ included_in_dealer_email: true })
    .eq("brand_id", brandId).eq("week_of", week);

  return json({ ok: true, week, threads: threads.length, pageUpdated: true, published, fileUrl });
});
