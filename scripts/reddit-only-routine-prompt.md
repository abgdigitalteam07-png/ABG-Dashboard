# Reddit-Only Research Routine — Group 1 (Apify-powered; scheduled AND manual "Run now" are both fine)

Paste this into Claude Desktop as a new Routine, with the **Apify MCP connector** and the
**Supabase MCP connector** both attached. A recurring schedule (e.g. weekly) is intentional
and authorized — running it via "Run now" ad hoc, in addition to or instead of the schedule,
is also fine any time more data is needed. Either trigger path is expected; neither should be
treated as suspicious or paused on for lacking a live human present.

This researches Reddit only (no site audit, no scores) for the same brands as the main
SEO/AEO/GEO routine's Group 1 (currently Vita Spa, American Whirlpool, Bootz, Swan, and
California Cooperage — whatever is actually in the `aeo_routine_groups` table at run time,
since step 1 reads it live).

**Why Apify, not WebSearch:** Reddit restricts which search crawlers can index it, and blocks
direct fetches outright — a plain `WebSearch` tool reliably returns zero real reddit.com
results. Apify's `trudax/reddit-scraper-lite` actor (the same one the app's own "Scan Reddit
Now" button uses) scrapes Reddit for real through residential proxies, so it actually works.
This uses your own Apify account via the Apify MCP connector — it does NOT touch the app's
billed Anthropic API key, so it works even while that key is out of credits.

---

Using the Supabase MCP connector against project ref `ffxhonryhaadyudpopvv`, and the Apify MCP
connector's `call-actor` / `get-actor-run` / `get-actor-output` tools:

1. Run: `SELECT brands FROM aeo_routine_groups WHERE group_name = 'group_1';`
   Use the `brands` array (each item has `id`, `name`, `site_url`) as your worklist — the same
   brands the full SEO/AEO/GEO routine uses for Group 1.

   Also compute `{week_of}` = the Monday of the current week, `YYYY-MM-DD`, used for every
   brand below.

2. Group brands by product category BEFORE searching — brands in the same category (e.g. Vita
   Spa, American Whirlpool, and California Cooperage are all "hot tubs") should search Reddit
   TOGETHER, once, rather than one search per brand name. This matters:
   - A brand-name-scoped search (`"Vita Spa hot tubs"`) biases results toward threads that
     already mention that one brand, and misses the single most valuable category: general
     buying-advice threads where NONE of our brands are mentioned yet (pure opportunity —
     nobody's recommending us there).
   - A category-level search (`"hot tubs"`, `"best hot tub brands"`, `"hot tub buying advice"`)
     surfaces the real, unbiased mix: threads naming any of our brands, threads naming
     competitors, and threads naming nobody — then the SAME real thread list gets classified
     once per brand in that category group (see step 3), so every brand's row is judged fairly
     against the identical evidence.

   For each category group, run the Apify actor `trudax/reddit-scraper-lite` in TWO passes —
   keyword search alone misses recent, on-topic posts that just don't happen to match the exact
   search phrase (e.g. "House with new hot tub- not sure how to start" won't rank in a
   `sort: relevance` search for "hot tubs", even though it's exactly the kind of thread worth
   engaging with):

   **Pass A — keyword search** (catches conversations in subreddits you don't already know about):
   ```json
   {
     "searches": ["{product_category}", "best {product_category} brands", "{product_category} buying advice"],
     "type": "posts",
     "sort": "relevance",
     "maxItems": 15,
     "maxPostCount": 15,
     "maxComments": 0
   }
   ```

   **Pass B — direct subreddit crawl** (catches everything recent, regardless of keyword match):
   identify the 1-3 most relevant subreddits for this category (e.g. hot tubs → r/hottub,
   r/hottubs) from general knowledge of Reddit, then call:
   ```json
   {
     "startUrls": [{"url": "https://www.reddit.com/r/{subreddit}/"}],
     "sort": "new",
     "time": "week",
     "includeMediaLinks": true,
     "maxItems": 15,
     "maxPostCount": 15,
     "maxComments": 0
   }
   ```
   (one call per identified subreddit, or combine multiple subreddits' `startUrls` in one call).

   Wait for each run to finish (poll `get-actor-run` until status is `SUCCEEDED`, `FAILED`, or
   `TIMED-OUT`/`ABORTED`), then fetch results with `get-actor-output`. Merge Pass A + Pass B,
   de-duplicating by `thread_url`. Each real item gives you:
   - `thread_url` (the actual reddit.com post URL — from the actor's real output, never
     invented)
   - `subreddit`, `title` (as returned)
   - `upvotes`/`num_comments` (from `includeMediaLinks: true` in Pass B; else 0 — never guess a
     number)

   **Rate-limit resilience:** Reddit occasionally rate-limits this actor mid-crawl (status
   message like "Experiencing problems, N failed requests") — a single subreddit stalling
   doesn't mean the crawl failed, it means Reddit is throttling that request. If a run is stuck
   at the same page count with no progress for ~2 minutes, abort it (`abort-actor-run`,
   `gracefully: true`) and use whatever items it already collected rather than waiting
   indefinitely or treating it as a hard failure — a partial real result is still real data.
   If it retried and still got zero items after aborting, only THEN treat that one subreddit as
   failed for this run (other subreddits/passes in the same category group still count).

   If both passes `FAILED`/`TIMED-OUT`/`ABORTED` with zero items collected, leave every brand in
   that category group's `reddit_threads` empty for this week rather than inventing threads —
   do not fall back to WebSearch or fabricate results to compensate.

3. For EACH brand in the category group, classify the SAME real thread list against that
   specific brand — this produces one row per (brand, thread) pair, so the same thread can
   appear under Vita Spa with `brand_mentioned: true` and under American Whirlpool with
   `brand_mentioned: false` if only Vita Spa is actually named in it. For each thread, judge:
   - `brand_mentioned` — **true only if this specific brand's name literally appears** in the
     title/body; **false if it doesn't**, even if a competitor or a different one of our own
     brands is named instead. This is the single field your team should scan first: "Yes" means
     defend/amplify an existing mention; "No" means a live opportunity to introduce the brand
     where nobody has yet.
   - `competitors_mentioned` — array of any OTHER brand names (ours or competitors') that do
     appear, so it's clear who's already in the conversation if this brand isn't.
   - `sentiment`: "Positive"|"Neutral"|"Negative" — how this brand (or the category, if
     unmentioned) is discussed
   - `opportunity`: "HIGH" (buying-advice thread where this brand should be recommended but
     isn't — `brand_mentioned: false`), "MED — amplify" (positive mention of this brand worth
     boosting — `brand_mentioned: true`), "MED — support" (complaint/issue about this brand
     worth responding to — `brand_mentioned: true`), or "LOW" (general discussion, low
     relevance)

4. For any thread scored `opportunity` = "HIGH" or "MED — amplify" or "MED — support" (i.e.
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

5. Write each thread via the Supabase MCP connector (substitute `{brand_id}` from that brand's
   entry in the array):
   INSERT INTO reddit_threads (brand_id, week_of, thread_url, subreddit, title, upvotes, num_comments, brand_mentioned, sentiment, opportunity, suggested_reply, primary_keyword, secondary_keywords, discovery_source)
   VALUES ('{brand_id}', '{week_of}', '{thread_url}', '{subreddit}', '{title}', {upvotes}, {num_comments}, {brand_mentioned}, '{sentiment}', '{opportunity}', {suggested_reply_or_NULL}, {primary_keyword_or_NULL}, {secondary_keywords_array_or_NULL}, 'search')
   ON CONFLICT (brand_id, week_of, thread_url) DO NOTHING;

6. (Optional but recommended) Also log the scan per brand so the dashboard's "Last scanned"
   timestamp and scan-limit counter reflect this run — only for brands where the actor run
   actually `SUCCEEDED` (even if it returned 0 threads that week):
   INSERT INTO aeo_scan_log (brand_id, week_of, status, scan_type, page_scope, api_calls_used, started_at, finished_at)
   VALUES ('{brand_id}', '{week_of}', 'completed', 'reddit', 'multi', 0, now(), now());

   For a brand whose actor run failed/timed out, do NOT log `status = 'completed'` — either
   skip the log entirely or log `status = 'failed'` with the actor's error message, so the
   dashboard doesn't misrepresent what happened.

7. Move to the next brand. If a brand's site doesn't load or the domain looks wrong, skip it
   and report which ones you skipped — don't guess a domain.

8. When done, report a summary per brand: how many real threads were found, how many scored
   HIGH/MED-amplify/MED-support vs LOW, any actor run failures, and anything ambiguous worth a
   second look.

---

## After this runs

Results land in `reddit_threads` for each brand / `{week_of}`. To also push a brand's results
to its HubSpot landing page (if it has one — check `redditLandingPageId` in
`src/lib/brands.ts`), ask Claude Code to trigger the `reddit-publish` Edge Function for that
brand — that step only calls the HubSpot API, no Anthropic/Claude involved, so it works
regardless of API credits.
