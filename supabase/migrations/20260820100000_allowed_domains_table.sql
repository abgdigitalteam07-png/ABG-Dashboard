-- Allowed email domains, previously hardcoded in src/lib/allowed-domains.ts.
-- Moved to a table so admins can manage the list from the Admin panel.
CREATE TABLE public.allowed_domains (
  domain text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.allowed_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view allowed domains"
  ON public.allowed_domains
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can add allowed domains"
  ON public.allowed_domains
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can remove allowed domains"
  ON public.allowed_domains
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

INSERT INTO public.allowed_domains (domain) VALUES
  ('americanbathgroup.com'),
  ('abghospitality.com'),
  ('accessiblehomestore.com'),
  ('altrekproducts.com'),
  ('aquaticbath.com'),
  ('arizonashowerdoor.com'),
  ('bootz.com'),
  ('clarionbathware.com'),
  ('clariontransportation.com'),
  ('coastalind.com'),
  ('dreamline.com'),
  ('florestone.com'),
  ('imitoday.com'),
  ('laurelmountainbath.com'),
  ('lmbath.com'),
  ('maax.com'),
  ('maaxspas.com'),
  ('maidstonesupply.com'),
  ('mrsteam.com'),
  ('praxiscompanies.com'),
  ('produitsneptune.com'),
  ('neptuneb.com'),
  ('salomfg.com'),
  ('swanstone.com'),
  ('vintagetub.com'),
  ('vintagetub.ca'),
  ('bathcraft.onmicrosoft.com'),
  ('bathcraft.com'),
  ('bathauthority.com'),
  ('americanstandard-bootz.com')
ON CONFLICT (domain) DO NOTHING;
