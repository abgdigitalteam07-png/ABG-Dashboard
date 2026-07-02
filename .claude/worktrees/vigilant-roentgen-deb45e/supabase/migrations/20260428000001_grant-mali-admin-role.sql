-- Ensure mali@americanbathgroup.com always has admin role.
-- UPDATE covers the case where the profile row already exists.
UPDATE public.user_profiles
SET role = 'admin'
WHERE email = 'mali@americanbathgroup.com';

-- Also update the new-user trigger so if the profile is ever
-- recreated (e.g. after account deletion) mali still gets admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invite_record RECORD;
  assigned_role TEXT;
BEGIN
  SELECT * INTO invite_record
  FROM public.user_invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  LIMIT 1;

  -- Dashboard owner always gets admin role
  assigned_role := CASE
    WHEN NEW.email = 'mali@americanbathgroup.com' THEN 'admin'
    ELSE COALESCE(invite_record.role, 'viewer')
  END;

  INSERT INTO public.user_profiles (id, email, full_name, domain, role, invited_by)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', invite_record.full_name, ''),
    split_part(NEW.email, '@', 2),
    assigned_role,
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
