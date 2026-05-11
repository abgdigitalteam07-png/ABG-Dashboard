const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Only secondary-account brands use this function.
// Currently wired for American Whirlpool; can extend to Vita Spa / MAAX Sauna if needed.
const SECONDARY_BRANDS = new Set(["American Whirlpool", "Vita Spa", "MAAX Sauna"]);

interface FeedbackRequest {
  brandName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
}

// Lifecycle stage internal values → display info
const STAGE_META: Record<string, { label: string; color: string; formOption: string }> = {
  customer:    { label: "Bought American Whirlpool", color: "#10B981", formOption: "customer"    },
  other:       { label: "Bought Another Brand",      color: "#F59E0B", formOption: "other"       },
  opportunity: { label: "Service / Parts",           color: "#3B82F6", formOption: "opportunity" },
  lead:        { label: "Still Shopping Around",     color: "#8B5CF6", formOption: "lead"        },
};

async function hubspotPost(path: string, token: string, body: unknown, retries = 5): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(`https://api.hubapi.com${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 502) {
      if (i === retries) break;
      await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, i), 10000) + Math.random() * 300));
      continue;
    }
    if (!res.ok) throw new Error(`HubSpot ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error(`HubSpot rate-limited after ${retries} retries`);
}

// Build token set for matching the "brands" contact property value
function buildTokenSet(name: string): Set<string> {
  return new Set([name.toLowerCase(), name.toLowerCase().replace(/\s+/g, "_"), name.toLowerCase().replace(/\s+/g, "")]);
}

function matchesBrand(props: Record<string, any>, tokens: Set<string>): boolean {
  const raw = (props.brands || "").toLowerCase();
  return raw.split(";").map((t: string) => t.trim()).filter(Boolean).some((t: string) => tokens.has(t));
}

// Convert YYYY-MM-DD to midnight UTC (in ms)
function dateToMs(dateStr: string): number {
  return new Date(dateStr + "T00:00:00.000Z").getTime();
}

// Returns the lifecycle-stage response date for a contact (null = no dealer feedback detected)
function getResponseDate(props: Record<string, any>, createMs: number): number | null {
  const stage = (props.lifecyclestage || "").toLowerCase();
  let dateMs: number | null = null;

  if (stage === "customer" && props.hs_lifecyclestage_customer_date) {
    dateMs = Number(props.hs_lifecyclestage_customer_date);
  } else if (stage === "opportunity" && props.hs_lifecyclestage_opportunity_date) {
    dateMs = Number(props.hs_lifecyclestage_opportunity_date);
  } else if (stage === "other" && props.hs_lifecyclestage_other_date) {
    dateMs = Number(props.hs_lifecyclestage_other_date);
  } else if (stage === "lead" && props.hs_lifecyclestage_lead_date) {
    const leadMs = Number(props.hs_lifecyclestage_lead_date);
    // Only count as dealer feedback if the lead stage was set >1 day after contact creation
    // (i.e. it was explicitly updated by the dealer form, not the default "lead" at creation)
    if (leadMs - createMs > 86_400_000) dateMs = leadMs;
  }

  return dateMs;
}

function daysToResponseBucket(days: number): string {
  if (days <= 3)  return "Day 2 (1–3d)";
  if (days <= 9)  return "Day 7 (4–9d)";
  if (days <= 20) return "Day 14 (10–20d)";
  return "Late (20d+)";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brandName, startDate, endDate }: FeedbackRequest = await req.json();

    if (!brandName || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!SECONDARY_BRANDS.has(brandName)) {
      return new Response(JSON.stringify({ error: "Brand not supported by this function" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("HUBSPOT_ACCESS_TOKEN_2");
    if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN_2 not configured");

    const startMs = dateToMs(startDate);
    const endMs   = dateToMs(endDate) + 86_400_000 - 1; // inclusive of end day

    // Build brand token set (also resolve HubSpot option values for this brand)
    const brandTokens = buildTokenSet(brandName);
    try {
      const propDef = await fetch(`https://api.hubapi.com/crm/v3/properties/contacts/brands`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      }).then(r => r.json());
      for (const opt of (propDef.options || [])) {
        const lbl = (opt.label || "").toLowerCase();
        const val = (opt.value || "").toLowerCase();
        if (lbl === brandName.toLowerCase() || val === brandName.toLowerCase()) {
          if (val) brandTokens.add(val);
          if (lbl) brandTokens.add(lbl);
        }
      }
    } catch { /* ignore — proceed with default tokens */ }

    // ── Aggregation accumulators ──
    let totalContacts = 0;
    const stageCounts: Record<string, number> = { customer: 0, other: 0, opportunity: 0, lead: 0, none: 0 };
    const timingBuckets: Record<string, number> = {
      "Day 2 (1–3d)": 0, "Day 7 (4–9d)": 0, "Day 14 (10–20d)": 0, "Late (20d+)": 0,
    };
    // dealer email → stage counts + totals
    const dealerMap: Record<string, { name: string; state: string; total: number; customer: number; other: number; opportunity: number; lead: number; responded: number }> = {};
    // date → stage counts
    const dailyMap: Record<string, { customer: number; other: number; opportunity: number; lead: number }> = {};

    let after: string | undefined;

    for (let page = 0; page < 120; page++) {
      if (page > 0) await new Promise(r => setTimeout(r, 150));

      const searchBody: any = {
        filterGroups: [{ filters: [
          { propertyName: "createdate", operator: "GTE", value: String(startMs) },
          { propertyName: "createdate", operator: "LTE", value: String(endMs) },
        ]}],
        properties: [
          "brands",
          "lifecyclestage",
          "createdate",
          "nearest_dealer_email",
          "closest_dealer_name",
          "closest_dealer_state",
          "hs_lifecyclestage_customer_date",
          "hs_lifecyclestage_opportunity_date",
          "hs_lifecyclestage_other_date",
          "hs_lifecyclestage_lead_date",
        ],
        sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
        limit: 100,
      };
      if (after) searchBody.after = after;

      const res = await hubspotPost("/crm/v3/objects/contacts/search", token, searchBody);

      for (const contact of (res.results || [])) {
        const props = contact.properties || {};
        if (!matchesBrand(props, brandTokens)) continue;

        const rawCreate = props.createdate;
        let createMs = 0;
        if (rawCreate != null && rawCreate !== "") {
          const n = Number(rawCreate);
          createMs = Number.isFinite(n) && n > 0 ? n : new Date(rawCreate).getTime();
        }
        const dateKey = Number.isFinite(createMs) && createMs > 0
          ? new Date(createMs).toISOString().split("T")[0]
          : null;

        // Skip known data-spike date for American Whirlpool
        if (brandName === "American Whirlpool" && dateKey === "2025-11-19") continue;

        totalContacts++;

        const stage = (props.lifecyclestage || "").toLowerCase();
        const responseMs = getResponseDate(props, createMs);
        const hasResponse = responseMs !== null;
        const stageKey = hasResponse && STAGE_META[stage] ? stage : "none";

        stageCounts[stageKey]++;

        // Daily trend — only for contacts with confirmed dealer feedback
        if (hasResponse && dateKey && STAGE_META[stage]) {
          if (!dailyMap[dateKey]) dailyMap[dateKey] = { customer: 0, other: 0, opportunity: 0, lead: 0 };
          dailyMap[dateKey][stage as keyof typeof dailyMap[string]]++;
        }

        // Response timing
        if (hasResponse && createMs > 0 && responseMs) {
          const days = Math.max(0, Math.round((responseMs - createMs) / 86_400_000));
          const bucket = daysToResponseBucket(days);
          timingBuckets[bucket] = (timingBuckets[bucket] || 0) + 1;
        }

        // Per-dealer breakdown
        const dealerEmail = (props.nearest_dealer_email || "").trim();
        if (dealerEmail) {
          if (!dealerMap[dealerEmail]) {
            dealerMap[dealerEmail] = {
              name: (props.closest_dealer_name || "").trim(),
              state: (props.closest_dealer_state || "").trim().toUpperCase(),
              total: 0, responded: 0,
              customer: 0, other: 0, opportunity: 0, lead: 0,
            };
          }
          dealerMap[dealerEmail].total++;
          if (hasResponse && STAGE_META[stage]) {
            dealerMap[dealerEmail].responded++;
            dealerMap[dealerEmail][stage as "customer" | "other" | "opportunity" | "lead"]++;
          }
        }
      }

      if (res.paging?.next?.after) after = res.paging.next.after;
      else break;
    }

    const feedbackCount = stageCounts.customer + stageCounts.other + stageCounts.opportunity + stageCounts.lead;

    const stageDistribution = [
      ...Object.entries(STAGE_META).map(([key, meta]) => ({
        stage: key,
        label: meta.label,
        color: meta.color,
        count: stageCounts[key],
      })),
      { stage: "none", label: "No Response", color: "#94A3B8", count: stageCounts.none },
    ];

    const dealerBreakdown = Object.entries(dealerMap)
      .map(([email, d]) => ({
        email,
        ...d,
        responseRate: d.total > 0 ? Math.round((d.responded / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const dailyTrend = Object.entries(dailyMap)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const responseTimingBuckets = Object.entries(timingBuckets).map(([bucket, count]) => ({ bucket, count }));

    console.log(`[hubspot-dealer-feedback] ${brandName}: ${totalContacts} contacts, ${feedbackCount} with feedback`);

    return new Response(JSON.stringify({
      totalContacts,
      feedbackCount,
      feedbackRate: totalContacts > 0 ? feedbackCount / totalContacts : 0,
      stageDistribution,
      responseTimingBuckets,
      dealerBreakdown,
      dailyTrend,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[hubspot-dealer-feedback]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
