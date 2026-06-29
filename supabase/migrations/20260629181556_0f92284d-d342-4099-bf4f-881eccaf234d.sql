
-- 1) app_config: remove public/authenticated read access (service role still works)
DROP POLICY IF EXISTS "Anyone can read config" ON public.app_config;
DROP POLICY IF EXISTS "Authenticated users can read config" ON public.app_config;
REVOKE SELECT ON public.app_config FROM anon;
REVOKE SELECT ON public.app_config FROM authenticated;

-- 2) user_activity_log: enforce email matches the JWT email
DROP POLICY IF EXISTS "Users can insert own activity" ON public.user_activity_log;
CREATE POLICY "Users can insert own activity"
  ON public.user_activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND email = lower((auth.jwt() ->> 'email'))
  );

-- 3) user_profiles: prevent role escalation on self-insert
DROP POLICY IF EXISTS "Users or admins can insert profiles" ON public.user_profiles;
CREATE POLICY "Users or admins can insert profiles"
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin(auth.uid())
    OR (auth.uid() = id AND role = 'viewer')
  );

-- 4) Revoke direct EXECUTE on SECURITY DEFINER is_admin from API roles.
-- RLS policy evaluation still invokes it internally.
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM authenticated;
