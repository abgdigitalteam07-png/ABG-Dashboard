const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOKEN = Deno.env.get("HUBSPOT_ACCESS_TOKEN") || "";

async function hubspotFetch(path: string): Promise<any> {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`HubSpot API ${path} → ${res.status}`);
  return res.json();
}

// Primary account BU → brand name
const BU_TO_BRAND: Record<string, string> = {
  "0":       "American Bath Group",
  "1982882": "ABG Hospitality",
  "2625978": "Accessible Home Store",
  "1982881": "Aker",
  "1982883": "Aquarius",
  "1982884": "Aquatic",
  "1982886": "Bootz",
  "1982887": "Clarion",
  "1982888": "Comfort Designs",
  "1690059": "DreamLine",
  "1690060": "Florestone",
  "1982889": "Hamilton",
  "1982890": "IMI",
  "1982879": "Laurel Mountain",
  "1982891": "MAAX",
  "1982892": "Maidstone",
  "1690061": "Neptune",
  "1982893": "RBS",
  "843133":  "Swan",
  "2659249": "Vintage.ca",
};

// Stable brand color palette (index by brand name hash)
const BRAND_COLORS = [
  "#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6",
  "#06B6D4","#EC4899","#14B8A6","#F97316","#6366F1",
  "#84CC16","#E11D48","#0EA5E9","#D946EF","#22C55E",
];

function brandColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return BRAND_COLORS[Math.abs(hash) % BRAND_COLORS.length];
}

function extractDate(email: any): string {
  const candidates = [
    email.hs_publish_date,
    email.publishDate,
    email.properties?.hs_publish_date,
    email.updatedAt,
  ];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const ms = typeof c === "number" ? c : Number(c);
      const d = isNaN(ms) ? new Date(c) : new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    } catch { /* skip */ }
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!TOKEN) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

    const { searchQuery = "" } = await req.json();
    const query = searchQuery.trim().toLowerCase();

    if (query.length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch up to 500 published emails (paginated)
    const allEmails: any[] = [];
    let after: string | undefined;
    let pages = 0;

    while (pages < 5) {
      pages++;
      const url =
        `/marketing/v3/emails?limit=100&orderBy=-publishDate&isPublished=true` +
        `&property=name&property=subject&property=businessUnitId` +
        `&property=hs_publish_date&property=publishDate&property=updatedAt` +
        `&property=state&property=subcategory&property=from&property=publishedByName` +
        (after ? `&after=${after}` : "");

      const res = await hubspotFetch(url);
      allEmails.push(...(res.results || []));
      if (!res.paging?.next?.after) break;
      after = res.paging.next.after;
    }

    // Filter by query (name or subject)
    const matched = allEmails.filter((e) => {
      const name = (e.name || "").toLowerCase();
      const subject = (e.subject || "").toLowerCase();
      return name.includes(query) || subject.includes(query);
    });

    // Map to result shape
    const results = matched.slice(0, 30).map((e) => {
      const buId = String(e.businessUnitId ?? "0");
      const brand = BU_TO_BRAND[buId] || "American Bath Group";
      const state: string = (e.state || e.properties?.state || "PUBLISHED").toUpperCase();
      const subcategory: string = e.subcategory || e.properties?.subcategory || "marketing_email";
      const sender: string = e.publishedByName || e.from?.fromName || "";
      return {
        id: e.id || "",
        name: e.name || "Untitled",
        subject: e.subject || "",
        brand,
        brandColor: brandColor(brand),
        date: extractDate(e),
        state,
        subcategory,
        sender,
      };
    });

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("hubspot-email-search error:", err);
    return new Response(
      JSON.stringify({ results: [], error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
