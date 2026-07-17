-- Upsert the admin profile from auth.users.
-- If the row already exists, set role = 'admin'.
-- If it doesn't exist yet (e.g. trigger missed on signup), insert it.
INSERT INTO public.user_profiles (id, email, full_name, domain, role, is_active, created_at)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', 'Mostafa Ali'),
  'americanbathgroup.com',
  'admin',
  true,
  au.created_at
FROM auth.users au
WHERE au.email = 'mali@americanbathgroup.com'
ON CONFLICT (id) DO UPDATE
  SET role = 'admin',
      is_active = true;
