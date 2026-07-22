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
  landingPageId?: string;   // HubSpot page id — if set, auto-publishes Reddit results after the scan
  scanType?: "full" | "quick" | "reddit";   // full = audit + prompts + Reddit + recs; quick = site audit only; reddit = Reddit thread scan only (standalone, on-demand)
  pageScope?: "homepage" | "multi"; // homepage = Quick Audit (homepage + up to 6 pages); multi = Full Audit (uncapped crawl)
}

function mondayOfWeek(d = new Date()): string {
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const m = new Date(d);
  m.setUTCDate(d.getUTCDate() + diff);
  return m.toISOString().slice(0, 10);
}

// Every external fetch in this file must be bounded — an unguarded call hanging
// silently is exactly what stalled a scan at "running" forever (see git history).
function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 90_000): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  return fetch(url, { ...init, signal: ac.signal }).finally(() => clearTimeout(timer));
}

async function claude(apiKey: string, system: string, user: string, useWebSearch = false, maxSearches = 3): Promise<string> {
  const body: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (useWebSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }];
  }
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }, 110_000);
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");
}

// Same as claude(), but also returns the REAL urls/titles from web_search_tool_result
// blocks — these come directly from the search engine, not the model's memory, so
// they can never be hallucinated. Use this whenever a fabricated URL would be harmful
// (e.g. a link a dealer will click).
async function claudeWithCitations(
  apiKey: string, system: string, user: string, maxSearches = 8,
): Promise<{ text: string; citations: Array<{ url: string; title: string }> }> {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }],
    }),
  }, 110_000);
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const content = data.content ?? [];
  const text = content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");
  const citations: Array<{ url: string; title: string }> = [];
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.url) citations.push({ url: r.url, title: r.title ?? "" });
      }
    }
  }
  return { text, citations };
}

interface RedditPost {
  thread_url: string;
  subreddit: string;
  title: string;
  upvotes: number;
  num_comments: number;
  posted_at: string | null;
}

function parseApifyItems(items: Array<Record<string, unknown>>): RedditPost[] {
  const seen = new Set<string>();
  const posts: RedditPost[] = [];
  for (const it of items) {
    const url = (it.url ?? it.postUrl ?? it.link) as string | undefined;
    if (!url || !url.includes("reddit.com") || seen.has(url)) continue;
    seen.add(url);
    posts.push({
      thread_url: url,
      subreddit: (it.communityName ?? it.subreddit ?? `r/${it.parsedCommunityName ?? "unknown"}`) as string,
      title: String(it.title ?? "").slice(0, 500),
      // This actor doesn't expose vote/comment counts — store 0 rather than fabricate a number.
      upvotes: Number(it.upVotes ?? it.upvoteCount ?? it.score ?? 0) || 0,
      num_comments: Number(it.numberOfComments ?? it.numComments ?? it.commentCount ?? 0) || 0,
      posted_at: typeof it.createdAt === "string" ? it.createdAt : null,
    });
  }
  return posts;
}

// Real Reddit data via Apify's reddit-scraper-lite actor (residential proxies — bypasses
// the datacenter-IP block that makes direct Reddit access impossible from Edge Functions).
// The actor is slow (can exceed 150s), so this starts the run and polls the run status —
// safe to call from background (waitUntil) code since it isn't bound by the request lifecycle.
async function searchRedditViaApify(brandName: string, category?: string, maxWaitMs = 240_000): Promise<RedditPost[]> {
  const token = Deno.env.get("APIFY_API_TOKEN");
  if (!token) throw new Error("APIFY_API_TOKEN not configured");

  // Brand name alone surfaces generic noise (unrelated subs matching the words);
  // pairing it with the product category anchors results to real, relevant threads.
  const searches = category ? [`${brandName} ${category}`] : [brandName];

  const startRes = await fetchWithTimeout(
    `https://api.apify.com/v2/acts/trudax~reddit-scraper-lite/runs?token=${token}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        searches,
        type: "posts",
        sort: "relevance",
        maxItems: 12,
        maxPostCount: 12,
        maxComments: 0,
      }),
    },
    30_000,
  );
  if (!startRes.ok) throw new Error(`Apify start ${startRes.status}: ${(await startRes.text()).slice(0, 500)}`);
  const { data: run } = await startRes.json();
  const runId = run.id;

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetchWithTimeout(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`, {}, 20_000);
    const { data: statusData } = await statusRes.json();
    if (statusData.status === "SUCCEEDED") {
      const itemsRes = await fetchWithTimeout(
        `https://api.apify.com/v2/datasets/${statusData.defaultDatasetId}/items?token=${token}`, {}, 30_000,
      );
      return parseApifyItems(await itemsRes.json());
    }
    if (["FAILED", "TIMED-OUT", "ABORTED"].includes(statusData.status)) {
      throw new Error(`Apify run ${statusData.status}`);
    }
  }
  throw new Error("Apify run did not finish within the wait window");
}

function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON in model output");
  return JSON.parse(match[0]) as T;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    return await handleRequest(req);
  } catch (err) {
    // Any uncaught throw here would otherwise produce the platform's generic
    // error response, which drops our CORS headers — the browser then reports
    // that as an opaque "Failed to fetch" instead of surfacing the real error.
    console.error("aeo-scan top-level error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});

async function handleRequest(req: Request): Promise<Response> {
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

  const body = await req.json();
  const { brandId, brandName, siteUrl, landingPageId }: ScanRequest = body;
  const scanType: "full" | "quick" | "reddit" =
    body.scanType === "quick" ? "quick" : body.scanType === "reddit" ? "reddit" : "full";
  const pageScope: "homepage" | "multi" = body.pageScope === "homepage" ? "homepage" : "multi";
  const weekOf = mondayOfWeek();

  // "Generate with AI" button on the Prompts tab — fills remaining prompt slots
  // (up to MAX_PROMPTS) without running the full scan (no audit/Reddit/recs calls).
  if (body.promptsOnly) {
    try {
      const { count: activeCount } = await supabase
        .from("aeo_prompts").select("id", { count: "exact", head: true })
        .eq("brand_id", brandId).eq("is_active", true);
      const remaining = MAX_PROMPTS - (activeCount ?? 0);
      if (remaining <= 0) {
        return new Response(JSON.stringify({ error: `Already at ${MAX_PROMPTS}/${MAX_PROMPTS} prompts.` }), {
          status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      const genText = await claude(
        anthropicKey,
        `You generate AI-visibility tracking prompts. Given a brand and its website, infer its product category and write ${remaining} NEW questions a real buyer would ask an AI assistant (mix of unbranded category questions, branded questions, and dealer/purchase questions). Reply ONLY JSON: [{"prompt","product_service","icp","journey_phase":"Awareness|Consideration|Decision"}]`,
        `Brand: ${brandName}. Website: ${siteUrl}.`,
      );
      const generated = extractJson<Array<{ prompt: string; product_service?: string; icp?: string; journey_phase?: string }>>(genText);
      const rows = generated.slice(0, remaining).map(g => ({
        brand_id: brandId, prompt: g.prompt, product_service: g.product_service ?? null,
        icp: g.icp ?? null,
        journey_phase: ["Awareness", "Consideration", "Decision"].includes(g.journey_phase ?? "") ? g.journey_phase : null,
      }));
      const { data: inserted, error } = await supabase.from("aeo_prompts")
        .upsert(rows, { onConflict: "brand_id,prompt", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, added: inserted?.length ?? 0 }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
  }

  // Debug mode: run ONLY the Apify Reddit search and return raw results.
  if (body.redditOnly) {
    try {
      if (body.rawFields) {
        // Inspect actual field names/shape returned by the actor.
        const token = Deno.env.get("APIFY_API_TOKEN");
        const startRes = await fetch(`https://api.apify.com/v2/acts/trudax~reddit-scraper-lite/runs?token=${token}`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ searches: [brandName], type: "posts", sort: "relevance", maxItems: 3, maxPostCount: 3, maxComments: 0 }),
        });
        const { data: run } = await startRes.json();
        const deadline = Date.now() + 130_000;
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 5000));
          const st = await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${token}`)).json();
          if (st.data.status === "SUCCEEDED") {
            const items = await (await fetch(`https://api.apify.com/v2/datasets/${st.data.defaultDatasetId}/items?token=${token}`)).json();
            return new Response(JSON.stringify({ rawItems: items }), { headers: { ...corsHeaders, "content-type": "application/json" } });
          }
          if (["FAILED", "TIMED-OUT", "ABORTED"].includes(st.data.status)) throw new Error(st.data.status);
        }
        throw new Error("timed out waiting for raw fields");
      }
      const apifyThreads = await searchRedditViaApify(brandName, body.category, 130_000);
      return new Response(JSON.stringify({ count: apifyThreads.length, apifyThreads }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
  }
  let apiCalls = 0;

  // 0. Mark stale runs (killed workers) as failed so they don't block the weekly limit.
  await supabase.from("aeo_scan_log")
    .update({ status: "failed", error: "stale — worker terminated", finished_at: new Date().toISOString() })
    .eq("brand_id", brandId).eq("status", "running")
    .lt("started_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

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
    .insert({ brand_id: brandId, week_of: weekOf, triggered_by: callerId, scan_type: scanType, page_scope: pageScope })
    .select("id").single();
  const scanId = scanRow!.id;

  const runScan = async () => {
  try {
    // 2. Site audit — SEO/GEO/AEO rubric scores. Skipped for a "reddit" scan — that
    // mode is a standalone, on-demand Reddit-only refresh (see step 4 below), not a
    // full site audit, so it finishes in a few seconds instead of a couple minutes.
    let audit: { seo: number; geo: number; aeo: number; findings: any; pages_crawled: number } = {
      seo: 0, geo: 0, aeo: 0, findings: {}, pages_crawled: 0,
    };
    if (scanType !== "reddit") {
    // Wording matches the seo-geo-aeo skill's own Quick Audit / Full Audit definitions exactly.
    const crawlScopeText = pageScope === "homepage"
      ? "This is a Quick Audit: fetch the homepage plus up to 6 high-signal pages (About/Team, Services, Case Studies, Blog, Contact, FAQ) via web search"
      : "This is a Full Audit: crawl the entire site via web search, with no page cap — skip only Privacy Policy, Terms of Service, login, thank-you, and deep pagination pages";
    const auditText = await claude(
      anthropicKey,
      `You are an expert SEO/GEO/AEO auditor following a standard audit methodology. ${crawlScopeText} — never flag something "missing" unless you actually checked for it across the pages you fetched.

Score each dimension 1-10 (1-3 critical issues, 4-5 below average, 6-7 decent foundation, 8-9 strong, 10 exemplary):
- SEO: Technical On-Page (title tags, meta descriptions, heading hierarchy, URL structure, canonical, robots meta, alt text, internal links, Open Graph), Content Quality (word count, keyword signals, freshness, readability), Structured Data (schema markup types, validity)
- GEO: E-E-A-T Assessment (author info, About page depth, contact info, trust signals, Organization schema), Content for AI Synthesis (factual density, clear claims, source citations, comprehensiveness, entity clarity, originality), Technical GEO (structured data depth, HTTPS, crawlability, social/brand-entity links)
- AEO: Featured Snippet Eligibility (direct-answer paragraphs, definition patterns, list/table content), Structured Answer Formats (FAQ schema, HowTo schema, question-phrased headings, Speakable schema), Voice Search Readiness (conversational language, long-tail question coverage, local/NAP signals)

Do not claim to assess Core Web Vitals, page speed, backlink profiles, or JavaScript-rendered content from a plain web-search fetch — you cannot measure these reliably this way. If relevant, note that limitation in a finding rather than guessing, and point to a dedicated tool (e.g. Google PageSpeed Insights for speed/CWV, Ahrefs/SEMrush for backlinks).

Reply ONLY with this exact JSON shape (every signal array item is one row — Signal/Finding/Status, Status is exactly "Good", "Needs Attention", or "Missing"):
{"seo":n,"geo":n,"aeo":n,"pages_crawled":n,
"findings":{
 "executive_summary":"3-5 sentence summary — what's strong, most urgent issue, one key opportunity, specific to this site",
 "pages_audited":[{"url":"...","page_type":"Homepage|About|Services|Blog|...","notes":"..."}],
 "seo":{"technical_on_page":[{"signal":"...","finding":"...","status":"Good|Needs Attention|Missing"}],"content_quality":[...],"structured_data":[...]},
 "geo":{"eeat":[...],"content_ai_synthesis":[...],"technical_geo":[...]},
 "aeo":{"featured_snippet":[...],"structured_answer_formats":[...],"voice_search":[...]},
 "priority_recommendations":[{"priority":"Critical|High|Medium|Quick Win","issue":"...","dimension":"SEO|GEO|AEO","effort":"Low|Medium|High","impact":"Low|Medium|High"}],
 "whats_working":[{"item":"...","evidence":"..."}]
}}`,
      `Audit ${siteUrl} (brand: ${brandName}).`,
      true,
    );
    apiCalls++;
    audit = extractJson<{ seo: number; geo: number; aeo: number; findings: unknown; pages_crawled: number }>(auditText);
    await supabase.from("seo_audit_scores").upsert({
      brand_id: brandId, week_of: weekOf,
      seo_score: audit.seo, geo_score: audit.geo, aeo_score: audit.aeo,
      findings: audit.findings, pages_crawled: audit.pages_crawled ?? 0,
    }, { onConflict: "brand_id,week_of" });
    } // end scanType !== "reddit" (site audit)

    // 3-5 (prompts, Reddit, recommendations) are skipped for a "quick" scan —
    // it's the site audit only, so it finishes in a fraction of the time.
    let category: string | undefined;
    if (scanType === "reddit") {
      // Standalone Reddit refresh: reuse whatever category this brand's tracked
      // prompts already settled on (if any) instead of running the full prompts
      // pipeline — keeps this mode fast and cheap.
      const { data: existingPrompts } = await supabase
        .from("aeo_prompts").select("product_service")
        .eq("brand_id", brandId).eq("is_active", true).limit(1);
      category = existingPrompts?.[0]?.product_service ?? undefined;
    }
    if (scanType === "full") {
    // 3. Tracked prompts → visibility + citations (Claude as the first engine).
    let { data: prompts } = await supabase
      .from("aeo_prompts")
      .select("id, prompt, product_service")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .limit(MAX_PROMPTS);

    // First scan for a brand: auto-generate 10 prompts tailored to its product category.
    if (!prompts?.length) {
      const genText = await claude(
        anthropicKey,
        `You generate AI-visibility tracking prompts. Given a brand and its website, infer its product category (e.g. steel bathtubs, shower doors, hot tubs, walk-in tubs) and write 10 questions a real buyer would ask an AI assistant. Mix: ~6 unbranded category questions ("best X brands", "which X for Y"), ~2 branded ("is ${brandName} good quality", "${brandName} vs <top competitor>"), ~2 dealer/purchase questions. Reply ONLY JSON: [{"prompt","product_service","icp","journey_phase":"Awareness|Consideration|Decision"}]`,
        `Brand: ${brandName}. Website: ${siteUrl}. Audit findings for context: ${JSON.stringify(audit.findings).slice(0, 800)}`,
      );
      apiCalls++;
      const generated = extractJson<Array<{ prompt: string; product_service?: string; icp?: string; journey_phase?: string }>>(genText);
      const rows = generated.slice(0, MAX_PROMPTS).map(g => ({
        brand_id: brandId,
        prompt: g.prompt,
        product_service: g.product_service ?? null,
        icp: g.icp ?? null,
        journey_phase: ["Awareness", "Consideration", "Decision"].includes(g.journey_phase ?? "") ? g.journey_phase : null,
      }));
      const { data: inserted } = await supabase
        .from("aeo_prompts")
        .upsert(rows, { onConflict: "brand_id,prompt", ignoreDuplicates: true })
        .select("id, prompt, product_service");
      prompts = inserted ?? [];
    }

    let mentions = 0;
    const domainFreq = new Map<string, { freq: number; brandMentioned: boolean }>();
    // All prompts run concurrently — the scan runs in the background, but faster is better.
    const results = await Promise.all((prompts ?? []).map(async (p) => {
      const answerRaw = await claude(
        anthropicKey,
        `Answer the user's question using web search, as a consumer AI assistant would. Then append a JSON block: {"brand_mentioned": bool (is "${brandName}" in your answer), "competitors_mentioned": string[], "cited_urls": [{"url": "...", "domain": "..."}]}`,
        p.prompt,
        true,
      );
      apiCalls++;
      let meta = { brand_mentioned: false, competitors_mentioned: [] as string[], cited_urls: [] as { url: string; domain: string }[] };
      try { meta = { ...meta, ...extractJson(answerRaw) }; } catch { /* keep defaults */ }
      await supabase.from("aeo_prompt_results").upsert({
        prompt_id: p.id, brand_id: brandId, week_of: weekOf, engine: "claude",
        answer_text: answerRaw.slice(0, 8000),
        brand_mentioned: meta.brand_mentioned,
        competitors_mentioned: meta.competitors_mentioned,
        cited_urls: meta.cited_urls,
      }, { onConflict: "prompt_id,week_of,engine" });
      return meta;
    }));
    for (const meta of results) {
      if (meta.brand_mentioned) mentions++;
      for (const c of meta.cited_urls) {
        const e = domainFreq.get(c.domain) ?? { freq: 0, brandMentioned: false };
        e.freq++;
        e.brandMentioned ||= meta.brand_mentioned;
        domainFreq.set(c.domain, e);
      }
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
    category = prompts?.[0]?.product_service ?? category;
    } // end scanType === "full" (prompts + citations)

    // 4. Reddit visibility — real threads via Apify (residential proxies, real URLs,
    // real upvote/comment counts), then Claude classifies sentiment/opportunity AND
    // drafts a suggested reply + keywords for anything worth engaging with (classification
    // can't invent new URLs — it just labels/replies to the real ones). Runs for both
    // "full" and standalone "reddit" scans.
    if (scanType === "full" || scanType === "reddit") {
    try {
      const redditPosts = await searchRedditViaApify(brandName, category);
      if (redditPosts.length) {
        const classifyText = await claude(
          anthropicKey,
          `For each real Reddit thread below (title + URL, already verified — do not alter URLs), classify it for a brand's marketing team. Reply ONLY JSON array, SAME ORDER as input: [{"brand_mentioned":bool,"competitors_mentioned":["..."],"sentiment":"Positive|Neutral|Negative","opportunity":"HIGH|MED — amplify|MED — support|LOW","suggested_reply":"..."|null,"keywords":["...","..."]|null}]. brand_mentioned = does the title/context suggest "${brandName}" is discussed. opportunity = HIGH if it's a buying-advice thread where the brand should be recommended but isn't mentioned; MED — amplify if a positive brand mention; MED — support if a complaint/issue about the brand; LOW otherwise. For any thread NOT scored LOW, also draft suggested_reply: a genuinely helpful, non-promotional, Reddit-norms-appropriate reply (2-4 sentences) a real person from the brand could post — answer the actual question first, mention the brand naturally only where relevant, never sound like an ad; and keywords: 3-6 short phrases describing what the thread is about. For LOW-opportunity threads set both to null.`,
          `Brand: ${brandName}. Threads:\n${redditPosts.map((p, i) => `${i + 1}. [r/${p.subreddit}] "${p.title}"`).join("\n")}`,
        );
        apiCalls++;
        let classifications: Array<{ brand_mentioned?: boolean; competitors_mentioned?: string[]; sentiment?: string; opportunity?: string; suggested_reply?: string | null; keywords?: string[] | null }> = [];
        try { classifications = extractJson(classifyText); } catch { /* defaults below */ }

        for (let i = 0; i < redditPosts.length; i++) {
          const p = redditPosts[i];
          const cl = classifications[i] ?? {};
          await supabase.from("reddit_threads").upsert({
            brand_id: brandId, week_of: weekOf,
            thread_url: p.thread_url,
            subreddit: p.subreddit.startsWith("r/") ? p.subreddit : `r/${p.subreddit}`,
            title: p.title,
            upvotes: p.upvotes,
            num_comments: p.num_comments,
            posted_at: p.posted_at,
            brand_mentioned: cl.brand_mentioned ?? false,
            competitors_mentioned: cl.competitors_mentioned ?? [],
            sentiment: ["Positive", "Neutral", "Negative"].includes(cl.sentiment ?? "") ? cl.sentiment : "Neutral",
            opportunity: ["HIGH", "MED — amplify", "MED — support", "LOW"].includes(cl.opportunity ?? "") ? cl.opportunity : null,
            suggested_reply: cl.suggested_reply ?? null,
            keywords: cl.keywords ?? null,
          }, { onConflict: "brand_id,week_of,thread_url" });
        }
      }
    } catch (e) {
      console.error("Reddit step failed:", e);
    }
    } // end Reddit step

    // 5. Recommendations. Full scans fold in citation data; a standalone Reddit
    // scan generates a focused batch of 5-8 concrete Reddit engagement ideas only.
    if (scanType === "full") {
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
    } else if (scanType === "reddit") {
      const recsText = await claude(
        anthropicKey,
        `You generate Reddit engagement ideas for a brand's marketing team. Brainstorm 5-8 real, specific opportunities for this brand's product category — buying-advice threads to seed, complaint threads to address, comparison/review threads to correct misinformation in, subreddits to monitor. Titles must be concrete and actionable (e.g. "Answer 'best hot tub under $X' threads in r/hottubs with steel-frame differentiators"), not generic. Reply ONLY JSON array: [{"title","priority":"HIGH|MED|LOW"}]`,
        `Brand: ${brandName}${category ? `. Product category: ${category}` : ""}. Website: ${siteUrl}.`,
      );
      apiCalls++;
      try {
        const recs = extractJson<Array<{ title: string; priority: string }>>(recsText);
        for (const r of recs) {
          await supabase.from("aeo_recommendations").upsert({
            brand_id: brandId, title: r.title, rec_type: "Reddit engagement",
            channel: "Reddit", priority: r.priority, source_week: weekOf,
          }, { onConflict: "brand_id,title", ignoreDuplicates: true });
        }
      } catch { /* recommendations are best-effort */ }
    } // end recommendations

    // 6. If this brand has a HubSpot landing page configured, publish the Reddit
    // table + weekly PDF archive automatically — no separate manual step needed.
    // Hard-timeout so a slow/hung publish call can never block the scan from
    // reaching "completed" (this is what caused an earlier stuck run).
    if (landingPageId && scanType === "full") {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 60_000);
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/reddit-publish`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({
            brandId, brandName, landingPageId, weekOf,
            introFind: "Territory Sales Manager", tableFind: "Gary Bruch",
          }),
          signal: ac.signal,
        });
        clearTimeout(timer);
      } catch (e) {
        console.error("Auto-publish to HubSpot failed (scan still completes):", e);
      }
    }

    await supabase.from("aeo_scan_log").update({
      status: "completed", api_calls_used: apiCalls, finished_at: new Date().toISOString(),
    }).eq("id", scanId);
  } catch (err) {
    await supabase.from("aeo_scan_log").update({
      status: "failed", api_calls_used: apiCalls, error: String(err), finished_at: new Date().toISOString(),
    }).eq("id", scanId);
  }
  };

  // The platform kills request-tied work at ~150s; the scan takes longer.
  // Respond immediately and finish in the background — the UI polls aeo_scan_log.
  // @ts-ignore EdgeRuntime is provided by the Supabase Edge runtime
  EdgeRuntime.waitUntil(runScan());

  return new Response(JSON.stringify({ ok: true, started: true, scanId, weekOf }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
