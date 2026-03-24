const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    let previewUrl = "";
    let htmlContent = "";

    // Step 1: GET the v3 email object — check for previewUrl, publicAccessUrl, or full HTML
    try {
      const emailRes = await fetch(`https://api.hubapi.com/marketing/v3/emails/${emailId}`, {
        headers: authHeaders,
      });
      if (emailRes.ok) {
        const data = await emailRes.json();
        // Check for preview/public URLs
        for (const field of ["publicAccessUrl", "publishedUrl", "previewUrl", "url", "webversion"]) {
          const val = data[field];
          if (typeof val === "string" && val.startsWith("http")) {
            previewUrl = val;
            console.log(`[email-preview] Found ${field}: ${previewUrl}`);
            break;
          }
        }
        // Check for full HTML body
        if (!previewUrl) {
          for (const field of ["htmlBody", "html", "body"]) {
            const val = data[field];
            if (typeof val === "string" && val.includes("<") && val.length > 200) {
              htmlContent = val;
              console.log(`[email-preview] Found full HTML in v3 field '${field}': ${val.length} chars`);
              break;
            }
          }
        }
      } else {
        const t = await emailRes.text();
        console.log(`[email-preview] v3 GET status: ${emailRes.status}, ${t.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`[email-preview] v3 GET failed:`, e);
    }

    // Step 2: If we have a previewUrl, fetch it to get the full rendered HTML
    if (previewUrl && !htmlContent) {
      try {
        console.log(`[email-preview] Fetching previewUrl HTML`);
        const res = await fetch(previewUrl);
        if (res.ok) {
          const text = await res.text();
          if (text.includes("<") && text.length > 100) {
            htmlContent = text;
            console.log(`[email-preview] Got full HTML from previewUrl: ${text.length} chars`);
          }
        } else {
          await res.text();
          console.log(`[email-preview] previewUrl status: ${res.status}`);
        }
      } catch (e) {
        console.log(`[email-preview] previewUrl fetch failed:`, e);
      }
    }

    // Step 3: Try the older Content API v2
    if (!htmlContent) {
      try {
        const v2Url = `https://api.hubapi.com/content/api/v2/emails/${emailId}`;
        console.log(`[email-preview] Trying Content API v2`);
        const v2Res = await fetch(v2Url, { headers: authHeaders });
        if (v2Res.ok) {
          const v2Data = await v2Res.json();
          // v2 often has full html
          if (typeof v2Data.html === "string" && v2Data.html.length > 200) {
            htmlContent = v2Data.html;
            console.log(`[email-preview] Got full HTML from v2 API: ${htmlContent.length} chars`);
          }
          // Also check for preview URL in v2
          if (!htmlContent && !previewUrl) {
            for (const field of ["publicAccessUrl", "publishedUrl", "previewUrl", "url"]) {
              const val = v2Data[field];
              if (typeof val === "string" && val.startsWith("http")) {
                previewUrl = val;
                console.log(`[email-preview] Found ${field} in v2: ${previewUrl}`);
                break;
              }
            }
          }
        } else {
          const t = await v2Res.text();
          console.log(`[email-preview] v2 API status: ${v2Res.status}, ${t.slice(0, 200)}`);
        }
      } catch (e) {
        console.log(`[email-preview] v2 API failed:`, e);
      }
    }

    // Step 4: If we got a previewUrl from v2 but still no HTML, fetch it
    if (previewUrl && !htmlContent) {
      try {
        const res = await fetch(previewUrl);
        if (res.ok) {
          const text = await res.text();
          if (text.includes("<") && text.length > 100) {
            htmlContent = text;
            console.log(`[email-preview] Got HTML from v2 previewUrl: ${text.length} chars`);
          }
        } else {
          await res.text();
        }
      } catch (e) {
        console.log(`[email-preview] v2 previewUrl fetch failed:`, e);
      }
    }

    // Step 5: Try POST /render and /draft/render as fallback
    if (!htmlContent) {
      for (const path of [`/render`, `/draft/render`]) {
        try {
          const url = `https://api.hubapi.com/marketing/v3/emails/${emailId}${path}`;
          console.log(`[email-preview] Trying POST ${path}`);
          const res = await fetch(url, { method: "POST", headers: authHeaders, body: "{}" });
          const text = await res.text();
          console.log(`[email-preview] ${path} status: ${res.status}, length: ${text.length}`);
          if (res.ok) {
            try {
              const d = JSON.parse(text);
              if (d?.html) { htmlContent = d.html; break; }
            } catch {
              if (text.includes("<") && text.length > 200) { htmlContent = text; break; }
            }
          }
        } catch (e) {
          console.log(`[email-preview] ${path} failed:`, e);
        }
      }
    }

    console.log(`[email-preview] Final: html=${htmlContent.length} chars, previewUrl=${previewUrl ? "yes" : "no"}`);

    return new Response(
      JSON.stringify({ html: htmlContent, previewUrl: previewUrl || null }),
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
