-- Supports the per-thread detail view (suggested reply + keywords), matching
-- the depth of HubSpot's own AEO Reddit recommendations. Populated by the
-- Routine's Reddit research step when it finds a HIGH/MED-opportunity thread —
-- left null otherwise (never fabricated client-side).
ALTER TABLE public.reddit_threads
  ADD COLUMN suggested_reply text,
  ADD COLUMN keywords text[];
