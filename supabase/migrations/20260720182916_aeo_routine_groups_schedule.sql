-- Desired schedule for each Routine group, managed from the Admin Panel.
-- This is the source-of-truth reference for "when this group should run" —
-- Claude Desktop's own Routine scheduler still needs to be set to match,
-- since our app has no API to control Claude Desktop's scheduler directly.
ALTER TABLE public.aeo_routine_groups
  ADD COLUMN day_of_week smallint CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday .. 6=Saturday
  ADD COLUMN run_hour_utc smallint CHECK (run_hour_utc BETWEEN 0 AND 23),
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

UPDATE public.aeo_routine_groups SET day_of_week = 1, run_hour_utc = 13 WHERE group_name = 'group_1'; -- Monday 8am CT
