const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface HubSpotRequest {
  brandName: string;
  startDate: string;
  endDate: string;
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
  account: string;
}

interface LifecycleStage {
  stage: string;
  count: number;
}

interface AccountData {
  totalContacts: number;
  lifecycleStages: LifecycleStage[];
  emails: EmailRecord[];
  totalFetched: number;
  totalSent: number;
  totalDelivered: number;
  totalOpens: number;
  totalClicks: number;
  totalBounce: number;
  totalUnsub: number;
  totalSpam: number;
}

async function hubspotFetch(path: string, token: string) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HubSpot API error (${path}): ${err}`);
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
    throw new Error(`HubSpot API error (${path}): ${err}`);
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

function brandMatches(text: string | undefined | null, brandName: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const brandLower = brandName.toLowerCase();
  return lower.includes(brandLower);
}

async function fetchAllMarketingEmails(token: string, accountLabel: string): Promise<{ emails: any[]; apiVersion: string }> {
  // Try v1 API first
  let allEmails: any[] = [];
  let apiVersion = "v1";

  let useV1 = true;
  try {
    const testRes = await hubspotFetch(`/marketing-emails/v1/emails?limit=1`, token);
    if (!testRes.objects) useV1 = false;
  } catch {
    useV1 = false;
  }

  if (useV1) {
    let offset = 0;
    const limit = 250;
    let hasMore = true;
    while (hasMore && offset < 2000) {
      try {
        const res = await hubspotFetch(
          `/marketing-emails/v1/emails?limit=${limit}&offset=${offset}&orderBy=-updated`,
          token
        );
        const objects = res.objects || [];
        allEmails.push(...objects);
        hasMore = objects.length === limit;
        offset += limit;
      } catch (err) {
        console.error(`[${accountLabel}] Error fetching v1 emails at offset ${offset}:`, err);
        break;
      }
    }
  } else {
    apiVersion = "v3";
    console.log(`[${accountLabel}] v1 API unavailable, trying v3...`);
    let after: string | undefined;
    let hasMore = true;
    while (hasMore) {
      try {
        const url = `/marketing/v3/emails?limit=100${after ? `&after=${after}` : ""}`;
        const res = await hubspotFetch(url, token);
        const results = res.results || [];
        allEmails.push(...results);
        after = res.paging?.next?.after;
        hasMore = !!after && allEmails.length < 2000;
      } catch (err) {
        console.error(`[${accountLabel}] Error fetching v3 emails:`, err);
        break;
      }
    }
  }

  // Log first email object keys for debugging
  if (allEmails.length > 0) {
    const sample = allEmails[0];
    console.log(`[${accountLabel}] API=${apiVersion}, keys: ${Object.keys(sample).join(",")}`);
    // Log stats-related fields
    console.log(`[${accountLabel}] Sample stats: ${JSON.stringify(sample.stats || sample.statistics || "none")}`);
    console.log(`[${accountLabel}] Sample: name=${sample.name}, subject=${sample.subject}, fromName=${sample.fromName || sample.from?.name || "?"}, publishDate=${sample.publishDate || sample.publishedAt || sample.updatedAt || "?"}`);
  }

  const sampleNames = allEmails.slice(0, 5).map((e: any) => e.name || e.subject || "no-name");
  console.log(`[${accountLabel}] Sample email names: ${JSON.stringify(sampleNames)}`);

  return { emails: allEmails, apiVersion };
}

// For v3 emails, fetch statistics for a batch of email IDs
async function fetchV3EmailStats(token: string, emailIds: string[], accountLabel: string): Promise<Map<string, any>> {
  const statsMap = new Map<string, any>();
  // Fetch stats individually (v3 doesn't have batch stats endpoint)
  const batchSize = 10;
  for (let i = 0; i < emailIds.length; i += batchSize) {
    const batch = emailIds.slice(i, i + batchSize);
    const promises = batch.map(async (id) => {
      try {
        const stats = await hubspotFetch(`/marketing/v3/emails/${id}/statistics`, token);
        statsMap.set(id, stats);
      } catch {
        // skip individual stats failures
      }
    });
    await Promise.all(promises);
  }
  console.log(`[${accountLabel}] Fetched stats for ${statsMap.size}/${emailIds.length} emails`);
  return statsMap;
}

async function fetchAccountData(
  token: string,
  accountLabel: string,
  brandName: string,
  startDate: string,
  endDate: string
): Promise<AccountData> {
  // Get total contacts
  let totalContacts = 0;
  try {
    const res = await hubspotPost("/crm/v3/objects/contacts/search", token, { limit: 0 });
    totalContacts = res.total || 0;
  } catch {
    // ignore
  }

  // Get lifecycle stage breakdown
  const lifecycleStages: LifecycleStage[] = [
    { stage: "Subscriber", count: 0 },
    { stage: "Lead", count: 0 },
    { stage: "MQL", count: 0 },
    { stage: "SQL", count: 0 },
    { stage: "Opportunity", count: 0 },
    { stage: "Customer", count: 0 },
  ];

  const stagePromises = lifecycleStages.map(async (ls) => {
    try {
      const data = await hubspotPost("/crm/v3/objects/contacts/search", token, {
        filterGroups: [{
          filters: [{
            propertyName: "lifecyclestage",
            operator: "EQ",
            value: ls.stage.toLowerCase().replace(/ /g, ""),
          }],
        }],
        limit: 0,
      });
      ls.count = data.total || 0;
    } catch {
      // skip
    }
  });
  await Promise.all(stagePromises);

  // Fetch all marketing emails
  const allRawEmails = await fetchAllMarketingEmails(token, accountLabel);
  console.log(`[${accountLabel}] Fetched ${allRawEmails.length} total raw emails`);

  // Filter by brand name: check name, fromName, campaign name
  const brandFiltered = allRawEmails.filter((e: any) => {
    return brandMatches(e.name, brandName) ||
      brandMatches(e.fromName, brandName) ||
      brandMatches(e.campaign, brandName) ||
      brandMatches(e.campaignName, brandName) ||
      brandMatches(e.primaryRichTextModuleHtml, brandName) ||
      brandMatches(e.subject, brandName);
  });

  console.log(`[${accountLabel}] Brand "${brandName}" matched ${brandFiltered.length} emails`);

  // Filter by date range
  const dateFiltered = brandFiltered.filter((e: any) => {
    const timestamp = e.publishDate || e.updated || e.created;
    if (!timestamp) return false;
    const pubDate = new Date(timestamp).toISOString().split("T")[0];
    return pubDate >= startDate && pubDate <= endDate;
  });

  console.log(`[${accountLabel}] After date filter (${startDate} to ${endDate}): ${dateFiltered.length} emails`);

  // Map to EmailRecord with proper stats
  const emails: EmailRecord[] = dateFiltered.map((e: any) => {
    const stats = e.stats?.counters || {};
    // HubSpot v1 marketing emails stats field names
    const sent = stats.sent || stats.processed || 0;
    const delivered = stats.delivered || (sent - (stats.bounce || 0));
    const opens = stats.open || stats.uniqueopens || 0;
    const clicks = stats.click || stats.uniqueclicks || 0;
    const bounce = stats.bounce || stats.hardbounced || 0;
    const unsubscribe = stats.unsubscribed || 0;
    const spam = stats.spamreport || 0;

    const pubTimestamp = e.publishDate || e.updated || e.created;
    const publishDate = pubTimestamp ? new Date(pubTimestamp).toISOString().split("T")[0] : "";

    return {
      name: e.name || "Untitled",
      subject: e.subject || "",
      sender: e.fromName || "Unknown",
      publishDate,
      sent,
      delivered: delivered > 0 ? delivered : 0,
      opens,
      clicks,
      bounce,
      unsubscribe,
      spam,
      openRate: delivered > 0 ? parseFloat((opens / delivered * 100).toFixed(1)) : 0,
      clickRate: delivered > 0 ? parseFloat((clicks / delivered * 100).toFixed(1)) : 0,
      deliveredRate: sent > 0 ? parseFloat((delivered / sent * 100).toFixed(1)) : 0,
      unsubscribeRate: sent > 0 ? parseFloat((unsubscribe / sent * 100).toFixed(2)) : 0,
      bounceRate: sent > 0 ? parseFloat((bounce / sent * 100).toFixed(2)) : 0,
      spamRate: sent > 0 ? parseFloat((spam / sent * 100).toFixed(3)) : 0,
      account: accountLabel,
    };
  });

  let totalSent = 0, totalDelivered = 0, totalOpens = 0, totalClicks = 0;
  let totalBounce = 0, totalUnsub = 0, totalSpam = 0;
  for (const e of emails) {
    totalSent += e.sent;
    totalDelivered += e.delivered;
    totalOpens += e.opens;
    totalClicks += e.clicks;
    totalBounce += e.bounce;
    totalUnsub += e.unsubscribe;
    totalSpam += e.spam;
  }

  return {
    totalContacts,
    lifecycleStages,
    emails,
    totalFetched: allRawEmails.length,
    totalSent,
    totalDelivered,
    totalOpens,
    totalClicks,
    totalBounce,
    totalUnsub,
    totalSpam,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token1 = Deno.env.get("HUBSPOT_ACCESS_TOKEN");
    const token2 = Deno.env.get("HUBSPOT_ACCESS_TOKEN_2");

    if (!token1 && !token2) throw new Error("No HubSpot access tokens configured");

    const { brandName, startDate, endDate } = (await req.json()) as HubSpotRequest;
    if (!brandName || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Fetching HubSpot data for brand="${brandName}", ${startDate} to ${endDate}`);

    // Fetch from both accounts in parallel
    const promises: Promise<AccountData | null>[] = [];
    if (token1) promises.push(fetchAccountData(token1, "Account 1", brandName, startDate, endDate).catch((err) => { console.error("Account 1 error:", err); return null; }));
    if (token2) promises.push(fetchAccountData(token2, "Account 2", brandName, startDate, endDate).catch((err) => { console.error("Account 2 error:", err); return null; }));

    const results = await Promise.all(promises);
    const validResults = results.filter((r): r is AccountData => r !== null);

    if (validResults.length === 0) {
      throw new Error("Both HubSpot accounts failed to return data");
    }

    // Merge contacts
    const totalContacts = validResults.reduce((sum, r) => sum + r.totalContacts, 0);

    // Merge lifecycle stages
    const mergedStages: LifecycleStage[] = [
      { stage: "Subscriber", count: 0 },
      { stage: "Lead", count: 0 },
      { stage: "MQL", count: 0 },
      { stage: "SQL", count: 0 },
      { stage: "Opportunity", count: 0 },
      { stage: "Customer", count: 0 },
    ];
    for (const result of validResults) {
      for (const ls of result.lifecycleStages) {
        const merged = mergedStages.find((m) => m.stage === ls.stage);
        if (merged) merged.count += ls.count;
      }
    }

    // Merge emails and sort by date
    const allEmails = validResults.flatMap((r) => r.emails)
      .sort((a, b) => b.publishDate.localeCompare(a.publishDate));

    // Weighted aggregate metrics from raw totals
    const totalSent = validResults.reduce((s, r) => s + r.totalSent, 0);
    const totalDelivered = validResults.reduce((s, r) => s + r.totalDelivered, 0);
    const totalOpens = validResults.reduce((s, r) => s + r.totalOpens, 0);
    const totalClicks = validResults.reduce((s, r) => s + r.totalClicks, 0);
    const totalBounce = validResults.reduce((s, r) => s + r.totalBounce, 0);
    const totalUnsub = validResults.reduce((s, r) => s + r.totalUnsub, 0);
    const totalSpam = validResults.reduce((s, r) => s + r.totalSpam, 0);

    const openRate = totalDelivered > 0 ? parseFloat((totalOpens / totalDelivered * 100).toFixed(1)) : 0;
    const clickRate = totalDelivered > 0 ? parseFloat((totalClicks / totalDelivered * 100).toFixed(1)) : 0;
    const bounceRate = totalSent > 0 ? parseFloat((totalBounce / totalSent * 100).toFixed(2)) : 0;
    const unsubscribeRate = totalSent > 0 ? parseFloat((totalUnsub / totalSent * 100).toFixed(2)) : 0;
    const deliveredRate = totalSent > 0 ? parseFloat((totalDelivered / totalSent * 100).toFixed(1)) : 0;

    const healthScore = Math.min(10, Math.max(1, parseFloat(
      (openRate / 5 + clickRate / 2 - bounceRate * 2 - unsubscribeRate * 5 + 2).toFixed(1)
    )));

    const sorted = [...allEmails].sort((a, b) => (b.openRate + b.clickRate) - (a.openRate + a.clickRate));
    const highPerforming = sorted.slice(0, 3);
    const lowPerforming = sorted.slice(-3).reverse();

    // Debug info
    const account1Emails = validResults[0]?.emails.length ?? 0;
    const account2Emails = validResults.length > 1 ? (validResults[1]?.emails.length ?? 0) : 0;
    const account1Fetched = validResults[0]?.totalFetched ?? 0;
    const account2Fetched = validResults.length > 1 ? (validResults[1]?.totalFetched ?? 0) : 0;

    const result = {
      totalContacts,
      totalContactsDelta: 0,
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
      deliveredRate,
      deliveredRateDelta: 0,
      lifecycleStages: mergedStages,
      emails: allEmails,
      highPerforming,
      lowPerforming,
      accountsUsed: validResults.length,
      account1Emails,
      account2Emails,
      account1Fetched,
      account2Fetched,
      openRateOverTime: [...allEmails]
        .sort((a, b) => a.publishDate.localeCompare(b.publishDate))
        .map((e) => ({ date: e.publishDate, value: e.openRate })),
      unsubscribeRateOverTime: [...allEmails]
        .sort((a, b) => a.publishDate.localeCompare(b.publishDate))
        .map((e) => ({ date: e.publishDate, value: e.unsubscribeRate })),
    };

    console.log(`Result: ${allEmails.length} emails, openRate=${openRate}, clickRate=${clickRate}`);

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
