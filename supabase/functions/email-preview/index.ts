const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Recursively extract HTML from nested widget/module structures
function extractHtmlFromWidgets(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const record = obj as Record<string, unknown>;
  
  // Check for direct html field
  if (typeof record.html === "string" && record.html.length > 0) {
    return record.html;
  }
  // Check for body.html
  if (record.body && typeof record.body === "object") {
    const body = record.body as Record<string, unknown>;
    if (typeof body.html === "string" && body.html.length > 0) {
      return body.html;
    }
  }
  // Recurse into child objects
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (val && typeof val === "object") {
      const found = extractHtmlFromWidgets(val);
      if (found) return found;
    }
  }
  return "";
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

    // Attempt 1: GET the email object — extract content + webversion
    try {
      const emailUrl = `https://api.hubapi.com/marketing/v3/emails/${emailId}`;
      console.log(`[email-preview] Attempt 1: GET ${emailUrl}`);
      const emailRes = await fetch(emailUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (emailRes.ok) {
        const emailData = await emailRes.json();
        
        // Try extracting HTML from widgets
        if (emailData.content?.widgets) {
          htmlContent = extractHtmlFromWidgets(emailData.content.widgets);
          console.log(`[email-preview] Extracted from widgets: ${htmlContent.length} chars`);
        }
        
        // Try flexAreas
        if (!htmlContent && emailData.content?.flexAreas) {
          htmlContent = extractHtmlFromWidgets(emailData.content.flexAreas);
          console.log(`[email-preview] Extracted from flexAreas: ${htmlContent.length} chars`);
        }

        // If we have a previewKey, construct webversion URL
        if (!htmlContent && emailData.previewKey && emailData.activeDomain) {
          const webVersionUrl = `https://${emailData.activeDomain}/-temporary-slug-${emailData.previewKey}`;
          console.log(`[email-preview] Trying webversion fetch: ${webVersionUrl}`);
          try {
            const wvRes = await fetch(webVersionUrl);
            if (wvRes.ok) {
              htmlContent = await wvRes.text();
              console.log(`[email-preview] Got webversion HTML: ${htmlContent.length} chars`);
            } else {
              await wvRes.text(); // consume
            }
          } catch (e) {
            console.log(`[email-preview] Webversion fetch failed:`, e);
          }
        }
      } else {
        const errText = await emailRes.text();
        console.log(`[email-preview] Attempt 1 error: ${emailRes.status} ${errText.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`[email-preview] Attempt 1 failed:`, e);
    }

    // Attempt 2: POST to render (non-draft, for published emails)
    if (!htmlContent) {
      try {
        const renderUrl = `https://api.hubapi.com/marketing/v3/emails/${emailId}/render`;
        console.log(`[email-preview] Attempt 2: POST ${renderUrl}`);
        const renderRes = await fetch(renderUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const renderText = await renderRes.text();
        console.log(`[email-preview] Attempt 2 status: ${renderRes.status}, length: ${renderText.length}`);
        if (renderRes.ok) {
          try {
            const renderData = JSON.parse(renderText);
            htmlContent = renderData?.html || "";
          } catch {
            if (renderText.includes("<")) htmlContent = renderText;
          }
        }
      } catch (e) {
        console.log(`[email-preview] Attempt 2 failed:`, e);
      }
    }

    // Attempt 3: Draft render (for draft emails)
    if (!htmlContent) {
      try {
        const draftUrl = `https://api.hubapi.com/marketing/v3/emails/${emailId}/draft/render`;
        console.log(`[email-preview] Attempt 3: POST ${draftUrl}`);
        const draftRes = await fetch(draftUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const draftText = await draftRes.text();
        console.log(`[email-preview] Attempt 3 status: ${draftRes.status}, length: ${draftText.length}`);
        if (draftRes.ok) {
          try {
            const draftData = JSON.parse(draftText);
            htmlContent = draftData?.html || "";
          } catch {
            if (draftText.includes("<")) htmlContent = draftText;
          }
        }
      } catch (e) {
        console.log(`[email-preview] Attempt 3 failed:`, e);
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
