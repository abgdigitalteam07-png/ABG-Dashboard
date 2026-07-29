-- Matches HubSpot's own AEO recommendation panel layout (Primary keyword /
-- Secondary keywords), replacing the flat `keywords` list the dashboard used
-- before. `keywords` is left in place (unused going forward) rather than
-- dropped, since older rows still carry data in it.
ALTER TABLE public.reddit_threads
  ADD COLUMN primary_keyword text,
  ADD COLUMN secondary_keywords text[];
