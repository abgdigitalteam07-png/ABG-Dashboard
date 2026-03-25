import { useState, useCallback } from "react";
import { brands } from "@/lib/brands";
import { DashboardHeader } from "@/components/DashboardHeader";
import { TabNav } from "@/components/TabNav";
import { PerformanceTab } from "@/components/PerformanceTab";
import { HubSpotTab } from "@/components/HubSpotTab";
import { ReadMeTab } from "@/components/ReadMeTab";

const Index = () => {
  const [selectedBrand, setSelectedBrand] = useState(brands[0]);
  const [activeTab, setActiveTab] = useState("performance");

  const now = new Date();
  const start365 = new Date(now);
  start365.setDate(start365.getDate() - 365);
  const [dateFrom, setDateFrom] = useState(start365);
  const [dateTo, setDateTo] = useState(now);

  const handleDateChange = useCallback((from: Date, to: Date) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const tabs = [
    {
      id: "readme",
      label: "Read Me",
    },
    {
      id: "performance",
      label: "Google Analytics & Search Console",
      disabled: !selectedBrand.hasGA4 && !selectedBrand.hasGSC,
      tooltip: "No GA4/GSC property linked for this brand.",
    },
    {
      id: "hubspot",
      label: "HubSpot & Emails",
      disabled: !selectedBrand.hasHubSpot,
      tooltip: "No HubSpot data for this brand.",
    },
  ];

  const effectiveTab =
    activeTab === "performance" && !selectedBrand.hasGA4 && !selectedBrand.hasGSC ? "hubspot" : activeTab;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        selectedBrand={selectedBrand}
        onBrandChange={setSelectedBrand}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateChange={handleDateChange}
        onLogoClick={() => setActiveTab("readme")}
      />
      <TabNav tabs={tabs} activeTab={effectiveTab} onTabChange={setActiveTab} />

      <main className="mx-auto max-w-[1400px]">
        <div className="px-2 pt-2">
          <h1 className="px-4 pt-4 text-lg font-semibold text-foreground">{selectedBrand.name} Performance Overview</h1>
        </div>

        {effectiveTab === "performance" && <PerformanceTab brand={selectedBrand} dateFrom={dateFrom} dateTo={dateTo} />}
        {effectiveTab === "hubspot" && <HubSpotTab brand={selectedBrand} dateFrom={dateFrom} dateTo={dateTo} />}
        {effectiveTab === "readme" && <ReadMeTab />}
      </main>
    </div>
  );
};

export default Index;
