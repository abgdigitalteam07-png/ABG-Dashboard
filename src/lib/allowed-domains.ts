import { supabase } from "@/integrations/supabase/client";

export async function fetchAllowedDomains(): Promise<string[]> {
  const { data, error } = await supabase.from("allowed_domains").select("domain").order("domain");
  if (error) {
    console.error("Failed to fetch allowed domains:", error);
    return [];
  }
  return data.map((row) => row.domain);
}

export async function isAllowedDomain(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  const domains = await fetchAllowedDomains();
  return domains.includes(domain);
}
