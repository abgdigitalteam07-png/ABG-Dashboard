
CREATE POLICY "Anyone can read config"
ON public.app_config FOR SELECT
TO anon
USING (true);
