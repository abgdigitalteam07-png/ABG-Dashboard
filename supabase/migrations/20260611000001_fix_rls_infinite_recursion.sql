-- Fix infinite recursion in RLS policies (Postgres error 42P17).
--
-- The original migration declared a SECURITY DEFINER helper `public.is_admin`
-- and used it inside the user_profiles / user_activity_log policies to avoid
-- recursive RLS evaluation. At some point the function was dropped and the
-- policies were re-created with inline `EXISTS (SELECT 1 FROM user_profiles
-- WHERE ...)`. That subquery against user_profiles is itself gated by
-- user_profiles RLS, which re-runs the same EXISTS subquery, recursing
-- forever — every authenticated insert/select against user_activity_log (and
-- every Admin panel query) returned 500.
--
-- Restore the SECURITY DEFINER function and point the policies back at it.

-- 1. Recreate the SECURITY DEFINER helper.
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = _user_id AND role = 'admin'
  )
$$;

-- 2. user_profiles — replace recursive admin policies.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.user_profiles;

CREATE POLICY "Admins can view all profiles" ON public.user_profiles
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update profiles" ON public.user_profiles
  FOR UPDATE USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert profiles" ON public.user_profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id OR public.is_admin(auth.uid())
  );

-- 3. user_activity_log — replace recursive admin policies.
DROP POLICY IF EXISTS "Admins can view activity logs" ON public.user_activity_log;
DROP POLICY IF EXISTS "Admins can insert any activity" ON public.user_activity_log;

CREATE POLICY "Admins can view activity logs" ON public.user_activity_log
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert any activity" ON public.user_activity_log
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
