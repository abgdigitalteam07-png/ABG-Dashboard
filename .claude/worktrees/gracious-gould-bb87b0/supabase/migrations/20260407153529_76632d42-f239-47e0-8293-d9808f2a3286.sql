
CREATE TABLE public.app_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read config"
ON public.app_config FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage config"
ON public.app_config FOR ALL
TO authenticated
USING (is_admin(auth.uid()));

INSERT INTO public.app_config (key, value) VALUES ('shared_password', 'ABG2025!');
