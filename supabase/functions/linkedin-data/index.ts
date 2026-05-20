const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// LinkedIn organization IDs mapping for each brand
// These will be populated once LinkedIn API is fully set up
const BRAND_LINKEDIN_MAP: Record<string, { organizationId: string; pageUrl?: string }> = {
  "MAAX BATH": { organizationId: "2000000", pageUrl: "https://www.linkedin.com/company/maax-bath/" },
  "MAAX": { organizationId: "2000000", pageUrl: "https://www.linkedin.com/company/maax-inc/" },
  "DreamLine": { organizationId: "2000001", pageUrl: "https://www.linkedin.com/company/dreamline/" },
  "Coastal Shower Doors": { organizationId: "2000002", pageUrl: "https://www.linkedin.com/company/coastal-shower-doors/" },
  "Neptune": { organizationId: "2000003", pageUrl: "https://www.linkedin.com/company/neptune-bath/" },
  "Swan": { organizationId: "2000004", pageUrl: "https://www.linkedin.com/company/swan-stone/" },
  "IMI": { organizationId: "2000005", pageUrl: "https://www.linkedin.com/company/imi-shower/" },
  "Mr.Steam": { organizationId: "2000006", pageUrl: "https://www.linkedin.com/company/mr-steam/" },
  "ABG Decorative Products": { organizationId: "2000007", pageUrl: "https://www.linkedin.com/company/abg-decorative/" },
  "American Standard Bathing": { organizationId: "2000008", pageUrl: "https://www.linkedin.com/company/american-standard-bathing/" },
  "Maidstone": { organizationId: "2000009", pageUrl: "https://www.linkedin.com/company/maidstone-supply/" },
  "Laurel Mountain": { organizationId: "2000010", pageUrl: "https://www.linkedin.com/company/laurel-mountain-bath/" },
  "Bootz": { organizationId: "2000011", pageUrl: "https://www.linkedin.com/company/bootz-industries/" },
  "Vintage Tub": { organizationId: "2000012", pageUrl: "https://www.linkedin.com/company/vintage-tub/" },
};

// Demo data for LinkedIn (used while awaiting API approval)
const LINKEDIN_DEMO_DATA: Record<string, any> = {
  "MAAX BATH": { followers: 4821, impressions: 18400, reach: 12300, engagements: 892, engagementRate: 4.8, posts: 14 },
  "MAAX": { followers: 4821, impressions: 18400, reach: 12300, engagements: 892, engagementRate: 4.8, posts: 14 },
  "DreamLine": { followers: 11200, impressions: 34700, reach: 22100, engagements: 1840, engagementRate: 5.3, posts: 22 },
  "Coastal Shower Doors": { followers: 1340, impressions: 5200, reach: 3100, engagements: 210, engagementRate: 3.2, posts: 8 },
  "Neptune": { followers: 2870, impressions: 9800, reach: 6400, engagements: 430, engagementRate: 4.1, posts: 11 },
  "Swan": { followers: 3210, impressions: 11200, reach: 7800, engagements: 560, engagementRate: 4.5, posts: 13 },
  "IMI": { followers: 890, impressions: 3100, reach: 1900, engagements: 120, engagementRate: 2.8, posts: 5 },
  "Mr.Steam": { followers: 6540, impressions: 22100, reach: 14800, engagements: 1120, engagementRate: 5.1, posts: 18 },
  "ABG Decorative Products": { followers: 1120, impressions: 4300, reach: 2700, engagements: 180, engagementRate: 3.6, posts: 7 },
  "American Standard Bathing": { followers: 8930, impressions: 29400, reach: 19200, engagements: 1560, engagementRate: 5.8, posts: 24 },
  "Maidstone": { followers: 670, impressions: 2100, reach: 1300, engagements: 88, engagementRate: 2.4, posts: 4 },
  "Laurel Mountain": { followers: 520, impressions: 1800, reach: 1100, engagements: 65, engagementRate: 2.1, posts: 3 },
  "Bootz": { followers: 740, impressions: 2600, reach: 1600, engagements: 95, engagementRate: 2.7, posts: 5 },
  "Vintage Tub": { followers: 1850, impressions: 6200, reach: 3900, engagements: 280, engagementRate: 3.9, posts: 9 },
};

async function fetchLinkedInAnalytics(brandName: string, startDate: string, endDate: string) {
  const linkedinConfig = BRAND_LINKEDIN_MAP[brandName];
  if (!linkedinConfig) {
    return { error: "Brand not configured for LinkedIn" };
  }

  const linkedinClientId = Deno.env.get("LINKEDIN_CLIENT_ID");
  const linkedinAccessToken = Deno.env.get("LINKEDIN_ACCESS_TOKEN");

  // If no real credentials, return demo data (for testing before API approval)
  if (!linkedinClientId || !linkedinAccessToken) {
    console.log(`[linkedin-data] No credentials available for ${brandName}, returning demo data`);
    const demo = LINKEDIN_DEMO_DATA[brandName];
    if (!demo) {
      return { error: "no_linkedin_data" };
    }
    return {
      platform: "linkedin",
      followers: demo.followers,
      impressions: demo.impressions,
      reach: demo.reach,
      engagements: demo.engagements,
      engagementRate: demo.engagementRate,
      posts: demo.posts,
      pageUrl: linkedinConfig.pageUrl,
      isDemo: true,
    };
  }

  try {
    // Real LinkedIn Community Management API call
    const organizationId = linkedinConfig.organizationId;
    const apiUrl = `https://api.linkedin.com/v2/organizationalEntityAcgStatistics?q=organizationalEntity&organizationalEntity=urn%3Ali%3Aorganization%3A${organizationId}&dateRange.start=${startDate.replace(/-/g, "")}&dateRange.end=${endDate.replace(/-/g, "")}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${linkedinAccessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.warn(`[linkedin-data] LinkedIn API error: ${response.status}`);
      // Fallback to demo data if API fails
      const demo = LINKEDIN_DEMO_DATA[brandName];
      return {
        platform: "linkedin",
        followers: demo?.followers || 0,
        impressions: demo?.impressions || 0,
        reach: demo?.reach || 0,
        engagements: demo?.engagements || 0,
        engagementRate: demo?.engagementRate || 0,
        posts: demo?.posts || 0,
        pageUrl: linkedinConfig.pageUrl,
        isDemo: true,
        error: `API returned ${response.status}`,
      };
    }

    const data = await response.json();
    console.log(`[linkedin-data] Fetched data for ${brandName}:`, JSON.stringify(data));

    // Parse LinkedIn API response (adjust based on actual API structure)
    const stats = data.elements?.[0] || {};
    return {
      platform: "linkedin",
      followers: stats.followerCounts?.[0]?.followerCount || 0,
      impressions: stats.impressionMetrics?.[0]?.impressions || 0,
      reach: stats.uniqueImpressionsCount?.[0]?.uniqueImpressions || 0,
      engagements: stats.engagements?.[0]?.engagementCount || 0,
      engagementRate: parseFloat(((stats.engagements?.[0]?.engagementCount || 0) / Math.max(stats.impressionMetrics?.[0]?.impressions || 1, 1) * 100).toFixed(2)),
      posts: stats.postMetrics?.length || 0,
      pageUrl: linkedinConfig.pageUrl,
      isDemo: false,
    };
  } catch (error) {
    console.error(`[linkedin-data] Error fetching LinkedIn data: ${(error as Error).message}`);
    // Return demo data on error
    const demo = LINKEDIN_DEMO_DATA[brandName];
    return {
      platform: "linkedin",
      followers: demo?.followers || 0,
      impressions: demo?.impressions || 0,
      reach: demo?.reach || 0,
      engagements: demo?.engagements || 0,
      engagementRate: demo?.engagementRate || 0,
      posts: demo?.posts || 0,
      pageUrl: linkedinConfig.pageUrl,
      isDemo: true,
      error: (error as Error).message,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { brandName, startDate, endDate } = await req.json();

    if (!brandName) {
      return new Response(JSON.stringify({ error: "brandName required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await fetchLinkedInAnalytics(
      brandName,
      startDate || new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      endDate || new Date().toISOString().split("T")[0]
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[linkedin-data] Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
