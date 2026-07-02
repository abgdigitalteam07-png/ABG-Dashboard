export const ALLOWED_DOMAINS = [
  "americanbathgroup.com",
  "abghospitality.com",
  "accessiblehomestore.com",
  "altrekproducts.com",
  "aquaticbath.com",
  "arizonashowerdoor.com",
  "bootz.com",
  "clarionbathware.com",
  "clariontransportation.com",
  "coastalind.com",
  "dreamline.com",
  "florestone.com",
  "imitoday.com",
  "laurelmountainbath.com",
  "lmbath.com",
  "maax.com",
  "maaxspas.com",
  "maidstonesupply.com",
  "mrsteam.com",
  "praxiscompanies.com",
  "produitsneptune.com",
  "neptuneb.com",
  "salomfg.com",
  "swanstone.com",
  "vintagetub.com",
  "vintagetub.ca",
  "bathcraft.onmicrosoft.com",
  "bathcraft.com",
  "bathauthority.com",
];

export function isAllowedDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain);
}
