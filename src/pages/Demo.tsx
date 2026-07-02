import { useState } from "react";
import { DemoWatermark } from "@/components/demo/DemoWatermark";
import { HubSpotTopBar } from "@/components/demo/HubSpotTopBar";
import { HubSpotSidebar } from "@/components/demo/HubSpotSidebar";
import { HubSpotActionBar } from "@/components/demo/HubSpotActionBar";
import { HubSpotFilterBar } from "@/components/demo/HubSpotFilterBar";
import { DemoPerformanceTab } from "@/components/demo/DemoPerformanceTab";
import { DemoSocialMediaTab } from "@/components/demo/DemoSocialMediaTab";
import { DemoEmailsTab } from "@/components/demo/DemoEmailsTab";
import { DemoHubSpotCRMTab } from "@/components/demo/DemoHubSpotCRMTab";
import { DEMO_BRAND_NAME } from "@/lib/demoData";

export default function Demo() {
  const [activeTab, setActiveTab] = useState("hubspot-crm");

  const title =
    activeTab === "hubspot"     ? `${DEMO_BRAND_NAME} – Email Performance` :
    activeTab === "hubspot-crm" ? `${DEMO_BRAND_NAME} – CRM Performance Dashboard` :
    activeTab === "social"      ? `${DEMO_BRAND_NAME} – Social Media Performance` :
                                  `${DEMO_BRAND_NAME} – Web Performance`;

  return (
    <div className="min-h-screen bg-[#F5F8FA] text-[#33475B]">
      <DemoWatermark />
      <HubSpotTopBar />

      <div className="flex">
        <HubSpotSidebar activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="flex-1 min-w-0">
          <HubSpotActionBar title={title} />
          <HubSpotFilterBar />

          <main>
            {activeTab === "performance" && <DemoPerformanceTab />}
            {activeTab === "social" && <DemoSocialMediaTab />}
            {activeTab === "hubspot" && <DemoEmailsTab />}
            {activeTab === "hubspot-crm" && <DemoHubSpotCRMTab />}
          </main>
        </div>
      </div>
    </div>
  );
}
