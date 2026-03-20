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

interface BusinessUnit {
  id: string;
  name: string;
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

// ─── business units ───

async function fetchBusinessUnits(token: string): Promise<BusinessUnit[]> {
  try {
    const res = await hubspotFetch("/business-units/v3/business-units/user/me", token);
    const units: BusinessUnit[] = (res.results || []).map((u: any) => ({
      id: String(u.id),
      name: u.name,
    }));
    console.log(`Business units found: ${JSON.stringify(units)}`);
    return units;
  } catch (err) {
    console.error("Failed to fetch business units:", err);
    return [];
  }
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

async function fetchCampaignStats(token: string, campaignId: string): Promise<any | null> {
  try {
    return await hubspotFetch(`/email/public/v1/campaigns/${campaignId}`, token);
  } catch {
    return null;
  }
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

// ─── STRICT brand matching ───

/**
 * Tokenize a string into lowercase words (split on spaces, hyphens, underscores, dots).
 */
function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[\s\-_\.]+/).filter(Boolean);
}

/**
 * Check if `text` contains the brand name as a **whole word / token boundary** match.
 * e.g. brand="Swan" matches "Swan Xpress" but NOT "Swanstone Newsletter".
 *      brand="MAAX" matches "MAAX Spring" but NOT "MAAXIMA".
 */
function exactWordMatch(text: string, brandName: string): boolean {
  if (!text) return false;
  // Build a regex that matches the brand name surrounded by word boundaries.
  // We escape special regex chars in the brand name.
  const escaped = brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|[\\s\\-_.,;:!?\\/|()\\[\\]])${escaped}(?:[\\s\\-_.,;:!?\\/|()\\[\\]]|$)`, "i");
  return regex.test(text);
}

/**
 * Check if the email name starts with the brand name (case-insensitive),
 * followed by a separator or end-of-string.
 */
function nameStartsWith(emailName: string, brandName: string): boolean {
  if (!emailName) return false;
  const lower = emailName.toLowerCase();
  const bn = brandName.toLowerCase();
  if (!lower.startsWith(bn)) return false;
  // Must be followed by separator or end
  if (lower.length === bn.length) return true;
  const next = lower[bn.length];
  return /[\s\-_.,;:!?\\/|()[\]]/.test(next);
}

function matchEmailToBrand(
  email: any,
  brandName: string,
  businessUnitId: string | undefined,
): { matched: boolean; reason: string } {
  // ── Priority 1: businessUnitId ──
  if (businessUnitId) {
    const emailBuId = String(email?.businessUnitId ?? "");
    const hsIds = email?.hs_all_assigned_business_unit_ids;
    const idSet = new Set<string>();
    if (emailBuId) idSet.add(emailBuId);
    if (hsIds != null) {
      const raw = Array.isArray(hsIds) ? hsIds : String(hsIds).replace(/[\[\]\s]/g, "").split(",");
      raw.forEach((v: any) => { if (v) idSet.add(String(v)); });
    }
    if (idSet.has(businessUnitId)) {
      return { matched: true, reason: "businessUnitId" };
    }
    // businessUnitId is available for this brand but this email doesn't belong → reject
    return { matched: false, reason: "" };
  }

  // ── Priority 2: Strict text matching (only when BU unavailable) ──

  // 2a. fromName EXACTLY equals brandName (case insensitive)
  const fromName = (email?.from?.fromName || "").trim();
  if (fromName.toLowerCase() === brandName.toLowerCase()) {
    return { matched: true, reason: "fromName-exact" };
  }

  // 2b. fromName contains brand as exact word boundary
  if (exactWordMatch(fromName, brandName)) {
    return { matched: true, reason: "fromName-word" };
  }

  // 2c. email name STARTS WITH brandName (with word boundary after)
  const emailName = (email?.name || "").trim();
  if (nameStartsWith(emailName, brandName)) {
    return { matched: true, reason: "name-startsWith" };
  }

  // 2d. subscriptionDetails.subscriptionName exact word match
  const subName = (email?.subscriptionDetails?.subscriptionName || "").trim();
  if (exactWordMatch(subName, brandName)) {
    return { matched: true, reason: "subscriptionName-word" };
  }

  // 2e. activeDomain contains brand as word
  const activeDomain = (email?.activeDomain || "").trim();
  if (exactWordMatch(activeDomain, brandName)) {
    return { matched: true, reason: "activeDomain-word" };
  }

  return { matched: false, reason: "" };
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
      const raw = await hubspotFetch("/marketing/v3/emails?limit=1", token);
      const firstEmail = raw.results?.[0] || null;
      console.log("Debug — raw email:", JSON.stringify(firstEmail, null, 2));
      const units = await fetchBusinessUnits(token);
      return new Response(
        JSON.stringify({ debug: true, firstEmail, businessUnits: units }),
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

    // ── Business units ──
    const businessUnits = await fetchBusinessUnits(token);
    const matchedUnit = businessUnits.find(
      (u) => u.name.toLowerCase() === brandName.toLowerCase(),
    );
    const businessUnitId = matchedUnit?.id;
    console.log(`Business unit found for "${brandName}": ${businessUnitId ?? "NOT FOUND"}`);

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
    const matchReasons: { name: string; reason: string }[] = [];

    for (const email of allRawEmails) {
      const result = matchEmailToBrand(email, brandName, businessUnitId);
      if (result.matched) {
        brandFiltered.push(email);
        matchReasons.push({ name: email?.name || "Untitled", reason: result.reason });
      }
    }

    console.log(`Total emails after brand filter: ${brandFiltered.length}`);
    console.log(`Matched emails: ${JSON.stringify(matchReasons.map(m => m.name))}`);
    if (matchReasons.length <= 30) {
      console.log(`Match details: ${JSON.stringify(matchReasons)}`);
    }

    // Date filter
    const dateFiltered = brandFiltered.filter((email) => {
      const dateStr = extractDateStr(email);
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

          totalSent += sent;
          totalDelivered += delivered;
          totalOpens += opens;
          totalClicks += clicks;
          totalBounce += bounce;
          totalUnsub += unsubscribe;
          totalSpam += spam;

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
      emails.push(...results);
    }

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
      businessUnitId: businessUnitId ?? null,
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
