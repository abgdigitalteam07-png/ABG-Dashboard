const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRAND_PAGE_MAP: Record<string, { pageId: string }> = {
  "Laurel Mountain":             { pageId: "589637594226360" },
  "ABG Home Services":           { pageId: "102649446177548" },
  "Accessible Home Store":       { pageId: "614467925083933" },
  "American Bath Group":         { pageId: "617291181470878" },
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

let cachedPageTokens: Record<string, string> | null = null;

async function fetchAllPageTokens(userToken: string): Promise<Record<string, string>> {
  if (cachedPageTokens) return cachedPageTokens;
  const tokens: Record<string, string> = {};
  let url: string | null = `${GRAPH}/me/accounts?fields=id,access_token&limit=100&access_token=${userToken}`;
  while (url) {
    const res: Response = await fetch(url);
    const data: any = await res.json();
    if (data.error) { console.error(`[fetchAllPageTokens] Error: ${data.error.message}`); break; }
    for (const page of (data.data || [])) tokens[page.id] = page.access_token;
    url = data.paging?.next || null;
  }
  console.log(`[fetchAllPageTokens] Found tokens for ${Object.keys(tokens).length} pages`);
  cachedPageTokens = tokens;
  return tokens;
}

async function getPageToken(pageId: string, userToken: string): Promise<string> {
  const allTokens = await fetchAllPageTokens(userToken);
  const token = allTokens[pageId];
  if (token) { console.log(`[getPageToken] Found page token for ${pageId}`); return token; }
  console.warn(`[getPageToken] No token for ${pageId} — using user token`);
  return userToken;
}

async function getIgBusinessAccountId(pageId: string, pageToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH}/${pageId}?fields=instagram_business_account&access_token=${pageToken}`);
    const data = await res.json();
    console.log(`[getIgBusinessAccountId] Raw for ${pageId}:`, JSON.stringify(data));
    if (data.error) return null;
    return data.instagram_business_account?.id || null;
  } catch (e: unknown) { console.warn(`[getIgBusinessAccountId] Error: ${(e as Error).message}`); return null; }
}

function getDateChunks(since: string, until: string, maxDays = 89): Array<{ since: string; until: string }> {
  const chunks: Array<{ since: string; until: string }> = [];
  const start = new Date(since);
  const end = new Date(until);
  let current = new Date(start);
  while (current < end) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays);
    const actualEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({ since: current.toISOString().split("T")[0], until: actualEnd.toISOString().split("T")[0] });
    current = new Date(actualEnd);
    current.setDate(current.getDate() + 1);
  }
  return chunks;
}

async function getDailyMetric(
  pageId: string, pageToken: string, metric: string, since: string, until: string
): Promise<Array<{ date: string; value: number }>> {
  const result: Array<{ date: string; value: number }> = [];
  const chunks = getDateChunks(since, until, 89);
  for (const chunk of chunks) {
    try {
      const url = `${GRAPH}/${pageId}/insights?metric=${metric}&since=${chunk.since}&until=${chunk.until}&period=day&access_token=${pageToken}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) continue;
      for (const item of (data.data || [])) {
        for (const v of (item.values || [])) {
          if (v.end_time && typeof v.value === "number") {
            result.push({ date: v.end_time.split("T")[0], value: v.value });
          }
        }
      }
    } catch { /* skip */ }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

async function getPageInsights(pageId: string, pageToken: string, since: string, until: string): Promise<Record<string, number>> {
  const metrics = ["page_impressions_unique", "page_views_total", "page_post_engagements"];
  const result: Record<string, number> = {};
  const chunks = getDateChunks(since, until, 89);

  for (const chunk of chunks) {
    for (const metric of metrics) {
      try {
        const url = `${GRAPH}/${pageId}/insights?metric=${metric}&since=${chunk.since}&until=${chunk.until}&period=day&access_token=${pageToken}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) { console.warn(`[getPageInsights] ${metric} ${chunk.since}..${chunk.until}: ${data.error.message}`); continue; }
        for (const item of (data.data || [])) {
          let total = 0;
          for (const v of (item.values || [])) total += typeof v.value === "number" ? v.value : 0;
          result[item.name] = (result[item.name] || 0) + total;
        }
      } catch (e: unknown) { console.warn(`[getPageInsights] fetch error ${metric}: ${(e as Error).message}`); }
    }
  }
  console.log(`[getPageInsights] Final:`, JSON.stringify(result));
  return result;
}

async function getPageFanCount(pageId: string, pageToken: string): Promise<number> {
  const res = await fetch(`${GRAPH}/${pageId}?fields=fan_count&access_token=${pageToken}`);
  const data = await res.json();
  return data.fan_count || 0;
}

async function getPagePosts(pageId: string, pageToken: string, since: string, until: string) {
  const fields = "id,message,created_time,permalink_url,shares,likes.summary(true),comments.summary(true),attachments{type,media_type,media,subattachments}";
  let url: string | null = `${GRAPH}/${pageId}/posts?fields=${fields}&since=${since}&until=${until}&limit=100&access_token=${pageToken}`;
  const allPosts: any[] = [];
  while (url && allPosts.length < 200) {
    const res: Response = await fetch(url);
    const data: any = await res.json();
    if (data.error) { console.warn(`[getPagePosts] Error: ${data.error.message}`); break; }
    allPosts.push(...(data.data || []));
    url = (allPosts.length < 200 && data.paging?.next) ? data.paging.next : null;
  }
  console.log(`[getPagePosts] FB posts for ${pageId}: ${allPosts.length}`);
  return allPosts;
}

async function getIgInsights(igId: string, pageToken: string, since: string, until: string) {
  const result: Record<string, number> = {};
  const chunks = getDateChunks(since, until, 28);
  console.log(`[getIgInsights] Fetching ${chunks.length} chunks for IG ${igId}`);

  for (const chunk of chunks) {
    try {
      const url = `${GRAPH}/${igId}/insights?metric=reach&since=${chunk.since}&until=${chunk.until}&period=day&access_token=${pageToken}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.error) {
        for (const item of (data.data || [])) {
          for (const v of (item.values || [])) result[item.name] = (result[item.name] || 0) + (typeof v.value === "number" ? v.value : 0);
        }
      }
    } catch (e: unknown) { console.warn(`[getIgInsights] reach error: ${(e as Error).message}`); }

    try {
      const url = `${GRAPH}/${igId}/insights?metric=profile_views,website_clicks&metric_type=total_value&since=${chunk.since}&until=${chunk.until}&period=day&access_token=${pageToken}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.error) {
        for (const item of (data.data || [])) {
          for (const v of (item.values || [])) result[item.name] = (result[item.name] || 0) + (typeof v.value === "number" ? v.value : 0);
        }
      }
    } catch (e: unknown) { console.warn(`[getIgInsights] total_value error: ${(e as Error).message}`); }
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
  const fields = "id,caption,media_type,media_product_type,timestamp,like_count,comments_count,thumbnail_url,media_url,permalink";
  let url: string | null = `${GRAPH}/${igId}/media?fields=${fields}&since=${since}&until=${until}&limit=100&access_token=${pageToken}`;
  const allMedia: any[] = [];
  while (url && allMedia.length < 200) {
    const res: Response = await fetch(url);
    const data: any = await res.json();
    if (data.error) { console.warn(`[getIgMedia] Error: ${data.error.message}`); break; }
    allMedia.push(...(data.data || []));
    url = (allMedia.length < 200 && data.paging?.next) ? data.paging.next : null;
  }
  console.log(`[getIgMedia] IG posts for ${igId}: ${allMedia.length}`);
  return allMedia;
}

async function getIgMediaInsights(mediaId: string, mediaType: string, pageToken: string): Promise<{ reach: number; impressions: number; saved: number; shares: number }> {
  const result = { reach: 0, impressions: 0, saved: 0, shares: 0 };
  // v21: plays is deprecated. Use reach,saved,shares for all types.
  const metrics = "reach,saved,shares";
  try {
    const url = `${GRAPH}/${mediaId}/insights?metric=${metrics}&access_token=${pageToken}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) { console.warn(`[getIgMediaInsights] ${mediaId}: ${data.error.message}`); return result; }
    for (const item of (data.data || [])) {
      const val = typeof item.values?.[0]?.value === "number" ? item.values[0].value : 0;
      if (item.name === "reach") result.reach = val;
      if (item.name === "saved") result.saved = val;
      if (item.name === "shares") result.shares = val;
    }
    result.impressions = result.reach; // impressions deprecated, approximate with reach
  } catch (e: unknown) { console.warn(`[getIgMediaInsights] error ${mediaId}: ${(e as Error).message}`); }
  return result;
}

function safeDiv(a: number, b: number): number {
  return b > 0 ? parseFloat((a / b * 100).toFixed(2)) : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { brandName, startDate, endDate, platform = "all" } = await req.json();
    console.log(`[social-media-data] brand=${brandName} range=${startDate}..${endDate} platform=${platform}`);

    if (!brandName || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const brandConfig = BRAND_PAGE_MAP[brandName];
    if (!brandConfig) {
      return new Response(JSON.stringify({ error: "no_social_media", message: `No social media data for ${brandName}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userToken = Deno.env.get("META_USER_ACCESS_TOKEN");
    if (!userToken) throw new Error("META_USER_ACCESS_TOKEN not configured");

    const { pageId } = brandConfig;
    const pageToken = await getPageToken(pageId, userToken);
    const igId = await getIgBusinessAccountId(pageId, pageToken);

    // Use AbortController for 25s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const [fbInsights, fbFans, fbPosts, fbDailyFans] = await Promise.all([
        getPageInsights(pageId, pageToken, startDate, endDate),
        getPageFanCount(pageId, pageToken),
        getPagePosts(pageId, pageToken, startDate, endDate),
        getDailyMetric(pageId, pageToken, "page_fan_adds_unique", startDate, endDate).catch(() => [] as Array<{ date: string; value: number }>),
      ]);

      const fbReach = fbInsights["page_impressions_unique"] || 0;
      const fbImpressions = fbReach; // page_impressions often fails on New Pages Experience, use reach
      const fbProfileVisits = fbInsights["page_views_total"] || 0;
      const fbEngagements = fbInsights["page_post_engagements"] || 0;
      const fbWebsiteClicks = fbProfileVisits;

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
        igImpressions = igReach;
        igProfileViews = igInsights["profile_views"] || 0;
        igWebsiteClicks = igInsights["website_clicks"] || 0;

        // Build IG posts with per-post insights (batch of 5)
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
            const totalEng = likes + comments + saves + shares;
            const engRate = safeDiv(totalEng, reach);
            const isReel = m.media_product_type === "REELS";
            const type = isReel ? "reel" : m.media_type === "VIDEO" ? "video" : m.media_type === "CAROUSEL_ALBUM" ? "carousel" : "image";
            igPostsList.push({
              id: m.id, platform: "instagram", type,
              caption: m.caption || "", publishedAt: m.timestamp,
              thumbnail: m.thumbnail_url || m.media_url || "",
              permalink: m.permalink || "",
              reach, impressions, likes, comments, shares, saves,
              engagementRate: engRate, clicks: 0,
            });
          }
        }

        // Compute IG engagements from posts if total_interactions not available
        if (igPostsList.length > 0) {
          const postEngagements = igPostsList.reduce((s: number, p: any) => s + p.likes + p.comments + p.shares + p.saves, 0);
          igEngagements = postEngagements;
        }
      }

      // Format FB posts
      const fbPostsFormatted: any[] = [];
      for (const p of fbPosts) {
        const likes = p.likes?.summary?.total_count || 0;
        const comments = p.comments?.summary?.total_count || 0;
        const shares = p.shares?.count || 0;
        const att = p.attachments?.data?.[0];
        const attType = att?.type || att?.media_type || "";
        const type = attType.toLowerCase().includes("video") ? "reel" : attType.toLowerCase().includes("album") ? "carousel" : "image";
        const thumbnail = att?.media?.image?.src || "";
        const totalEng = likes + comments + shares;
        // FB post-level reach/impressions not available on New Pages Experience
        // Use engagementRate from totalEng / fbFans as approximation
        const engRate = fbFans > 0 ? safeDiv(totalEng, fbFans) : 0;

        fbPostsFormatted.push({
          id: p.id, platform: "facebook", type,
          caption: p.message || "", publishedAt: p.created_time,
          thumbnail,
          permalink: p.permalink_url || "",
          reach: 0, impressions: 0,
          likes, comments, shares, saves: 0,
          engagementRate: engRate, clicks: 0,
        });
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
      // Ensure all standard types are present
      for (const t of ["Image", "Reel", "Video", "Carousel"]) typeMap[t] = { count: 0, totalEng: 0 };
      for (const p of allPosts) {
        const label = p.type === "reel" ? "Reel" : p.type === "video" ? "Video" : p.type.charAt(0).toUpperCase() + p.type.slice(1);
        if (!typeMap[label]) typeMap[label] = { count: 0, totalEng: 0 };
        typeMap[label].count++;
        typeMap[label].totalEng += p.engagementRate;
      }
      const byType = Object.entries(typeMap)
        .filter(([_, v]) => v.count > 0 || ["Image", "Reel", "Video"].includes(_))
        .map(([type, v]) => ({
          type, count: v.count, avgEngagement: v.count > 0 ? parseFloat((v.totalEng / v.count).toFixed(1)) : 0,
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
        day, posts: dayMap[day].posts,
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
      const dailyTrends = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({
        date, reach: v.reach, engagementRate: parseFloat((v.eng / v.count).toFixed(1)),
      }));

      const topPostType = (arr: any[]) => {
        if (!arr.length) return "image";
        const counts: Record<string, number> = {};
        for (const p of arr) counts[p.type] = (counts[p.type] || 0) + 1;
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      };

      clearTimeout(timeoutId);

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
            reach: Math.round(fbReach), impressions: Math.round(fbImpressions),
            engagements: Math.round(fbEngagements), engagementRate: safeDiv(fbEngagements, fbReach),
            topPostType: topPostType(fbPostsFormatted),
          },
          instagram: {
            reach: Math.round(igReach), impressions: Math.round(igImpressions),
            engagements: Math.round(igEngagements), engagementRate: safeDiv(igEngagements, igReach),
            topPostType: topPostType(igPostsList),
          },
        },
        contentPerformance: { byType, byDayOfWeek },
        dailyTrends,
        followerTrend: fbDailyFans.map((d) => ({ date: d.date, newFans: d.value })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      clearTimeout(timeoutId);
      if ((e as Error).name === "AbortError") {
        return new Response(JSON.stringify({ error: "Social media data is taking too long to load. Please try again with a shorter date range." }), { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw e;
    }
  } catch (err) {
    console.error("[social-media-data] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
