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
  contactsOnly?: boolean; // skip email fetching — returns just contact/dealer counts fast
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

// ─── Secondary account config ───
// These brands live in a separate HubSpot account (HUBSPOT_ACCESS_TOKEN_2).
// Emails are identified by their included segment (contact list) names — not business units.
const SECONDARY_BRANDS = new Set(["American Whirlpool", "Vita Spa", "MAAX Sauna"]);

const SECONDARY_SEGMENT_KEYWORDS: Record<string, string[]> = {
  "American Whirlpool": ["american"],
  "Vita Spa": ["vita"],
  "MAAX Sauna": ["sauna"],
};

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
  if (metric === "openRate") return value >= 25 ? "Excellent" : value >= 20 ? "Good" : "Needs work";
  if (metric === "clickRate") return value >= 4 ? "Excellent" : value >= 2.5 ? "Good" : "Needs work";
  if (metric === "bounceRate") return value <= 0.5 ? "Excellent" : value <= 0.15 ? "Good" : "Needs work";
  if (metric === "unsubscribeRate") return value <= 0.2 ? "Excellent" : value <= 0.45 ? "Good" : "Needs work";
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

// ─── Brand → businessUnitId mapping (primary account) ───

const BRAND_TO_BU: Record<string, string[]> = {
  "ABG Hospitality": ["1982882"],
  "Accessible Home Store": ["2625978"],
  Aker: ["1982881"],
  Aquarius: ["1982883"],
  Aquatic: ["1982884"],
  Bootz: ["1982886"],
  Clarion: ["1982887"],
  "Comfort Designs": ["1982888"],
  DreamLine: ["1690059"],
  Florestone: ["1690060"],
  Hamilton: ["1982889"],
  IMI: ["1982890"],
  "Laurel Mountain": ["1982879"],
  MAAX: ["1982891"],
  Maidstone: ["1982892"],
  Neptune: ["1690061"],
  RBS: ["1982893"],
  Swan: ["843133"],
  "Vintage.ca": ["2659249"],
  "American Bath Group": ["0"],
};

const BU_TO_BRAND: Record<string, string> = {};
for (const [brand, ids] of Object.entries(BRAND_TO_BU)) {
  for (const id of ids) BU_TO_BRAND[id] = brand;
}

// ─── fetch all contact lists (segments) — used to resolve list IDs to names ───

async function fetchAllContactLists(token: string): Promise<Record<string, string>> {
  const listIdToName: Record<string, string> = {};
  let offset = 0;

  while (true) {
    try {
      const res = await hubspotFetch(`/contacts/v1/lists?count=250&offset=${offset}`, token);
      for (const list of (res.lists || [])) {
        listIdToName[String(list.listId)] = (list.name || "").toLowerCase();
      }
      if (!res["has-more"]) break;
      offset += (res.lists || []).length;
    } catch (e) {
      console.error("Error fetching contact lists:", e);
      break;
    }
  }

  console.log(`Fetched ${Object.keys(listIdToName).length} contact lists`);
  return listIdToName;
}

// ─── check if an email belongs to a secondary brand via segment name matching ───

function emailMatchesSecondaryBrand(email: any, brandName: string, listIdToName: Record<string, string>): boolean {
  const keywords = SECONDARY_SEGMENT_KEYWORDS[brandName] || [];

  // Try to extract included list IDs from the email object (HubSpot may return in different fields)
  const rawIds: string[] =
    email?.includedListIds ||
    email?.hs_email_included_list_ids ||
    email?.contactListIds ||
    [];

  // Some HubSpot fields return semicolon-separated strings
  const listIds: string[] = Array.isArray(rawIds)
    ? rawIds.map(String)
    : String(rawIds).split(";").map((s: string) => s.trim()).filter(Boolean);

  // Check segment names
  for (const listId of listIds) {
    const segmentName = listIdToName[listId] || "";
    if (keywords.some((kw) => segmentName.includes(kw))) {
      return true;
    }
  }

  // Fallback: check the email name itself (useful when segment data isn't available)
  const emailName = (email?.name || "").toLowerCase();
  return keywords.some((kw) => emailName.includes(kw));
}

// ─── fetch all published emails ───

async function fetchAllEmails(token: string): Promise<any[]> {
  const all: any[] = [];
  let after: string | undefined;
  let page = 0;

  while (page < 50) {
    let url =
      "/marketing/v3/emails?limit=100&orderBy=-publishDate&isPublished=true" +
      "&property=hs_publish_date&property=hs_published_by_name&property=brand" +
      "&property=state&property=subcategory&property=hs_email_included_list_ids";
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
): Promise<{
  stats: PeriodStats;
  emails: (EmailRecord & { pending: number })[];
  deliveryByDate: Record<string, number>;
}> {
  const stats: PeriodStats = {
    totalSent: 0,
    totalDelivered: 0,
    totalOpens: 0,
    totalClicks: 0,
    totalBounce: 0,
    totalHardBounce: 0,
    totalSoftBounce: 0,
    totalUnsub: 0,
    totalSpam: 0,
    totalPending: 0,
    totalEmails: 0,
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
          sender,
          publishDate,
          state,
          subcategory,
          sent,
          delivered,
          opens,
          clicks,
          bounce,
          hardBounce: hardbounced,
          softBounce: softbounced,
          unsubscribe,
          spam,
          pending,
          openRate,
          clickRate,
          deliveredRate,
          unsubscribeRate,
          bounceRate,
          spamRate,
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

// Redeploy trigger: ip_state (full region name) + all-time lifecycle/job-title counts + import source tracking
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: HubSpotRequest = await req.json();

    const isSecondary = SECONDARY_BRANDS.has(body.brandName || "");
    const token = isSecondary
      ? Deno.env.get("HUBSPOT_ACCESS_TOKEN_2")
      : Deno.env.get("HUBSPOT_ACCESS_TOKEN");
    if (!token) throw new Error(isSecondary ? "HUBSPOT_ACCESS_TOKEN_2 not configured" : "HUBSPOT_ACCESS_TOKEN not configured");

    // Debug mode (primary account only)
    if (body.debug === true && !isSecondary) {
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

      return new Response(JSON.stringify({ debug: true, businessUnits, buSummary }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { brandName, startDate, endDate } = body;
    if (!brandName || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // HubSpot contact property used for the Account Type distribution chart.
    // Update this value if the internal property name differs in your HubSpot portal
    // (Settings → Properties → Contact properties → search "account type").
    const profileProperty = "account_type";

    console.log(`Fetching HubSpot data for brand="${brandName}" account=${isSecondary ? "secondary" : "primary"}, ${startDate} to ${endDate}`);

    // ── Contacts / lifecycle ──
    const buIds = isSecondary ? null : BRAND_TO_BU[brandName];
    const brandBuId = buIds ? buIds[0] : null;

    const startMs = new Date(startDate + "T00:00:00Z").getTime();
    const endMs = new Date(endDate + "T23:59:59Z").getTime();

    let totalContacts = 0;
    let totalContactsAllTime = 0;
    const stateCounts: Record<string, number> = {};
    let unknownStateCount = 0;
    // All-time lifecycle + job title data — populated inside if/else branches
    let lifecycleStagesAllTime: { stage: string; label: string; count: number }[] = [];
    let jobTitleCountsAllTime: Record<string, number> = {};
    // Dealer assignment state distributions (secondary brands only)
    const dealerWithDealStateCounts: Record<string, number> = {};
    const dealerWithoutDealStateCounts: Record<string, number> = {};
    let dealerAssignedTotal = 0;
    let dealerUnassignedTotal = 0;

    // Use HubSpot's exact internal lifecycle stage values so the frontend key mapping works.
    // Frontend ALL_LIFECYCLE_ORDER uses: subscriber, lead, marketingqualifiedlead, salesqualifiedlead, opportunity, customer
    const lifecycleStages = [
      { stage: "subscriber",              label: "Subscriber", count: 0 },
      { stage: "lead",                    label: "Lead",       count: 0 },
      { stage: "marketingqualifiedlead",  label: "MQL",        count: 0 },
      { stage: "salesqualifiedlead",      label: "SQL",        count: 0 },
      { stage: "opportunity",             label: "Opportunity",count: 0 },
      { stage: "customer",               label: "Customer",   count: 0 },
    ];

    const contactsByDate: Record<string, { total: number; hubspot: number; salesforce: number; import: number }> = {};
    const jobTitleCounts: Record<string, number> = {};
    const industryCounts: Record<string, number> = {};

    // State full names (HubSpot state/ip_state values) → 2-letter codes used by the map
    const STATE_FULL_NAMES: Record<string, string> = {
      AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
      CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
      HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
      KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
      MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
      MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
      NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
      OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
      SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
      VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
      DC: "District of Columbia",
    };
    const STATE_NAME_TO_CODE: Record<string, string> = {};
    for (const [code, name] of Object.entries(STATE_FULL_NAMES)) {
      STATE_NAME_TO_CODE[name.toLowerCase()] = code;
    }
    const STATE_CODES = Object.keys(STATE_FULL_NAMES);
    const STATE_CODE_SET = new Set(STATE_CODES);

    function normalizeStateCode(...values: Array<string | null | undefined>): string {
      for (const value of values) {
        const trimmed = (value || "").trim();
        if (!trimmed) continue;

        const upper = trimmed.toUpperCase();
        if (STATE_CODE_SET.has(upper)) return upper;

        const mapped = STATE_NAME_TO_CODE[trimmed.toLowerCase()];
        if (mapped) return mapped;
      }
      return "";
    }

    function countContactAnalytics(props: Record<string, any>) {
      const createDate = props.createdate;
      if (createDate) {
        const dateKey = new Date(createDate).toISOString().split("T")[0];
        if (!contactsByDate[dateKey]) {
          contactsByDate[dateKey] = { total: 0, hubspot: 0, salesforce: 0, import: 0 };
        }
        contactsByDate[dateKey].total++;

        const objSource = (props.hs_object_source || "").toUpperCase();
        const objSourceDetail = (props.hs_object_source_detail_1 || "").toLowerCase();
        const analyticsSource = (props.hs_analytics_source || "").toUpperCase();
        const analyticsSourceData = (props.hs_analytics_source_data_1 || "").toLowerCase();

        const isSalesforce =
          (objSource === "INTEGRATION" && objSourceDetail.includes("salesforce")) ||
          (analyticsSource === "OFFLINE" && analyticsSourceData.includes("salesforce"));
        const isImport = objSource === "IMPORT";

        if (isSalesforce) contactsByDate[dateKey].salesforce++;
        else if (isImport) contactsByDate[dateKey].import++;
        else contactsByDate[dateKey].hubspot++;
      }

      const title = (props.jobtitle || "").trim() || "Not specified";
      jobTitleCounts[title] = (jobTitleCounts[title] || 0) + 1;

      const profileValue = (props[profileProperty] || "").trim() || "Not specified";
      industryCounts[profileValue] = (industryCounts[profileValue] || 0) + 1;
    }

    if (isSecondary) {
      // Secondary account: the "brands" property is NOT filterable via HubSpot's search API
      // (CONTAINS_TOKEN on "brands" returns 400 errors). Fetch all contacts by date range
      // only, then filter in-code by checking the brands property value on each contact.
      try {
        // ── 1. In-period contacts: date-only filter, filter by brands in code ──
        {
          let after: string | undefined;
          while (true) {
            const searchBody: any = {
              filterGroups: [{ filters: [
                { propertyName: "createdate", operator: "GTE", value: String(startMs) },
                { propertyName: "createdate", operator: "LTE", value: String(endMs) },
              ]}],
              properties: [
                "createdate", "brands", "lifecyclestage",
                "ip_state", "ip_state_code", "state", "hs_state",
                "hs_object_source", "hs_object_source_detail_1",
                "hs_analytics_source", "hs_analytics_source_data_1",
                "jobtitle", profileProperty, "dealer_assigned",
              ],
              sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
              limit: 100,
            };
            if (after) searchBody.after = after;

            const res = await hubspotPost("/crm/v3/objects/contacts/search", token, searchBody);
            for (const c of (res.results || [])) {
              const contactBrands = (c.properties?.brands || "").toLowerCase();
              if (!contactBrands.includes(brandName.toLowerCase())) continue;

              totalContacts++;
              const props = c.properties || {};
              const stage = (props.lifecyclestage || "").toLowerCase().trim();
              const match = lifecycleStages.find(ls => ls.stage === stage);
              if (match) match.count++;
              countContactAnalytics(props);

              const stateCode = normalizeStateCode(props.state, props.ip_state_code, props.ip_state, props.hs_state);
              if (stateCode) {
                stateCounts[stateCode] = (stateCounts[stateCode] || 0) + 1;
                // Split by dealer_assigned for the gap analysis map
                const hasDealer = !!(props.dealer_assigned || "").trim();
                if (hasDealer) {
                  dealerWithDealStateCounts[stateCode] = (dealerWithDealStateCounts[stateCode] || 0) + 1;
                  dealerAssignedTotal++;
                } else {
                  dealerWithoutDealStateCounts[stateCode] = (dealerWithoutDealStateCounts[stateCode] || 0) + 1;
                  dealerUnassignedTotal++;
                }
              } else {
                unknownStateCount++;
                // Still count dealer status even for unknown-state contacts
                const hasDealer = !!(props.dealer_assigned || "").trim();
                if (hasDealer) dealerAssignedTotal++;
                else dealerUnassignedTotal++;
              }
            }
            if (res.paging?.next?.after) after = res.paging.next.after;
            else break;
          }
          console.log(`Secondary account: ${totalContacts} contacts for "${brandName}" in date range (dealer assigned: ${dealerAssignedTotal}, unassigned: ${dealerUnassignedTotal})`);
        }

        // ── 2. All-time: parallel year-by-year page scans, filter brands in code ──
        lifecycleStagesAllTime = [
          { stage: "subscriber",             label: "Subscriber",  count: 0 },
          { stage: "lead",                   label: "Lead",        count: 0 },
          { stage: "marketingqualifiedlead", label: "MQL",         count: 0 },
          { stage: "salesqualifiedlead",     label: "SQL",         count: 0 },
          { stage: "opportunity",            label: "Opportunity", count: 0 },
          { stage: "customer",              label: "Customer",    count: 0 },
        ];

        const currentYear = new Date().getFullYear();
        const years = Array.from({ length: currentYear - 2012 + 1 }, (_, i) => 2012 + i);
        const yearAllTimeCounts = await Promise.all(years.map(async (year) => {
          const yStart = String(new Date(`${year}-01-01T00:00:00Z`).getTime());
          const yEnd   = String(new Date(`${year}-12-31T23:59:59Z`).getTime());
          let yearCount = 0;
          let yAfter: string | undefined;
          while (true) {
            try {
              const searchBody: any = {
                filterGroups: [{ filters: [
                  { propertyName: "createdate", operator: "GTE", value: yStart },
                  { propertyName: "createdate", operator: "LTE", value: yEnd },
                ]}],
                properties: ["brands", "lifecyclestage"],
                sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
                limit: 100,
              };
              if (yAfter) searchBody.after = yAfter;
              const res = await hubspotPost("/crm/v3/objects/contacts/search", token, searchBody);
              if ((res.total ?? 0) === 0) break;
              for (const c of (res.results || [])) {
                const contactBrands = (c.properties?.brands || "").toLowerCase();
                if (!contactBrands.includes(brandName.toLowerCase())) continue;
                yearCount++;
                const stageVal = (c.properties?.lifecyclestage || "").toLowerCase().trim();
                const matchAll = lifecycleStagesAllTime.find(ls => ls.stage === stageVal);
                if (matchAll) matchAll.count++;
              }
              if (res.paging?.next?.after) yAfter = res.paging.next.after;
              else break;
            } catch (e) {
              console.error(`  all-time year ${year} error:`, e);
              break;
            }
          }
          return yearCount;
        }));
        totalContactsAllTime = yearAllTimeCounts.reduce((sum, n) => sum + n, 0);
        years.forEach((y, i) => { if (yearAllTimeCounts[i] > 0) console.log(`  all-time ${y}: ${yearAllTimeCounts[i]}`); });
        console.log(`Secondary all-time total for "${brandName}": ${totalContactsAllTime}`);
      } catch (e) {
        console.error("Secondary account contacts fetch error:", e);
      }
    } else { // primary account
      // Primary account — all counts are date-filtered to match the selected date range.
      // We use search-total API calls (fast, no data transfer) rather than fetching contact objects,
      // because ip_state is not reliably returned in search result properties.

      const buFilters: any[] = [];
      if (brandBuId && brandBuId !== "0") {
        buFilters.push({
          propertyName: "hs_all_assigned_business_unit_ids",
          operator: "CONTAINS_TOKEN",
          value: brandBuId,
        });
      }

      // Date range filters (applied to all queries so numbers match the selected period)
      const dateFilters = [
        { propertyName: "createdate", operator: "GTE", value: String(startMs) },
        { propertyName: "createdate", operator: "LTE", value: String(endMs) },
      ];
      const baseFilters = [...buFilters, ...dateFilters];

      // ── 1. Fetch contacts in range for charts + lifecycle counts ──
      try {
        let after: string | undefined;
        let fetchedContacts = 0;

        while (true) {
          const searchBody: any = {
            filterGroups: baseFilters.length > 0 ? [{ filters: baseFilters }] : [],
            properties: [
              "createdate",
              "lifecyclestage",
              "hs_object_source",
              "hs_object_source_detail_1",
              "hs_analytics_source",
              "hs_analytics_source_data_1",
              "jobtitle",
              profileProperty,
              "ip_state",
              "ip_state_code",
              "state",
              "hs_state",
            ],
            sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
            limit: 100,
          };
          if (after) searchBody.after = after;

          const res = await hubspotPost("/crm/v3/objects/contacts/search", token, searchBody);
          for (const contact of (res.results || [])) {
            const props = contact.properties || {};
            fetchedContacts++;
            countContactAnalytics(props);

            const stage = (props.lifecyclestage || "").toLowerCase().trim();
            const match = lifecycleStages.find((ls) => ls.stage === stage);
            if (match) match.count++;

            const stateCode = normalizeStateCode(props.ip_state_code, props.ip_state, props.state, props.hs_state);
            if (stateCode) {
              stateCounts[stateCode] = (stateCounts[stateCode] || 0) + 1;
            } else {
              unknownStateCount++;
            }
          }

          if (res.paging?.next?.after) after = res.paging.next.after;
          else {
            totalContacts = fetchedContacts;
            break;
          }
        }
        console.log(`Primary account: ${totalContacts} contacts in range for "${brandName}"`);
      } catch (e) {
        console.error("Primary account contacts fetch error:", e);
      }

      // ── 2. All-time total contacts for separate lifetime card ──
      try {
        const totalRes = await hubspotPost("/crm/v3/objects/contacts/search", token, {
          filterGroups: buFilters.length > 0 ? [{ filters: buFilters }] : [],
          properties: [],
          limit: 1,
        });
        totalContactsAllTime = totalRes.total ?? 0;
      } catch (e) {
        console.error("Primary account all-time total error:", e);
      }

      // ── 3. All-time lifecycle stage counts ──
      // Phase A: try fast EQ-filter queries (6 API calls).
      // Phase B: if all return 0, fall back to paginated contact scan — counts stages
      //          directly from property values (reliable regardless of HubSpot configuration).

      const LIFECYCLE_STAGE_DEF = [
        { stage: "subscriber",             label: "Subscriber",  count: 0 },
        { stage: "lead",                   label: "Lead",        count: 0 },
        { stage: "marketingqualifiedlead", label: "MQL",         count: 0 },
        { stage: "salesqualifiedlead",     label: "SQL",         count: 0 },
        { stage: "opportunity",            label: "Opportunity", count: 0 },
        { stage: "customer",              label: "Customer",    count: 0 },
      ];
      lifecycleStagesAllTime = LIFECYCLE_STAGE_DEF.map(d => ({ ...d }));

      // All-time lifecycle: use buFilters only (NO date filters) so we get true all-time counts
      const allTimeFilters = [...buFilters]; // intentionally excludes dateFilters

      // Phase A — EQ filter approach (fastest)
      try {
        for (let i = 0; i < lifecycleStagesAllTime.length; i += 3) {
          const batch = lifecycleStagesAllTime.slice(i, i + 3);
          await Promise.all(batch.map(async (ls) => {
            try {
              const filters = [
                ...allTimeFilters,
                { propertyName: "lifecyclestage", operator: "EQ", value: ls.stage },
              ];
              const res = await hubspotPost("/crm/v3/objects/contacts/search", token, {
                filterGroups: filters.length > 0 ? [{ filters }] : [],
                properties: [],
                limit: 1,
              });
              ls.count = res.total ?? 0;
            } catch (e) {
              console.error(`  lifecycle EQ ${ls.stage}:`, e);
            }
          }));
        }
        console.log(`Lifecycle EQ phase (all-time):`, lifecycleStagesAllTime.map(l => `${l.label}=${l.count}`).join(", "));
      } catch (e) {
        console.error("Lifecycle EQ phase error:", e);
      }

      // Phase B — paginated scan fallback if EQ returned unreliable results.
      const eqTotal = lifecycleStagesAllTime.reduce((s, l) => s + l.count, 0);
      const subscriberEq = lifecycleStagesAllTime.find(l => l.stage === "subscriber")?.count ?? 0;
      const lowerFunnelEq = eqTotal - subscriberEq;
      const needsPhaseB = eqTotal === 0 || (subscriberEq > 0 && lowerFunnelEq === 0);
      if (needsPhaseB) {
        console.log(`Lifecycle EQ unreliable (subscriber=${subscriberEq}, lower=${lowerFunnelEq}) — switching to paginated scan`);
        lifecycleStagesAllTime = LIFECYCLE_STAGE_DEF.map(d => ({ ...d }));
        const stageCounts: Record<string, number> = {};
        try {
          let scanAfter: string | undefined;
          let scanPage = 0;
          const MAX_SCAN_PAGES = 100;

          while (scanPage < MAX_SCAN_PAGES) {
            const searchBody: any = {
              filterGroups: allTimeFilters.length > 0 ? [{ filters: allTimeFilters }] : [],
              properties: ["lifecyclestage"],
              limit: 100,
            };
            if (scanAfter) searchBody.after = scanAfter;

            const res = await hubspotPost("/crm/v3/objects/contacts/search", token, searchBody);
            for (const c of (res.results || [])) {
              const sv = (c.properties?.lifecyclestage || "").toLowerCase().trim();
              if (sv) stageCounts[sv] = (stageCounts[sv] || 0) + 1;
            }

            if (res.paging?.next?.after) { scanAfter = res.paging.next.after; scanPage++; }
            else break;
          }

          const valueAliases: Record<string, string> = {
            subscriber: "subscriber",
            lead: "lead",
            marketingqualifiedlead: "marketingqualifiedlead",
            mql: "marketingqualifiedlead",
            "marketing qualified lead": "marketingqualifiedlead",
            "121857152": "marketingqualifiedlead",
            salesqualifiedlead: "salesqualifiedlead",
            sql: "salesqualifiedlead",
            "sales qualified lead": "salesqualifiedlead",
            opportunity: "opportunity",
            customer: "customer",
            evangelist: "customer",
            other: "lead",
          };

          for (const [rawStage, cnt] of Object.entries(stageCounts)) {
            const canonical = valueAliases[rawStage] ?? valueAliases[rawStage.replace(/\s+/g, "")];
            if (canonical) {
              const def = lifecycleStagesAllTime.find(l => l.stage === canonical);
              if (def) def.count += cnt;
            }
          }

          console.log(`Lifecycle scan (${scanPage + 1} pages):`, JSON.stringify(stageCounts));
          console.log(`Lifecycle mapped:`, lifecycleStagesAllTime.map(l => `${l.label}=${l.count}`).join(", "));
        } catch (e) {
          console.error("Lifecycle paginated scan error:", e);
        }
      }

      // State distribution already collected during contacts scan above
      {
        const knownCount = Object.values(stateCounts).reduce((a, b) => a + b, 0);
        console.log(`State scan: ${knownCount} known, ${unknownStateCount} unknown`);
        console.log("State counts:", JSON.stringify(stateCounts));
      }

      // NOTE: all-time job title fetch removed — too many API calls risk timeout.
      // Job titles are collected from the in-range contacts loop above (jobTitleCounts).
    }

    if (isSecondary) {
      const knownCount = Object.values(stateCounts).reduce((a, b) => a + b, 0);
      unknownStateCount = Math.max(0, totalContacts - knownCount);
    }

    // ── contactsOnly shortcut — skip email fetching entirely ──
    if (body.contactsOnly) {
      return new Response(JSON.stringify({
        totalContacts,
        dealerAssignedTotal,
        dealerUnassignedTotal,
        lifecycleStages: lifecycleStages.map(ls => ({ stage: ls.label, count: ls.count, key: ls.stage })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Fetch all emails from the appropriate account ──
    const allRawEmails = await fetchAllEmails(token);
    console.log(`Total emails before filter: ${allRawEmails.length}`);

    let brandFiltered: any[] = [];

    if (isSecondary) {
      // Secondary account: filter emails by included segment (contact list) names
      // First fetch all contact lists to build a listId → listName map
      const listIdToName = await fetchAllContactLists(token);

      brandFiltered = allRawEmails.filter((email) =>
        emailMatchesSecondaryBrand(email, brandName, listIdToName)
      );
      console.log(`Secondary brand filter by segment names: ${brandFiltered.length} emails matched for "${brandName}"`);
    } else {
      // Primary account: filter by businessUnitId
      for (const email of allRawEmails) {
        const emailBuId = String(email.businessUnitId ?? "0");
        if (buIds && buIds.includes(emailBuId)) {
          brandFiltered.push(email);
        }
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

    console.log(
      `Final stats: sent=${s.totalSent} delivered=${s.totalDelivered} opens=${s.totalOpens} clicks=${s.totalClicks}`,
    );

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
      totalContacts,
      totalContactsAllTime,
      healthScore,
      openRate,
      openRateLabel: getBenchmarkLabel("openRate", openRate),
      clickRate,
      clickRateLabel: getBenchmarkLabel("clickRate", clickRate),
      bounceRate,
      hardBounceRate,
      softBounceRate,
      bounceRateLabel: getBenchmarkLabel("bounceRate", bounceRate),
      unsubscribeRate,
      unsubscribeRateLabel: getBenchmarkLabel("unsubscribeRate", unsubscribeRate),
      spamReports: s.totalSpam,
      spamRate,
      totalEmailsSent: s.totalSent,
      totalEmails: current.emails.length,
      totalOpens: s.totalOpens,
      totalClicks: s.totalClicks,
      totalDelivered: s.totalDelivered,
      totalBounce: s.totalBounce,
      totalHardBounce: s.totalHardBounce,
      totalSoftBounce: s.totalSoftBounce,
      totalUnsub: s.totalUnsub,
      totalPending: s.totalPending,
      pendingRate,
      deliveredRate,
      // Return stage using label (e.g. "MQL") so frontend displays clean names,
      // but also include the internal key so the frontend order/mapping works.
      // lifecycleStages = in-period counts; lifecycleStagesAllTime = total snapshot.
      lifecycleStages: lifecycleStages.map(ls => ({ stage: ls.label, count: ls.count, key: ls.stage })),
      lifecycleStagesAllTime: lifecycleStagesAllTime.map(ls => ({ stage: ls.label, count: ls.count, key: ls.stage })),
      contactsOverTime: Object.entries(contactsByDate)
        .map(([date, counts]) => ({ date, total: counts.total, hubspot: counts.hubspot, salesforce: counts.salesforce, import: counts.import }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      jobTitles: [
        ...Object.entries(jobTitleCounts)
          .filter(([title]) => title !== "Not specified")
          .sort(([, a], [, b]) => b - a)
          .slice(0, 20)
          .map(([title, count]) => ({ title, count })),
        ...(jobTitleCounts["Not specified"]
          ? [{ title: "Not specified", count: jobTitleCounts["Not specified"] }]
          : []),
      ],
      contactIndustryDistribution: [
        ...Object.entries(industryCounts)
          .filter(([industry]) => industry !== "Not specified")
          .sort(([, a], [, b]) => b - a)
          .slice(0, 20)
          .map(([industry, count]) => ({ industry, count })),
        ...(industryCounts["Not specified"]
          ? [{ industry: "Not specified", count: industryCounts["Not specified"] }]
          : []),
      ],
      contactStateDistribution: Object.entries(stateCounts).sort(([,a],[,b]) => b-a).map(([state, count]) => ({ state, count })),
      contactUnknownStateCount: unknownStateCount,
      dealerWithDealStateDistribution: Object.entries(dealerWithDealStateCounts).sort(([,a],[,b]) => b-a).map(([state, count]) => ({ state, count })),
      dealerWithoutDealStateDistribution: Object.entries(dealerWithoutDealStateCounts).sort(([,a],[,b]) => b-a).map(([state, count]) => ({ state, count })),
      dealerAssignedTotal,
      dealerUnassignedTotal,
      emails: current.emails,
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
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
