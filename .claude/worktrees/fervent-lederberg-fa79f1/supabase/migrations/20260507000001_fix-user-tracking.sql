-- Allow regular users to update their own profile (needed for last_login_at and future self-service).
-- Without this, the upsert in shared-login (service role) still works, but any client-side
-- upsert for a non-admin would be silently blocked.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_profiles'
      AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile" ON public.user_profiles
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Backfill user_profiles for every auth user who signed up before the trigger existed
-- or whose trigger invocation failed for any reason.
INSERT INTO public.user_profiles (id, email, full_name, domain, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  split_part(u.email, '@', 2),
  CASE
    WHEN u.email = 'mali@americanbathgroup.com' THEN 'admin'
    ELSE 'viewer'
  END
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_profiles p WHERE p.id = u.id
  )
ON CONFLICT (id) DO NOTHING;

-- Ensure the dashboard owner always has admin role.
UPDATE public.user_profiles
SET role = 'admin'
WHERE email = 'mali@americanbathgroup.com'
  AND role <> 'admin';
