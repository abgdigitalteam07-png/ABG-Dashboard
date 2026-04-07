const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRAND_PAGE_MAP: Record<string, { pageId: string; igId?: string }> = {
  "Laurel Mountain":             { pageId: "109097221242766",  igId: "17841407456805392" },
  "ABG Home Services":           { pageId: "105794761827063",  igId: "17841447358475392" },
  "Accessible Home Store":       { pageId: "100575172478963",  igId: "17841447196828869" },
  "American Bath Group":         { pageId: "392064344275829",  igId: "17841407680166796" },
  "Arizona Shower Door":         { pageId: "153152084716712",  igId: "17841401877684254" },
  "Bootz":                       { pageId: "107527984776283",  igId: "17841447325532167" },
  "Coastal Shower Doors":        { pageId: "109163007802782",  igId: "17841447422588756" },
  "DreamLine":                   { pageId: "138224832872685",  igId: "17841401873715745" },
  "MAAX":                        { pageId: "160347820667085",  igId: "17841401946878029" },
  "MAAX Bath":                   { pageId: "102097628539895" },
  "Maidstone":                   { pageId: "108165207946820",  igId: "17841447353862897" },
  "Swan":                        { pageId: "123785977667057",  igId: "17841407424398327" },
  "Mr.Steam":                    { pageId: "147487665279716",  igId: "17841401829716362" },
  "Vintage Tub":                 { pageId: "109419884474877",  igId: "17841447422869913" },
  "Vintage Tub & Bath - Canada": { pageId: "109419884474877" },
};

const GRAPH = "https://graph.facebook.com/v19.0";

async function getPageToken(pageId: string, userToken: string): Promise<string> {
  const res = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${userToken}`);
  const data = await res.json();
  return data.access_token || userToken;
}

async function getPageInsights(pageId: string, pageToken: string, since: string, until: string) {
  const metrics = "page_impressions,page_reach,page_engaged_users,page_views_total,page_website_clicks_logged_in_unique";
  const url = `${GRAPH}/${pageId}/insights?metric=${metrics}&since=${since}&until=${until}&period=total_over_range&access_token=${pageToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`FB Insights error: ${data.error.message}`);
  const result: Record<string, number> = {};
  for (const item of (data.data || [])) {
    const val = item.values?.[0]?.value;
    result[item.name] = typeof val === "number" ? val : 0;
  }
  return result;
}

async function getPageFanCount(pageId: string, pageToken: string): Promise<number> {
  const res = await fetch(`${GRAPH}/${pageId}?fields=fan_count&access_token=${pageToken}`);
  const data = await res.json();
  return data.fan_count || 0;
}

async function getPagePosts(pageId: string, pageToken: string, since: string, until: string) {
  const fields = "id,message,created_time,insights.metric(post_impressions,post_reach,post_engaged_users,post_clicks),attachments";
  const url = `${GRAPH}/${pageId}/posts?fields=${fields}&since=${since}&until=${until}&limit=50&access_token=${pageToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) return [];
  return data.data || [];
}

async function getIgInsights(igId: string, pageToken: string, since: string, until: string) {
  const metrics = "reach,impressions,profile_views,website_clicks";
  const url = `${GRAPH}/${igId}/insights?metric=${metrics}&since=${since}&until=${until}&period=total_over_range&access_token=${pageToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) return {};
  const result: Record<string, number> = {};
  for (const item of (data.data || [])) {
    const val = item.values?.[0]?.value;
    result[item.name] = typeof val === "number" ? val : 0;
  }
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

    const { pageId, igId } = brandConfig;
    const pageToken = await getPageToken(pageId, userToken);

    const [fbInsights, fbFans, fbPosts] = await Promise.all([
      getPageInsights(pageId, pageToken, startDate, endDate),
      getPageFanCount(pageId, pageToken),
      getPagePosts(pageId, pageToken, startDate, endDate),
    ]);

    const fbReach = fbInsights["page_reach"] || 0;
    const fbImpressions = fbInsights["page_impressions"] || 0;
    const fbEngagements = fbInsights["page_engaged_users"] || 0;
    const fbProfileVisits = fbInsights["page_views_total"] || 0;
    const fbWebsiteClicks = fbInsights["page_website_clicks_logged_in_unique"] || 0;

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
      const ins: Record<string, number> = {};
      for (const i of (p.insights?.data || [])) {
        ins[i.name] = i.values?.[0]?.value || 0;
      }
      const reach = ins["post_reach"] || 0;
      const impressions = ins["post_impressions"] || 0;
      const engagements = ins["post_engaged_users"] || 0;
      const clicks = ins["post_clicks"] || 0;
      const attType = p.attachments?.data?.[0]?.type || "";
      const type = attType.includes("video") ? "reel" : attType.includes("album") ? "carousel" : "image";

      return {
        id: p.id,
        platform: "facebook",
        type,
        caption: p.message || "",
        publishedAt: p.created_time,
        reach,
        impressions,
        likes: Math.round(engagements * 0.7),
        comments: Math.round(engagements * 0.2),
        shares: Math.round(engagements * 0.1),
        saves: 0,
        engagementRate: safeDiv(engagements, reach),
        clicks,
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
