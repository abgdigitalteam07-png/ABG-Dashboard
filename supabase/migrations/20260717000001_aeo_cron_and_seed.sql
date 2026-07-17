-- Weekly AEO scan cron (pilot: Vita Spa) + seed the 10 tracked prompts.
-- The cron calls the aeo-scan Edge Function via pg_net every Monday 06:00 UTC.
-- Wrapped in exception handlers so local `supabase start` (which may lack
-- pg_cron/pg_net or the vault secrets) still applies the migration cleanly.

-- Seed prompts for the pilot brand (idempotent).
INSERT INTO public.aeo_prompts (brand_id, prompt, product_service, icp, journey_phase, location)
VALUES
  ('vita-spa', 'What are the best hot tub brands for home use?',      'Hot Tubs', 'Homeowners', 'Awareness',     'United States'),
  ('vita-spa', 'Which hot tubs are best for small backyards?',        'Hot Tubs', 'Homeowners', 'Consideration', 'United States'),
  ('vita-spa', 'What is the most reliable hot tub brand?',            'Hot Tubs', 'Homeowners', 'Consideration', 'United States'),
  ('vita-spa', 'Best hot tub for cold climates?',                     'Hot Tubs', 'Homeowners', 'Consideration', 'United States'),
  ('vita-spa', 'Vita Spa vs Jacuzzi — which is better?',              'Hot Tubs', 'Homeowners', 'Decision',      'United States'),
  ('vita-spa', 'Are Vita Spa hot tubs good quality?',                 'Hot Tubs', 'Homeowners', 'Decision',      'United States'),
  ('vita-spa', 'Best energy-efficient hot tubs 2026?',                'Hot Tubs', 'Homeowners', 'Consideration', 'United States'),
  ('vita-spa', 'What hot tub should I buy for hydrotherapy?',         'Hot Tubs', 'Homeowners', 'Consideration', 'United States'),
  ('vita-spa', 'How much does a good hot tub cost?',                  'Hot Tubs', 'Homeowners', 'Awareness',     'United States'),
  ('vita-spa', 'Best hot tub dealers near me?',                       'Hot Tubs', 'Dealers',    'Decision',      'United States')
ON CONFLICT (brand_id, prompt) DO NOTHING;

-- Weekly cron. Requires pg_cron + pg_net (enabled by default on hosted Supabase)
-- and a `project_url` + `service_role_key` entry in Vault. Skips gracefully if not available.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;

  PERFORM cron.unschedule('aeo-weekly-scan-vita-spa')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aeo-weekly-scan-vita-spa');

  PERFORM cron.schedule(
    'aeo-weekly-scan-vita-spa',
    '0 6 * * 1',  -- Mondays 06:00 UTC
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/aeo-scan',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body := jsonb_build_object(
        'brandId', 'vita-spa',
        'brandName', 'Vita Spa',
        'siteUrl', 'https://vitaspa.com/'
      )
    );
    $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'aeo weekly cron not scheduled (pg_cron/pg_net/vault unavailable): %', SQLERRM;
END $$;
