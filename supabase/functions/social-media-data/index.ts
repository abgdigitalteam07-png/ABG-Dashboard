const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRAND_PAGE_MAP: Record<string, { pageId: string }> = {
  "Laurel Mountain":             { pageId: "589637594226360" },
  "ABG Home Services":           { pageId: "102649446177548" },
  "Accessible Home Store":       { pageId: "614467925083933" },
  "Arizona Shower Door":         { pageId: "140920859267060" },
  "Bootz":                       { pageId: "579915778528160" },
  "Coastal Shower Doors":        { pageId: "209917263175" },
  "DreamLine":                   { pageId: "148773895177490" },
  "MAAX":                        { pageId: "738880779504819" },
  "MAAX Spas":                   { pageId: "111390385863" },
  "Maidstone":                   { pageId: "710637472132857" },
  "Swan":                        { pageId: "105567228779919" },
  "Mr.Steam":                    { pageId: "154735202065" },
  "Vintage Tub":                 { pageId: "101492269890379" },
  "Vintage Tub & Bath - Canada": { pageId: "485101404695965" },
  "Aquatic":                     { pageId: "107777259287955" },
  "Aker":                        { pageId: "102492475661275" },
  "Neptune":                     { pageId: "1380819638634871" },
  "Vita Spa":                    { pageId: "987074424690372" },
  "IMI":                         { pageId: "100677961392355" },
  "American Whirlpool":          { pageId: "1725052967554098" },
  "Eljer Bathing":               { pageId: "729482993575925" },
  "American Standard Bathing":   { pageId: "676039122268199" },
  "Maidstone Supply":            { pageId: "287993324615394" },
  "ABG Decorative Products":     { pageId: "104595485455883" },
};

const GRAPH = "https://graph.facebook.com/v25.0";

// Cache of pageId -> page access token from /me/accounts
let cachedPageTokens: Record<string, string> | null = null;

async function fetchAllPageTokens(userToken: string): Promise<Record<string, string>> {
  if (cachedPageTokens) return cachedPageTokens;

  const tokens: Record<string, string> = {};
  let url: string | null = `${GRAPH}/me/accounts?fields=id,access_token&limit=100&access_token=${userToken}`;

  while (url) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.error(`[fetchAllPageTokens] Error: ${data.error.message}`);
      break;
    }
    for (const page of (data.data || [])) {
      tokens[page.id] = page.access_token;
    }
    url = data.paging?.next || null;
  }

  console.log(`[fetchAllPageTokens] Found tokens for ${Object.keys(tokens).length} pages: ${Object.keys(tokens).join(", ")}`);
  cachedPageTokens = tokens;
  return tokens;
}

async function getPageToken(pageId: string, userToken: string): Promise<string> {
  const allTokens = await fetchAllPageTokens(userToken);
  const token = allTokens[pageId];
  if (token) {
    console.log(`[getPageToken] Found page token for ${pageId} via /me/accounts`);
    return token;
  }
  console.warn(`[getPageToken] No token found for page ${pageId} in /me/accounts — falling back to user token`);
  return userToken;
}

// Dynamically fetch IG Business Account ID linked to a Facebook Page
async function getIgBusinessAccountId(pageId: string, pageToken: string): Promise<string | null> {
  const url = `${GRAPH}/${pageId}?fields=instagram_business_account&access_token=${pageToken}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.warn(`[getIgBusinessAccountId] Error for page ${pageId}: ${data.error.message}`);
      return null;
    }
    const igId = data.instagram_business_account?.id || null;
    console.log(`[getIgBusinessAccountId] Page ${pageId} -> IG: ${igId || "none"}`);
    return igId;
  } catch (e) {
    console.warn(`[getIgBusinessAccountId] Fetch error: ${e.message}`);
    return null;
  }
}

async function getPageInsights(pageId: string, pageToken: string, since: string, until: string): Promise<Record<string, number>> {
  // Try multiple metric sets - v25.0 has deprecated many old metrics
  const metricSets = [
    "page_views_total",
    "page_post_engagements",
    "page_fan_adds",
  ];
  
  const result: Record<string, number> = {};
  
  for (const metric of metricSets) {
    const url = `${GRAPH}/${pageId}/insights?metric=${metric}&since=${since}&until=${until}&period=day&access_token=${pageToken}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        console.warn(`[getPageInsights] Metric "${metric}" failed: ${data.error.message}`);
        continue;
      }
      for (const item of (data.data || [])) {
        let total = 0;
        for (const v of (item.values || [])) {
          total += typeof v.value === "number" ? v.value : 0;
        }
        result[item.name] = total;
      }
    } catch (e) {
      console.warn(`[getPageInsights] Fetch error for "${metric}": ${e.message}`);
    }
  }
  
  console.log(`[getPageInsights] Final result:`, JSON.stringify(result));
  return result;
}

async function getPageFanCount(pageId: string, pageToken: string): Promise<number> {
  const res = await fetch(`${GRAPH}/${pageId}?fields=fan_count&access_token=${pageToken}`);
  const data = await res.json();
  return data.fan_count || 0;
}

async function getPagePosts(pageId: string, pageToken: string, since: string, until: string) {
  // Don't request insights subfield inline — it can fail on v25.0
  const fields = "id,message,created_time,shares,attachments";
  const url = `${GRAPH}/${pageId}/posts?fields=${fields}&since=${since}&until=${until}&limit=50&access_token=${pageToken}`;
  console.log(`[getPagePosts] Fetching posts for page ${pageId}`);
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    console.warn(`[getPagePosts] Error: ${data.error.message}`);
    return [];
  }
  console.log(`[getPagePosts] Got ${(data.data || []).length} posts`);
  return data.data || [];
}

async function getIgInsights(igId: string, pageToken: string, since: string, until: string) {
  const metrics = "reach,impressions,profile_views,website_clicks";
  const url = `${GRAPH}/${igId}/insights?metric=${metrics}&since=${since}&until=${until}&period=total_over_range&access_token=${pageToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    console.warn(`[getIgInsights] Error: ${data.error.message}`);
    // Try day period fallback
    const dayUrl = `${GRAPH}/${igId}/insights?metric=${metrics}&since=${since}&until=${until}&period=day&access_token=${pageToken}`;
    const dayRes = await fetch(dayUrl);
    const dayData = await dayRes.json();
    if (dayData.error) {
      console.warn(`[getIgInsights] Day fallback also failed: ${dayData.error.message}`);
      return {};
    }
    const result: Record<string, number> = {};
    for (const item of (dayData.data || [])) {
      let total = 0;
      for (const v of (item.values || [])) total += typeof v.value === "number" ? v.value : 0;
      result[item.name] = total;
    }
    console.log(`[getIgInsights] Day fallback result:`, JSON.stringify(result));
    return result;
  }
  const result: Record<string, number> = {};
  for (const item of (data.data || [])) {
    const val = item.values?.[0]?.value;
    result[item.name] = typeof val === "number" ? val : 0;
  }
  console.log(`[getIgInsights] Result:`, JSON.stringify(result));
  return result;
}

async function getIgFollowers(igId: string, pageToken: string): Promise<number> {
  const res = await fetch(`${GRAPH}/${igId}?fields=followers_count&access_token=${pageToken}`);
  const data = await res.json();
  return data.followers_count || 0;
}

async function getIgMedia(igId: string, pageToken: string, since: string, until: string) {
  const fields = "id,caption,media_type,timestamp,like_count,comments_count,reach,impressions,saved,video_views";
  const url = `${GRAPH}/${igId}/media?fields=${fields}&since=${since}&until=${until}&limit=50&access_token=${pageToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) return [];
  return data.data || [];
}

function safeDiv(a: number, b: number): number {
  return b > 0 ? parseFloat((a / b * 100).toFixed(2)) : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { brandName, startDate, endDate, platform = "all" } = await req.json();
    console.log(`[social-media-data] brand=${brandName} range=${startDate}..${endDate} platform=${platform}`);

    if (!brandName || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const brandConfig = BRAND_PAGE_MAP[brandName];
    if (!brandConfig) {
      return new Response(JSON.stringify({ error: "no_social_media", message: `No social media data for ${brandName}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userToken = Deno.env.get("META_USER_ACCESS_TOKEN");
    if (!userToken) throw new Error("META_USER_ACCESS_TOKEN not configured");

    const { pageId } = brandConfig;
    const pageToken = await getPageToken(pageId, userToken);

    // Dynamically discover the IG Business Account linked to this page
    const igId = await getIgBusinessAccountId(pageId, pageToken);

    const [fbInsights, fbFans, fbPosts] = await Promise.all([
      getPageInsights(pageId, pageToken, startDate, endDate),
      getPageFanCount(pageId, pageToken),
      getPagePosts(pageId, pageToken, startDate, endDate),
    ]);

    // Map to new v25.0 metric names
    const fbEngagements = fbInsights["page_post_engagements"] || fbInsights["page_engaged_users"] || 0;
    const fbProfileVisits = fbInsights["page_views_total"] || 0;
    const fbConsumptions = fbInsights["page_consumptions"] || 0;
    const fbReach = fbProfileVisits + fbEngagements;
    const fbImpressions = fbReach + fbConsumptions;
    const fbWebsiteClicks = fbConsumptions;

    let igFollowers = 0, igReach = 0, igImpressions = 0, igEngagements = 0, igProfileViews = 0, igWebsiteClicks = 0;
    let igPostsList: any[] = [];

    if (igId) {
      const [igInsights, igFollowerCount, igMedia] = await Promise.all([
        getIgInsights(igId, pageToken, startDate, endDate),
        getIgFollowers(igId, pageToken),
        getIgMedia(igId, pageToken, startDate, endDate),
      ]);

      igFollowers = igFollowerCount;
      igReach = igInsights["reach"] || 0;
      igImpressions = igInsights["impressions"] || 0;
      igProfileViews = igInsights["profile_views"] || 0;
      igEngagements = igProfileViews;
      igWebsiteClicks = igInsights["website_clicks"] || 0;

      igPostsList = igMedia.map((m: any) => {
        const likes = m.like_count || 0;
        const comments = m.comments_count || 0;
        const saves = m.saved || 0;
        const reach = m.reach || 0;
        const impressions = m.impressions || 0;
        const engRate = safeDiv(likes + comments + saves, reach);
        const type = m.media_type === "VIDEO" ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carousel" : "image";

        return {
          id: m.id,
          platform: "instagram",
          type,
          caption: m.caption || "",
          publishedAt: m.timestamp,
          reach,
          impressions,
          likes,
          comments,
          shares: 0,
          saves,
          engagementRate: engRate,
          clicks: 0,
        };
      });
    }

    const fbPostsFormatted = fbPosts.map((p: any) => {
      const shares = p.shares?.count || 0;
      const attType = p.attachments?.data?.[0]?.type || "";
      const type = attType.includes("video") ? "reel" : attType.includes("album") ? "carousel" : "image";

      return {
        id: p.id,
        platform: "facebook",
        type,
        caption: p.message || "",
        publishedAt: p.created_time,
        reach: 0,
        impressions: 0,
        likes: 0,
        comments: 0,
        shares,
        saves: 0,
        engagementRate: 0,
        clicks: 0,
      };
    });

    const allPosts = [
      ...(platform === "instagram" ? [] : fbPostsFormatted),
      ...(platform === "facebook" ? [] : igPostsList),
    ].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    const totalReach = platform === "facebook" ? fbReach : platform === "instagram" ? igReach : fbReach + igReach;
    const totalImpressions = platform === "facebook" ? fbImpressions : platform === "instagram" ? igImpressions : fbImpressions + igImpressions;
    const totalEngagements = fbEngagements + igEngagements;
    const totalProfileVisits = fbProfileVisits + igProfileViews;
    const totalWebsiteClicks = fbWebsiteClicks + igWebsiteClicks;
    const engagementRate = safeDiv(totalEngagements, totalReach);

    const typeMap: Record<string, { count: number; totalEng: number }> = {};
    for (const p of allPosts) {
      const label = p.type === "reel" ? "Reel/Video" : p.type.charAt(0).toUpperCase() + p.type.slice(1);
      if (!typeMap[label]) typeMap[label] = { count: 0, totalEng: 0 };
      typeMap[label].count++;
      typeMap[label].totalEng += p.engagementRate;
    }
    const byType = Object.entries(typeMap).map(([type, v]) => ({
      type,
      count: v.count,
      avgEngagement: parseFloat((v.totalEng / v.count).toFixed(1)),
    }));

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayMap: Record<string, { posts: number; totalEng: number }> = {};
    for (const d of dayNames) dayMap[d] = { posts: 0, totalEng: 0 };
    for (const p of allPosts) {
      const day = dayNames[new Date(p.publishedAt).getDay()];
      dayMap[day].posts++;
      dayMap[day].totalEng += p.engagementRate;
    }
    const byDayOfWeek = dayNames.map((day) => ({
      day,
      posts: dayMap[day].posts,
      avgEngagement: dayMap[day].posts > 0 ? parseFloat((dayMap[day].totalEng / dayMap[day].posts).toFixed(1)) : 0,
    }));

    const dailyMap: Record<string, { reach: number; eng: number; count: number }> = {};
    for (const p of allPosts) {
      const d = p.publishedAt.split("T")[0];
      if (!dailyMap[d]) dailyMap[d] = { reach: 0, eng: 0, count: 0 };
      dailyMap[d].reach += p.reach;
      dailyMap[d].eng += p.engagementRate;
      dailyMap[d].count++;
    }
    const dailyTrends = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        reach: v.reach,
        engagementRate: parseFloat((v.eng / v.count).toFixed(1)),
      }));

    const topPostType = (arr: any[]) => {
      if (!arr.length) return "image";
      const counts: Record<string, number> = {};
      for (const p of arr) { counts[p.type] = (counts[p.type] || 0) + 1; }
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    };

    return new Response(JSON.stringify({
      overview: {
        totalFollowers: { facebook: fbFans, instagram: igFollowers },
        followerGrowth: { facebook: 0, instagram: 0 },
        totalPosts: allPosts.length,
        totalReach: Math.round(totalReach),
        totalImpressions: Math.round(totalImpressions),
        totalEngagements: Math.round(totalEngagements),
        engagementRate,
        profileVisits: Math.round(totalProfileVisits),
        websiteClicks: Math.round(totalWebsiteClicks),
      },
      posts: allPosts,
      platformBreakdown: {
        facebook: {
          reach: Math.round(fbReach),
          impressions: Math.round(fbImpressions),
          engagements: Math.round(fbEngagements),
          engagementRate: safeDiv(fbEngagements, fbReach),
          topPostType: topPostType(fbPostsFormatted),
        },
        instagram: {
          reach: Math.round(igReach),
          impressions: Math.round(igImpressions),
          engagements: Math.round(igEngagements),
          engagementRate: safeDiv(igEngagements, igReach),
          topPostType: topPostType(igPostsList),
        },
      },
      contentPerformance: { byType, byDayOfWeek },
      dailyTrends,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[social-media-data] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
