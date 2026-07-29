-- Moves Reddit thread discovery closer to HubSpot AEO's real methodology:
-- HubSpot surfaces Reddit threads that AI engines actually CITED when
-- answering tracked prompts (proven AEO relevance), not just a keyword
-- search of Reddit. discovery_source records which path found each thread:
-- 'citation' = pulled from a real web_search_tool_result citation while
-- answering a tracked prompt (highest-confidence signal); 'search' = found
-- via the Apify keyword search (broader net, no proof an AI engine cited it).
ALTER TABLE public.reddit_threads
  ADD COLUMN discovery_source text NOT NULL DEFAULT 'search'
    CHECK (discovery_source IN ('citation', 'search'));
