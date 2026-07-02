const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BRAND_TO_BU: Record<string, string> = {
  "ABG Hospitality": "1982882",
  "Accessible Home Store": "2625978",
  Aker: "1982881",
  Aquarius: "1982883",
  Aquatic: "1982884",
  Bootz: "1982886",
  Clarion: "1982887",
  "Comfort Designs": "1982888",
  DreamLine: "1690059",
  Florestone: "1690060",
  Hamilton: "1982889",
  IMI: "1982890",
  "Laurel Mountain": "1982879",
  MAAX: "1982891",
  Maidstone: "1982892",
  Neptune: "1690061",
  RBS: "1982893",
  Swan: "843133",
  "Vintage.ca": "2659249",
  "American Bath Group": "0",
};

// Secondary HubSpot account brands — filtered by "brand" contact property, not business unit
const SECONDARY_BRANDS = new Set(["American Whirlpool", "Vita Spa", "MAAX Sauna"]);

async function hubspotPostWithRetry(path: string, token: string, body: unknown, maxRetries = 6): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(`https://api.hubapi.com${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
      if (attempt === maxRetries) break;
      const wait = Math.min(1000 * Math.pow(2, attempt), 12000) + Math.floor(Math.random() * 300);
      console.log(`[hubspot-contacts] ${res.status} retry in ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HubSpot API error (${path}): ${res.status} ${err.slice(0, 300)}`);
    }
    return res.json();
  }
  // Soft-fail: signal rate limit to caller, which returns empty data instead of 500
  const err: any = new Error(`HubSpot rate limit after ${maxRetries} retries`);
  err.rateLimited = true;
  throw err;
}

function isRateLimited(e: unknown): boolean {
  return !!(e && typeof e === "object" && (e as any).rateLimited);
}

interface ContactsRequest {
  brandName?: string;   // single brand — overview tab
  brandNames?: string[]; // multiple brands — comparison tab (one call, all brands)
  startDate: string;
  endDate: string;
}

// Returns the UTC timestamp for midnight Eastern Time on the given YYYY-MM-DD string.
// Accounts for US DST: UTC-4 (EDT) from 2nd Sunday March to 1st Sunday November, UTC-5 (EST) otherwise.
function easternMidnightMs(dateStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dateMs = Date.UTC(y, mo - 1, d);
  const march1Day = new Date(Date.UTC(y, 2, 1)).getUTCDay();
  const dstStartMs = Date.UTC(y, 2, 8 + (7 - march1Day) % 7, 7); // 2nd Sun Mar 07:00Z = 2am EST
  const nov1Day = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  const dstEndMs = Date.UTC(y, 10, 1 + (7 - nov1Day) % 7, 6); // 1st Sun Nov 06:00Z = 2am EDT
  return dateMs + (dateMs >= dstStartMs && dateMs < dstEndMs ? 4 : 5) * 3_600_000;
}

// Build a robust token set for matching the "brands" property value stored in HubSpot.
function buildTokenSet(name: string): Set<string> {
  return new Set([
    name.toLowerCase(),
    name.toLowerCase().replace(/\s+/g, "_"),
    name.toLowerCase().replace(/\s+/g, ""),
  ]);
}

function matchesBrand(props: Record<string, any>, tokenSet: Set<string>): boolean {
  const raw = (props.brands || "").toLowerCase();
  const tokens = raw.split(";").map((t: string) => t.trim()).filter(Boolean);
  return tokens.some((t: string) => tokenSet.has(t));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ContactsRequest = await req.json();
    const { startDate, endDate } = body;
    // Support both single-brand and multi-brand calls
    const brandNames: string[] = body.brandNames?.length
      ? body.brandNames
      : body.brandName ? [body.brandName] : [];

    if (!brandNames.length || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // True when the caller passed brandNames[] — comparison tab always uses this path
    // even for a single brand, and always expects the brandData{} response shape.
    const useBrandNamesPath = !!body.brandNames?.length;
    const isMultiBrand = brandNames.length > 1;
    // All brands in the same call must be from the same HubSpot account
    const isSecondary = SECONDARY_BRANDS.has(brandNames[0]);
    const brandName = brandNames[0]; // used for single-brand path and logging

    const token = isSecondary
      ? Deno.env.get("HUBSPOT_ACCESS_TOKEN_2")
      : Deno.env.get("HUBSPOT_ACCESS_TOKEN");
    if (!token) throw new Error(isSecondary ? "HUBSPOT_ACCESS_TOKEN_2 not configured" : "HUBSPOT_ACCESS_TOKEN not configured");

    const buId = isSecondary ? null : BRAND_TO_BU[brandName];
    const startMs = easternMidnightMs(startDate);
    const endMs = easternMidnightMs(endDate) + 24 * 3_600_000 - 1;

    console.log(`Fetching contacts for brands=[${brandNames.join(",")}] account=${isSecondary ? "secondary" : "primary"} from ${startDate} to ${endDate}`);

    // ── Multi-brand path (comparison tab) ─────────────────────────────────────
    // Fetches all secondary account contacts for the period ONCE, then counts
    // per-brand in code. One edge function call instead of N parallel calls —
    // eliminates rate-limit hammering that caused inconsistent results.
    if (useBrandNamesPath && isSecondary) {
      // Build token sets for every requested brand, plus resolve option values.
      const tokenSets = new Map<string, Set<string>>();
      for (const bn of brandNames) tokenSets.set(bn, buildTokenSet(bn));

      try {
        const propDef = await fetch(`https://api.hubapi.com/crm/v3/properties/contacts/brands`, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        }).then(r => r.json());
        const options: any[] = propDef.options || [];
        for (const bn of brandNames) {
          const ts = tokenSets.get(bn)!;
          for (const opt of options) {
            const lbl = (opt.label || "").toLowerCase();
            const val = (opt.value || "").toLowerCase();
            if (lbl === bn.toLowerCase() || val === bn.toLowerCase()) {
              if (val) ts.add(val);
              if (lbl) ts.add(lbl);
            }
          }
          console.log(`  ${bn} tokens: ${[...tokenSets.get(bn)!].join(", ")}`);
        }
      } catch (e) {
        console.warn("Could not resolve brand option tokens:", e);
      }

      // Per-brand counters + daily time series
      const brandStats: Record<string, { total: number; assigned: number; unassigned: number }> = {};
      const brandSeries: Record<string, Record<string, number>> = {};
      const brandDealerCounts: Record<string, Record<string, { name: string; state: string; zip: string; count: number }>> = {};
      const brandSourceCounts: Record<string, Record<string, number>> = {};
      for (const bn of brandNames) {
        brandStats[bn] = { total: 0, assigned: 0, unassigned: 0 };
        brandSeries[bn] = {};
        brandDealerCounts[bn] = {};
        brandSourceCounts[bn] = {};
      }

      let after: string | undefined;
      let totalScanned = 0;
      const maxPages = 100;

      for (let page = 0; page < maxPages; page++) {
        const searchBody: any = {
          filterGroups: [{ filters: [
            { propertyName: "createdate", operator: "GTE", value: String(startMs) },
            { propertyName: "createdate", operator: "LTE", value: String(endMs) },
          ]}],
          properties: ["brands", "nearest_dealer_email", "closest_dealer_name", "closest_dealer_state", "closest_dealer_zip", "createdate", "hs_analytics_source"],
          sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
          limit: 100,
        };
        if (after) searchBody.after = after;
        if (page > 0) await new Promise(r => setTimeout(r, 150));

        let res: any;
        try {
          res = await hubspotPostWithRetry("/crm/v3/objects/contacts/search", token, searchBody);
        } catch (e: unknown) {
          if (page === 0) {
            return new Response(JSON.stringify({ brandData: Object.fromEntries(brandNames.map(bn => [bn, { totalContacts: 0, dealerAssignedTotal: 0, dealerUnassignedTotal: 0 }])) }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          throw e;
        }

        for (const contact of (res.results || [])) {
          totalScanned++;
          const props = contact.properties || {};
          const dealerEmail = (props.nearest_dealer_email || "").trim();
          const hasDealer = !!dealerEmail;
          const dateKey = props.createdate
            ? new Date(props.createdate).toISOString().split("T")[0]
            : null;
          for (const bn of brandNames) {
            // Exclude Nov 19 2025 data spike for American Whirlpool
            if (bn === "American Whirlpool" && dateKey === "2025-11-19") continue;
            if (matchesBrand(props, tokenSets.get(bn)!)) {
              brandStats[bn].total++;
              if (hasDealer) {
                brandStats[bn].assigned++;
                if (!brandDealerCounts[bn][dealerEmail]) {
                  brandDealerCounts[bn][dealerEmail] = {
                    name:  (props.closest_dealer_name  || "").trim(),
                    state: (props.closest_dealer_state || "").trim().toUpperCase(),
                    zip:   (props.closest_dealer_zip   || "").trim(),
                    count: 0,
                  };
                }
                brandDealerCounts[bn][dealerEmail].count++;
              } else {
                brandStats[bn].unassigned++;
              }
              if (dateKey) {
                brandSeries[bn][dateKey] = (brandSeries[bn][dateKey] || 0) + 1;
              }
              // Original source
              const src = (props.hs_analytics_source || "UNKNOWN").toUpperCase().trim() || "UNKNOWN";
              brandSourceCounts[bn][src] = (brandSourceCounts[bn][src] || 0) + 1;
            }
          }
        }
        if (res.paging?.next?.after) after = res.paging.next.after;
        else break;
      }

      console.log(`Multi-brand scan: ${totalScanned} contacts scanned, results: ${JSON.stringify(Object.fromEntries(Object.entries(brandStats).map(([k, v]) => [k, v.total])))}`);

      // Build sorted dealer breakdown per brand
      const brandDealerBreakdown = Object.fromEntries(
        brandNames.map(bn => [
          bn,
          Object.entries(brandDealerCounts[bn])
            .map(([email, d]) => ({ email, ...d }))
            .sort((a, b) => b.count - a.count),
        ])
      );

      return new Response(JSON.stringify({
        brandData: Object.fromEntries(brandNames.map(bn => [bn, {
          totalContacts: brandStats[bn].total,
          dealerAssignedTotal: brandStats[bn].assigned,
          dealerUnassignedTotal: brandStats[bn].unassigned,
        }])),
        brandTimeSeries: brandSeries,
        brandDealerBreakdown,
        brandSourceBreakdown: brandSourceCounts,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Single-brand path (overview tab + primary brands) ────────────────────
    // For secondary brands, the "brands" property is not reliably filterable
    // server-side — always fetch by date range and filter in code.
    const brandMatchTokens = buildTokenSet(brandName);

    if (isSecondary) {
      try {
        const propDef = await fetch(`https://api.hubapi.com/crm/v3/properties/contacts/brands`, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        }).then(r => r.json());
        const options: any[] = propDef.options || [];
        for (const opt of options) {
          const lbl = (opt.label || "").toLowerCase();
          const val = (opt.value || "").toLowerCase();
          if (lbl === brandName.toLowerCase() || val === brandName.toLowerCase()) {
            if (val) brandMatchTokens.add(val);
            if (lbl) brandMatchTokens.add(lbl);
          }
        }
        console.log(`Brand match tokens for "${brandName}": ${[...brandMatchTokens].join(", ")}`);
      } catch (e) {
        console.warn("Could not fetch brands property definition:", e);
      }
    }

    // ── 1. New contacts over time ──
    const contactsByDate: Record<string, { total: number; hubspot: number; salesforce: number }> = {};
    const jobTitleCounts: Record<string, number> = {};
    const stateCounts: Record<string, number> = {};
    let dealerAssignedTotal = 0;
    let dealerUnassignedTotal = 0;
    // per-dealer lead counts { email -> { name, state, zip, count } }
    const dealerCounts: Record<string, { name: string; state: string; zip: string; count: number }> = {};

    let after: string | undefined;
    let totalFetched = 0;
    const maxPages = 100;

    for (let page = 0; page < maxPages; page++) {
      const filters: any[] = [
        { propertyName: "createdate", operator: "GTE", value: String(startMs) },
        { propertyName: "createdate", operator: "LTE", value: String(endMs) },
      ];

      if (!isSecondary && buId && buId !== "0") {
        filters.push({ propertyName: "hs_all_assigned_business_unit_ids", operator: "CONTAINS_TOKEN", value: buId });
      }

      const searchBody: any = {
        filterGroups: [{ filters }],
        properties: [
          "createdate",
          "hs_object_source",
          "hs_object_source_detail_1",
          "hs_analytics_source",
          "hs_analytics_source_data_1",
          "jobtitle",
          "brands",
          "ip_state_code",
          "ip_state",
          "nearest_dealer_email",
          "closest_dealer_name",
          "closest_dealer_state",
          "closest_dealer_zip",
        ],
        sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
        limit: 100,
      };
      if (after) searchBody.after = after;

      if (page > 0) {
        await new Promise((r) => setTimeout(r, 150));
      }

      let res: any;
      try {
        res = await hubspotPostWithRetry("/crm/v3/objects/contacts/search", token, searchBody);
      } catch (e: unknown) {
        if (page === 0) {
          console.warn(`[hubspot-contacts] Search failed for "${brandName}": ${(e as Error).message}`);
          return new Response(JSON.stringify({
            totalContacts: 0, contactsOverTime: [], jobTitles: [], stateDistribution: [],
            dealerAssignedTotal: 0, dealerUnassignedTotal: 0,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw e;
      }
      const results = res.results || [];

      for (const contact of results) {
        const props = contact.properties || {};

        if (isSecondary && !matchesBrand(props, brandMatchTokens)) continue;

        // Date bucket
        const createDate = props.createdate;
        if (!createDate) continue;
        const dateKey = new Date(createDate).toISOString().split("T")[0];

        // American Whirlpool: exclude Nov 19 2025 data spike from all counts
        if (brandName === "American Whirlpool" && dateKey === "2025-11-19") continue;

        totalFetched++;

        if (!contactsByDate[dateKey]) {
          contactsByDate[dateKey] = { total: 0, hubspot: 0, salesforce: 0 };
        }
        contactsByDate[dateKey].total++;

        // Source detection
        const objSource = (props.hs_object_source || "").toUpperCase();
        const objSourceDetail = (props.hs_object_source_detail_1 || "").toLowerCase();
        const analyticsSource = (props.hs_analytics_source || "").toUpperCase();
        const analyticsSourceData = (props.hs_analytics_source_data_1 || "").toLowerCase();

        let isSalesforce = false;
        if (objSource === "INTEGRATION" && objSourceDetail.includes("salesforce")) {
          isSalesforce = true;
        } else if (analyticsSource === "OFFLINE" && analyticsSourceData.includes("salesforce")) {
          isSalesforce = true;
        }

        if (isSalesforce) {
          contactsByDate[dateKey].salesforce++;
        } else {
          contactsByDate[dateKey].hubspot++;
        }

        // Job title
        const title = (props.jobtitle || "").trim();
        const normalizedTitle = title || "Not specified";
        jobTitleCounts[normalizedTitle] = (jobTitleCounts[normalizedTitle] || 0) + 1;

        // State / region
        const stateCode = (props.ip_state_code || props.ip_state || "").trim().toUpperCase();
        if (stateCode) {
          stateCounts[stateCode] = (stateCounts[stateCode] || 0) + 1;
        } else {
          stateCounts["UNKNOWN"] = (stateCounts["UNKNOWN"] || 0) + 1;
        }

        // Dealer assignment
        const dealerEmail = (props.nearest_dealer_email || "").trim();
        if (dealerEmail) {
          dealerAssignedTotal++;
          if (!dealerCounts[dealerEmail]) {
            dealerCounts[dealerEmail] = {
              name:  (props.closest_dealer_name  || "").trim(),
              state: (props.closest_dealer_state || "").trim().toUpperCase(),
              zip:   (props.closest_dealer_zip   || "").trim(),
              count: 0,
            };
          }
          dealerCounts[dealerEmail].count++;
        } else {
          dealerUnassignedTotal++;
        }
      }

      if (res.paging?.next?.after) {
        after = res.paging.next.after;
      } else {
        break;
      }
    }

    console.log(`Fetched ${totalFetched} contacts total`);

    // Format contacts over time
    const contactsOverTime = Object.entries(contactsByDate)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top 20 job titles (excluding "Not specified")
    const jobTitles = Object.entries(jobTitleCounts)
      .filter(([title]) => title !== "Not specified")
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([title, count]) => ({ title, count }));

    // Add "Not specified" at the end if it exists
    if (jobTitleCounts["Not specified"]) {
      jobTitles.push({ title: "Not specified", count: jobTitleCounts["Not specified"] });
    }

    // State distribution
    const stateDistribution = Object.entries(stateCounts)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);

    // Dealer breakdown — sorted by lead count descending
    const dealerBreakdown = Object.entries(dealerCounts)
      .map(([email, d]) => ({ email, ...d }))
      .sort((a, b) => b.count - a.count);

    const result = {
      totalContacts: totalFetched,
      contactsOverTime,
      jobTitles,
      stateDistribution,
      dealerAssignedTotal,
      dealerUnassignedTotal,
      dealerBreakdown,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("HubSpot contacts error:", error);
    if (isRateLimited(error)) {
      return new Response(JSON.stringify({
        totalContacts: 0,
        contactsOverTime: [],
        jobTitles: [],
        stateDistribution: [],
        dealerAssignedTotal: 0,
        dealerUnassignedTotal: 0,
        dealerBreakdown: [],
        rateLimited: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
