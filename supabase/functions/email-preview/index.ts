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

    let htmlContent = "";

    // Attempt 1: POST to draft/render
    try {
      const renderUrl = `https://api.hubapi.com/marketing/v3/emails/${emailId}/draft/render`;
      console.log(`[email-preview] Attempt 1: POST ${renderUrl}`);
      const renderRes = await fetch(renderUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const renderText = await renderRes.text();
      console.log(`[email-preview] Attempt 1 status: ${renderRes.status}, body length: ${renderText.length}, preview: ${renderText.slice(0, 200)}`);
      if (renderRes.ok) {
        try {
          const renderData = JSON.parse(renderText);
          htmlContent = renderData?.html || "";
        } catch {
          // Response might be raw HTML
          if (renderText.includes("<")) {
            htmlContent = renderText;
          }
        }
      }
    } catch (e) {
      console.log(`[email-preview] Attempt 1 failed:`, e);
    }

    // Attempt 2: GET the email object and extract content
    if (!htmlContent) {
      try {
        const emailUrl = `https://api.hubapi.com/marketing/v3/emails/${emailId}`;
        console.log(`[email-preview] Attempt 2: GET ${emailUrl}`);
        const emailRes = await fetch(emailUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        const emailText = await emailRes.text();
        console.log(`[email-preview] Attempt 2 status: ${emailRes.status}, body length: ${emailText.length}`);
        if (emailRes.ok) {
          const emailData = JSON.parse(emailText);
          // Try multiple fields where HTML content could live
          htmlContent =
            emailData?.content?.widgets?.module?.body?.html ||
            emailData?.content?.body ||
            emailData?.layoutSections?.dnd_area?.rows?.[0]?.columns?.[0]?.widgets?.[0]?.body?.html ||
            emailData?.body?.html ||
            emailData?.body ||
            "";
          console.log(`[email-preview] Attempt 2 extracted html length: ${htmlContent.length}`);
          // Log available top-level keys for debugging
          console.log(`[email-preview] Email object keys: ${Object.keys(emailData).join(", ")}`);
          if (emailData.content) {
            console.log(`[email-preview] content keys: ${Object.keys(emailData.content).join(", ")}`);
          }
        } else {
          console.log(`[email-preview] Attempt 2 error response: ${emailText.slice(0, 300)}`);
        }
      } catch (e) {
        console.log(`[email-preview] Attempt 2 failed:`, e);
      }
    }

    // Attempt 3: Try the v1 content API as fallback
    if (!htmlContent) {
      try {
        const v1Url = `https://api.hubapi.com/marketing-emails/v1/emails/${emailId}`;
        console.log(`[email-preview] Attempt 3: GET ${v1Url}`);
        const v1Res = await fetch(v1Url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const v1Text = await v1Res.text();
        console.log(`[email-preview] Attempt 3 status: ${v1Res.status}, body length: ${v1Text.length}`);
        if (v1Res.ok) {
          const v1Data = JSON.parse(v1Text);
          htmlContent = v1Data?.publishedEmailBody || v1Data?.emailBody || "";
          console.log(`[email-preview] Attempt 3 extracted html length: ${htmlContent.length}`);
          if (!htmlContent) {
            console.log(`[email-preview] v1 keys: ${Object.keys(v1Data).join(", ")}`);
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
