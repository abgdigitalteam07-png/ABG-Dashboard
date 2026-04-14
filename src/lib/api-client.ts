import { Brand } from "./brands";
import { generateGA4Data, generateGSCData } from "./mock-data";

const FUNCTIONS_URL = "https://ffxhonryhaadyudpopvv.supabase.co/functions/v1";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmeGhvbnJ5aGFhZHl1ZHBvcHZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Njg4MTMsImV4cCI6MjA4OTM0NDgxM30.Gt9yIzAU_ZmgZhmfDTJioHvMwdUkawtTm7tyrygiHEo";

async function callFunction(name: string, body: any) {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name} returned ${res.status}`);
  return res.json();
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function fetchGA4Data(brand: Brand, dateFrom: Date, dateTo: Date) {
  if (!brand.hasGA4 || !brand.ga4PropertyIds?.length) return null;

  try {
    const data = await callFunction("ga4-data", {
      propertyIds: brand.ga4PropertyIds,
      startDate: formatDate(dateFrom),
      endDate: formatDate(dateTo),
    });
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
    const data = await callFunction("gsc-data", {
      siteUrl: brand.gscSiteUrl,
      startDate: formatDate(dateFrom),
      endDate: formatDate(dateTo),
    });
    if (data?.error === "no_permission") {
      console.warn(`GSC: No permission for ${brand.gscSiteUrl}`);
      return null;
    }
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (err) {
    console.warn("GSC API failed, using mock data:", err);
    return generateGSCData(brand.id, dateFrom, dateTo);
  }
}

export async function fetchHubSpotData(brand: Brand, dateFrom: Date, dateTo: Date) {
  if (!brand.hasHubSpot) return null;

  const data = await callFunction("hubspot-data", {
    brandName: brand.name,
    startDate: formatDate(dateFrom),
    endDate: formatDate(dateTo),
  });
  if (data?.error) throw new Error(data.error);
  return data;
}

export { callFunction, FUNCTIONS_URL, ANON_KEY };
