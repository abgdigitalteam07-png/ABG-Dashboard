-- Hourly pg_cron job that pings send-scheduled-report; the function itself
-- filters for schedules whose day_of_week/send_hour_utc match "now".
-- Uses Vault secrets (project_url, service_role_key) already seeded for the
-- aeo-scan cron — see 20260717000001_aeo_cron_and_seed.sql.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;

  PERFORM cron.unschedule('send-scheduled-reports')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-scheduled-reports');

  PERFORM cron.schedule(
    'send-scheduled-reports',
    '0 * * * *',  -- every hour on the hour (UTC)
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/send-scheduled-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body := '{}'::jsonb
    );
    $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'send-scheduled-reports cron not scheduled (pg_cron/pg_net/vault unavailable): %', SQLERRM;
END $$;
