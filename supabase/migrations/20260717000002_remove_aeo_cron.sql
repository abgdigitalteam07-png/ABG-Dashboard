-- AEO scans are manual-only (admin "Scan now" button).
-- Remove the weekly cron job if 20260717000001 managed to schedule it.
DO $$
BEGIN
  PERFORM cron.unschedule('aeo-weekly-scan-vita-spa')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aeo-weekly-scan-vita-spa');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'no aeo cron to remove: %', SQLERRM;
END $$;
