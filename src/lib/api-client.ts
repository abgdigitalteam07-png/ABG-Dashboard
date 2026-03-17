import { supabase } from "@/integrations/supabase/client";
import { Brand } from "./brands";
import { generateGA4Data, generateGSCData, generateHubSpotData } from "./mock-data";

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function fetchGA4Data(brand: Brand, dateFrom: Date, dateTo: Date) {
  if (!brand.hasGA4 || !brand.ga4PropertyIds?.length) return null;

  try {
    const { data, error } = await supabase.functions.invoke("ga4-data", {
      body: {
        propertyIds: brand.ga4PropertyIds,
        startDate: formatDate(dateFrom),
        endDate: formatDate(dateTo),
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (err) {
    console.warn("GA4 API failed, using mock data:", err);
    return generateGA4Data(brand.id, dateFrom, dateTo);
  }
}

export async function fetchGSCData(brand: Brand, dateFrom: Date, dateTo: Date) {
  if (!brand.hasGSC || !brand.gscSiteUrl) return null;

  try {
    const { data, error } = await supabase.functions.invoke("gsc-data", {
      body: {
        siteUrl: brand.gscSiteUrl,
        startDate: formatDate(dateFrom),
        endDate: formatDate(dateTo),
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (err) {
    console.warn("GSC API failed, using mock data:", err);
    return generateGSCData(brand.id, dateFrom, dateTo);
  }
}

export async function fetchHubSpotData(brand: Brand, dateFrom: Date, dateTo: Date) {
  if (!brand.hasHubSpot || !brand.hubspotName) return null;

  try {
    const { data, error } = await supabase.functions.invoke("hubspot-data", {
      body: {
        brandName: brand.hubspotName,
        startDate: formatDate(dateFrom),
        endDate: formatDate(dateTo),
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (err) {
    console.warn("HubSpot API failed, using mock data:", err);
    return generateHubSpotData(brand.id, dateFrom, dateTo);
  }
}
