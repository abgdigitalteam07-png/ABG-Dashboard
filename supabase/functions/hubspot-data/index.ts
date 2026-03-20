const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface HubSpotRequest {
  brandName: string;
  startDate: string;
  endDate: string;
  debug?: boolean;
}

interface EmailRecord {
  name: string;
  subject: string;
  sender: string;
  publishDate: string;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  bounce: number;
  unsubscribe: number;
  spam: number;
  openRate: number;
  clickRate: number;
  deliveredRate: number;
  unsubscribeRate: number;
  bounceRate: number;
  spamRate: number;
}

// ─── helpers ───

async function hubspotFetch(path: string, token: string) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HubSpot API error (${path}): ${res.status} ${err.slice(0, 200)}`);
  }
  return res.json();
}

async function hubspotPost(path: string, token: string, body: unknown) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HubSpot API error (${path}): ${res.status} ${err.slice(0, 200)}`);
  }
  return res.json();
}

function getBenchmarkLabel(metric: string, value: number): string {
  if (metric === "openRate") return value >= 25 ? "Excellent" : value >= 18 ? "Good" : "Needs work";
  if (metric === "clickRate") return value >= 4 ? "Excellent" : value >= 2.5 ? "Good" : "Needs work";
  if (metric === "bounceRate") return value <= 0.5 ? "Excellent" : value <= 1.5 ? "Good" : "Needs work";
  if (metric === "unsubscribeRate") return value <= 0.2 ? "Excellent" : value <= 0.5 ? "Good" : "Needs work";
  return "Good";
}

// ─── date extraction ───

function extractDateStr(email: any): string | null {
  const candidates = [
    email?.publishDate,
    email?.publishedAt,
    email?.sendDate,
    email?.scheduledAt,
    email?.updatedAt,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const d = new Date(typeof c === "number" ? (c < 1e12 ? c * 1000 : c) : c);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return null;
}

// ─── Brand → businessUnitId mapping (source of truth from HubSpot) ───
// Discovered via debug: each brand has a dedicated businessUnitId.
// BU "0" is the corporate/catch-all (American Bath Group).
// BU "843133" is shared (Swan, ASD, etc.) — needs fromName secondary filter.

const BRAND_TO_BU: Record<string, string[]> = {
  "Bootz":              ["1982886"],
  "Swan":               ["843133"],     // shared BU, needs fromName filter
  "Neptune":            ["1690061"],
  "MAAX":               ["1982891"],
  "Hamilton":           ["1982889"],
  "Comfort Designs":    ["1982888"],
  "Maidstone":          ["1982892"],
  "Florestone":         ["1690060"],
  "Laurel Mountain":    ["1982879"],
  "ABG Hospitality":    ["1982882", "1982890"],
  "Aquarius":           ["1982883"],
  "Aquatic":            ["1982884"],
  "Clarion":            ["1982887"],
  "RBS":                ["1982893"],
  "American Bath Group":["0"],
  "DreamLine":          ["1690059"],
  "Aker":               ["1982881"],
};

// BUs where multiple brands share the same unit — require fromName check
const SHARED_BUS = new Set(["0", "843133"]);

// fromName mapping for brands in shared BUs
const BRAND_FROM_NAMES: Record<string, string[]> = {
  "Swan":               ["Swan"],
  "American Bath Group":["American Bath Group"],
};

function matchEmailToBrand(
  email: any,
  brandName: string,
): { matched: boolean; reason: string } {
  const buIds = BRAND_TO_BU[brandName];
  const emailBuId = String(email.businessUnitId || "0");

  // If brand has known BU IDs, filter by them
  if (buIds) {
    if (!buIds.includes(emailBuId)) {
      return { matched: false, reason: "" };
    }
    // For shared BUs, also check fromName
    if (SHARED_BUS.has(emailBuId)) {
      const fromName = (email?.from?.fromName || "").trim().toLowerCase();
      const allowedNames = BRAND_FROM_NAMES[brandName] || [brandName];
      const nameMatch = allowedNames.some(n => fromName === n.toLowerCase());
      if (nameMatch) {
        return { matched: true, reason: `BU-${emailBuId}+fromName` };
      }
      return { matched: false, reason: "" };
    }
    return { matched: true, reason: `BU-${emailBuId}` };
  }

  // Fallback for brands not in the map (e.g. IMI): match by fromName only
  const fromName = (email?.from?.fromName || "").trim().toLowerCase();
  if (fromName === brandName.toLowerCase()) {
    return { matched: true, reason: "fromName-exact-fallback" };
  }
  return { matched: false, reason: "" };
}

// ─── fetch all published emails ───

async function fetchAllEmails(token: string): Promise<any[]> {
  const all: any[] = [];
  let after: string | undefined;
  let page = 0;

  while (page < 50) {
    let url = "/marketing/v3/emails?limit=100&orderBy=-publishDate&isPublished=true";
    if (after) url += `&after=${after}`;

    try {
      const res = await hubspotFetch(url, token);
      all.push(...(res.results || []));
      if (res.paging?.next?.after) {
        after = res.paging.next.after;
        page++;
      } else {
        break;
      }
    } catch (err) {
      console.error("Error fetching v3 emails:", err);
      break;
    }
  }

  console.log(`Fetched ${all.length} published emails via v3 API`);
  return all;
}

// ─── campaign stats ───

async function fetchCampaignStats(
  token: string,
  campaignId: string,
): Promise<any | null> {
  try {
    return await hubspotFetch(`/email/public/v1/campaigns/${campaignId}`, token);
  } catch {
    return null;
  }
}

// ─── main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("HUBSPOT_ACCESS_TOKEN");
    if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN not configured");

    const body: HubSpotRequest = await req.json();

    // Debug mode - discover businessUnitId → brand mapping
    if (body.debug === true) {
      // Try business units API
      let businessUnits: any[] = [];
      try {
        const buRes = await hubspotFetch("/business-units/v3/business-units/user/me", token);
        businessUnits = buRes.results || [];
        console.log("Business Units API:", JSON.stringify(businessUnits.map((bu: any) => ({ id: bu.id, name: bu.name })), null, 2));
      } catch (e) {
        console.log("Business Units API error (expected if no scope):", e);
      }

      // Fetch all emails and build businessUnitId → fromName mapping
      const allEmails = await fetchAllEmails(token);
      const buMap: Record<string, { fromNames: Set<string>; names: string[] }> = {};
      for (const email of allEmails) {
        const buId = email.businessUnitId || "none";
        if (!buMap[buId]) buMap[buId] = { fromNames: new Set(), names: [] };
        buMap[buId].fromNames.add(email?.from?.fromName || "Unknown");
        if (buMap[buId].names.length < 3) buMap[buId].names.push(email?.name || "Untitled");
      }
      const buSummary = Object.entries(buMap).map(([id, data]) => ({
        businessUnitId: id,
        fromNames: Array.from(data.fromNames),
        sampleEmails: data.names,
      }));
      console.log("BusinessUnitId mapping:", JSON.stringify(buSummary, null, 2));

      return new Response(
        JSON.stringify({ debug: true, businessUnits, buSummary }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { brandName, startDate, endDate } = body;
    if (!brandName || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Fetching HubSpot data for brand="${brandName}", ${startDate} to ${endDate}`);

    // ── Contacts / lifecycle ──
    let totalContacts = 0;
    try {
      const res = await hubspotPost("/crm/v3/objects/contacts/search", token, { limit: 0 });
      totalContacts = res.total || 0;
    } catch { /* ignore */ }

    const lifecycleStages = [
      { stage: "Subscriber", count: 0 },
      { stage: "Lead", count: 0 },
      { stage: "MQL", count: 0 },
      { stage: "SQL", count: 0 },
      { stage: "Opportunity", count: 0 },
      { stage: "Customer", count: 0 },
    ];
    await Promise.all(
      lifecycleStages.map(async (ls) => {
        try {
          const data = await hubspotPost("/crm/v3/objects/contacts/search", token, {
            filterGroups: [{ filters: [{ propertyName: "lifecyclestage", operator: "EQ", value: ls.stage.toLowerCase().replace(/ /g, "") }] }],
            limit: 0,
          });
          ls.count = data.total || 0;
        } catch { /* skip */ }
      }),
    );

    // ── Fetch & filter emails ──
    const allRawEmails = await fetchAllEmails(token);
    console.log(`Total emails before filter: ${allRawEmails.length}`);

    const brandFiltered: any[] = [];
    const matchReasons: { name: string; reason: string; fromName: string }[] = [];

    for (const email of allRawEmails) {
      const result = matchEmailToBrand(email, brandName);
      if (result.matched) {
        brandFiltered.push(email);
        matchReasons.push({
          name: email?.name || "Untitled",
          reason: result.reason,
          fromName: email?.from?.fromName || "Unknown",
        });
      }
    }

    console.log(`Total emails after brand filter: ${brandFiltered.length}`);
    console.log(`Matched emails: ${JSON.stringify(matchReasons.map(m => `${m.name} [${m.reason}] (from: ${m.fromName})`))}`);

    // ── Date filter by publishDate strictly ──
    const dateFiltered = brandFiltered.filter((email) => {
      const dateStr = extractDateStr(email);
      if (!dateStr) return false;
      return dateStr >= startDate && dateStr <= endDate;
    });

    console.log(`Date filtering: publishDate must be between ${startDate} and ${endDate}`);
    console.log(`Total emails after date filter: ${dateFiltered.length}`);

    // ── Stats via campaigns API ──
    let totalSent = 0, totalDelivered = 0, totalOpens = 0, totalClicks = 0;
    let totalBounce = 0, totalUnsub = 0, totalSpam = 0;
    const emails: EmailRecord[] = [];

    for (let i = 0; i < dateFiltered.length; i += 10) {
      const batch = dateFiltered.slice(i, i + 10);
      const results = await Promise.all(
        batch.map(async (email: any) => {
          const campaignId = email?.primaryEmailCampaignId;
          const counters = campaignId
            ? (await fetchCampaignStats(token, campaignId))?.counters
            : null;

          const publishDate = extractDateStr(email) ?? "";
          const sender = email?.from?.fromName || "Unknown";

          const sent = counters?.sent || 0;
          const delivered = counters?.delivered || 0;
          const opens = counters?.open || 0;
          const clicks = counters?.click || 0;
          const bounce = counters?.bounce || 0;
          const unsubscribe = counters?.unsubscribed || 0;
          const spam = counters?.spamreport || 0;

          const openRate = delivered > 0 ? parseFloat(((opens / delivered) * 100).toFixed(1)) : 0;
          const clickRate = delivered > 0 ? parseFloat(((clicks / delivered) * 100).toFixed(1)) : 0;
          const deliveredRate = sent > 0 ? parseFloat(((delivered / sent) * 100).toFixed(1)) : 0;
          const unsubscribeRate = sent > 0 ? parseFloat(((unsubscribe / sent) * 100).toFixed(2)) : 0;
          const bounceRate = sent > 0 ? parseFloat(((bounce / sent) * 100).toFixed(2)) : 0;
          const spamRate = sent > 0 ? parseFloat(((spam / sent) * 100).toFixed(2)) : 0;

          return {
            name: email?.name || "Untitled",
            subject: email?.subject || "",
            sender,
            publishDate,
            sent,
            delivered,
            opens,
            clicks,
            bounce,
            unsubscribe,
            spam,
            openRate,
            clickRate,
            deliveredRate,
            unsubscribeRate,
            bounceRate,
            spamRate,
          } as EmailRecord;
        }),
      );

      const inRangeRecords = results.filter((record): record is EmailRecord => record !== null);
      for (const record of inRangeRecords) {
        totalSent += record.sent;
        totalDelivered += record.delivered;
        totalOpens += record.opens;
        totalClicks += record.clicks;
        totalBounce += record.bounce;
        totalUnsub += record.unsubscribe;
        totalSpam += record.spam;
        console.log(
          `Email stats: sent=${record.sent} opens=${record.opens} clicks=${record.clicks} delivered=${record.delivered} — "${record.name}"`,
        );
      }
      emails.push(...inRangeRecords);
    }

    console.log(`Total emails after date filter: ${emails.length}`);

    console.log(`Final stats: sent=${totalSent} opens=${totalOpens} delivered=${totalDelivered} clicks=${totalClicks} bounce=${totalBounce}`);

    const openRate = totalDelivered > 0 ? parseFloat(((totalOpens / totalDelivered) * 100).toFixed(1)) : 0;
    const clickRate = totalDelivered > 0 ? parseFloat(((totalClicks / totalDelivered) * 100).toFixed(1)) : 0;
    const bounceRate = totalSent > 0 ? parseFloat(((totalBounce / totalSent) * 100).toFixed(2)) : 0;
    const unsubscribeRate = totalSent > 0 ? parseFloat(((totalUnsub / totalSent) * 100).toFixed(2)) : 0;
    const deliveredRate = totalSent > 0 ? parseFloat(((totalDelivered / totalSent) * 100).toFixed(1)) : 0;

    const healthScore = Math.min(
      10,
      Math.max(1, parseFloat((openRate / 5 + clickRate / 2 - bounceRate * 2 - unsubscribeRate * 5 + 2).toFixed(1))),
    );

    const result = {
      totalContacts,
      healthScore,
      openRate,
      openRateLabel: getBenchmarkLabel("openRate", openRate),
      clickRate,
      clickRateLabel: getBenchmarkLabel("clickRate", clickRate),
      bounceRate,
      bounceRateLabel: getBenchmarkLabel("bounceRate", bounceRate),
      unsubscribeRate,
      unsubscribeRateLabel: getBenchmarkLabel("unsubscribeRate", unsubscribeRate),
      spamReports: totalSpam,
      totalEmailsSent: totalSent,
      totalEmails: emails.length,
      totalOpens,
      totalClicks,
      deliveredRate,
      lifecycleStages,
      emails,
      totalFetched: allRawEmails.length,
      brandFilteredCount: brandFiltered.length,
      businessUnitId: null,
    };

    console.log(`Result: ${emails.length} emails, openRate=${openRate}, clickRate=${clickRate}, totalSent=${totalSent}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("HubSpot proxy error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
