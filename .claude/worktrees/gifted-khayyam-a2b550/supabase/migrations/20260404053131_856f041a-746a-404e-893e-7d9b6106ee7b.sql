
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
