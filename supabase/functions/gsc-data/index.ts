import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GSCRequest {
  siteUrl: string;
  startDate: string;
  endDate: string;
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signInput);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  const { access_token } = await tokenRes.json();
  return access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");

    const { siteUrl, startDate, endDate } = (await req.json()) as GSCRequest;
    if (!siteUrl || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken(saJson);

    const apiUrl = "https://www.googleapis.com/webmasters/v3/sites/" +
      encodeURIComponent(siteUrl) + "/searchAnalytics/query";

    // Summary totals
    const summaryRes = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, dimensions: [], rowLimit: 1 }),
    });
    if (!summaryRes.ok) {
      const errText = await summaryRes.text();
      if (summaryRes.status === 403) {
        return new Response(JSON.stringify({ error: "no_permission", message: `Service account lacks access to ${siteUrl}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`GSC API error: ${errText}`);
    }
    const summaryData = await summaryRes.json();

    let totalClicks = 0, totalImpressions = 0, averageCTR = 0, averagePosition = 0;
    if (summaryData.rows?.[0]) {
      totalClicks = summaryData.rows[0].clicks;
      totalImpressions = summaryData.rows[0].impressions;
      averageCTR = parseFloat((summaryData.rows[0].ctr * 100).toFixed(1));
      averagePosition = parseFloat(summaryData.rows[0].position.toFixed(1));
    }

    // Daily time series
    const dailyRes = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, dimensions: ["date"], rowLimit: 25000 }),
    });
    if (!dailyRes.ok) throw new Error(`GSC daily error: ${await dailyRes.text()}`);
    const dailyData = await dailyRes.json();

    const clicksImpressionsOverTime = (dailyData.rows || [])
      .sort((a: any, b: any) => a.keys[0].localeCompare(b.keys[0]))
      .map((row: any) => ({
        date: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
      }));

    // Top queries
    const queriesRes = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 10 }),
    });
    if (!queriesRes.ok) throw new Error(`GSC queries error: ${await queriesRes.text()}`);
    const queriesData = await queriesRes.json();

    const topQueries = (queriesData.rows || []).map((row: any) => ({
      query: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: parseFloat((row.ctr * 100).toFixed(1)),
      position: parseFloat(row.position.toFixed(1)),
    }));

    const result = {
      totalClicks,
      totalClicksDelta: 0,
      totalImpressions,
      totalImpressionsDelta: 0,
      averageCTR,
      averageCTRDelta: 0,
      averagePosition,
      averagePositionDelta: 0,
      clicksImpressionsOverTime,
      topQueries,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("GSC proxy error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
