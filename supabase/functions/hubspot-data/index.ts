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
  brandName: string;
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

// ─── date extraction using hs_publish_date ───

function extractPublishDate(email: any): string | null {
  const hsPublishDate = email?.hs_publish_date;
  if (hsPublishDate) {
    const d = new Date(hsPublishDate);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  const candidates = [email?.publishDate, email?.publishedAt, email?.updatedAt];
  for (const c of candidates) {
    if (!c) continue;
    const d = new Date(typeof c === "number" ? (c < 1e12 ? c * 1000 : c) : c);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return null;
}

// ─── Brand → businessUnitId mapping ───
// IMI = 1982890 (was incorrectly under ABG Hospitality before)

const BRAND_TO_BU: Record<string, string[]> = {
  "Bootz":              ["1982886"],
  "Swan":               ["843133"],
  "Neptune":            ["1690061"],
  "MAAX":               ["1982891"],
  "Hamilton":           ["1982889"],
  "Comfort Designs":    ["1982888"],
  "Maidstone":          ["1982892"],
  "Florestone":         ["1690060"],
  "Laurel Mountain":    ["1982879"],
  "ABG Hospitality":    ["1982882"],
  "Aquarius":           ["1982883"],
  "Aquatic":            ["1982884"],
  "Clarion":            ["1982887"],
  "RBS":                ["1982893"],
  "American Bath Group":["0"],
  "DreamLine":          ["1690059"],
  "Aker":               ["1982881"],
  "IMI":                ["1982890"],
};

// Reverse map: businessUnitId → brand name (for Brand column display)
const BU_TO_BRAND: Record<string, string> = {};
for (const [brand, ids] of Object.entries(BRAND_TO_BU)) {
  for (const id of ids) BU_TO_BRAND[id] = brand;
}

// ─── fetch all published emails ───

async function fetchAllEmails(token: string): Promise<any[]> {
  const all: any[] = [];
  let after: string | undefined;
  let page = 0;

  while (page < 50) {
    let url = "/marketing/v3/emails?limit=100&orderBy=-publishDate&isPublished=true&property=hs_publish_date&property=hs_published_by_name&property=brand";
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

async function fetchCampaignStats(token: string, campaignId: string): Promise<any | null> {
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

    // Debug mode
    if (body.debug === true) {
      let businessUnits: any[] = [];
      try {
        const buRes = await hubspotFetch("/business-units/v3/business-units/user/me", token);
        businessUnits = buRes.results || [];
      } catch (e) {
        console.log("Business Units API error:", e);
      }

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

    // ── Filter emails by businessUnitId ──
    const allRawEmails = await fetchAllEmails(token);
    console.log(`Total emails before filter: ${allRawEmails.length}`);

    const buIds = BRAND_TO_BU[brandName];
    const brandFiltered: any[] = [];

    for (const email of allRawEmails) {
      const emailBuId = String(email.businessUnitId ?? "0");
      if (buIds && buIds.includes(emailBuId)) {
        brandFiltered.push(email);
      }
    }

    console.log(`Total emails after brand filter: ${brandFiltered.length}`);
    console.log(`Matched emails: ${JSON.stringify(brandFiltered.map((e: any) => `${e?.name} (BU:${e.businessUnitId})`))}`);

    // ── Date filter by hs_publish_date ──
    const dateFiltered = brandFiltered.filter((email) => {
      const dateStr = extractPublishDate(email);
      if (!dateStr) return false;
      return dateStr >= startDate && dateStr <= endDate;
    });

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
          if (!campaignId) return null;

          const statsRes = await fetchCampaignStats(token, campaignId);
          const counters = statsRes?.counters;
          if (!counters) return null;

          const sent = counters.sent || 0;
          const delivered = counters.delivered || 0;
          const opens = counters.open || 0;
          const clicks = counters.click || 0;
          const bounce = counters.bounce || 0;
          const unsubscribe = counters.unsubscribed || 0;
          const spam = counters.spamreport || 0;

          const publishDate = extractPublishDate(email) ?? "";
          const sender = email?.publishedByName || "";
          // Brand name from BU mapping for display
          const emailBuId = String(email.businessUnitId ?? "0");
          const displayBrand = BU_TO_BRAND[emailBuId] || brandName;

          const openRate = delivered > 0 ? parseFloat(((opens / delivered) * 100).toFixed(1)) : 0;
          const clickRate = delivered > 0 ? parseFloat(((clicks / delivered) * 100).toFixed(1)) : 0;
          const deliveredRate = sent > 0 ? parseFloat(((delivered / sent) * 100).toFixed(1)) : 0;
          const unsubscribeRate = sent > 0 ? parseFloat(((unsubscribe / sent) * 100).toFixed(2)) : 0;
          const bounceRate = sent > 0 ? parseFloat(((bounce / sent) * 100).toFixed(2)) : 0;
          const spamRate = sent > 0 ? parseFloat(((spam / sent) * 100).toFixed(2)) : 0;

          return {
            name: email?.name || "Untitled",
            brandName: displayBrand,
            subject: email?.subject || "",
            sender,
            publishDate,
            sent, delivered, opens, clicks, bounce, unsubscribe, spam,
            openRate, clickRate, deliveredRate, unsubscribeRate, bounceRate, spamRate,
          } as EmailRecord;
        }),
      );

      for (const record of results) {
        if (!record) continue;
        totalSent += record.sent;
        totalDelivered += record.delivered;
        totalOpens += record.opens;
        totalClicks += record.clicks;
        totalBounce += record.bounce;
        totalUnsub += record.unsubscribe;
        totalSpam += record.spam;
        console.log(`Email stats: sent=${record.sent} opens=${record.opens} clicks=${record.clicks} — "${record.name}"`);
        emails.push(record);
      }
    }

    console.log(`Final stats: sent=${totalSent} opens=${totalOpens} delivered=${totalDelivered} clicks=${totalClicks}`);

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
      totalContacts, healthScore, openRate,
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
      totalOpens, totalClicks, deliveredRate,
      lifecycleStages, emails,
      totalFetched: allRawEmails.length,
      brandFilteredCount: brandFiltered.length,
      businessUnitId: null,
    };

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
