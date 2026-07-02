-- Fix: mali@americanbathgroup.com could not see activity logs because:
-- 1. Their user_profiles row was created with role='viewer' (upsert in AuthGuard
--    doesn't set role, so it uses the column default) AFTER the previous admin-role
--    migrations ran — making those UPDATE statements no-ops.
-- 2. The SELECT RLS on user_activity_log only passes if is_admin() returns true,
--    which reads user_profiles.role.

-- Step 1: Upsert mali's profile forcing role=admin.
-- Uses INSERT...ON CONFLICT so it works whether the row exists yet or not.
INSERT INTO public.user_profiles (id, email, domain, role, is_active)
SELECT
  au.id,
  au.email,
  split_part(au.email, '@', 2),
  'admin',
  true
FROM auth.users au
WHERE au.email = 'mali@americanbathgroup.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Step 2: Add a JWT-email-based fallback SELECT policy on user_activity_log.
-- auth.jwt()->>'email' is read directly from the token — does NOT depend on
-- user_profiles.role, so it can never be blocked by a stale/missing profile row.
DROP POLICY IF EXISTS "Primary admin email can view activity logs" ON public.user_activity_log;
CREATE POLICY "Primary admin email can view activity logs" ON public.user_activity_log
  FOR SELECT USING (
    auth.jwt() ->> 'email' = 'mali@americanbathgroup.com'
    OR public.is_admin(auth.uid())
  );

-- Step 3: Same JWT-based fallback for user_profiles SELECT so mali can always
-- read the full user list (the existing policy only covers own row or DB-admin).
DROP POLICY IF EXISTS "Primary admin email can view all profiles" ON public.user_profiles;
CREATE POLICY "Primary admin email can view all profiles" ON public.user_profiles
  FOR SELECT USING (
    auth.uid() = id
    OR auth.jwt() ->> 'email' = 'mali@americanbathgroup.com'
    OR public.is_admin(auth.uid())
  );
