import { useState, useCallback, useEffect, useRef } from "react";
import { brands } from "@/lib/brands";
import { supabase } from "@/integrations/supabase/client";
import { DashboardHeader } from "@/components/DashboardHeader";
import { TabNav } from "@/components/TabNav";
import { PerformanceTab } from "@/components/PerformanceTab";
import { HubSpotTab } from "@/components/HubSpotTab";
import { HubSpotCRMTab } from "@/components/HubSpotCRMTab";
import { SocialMediaTab } from "@/components/SocialMediaTab";
import { ReadMeTab } from "@/components/ReadMeTab";
import { SummaryTab } from "@/components/SummaryTab";
import { SeoAeoGeoTab } from "@/components/SeoAeoGeoTab";
import { toast } from "sonner";

interface TabPerm { can_view: boolean; show_insights: boolean; }

const brandKey = (email: string) => `abg_last_brand:${email || "anon"}`;
const tabKey = (email: string) => `abg_last_tab:${email || "anon"}`;

// Shareable-link support: a brand/tab/date-range combo in the URL always wins over
// whatever's saved locally, so a link one person copies opens to the same view for
// anyone else — instead of everyone landing on their own last-visited tab.
const urlParams = new URLSearchParams(window.location.search);
const urlBrandIds = (urlParams.get("brand") || "").split(",").filter(Boolean);
const urlTab = urlParams.get("tab");
const urlFrom = urlParams.get("from");
const urlTo = urlParams.get("to");
const parseUrlDate = (s: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

const Index = () => {
  const [selectedBrand, setSelectedBrandState] = useState(() => {
    if (urlBrandIds.length === 1) {
      const fromUrl = brands.find(b => b.id === urlBrandIds[0]);
      if (fromUrl) return fromUrl;
    }
    const savedName = localStorage.getItem("abg_last_brand");
    return (savedName && brands.find(b => b.name === savedName)) || brands.find(b => b.name === "Bootz") || brands[0];
  });
  const [userEmail, setUserEmail] = useState("");
  const setSelectedBrand = (brand: typeof selectedBrand) => {
    setSelectedBrandState(brand);
    localStorage.setItem(brandKey(userEmail), brand.name);
    localStorage.setItem("abg_last_brand", brand.name);
  };

  const [brandMode, setBrandMode] = useState<"single" | "multi">(() => {
    if (urlBrandIds.length > 1) return "multi";
    if (urlBrandIds.length === 1) return "single";
    return (localStorage.getItem("abg_brand_mode") as "single" | "multi") || "single";
  });
  const [multiBrands, setMultiBrandsState] = useState(() => {
    if (urlBrandIds.length > 1) return brands.filter(b => urlBrandIds.includes(b.id));
    const ids = (localStorage.getItem("abg_multi_brands") || "").split(",").filter(Boolean);
    return brands.filter(b => ids.includes(b.id));
  });
  const setMultiBrands = (list: typeof multiBrands) => {
    setMultiBrandsState(list);
    localStorage.setItem("abg_multi_brands", list.map(b => b.id).join(","));
  };
  const handleBrandModeChange = (mode: "single" | "multi") => {
    setBrandMode(mode);
    localStorage.setItem("abg_brand_mode", mode);
  };
  const [tabPerms, setTabPerms] = useState<Record<string, TabPerm>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const welcomeShown = useRef(false);
  // Same rule as the initial state above: don't let the per-user "last visited"
  // restore clobber a brand/tab that came in explicitly via a shared link.
  const urlHadBrand = urlBrandIds.length > 0;
  const urlHadTab = !!urlTab;

  useEffect(() => {
    if (welcomeShown.current) return;
    welcomeShown.current = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const email = session.user.email ?? "";
      setUserEmail(email);

      if (!urlHadBrand) {
        const savedBrandName = localStorage.getItem(brandKey(email));
        const savedBrand = savedBrandName && brands.find(b => b.name === savedBrandName);
        if (savedBrand) setSelectedBrandState(savedBrand);
      }

      if (!urlHadTab) {
        const savedTab = localStorage.getItem(tabKey(email));
        if (savedTab) setActiveTabState(savedTab);
      }

      const [{ data: profile }, { data: perms }] = await Promise.all([
        supabase.from("user_profiles").select("full_name, role").eq("id", session.user.id).single(),
        supabase.from("user_tab_permissions").select("tab_id, can_view, show_insights").eq("user_id", session.user.id),
      ]);

      setIsAdmin(profile?.role === "admin");
      const firstName = profile?.full_name?.split(" ")[0];
      toast.success(firstName ? `Welcome back, ${firstName}!` : "Welcome back!");

      if (perms) {
        const map: Record<string, TabPerm> = {};
        for (const p of perms) map[p.tab_id] = { can_view: p.can_view, show_insights: p.show_insights };
        setTabPerms(map);
      }
    });
  }, []);
  const [activeTab, setActiveTabState] = useState(urlTab || "performance");
  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    localStorage.setItem(tabKey(userEmail), tab);
  };

  const now = new Date();
  const start7 = new Date(now);
  start7.setDate(start7.getDate() - 7);
  const [dateFrom, setDateFrom] = useState(() => parseUrlDate(urlFrom) ?? start7);
  const [dateTo, setDateTo] = useState(() => parseUrlDate(urlTo) ?? now);

  const handleDateChange = useCallback((from: Date, to: Date) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const socialMediaBrandNames = [
    "Laurel Mountain", "ABG Home Services", "Accessible Home Store", "American Bath Group",
    "Arizona Shower Door", "Bootz", "Coastal Shower Doors", "DreamLine", "MAAX", "MAAX Spas",
    "Maidstone", "Swan", "Mr.Steam", "Vintage Tub", "Vintage Tub & Bath - Canada", "IMI",
  ];

  const linkedinBrandNames = [
    "MAAX BATH", "MAAX", "DreamLine", "Coastal Shower Doors", "Neptune", "Swan",
    "IMI", "Mr.Steam", "ABG Decorative Products", "American Standard Bathing",
    "Maidstone", "Laurel Mountain", "Bootz", "Vintage Tub",
  ];

  const isMultiMode = brandMode === "multi" && multiBrands.length > 1;
  const activeBrands = isMultiMode ? multiBrands : [selectedBrand];

  const hasSocialMedia = activeBrands.some(b => socialMediaBrandNames.includes(b.name));
  const hasLinkedIn = activeBrands.some(b => linkedinBrandNames.includes(b.name));

  const canView = (tabId: string) => tabPerms[tabId]?.can_view !== false;

  // Keep the address bar in sync with brand/tab/date-range so the current URL is
  // always a valid, shareable link to exactly this view — not just a bookmark to
  // whatever the next viewer happens to have saved locally.
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("brand", isMultiMode ? multiBrands.map(b => b.id).join(",") : selectedBrand.id);
    params.set("tab", activeTab);
    params.set("from", dateFrom.toISOString().slice(0, 10));
    params.set("to", dateTo.toISOString().slice(0, 10));
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [selectedBrand.id, activeTab, dateFrom, dateTo, isMultiMode, multiBrands]);

  const allTabs = [
    { id: "performance",  label: "Google Analytics & Search Console", disabled: !activeBrands.some(b => b.hasGA4 || b.hasGSC), tooltip: "No GA4/GSC property linked for this brand." },
    { id: "social",       label: "Social Media",   disabled: !hasSocialMedia && !hasLinkedIn, tooltip: "No social media data for this brand." },
    { id: "hubspot",      label: "Emails",         disabled: !activeBrands.some(b => b.hasHubSpot), tooltip: "No HubSpot data for this brand." },
    { id: "hubspot-crm",  label: "HubSpot CRM",    disabled: !activeBrands.some(b => b.hasHubSpot), tooltip: "No HubSpot data for this brand." },
    { id: "summary",      label: "Summary Report", disabled: !activeBrands.some(b => b.hasGA4 || b.hasGSC || b.hasHubSpot), tooltip: "No data sources linked for this brand." },
    // Admin-only. Not gated on GA4/GSC/HubSpot — the AEO audit crawls the site directly.
    ...(isAdmin ? [{ id: "seo-aeo", label: "SEO & AEO & GEO", disabled: false, tooltip: undefined as string | undefined }] : []),
  ];

  const tabs = allTabs.filter(t => canView(t.id));
  const showInsights = tabPerms["summary"]?.show_insights !== false;

  const effectiveTab =
    activeTab === "performance" && !activeBrands.some(b => b.hasGA4 || b.hasGSC) ? "hubspot-crm" : activeTab;

  // Silent page_view logging
  const lastLogRef = useRef("");
  useEffect(() => {
    const key = `${effectiveTab}|${selectedBrand.name}`;
    if (key === lastLogRef.current) return;
    lastLogRef.current = key;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      void supabase.from("user_activity_log").insert({
        user_id: session.user.id,
        email: session.user.email || "",
        action: "page_view",
        metadata: { tab: effectiveTab, brand: selectedBrand.name },
      }).then(({ error }) => {
        if (error) console.error("Failed to log page_view:", error);
      });
    });
  }, [effectiveTab, selectedBrand.name]);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50">
        <DashboardHeader
          selectedBrand={selectedBrand}
          onBrandChange={setSelectedBrand}
          brandMode={brandMode}
          multiBrands={multiBrands}
          onSelectMultiple={setMultiBrands}
          onBrandModeChange={handleBrandModeChange}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateChange={handleDateChange}
          onLogoClick={() => setActiveTab("readme")}
        />
        <TabNav tabs={tabs} activeTab={effectiveTab} onTabChange={setActiveTab} />
      </div>

      <main className="mx-auto max-w-[1400px]">
        <div className="px-2 pt-2">
          <h1 className="px-3 md:px-4 pt-3 md:pt-4 text-sm md:text-lg font-semibold text-foreground">{isMultiMode ? `${multiBrands.length} Brands` : selectedBrand.name} {effectiveTab === "hubspot" ? "Emails" : effectiveTab === "hubspot-crm" ? "HubSpot CRM" : effectiveTab === "summary" ? "Summary" : effectiveTab === "seo-aeo" ? "SEO & AEO & GEO" : ""} Performance Overview</h1>
        </div>

        {effectiveTab === "performance" && <PerformanceTab key={isMultiMode ? multiBrands.map(b => b.id).join(",") : selectedBrand.id} brand={isMultiMode ? multiBrands[0] : selectedBrand} brands={isMultiMode ? multiBrands : undefined} dateFrom={dateFrom} dateTo={dateTo} />}
        {effectiveTab === "social" && <SocialMediaTab key={isMultiMode ? multiBrands.map(b => b.id).join(",") : selectedBrand.id} brand={isMultiMode ? multiBrands[0] : selectedBrand} brands={isMultiMode ? multiBrands : undefined} dateFrom={dateFrom} dateTo={dateTo} />}
        {effectiveTab === "hubspot" && <HubSpotTab key={isMultiMode ? multiBrands.map(b => b.id).join(",") : selectedBrand.id} brand={isMultiMode ? multiBrands[0] : selectedBrand} brands={isMultiMode ? multiBrands : undefined} dateFrom={dateFrom} dateTo={dateTo} />}
        {effectiveTab === "hubspot-crm" && <HubSpotCRMTab key={isMultiMode ? multiBrands.map(b => b.id).join(",") : selectedBrand.id} brand={isMultiMode ? multiBrands[0] : selectedBrand} brands={isMultiMode ? multiBrands : undefined} dateFrom={dateFrom} dateTo={dateTo} userEmail={userEmail} />}
        {effectiveTab === "readme" && <ReadMeTab key={selectedBrand.id} brand={selectedBrand} dateFrom={dateFrom} dateTo={dateTo} />}
        {effectiveTab === "summary" && <SummaryTab key={isMultiMode ? multiBrands.map(b => b.id).join(",") : selectedBrand.id} brand={isMultiMode ? multiBrands[0] : selectedBrand} brands={isMultiMode ? multiBrands : undefined} dateFrom={dateFrom} dateTo={dateTo} showInsights={showInsights} />}
        {effectiveTab === "seo-aeo" && isAdmin && <SeoAeoGeoTab key={selectedBrand.id} brand={selectedBrand} />}
      </main>
    </div>
  );
};

export default Index;
