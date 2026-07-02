export interface Brand {
  id: string;
  name: string;
  ga4PropertyIds?: string[];
  gscSiteUrl?: string;
  hubspotBusinessUnitId?: string;
  hubspotAccount?: "primary" | "secondary"; // secondary = MAAX Sauna / Vita Spa / American Whirlpool account
  hasGA4: boolean;
  hasGSC: boolean;
  hasHubSpot: boolean;
}

export const brands: Brand[] = [
  { id: "abg-home-services", name: "ABG Home Services", ga4PropertyIds: ["411738217"], hasGA4: true, hasGSC: false, hasHubSpot: false },
  { id: "abg-hospitality", name: "ABG Hospitality", ga4PropertyIds: ["360388805"], gscSiteUrl: "https://abghospitality.com/", hubspotBusinessUnitId: "1982882", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "accessible-home-store", name: "Accessible Home Store", hubspotBusinessUnitId: "2625978", hasGA4: false, hasGSC: false, hasHubSpot: true },
  { id: "aker", name: "Aker", gscSiteUrl: "http://www.akerbymaax.com/", hubspotBusinessUnitId: "1982881", hasGA4: false, hasGSC: true, hasHubSpot: true },
  { id: "amazing-shower-door", name: "Amazing Shower Door", ga4PropertyIds: ["392147256"], hasGA4: true, hasGSC: false, hasHubSpot: false },
  { id: "american-bath-group", name: "American Bath Group", gscSiteUrl: "https://americanbathgroup.com/", hasGA4: false, hasGSC: true, hasHubSpot: false },
  { id: "american-whirlpool", name: "American Whirlpool", ga4PropertyIds: ["391075012"], gscSiteUrl: "https://americanwhirlpool.com/", hubspotAccount: "secondary", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "aquarius", name: "Aquarius", ga4PropertyIds: ["368656609"], gscSiteUrl: "https://aquariusproducts.com/", hubspotBusinessUnitId: "1982883", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "aquatic", name: "Aquatic", ga4PropertyIds: ["385631854"], gscSiteUrl: "https://aquaticbath.com/", hubspotBusinessUnitId: "1982884", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "bootz", name: "Bootz", ga4PropertyIds: ["353109505"], gscSiteUrl: "https://bootz.com/", hubspotBusinessUnitId: "1982886", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "briggs-bath", name: "Briggs Bath", ga4PropertyIds: ["392145370"], hasGA4: true, hasGSC: false, hasHubSpot: false },
  { id: "clarion", name: "Clarion", gscSiteUrl: "https://clarionbathware.com/", hubspotBusinessUnitId: "1982887", hasGA4: false, hasGSC: true, hasHubSpot: true },
  { id: "coastal-shower-doors", name: "Coastal Shower Doors", ga4PropertyIds: ["516139945"], gscSiteUrl: "https://coastalshowerdoors.com/", hasGA4: true, hasGSC: true, hasHubSpot: false },
  { id: "comfort-designs", name: "Comfort Designs", ga4PropertyIds: ["359146051"], gscSiteUrl: "https://comfortdesignsbathware.com/", hubspotBusinessUnitId: "1982888", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "dreamline", name: "DreamLine", gscSiteUrl: "https://dreamline.com/", hubspotBusinessUnitId: "1690059", hasGA4: false, hasGSC: true, hasHubSpot: true },
  { id: "florestone", name: "Florestone", ga4PropertyIds: ["404969263"], gscSiteUrl: "https://florestoneproducts.com/", hubspotBusinessUnitId: "1690060", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "hamilton", name: "Hamilton", ga4PropertyIds: ["368653236"], gscSiteUrl: "https://hamiltonbathware.com/", hubspotBusinessUnitId: "1982889", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "imi", name: "IMI", ga4PropertyIds: ["524091884"], hubspotBusinessUnitId: "1982890", hasGA4: true, hasGSC: false, hasHubSpot: true },
  { id: "laurel-mountain", name: "Laurel Mountain", ga4PropertyIds: ["360408940"], gscSiteUrl: "https://laurelmountainbath.com/", hubspotBusinessUnitId: "1982879", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "maax", name: "MAAX", ga4PropertyIds: ["346796837"], gscSiteUrl: "https://maax.com/", hubspotBusinessUnitId: "1982891", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "maidstone", name: "Maidstone", ga4PropertyIds: ["404964777"], gscSiteUrl: "https://maidstonesupply.com/", hubspotBusinessUnitId: "1982892", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "neptune", name: "Neptune", ga4PropertyIds: ["449465124", "379666295"], gscSiteUrl: "https://neptunebath.com/", hubspotBusinessUnitId: "1690061", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "rbs", name: "RBS", gscSiteUrl: "https://renovativebathsystems.com/", hubspotBusinessUnitId: "1982893", hasGA4: false, hasGSC: true, hasHubSpot: true },
  { id: "swan", name: "Swan", ga4PropertyIds: ["353105661"], gscSiteUrl: "https://swanstone.com/", hubspotBusinessUnitId: "843133", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "vintage-ca", name: "Vintage.ca", hubspotBusinessUnitId: "2659249", hasGA4: false, hasGSC: false, hasHubSpot: true },
  { id: "vita-spa", name: "Vita Spa", ga4PropertyIds: ["360436693"], gscSiteUrl: "https://vitaspa.com/", hubspotAccount: "secondary", hasGA4: true, hasGSC: true, hasHubSpot: true },
  { id: "maax-sauna", name: "MAAX Sauna", hubspotAccount: "secondary", hasGA4: false, hasGSC: false, hasHubSpot: true },
];
