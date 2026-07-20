-- Group definitions for the Claude Desktop Routines (Group 1, 2, 3...) that
-- audit brands in batches. Editable directly in Supabase Studio's table
-- editor going forward — no code change or re-pasted prompt needed to move a
-- brand between groups or add a new one. The Routine prompt reads this table
-- via the Supabase MCP connector at run time instead of a hardcoded list.
CREATE TABLE public.aeo_routine_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_name text NOT NULL UNIQUE,
  brands jsonb NOT NULL, -- [{"id":"vita-spa","name":"Vita Spa","site_url":"https://vitaspa.com/"}, ...]
  scan_type text NOT NULL DEFAULT 'routine' CHECK (scan_type IN ('full', 'quick', 'manual', 'routine')),
  page_scope text NOT NULL DEFAULT 'homepage' CHECK (page_scope IN ('homepage', 'multi')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aeo_routine_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aeo_routine_groups" ON public.aeo_routine_groups FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.aeo_routine_groups (group_name, brands, notes) VALUES (
  'group_1',
  '[
    {"id":"vita-spa","name":"Vita Spa","site_url":"https://vitaspa.com/"},
    {"id":"american-whirlpool","name":"American Whirlpool","site_url":"https://americanwhirlpool.com/"},
    {"id":"bootz","name":"Bootz","site_url":"https://bootz.com/"},
    {"id":"swan","name":"Swan","site_url":"https://swanstone.com/"}
  ]'::jsonb,
  'First pilot group for the automated audit Routine.'
);
