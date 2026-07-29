# Reddit-Only Research Routine (standalone — no Anthropic API billing involved)

Paste this into Claude Desktop's "What do you want automated?" box to research Reddit for
ONE brand at a time, independent of the full SEO/AEO/GEO audit. This uses your own Claude
Desktop access (via the Supabase MCP connector) — it does NOT touch the app's billed
Anthropic API key, so it works even while that key is out of credits.

Before running, fill in the brand details below (find them in `src/lib/brands.ts` in the repo):

- `{brand_id}`: e.g. `vita-spa`
- `{brand_name}`: e.g. `Vita Spa`
- `{product_category}`: infer from the brand's site if unsure, e.g. `hot tubs`
- `{week_of}`: the Monday of the current week, `YYYY-MM-DD`

---

Using the Supabase MCP connector against project ref `ffxhonryhaadyudpopvv`:

1. Use WebSearch (NOT a fabricated URL) with queries like `site:reddit.com {brand_name}`,
   `site:reddit.com {product_category} recommendations`, and
   `site:reddit.com best {product_category} brands` to find 5-15 REAL, currently-indexed
   Reddit threads relevant to `{brand_name}`'s product category. For each real thread found,
   capture:
   - `thread_url` (the actual reddit.com URL from search results — never invent one)
   - `subreddit`, `title` (as they appear in the thread)
   - `upvotes`/`num_comments` if visible in the search snippet, else 0 (never guess a number)
   - `brand_mentioned` (true if `{brand_name}` appears in the title/snippet)
   - `sentiment`: "Positive"|"Neutral"|"Negative" — how the brand (or category, if unmentioned)
     is discussed
   - `opportunity`: "HIGH" (buying-advice thread where this brand should be recommended but
     isn't), "MED — amplify" (positive brand mention worth boosting), "MED — support"
     (complaint/issue about the brand worth responding to), or "LOW" (general discussion, low
     relevance)

2. For any thread scored `opportunity` = "HIGH" or "MED — amplify" or "MED — support" (i.e.
   every level except "LOW"), also draft, matching HubSpot's own AEO recommendation format:
   - `suggested_reply`: a genuinely helpful, non-promotional, Reddit-norms-appropriate reply
     (2-4 sentences) a real person from the brand could post — answer the actual question
     first, mention the brand naturally only where relevant, never sound like an ad.
   - `primary_keyword`: the single main search phrase this thread is most relevant to (e.g.
     "modern whirlpool hot tub brands") — one phrase, not a list.
   - `secondary_keywords`: 3-6 related phrases (brand terms, product category terms,
     buyer-intent phrases) describing what the thread is about.
   Set `suggested_reply`, `primary_keyword`, and `secondary_keywords` all to NULL for "LOW"
   opportunity threads.

3. Write each thread via the Supabase MCP connector:
   INSERT INTO reddit_threads (brand_id, week_of, thread_url, subreddit, title, upvotes, num_comments, brand_mentioned, sentiment, opportunity, suggested_reply, primary_keyword, secondary_keywords, discovery_source)
   VALUES ('{brand_id}', '{week_of}', '{thread_url}', '{subreddit}', '{title}', {upvotes}, {num_comments}, {brand_mentioned}, '{sentiment}', '{opportunity}', {suggested_reply_or_NULL}, {primary_keyword_or_NULL}, {secondary_keywords_array_or_NULL}, 'search')
   ON CONFLICT (brand_id, week_of, thread_url) DO NOTHING;

   If WebSearch finds nothing relevant, leave `reddit_threads` empty for this week rather than
   inventing threads — the dashboard already handles an empty result gracefully.

4. (Optional but recommended) Also log the scan so the dashboard's "Last scanned" timestamp
   and scan-limit counter reflect this run:
   INSERT INTO aeo_scan_log (brand_id, week_of, status, scan_type, page_scope, api_calls_used, started_at, finished_at)
   VALUES ('{brand_id}', '{week_of}', 'completed', 'reddit', 'multi', 0, now(), now());

5. When done, report: how many real threads were found, how many scored HIGH/MED-amplify/
   MED-support vs LOW, and whether anything looked ambiguous or worth a second look.

---

## After this runs

The results are now in `reddit_threads` for `{brand_id}` / `{week_of}`. To also push them to
the brand's HubSpot landing page (if it has one — check `redditLandingPageId` in
`src/lib/brands.ts`), ask Claude Code to trigger the `reddit-publish` Edge Function — that step
only calls the HubSpot API, no Anthropic/Claude involved, so it works regardless of API credits.
