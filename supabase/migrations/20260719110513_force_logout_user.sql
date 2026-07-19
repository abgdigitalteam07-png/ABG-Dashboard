-- Lets an admin forcibly end a user's active session(s) from the Admin Panel.
-- Deletes their rows from auth.sessions (refresh_tokens cascade via FK), which
-- invalidates their refresh token immediately; their current access token
-- remains valid until it naturally expires (short-lived, per Supabase default).
CREATE OR REPLACE FUNCTION public.force_logout_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.sessions WHERE user_id = target_user_id;
END;
$$;

-- Only callable via the service-role key (from the force-logout Edge Function),
-- never directly by end-user sessions.
REVOKE ALL ON FUNCTION public.force_logout_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_logout_user(uuid) TO service_role;
