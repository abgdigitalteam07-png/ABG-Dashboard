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

// Fetch all marketing emails WITH statistics using v1 endpoint
async function fetchAllEmailsWithStats(token: string, accountLabel: string): Promise<any[]> {
  const allEmails: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `/marketing-emails/v1/emails/with-statistics?limit=100&offset=${offset}&excludeDeletedObjects=true`;
      const res = await hubspotFetch(url, token);
      const objects = res.objects || [];
      allEmails.push(...objects);
      offset += objects.length;
      hasMore = objects.length === 100 && allEmails.length < 5000;
    } catch (err) {
      console.error(`[${accountLabel}] Error fetching v1 emails with stats:`, err);
      break;
    }
  }

  console.log(`[${accountLabel}] Fetched ${allEmails.length} total emails with statistics`);
  return allEmails;
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

  // Fetch all emails with built-in statistics
  const allRawEmails = await fetchAllEmailsWithStats(token, accountLabel);

  // Filter by brand: exact match on brand property first, then name/subject/fromName
  const brandFiltered = allRawEmails.filter((e: any) => {
    if (e.brand && e.brand === brandName) return true;
    const fromName = e.fromName || e.from?.name || "";
    return brandMatches(e.name, brandName) ||
      brandMatches(fromName, brandName) ||
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

  // Build email records from stats.counters
  let totalSent = 0, totalDelivered = 0, totalOpens = 0, totalClicks = 0, totalBounce = 0, totalUnsub = 0, totalSpam = 0;

  const emails: EmailRecord[] = dateFiltered.map((e: any) => {
    const pubTimestamp = e.publishDate || e.publishedAt || e.updatedAt;
    const publishDate = pubTimestamp ? new Date(pubTimestamp).toISOString().split("T")[0] : "";
    const fromName = e.fromName || e.from?.name || "Unknown";
    const counters = e.stats?.counters || {};

    const sent = counters.sent || 0;
    const delivered = counters.delivered || 0;
    const opens = counters.open || 0;
    const clicks = counters.click || 0;
    const bounces = counters.bounce || 0;
    const unsubs = counters.unsubscribed || 0;
    const spam = counters.spamreport || 0;

    totalSent += sent;
    totalDelivered += delivered;
    totalOpens += opens;
    totalClicks += clicks;
    totalBounce += bounces;
    totalUnsub += unsubs;
    totalSpam += spam;

    const openRate = delivered > 0 ? parseFloat((opens / delivered * 100).toFixed(1)) : 0;
    const clickRate = delivered > 0 ? parseFloat((clicks / delivered * 100).toFixed(1)) : 0;
    const deliveredRate = sent > 0 ? parseFloat((delivered / sent * 100).toFixed(1)) : 0;
    const unsubscribeRate = sent > 0 ? parseFloat((unsubs / sent * 100).toFixed(2)) : 0;
    const bounceRate = sent > 0 ? parseFloat((bounces / sent * 100).toFixed(2)) : 0;
    const spamRate = sent > 0 ? parseFloat((spam / sent * 100).toFixed(2)) : 0;

    return {
      name: e.name || "Untitled",
      subject: e.subject || "",
      sender: fromName,
      publishDate,
      sent, delivered, opens, clicks,
      bounce: bounces, unsubscribe: unsubs, spam,
      openRate, clickRate, deliveredRate, unsubscribeRate, bounceRate, spamRate,
      account: accountLabel,
    };
  });

  console.log(`[${accountLabel}] v1 with-statistics: found ${dateFiltered.length} emails for brand ${brandName} with stats`);

  return {
    totalContacts,
    lifecycleStages,
    emails,
    totalFetched: allRawEmails.length,
    totalSent, totalDelivered, totalOpens, totalClicks, totalBounce, totalUnsub, totalSpam,
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

    const body = await req.json();

    // Diagnostic mode: fetch 1 email and log all properties
    if (body.debug === true) {
      // Try both tokens
      for (const [label, tk] of [["Account 1", token1], ["Account 2", token2]]) {
        if (!tk) continue;
        let email: any = null;
        try {
          const raw = await hubspotFetch("/marketing-emails/v1/emails/with-statistics?limit=1&excludeDeletedObjects=true", tk);
          const count = raw.objects?.length ?? 0;
          const total = raw.total ?? 0;
          console.log(`[DEBUG] ${label}: got ${count} emails in response, total=${total}`);
          email = raw.objects?.[0];
        } catch (e: any) {
          console.log(`[DEBUG] ${label} with-statistics failed:`, e.message);
          continue;
        }
        if (!email) {
          console.log(`[DEBUG] ${label}: No emails found`);
          continue;
        }
      if (!email) {
        console.log("[DEBUG] No emails found at all");
        return new Response(JSON.stringify({ debug: true, message: "No emails found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log ALL top-level property names
      const topLevelKeys = Object.keys(email);
      console.log("[DEBUG] Top-level property names:", JSON.stringify(topLevelKeys));

      // Log values of brand-related fields
      const brandRelated: Record<string, unknown> = {};
      for (const key of topLevelKeys) {
        const lk = key.toLowerCase();
        if (lk.includes("brand") || lk.includes("category") || lk.includes("type") || lk.includes("group") || lk.includes("tag") || lk.includes("label") || lk.includes("folder") || lk.includes("campaign")) {
          brandRelated[key] = email[key];
        }
      }
      console.log("[DEBUG] Brand-related properties:", JSON.stringify(brandRelated));

      // Log key identification fields
      console.log("[DEBUG] name:", email.name);
      console.log("[DEBUG] subject:", email.subject);
      console.log("[DEBUG] fromName:", email.fromName);
      console.log("[DEBUG] primaryRichTextModuleHtml length:", email.primaryRichTextModuleHtml?.length ?? 0);

      // Log the full email object (truncated for safety)
      const fullJson = JSON.stringify(email);
      // Log in chunks of 2000 chars
      for (let i = 0; i < fullJson.length && i < 10000; i += 2000) {
        console.log(`[DEBUG] RAW email chunk ${i}-${i + 2000}:`, fullJson.slice(i, i + 2000));
      }

      return new Response(JSON.stringify({ 
        debug: true, 
        topLevelKeys, 
        brandRelated, 
        name: email.name, 
        subject: email.subject,
        fromName: email.fromName,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { brandName, startDate, endDate } = body as HubSpotRequest;
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
