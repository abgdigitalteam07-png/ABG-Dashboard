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
  return text.toLowerCase().includes(brandName.toLowerCase());
}

// Fetch all marketing emails from v3 API
async function fetchAllEmails(token: string, accountLabel: string): Promise<any[]> {
  const allEmails: any[] = [];
  let after: string | undefined;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `/marketing/v3/emails?limit=100${after ? `&after=${after}` : ""}`;
      const res = await hubspotFetch(url, token);
      const results = res.results || [];
      allEmails.push(...results);
      after = res.paging?.next?.after;
      hasMore = !!after && allEmails.length < 5000;
    } catch (err) {
      console.error(`[${accountLabel}] Error fetching v3 emails:`, err);
      break;
    }
  }

  console.log(`[${accountLabel}] Fetched ${allEmails.length} total emails`);
  return allEmails;
}

// Fetch events for a single email using the Email Events API
async function fetchEmailEvents(
  token: string,
  emailId: string,
  startMs: number,
  endMs: number
): Promise<{ sent: number; delivered: number; opens: number; clicks: number; bounces: number; unsubs: number; spam: number }> {
  const counts = { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, unsubs: 0, spam: 0 };
  let offset: string | undefined;
  let hasMore = true;

  while (hasMore) {
    try {
      let url = `/email/public/v1/events?startTimestamp=${startMs}&endTimestamp=${endMs}&emailId=${emailId}&limit=1000`;
      if (offset) url += `&offset=${offset}`;
      const res = await hubspotFetch(url, token);
      const events = res.events || [];

      for (const ev of events) {
        const type = ev.type;
        if (type === "SENT") counts.sent++;
        else if (type === "DELIVERED") counts.delivered++;
        else if (type === "OPEN") counts.opens++;
        else if (type === "CLICK") counts.clicks++;
        else if (type === "BOUNCE") counts.bounces++;
        else if (type === "STATUSCHANGE" && ev.subscriptionStatus === "UNSUBSCRIBED") counts.unsubs++;
        else if (type === "SPAMREPORT") counts.spam++;
      }

      offset = res.offset;
      hasMore = res.hasMore === true;
    } catch (err: any) {
      // If events API fails for this email, just return zeros
      console.warn(`Events API failed for email ${emailId}: ${err.message?.substring(0, 200)}`);
      break;
    }
  }

  return counts;
}

async function fetchAccountData(
  token: string,
  accountLabel: string,
  brandName: string,
  startDate: string,
  endDate: string
): Promise<AccountData> {
  let totalContacts = 0;
  try {
    const res = await hubspotPost("/crm/v3/objects/contacts/search", token, { limit: 0 });
    totalContacts = res.total || 0;
  } catch { /* ignore */ }

  // Lifecycle stage breakdown
  const lifecycleStages: LifecycleStage[] = [
    { stage: "Subscriber", count: 0 }, { stage: "Lead", count: 0 },
    { stage: "MQL", count: 0 }, { stage: "SQL", count: 0 },
    { stage: "Opportunity", count: 0 }, { stage: "Customer", count: 0 },
  ];

  const stagePromises = lifecycleStages.map(async (ls) => {
    try {
      const data = await hubspotPost("/crm/v3/objects/contacts/search", token, {
        filterGroups: [{
          filters: [{ propertyName: "lifecyclestage", operator: "EQ", value: ls.stage.toLowerCase().replace(/ /g, "") }],
        }],
        limit: 0,
      });
      ls.count = data.total || 0;
    } catch { /* skip */ }
  });
  await Promise.all(stagePromises);

  // Fetch all emails
  const allRawEmails = await fetchAllEmails(token, accountLabel);

  // Filter by brand
  const brandFiltered = allRawEmails.filter((e: any) => {
    const fromName = e.fromName || e.from?.name || e.from?.fromName || "";
    return brandMatches(e.name, brandName) ||
      brandMatches(fromName, brandName) ||
      brandMatches(e.campaign, brandName) ||
      brandMatches(e.campaignName, brandName) ||
      brandMatches(e.subject, brandName);
  });

  console.log(`[${accountLabel}] Found ${brandFiltered.length} emails matching brand="${brandName}"`);

  // Filter by date range
  const dateFiltered = brandFiltered.filter((e: any) => {
    const timestamp = e.publishDate || e.publishedAt || e.updatedAt;
    if (!timestamp) return false;
    const pubDate = new Date(timestamp).toISOString().split("T")[0];
    return pubDate >= startDate && pubDate <= endDate;
  });

  console.log(`[${accountLabel}] After date filter (${startDate} to ${endDate}): ${dateFiltered.length} emails`);

  // Fetch events for each email using Email Events API
  const startMs = new Date(startDate + "T00:00:00Z").getTime();
  const endMs = new Date(endDate + "T23:59:59Z").getTime();

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  const emailEventResults: Map<string, { sent: number; delivered: number; opens: number; clicks: number; bounces: number; unsubs: number; spam: number }> = new Map();

  for (let i = 0; i < dateFiltered.length; i += batchSize) {
    const batch = dateFiltered.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((e: any) => fetchEmailEvents(token, String(e.id), startMs, endMs))
    );
    batch.forEach((e: any, idx: number) => {
      emailEventResults.set(String(e.id), batchResults[idx]);
    });
  }

  // Build email records with event-based stats
  let totalSent = 0, totalDelivered = 0, totalOpens = 0, totalClicks = 0, totalBounce = 0, totalUnsub = 0, totalSpam = 0;

  const emails: EmailRecord[] = dateFiltered.map((e: any) => {
    const pubTimestamp = e.publishDate || e.publishedAt || e.updatedAt;
    const publishDate = pubTimestamp ? new Date(pubTimestamp).toISOString().split("T")[0] : "";
    const fromName = e.fromName || e.from?.name || e.from?.fromName || "Unknown";
    const emailId = String(e.id);
    const ev = emailEventResults.get(emailId) || { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, unsubs: 0, spam: 0 };

    totalSent += ev.sent;
    totalDelivered += ev.delivered;
    totalOpens += ev.opens;
    totalClicks += ev.clicks;
    totalBounce += ev.bounces;
    totalUnsub += ev.unsubs;
    totalSpam += ev.spam;

    const openRate = ev.delivered > 0 ? parseFloat((ev.opens / ev.delivered * 100).toFixed(1)) : 0;
    const clickRate = ev.delivered > 0 ? parseFloat((ev.clicks / ev.delivered * 100).toFixed(1)) : 0;
    const deliveredRate = ev.sent > 0 ? parseFloat((ev.delivered / ev.sent * 100).toFixed(1)) : 0;
    const unsubscribeRate = ev.sent > 0 ? parseFloat((ev.unsubs / ev.sent * 100).toFixed(2)) : 0;
    const bounceRate = ev.sent > 0 ? parseFloat((ev.bounces / ev.sent * 100).toFixed(2)) : 0;
    const spamRate = ev.sent > 0 ? parseFloat((ev.spam / ev.sent * 100).toFixed(2)) : 0;

    return {
      name: e.name || "Untitled",
      subject: e.subject || "",
      sender: fromName,
      publishDate,
      sent: ev.sent, delivered: ev.delivered, opens: ev.opens, clicks: ev.clicks,
      bounce: ev.bounces, unsubscribe: ev.unsubs, spam: ev.spam,
      openRate, clickRate, deliveredRate, unsubscribeRate, bounceRate, spamRate,
      account: accountLabel,
    };
  });

  console.log(`[${accountLabel}] Fetched events for ${dateFiltered.length} emails, total opens: ${totalOpens}, clicks: ${totalClicks} for brand "${brandName}"`);

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

    const promises: Promise<AccountData | null>[] = [];
    if (token1) promises.push(fetchAccountData(token1, "Account 1", brandName, startDate, endDate).catch((err) => { console.error("Account 1 error:", err); return null; }));
    if (token2) promises.push(fetchAccountData(token2, "Account 2", brandName, startDate, endDate).catch((err) => { console.error("Account 2 error:", err); return null; }));

    const results = await Promise.all(promises);
    const validResults = results.filter((r): r is AccountData => r !== null);

    if (validResults.length === 0) {
      throw new Error("Both HubSpot accounts failed to return data");
    }

    // Merge
    const totalContacts = validResults.reduce((sum, r) => sum + r.totalContacts, 0);

    const mergedStages: LifecycleStage[] = [
      { stage: "Subscriber", count: 0 }, { stage: "Lead", count: 0 },
      { stage: "MQL", count: 0 }, { stage: "SQL", count: 0 },
      { stage: "Opportunity", count: 0 }, { stage: "Customer", count: 0 },
    ];
    for (const result of validResults) {
      for (const ls of result.lifecycleStages) {
        const merged = mergedStages.find((m) => m.stage === ls.stage);
        if (merged) merged.count += ls.count;
      }
    }

    const allEmails = validResults.flatMap((r) => r.emails)
      .sort((a, b) => b.publishDate.localeCompare(a.publishDate));

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

    // Build time-series charts from per-email data
    const emailsByDate = new Map<string, { opens: number; delivered: number; unsub: number; sent: number }>();
    for (const e of allEmails) {
      if (!e.publishDate) continue;
      const existing = emailsByDate.get(e.publishDate) || { opens: 0, delivered: 0, unsub: 0, sent: 0 };
      existing.opens += e.opens;
      existing.delivered += e.delivered;
      existing.unsub += e.unsubscribe;
      existing.sent += e.sent;
      emailsByDate.set(e.publishDate, existing);
    }

    const sortedDates = [...emailsByDate.keys()].sort();
    const openRateOverTime = sortedDates.map((date) => {
      const d = emailsByDate.get(date)!;
      return { date, value: d.delivered > 0 ? parseFloat((d.opens / d.delivered * 100).toFixed(1)) : 0 };
    });
    const unsubscribeRateOverTime = sortedDates.map((date) => {
      const d = emailsByDate.get(date)!;
      return { date, value: d.sent > 0 ? parseFloat((d.unsub / d.sent * 100).toFixed(2)) : 0 };
    });

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
      openRateOverTime,
      unsubscribeRateOverTime,
    };

    console.log(`Result: ${allEmails.length} emails, openRate=${openRate}, clickRate=${clickRate}, totalSent=${totalSent}, totalOpens=${totalOpens}`);

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
