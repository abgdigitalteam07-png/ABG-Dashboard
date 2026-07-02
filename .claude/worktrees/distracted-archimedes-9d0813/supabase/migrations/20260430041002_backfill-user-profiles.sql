-- Backfill user_profiles for any auth.users who signed up before the trigger existed.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
INSERT INTO public.user_profiles (id, email, full_name, domain, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  split_part(u.email, '@', 2),
  CASE
    WHEN u.email = 'mali@americanbathgroup.com' THEN 'admin'
    ELSE 'viewer'
  END
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_profiles p WHERE p.id = u.id
  )
ON CONFLICT (id) DO NOTHING;

-- Also ensure mali always has admin role (idempotent)
UPDATE public.user_profiles
SET role = 'admin'
WHERE email = 'mali@americanbathgroup.com'
  AND role <> 'admin';
