-- Tab-level visibility permissions per user.
-- If no row exists for a (user_id, tab_id) pair the tab is visible (open by default).
-- Only rows with can_view = false hide a tab.

CREATE TABLE IF NOT EXISTS public.user_tab_permissions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tab_id          text        NOT NULL,
  can_view        boolean     NOT NULL DEFAULT true,
  show_insights   boolean     NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tab_id)
);

ALTER TABLE public.user_tab_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can read and write all permissions
CREATE POLICY "admin_manage_tab_permissions"
  ON public.user_tab_permissions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can read their own permissions (so the frontend can filter tabs)
CREATE POLICY "users_read_own_tab_permissions"
  ON public.user_tab_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
