export interface Brand {
  id: string;
  name: string;
  ga4PropertyIds?: string[];
  gscSiteUrl?: string;
  hubspotName?: string;
  hasGA4: boolean;
  hasGSC: boolean;
  hasHubSpot: boolean;
}

export const brands: Brand[] = [
  { id: "bootz", name: "Bootz", ga4PropertyIds: ["353109505"], gscSiteUrl: "https://bootz.com/", hubspotName: "Bootz", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "comfort-designs", name: "Comfort Designs", ga4PropertyIds: ["359146051"], gscSiteUrl: "https://comfortdesignsbathware.com/", hubspotName: "Comfort Designs", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "hamilton", name: "Hamilton", ga4PropertyIds: ["368653236"], gscSiteUrl: "https://hamiltonbathware.com/", hubspotName: "Hamilton", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "maax", name: "MAAX", ga4PropertyIds: ["346796837"], gscSiteUrl: "https://maax.com/", hubspotName: "MAAX", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "maidstone", name: "Maidstone", ga4PropertyIds: ["404964777"], gscSiteUrl: "https://maidstonesupply.com/", hubspotName: "Maidstone", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "swan", name: "Swan", ga4PropertyIds: ["353105661"], gscSiteUrl: "https://swanstone.com/", hubspotName: "Swan", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "florestone", name: "Florestone", ga4PropertyIds: ["404969263"], gscSiteUrl: "https://florestoneproducts.com/", hubspotName: "Florestone", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "neptune", name: "Neptune", ga4PropertyIds: ["449465124", "379666295"], gscSiteUrl: "https://neptunebath.com/", hubspotName: "Neptune", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "laurel-mountain", name: "Laurel Mountain", ga4PropertyIds: ["360408940"], gscSiteUrl: "https://laurelmountainbath.com/", hubspotName: "Laurel Mountain", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "abg-hospitality", name: "ABG Hospitality", ga4PropertyIds: ["360388805"], gscSiteUrl: "https://abghospitality.com/", hubspotName: "ABG Hospitality", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "aquarius", name: "Aquarius", ga4PropertyIds: ["368656609"], gscSiteUrl: "https://aquariusproducts.com/", hubspotName: "Aquarius", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "aquatic", name: "Aquatic", ga4PropertyIds: ["385631854"], gscSiteUrl: "https://aquaticbath.com/", hubspotName: "Aquatic", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "clarion", name: "Clarion", hubspotName: "Clarion", hasGA4: false, hasGSC: false, hasHubSpot: true },
  { id: "rbs", name: "RBS", hubspotName: "RBS", hasGA4: false, hasGSC: false, hasHubSpot: true },
  { id: "american-bath-group", name: "American Bath Group", hubspotName: "American Bath Group", hasGA4: false, hasGSC: false, hasHubSpot: true },
  { id: "dreamline", name: "DreamLine", hubspotName: "DreamLine", hasGA4: false, hasGSC: false, hasHubSpot: true },
  { id: "aker", name: "Aker", hubspotName: "Aker", hasGA4: false, hasGSC: false, hasHubSpot: true },
  { id: "imi", name: "IMI", ga4PropertyIds: ["524091884"], hubspotName: "IMI", hasGA4: true, hasGSC: false, hasHubSpot: true },
];
