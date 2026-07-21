import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_DOMAINS = [
  "americanbathgroup.com", "abghospitality.com", "accessiblehomestore.com",
  "altrekproducts.com", "aquaticbath.com", "arizonashowerdoor.com",
  "bootz.com", "clarionbathware.com", "clariontransportation.com",
  "coastalind.com", "dreamline.com", "florestone.com", "imitoday.com",
  "laurelmountainbath.com", "lmbath.com", "maax.com", "maaxspas.com",
  "maidstonesupply.com", "mrsteam.com", "praxiscompanies.com",
  "produitsneptune.com", "neptuneb.com", "salomfg.com", "swanstone.com",
  "vintagetub.com", "vintagetub.ca", "bathcraft.onmicrosoft.com",
  "bathcraft.com", "bathauthority.com", "americanstandard-bootz.com",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization")!;
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { email, full_name, role = "viewer" } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const domain = email.split("@")[1]?.toLowerCase();
    if (!ALLOWED_DOMAINS.includes(domain)) {
      return new Response(JSON.stringify({ error: "Email domain not allowed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: existingUser } = await supabaseAdmin
      .from("user_profiles")
      .select("email")
      .eq("email", email.toLowerCase())
      .single();

    if (existingUser) {
      return new Response(JSON.stringify({ error: "User already has an account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabaseAdmin.from("user_invitations").insert({
      email: email.toLowerCase(),
      full_name,
      role,
      invited_by: user.id,
    });

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo: "https://wholesaledigitaldashboard.lovable.app/",
    });

    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabaseAdmin.from("user_activity_log").insert({
      user_id: user.id,
      email: user.email,
      action: "invited",
      metadata: { invited_email: email, invited_name: full_name, assigned_role: role },
    });

    return new Response(JSON.stringify({ success: true, message: `Invitation sent to ${email}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
