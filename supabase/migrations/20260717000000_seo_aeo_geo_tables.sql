-- SEO / AEO / GEO admin tab — weekly snapshot storage.
-- All tables are written by Edge Functions (service role, bypasses RLS)
-- and read only by admins via public.is_admin().
-- Snapshots are keyed by (brand_id, week_of); week_of is the Monday of the scan week.

-- 1. Tracked prompts (max 10 active per brand, enforced in the Edge Function)
CREATE TABLE public.aeo_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  prompt text NOT NULL,
  prompt_group text,
  product_service text,
  icp text,
  journey_phase text CHECK (journey_phase IN ('Awareness','Consideration','Decision')),
  location text DEFAULT 'United States',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, prompt)
);

-- 2. Weekly prompt × engine results
CREATE TABLE public.aeo_prompt_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id uuid NOT NULL REFERENCES public.aeo_prompts(id) ON DELETE CASCADE,
  brand_id text NOT NULL,
  week_of date NOT NULL,
  engine text NOT NULL CHECK (engine IN ('chatgpt','gemini','perplexity','claude')),
  answer_text text,
  brand_mentioned boolean NOT NULL DEFAULT false,
  competitors_mentioned text[] NOT NULL DEFAULT '{}',
  cited_urls jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prompt_id, week_of, engine)
);

-- 3. Weekly brand + competitor visibility per engine
CREATE TABLE public.aeo_visibility_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  week_of date NOT NULL,
  company text NOT NULL,             -- brand itself or a competitor name
  is_own_brand boolean NOT NULL DEFAULT false,
  engine text,                       -- null = all engines combined
  visibility_pct numeric(5,2) NOT NULL DEFAULT 0,
  share_of_voice_pct numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, week_of, company, engine)
);

-- 4. Weekly citation records (domains + URLs)
CREATE TABLE public.aeo_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  week_of date NOT NULL,
  domain text NOT NULL,
  url text,                          -- null = domain-level aggregate row
  channel_type text CHECK (channel_type IN ('Affiliate','Competitor','Earned','Peer','Review Site','UGC','Owned')),
  content_type text CHECK (content_type IN ('Blog','Comparison','Documentation','Educational','Guide','Homepage','Listicle','How-to','User Review','Other')),
  frequency int NOT NULL DEFAULT 0,
  brand_mentioned boolean NOT NULL DEFAULT false,
  competitors_mentioned text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Recommendations (statuses persist across scans)
CREATE TABLE public.aeo_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  title text NOT NULL,
  rec_type text NOT NULL CHECK (rec_type IN ('Net new content','Social amplification','Outreach','Technical fix','Reddit engagement')),
  content_type text,
  channel text,
  priority text NOT NULL DEFAULT 'MED' CHECK (priority IN ('HIGH','MED','LOW')),
  status text NOT NULL DEFAULT 'New' CHECK (status IN ('New','Not started','In progress','Completed')),
  assignee uuid REFERENCES auth.users(id),
  source_week date,                  -- week_of of the scan that generated it
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, title)
);

-- 6. Weekly SEO/GEO/AEO audit scores (skill rubric output)
CREATE TABLE public.seo_audit_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  week_of date NOT NULL,
  seo_score numeric(3,1) CHECK (seo_score BETWEEN 0 AND 10),
  geo_score numeric(3,1) CHECK (geo_score BETWEEN 0 AND 10),
  aeo_score numeric(3,1) CHECK (aeo_score BETWEEN 0 AND 10),
  findings jsonb NOT NULL DEFAULT '{}',   -- full signal-by-signal rubric output
  pages_crawled int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, week_of)
);

-- 7. Reddit threads (feeds the weekly dealer email)
CREATE TABLE public.reddit_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  week_of date NOT NULL,
  thread_url text NOT NULL,
  subreddit text NOT NULL,
  title text NOT NULL,
  upvotes int NOT NULL DEFAULT 0,
  num_comments int NOT NULL DEFAULT 0,
  posted_at timestamptz,
  brand_mentioned boolean NOT NULL DEFAULT false,
  competitors_mentioned text[] NOT NULL DEFAULT '{}',
  sentiment text CHECK (sentiment IN ('Positive','Neutral','Negative')),
  cited_by_ai_count int NOT NULL DEFAULT 0,
  opportunity text CHECK (opportunity IN ('HIGH','MED — amplify','MED — support','LOW')),
  included_in_dealer_email boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, week_of, thread_url)
);

-- Scan log: one row per Scan run (drives "last scanned" + API limit guard)
CREATE TABLE public.aeo_scan_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  week_of date NOT NULL,
  triggered_by uuid REFERENCES auth.users(id),  -- null = weekly cron
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  api_calls_used int NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- Indexes for the week-selector read pattern
CREATE INDEX idx_aeo_prompt_results_brand_week ON public.aeo_prompt_results (brand_id, week_of);
CREATE INDEX idx_aeo_visibility_brand_week ON public.aeo_visibility_snapshots (brand_id, week_of);
CREATE INDEX idx_aeo_citations_brand_week ON public.aeo_citations (brand_id, week_of);
CREATE INDEX idx_aeo_recommendations_brand ON public.aeo_recommendations (brand_id, status);
CREATE INDEX idx_reddit_threads_brand_week ON public.reddit_threads (brand_id, week_of);
CREATE INDEX idx_aeo_scan_log_brand ON public.aeo_scan_log (brand_id, started_at DESC);

-- RLS: admin-only on every table (Edge Functions use the service role and bypass RLS)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'aeo_prompts','aeo_prompt_results','aeo_visibility_snapshots','aeo_citations',
    'aeo_recommendations','seo_audit_scores','reddit_threads','aeo_scan_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "admin_all_%s" ON public.%I FOR ALL TO authenticated
         USING (public.is_admin(auth.uid()))
         WITH CHECK (public.is_admin(auth.uid()))', t, t);
  END LOOP;
END $$;
