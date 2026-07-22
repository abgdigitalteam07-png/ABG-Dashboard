# SEO/AEO/GEO Audit Routine — Group 1 (reads its brand list from Supabase)

Paste this into Claude Desktop's "What do you want automated?" box for **Group 1**.

The brand list is no longer hardcoded here — it lives in the `aeo_routine_groups` table in
Supabase, editable anytime via **Supabase Studio → Table Editor → aeo_routine_groups**
(https://supabase.com/dashboard/project/ffxhonryhaadyudpopvv/editor). To add/remove a brand
from Group 1, or create Group 2/3, just edit that table's `brands` JSON column or add a new
row — no need to touch this prompt or re-paste anything into Claude Desktop.

---

Using the Supabase MCP connector against project ref `ffxhonryhaadyudpopvv`:

1. Run: `SELECT brands, scan_type, page_scope FROM aeo_routine_groups WHERE group_name = 'group_1';`
   Use the `brands` array (each item has `id`, `name`, `site_url`) as your worklist for this run.

2. For EACH brand in that array, run a full SEO/GEO/AEO site audit following the seo-geo-aeo
   skill's methodology (SEO/GEO/AEO scoring 1-10, technical on-page / content quality /
   structured data / E-E-A-T / content-for-AI-synthesis / technical-GEO / featured-snippet /
   structured-answer-formats / voice-search signals, priority recommendations, what's working).
   Use the `page_scope` value from the group row: `homepage` = Quick Audit (homepage + up to 6
   high-signal pages), `multi` = Full Audit (uncapped crawl, skip only Privacy/Terms/login/
   thank-you pages).

   Do not claim to assess Core Web Vitals, page speed, backlink profiles, or JavaScript-rendered
   content from a plain web-search fetch — note that limitation instead of guessing.

   **If you hit a usage/rate limit partway through:** stop cleanly right there — do not keep
   retrying. Report exactly which brands completed and which didn't, so the rest can run next
   session instead of losing all progress.

3. Produce a result per brand matching this exact JSON shape:
   {"seo":n,"geo":n,"aeo":n,"pages_crawled":n,
    "findings":{
      "executive_summary":"3-5 sentence summary",
      "pages_audited":[{"url":"...","page_type":"...","notes":"..."}],
      "seo":{"technical_on_page":[{"signal":"...","finding":"...","status":"Good|Needs Attention|Missing"}],"content_quality":[...],"structured_data":[...]},
      "geo":{"eeat":[...],"content_ai_synthesis":[...],"technical_geo":[...]},
      "aeo":{"featured_snippet":[...],"structured_answer_formats":[...],"voice_search":[...]},
      "priority_recommendations":[{"priority":"Critical|High|Medium|Quick Win","issue":"...","dimension":"SEO|GEO|AEO","effort":"Low|Medium|High","impact":"Low|Medium|High"}],
      "whats_working":[{"item":"...","evidence":"..."}]
    }}

4. Write it back via the Supabase MCP connector (substitute `{brand_id}` from the group's
   `brands` array, `{week_of}` = the Monday of the current week in YYYY-MM-DD, `{scan_type}`/
   `{page_scope}` from the group row, and the JSON result from step 3):

   INSERT INTO seo_audit_scores (brand_id, week_of, seo_score, geo_score, aeo_score, findings, pages_crawled)
   VALUES ('{brand_id}', '{week_of}', {seo}, {geo}, {aeo}, '{findings_json}'::jsonb, {pages_crawled})
   ON CONFLICT (brand_id, week_of) DO UPDATE SET
     seo_score = EXCLUDED.seo_score, geo_score = EXCLUDED.geo_score, aeo_score = EXCLUDED.aeo_score,
     findings = EXCLUDED.findings, pages_crawled = EXCLUDED.pages_crawled;

   INSERT INTO aeo_scan_log (brand_id, week_of, status, scan_type, page_scope, api_calls_used, started_at, finished_at)
   VALUES ('{brand_id}', '{week_of}', 'completed', '{scan_type}', '{page_scope}', 0, now(), now());

5. Reddit research — for each brand, use WebSearch (NOT a fabricated URL) with queries like
   `site:reddit.com {brand_name}`, `site:reddit.com {product category} recommendations`, and
   `site:reddit.com best {product category} brands` to find 5-15 REAL, currently-indexed Reddit
   threads relevant to the brand's product category (hot tubs, bathtubs, shower doors, etc. —
   infer from the brand/site). For each real thread found, capture:
   - `thread_url` (the actual reddit.com URL from search results — never invent one)
   - `subreddit`, `title` (as they appear in the thread)
   - `upvotes`/`num_comments` if visible in the search snippet, else 0 (never guess a number)
   - `brand_mentioned` (true if the brand name appears in the title/snippet)
   - `sentiment`: "Positive"|"Neutral"|"Negative" — how the brand (or category, if unmentioned) is discussed
   - `opportunity`: "HIGH" (buying-advice thread where this brand should be recommended but isn't),
     "MED — amplify" (positive brand mention worth boosting), "MED — support" (complaint/issue
     about the brand worth responding to), or "LOW" (general discussion, low relevance)

   Write each one via the Supabase MCP connector:
   INSERT INTO reddit_threads (brand_id, week_of, thread_url, subreddit, title, upvotes, num_comments, brand_mentioned, sentiment, opportunity)
   VALUES ('{brand_id}', '{week_of}', '{thread_url}', '{subreddit}', '{title}', {upvotes}, {num_comments}, {brand_mentioned}, '{sentiment}', '{opportunity}')
   ON CONFLICT (brand_id, week_of, thread_url) DO NOTHING;

   If WebSearch finds nothing relevant for a brand, leave its reddit_threads empty for this week
   rather than inventing threads — the dashboard already handles an empty result gracefully.

6. Move to the next brand. If a brand's site doesn't load or the domain looks wrong, skip it and
   report which ones you skipped at the end — don't guess a domain.

When done, report a summary: how many brands completed, how many skipped and why, and how many
real Reddit threads were found per brand.

---

## Creating Group 2+

Insert a new row into `aeo_routine_groups` via Supabase Studio's table editor:
- `group_name`: e.g. `group_2`
- `brands`: JSON array of `{"id","name","site_url"}` for that batch
- `scan_type` / `page_scope`: defaults to `routine` / `multi` (Full Audit) if left blank

Then create a second Claude Desktop Routine with this same prompt, just changing
`group_name = 'group_1'` to `group_name = 'group_2'` in step 1.

Brands not yet assigned to any group: abg-home-services, abg-hospitality, accessible-home-store,
aker, amazing-shower-door, american-bath-group, aquarius, aquatic, briggs-bath, clarion,
coastal-shower-doors, comfort-designs, dreamline, florestone, hamilton, imi, laurel-mountain,
maax, maidstone, neptune, rbs, vintage-ca, maax-sauna, california-cooperage.
