// aeo-scan — weekly SEO/AEO/GEO scan orchestrator for one brand.
// Invoked by the admin "Scan now" button or the weekly cron.
// Steps: (1) rate-limit guard, (2) site audit scores via Claude,
// (3) tracked prompts × Claude-with-web-search → visibility + citations,
// (4) Reddit thread visibility, (5) recommendations.
// Writes weekly snapshots to the aeo_* / seo_audit_scores / reddit_threads tables.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_SCANS_PER_BRAND_PER_WEEK = 3; // manual re-scans allowed on top of the cron run
const MAX_PROMPTS = 10;

interface ScanRequest {
  brandId: string;
  brandName: string;
  siteUrl: string;          // from brands.ts gscSiteUrl or website
  competitors?: string[];   // optional override; defaults derived per category
}

function mondayOfWeek(d = new Date()): string {
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const m = new Date(d);
  m.setUTCDate(d.getUTCDate() + diff);
  return m.toISOString().slice(0, 10);
}

async function claude(apiKey: string, system: string, user: string, useWebSearch = false): Promise<string> {
  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (useWebSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");
}

function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON in model output");
  return JSON.parse(match[0]) as T;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Caller must be an authenticated admin (the frontend passes the user JWT).
  const authHeader = req.headers.get("authorization") ?? "";
  const { data: userData } = await createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { authorization: authHeader } } },
  ).auth.getUser();
  const callerId = userData?.user?.id ?? null;
  if (callerId) {
    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: callerId });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admins only" }), {
        status: 403, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
  } // no JWT = internal cron invocation with service key

  const { brandId, brandName, siteUrl, competitors = [] }: ScanRequest = await req.json();
  const weekOf = mondayOfWeek();
  let apiCalls = 0;

  // 1. Rate-limit guard — never blow through API limits silently.
  const { count: scansThisWeek } = await supabase
    .from("aeo_scan_log")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .eq("week_of", weekOf)
    .neq("status", "failed");
  if ((scansThisWeek ?? 0) >= MAX_SCANS_PER_BRAND_PER_WEEK) {
    return new Response(
      JSON.stringify({ error: `Scan limit reached for this week (${MAX_SCANS_PER_BRAND_PER_WEEK}). Try next week or delete a scan log row.` }),
      { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }

  const { data: scanRow } = await supabase
    .from("aeo_scan_log")
    .insert({ brand_id: brandId, week_of: weekOf, triggered_by: callerId })
    .select("id").single();
  const scanId = scanRow!.id;

  try {
    // 2. Site audit — SEO/GEO/AEO rubric scores.
    const auditText = await claude(
      anthropicKey,
      "You are an SEO/GEO/AEO auditor. Fetch and assess the site via web search. Score each dimension 1-10 per the standard rubric (technical on-page, content quality, structured data / E-E-A-T, AI-synthesis readiness / featured-snippet eligibility, answer formats). Reply ONLY with JSON: {\"seo\":n,\"geo\":n,\"aeo\":n,\"findings\":{\"seo\":[...],\"geo\":[...],\"aeo\":[...]},\"pages_crawled\":n}",
      `Audit ${siteUrl} (brand: ${brandName}).`,
      true,
    );
    apiCalls++;
    const audit = extractJson<{ seo: number; geo: number; aeo: number; findings: unknown; pages_crawled: number }>(auditText);
    await supabase.from("seo_audit_scores").upsert({
      brand_id: brandId, week_of: weekOf,
      seo_score: audit.seo, geo_score: audit.geo, aeo_score: audit.aeo,
      findings: audit.findings, pages_crawled: audit.pages_crawled ?? 0,
    }, { onConflict: "brand_id,week_of" });

    // 3. Tracked prompts → visibility + citations (Claude as the first engine).
    const { data: prompts } = await supabase
      .from("aeo_prompts")
      .select("id, prompt")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .limit(MAX_PROMPTS);

    let mentions = 0;
    const domainFreq = new Map<string, { freq: number; brandMentioned: boolean }>();
    for (const p of prompts ?? []) {
      const answerRaw = await claude(
        anthropicKey,
        `Answer the user's question using web search, as a consumer AI assistant would. Then append a JSON block: {"brand_mentioned": bool (is "${brandName}" in your answer), "competitors_mentioned": string[], "cited_urls": [{"url": "...", "domain": "..."}]}`,
        p.prompt,
        true,
      );
      apiCalls++;
      let meta = { brand_mentioned: false, competitors_mentioned: [] as string[], cited_urls: [] as { url: string; domain: string }[] };
      try { meta = { ...meta, ...extractJson(answerRaw) }; } catch { /* keep defaults */ }
      if (meta.brand_mentioned) mentions++;
      for (const c of meta.cited_urls) {
        const e = domainFreq.get(c.domain) ?? { freq: 0, brandMentioned: false };
        e.freq++;
        e.brandMentioned ||= meta.brand_mentioned;
        domainFreq.set(c.domain, e);
      }
      await supabase.from("aeo_prompt_results").upsert({
        prompt_id: p.id, brand_id: brandId, week_of: weekOf, engine: "claude",
        answer_text: answerRaw.slice(0, 8000),
        brand_mentioned: meta.brand_mentioned,
        competitors_mentioned: meta.competitors_mentioned,
        cited_urls: meta.cited_urls,
      }, { onConflict: "prompt_id,week_of,engine" });
    }

    const promptCount = prompts?.length ?? 0;
    await supabase.from("aeo_visibility_snapshots").upsert({
      brand_id: brandId, week_of: weekOf, company: brandName, is_own_brand: true,
      engine: "claude",
      visibility_pct: promptCount ? Math.round((mentions / promptCount) * 10000) / 100 : 0,
    }, { onConflict: "brand_id,week_of,company,engine" });

    for (const [domain, e] of domainFreq) {
      await supabase.from("aeo_citations").insert({
        brand_id: brandId, week_of: weekOf, domain,
        frequency: e.freq, brand_mentioned: e.brandMentioned,
      });
    }

    // 4. Reddit visibility — official public JSON search (no auth needed for read).
    const query = encodeURIComponent(`${brandName} OR "hot tub" site:reddit.com`);
    const redditRes = await fetch(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(brandName)}&sort=relevance&t=month&limit=15`,
      { headers: { "User-Agent": "abg-brand-hub/1.0" } },
    );
    if (redditRes.ok) {
      const rd = await redditRes.json();
      for (const child of rd?.data?.children ?? []) {
        const post = child.data;
        await supabase.from("reddit_threads").upsert({
          brand_id: brandId, week_of: weekOf,
          thread_url: `https://www.reddit.com${post.permalink}`,
          subreddit: `r/${post.subreddit}`,
          title: post.title?.slice(0, 500) ?? "",
          upvotes: post.ups ?? 0,
          num_comments: post.num_comments ?? 0,
          posted_at: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
          brand_mentioned: (post.title + " " + (post.selftext ?? "")).toLowerCase().includes(brandName.toLowerCase()),
        }, { onConflict: "brand_id,week_of,thread_url" });
      }
    }

    // 5. Recommendations from this week's citations.
    const topDomains = [...domainFreq.entries()].sort((a, b) => b[1].freq - a[1].freq).slice(0, 8);
    const recsText = await claude(
      anthropicKey,
      `You generate AEO recommendations. Given a brand, its audit findings, and the domains AI engines cited this week, propose 4-6 actions. Types: "Net new content", "Social amplification", "Outreach", "Technical fix", "Reddit engagement". Reply ONLY JSON array: [{"title","rec_type","content_type","channel","priority":"HIGH|MED|LOW"}]`,
      `Brand: ${brandName}. Audit findings: ${JSON.stringify(audit.findings).slice(0, 2000)}. Top cited domains: ${topDomains.map(([d, e]) => `${d}(${e.freq})`).join(", ") || "none yet"}.`,
    );
    apiCalls++;
    try {
      const recs = extractJson<Array<{ title: string; rec_type: string; content_type?: string; channel?: string; priority: string }>>(recsText);
      for (const r of recs) {
        await supabase.from("aeo_recommendations").upsert({
          brand_id: brandId, title: r.title, rec_type: r.rec_type,
          content_type: r.content_type, channel: r.channel,
          priority: r.priority, source_week: weekOf,
        }, { onConflict: "brand_id,title", ignoreDuplicates: true }); // never clobber statuses
      }
    } catch { /* recommendations are best-effort */ }

    await supabase.from("aeo_scan_log").update({
      status: "completed", api_calls_used: apiCalls, finished_at: new Date().toISOString(),
    }).eq("id", scanId);

    return new Response(JSON.stringify({ ok: true, weekOf, apiCalls, prompts: promptCount }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    await supabase.from("aeo_scan_log").update({
      status: "failed", api_calls_used: apiCalls, error: String(err), finished_at: new Date().toISOString(),
    }).eq("id", scanId);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
