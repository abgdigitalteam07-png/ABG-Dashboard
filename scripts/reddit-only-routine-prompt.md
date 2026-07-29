# Reddit-Only Research Routine — Group 1 (standalone; scheduled AND manual "Run now" are both fine)

Paste this into Claude Desktop as a new Routine. A recurring schedule (e.g. weekly) is
intentional and authorized — running it via "Run now" ad hoc, in addition to or instead of
the schedule, is also fine any time more data is needed. Either trigger path is expected;
neither should be treated as suspicious or paused on for lacking a live human present. This
researches Reddit only (no site audit, no scores) for the same brands as the main SEO/AEO/GEO
routine's Group 1 (currently Vita Spa, American Whirlpool, Bootz, Swan, and California
Cooperage — whatever is actually in the `aeo_routine_groups` table at run time, since step 1
reads it live).

This uses your own Claude Desktop access via the Supabase MCP connector — it does NOT touch
the app's billed Anthropic API key, so it works even while that key is out of credits.

---

Using the Supabase MCP connector against project ref `ffxhonryhaadyudpopvv`:

1. Run: `SELECT brands FROM aeo_routine_groups WHERE group_name = 'group_1';`
   Use the `brands` array (each item has `id`, `name`, `site_url`) as your worklist — the same
   brands the full SEO/AEO/GEO routine uses for Group 1.

   Also compute `{week_of}` = the Monday of the current week, `YYYY-MM-DD`, used for every
   brand below.

2. For EACH brand in that array: use WebSearch (NOT a fabricated URL) with queries like
   `site:reddit.com {brand_name}`, `site:reddit.com {product_category} recommendations`, and
   `site:reddit.com best {product_category} brands` (infer `{product_category}` from the
   brand's site if unsure, e.g. hot tubs, bathtubs, shower doors) to find 5-15 REAL,
   currently-indexed Reddit threads relevant to that brand's category. For each real thread
   found, capture:
   - `thread_url` (the actual reddit.com URL from search results — never invent one)
   - `subreddit`, `title` (as they appear in the thread)
   - `upvotes`/`num_comments` if visible in the search snippet, else 0 (never guess a number)
   - `brand_mentioned` (true if the brand name appears in the title/snippet)
   - `sentiment`: "Positive"|"Neutral"|"Negative" — how the brand (or category, if unmentioned)
     is discussed
   - `opportunity`: "HIGH" (buying-advice thread where this brand should be recommended but
     isn't), "MED — amplify" (positive brand mention worth boosting), "MED — support"
     (complaint/issue about the brand worth responding to), or "LOW" (general discussion, low
     relevance)

3. For any thread scored `opportunity` = "HIGH" or "MED — amplify" or "MED — support" (i.e.
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

4. Write each thread via the Supabase MCP connector (substitute `{brand_id}` from that brand's
   entry in the array):
   INSERT INTO reddit_threads (brand_id, week_of, thread_url, subreddit, title, upvotes, num_comments, brand_mentioned, sentiment, opportunity, suggested_reply, primary_keyword, secondary_keywords, discovery_source)
   VALUES ('{brand_id}', '{week_of}', '{thread_url}', '{subreddit}', '{title}', {upvotes}, {num_comments}, {brand_mentioned}, '{sentiment}', '{opportunity}', {suggested_reply_or_NULL}, {primary_keyword_or_NULL}, {secondary_keywords_array_or_NULL}, 'search')
   ON CONFLICT (brand_id, week_of, thread_url) DO NOTHING;

   If WebSearch finds nothing relevant for a brand, leave its `reddit_threads` empty for this
   week rather than inventing threads — the dashboard already handles an empty result
   gracefully.

5. (Optional but recommended) Also log the scan per brand so the dashboard's "Last scanned"
   timestamp and scan-limit counter reflect this run:
   INSERT INTO aeo_scan_log (brand_id, week_of, status, scan_type, page_scope, api_calls_used, started_at, finished_at)
   VALUES ('{brand_id}', '{week_of}', 'completed', 'reddit', 'multi', 0, now(), now());

6. Move to the next brand. If a brand's site doesn't load or the domain looks wrong, skip it
   and report which ones you skipped — don't guess a domain.

7. When done, report a summary per brand: how many real threads were found, how many scored
   HIGH/MED-amplify/MED-support vs LOW, and anything ambiguous worth a second look.

---

## After this runs

Results land in `reddit_threads` for each brand / `{week_of}`. To also push a brand's results
to its HubSpot landing page (if it has one — check `redditLandingPageId` in
`src/lib/brands.ts`), ask Claude Code to trigger the `reddit-publish` Edge Function for that
brand — that step only calls the HubSpot API, no Anthropic/Claude involved, so it works
regardless of API credits.
