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
  state: string;
  subcategory: string;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  bounce: number;
  hardBounce: number;
  softBounce: number;
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

const BRAND_TO_BU: Record<string, string[]> = {
  "ABG Hospitality":    ["1982882"],
  "Accessible Home Store": ["2625978"],
  "Aker":               ["1982881"],
  "Aquarius":           ["1982883"],
  "Aquatic":            ["1982884"],
  "Bootz":              ["1982886"],
  "Clarion":            ["1982887"],
  "Comfort Designs":    ["1982888"],
  "DreamLine":          ["1690059"],
  "Florestone":         ["1690060"],
  "Hamilton":           ["1982889"],
  "IMI":                ["1982890"],
  "Laurel Mountain":    ["1982879"],
  "MAAX":               ["1982891"],
  "Maidstone":          ["1982892"],
  "Neptune":            ["1690061"],
  "RBS":                ["1982893"],
  "Swan":               ["843133"],
  "Vintage.ca":         ["2659249"],
  "American Bath Group":["0"],
};

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
    let url = "/marketing/v3/emails?limit=100&orderBy=-publishDate&isPublished=true&property=hs_publish_date&property=hs_published_by_name&property=brand&property=state&property=subcategory";
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

// ─── compute stats for a set of emails ───

interface PeriodStats {
  totalSent: number;
  totalDelivered: number;
  totalOpens: number;
  totalClicks: number;
  totalBounce: number;
  totalHardBounce: number;
  totalSoftBounce: number;
  totalUnsub: number;
  totalSpam: number;
  totalPending: number;
  totalEmails: number;
}

async function computeStats(
  filteredEmails: any[],
  token: string,
  brandName: string,
): Promise<{ stats: PeriodStats; emails: (EmailRecord & { pending: number })[]; deliveryByDate: Record<string, number> }> {
  const stats: PeriodStats = {
    totalSent: 0, totalDelivered: 0, totalOpens: 0, totalClicks: 0,
    totalBounce: 0, totalHardBounce: 0, totalSoftBounce: 0,
    totalUnsub: 0, totalSpam: 0, totalPending: 0, totalEmails: 0,
  };
  const emails: (EmailRecord & { pending: number })[] = [];
  const deliveryByDate: Record<string, number> = {};

  for (let i = 0; i < filteredEmails.length; i += 10) {
    const batch = filteredEmails.slice(i, i + 10);
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
        const hardbounced = counters.hardbounced || 0;
        const softbounced = counters.softbounced || 0;
        const unsubscribe = counters.unsubscribed || 0;
        const spam = counters.spamreport || 0;
        const pending = counters.pending || Math.max(0, sent - delivered - bounce);

        const publishDate = extractPublishDate(email) ?? "";
        const sender = email?.publishedByName || "";
        const emailBuId = String(email.businessUnitId ?? "0");
        const displayBrand = BU_TO_BRAND[emailBuId] || brandName;

        const state = email?.state || email?.properties?.state || "PUBLISHED";
        const subcategory = email?.subcategory || email?.properties?.subcategory || "marketing_email";

        const openRate = delivered > 0 ? parseFloat(((opens / delivered) * 100).toFixed(1)) : 0;
        const clickRate = delivered > 0 ? parseFloat(((clicks / delivered) * 100).toFixed(1)) : 0;
        const deliveredRate = sent > 0 ? parseFloat(((delivered / sent) * 100).toFixed(1)) : 0;
        const unsubscribeRate = sent > 0 ? parseFloat(((unsubscribe / sent) * 100).toFixed(2)) : 0;
        const bounceRate = sent > 0 ? parseFloat(((bounce / sent) * 100).toFixed(2)) : 0;
        const spamRate = sent > 0 ? parseFloat(((spam / sent) * 100).toFixed(2)) : 0;

        if (publishDate) {
          deliveryByDate[publishDate] = (deliveryByDate[publishDate] || 0) + delivered;
        }

        return {
          id: email?.id || null,
          name: email?.name || "Untitled",
          brandName: displayBrand,
          subject: email?.subject || "",
          sender, publishDate, state, subcategory,
          sent, delivered, opens, clicks,
          bounce, hardBounce: hardbounced, softBounce: softbounced,
          unsubscribe, spam, pending,
          openRate, clickRate, deliveredRate, unsubscribeRate, bounceRate, spamRate,
        } as EmailRecord & { pending: number; id: string | null };
      }),
    );

    for (const record of results) {
      if (!record) continue;
      stats.totalSent += record.sent;
      stats.totalDelivered += record.delivered;
      stats.totalOpens += record.opens;
      stats.totalClicks += record.clicks;
      stats.totalBounce += record.bounce;
      stats.totalHardBounce += record.hardBounce;
      stats.totalSoftBounce += record.softBounce;
      stats.totalUnsub += record.unsubscribe;
      stats.totalSpam += record.spam;
      stats.totalPending += record.pending;
      emails.push(record);
    }
  }

  stats.totalEmails = emails.length;
  return { stats, emails, deliveryByDate };
}

// ─── compute previous period date range ───

function getPreviousPeriod(startDate: string, endDate: string): { prevStart: string; prevEnd: string } {
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  const diffMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 86400000); // day before start
  const prevStart = new Date(prevEnd.getTime() - diffMs);
  return {
    prevStart: prevStart.toISOString().split("T")[0],
    prevEnd: prevEnd.toISOString().split("T")[0],
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return current > 0 ? 100 : -100;
  return parseFloat((((current - previous) / previous) * 100).toFixed(2));
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

    // ── Contacts / lifecycle (filtered by brand business unit) ──
    const buIds = BRAND_TO_BU[brandName];
    const brandBuId = buIds ? buIds[0] : null;

    let totalContacts = 0;
    try {
      const searchBody: any = { limit: 0 };
      if (brandBuId && brandBuId !== "0") {
        searchBody.filterGroups = [{ filters: [{ propertyName: "hs_all_assigned_business_unit_ids", operator: "CONTAINS_TOKEN", value: brandBuId }] }];
      }
      const res = await hubspotPost("/crm/v3/objects/contacts/search", token, searchBody);
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
          const filters: any[] = [
            { propertyName: "lifecyclestage", operator: "EQ", value: ls.stage.toLowerCase().replace(/ /g, "") },
          ];
          if (brandBuId && brandBuId !== "0") {
            filters.push({ propertyName: "hs_all_assigned_business_unit_ids", operator: "CONTAINS_TOKEN", value: brandBuId });
          }
          const data = await hubspotPost("/crm/v3/objects/contacts/search", token, {
            filterGroups: [{ filters }],
            limit: 0,
          });
          ls.count = data.total || 0;
        } catch { /* skip */ }
      }),
    );

    // ── Filter emails by businessUnitId ──
    const allRawEmails = await fetchAllEmails(token);
    console.log(`Total emails before filter: ${allRawEmails.length}`);

    // buIds already defined above for lifecycle filtering
    const brandFiltered: any[] = [];

    for (const email of allRawEmails) {
      const emailBuId = String(email.businessUnitId ?? "0");
      if (buIds && buIds.includes(emailBuId)) {
        brandFiltered.push(email);
      }
    }

    console.log(`Total emails after brand filter: ${brandFiltered.length}`);

    // ── Date filter current period ──
    const dateFiltered = brandFiltered.filter((email) => {
      const dateStr = extractPublishDate(email);
      if (!dateStr) return false;
      return dateStr >= startDate && dateStr <= endDate;
    });
    console.log(`Total emails after date filter (current): ${dateFiltered.length}`);

    // ── Date filter previous period ──
    const { prevStart, prevEnd } = getPreviousPeriod(startDate, endDate);
    console.log(`Previous period: ${prevStart} to ${prevEnd}`);

    const prevDateFiltered = brandFiltered.filter((email) => {
      const dateStr = extractPublishDate(email);
      if (!dateStr) return false;
      return dateStr >= prevStart && dateStr <= prevEnd;
    });
    console.log(`Total emails in previous period: ${prevDateFiltered.length}`);

    // ── Compute stats for both periods ──
    const current = await computeStats(dateFiltered, token, brandName);
    const prev = await computeStats(prevDateFiltered, token, brandName);

    const s = current.stats;
    const p = prev.stats;

    console.log(`Final stats: sent=${s.totalSent} delivered=${s.totalDelivered} opens=${s.totalOpens} clicks=${s.totalClicks}`);

    const openRate = s.totalDelivered > 0 ? parseFloat(((s.totalOpens / s.totalDelivered) * 100).toFixed(1)) : 0;
    const clickRate = s.totalDelivered > 0 ? parseFloat(((s.totalClicks / s.totalDelivered) * 100).toFixed(1)) : 0;
    const bounceRate = s.totalSent > 0 ? parseFloat(((s.totalBounce / s.totalSent) * 100).toFixed(2)) : 0;
    const unsubscribeRate = s.totalSent > 0 ? parseFloat(((s.totalUnsub / s.totalSent) * 100).toFixed(2)) : 0;
    const deliveredRate = s.totalSent > 0 ? parseFloat(((s.totalDelivered / s.totalSent) * 100).toFixed(1)) : 0;
    const pendingRate = s.totalSent > 0 ? parseFloat(((s.totalPending / s.totalSent) * 100).toFixed(2)) : 0;
    const hardBounceRate = s.totalSent > 0 ? parseFloat(((s.totalHardBounce / s.totalSent) * 100).toFixed(2)) : 0;
    const softBounceRate = s.totalSent > 0 ? parseFloat(((s.totalSoftBounce / s.totalSent) * 100).toFixed(2)) : 0;
    const spamRate = s.totalSent > 0 ? parseFloat(((s.totalSpam / s.totalSent) * 100).toFixed(2)) : 0;

    // Previous period rates
    const prevOpenRate = p.totalDelivered > 0 ? parseFloat(((p.totalOpens / p.totalDelivered) * 100).toFixed(1)) : 0;
    const prevClickRate = p.totalDelivered > 0 ? parseFloat(((p.totalClicks / p.totalDelivered) * 100).toFixed(1)) : 0;
    const prevBounceRate = p.totalSent > 0 ? parseFloat(((p.totalBounce / p.totalSent) * 100).toFixed(2)) : 0;
    const prevUnsubscribeRate = p.totalSent > 0 ? parseFloat(((p.totalUnsub / p.totalSent) * 100).toFixed(2)) : 0;
    const prevDeliveredRate = p.totalSent > 0 ? parseFloat(((p.totalDelivered / p.totalSent) * 100).toFixed(1)) : 0;
    const prevHardBounceRate = p.totalSent > 0 ? parseFloat(((p.totalHardBounce / p.totalSent) * 100).toFixed(2)) : 0;
    const prevSoftBounceRate = p.totalSent > 0 ? parseFloat(((p.totalSoftBounce / p.totalSent) * 100).toFixed(2)) : 0;
    const prevSpamRate = p.totalSent > 0 ? parseFloat(((p.totalSpam / p.totalSent) * 100).toFixed(2)) : 0;

    const healthScore = Math.min(
      10,
      Math.max(1, parseFloat((openRate / 5 + clickRate / 2 - bounceRate * 2 - unsubscribeRate * 5 + 2).toFixed(1))),
    );

    const deliveryOverTime = Object.entries(current.deliveryByDate)
      .map(([date, count]) => ({ date, delivered: count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const stateDistribution: Record<string, number> = {};
    const subcategoryDistribution: Record<string, number> = {};
    for (const e of current.emails) {
      const st = e.state || "PUBLISHED";
      const sub = e.subcategory || "marketing_email";
      stateDistribution[st] = (stateDistribution[st] || 0) + 1;
      subcategoryDistribution[sub] = (subcategoryDistribution[sub] || 0) + 1;
    }

    const result = {
      totalContacts, healthScore, openRate,
      openRateLabel: getBenchmarkLabel("openRate", openRate),
      clickRate,
      clickRateLabel: getBenchmarkLabel("clickRate", clickRate),
      bounceRate, hardBounceRate, softBounceRate,
      bounceRateLabel: getBenchmarkLabel("bounceRate", bounceRate),
      unsubscribeRate,
      unsubscribeRateLabel: getBenchmarkLabel("unsubscribeRate", unsubscribeRate),
      spamReports: s.totalSpam,
      spamRate,
      totalEmailsSent: s.totalSent,
      totalEmails: current.emails.length,
      totalOpens: s.totalOpens, totalClicks: s.totalClicks,
      totalDelivered: s.totalDelivered, totalBounce: s.totalBounce,
      totalHardBounce: s.totalHardBounce, totalSoftBounce: s.totalSoftBounce,
      totalUnsub: s.totalUnsub, totalPending: s.totalPending,
      pendingRate, deliveredRate,
      lifecycleStages, emails: current.emails,
      deliveryOverTime,
      stateDistribution: Object.entries(stateDistribution).map(([name, value]) => ({ name, value })),
      subcategoryDistribution: Object.entries(subcategoryDistribution).map(([name, value]) => ({ name, value })),
      totalFetched: allRawEmails.length,
      brandFilteredCount: brandFiltered.length,
      businessUnitId: null,
      // Previous period comparison deltas
      deltas: {
        sent: pctChange(s.totalSent, p.totalSent),
        delivered: pctChange(s.totalDelivered, p.totalDelivered),
        opens: pctChange(s.totalOpens, p.totalOpens),
        clicks: pctChange(s.totalClicks, p.totalClicks),
        deliveredRate: pctChange(deliveredRate, prevDeliveredRate),
        openRate: pctChange(openRate, prevOpenRate),
        clickRate: pctChange(clickRate, prevClickRate),
        bounce: pctChange(s.totalBounce, p.totalBounce),
        unsubscribed: pctChange(s.totalUnsub, p.totalUnsub),
        hardBounce: pctChange(s.totalHardBounce, p.totalHardBounce),
        softBounce: pctChange(s.totalSoftBounce, p.totalSoftBounce),
        spam: pctChange(s.totalSpam, p.totalSpam),
        bounceRate: pctChange(bounceRate, prevBounceRate),
        unsubscribeRate: pctChange(unsubscribeRate, prevUnsubscribeRate),
        hardBounceRate: pctChange(hardBounceRate, prevHardBounceRate),
        softBounceRate: pctChange(softBounceRate, prevSoftBounceRate),
        spamRate: pctChange(spamRate, prevSpamRate),
      },
      prevPeriod: { start: prevStart, end: prevEnd },
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
