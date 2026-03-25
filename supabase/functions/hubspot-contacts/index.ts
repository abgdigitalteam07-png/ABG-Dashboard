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

async function hubspotPost(path: string, token: string, body: unknown) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HubSpot API error (${path}): ${res.status} ${err.slice(0, 300)}`);
  }
  return res.json();
}

interface ContactsRequest {
  brandName: string;
  startDate: string;
  endDate: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("HUBSPOT_ACCESS_TOKEN");
    if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN not configured");

    const { brandName, startDate, endDate }: ContactsRequest = await req.json();
    if (!brandName || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buId = BRAND_TO_BU[brandName];
    const startMs = new Date(startDate + "T00:00:00Z").getTime();
    const endMs = new Date(endDate + "T23:59:59Z").getTime();

    console.log(`Fetching contacts for brand="${brandName}" buId="${buId}" from ${startDate} to ${endDate}`);

    // ── 1. New contacts over time ──
    const contactsByDate: Record<string, { total: number; hubspot: number; salesforce: number }> = {};
    const jobTitleCounts: Record<string, number> = {};

    let after: string | undefined;
    let totalFetched = 0;
    const maxPages = 30;

    for (let page = 0; page < maxPages; page++) {
      const filters: any[] = [
        { propertyName: "createdate", operator: "GTE", value: String(startMs) },
        { propertyName: "createdate", operator: "LTE", value: String(endMs) },
      ];
      if (buId && buId !== "0") {
        filters.push({
          propertyName: "hs_all_assigned_business_unit_ids",
          operator: "CONTAINS_TOKEN",
          value: buId,
        });
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
        ],
        sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
        limit: 100,
      };
      if (after) searchBody.after = after;

      const res = await hubspotPost("/crm/v3/objects/contacts/search", token, searchBody);
      const results = res.results || [];
      totalFetched += results.length;

      for (const contact of results) {
        const props = contact.properties || {};

        // Date bucket
        const createDate = props.createdate;
        if (!createDate) continue;
        const dateKey = new Date(createDate).toISOString().split("T")[0];

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

        // Log first few for debugging
        if (totalFetched <= 5) {
          console.log(`[debug] Contact source: objSource=${objSource} detail=${objSourceDetail} analytics=${analyticsSource} analyticsData=${analyticsSourceData} jobtitle=${title}`);
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

    const result = {
      totalContacts: totalFetched,
      contactsOverTime,
      jobTitles,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("HubSpot contacts error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
