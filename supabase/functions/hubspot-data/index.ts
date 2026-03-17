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

function getBenchmarkLabel(metric: string, value: number): string {
  if (metric === "openRate") return value >= 25 ? "Excellent" : value >= 18 ? "Good" : "Needs work";
  if (metric === "clickRate") return value >= 4 ? "Excellent" : value >= 2.5 ? "Good" : "Needs work";
  if (metric === "bounceRate") return value <= 0.5 ? "Excellent" : value <= 1.5 ? "Good" : "Needs work";
  if (metric === "unsubscribeRate") return value <= 0.2 ? "Excellent" : value <= 0.5 ? "Good" : "Needs work";
  return "Good";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("HUBSPOT_ACCESS_TOKEN");
    if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN not configured");

    const { brandName, startDate, endDate } = (await req.json()) as HubSpotRequest;
    if (!brandName || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get contacts count
    const contactsSearch = await hubspotFetch(
      `/crm/v3/objects/contacts/search`,
      token
    ).catch(() => ({ total: 0 }));

    // Note: filtering by brand requires a custom property in HubSpot.
    // For now we get total and the caller can filter by brand property if configured.
    const totalContacts = contactsSearch.total || 0;

    // Get lifecycle stage breakdown
    const lifecycleStages = [
      { stage: "Subscriber", count: 0 },
      { stage: "Lead", count: 0 },
      { stage: "MQL", count: 0 },
      { stage: "SQL", count: 0 },
      { stage: "Opportunity", count: 0 },
      { stage: "Customer", count: 0 },
    ];

    // Search contacts by lifecycle stage
    for (const ls of lifecycleStages) {
      try {
        const searchBody = {
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
        };
        const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(searchBody),
        });
        if (res.ok) {
          const data = await res.json();
          ls.count = data.total || 0;
        }
      } catch {
        // Skip on error
      }
    }

    // Get marketing emails
    const emailsRes = await hubspotFetch(
      `/marketing-emails/v1/emails?limit=100&orderBy=-publishDate`,
      token
    ).catch(() => ({ objects: [] }));

    const allEmails = (emailsRes.objects || [])
      .filter((e: any) => {
        const pubDate = e.publishDate ? new Date(e.publishDate).toISOString().split("T")[0] : null;
        return pubDate && pubDate >= startDate && pubDate <= endDate;
      })
      .map((e: any) => {
        const stats = e.stats?.counters || {};
        const sent = stats.sent || 0;
        const delivered = stats.delivered || sent;
        const opens = stats.open || 0;
        const clicks = stats.click || 0;
        const bounce = stats.bounce || 0;
        const unsubscribe = stats.unsubscribed || 0;
        const spam = stats.spamreport || 0;

        return {
          name: e.name || "Untitled",
          subject: e.subject || "",
          sender: e.fromName || "Unknown",
          publishDate: e.publishDate ? new Date(e.publishDate).toISOString().split("T")[0] : "",
          sent,
          delivered,
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
        };
      });

    // Calculate aggregate metrics from filtered emails
    let totalSent = 0, totalDelivered = 0, totalOpens = 0, totalClicks = 0;
    let totalBounce = 0, totalUnsub = 0, totalSpam = 0;
    for (const e of allEmails) {
      totalSent += e.sent;
      totalDelivered += e.delivered;
      totalOpens += e.opens;
      totalClicks += e.clicks;
      totalBounce += e.bounce;
      totalUnsub += e.unsubscribe;
      totalSpam += e.spam;
    }

    const openRate = totalDelivered > 0 ? parseFloat((totalOpens / totalDelivered * 100).toFixed(1)) : 0;
    const clickRate = totalDelivered > 0 ? parseFloat((totalClicks / totalDelivered * 100).toFixed(1)) : 0;
    const bounceRate = totalSent > 0 ? parseFloat((totalBounce / totalSent * 100).toFixed(2)) : 0;
    const unsubscribeRate = totalSent > 0 ? parseFloat((totalUnsub / totalSent * 100).toFixed(2)) : 0;
    const deliveredRate = totalSent > 0 ? parseFloat((totalDelivered / totalSent * 100).toFixed(1)) : 0;

    const healthScore = Math.min(10, Math.max(1, parseFloat(
      (openRate / 5 + clickRate / 2 - bounceRate * 2 - unsubscribeRate * 5 + 2).toFixed(1)
    )));

    // Sort for high/low performing
    const sorted = [...allEmails].sort((a, b) => (b.openRate + b.clickRate) - (a.openRate + a.clickRate));
    const highPerforming = sorted.slice(0, 3);
    const lowPerforming = sorted.slice(-3).reverse();

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
      lifecycleStages,
      emails: allEmails,
      highPerforming,
      lowPerforming,
      // Time series from email data
      openRateOverTime: allEmails
        .sort((a, b) => a.publishDate.localeCompare(b.publishDate))
        .map((e) => ({ date: e.publishDate, value: e.openRate })),
      unsubscribeRateOverTime: allEmails
        .sort((a, b) => a.publishDate.localeCompare(b.publishDate))
        .map((e) => ({ date: e.publishDate, value: e.unsubscribeRate })),
    };

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
