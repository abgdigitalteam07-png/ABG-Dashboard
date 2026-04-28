const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOKEN = Deno.env.get("HUBSPOT_ACCESS_TOKEN") || "";
const SECONDARY_TOKEN = Deno.env.get("HUBSPOT_SECONDARY_ACCESS_TOKEN") || "";
const BASE = "https://api.hubapi.com";

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

function extractDate(props: any): string {
  const candidates = [
    props?.hs_publish_date,
    props?.publishDate,
    props?.updatedAt,
    props?.createdate,
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

function mapEmail(e: any, buToName: Record<string, string>): any {
  // Handles both v3 marketing API (top-level) and CRM API (nested under .properties)
  const p = e.properties ?? e;
  const name: string = p.name || p.hs_name || e.name || "Untitled";
  const subject: string = p.hs_email_subject || p.subject || e.subject || "";
  const buId = String(p.businessUnitId ?? e.businessUnitId ?? "0");
  const brand = buToName[buId] || "American Bath Group";
  const state: string = (p.state || p.hs_email_status || e.state || "SENT").toUpperCase();
  const subcategory: string = p.subcategory || e.subcategory || "marketing_email";
  const sender: string = p.publishedByName || p.hs_email_from_name || e.publishedByName || (e.from?.fromName) || "";
  return {
    id: String(e.id || ""),
    name,
    subject,
    brand,
    brandColor: brandColor(brand),
    date: extractDate({ ...p, updatedAt: e.updatedAt }),
    state,
    subcategory,
    sender,
  };
}

// Strategy A: CRM v3 search — server-side full-text search across ALL emails
async function crmSearch(rawQuery: string, token: string): Promise<any[]> {
  try {
    const res = await fetch(`${BASE}/crm/v3/objects/marketing_emails/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: rawQuery,
        limit: 50,
        properties: [
          "name", "hs_name", "hs_email_subject", "businessUnitId",
          "state", "hs_email_status", "hs_publish_date", "subcategory",
          "publishedByName", "hs_email_from_name",
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[crmSearch] ${res.status} — falling back`);
      return [];
    }
    const data = await res.json();
    return data.results || [];
  } catch (e) {
    console.warn("[crmSearch] error:", e);
    return [];
  }
}

// Strategy B: List all emails paginated (fallback if CRM search unavailable)
async function listSearch(rawQuery: string, token: string, label: string): Promise<any[]> {
  const query = rawQuery.toLowerCase();
  const collected: any[] = [];
  let after: string | undefined;

  for (let page = 0; page < 20; page++) {
    const url =
      `${BASE}/marketing/v3/emails?limit=100&orderBy=-createDate` +
      `&property=name&property=subject&property=businessUnitId` +
      `&property=hs_publish_date&property=publishDate&property=updatedAt` +
      `&property=state&property=subcategory&property=from&property=publishedByName` +
      (after ? `&after=${after}` : "");
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) { console.warn(`[listSearch:${label}] ${res.status}`); break; }
      const data = await res.json();
      const rows: any[] = data.results || [];

      for (const e of rows) {
        const n = (e.name || "").toLowerCase();
        const s = (e.subject || "").toLowerCase();
        if (n.includes(query) || s.includes(query)) collected.push(e);
      }

      if (!data.paging?.next?.after) break;
      after = data.paging.next.after;

      // Stop early if we already have enough matches
      if (collected.length >= 30) break;
    } catch (e) {
      console.warn(`[listSearch:${label}] error:`, e);
      break;
    }
  }
  return collected;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!TOKEN) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

    const { searchQuery = "" } = await req.json();
    const rawQuery = searchQuery.trim();
    if (rawQuery.length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Run CRM search on both accounts in parallel (fastest, searches all emails)
    const [crmPrimary, crmSecondary] = await Promise.all([
      crmSearch(rawQuery, TOKEN),
      SECONDARY_TOKEN ? crmSearch(rawQuery, SECONDARY_TOKEN) : Promise.resolve([]),
    ]);

    let rawMatches = [...crmPrimary, ...crmSecondary];

    // If CRM search returned nothing (API not available on plan), fall back to list
    if (rawMatches.length === 0) {
      console.log("[hubspot-email-search] CRM search empty — using list fallback");
      const [listPrimary, listSecondary] = await Promise.all([
        listSearch(rawQuery, TOKEN, "primary"),
        SECONDARY_TOKEN ? listSearch(rawQuery, SECONDARY_TOKEN, "secondary") : Promise.resolve([]),
      ]);
      rawMatches = [...listPrimary, ...listSecondary];
    }

    // Deduplicate by id
    const seen = new Set<string>();
    const deduped = rawMatches.filter((e) => {
      const id = String(e.id || "");
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const results = deduped.slice(0, 30).map((e) => mapEmail(e, BU_TO_BRAND));

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
