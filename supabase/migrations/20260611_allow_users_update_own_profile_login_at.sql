-- Allow authenticated users to update their own profile row.
-- Previously only admins could UPDATE user_profiles, which silently blocked
-- the last_login_at write that runs on every viewer login (RLS 403, never
-- surfaced to the client). Result: user_profiles.last_login_at was NULL for
-- every viewer despite them logging in regularly.
--
-- A user updating their own row is safe: the policy uses both USING and
-- WITH CHECK on auth.uid() = id, so they cannot escalate by changing the id
-- to someone else's. Privileged columns (role, is_active, deactivated_*) are
-- still only written from the Admin panel under the admin's session.

CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
