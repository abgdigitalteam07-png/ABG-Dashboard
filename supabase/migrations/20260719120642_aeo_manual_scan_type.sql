-- Supports the "Open in Claude + paste report back" flow — an admin runs the
-- audit prompt in their own claude.ai session (no API billing) and pastes the
-- resulting JSON into the tab, which is logged as a 'manual' scan.
ALTER TABLE public.aeo_scan_log DROP CONSTRAINT aeo_scan_log_scan_type_check;
ALTER TABLE public.aeo_scan_log
  ADD CONSTRAINT aeo_scan_log_scan_type_check CHECK (scan_type IN ('full', 'quick', 'manual'));
