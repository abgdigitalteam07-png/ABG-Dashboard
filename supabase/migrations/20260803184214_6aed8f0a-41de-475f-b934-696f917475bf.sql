CREATE TABLE public.email_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id text NOT NULL UNIQUE,
  brand_name text NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}',
  day_of_week integer NOT NULL DEFAULT 1,
  send_hour_utc integer NOT NULL DEFAULT 13,
  date_range_days integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_schedules TO authenticated;
GRANT ALL ON public.email_schedules TO service_role;
ALTER TABLE public.email_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage email schedules"
ON public.email_schedules FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = 'admin'));

CREATE TABLE public.user_tab_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tab_id text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  show_insights boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tab_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_tab_permissions TO authenticated;
GRANT ALL ON public.user_tab_permissions TO service_role;
ALTER TABLE public.user_tab_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own tab permissions"
ON public.user_tab_permissions FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins manage tab permissions"
ON public.user_tab_permissions FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = 'admin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated;

CREATE TRIGGER email_schedules_touch BEFORE UPDATE ON public.email_schedules
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER user_tab_permissions_touch BEFORE UPDATE ON public.user_tab_permissions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();