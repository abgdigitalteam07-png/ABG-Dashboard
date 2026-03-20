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

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function normalizeAlphaNum(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractBusinessUnitIds(value: unknown): string[] {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.map((v) => String(v));
  }

  if (typeof value === "number") {
    return [String(value)];
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[\[\]\s]/g, "");
    if (!cleaned) return [];
    return cleaned.split(",").map((v) => v.trim()).filter(Boolean);
  }

  return [];
}

function parseDateValue(value: unknown): Date | null {
  if (value == null) return null;

  if (typeof value === "number") {
    const maybeMs = value < 1_000_000_000_000 ? value * 1000 : value;
    const d = new Date(maybeMs);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "string") {
    const numeric = /^\d+$/.test(value) ? Number(value) : null;
    if (numeric != null) {
      return parseDateValue(numeric);
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function extractEmailDate(email: any): string | null {
  const candidates = [
    email?.publishDate,
    email?.publishedAt,
    email?.publishDateTimestamp,
    email?.sendOnPublishDate,
    email?.updatedAt,
    email?.createdAt,
  ];

  for (const candidate of candidates) {
    const parsed = parseDateValue(candidate);
    if (parsed) return parsed.toISOString().split("T")[0];
  }

  return null;
}

function findStringFieldMatches(value: unknown, needle: string, path = "root", cap = 20): string[] {
  if (!needle) return [];

  const matches: string[] = [];

  const walk = (current: unknown, currentPath: string) => {
    if (matches.length >= cap) return;

    if (typeof current === "string") {
      if (current.toLowerCase().includes(needle)) {
        matches.push(currentPath);
      }
      return;
    }

    if (Array.isArray(current)) {
      current.forEach((item, index) => walk(item, `${currentPath}[${index}]`));
      return;
    }

    if (current && typeof current === "object") {
      Object.entries(current as Record<string, unknown>).forEach(([key, val]) => {
        walk(val, `${currentPath}.${key}`);
      });
    }
  };

  walk(value, path);
  return matches;
}

function evaluateBrandMatch(email: any, brandName: string, businessUnitId?: string): { matched: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const brandNeedle = normalizeText(brandName);
  const domainNeedle = normalizeAlphaNum(brandName);

  const buCandidates = new Set<string>([
    ...extractBusinessUnitIds(email?.hs_all_assigned_business_unit_ids),
    ...extractBusinessUnitIds(email?.businessUnitId),
  ]);

  // Priority 1: businessUnitId match (if available)
  if (businessUnitId && buCandidates.has(String(businessUnitId))) {
    reasons.push("businessUnitId");
  }

  // Priority 2: subscriptionDetails.subscriptionName contains brandName
  const subscriptionName = normalizeText(email?.subscriptionDetails?.subscriptionName);
  if (subscriptionName.includes(brandNeedle)) {
    reasons.push("subscriptionDetails.subscriptionName");
  }

  // Priority 3: activeDomain contains brand domain
  const activeDomain = normalizeText(email?.activeDomain);
  if (activeDomain && normalizeAlphaNum(activeDomain).includes(domainNeedle)) {
    reasons.push("activeDomain");
  }

  // Priority 4: name contains brandName
  const emailName = normalizeText(email?.name);
  if (emailName.includes(brandNeedle)) {
    reasons.push("name");
  }

  // Priority 5: fromName contains brandName
  const fromName = normalizeText(email?.from?.fromName);
  if (fromName.includes(brandNeedle)) {
    reasons.push("fromName");
  }

  // Priority 6: subject contains brandName
  const subject = normalizeText(email?.subject);
  if (subject.includes(brandNeedle)) {
    reasons.push("subject");
  }

  // Fallback for low-volume edge cases like Aker: match brandName across all string fields
  if (reasons.length === 0) {
    const deepMatches = findStringFieldMatches(email, brandNeedle);
    if (deepMatches.length > 0) {
      reasons.push(`allFields:${deepMatches[0]}`);
    }
  }

  return { matched: reasons.length > 0, reasons };
}

async function fetchBusinessUnits(token: string): Promise<BusinessUnit[]> {
  try {
    const res = await hubspotFetch("/business-units/v3/business-units/user/me", token);
    const units: BusinessUnit[] = (res.results || []).map((u: any) => ({ id: String(u.id), name: u.name }));
    console.log(`Business units found: ${JSON.stringify(units.map((u) => ({ id: u.id, name: u.name })))}`);
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
    let url = "/marketing/v3/emails?limit=100&orderBy=-publishDate&isPublished=true";
    if (after) url += `&after=${after}`;

    try {
      const res = await hubspotFetch(url, token);
      const items = res.results || [];
      allEmails.push(...items);

      if (res.paging?.next?.after) {
        after = res.paging.next.after;
        page += 1;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("HUBSPOT_ACCESS_TOKEN");
    if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN not configured");

    const body: HubSpotRequest = await req.json();

    if (body.debug === true) {
      const raw = await hubspotFetch("/marketing/v3/emails?limit=1", token);
      const firstEmail = raw.results?.[0] || null;
      console.log("STEP 1 — Raw email properties:", JSON.stringify(firstEmail, null, 2));

      const units = await fetchBusinessUnits(token);

      return new Response(
        JSON.stringify({
          debug: true,
          rawEmailProperties: firstEmail ? Object.keys(firstEmail) : [],
          firstEmail,
          businessUnits: units,
        }),
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

    const businessUnits = await fetchBusinessUnits(token);
    const matchedUnit = businessUnits.find((u) => u.name.toLowerCase() === brandName.toLowerCase());
    const businessUnitId = matchedUnit?.id;
    console.log(`Business unit ID for "${brandName}": ${businessUnitId ?? "NOT FOUND"}`);

    let totalContacts = 0;
    try {
      const res = await hubspotPost("/crm/v3/objects/contacts/search", token, { limit: 0 });
      totalContacts = res.total || 0;
    } catch {
      // ignore contacts summary failure
    }

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
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: "lifecyclestage",
                    operator: "EQ",
                    value: ls.stage.toLowerCase().replace(/ /g, ""),
                  },
                ],
              },
            ],
            limit: 0,
          });
          ls.count = data.total || 0;
        } catch {
          // ignore lifecycle failures
        }
      }),
    );

    const allRawEmails = await fetchAllEmails(token);
    const allEmailNames = allRawEmails.map((email: any) => email?.name || "Untitled");
    console.log(`ALL emails found: ${JSON.stringify(allEmailNames)}`);

    const evaluated = allRawEmails.map((email: any) => ({
      email,
      match: evaluateBrandMatch(email, brandName, businessUnitId),
    }));

    const brandFiltered = evaluated.filter((entry) => entry.match.matched).map((entry) => entry.email);
    console.log(`Found ${brandFiltered.length} emails for "${brandName}"`);

    if (brandName.toLowerCase() === "aker") {
      const akerMatchDebug = evaluated
        .filter((entry) => entry.match.matched)
        .map((entry) => ({
          name: entry.email?.name || "Untitled",
          reasons: entry.match.reasons,
          publishDate: extractEmailDate(entry.email),
          businessUnitId: entry.email?.businessUnitId ?? null,
          hs_all_assigned_business_unit_ids: entry.email?.hs_all_assigned_business_unit_ids ?? null,
        }));

      console.log(`Aker matched emails debug: ${JSON.stringify(akerMatchDebug)}`);
    }

    const dateFiltered = brandFiltered.filter((email: any) => {
      const publishDate = extractEmailDate(email);
      if (!publishDate) return false;
      return publishDate >= startDate && publishDate <= endDate;
    });

    console.log(`After date filter (${startDate} to ${endDate}): ${dateFiltered.length} emails`);

    let totalSent = 0;
    let totalDelivered = 0;
    let totalOpens = 0;
    let totalClicks = 0;
    let totalBounce = 0;
    let totalUnsub = 0;
    let totalSpam = 0;

    const emails: EmailRecord[] = [];

    for (let i = 0; i < dateFiltered.length; i += 10) {
      const batch = dateFiltered.slice(i, i + 10);

      const statsPromises = batch.map(async (email: any) => {
        const campaignId = email?.primaryEmailCampaignId;
        const counters = campaignId ? (await fetchCampaignStats(token, campaignId))?.counters : null;

        const publishDate = extractEmailDate(email) ?? "";
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

        console.log(`Email stats: sent=${sent} opens=${opens} clicks=${clicks} — "${email?.name || "Untitled"}"`);

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
      });

      emails.push(...(await Promise.all(statsPromises)));
    }

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
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
