-- Full Audit (uncapped crawl) is the only intended depth for scheduled Routine
-- groups going forward — Quick Audit was a leftover default from before manual
-- scanning was removed. Group 1 was already switched via a direct update.
ALTER TABLE public.aeo_routine_groups ALTER COLUMN page_scope SET DEFAULT 'multi';
