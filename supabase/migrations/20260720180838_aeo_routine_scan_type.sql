-- Distinguishes an automated Claude Desktop Routine run (writes via the
-- Supabase MCP connector, no manual paste) from a hand-pasted "Open in
-- Claude" import — both are Claude-run, but Scan History should label them
-- differently so it's clear which brands are on the automated schedule.
ALTER TABLE public.aeo_scan_log DROP CONSTRAINT aeo_scan_log_scan_type_check;
ALTER TABLE public.aeo_scan_log
  ADD CONSTRAINT aeo_scan_log_scan_type_check CHECK (scan_type IN ('full', 'quick', 'manual', 'routine'));
