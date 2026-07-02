-- 1. Ensure mali@americanbathgroup.com has role = 'admin'.
--    This fixes the Admin panel showing 0 users / empty activity log —
--    the is_admin() RLS guard was returning false because the profile row
--    had role = 'viewer' (or didn't exist yet).
UPDATE public.user_profiles
SET role = 'admin'
WHERE email = 'mali@americanbathgroup.com';

-- 2. Also ensure the user_profiles SELECT policy lets users read their own row
--    (needed so normal viewers can load their own profile on login).
DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
CREATE POLICY "Users can read own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

-- 3. Fix user_tab_permissions RLS — the original migration used an inline
--    EXISTS subquery against user_profiles, which triggers the same RLS
--    infinite-recursion that 20260611000001 fixed. Replace with is_admin().
DROP POLICY IF EXISTS "admin_manage_tab_permissions" ON public.user_tab_permissions;
DROP POLICY IF EXISTS "users_read_own_tab_permissions" ON public.user_tab_permissions;

CREATE POLICY "admin_manage_tab_permissions"
  ON public.user_tab_permissions
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "users_read_own_tab_permissions"
  ON public.user_tab_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
