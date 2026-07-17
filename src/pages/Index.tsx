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

const Index = () => {
  const [selectedBrand, setSelectedBrand] = useState(brands.find(b => b.name === "Bootz") ?? brands[0]);
  const [userEmail, setUserEmail] = useState("");
  const [tabPerms, setTabPerms] = useState<Record<string, TabPerm>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const welcomeShown = useRef(false);

  useEffect(() => {
    if (welcomeShown.current) return;
    welcomeShown.current = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      setUserEmail(session.user.email ?? "");

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
  const [activeTab, setActiveTab] = useState("performance");

  const now = new Date();
  const start7 = new Date(now);
  start7.setDate(start7.getDate() - 7);
  const [dateFrom, setDateFrom] = useState(start7);
  const [dateTo, setDateTo] = useState(now);

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

  const hasSocialMedia = socialMediaBrandNames.includes(selectedBrand.name);
  const hasLinkedIn = linkedinBrandNames.includes(selectedBrand.name);

  const canView = (tabId: string) => tabPerms[tabId]?.can_view !== false;

  const allTabs = [
    { id: "readme",       label: "Read Me" },
    { id: "performance",  label: "Google Analytics & Search Console", disabled: !selectedBrand.hasGA4 && !selectedBrand.hasGSC, tooltip: "No GA4/GSC property linked for this brand." },
    { id: "social",       label: "Social Media",   disabled: !hasSocialMedia && !hasLinkedIn, tooltip: "No social media data for this brand." },
    { id: "hubspot",      label: "Emails",         disabled: !selectedBrand.hasHubSpot, tooltip: "No HubSpot data for this brand." },
    { id: "hubspot-crm",  label: "HubSpot CRM",    disabled: !selectedBrand.hasHubSpot, tooltip: "No HubSpot data for this brand." },
    { id: "summary",      label: "Summary Report", disabled: !selectedBrand.hasGA4 && !selectedBrand.hasGSC && !selectedBrand.hasHubSpot, tooltip: "No data sources linked for this brand." },
    // Admin-only: hidden entirely (not just disabled) for non-admins.
    ...(isAdmin ? [{ id: "seo-aeo", label: "SEO & AEO & GEO" }] : []),
  ];

  const tabs = allTabs.filter(t => canView(t.id));
  const showInsights = tabPerms["summary"]?.show_insights !== false;

  const effectiveTab =
    activeTab === "performance" && !selectedBrand.hasGA4 && !selectedBrand.hasGSC ? "hubspot-crm" : activeTab;

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
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateChange={handleDateChange}
          onLogoClick={() => setActiveTab("readme")}
        />
        <TabNav tabs={tabs} activeTab={effectiveTab} onTabChange={setActiveTab} />
      </div>

      <main className="mx-auto max-w-[1400px]">
        <div className="px-2 pt-2">
          <h1 className="px-3 md:px-4 pt-3 md:pt-4 text-sm md:text-lg font-semibold text-foreground">{selectedBrand.name} {effectiveTab === "hubspot" ? "Emails" : effectiveTab === "hubspot-crm" ? "HubSpot CRM" : effectiveTab === "summary" ? "Summary" : effectiveTab === "seo-aeo" ? "SEO & AEO & GEO" : ""} Performance Overview</h1>
        </div>

        {effectiveTab === "performance" && <PerformanceTab key={selectedBrand.id} brand={selectedBrand} dateFrom={dateFrom} dateTo={dateTo} />}
        {effectiveTab === "social" && <SocialMediaTab key={selectedBrand.id} brand={selectedBrand} dateFrom={dateFrom} dateTo={dateTo} />}
        {effectiveTab === "hubspot" && <HubSpotTab key={selectedBrand.id} brand={selectedBrand} dateFrom={dateFrom} dateTo={dateTo} />}
        {effectiveTab === "hubspot-crm" && <HubSpotCRMTab key={selectedBrand.id} brand={selectedBrand} dateFrom={dateFrom} dateTo={dateTo} userEmail={userEmail} />}
        {effectiveTab === "readme" && <ReadMeTab key={selectedBrand.id} brand={selectedBrand} dateFrom={dateFrom} dateTo={dateTo} />}
        {effectiveTab === "summary" && <SummaryTab key={selectedBrand.id} brand={selectedBrand} dateFrom={dateFrom} dateTo={dateTo} showInsights={showInsights} />}
        {effectiveTab === "seo-aeo" && isAdmin && <SeoAeoGeoTab key={selectedBrand.id} brand={selectedBrand} />}
      </main>
    </div>
  );
};

export default Index;
