import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GA4Request {
  propertyIds: string[];
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
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  // Import private key and sign JWT
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

async function runReport(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  metrics: string[],
  dimensions: string[]
) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body: any = {
    dateRanges: [{ startDate, endDate }],
    metrics: metrics.map((m) => ({ name: m })),
  };
  if (dimensions.length > 0) {
    body.dimensions = dimensions.map((d) => ({ name: d }));
  }
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
    throw new Error(`GA4 API error (${propertyId}): ${err}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");

    const { propertyIds, startDate, endDate } = (await req.json()) as GA4Request;
    if (!propertyIds?.length || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken(saJson);

    // Aggregate metrics: run summary report for each property and combine
    const summaryMetrics = ["sessions", "screenPageViews", "active1DayUsers"];
    const organicMetrics = ["sessions"];

    // Summary report (all traffic)
    let totalSessions = 0, totalPageViews = 0, totalActiveUsers = 0, totalOrganicSessions = 0;
    const dailyMap: Record<string, { sessions: number; activeUsers: number; views: number }> = {};
    const pageMap: Record<string, { sessions: number; views: number; avgDuration: number; count: number }> = {};

    for (const pid of propertyIds) {
      // Summary totals
      const summary = await runReport(accessToken, pid, startDate, endDate, summaryMetrics, []);
      if (summary.rows?.[0]) {
        const vals = summary.rows[0].metricValues;
        totalSessions += parseInt(vals[0].value) || 0;
        totalPageViews += parseInt(vals[1].value) || 0;
        totalActiveUsers += parseInt(vals[2].value) || 0;
      }

      // Organic sessions
      const organic = await runReport(accessToken, pid, startDate, endDate, organicMetrics, ["sessionDefaultChannelGroup"]);
      for (const row of organic.rows || []) {
        if (row.dimensionValues[0].value === "Organic Search") {
          totalOrganicSessions += parseInt(row.metricValues[0].value) || 0;
        }
      }

      // Daily time series
      const daily = await runReport(accessToken, pid, startDate, endDate, ["sessions", "active1DayUsers", "screenPageViews"], ["date"]);
      for (const row of daily.rows || []) {
        const d = row.dimensionValues[0].value; // YYYYMMDD
        const dateKey = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { sessions: 0, activeUsers: 0, views: 0 };
        dailyMap[dateKey].sessions += parseInt(row.metricValues[0].value) || 0;
        dailyMap[dateKey].activeUsers += parseInt(row.metricValues[1].value) || 0;
        dailyMap[dateKey].views += parseInt(row.metricValues[2].value) || 0;
      }

      // Top pages
      const pages = await runReport(accessToken, pid, startDate, endDate, ["sessions", "screenPageViews", "averageSessionDuration"], ["pagePath"]);
      for (const row of pages.rows || []) {
        const page = row.dimensionValues[0].value;
        const s = parseInt(row.metricValues[0].value) || 0;
        const v = parseInt(row.metricValues[1].value) || 0;
        const dur = parseFloat(row.metricValues[2].value) || 0;
        if (!pageMap[page]) pageMap[page] = { sessions: 0, views: 0, avgDuration: 0, count: 0 };
        pageMap[page].sessions += s;
        pageMap[page].views += v;
        pageMap[page].avgDuration += dur * s;
        pageMap[page].count += s;
      }
    }

    // Format daily data sorted
    const sessionsOverTime = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, value: v.sessions }));

    const activeUsersOverTime = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, activeUsers: v.activeUsers, views: v.views }));

    // Top pages sorted by sessions
    const topPages = Object.entries(pageMap)
      .sort(([, a], [, b]) => b.sessions - a.sessions)
      .slice(0, 10)
      .map(([page, v]) => {
        const avgSec = v.count > 0 ? v.avgDuration / v.count : 0;
        const min = Math.floor(avgSec / 60);
        const sec = Math.round(avgSec % 60);
        return {
          page,
          sessions: v.sessions,
          views: v.views,
          avgDuration: `${min}m ${sec.toString().padStart(2, "0")}s`,
        };
      });

    const result = {
      sessions: totalSessions,
      sessionsDelta: 0,
      organicSessions: totalOrganicSessions,
      organicSessionsDelta: 0,
      pageViews: totalPageViews,
      pageViewsDelta: 0,
      activeUsers1Day: totalActiveUsers,
      activeUsers1DayDelta: 0,
      sessionsOverTime,
      activeUsersOverTime,
      topPages,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("GA4 proxy error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
