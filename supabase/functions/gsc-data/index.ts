import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    return new Response("ok", { headers: corsHeaders });
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

    const authHeader = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    // Run all queries in parallel
    const [summaryRes, dailyRes, queriesRes, oppRes, landingPagesRes] = await Promise.all([
      fetch(apiUrl, {
        method: "POST", headers: authHeader,
        body: JSON.stringify({ startDate, endDate, dimensions: [], rowLimit: 1 }),
      }),
      fetch(apiUrl, {
        method: "POST", headers: authHeader,
        body: JSON.stringify({ startDate, endDate, dimensions: ["date"], rowLimit: 25000 }),
      }),
      fetch(apiUrl, {
        method: "POST", headers: authHeader,
        body: JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 25 }),
      }),
      fetch(apiUrl, {
        method: "POST", headers: authHeader,
        body: JSON.stringify({
          startDate, endDate, dimensions: ["query"], rowLimit: 50,
          orderBys: [{ fieldName: "impressions", sortOrder: "DESCENDING" }],
        }),
      }),
      fetch(apiUrl, {
        method: "POST", headers: authHeader,
        body: JSON.stringify({ startDate, endDate, dimensions: ["page"], rowLimit: 50 }),
      }),
    ]);

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

    const [summaryData, dailyData, queriesData] = await Promise.all([
      summaryRes.json(),
      dailyRes.ok ? dailyRes.json() : Promise.resolve({ rows: [] }),
      queriesRes.ok ? queriesRes.json() : Promise.resolve({ rows: [] }),
    ]);

    let totalClicks = 0, totalImpressions = 0, averageCTR = 0, averagePosition = 0;
    if (summaryData.rows?.[0]) {
      totalClicks = summaryData.rows[0].clicks;
      totalImpressions = summaryData.rows[0].impressions;
      averageCTR = parseFloat((summaryData.rows[0].ctr * 100).toFixed(1));
      averagePosition = parseFloat(summaryData.rows[0].position.toFixed(1));
    }

    const clicksImpressionsOverTime = (dailyData.rows || [])
      .sort((a: any, b: any) => a.keys[0].localeCompare(b.keys[0]))
      .map((row: any) => ({
        date: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: parseFloat((row.ctr * 100).toFixed(1)),
        position: parseFloat(row.position.toFixed(1)),
      }));

    const topQueries = (queriesData.rows || []).map((row: any) => ({
      query: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: parseFloat((row.ctr * 100).toFixed(1)),
      position: parseFloat(row.position.toFixed(1)),
    }));

    let opportunityQueries: any[] = [];
    if (oppRes.ok) {
      const oppData = await oppRes.json();
      opportunityQueries = (oppData.rows || [])
        .map((row: any) => ({
          query: row.keys[0],
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: parseFloat((row.ctr * 100).toFixed(1)),
          position: parseFloat(row.position.toFixed(1)),
        }))
        .filter((q: any) => q.impressions >= 50 && q.ctr < 5.0)
        .slice(0, 15);
    }

    let topLandingPages: any[] = [];
    if (landingPagesRes.ok) {
      const landingData = await landingPagesRes.json();
      topLandingPages = (landingData.rows || []).map((row: any) => ({
        page: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: parseFloat((row.ctr * 100).toFixed(1)),
        position: parseFloat(row.position.toFixed(1)),
      }));
    }

    // ── Canonical tag check via URL Inspection API ────────────────────────────
    // Inspect the homepage + up to 2 top landing pages to detect canonical misconfig.
    // A canonical pointing to a different domain (e.g. staging server) means Google
    // ignores the live domain entirely — the most severe indexing failure possible.
    let canonicalIssue: {
      detected: boolean;
      inspectedUrl: string;
      declaredCanonical: string;
      googleCanonical: string;
      coverageState: string;
      verdict: string;
    } | null = null;

    try {
      const liveDomain = new URL(siteUrl).hostname.replace(/^www\./, "");
      // Pick up to 3 URLs to inspect: homepage first, then top pages
      const urlsToInspect: string[] = [];
      // Normalise siteUrl to get the homepage
      const homepageUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
      urlsToInspect.push(homepageUrl);
      for (const p of topLandingPages.slice(0, 2)) {
        if (p.page && p.page !== homepageUrl && p.page !== homepageUrl + "/") {
          urlsToInspect.push(p.page);
        }
      }

      const inspectApiUrl = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

      for (const inspectUrl of urlsToInspect) {
        const inspRes = await fetch(inspectApiUrl, {
          method: "POST",
          headers: { ...authHeader },
          body: JSON.stringify({ inspectionUrl: inspectUrl, siteUrl }),
        });
        if (!inspRes.ok) break; // API unavailable — skip silently

        const inspData = await inspRes.json();
        const result = inspData?.inspectionResult?.indexStatusResult;
        if (!result) continue;

        const declared: string = result.userDeclaredCanonical ?? "";
        const google: string   = result.googleCanonical ?? "";
        const coverage: string = result.coverageState ?? "";

        // Canonical mismatch: declared canonical points to a different domain than the live site
        if (declared) {
          let declaredDomain = "";
          try { declaredDomain = new URL(declared).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
          if (declaredDomain && declaredDomain !== liveDomain) {
            canonicalIssue = {
              detected: true,
              inspectedUrl: inspectUrl,
              declaredCanonical: declared,
              googleCanonical: google,
              coverageState: coverage,
              verdict: `Page canonical tag points to "${declaredDomain}" instead of "${liveDomain}" — Google will not index this page`,
            };
            break; // Found the issue — no need to check more pages
          }
        }

        // Also flag if Google's canonical disagrees with the live domain (even if declared looks OK)
        if (!canonicalIssue && google) {
          let googleDomain = "";
          try { googleDomain = new URL(google).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
          if (googleDomain && googleDomain !== liveDomain) {
            canonicalIssue = {
              detected: true,
              inspectedUrl: inspectUrl,
              declaredCanonical: declared,
              googleCanonical: google,
              coverageState: coverage,
              verdict: `Google is treating "${googleDomain}" as the canonical domain instead of "${liveDomain}"`,
            };
            break;
          }
        }
      }
    } catch (_e) {
      // Canonical check is non-blocking — if it fails, proceed without it
    }

    return new Response(JSON.stringify({
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
      opportunityQueries,
      topLandingPages,
      canonicalIssue,
    }), {
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
