import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get the internal shared password from app_config (users never see this)
    const { data: configRow, error: configError } = await adminClient
      .from("app_config")
      .select("value")
      .eq("key", "shared_password")
      .single();

    if (configError || !configRow) {
      return new Response(JSON.stringify({ error: "Unable to complete sign-in" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const internalPassword = configRow.value;

    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Try to sign in with the internal password
    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email,
      password: internalPassword,
    });

    if (!signInError && signInData.session) {
      return new Response(JSON.stringify({ session: signInData.session }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user exists
    const { data: userList } = await adminClient.auth.admin.listUsers();
    const existingUser = userList?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (existingUser) {
      // Update to current internal password and retry
      await adminClient.auth.admin.updateUserById(existingUser.id, { password: internalPassword });

      const { data: retryData, error: retryError } = await anonClient.auth.signInWithPassword({
        email,
        password: internalPassword,
      });

      if (retryError) {
        return new Response(JSON.stringify({ error: retryError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ session: retryData.session }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // New user — create account automatically
    const { data: signUpData, error: signUpError } = await adminClient.auth.admin.createUser({
      email,
      password: internalPassword,
      email_confirm: true,
    });

    if (signUpError) {
      return new Response(JSON.stringify({ error: signUpError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: finalData, error: finalError } = await anonClient.auth.signInWithPassword({
      email,
      password: internalPassword,
    });

    if (finalError) {
      return new Response(JSON.stringify({ error: "Account created but sign-in failed. Please try again." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ session: finalData.session }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
