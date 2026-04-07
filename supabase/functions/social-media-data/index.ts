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
  const fields = "id,message,created_time,shares,likes.summary(true),comments.summary(true),attachments{type,media_type,media,subattachments}";
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

// Fetch per-post insights for a single FB post (v25.0 — uses post_views metrics)
async function getFbPostInsights(postId: string, pageToken: string): Promise<{ impressions: number; reach: number; engagedUsers: number; clicks: number }> {
  const result = { impressions: 0, reach: 0, engagedUsers: 0, clicks: 0 };
  const metricSets = [
    "post_views,post_views_unique,post_engaged_users,post_clicks",
    "post_impressions,post_impressions_unique,post_engaged_users,post_clicks",
  ];
  for (const metrics of metricSets) {
    try {
      const url = `${GRAPH}/${postId}/insights?metric=${metrics}&access_token=${pageToken}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        console.warn(`[getFbPostInsights] ${postId} metrics "${metrics}": ${data.error.message}`);
        continue;
      }
      for (const item of (data.data || [])) {
        const val = item.values?.[0]?.value || 0;
        if (item.name === "post_views" || item.name === "post_impressions") result.impressions = val;
        if (item.name === "post_views_unique" || item.name === "post_impressions_unique") result.reach = val;
        if (item.name === "post_engaged_users") result.engagedUsers = val;
        if (item.name === "post_clicks") result.clicks = val;
      }
      if (result.impressions > 0 || result.reach > 0) break;
    } catch (e) {
      console.warn(`[getFbPostInsights] fetch error for ${postId}: ${e.message}`);
    }
  }
  return result;
}

// Fetch per-post insights for a single IG media object (v25.0 — no impressions, use views)
async function getIgMediaInsights(mediaId: string, mediaType: string, pageToken: string): Promise<{ reach: number; impressions: number; saved: number; shares: number }> {
  const result = { reach: 0, impressions: 0, saved: 0, shares: 0 };
  const isReel = mediaType === "VIDEO";
  const metrics = isReel ? "reach,saved,shares,plays" : "reach,saved,shares";
  try {
    const url = `${GRAPH}/${mediaId}/insights?metric=${metrics}&access_token=${pageToken}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.warn(`[getIgMediaInsights] ${mediaId}: ${data.error.message}`);
      return result;
    }
    for (const item of (data.data || [])) {
      const val = typeof item.values?.[0]?.value === "number" ? item.values[0].value : 0;
      if (item.name === "reach") result.reach = val;
      if (item.name === "plays") result.impressions = val;
      if (item.name === "saved") result.saved = val;
      if (item.name === "shares") result.shares = val;
    }
    if (result.impressions === 0) result.impressions = result.reach;
  } catch (e) {
    console.warn(`[getIgMediaInsights] fetch error for ${mediaId}: ${e.message}`);
  }
  return result;
}

// Generate 30-day chunks for IG insights (max 30 days per request)
function getDateChunks(since: string, until: string): Array<{ since: string; until: string }> {
  const chunks: Array<{ since: string; until: string }> = [];
  const start = new Date(since);
  const end = new Date(until);
  let current = new Date(start);
  while (current < end) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + 28); // 28 days to stay under 30-day limit
    const actualEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({
      since: current.toISOString().split("T")[0],
      until: actualEnd.toISOString().split("T")[0],
    });
    current = actualEnd;
  }
  return chunks;
}

async function getIgInsights(igId: string, pageToken: string, since: string, until: string) {
  const result: Record<string, number> = {};
  const chunks = getDateChunks(since, until);
  console.log(`[getIgInsights] Fetching ${chunks.length} chunks for IG ${igId}`);

  for (const chunk of chunks) {
    // Fetch reach (period=day)
    try {
      const reachUrl = `${GRAPH}/${igId}/insights?metric=reach&since=${chunk.since}&until=${chunk.until}&period=day&access_token=${pageToken}`;
      const reachRes = await fetch(reachUrl);
      const reachData = await reachRes.json();
      if (!reachData.error) {
        for (const item of (reachData.data || [])) {
          for (const v of (item.values || [])) {
            result[item.name] = (result[item.name] || 0) + (typeof v.value === "number" ? v.value : 0);
          }
        }
      } else {
        console.warn(`[getIgInsights] reach chunk failed: ${reachData.error.message}`);
      }
    } catch (e) { console.warn(`[getIgInsights] reach fetch error: ${e.message}`); }

    // Fetch total_value metrics
    try {
      const totalMetrics = "profile_views,website_clicks,total_interactions";
      const totalUrl = `${GRAPH}/${igId}/insights?metric=${totalMetrics}&metric_type=total_value&since=${chunk.since}&until=${chunk.until}&period=day&access_token=${pageToken}`;
      const totalRes = await fetch(totalUrl);
      const totalData = await totalRes.json();
      if (!totalData.error) {
        for (const item of (totalData.data || [])) {
          for (const v of (item.values || [])) {
            result[item.name] = (result[item.name] || 0) + (typeof v.value === "number" ? v.value : 0);
          }
        }
      } else {
        console.warn(`[getIgInsights] total_value chunk failed: ${totalData.error.message}`);
      }
    } catch (e) { console.warn(`[getIgInsights] total_value fetch error: ${e.message}`); }
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
  const fields = "id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,media_url";
  const url = `${GRAPH}/${igId}/media?fields=${fields}&since=${since}&until=${until}&limit=50&access_token=${pageToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) { console.warn(`[getIgMedia] Error: ${data.error.message}`); return []; }
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
      igImpressions = igReach; // impressions deprecated, use reach
      igProfileViews = igInsights["profile_views"] || 0;
      igEngagements = igInsights["total_interactions"] || igProfileViews;
      igWebsiteClicks = igInsights["website_clicks"] || 0;

      // Fetch per-post insights for IG media in parallel (batch of 5)
      const igMediaWithInsights: any[] = [];
      for (let i = 0; i < igMedia.length; i += 5) {
        const batch = igMedia.slice(i, i + 5);
        const insights = await Promise.all(batch.map((m: any) => getIgMediaInsights(m.id, m.media_type || "", pageToken)));
        for (let j = 0; j < batch.length; j++) {
          const m = batch[j];
          const ins = insights[j];
          const likes = m.like_count || 0;
          const comments = m.comments_count || 0;
          const saves = ins.saved || 0;
          const shares = ins.shares || 0;
          const reach = ins.reach || 0;
          const impressions = ins.impressions || 0;
          const engRate = safeDiv(likes + comments + saves, reach);
          const type = m.media_type === "VIDEO" ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carousel" : "image";
          igMediaWithInsights.push({
            id: m.id,
            platform: "instagram",
            type,
            caption: m.caption || "",
            publishedAt: m.timestamp,
            thumbnail: m.thumbnail_url || m.media_url || "",
            reach,
            impressions,
            likes,
            comments,
            shares,
            saves,
            engagementRate: engRate,
            clicks: 0,
          });
        }
      }
      igPostsList = igMediaWithInsights;
    }

    // Fetch per-post insights for FB posts in parallel (batch of 5)
    const fbPostsFormatted: any[] = [];
    for (let i = 0; i < fbPosts.length; i += 5) {
      const batch = fbPosts.slice(i, i + 5);
      const insights = await Promise.all(batch.map((p: any) => getFbPostInsights(p.id, pageToken)));
      for (let j = 0; j < batch.length; j++) {
        const p = batch[j];
        const ins = insights[j];
        const likes = p.likes?.summary?.total_count || 0;
        const comments = p.comments?.summary?.total_count || 0;
        const shares = p.shares?.count || 0;
        const att = p.attachments?.data?.[0];
        const attType = att?.type || att?.media_type || "";
        const type = attType.toLowerCase().includes("video") ? "reel" : attType.toLowerCase().includes("album") ? "carousel" : "image";
        const thumbnail = att?.media?.image?.src || "";
        const reach = ins.reach;
        const impressions = ins.impressions;
        const engRate = safeDiv(likes + comments + shares, reach);

        fbPostsFormatted.push({
          id: p.id,
          platform: "facebook",
          type,
          caption: p.message || "",
          publishedAt: p.created_time,
          thumbnail,
          reach,
          impressions,
          likes,
          comments,
          shares,
          saves: 0,
          engagementRate: engRate,
          clicks: ins.clicks,
        });
      }
    }

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
