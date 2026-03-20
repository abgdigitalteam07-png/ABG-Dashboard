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

interface BusinessUnit { id: string; name: string; }

async function fetchBusinessUnits(token: string): Promise<BusinessUnit[]> {
  try {
    const res = await hubspotFetch("/business-units/v3/business-units/user/me", token);
    const units: BusinessUnit[] = (res.results || []).map((u: any) => ({ id: String(u.id), name: u.name }));
    console.log(`Business units found: ${JSON.stringify(units.map(u => ({ id: u.id, name: u.name })))}`);
    return units;
  } catch (err) {
    console.error("Failed to fetch business units:", err);
    return [];
  }
}

async function fetchAllEmails(token: string): Promise<any[]> {
  const allEmails: any[] = [];
  let after: string | undefined = undefined;
  let page = 0;

  while (page < 50) {
    let url = `/marketing/v3/emails?limit=100&orderBy=-publishDate&isPublished=true`;
    if (after) url += `&after=${after}`;

    try {
      const res = await hubspotFetch(url, token);
      const items = res.results || [];
      allEmails.push(...items);

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

  console.log(`Fetched ${allEmails.length} published emails via v3 API`);
  return allEmails;
}

async function fetchCampaignStats(token: string, campaignId: string): Promise<any | null> {
  try {
    return await hubspotFetch(`/email/public/v1/campaigns/${campaignId}`, token);
  } catch {
    return null;
  }
}

// Priority-based brand matching
function matchEmailToBrand(email: any, brandName: string, businessUnitId?: string): boolean {
  // Priority 1: businessUnitId match
  if (businessUnitId && String(email.businessUnitId) === businessUnitId) {
    return true;
  }

  const bn = brandName.toLowerCase();

  // Priority 2: subscriptionDetails.subscriptionName
  const subName = (email.subscriptionDetails?.subscriptionName || "").toLowerCase();
  if (subName && subName.includes(bn)) return true;

  // Priority 3: activeDomain contains brand name
  const domain = (email.activeDomain || "").toLowerCase();
  if (domain && domain.includes(bn)) return true;

  // Priority 4: email name contains brand name
  const name = (email.name || "").toLowerCase();
  if (name.includes(bn)) return true;

  // Priority 5: fromName contains brand name
  const fromName = (email.from?.fromName || "").toLowerCase();
  if (fromName.includes(bn)) return true;

  // Priority 6: subject contains brand name
  const subject = (email.subject || "").toLowerCase();
  if (subject.includes(bn)) return true;

  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("HUBSPOT_ACCESS_TOKEN");
    if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN not configured");

    const body: HubSpotRequest = await req.json();

    if (body.debug === true) {
      try {
        const raw = await hubspotFetch("/marketing/v3/emails?limit=1", token);
        const firstEmail = raw.results?.[0] || null;
        console.log("STEP 1 — Raw email properties:", JSON.stringify(firstEmail, null, 2));
        const units = await fetchBusinessUnits(token);
        return new Response(JSON.stringify({
          debug: true,
          rawEmailProperties: firstEmail ? Object.keys(firstEmail) : [],
          businessUnitId_value: firstEmail?.businessUnitId ?? "NOT FOUND",
          subscriptionName: firstEmail?.subscriptionDetails?.subscriptionName ?? "NOT FOUND",
          activeDomain: firstEmail?.activeDomain ?? "NOT FOUND",
          businessUnits: units,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ debug: true, error: e.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { brandName, startDate, endDate } = body;
    if (!brandName || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Fetching HubSpot data for brand="${brandName}", ${startDate} to ${endDate}`);

    const businessUnits = await fetchBusinessUnits(token);
    const matchedUnit = businessUnits.find(
      (u) => u.name.toLowerCase() === brandName.toLowerCase()
    );
    const businessUnitId = matchedUnit?.id;
    console.log(`Business unit ID for "${brandName}": ${businessUnitId ?? "NOT FOUND (will use text/domain matching)"}`);

    // Contacts
    let totalContacts = 0;
    try {
      const res = await hubspotPost("/crm/v3/objects/contacts/search", token, { limit: 0 });
      totalContacts = res.total || 0;
    } catch { /* ignore */ }

    const lifecycleStages = [
      { stage: "Subscriber", count: 0 }, { stage: "Lead", count: 0 },
      { stage: "MQL", count: 0 }, { stage: "SQL", count: 0 },
      { stage: "Opportunity", count: 0 }, { stage: "Customer", count: 0 },
    ];
    await Promise.all(lifecycleStages.map(async (ls) => {
      try {
        const data = await hubspotPost("/crm/v3/objects/contacts/search", token, {
          filterGroups: [{ filters: [{ propertyName: "lifecyclestage", operator: "EQ", value: ls.stage.toLowerCase().replace(/ /g, "") }] }],
          limit: 0,
        });
        ls.count = data.total || 0;
      } catch { /* skip */ }
    }));

    // Fetch emails & filter by brand using priority-based matching
    const allRawEmails = await fetchAllEmails(token);

    const brandFiltered = allRawEmails.filter((e: any) => matchEmailToBrand(e, brandName, businessUnitId));
    console.log(`Found ${brandFiltered.length} emails for "${brandName}" via priority matching`);

    // Log first few matched emails for debugging
    if (brandFiltered.length > 0 && brandFiltered.length <= 5) {
      brandFiltered.forEach((e: any) => {
        console.log(`  Matched email: "${e.name}" | publishDate=${e.publishDate || e.publishedAt || e.updatedAt}`);
      });
    }

    // Filter by date range
    const dateFiltered = brandFiltered.filter((e: any) => {
      const timestamp = e.publishDate || e.publishedAt || e.updatedAt;
      if (!timestamp) return false;
      const pubDate = new Date(timestamp).toISOString().split("T")[0];
      return pubDate >= startDate && pubDate <= endDate;
    });
    console.log(`After date filter (${startDate} to ${endDate}): ${dateFiltered.length} emails`);

    // Fetch stats via campaigns API
    let totalSent = 0, totalDelivered = 0, totalOpens = 0, totalClicks = 0, totalBounce = 0, totalUnsub = 0, totalSpam = 0;

    const emails: EmailRecord[] = [];
    for (let i = 0; i < dateFiltered.length; i += 10) {
      const batch = dateFiltered.slice(i, i + 10);
      const statsPromises = batch.map(async (e: any) => {
        const campaignId = e.primaryEmailCampaignId;
        const counters = campaignId ? (await fetchCampaignStats(token, campaignId))?.counters : null;

        const pubTimestamp = e.publishDate || e.publishedAt || e.updatedAt;
        const publishDate = pubTimestamp ? new Date(pubTimestamp).toISOString().split("T")[0] : "";
        const fromName = e.from?.fromName || "Unknown";

        const sent = counters?.sent || 0;
        const delivered = counters?.delivered || 0;
        const opens = counters?.open || 0;
        const clicks = counters?.click || 0;
        const bounces = counters?.bounce || 0;
        const unsubs = counters?.unsubscribed || 0;
        const spam = counters?.spamreport || 0;

        totalSent += sent; totalDelivered += delivered; totalOpens += opens;
        totalClicks += clicks; totalBounce += bounces; totalUnsub += unsubs; totalSpam += spam;

        console.log(`Email stats: sent=${sent} opens=${opens} clicks=${clicks} — "${e.name}"`);

        const openRate = delivered > 0 ? parseFloat((opens / delivered * 100).toFixed(1)) : 0;
        const clickRate = delivered > 0 ? parseFloat((clicks / delivered * 100).toFixed(1)) : 0;
        const deliveredRate = sent > 0 ? parseFloat((delivered / sent * 100).toFixed(1)) : 0;
        const unsubscribeRate = sent > 0 ? parseFloat((unsubs / sent * 100).toFixed(2)) : 0;
        const bounceRate = sent > 0 ? parseFloat((bounces / sent * 100).toFixed(2)) : 0;
        const spamRate = sent > 0 ? parseFloat((spam / sent * 100).toFixed(2)) : 0;

        return { name: e.name || "Untitled", subject: e.subject || "", sender: fromName, publishDate, sent, delivered, opens, clicks, bounce: bounces, unsubscribe: unsubs, spam, openRate, clickRate, deliveredRate, unsubscribeRate, bounceRate, spamRate } as EmailRecord;
      });
      emails.push(...await Promise.all(statsPromises));
    }

    const openRate = totalDelivered > 0 ? parseFloat((totalOpens / totalDelivered * 100).toFixed(1)) : 0;
    const clickRate = totalDelivered > 0 ? parseFloat((totalClicks / totalDelivered * 100).toFixed(1)) : 0;
    const bounceRate = totalSent > 0 ? parseFloat((totalBounce / totalSent * 100).toFixed(2)) : 0;
    const unsubscribeRate = totalSent > 0 ? parseFloat((totalUnsub / totalSent * 100).toFixed(2)) : 0;
    const deliveredRate = totalSent > 0 ? parseFloat((totalDelivered / totalSent * 100).toFixed(1)) : 0;

    const healthScore = Math.min(10, Math.max(1, parseFloat(
      (openRate / 5 + clickRate / 2 - bounceRate * 2 - unsubscribeRate * 5 + 2).toFixed(1)
    )));

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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
