import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
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
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");

    const { propertyIds, startDate, endDate } = await req.json();
    if (!propertyIds?.length || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken(saJson);

    const metrics = [
      "sessions",
      "engagedSessions",
      "engagementRate",
      "averageSessionDuration",
      "eventsPerSession",
      "totalUsers",
      "newUsers",
      "activeUsers",
      "userEngagementDuration",
    ];

    const channelMap: Record<string, {
      sessions: number;
      engagedSessions: number;
      engagementRate: number;
      avgSessionDuration: number;
      eventsPerSession: number;
      totalUsers: number;
      newUsers: number;
      userEngagementDuration: number;
      _weightSessions: number;
    }> = {};

    for (const pid of propertyIds) {
      const url = `https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport`;
      const body = {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: metrics.map((m) => ({ name: m })),
        limit: 50,
      };
      console.log(`[ga4-channel-data] Request for ${pid}:`, JSON.stringify(body));

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error(`[ga4-channel-data] API error for ${pid}: ${err}`);
        continue;
      }

      const data = await res.json();
      console.log(`[ga4-channel-data] Response for ${pid}: ${(data.rows || []).length} rows`);
      for (const row of data.rows || []) {
        const channel = row.dimensionValues[0].value;
        const v = row.metricValues;
        const sessions = parseInt(v[0].value) || 0;

        if (!channelMap[channel]) {
          channelMap[channel] = {
            sessions: 0, engagedSessions: 0, engagementRate: 0,
            avgSessionDuration: 0, eventsPerSession: 0, totalUsers: 0,
            newUsers: 0, userEngagementDuration: 0,
            _weightSessions: 0,
          };
        }
        const c = channelMap[channel];
        c.sessions += sessions;
        c.engagedSessions += parseInt(v[1].value) || 0;
        c.totalUsers += parseInt(v[5].value) || 0;
        c.newUsers += parseInt(v[6].value) || 0;
        c.userEngagementDuration += parseFloat(v[8].value) || 0;
        // Weighted averages
        c.engagementRate += (parseFloat(v[2].value) || 0) * sessions;
        c.avgSessionDuration += (parseFloat(v[3].value) || 0) * sessions;
        c.eventsPerSession += (parseFloat(v[4].value) || 0) * sessions;
        c._weightSessions += sessions;
      }
    }

    const channels = Object.entries(channelMap)
      .map(([channel, c]) => {
        const w = c._weightSessions || 1;
        const returningUsers = Math.max(0, c.totalUsers - c.newUsers);
        const avgEngagementTimePerUser = c.totalUsers > 0 ? c.userEngagementDuration / c.totalUsers : 0;
        const engagedSessionsPerUser = c.totalUsers > 0 ? c.engagedSessions / c.totalUsers : 0;
        return {
          channel,
          sessions: c.sessions,
          engagedSessions: c.engagedSessions,
          engagementRate: parseFloat(((c.engagementRate / w) * 100).toFixed(1)),
          avgSessionDuration: parseFloat((c.avgSessionDuration / w).toFixed(1)),
          eventsPerSession: parseFloat((c.eventsPerSession / w).toFixed(1)),
          totalUsers: c.totalUsers,
          newUsers: c.newUsers,
          returningUsers,
          avgEngagementTimePerUser: parseFloat(avgEngagementTimePerUser.toFixed(1)),
          engagedSessionsPerUser: parseFloat(engagedSessionsPerUser.toFixed(2)),
        };
      })
      .sort((a, b) => b.sessions - a.sessions);

    return new Response(JSON.stringify({ channels }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("GA4 channel data error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
