import { corsHeaders } from "@supabase/supabase-js/cors";

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

const socialMediaBrands: Record<string, { category: string }> = {
  "Laurel Mountain": { category: "medium" },
  "ABG Home Services": { category: "medium" },
  "Accessible Home Store": { category: "small" },
  "American Bath Group": { category: "large" },
  "Arizona Shower Door": { category: "medium" },
  "Bootz": { category: "medium" },
  "Coastal Shower Doors": { category: "medium" },
  "DreamLine": { category: "large" },
  "MAAX": { category: "large" },
  "MAAX Bath": { category: "large" },
  "Maidstone": { category: "medium" },
  "Swan": { category: "large" },
  "Mr.Steam": { category: "medium" },
  "Vintage Tub": { category: "medium" },
  "Vintage Tub & Bath - Canada": { category: "small" },
};

const categoryRanges = {
  small: { followersMin: 20, followersMax: 200, reachMin: 500, reachMax: 2000 },
  medium: { followersMin: 200, followersMax: 2000, reachMin: 2000, reachMax: 10000 },
  large: { followersMin: 2000, followersMax: 10000, reachMin: 10000, reachMax: 30000 },
};

const postTypes = ["image", "reel", "carousel", "story"] as const;
const platforms = ["facebook", "instagram"] as const;

const captions = [
  "Repping the brand the right way with our latest collection! 🛁✨",
  "New product drop alert! Check out what's coming this spring 🌸",
  "Behind the scenes at our manufacturing facility 🏭",
  "Customer spotlight: See how they transformed their bathroom 🔄",
  "Trade show season is here! Visit us at booth #247 📍",
  "5 bathroom trends you need to know about in 2026 💡",
  "Our team is growing! Welcome to our newest members 👋",
  "Weekend project inspiration: A complete bath refresh 🛀",
  "Thank you for 1000 followers! Here's a special offer 🎉",
  "Design tip: How to choose the right bathtub for your space 📐",
  "Dealer appreciation post - thank you for your partnership! 🤝",
  "Product care guide: Keep your fixtures looking brand new ✨",
  "Before & after: Another stunning bathroom renovation 📸",
  "Holiday season prep: Get your bathroom guest-ready 🎄",
  "Industry news: What's changing in bath manufacturing 📰",
];

function generateMockData(brandName: string, startDate: string, endDate: string, platformFilter: string) {
  const config = socialMediaBrands[brandName];
  if (!config) return null;

  const range = categoryRanges[config.category as keyof typeof categoryRanges];
  const seed = hashString(brandName + "social");
  const rand = seededRandom(seed);

  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  const fbFollowers = Math.round(range.followersMin + rand() * (range.followersMax - range.followersMin));
  const igFollowers = Math.round(fbFollowers * (0.3 + rand() * 0.5));
  const totalReach = Math.round(range.reachMin + rand() * (range.reachMax - range.reachMin)) * Math.max(1, Math.round(days / 30));
  const fbReach = Math.round(totalReach * (0.5 + rand() * 0.2));
  const igReach = totalReach - fbReach;
  const totalImpressions = Math.round(totalReach * (2.2 + rand() * 1.5));
  const fbImpressions = Math.round(totalImpressions * (0.5 + rand() * 0.2));
  const igImpressions = totalImpressions - fbImpressions;
  const totalEngagements = Math.round(totalReach * (0.08 + rand() * 0.12));
  const fbEngagements = Math.round(totalEngagements * (0.5 + rand() * 0.15));
  const igEngagements = totalEngagements - fbEngagements;
  const engagementRate = parseFloat(((totalEngagements / totalReach) * 100).toFixed(2));
  const profileVisits = Math.round(totalReach * (0.03 + rand() * 0.02));
  const websiteClicks = Math.round(profileVisits * (0.2 + rand() * 0.15));

  // Generate posts
  const postCount = 8 + Math.round(rand() * 7);
  const posts: any[] = [];
  for (let i = 0; i < postCount; i++) {
    const r = seededRandom(seed + i + 100);
    const platform = platforms[Math.round(r()) % 2];
    const type = postTypes[Math.floor(r() * postTypes.length)];
    const caption = captions[Math.floor(r() * captions.length)];
    const pubDate = new Date(start.getTime() + r() * (end.getTime() - start.getTime()));
    const postReach = Math.round((range.reachMin / 5) + r() * (range.reachMax / 3));
    const postImpressions = Math.round(postReach * (2 + r() * 1.5));
    const likes = Math.round(postReach * (0.03 + r() * 0.08));
    const comments = Math.round(likes * (0.1 + r() * 0.2));
    const shares = Math.round(likes * (0.1 + r() * 0.3));
    const saves = Math.round(likes * (0.05 + r() * 0.15));
    const clicks = Math.round(postReach * (0.02 + r() * 0.03));
    const postEngRate = parseFloat(((likes + comments + shares + saves) / postReach * 100).toFixed(1));

    posts.push({
      id: `post_${brandName.replace(/\s+/g, "_").toLowerCase()}_${i + 1}`,
      platform,
      type,
      caption,
      publishedAt: pubDate.toISOString(),
      thumbnail: null,
      reach: postReach,
      impressions: postImpressions,
      likes,
      comments,
      shares,
      saves,
      engagementRate: postEngRate,
      clicks,
    });
  }
  posts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Content performance by type
  const typeMap: Record<string, { count: number; totalReach: number; totalEng: number }> = {};
  for (const p of posts) {
    const label = p.type === "reel" ? "Reel/Video" : p.type.charAt(0).toUpperCase() + p.type.slice(1);
    if (!typeMap[label]) typeMap[label] = { count: 0, totalReach: 0, totalEng: 0 };
    typeMap[label].count++;
    typeMap[label].totalReach += p.reach;
    typeMap[label].totalEng += p.engagementRate;
  }
  const byType = Object.entries(typeMap).map(([type, v]) => ({
    type,
    count: v.count,
    avgReach: Math.round(v.totalReach / v.count),
    avgEngagement: parseFloat((v.totalEng / v.count).toFixed(1)),
  }));

  // By day of week
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayMap: Record<string, { posts: number; totalEng: number }> = {};
  for (const d of dayNames) dayMap[d] = { posts: 0, totalEng: 0 };
  for (const p of posts) {
    const day = dayNames[new Date(p.publishedAt).getDay()];
    dayMap[day].posts++;
    dayMap[day].totalEng += p.engagementRate;
  }
  const byDayOfWeek = dayNames.map((day) => ({
    day,
    posts: dayMap[day].posts,
    avgEngagement: dayMap[day].posts > 0 ? parseFloat((dayMap[day].totalEng / dayMap[day].posts).toFixed(1)) : 0,
  }));

  // Daily trends
  const dailyTrends: any[] = [];
  for (let i = 0; i < Math.min(days, 90); i++) {
    const dt = new Date(start);
    dt.setDate(dt.getDate() + i);
    const r = seededRandom(seed + i + 500);
    const dayReach = Math.round((totalReach / days) * (0.5 + r() * 1));
    const dayEng = parseFloat((engagementRate * (0.6 + r() * 0.8)).toFixed(1));
    dailyTrends.push({
      date: dt.toISOString().split("T")[0],
      reach: dayReach,
      engagementRate: dayEng,
    });
  }

  // Determine top post types
  const fbPosts = posts.filter((p) => p.platform === "facebook");
  const igPosts = posts.filter((p) => p.platform === "instagram");
  const topPostType = (arr: any[]) => {
    if (!arr.length) return "image";
    const counts: Record<string, number> = {};
    for (const p of arr) {
      const label = p.type === "reel" ? "reel" : p.type;
      counts[label] = (counts[label] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  };

  // Filter posts by platform if needed
  const filteredPosts = platformFilter === "all" ? posts :
    posts.filter((p) => p.platform === platformFilter);

  return {
    overview: {
      totalFollowers: { facebook: fbFollowers, instagram: igFollowers },
      followerGrowth: {
        facebook: parseFloat(((rand() - 0.2) * 12).toFixed(1)),
        instagram: parseFloat(((rand() - 0.1) * 15).toFixed(1)),
      },
      totalPosts: filteredPosts.length,
      totalReach: platformFilter === "facebook" ? fbReach : platformFilter === "instagram" ? igReach : totalReach,
      totalImpressions: platformFilter === "facebook" ? fbImpressions : platformFilter === "instagram" ? igImpressions : totalImpressions,
      totalEngagements: platformFilter === "facebook" ? fbEngagements : platformFilter === "instagram" ? igEngagements : totalEngagements,
      engagementRate,
      profileVisits,
      websiteClicks,
    },
    posts: filteredPosts,
    platformBreakdown: {
      facebook: {
        reach: fbReach,
        impressions: fbImpressions,
        engagements: fbEngagements,
        engagementRate: parseFloat(((fbEngagements / Math.max(fbReach, 1)) * 100).toFixed(2)),
        topPostType: topPostType(fbPosts),
      },
      instagram: {
        reach: igReach,
        impressions: igImpressions,
        engagements: igEngagements,
        engagementRate: parseFloat(((igEngagements / Math.max(igReach, 1)) * 100).toFixed(2)),
        topPostType: topPostType(igPosts),
      },
    },
    contentPerformance: { byType, byDayOfWeek },
    dailyTrends,
  };
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

    if (!socialMediaBrands[brandName]) {
      return new Response(JSON.stringify({ error: "no_social_media", message: `No social media data for ${brandName}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = generateMockData(brandName, startDate, endDate, platform);

    return new Response(JSON.stringify(data), {
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
