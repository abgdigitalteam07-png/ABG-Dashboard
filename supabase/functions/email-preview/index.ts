const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Collect ALL html snippets from nested widget structures
function collectAllHtml(obj: unknown, results: string[] = []): string[] {
  if (!obj || typeof obj !== "object") return results;
  const record = obj as Record<string, unknown>;

  if (typeof record.html === "string" && record.html.trim().length > 0) {
    results.push(record.html);
  }
  if (record.body && typeof record.body === "object") {
    const body = record.body as Record<string, unknown>;
    if (typeof body.html === "string" && body.html.trim().length > 0) {
      results.push(body.html);
    }
  }
  for (const key of Object.keys(record)) {
    if (key === "html") continue; // already handled
    const val = record[key];
    if (val && typeof val === "object") {
      collectAllHtml(val, results);
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("HUBSPOT_ACCESS_TOKEN");
    if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN not configured");

    const { emailId } = await req.json();
    if (!emailId) {
      return new Response(JSON.stringify({ error: "Missing emailId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[email-preview] Fetching preview for emailId: ${emailId}`);

    let htmlContent = "";

    // Step 1: GET the email object
    let emailData: Record<string, unknown> | null = null;
    try {
      const emailUrl = `https://api.hubapi.com/marketing/v3/emails/${emailId}`;
      const emailRes = await fetch(emailUrl, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (emailRes.ok) {
        emailData = await emailRes.json();
      } else {
        const errText = await emailRes.text();
        console.log(`[email-preview] GET email error: ${emailRes.status} ${errText.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`[email-preview] GET email failed:`, e);
    }

    // Step 2: Try webversion URL if available
    if (emailData && typeof emailData.webversion === "string" && emailData.webversion) {
      try {
        console.log(`[email-preview] Trying webversion: ${emailData.webversion}`);
        const wvRes = await fetch(emailData.webversion as string);
        if (wvRes.ok) {
          htmlContent = await wvRes.text();
          console.log(`[email-preview] Webversion HTML: ${htmlContent.length} chars`);
        } else {
          await wvRes.text();
          console.log(`[email-preview] Webversion status: ${wvRes.status}`);
        }
      } catch (e) {
        console.log(`[email-preview] Webversion fetch failed:`, e);
      }
    }

    // Step 3: Try POST /render (published emails)
    if (!htmlContent) {
      try {
        const renderUrl = `https://api.hubapi.com/marketing/v3/emails/${emailId}/render`;
        console.log(`[email-preview] Trying POST /render`);
        const renderRes = await fetch(renderUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const renderText = await renderRes.text();
        console.log(`[email-preview] /render status: ${renderRes.status}, length: ${renderText.length}`);
        if (renderRes.ok) {
          try {
            const renderData = JSON.parse(renderText);
            htmlContent = renderData?.html || "";
          } catch {
            if (renderText.includes("<")) htmlContent = renderText;
          }
        }
      } catch (e) {
        console.log(`[email-preview] /render failed:`, e);
      }
    }

    // Step 4: Try POST /draft/render
    if (!htmlContent) {
      try {
        const draftUrl = `https://api.hubapi.com/marketing/v3/emails/${emailId}/draft/render`;
        console.log(`[email-preview] Trying POST /draft/render`);
        const draftRes = await fetch(draftUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const draftText = await draftRes.text();
        console.log(`[email-preview] /draft/render status: ${draftRes.status}, length: ${draftText.length}`);
        if (draftRes.ok) {
          try {
            const draftData = JSON.parse(draftText);
            htmlContent = draftData?.html || "";
          } catch {
            if (draftText.includes("<")) htmlContent = draftText;
          }
        }
      } catch (e) {
        console.log(`[email-preview] /draft/render failed:`, e);
      }
    }

    // Step 5: Fallback — assemble from all widget HTML snippets
    if (!htmlContent && emailData) {
      const content = emailData.content as Record<string, unknown> | undefined;
      if (content) {
        const snippets: string[] = [];
        if (content.widgets) collectAllHtml(content.widgets, snippets);
        if (content.flexAreas) collectAllHtml(content.flexAreas, snippets);
        if (snippets.length > 0) {
          htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:20px;font-family:Arial,sans-serif;">${snippets.join("\n")}</body></html>`;
          console.log(`[email-preview] Assembled from ${snippets.length} widget snippets, total: ${htmlContent.length} chars`);
        }
      }
    }

    console.log(`[email-preview] Final html length: ${htmlContent.length}`);

    return new Response(
      JSON.stringify({ html: htmlContent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Email preview error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
