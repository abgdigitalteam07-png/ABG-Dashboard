-- send-scheduled-report needs each brand's GA4 property ids / GSC site url to
-- pull live numbers for the PDF it now attaches — brands.ts (the frontend
-- source of truth) isn't reachable from a Deno Edge Function, so we snapshot
-- the relevant fields onto the schedule row when it's created.
alter table public.email_schedules
  add column if not exists ga4_property_ids text[],
  add column if not exists gsc_site_url text;
