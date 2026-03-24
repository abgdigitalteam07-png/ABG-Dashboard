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

    // Step 1: Try Content API v2 first — most reliable for full rendered HTML
    try {
      const v2Url = `https://api.hubapi.com/content/api/v2/emails/${emailId}`;
      console.log(`[email-preview] Step 1: Trying Content API v2`);
      const v2Res = await fetch(v2Url, { headers: authHeaders });
      if (v2Res.ok) {
        const v2Data = await v2Res.json();
        // Get full HTML
        if (typeof v2Data.html === "string" && v2Data.html.length > 200) {
          htmlContent = v2Data.html;
          console.log(`[email-preview] Got full HTML from v2: ${htmlContent.length} chars`);
        }
        // Also grab any preview URL
        for (const field of ["publicAccessUrl", "publishedUrl", "previewUrl", "url"]) {
          const val = v2Data[field];
          if (typeof val === "string" && val.startsWith("http")) {
            previewUrl = val;
            console.log(`[email-preview] Found ${field} in v2: ${previewUrl}`);
            break;
          }
        }
        // If we have a URL but no HTML yet, fetch HTML from the URL
        if (!htmlContent && previewUrl) {
          try {
            const res = await fetch(previewUrl);
            if (res.ok) {
              const text = await res.text();
              if (text.includes("<") && text.length > 200 && !text.toLowerCase().includes("page not found") && !text.toLowerCase().includes("404")) {
                htmlContent = text;
                console.log(`[email-preview] Got HTML from v2 previewUrl: ${text.length} chars`);
              }
            }
          } catch (e) {
            console.log(`[email-preview] v2 previewUrl fetch failed:`, e);
          }
        }
      } else {
        const t = await v2Res.text();
        console.log(`[email-preview] v2 API status: ${v2Res.status}, ${t.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`[email-preview] v2 API failed:`, e);
    }

    // Step 2: Try v3 API for URL fields and htmlBody
    if (!htmlContent) {
      try {
        console.log(`[email-preview] Step 2: Trying v3 API`);
        const emailRes = await fetch(`https://api.hubapi.com/marketing/v3/emails/${emailId}`, {
          headers: authHeaders,
        });
        if (emailRes.ok) {
          const data = await emailRes.json();
          // Check for HTML body fields
          for (const field of ["htmlBody", "html", "body"]) {
            const val = data[field];
            if (typeof val === "string" && val.includes("<") && val.length > 200) {
              htmlContent = val;
              console.log(`[email-preview] Found HTML in v3 field '${field}': ${val.length} chars`);
              break;
            }
          }
          // Check for preview URLs
          if (!previewUrl) {
            for (const field of ["publicAccessUrl", "publishedUrl", "previewUrl", "url", "webversion"]) {
              const val = data[field];
              if (typeof val === "string" && val.startsWith("http")) {
                previewUrl = val;
                console.log(`[email-preview] Found ${field} in v3: ${previewUrl}`);
                break;
              }
            }
          }
          // If we have a URL but still no HTML, fetch it
          if (!htmlContent && previewUrl) {
            try {
              const res = await fetch(previewUrl);
              if (res.ok) {
                const text = await res.text();
                if (text.includes("<") && text.length > 200 && !text.toLowerCase().includes("page not found") && !text.toLowerCase().includes("404")) {
                  htmlContent = text;
                  console.log(`[email-preview] Got HTML from v3 previewUrl: ${text.length} chars`);
                }
              }
            } catch (e) {
              console.log(`[email-preview] v3 previewUrl fetch failed:`, e);
            }
          }
        } else {
          const t = await emailRes.text();
          console.log(`[email-preview] v3 GET status: ${emailRes.status}, ${t.slice(0, 200)}`);
        }
      } catch (e) {
        console.log(`[email-preview] v3 GET failed:`, e);
      }
    }

    // Step 3: Try POST /render and /draft/render as last resort
    if (!htmlContent) {
      for (const path of [`/render`, `/draft/render`]) {
        try {
          const url = `https://api.hubapi.com/marketing/v3/emails/${emailId}${path}`;
          console.log(`[email-preview] Step 3: Trying POST ${path}`);
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
      JSON.stringify({ html: htmlContent || null, previewUrl: previewUrl || null }),
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
