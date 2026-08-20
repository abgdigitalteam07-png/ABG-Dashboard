import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_ALERT_EMAIL = "abgdigitalteam07@gmail.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const domain = email.split("@")[1]?.toLowerCase();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: allowedDomainRows } = await supabaseAdmin.from("allowed_domains").select("domain");
    const allowedDomains = (allowedDomainRows ?? []).map((r) => r.domain);

    if (allowedDomains.includes(domain)) {
      return new Response(JSON.stringify({ skipped: true, reason: "allowed domain" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured; cannot send external-login alert");
      return new Response(JSON.stringify({ error: "Email alerting not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const timestamp = new Date().toUTCString();

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ABG Brand Performance Hub <onboarding@resend.dev>",
        to: [ADMIN_ALERT_EMAIL],
        subject: `New non-ABG sign-in: ${email}`,
        html: `<p>A user outside your company domains just signed in to the Brand Performance Hub.</p>
<p><strong>Email:</strong> ${email}</p>
<p><strong>Domain:</strong> ${domain}</p>
<p><strong>Time:</strong> ${timestamp}</p>`,
      }),
    });

    if (!resendRes.ok) {
      const body = await resendRes.text();
      console.error("Resend API error:", resendRes.status, body);
      return new Response(JSON.stringify({ error: "Failed to send alert email" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
