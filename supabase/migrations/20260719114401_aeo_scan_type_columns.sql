-- Records which options were picked in the pre-scan dialog (scan type + page scope),
-- so the Scan History list in the tab can show what each past run actually did.
ALTER TABLE public.aeo_scan_log
  ADD COLUMN scan_type text NOT NULL DEFAULT 'full' CHECK (scan_type IN ('full', 'quick')),
  ADD COLUMN page_scope text NOT NULL DEFAULT 'multi' CHECK (page_scope IN ('homepage', 'multi'));
