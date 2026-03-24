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

    // Try rendered preview first
    let htmlContent = "";
    try {
      const renderRes = await fetch(
        `https://api.hubapi.com/marketing/v3/emails/${emailId}/draft/render`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );
      if (renderRes.ok) {
        const renderData = await renderRes.json();
        htmlContent = renderData?.html || "";
      }
    } catch {
      console.log("Render endpoint failed, falling back to email body");
    }

    // Fallback: get email object and extract body
    if (!htmlContent) {
      const emailRes = await fetch(
        `https://api.hubapi.com/marketing/v3/emails/${emailId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!emailRes.ok) {
        const err = await emailRes.text();
        throw new Error(`HubSpot API error: ${emailRes.status} ${err.slice(0, 200)}`);
      }
      const emailData = await emailRes.json();
      htmlContent = emailData?.content?.body || emailData?.body || "";
    }

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
