-- Supports the standalone "Scan Reddit Now" button (aeo-scan edge function,
-- scanType: "reddit") which runs independently of the scheduled full/quick scans.
ALTER TABLE public.aeo_scan_log DROP CONSTRAINT aeo_scan_log_scan_type_check;
ALTER TABLE public.aeo_scan_log ADD CONSTRAINT aeo_scan_log_scan_type_check
  CHECK (scan_type = ANY (ARRAY['full'::text, 'quick'::text, 'manual'::text, 'routine'::text, 'reddit'::text]));
