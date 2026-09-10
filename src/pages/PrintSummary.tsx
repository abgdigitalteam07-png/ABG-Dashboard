import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { brands } from "@/lib/brands";
import { fetchGA4Data, fetchGSCData } from "@/lib/api-client";
import { supabase } from "@/integrations/supabase/client";
import { SummaryPrintView } from "@/components/SummaryPrintView";

// Headless-render target for the automatic scheduled-report PDFs — an Apify
// url-to-pdf actor (see supabase/functions/send-scheduled-report) opens this
// route, waits for the [data-print-ready] marker below, and prints it.
// No AuthGuard: the GA4/GSC edge functions it calls are already public
// (verify_jwt=false), so this route exposes nothing they don't already.
export default function PrintSummary() {
  const [params] = useSearchParams();
  const brandId = params.get("brand") ?? "";
  const days = Number(params.get("days") ?? "7");
  const brand = brands.find((b) => b.id === brandId);

  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<{ ga4: any; gsc: any; channels: any[]; dateFrom: Date; dateTo: Date } | null>(null);

  useEffect(() => {
    if (!brand) return;
    let cancelled = false;

    const dateTo = new Date();
    const dateFrom = new Date(dateTo.getTime() - days * 24 * 60 * 60 * 1000);
    const startDate = dateFrom.toISOString().split("T")[0];
    const endDate = dateTo.toISOString().split("T")[0];

    Promise.all([
      brand.hasGA4 ? fetchGA4Data(brand, dateFrom, dateTo) : Promise.resolve(null),
      brand.hasGSC ? fetchGSCData(brand, dateFrom, dateTo) : Promise.resolve(null),
      brand.hasGA4 && brand.ga4PropertyIds?.length
        ? supabase.functions
            .invoke("ga4-channel-data", { body: { propertyIds: brand.ga4PropertyIds, startDate, endDate } })
            .then(({ data }) => data?.channels ?? [])
            .catch(() => [])
        : Promise.resolve([]),
    ]).then(([ga4, gsc, channels]) => {
      if (cancelled) return;
      setResult({ ga4, gsc, channels, dateFrom, dateTo });
      // Give Recharts a moment to paint its SVGs before signalling ready —
      // mirrors the wait buildReportPdf() uses before html2canvas captures.
      setTimeout(() => { if (!cancelled) setReady(true); }, 1200);
    });

    return () => { cancelled = true; };
  }, [brandId, days]);

  if (!brand) return <div style={{ padding: 40, fontFamily: "sans-serif" }}>Unknown brand.</div>;
  if (!result) return <div style={{ padding: 40, fontFamily: "sans-serif" }}>Loading…</div>;

  return (
    <div data-print-ready={ready ? "true" : undefined}>
      <SummaryPrintView
        brand={brand}
        dateFrom={result.dateFrom}
        dateTo={result.dateTo}
        ga4={result.ga4}
        gsc={result.gsc}
        channels={result.channels}
        recommendations={[]}
      />
    </div>
  );
}
