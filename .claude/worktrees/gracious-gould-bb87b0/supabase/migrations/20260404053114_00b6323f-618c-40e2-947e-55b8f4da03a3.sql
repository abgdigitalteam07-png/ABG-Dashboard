
-- TABLE 1: User Profiles (must be created BEFORE the is_admin function)
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  domain TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID REFERENCES auth.users(id)
);

-- Security definer function to check admin role (avoids recursive RLS)
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

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.user_profiles
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update profiles" ON public.user_profiles
  FOR UPDATE USING (public.is_admin(auth.uid()));

CREATE POLICY "Users or admins can insert profiles" ON public.user_profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id OR public.is_admin(auth.uid())
  );

-- TABLE 2: Activity Log
CREATE TABLE public.user_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activity logs" ON public.user_activity_log
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can insert own activity" ON public.user_activity_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can insert any activity" ON public.user_activity_log
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));

-- TABLE 3: Invitations
CREATE TABLE public.user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invitations" ON public.user_invitations
  FOR ALL USING (public.is_admin(auth.uid()));

-- TRIGGER: Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invite_record RECORD;
BEGIN
  SELECT * INTO invite_record
  FROM public.user_invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  LIMIT 1;

  INSERT INTO public.user_profiles (id, email, full_name, domain, role, invited_by)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', invite_record.full_name, ''),
    split_part(NEW.email, '@', 2),
    COALESCE(invite_record.role, 'viewer'),
    invite_record.invited_by
  );

  IF invite_record.id IS NOT NULL THEN
    UPDATE public.user_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = invite_record.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
