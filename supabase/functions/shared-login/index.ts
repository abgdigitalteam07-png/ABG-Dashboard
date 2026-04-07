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
    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Admin client to manage users
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check shared password from app_config
    const { data: configRow, error: configError } = await adminClient
      .from("app_config")
      .select("value")
      .eq("key", "shared_password")
      .single();

    if (configError || !configRow) {
      return new Response(JSON.stringify({ error: "Unable to verify credentials" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password !== configRow.value) {
      return new Response(JSON.stringify({ error: "Incorrect password" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to sign in with anon client
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email,
      password,
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
      // User exists but password is wrong (shared password changed) — update it
      await adminClient.auth.admin.updateUserById(existingUser.id, { password });

      const { data: retryData, error: retryError } = await anonClient.auth.signInWithPassword({
        email,
        password,
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

    // User doesn't exist — create account
    const { data: signUpData, error: signUpError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (signUpError) {
      return new Response(JSON.stringify({ error: signUpError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sign in after creation
    const { data: finalData, error: finalError } = await anonClient.auth.signInWithPassword({
      email,
      password,
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
