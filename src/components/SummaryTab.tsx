import { useEffect, useState, useMemo, useRef } from "react";
import * as ReactDOM from "react-dom/client";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/lib/brands";
import { fetchGA4Data, fetchGSCData, fetchHubSpotData } from "@/lib/api-client";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { generateRecommendations } from "@/lib/recommendation-rules";
import { SummaryPrintView } from "@/components/SummaryPrintView";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, WifiOff, Download, Mail, Send, Calendar, Clock, Pencil, ChevronDown, ChevronUp, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

const DOW_LABELS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

interface EmailSchedule {
  id: string;
  brand_id: string;
  brand_name: string;
  recipients: string[];
  day_of_week: number;
  send_hour_utc: number;
  date_range_days: number;
  is_active: boolean;
  last_sent_at: string | null;
}
import {
  AreaChart, Area, BarChart, Bar,
  LineChart, Line, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MultiBrandLineChart } from "@/components/MultiBrandLineChart";
import { mergeCountSeries, sumKpi, recomputeRateKpi } from "@/lib/mergeBrandSeries";

interface SummaryTabProps {
  brand: Brand;
  brands?: Brand[];
  dateFrom: Date;
  dateTo: Date;
  showInsights?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null): string {
  if (n == null || (n === 0)) return n === 0 ? "0" : "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 100_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function fmtPct(n: number | string | undefined | null, decimals = 1): string {
  if (n == null) return "—";
  return parseFloat(String(n)).toFixed(decimals) + "%";
}

function buildExecutiveSummary(brand: string, ga4: any, gsc: any, dateFrom: Date, dateTo: Date): string {
  const parts: string[] = [];

  if (ga4) {
    const sd = ga4.sessionsDelta;
    const osd = ga4.organicSessionsDelta;
    if (sd != null) {
      const dir = sd >= 0 ? "up" : "down";
      parts.push(`Traffic is ${dir} ${Math.abs(sd).toFixed(1)}% vs. the prior period — ${fmt(ga4.sessions)} sessions with ${fmt(ga4.pageViews)} pageviews.`);
    }
    if (osd != null) {
      if (osd >= 5) parts.push(`Organic search is driving growth at +${osd.toFixed(1)}%, indicating strong SEO momentum.`);
      else if (osd < -5) parts.push(`Organic traffic is down ${Math.abs(osd).toFixed(1)}%, warranting a closer look at search rankings.`);
    }
  }

  if (gsc) {
    const pos = gsc.averagePosition;
    const ctr = parseFloat(gsc.averageCTR ?? 0);
    const imp = gsc.totalImpressions;
    if (imp > 0) {
      parts.push(
        `Search visibility: ${fmt(imp)} impressions, ${fmt(gsc.totalClicks)} clicks` +
        (ctr ? ` (${ctr.toFixed(1)}% CTR)` : "") +
        (pos ? `, avg. position #${pos.toFixed(1)}` : "") +
        "."
      );
    }
  }

  if (parts.length === 0) {
    return `Performance report for ${brand} — ${format(dateFrom, "MMM d")}–${format(dateTo, "MMM d, yyyy")}. Connect additional data sources to unlock the full executive summary.`;
  }

  return parts.join(" ");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label, source }: { label: string; source?: string }) {
  return (
    <div className="flex items-center justify-between border-l-[3px] border-l-brand-red pl-3 py-0.5 mb-4">
      <h2 className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground">{label}</h2>
      {source && <span className="text-[11px] text-muted-foreground">{source}</span>}
    </div>
  );
}

interface KpiTileProps {
  label: string;
  value: string;
  delta?: number | null;
  sub?: string;
  loading?: boolean;
  invertDelta?: boolean;
}

function KpiTile({ label, value, delta, sub, loading, invertDelta }: KpiTileProps) {
  if (loading) {
    return (
      <div className="flex-1 min-w-[120px] flex flex-col gap-2 px-5 py-5 border-r border-border last:border-r-0">
        <div className="h-9 w-24 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-12 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  const isGood = invertDelta ? (delta ?? 0) <= 0 : (delta ?? 0) >= 0;
  return (
    <div className="flex-1 min-w-[120px] flex flex-col gap-0.5 px-5 py-5 border-r border-border last:border-r-0">
      <p className="text-[28px] font-black tabular-nums tracking-tight text-foreground leading-none">{value}</p>
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mt-2">{label}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      {delta != null && (
        <div className={`flex items-center gap-1 text-[11px] font-semibold mt-1 ${isGood ? "text-emerald-600" : "text-red-600"}`}>
          {isGood ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta >= 0 ? "+" : ""}{delta.toFixed(1)}% WoW
        </div>
      )}
    </div>
  );
}

function NoDataNote({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </div>
  );
}

const CHANNEL_COLORS: Record<string, string> = {
  "Organic Search":   "#16a34a",
  "Direct":           "#2563eb",
  "Referral":         "#7c3aed",
  "Email":            "#ea580c",
  "Unassigned":       "#94a3b8",
  "Paid Search":      "#dc2626",
  "Organic Social":   "#db2777",
  "Organic Shopping": "#d97706",
  "Organic Video":    "#0891b2",
};

function TrafficSourcesChart({ channels }: { channels: any[] }) {
  const total = channels.reduce((s, c) => s + c.sessions, 0);
  const top = [...channels].sort((a, b) => b.sessions - a.sessions).slice(0, 7);
  return (
    <div className="space-y-2.5">
      {top.map((ch) => {
        const pct = total > 0 ? (ch.sessions / total) * 100 : 0;
        const color = CHANNEL_COLORS[ch.channel] ?? "#9ca3af";
        return (
          <div key={ch.channel} className="flex items-center gap-3">
            <div className="w-28 text-right text-[11px] text-muted-foreground truncate shrink-0">{ch.channel}</div>
            <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
              <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <div className="w-14 text-right text-[11px] font-semibold tabular-nums text-foreground">
              {ch.sessions.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="mb-1 font-semibold text-muted-foreground">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.fill }} />
          <span className="text-foreground font-medium">{fmt(p.value)}</span>
          <span className="text-muted-foreground">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SummaryTab({ brand, brands, dateFrom, dateTo, showInsights = true }: SummaryTabProps) {
  const [ga4, setGa4]             = useState<any>(null);
  const [gsc, setGsc]             = useState<any>(null);
  const [gscPrior, setGscPrior]   = useState<any>(null);
  const [hubspot, setHubspot]     = useState<any>(null);
  const [channels, setChannels]       = useState<any[]>([]);
  const [channelsPrior, setChannelsPrior] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const showLoader = useFirstLoad(loading);

  const isMulti = !!brands && brands.length > 1;
  const [multiGa4, setMultiGa4] = useState<{ brand: Brand; data: any }[]>([]);
  const [multiGsc, setMultiGsc] = useState<{ brand: Brand; data: any }[]>([]);
  const [multiLoading, setMultiLoading] = useState(false);

  useEffect(() => {
    if (!isMulti) { setMultiGa4([]); setMultiGsc([]); return; }
    let cancelled = false;
    setMultiLoading(true);

    Promise.all(
      brands!.map(async (b) => ({
        brand: b,
        ga4: b.hasGA4 ? await fetchGA4Data(b, dateFrom, dateTo) : null,
        gsc: b.hasGSC ? await fetchGSCData(b, dateFrom, dateTo) : null,
      })),
    ).then((results) => {
      if (cancelled) return;
      setMultiGa4(results.filter((r) => r.ga4).map((r) => ({ brand: r.brand, data: r.ga4 })));
      setMultiGsc(results.filter((r) => r.gsc).map((r) => ({ brand: r.brand, data: r.gsc })));
      setMultiLoading(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMulti, brands?.map((b) => b.id).join(","), dateFrom.getTime(), dateTo.getTime()]);

  const multiSessionsData = useMemo(() => {
    if (!isMulti) return [];
    return mergeCountSeries(
      multiGa4.map(({ brand: b, data: d }) => ({
        brand: b,
        data: (d.sessionsOverTime || []).map((x: any) => ({ date: x.date, value: x.value })),
      })),
    );
  }, [isMulti, multiGa4]);

  const multiClicksData = useMemo(() => {
    if (!isMulti) return [];
    return mergeCountSeries(
      multiGsc.map(({ brand: b, data: d }) => ({
        brand: b,
        data: (d.clicksImpressionsOverTime || []).map((x: any) => ({ date: x.date, value: x.clicks })),
      })),
    );
  }, [isMulti, multiGsc]);

  const multiImpressionsData = useMemo(() => {
    if (!isMulti) return [];
    return mergeCountSeries(
      multiGsc.map(({ brand: b, data: d }) => ({
        brand: b,
        data: (d.clicksImpressionsOverTime || []).map((x: any) => ({ date: x.date, value: x.impressions })),
      })),
    );
  }, [isMulti, multiGsc]);

  const multiKpi = useMemo(() => {
    if (!isMulti) return null;
    const sessions = sumKpi(multiGa4.map((x) => x.data.sessions || 0));
    const pageViews = sumKpi(multiGa4.map((x) => x.data.pageViews || 0));
    const organicSessions = sumKpi(multiGa4.map((x) => x.data.organicSessions || 0));
    const totalClicks = sumKpi(multiGsc.map((x) => x.data.totalClicks || 0));
    const totalImpressions = sumKpi(multiGsc.map((x) => x.data.totalImpressions || 0));
    const averageCTR = recomputeRateKpi(totalClicks, totalImpressions);
    const weightedPos = multiGsc.reduce((sum, x) => sum + (x.data.averagePosition || 0) * (x.data.totalImpressions || 0), 0);
    const averagePosition = totalImpressions > 0 ? weightedPos / totalImpressions : 0;
    return { sessions, pageViews, organicSessions, totalClicks, totalImpressions, averageCTR, averagePosition };
  }, [isMulti, multiGa4, multiGsc]);

  // ── Email schedule state ───────────────────────────────────────────────────
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [brandSchedule, setBrandSchedule] = useState<EmailSchedule | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [schedForm, setSchedForm] = useState({
    recipients: "mali@americanbathgroup.com",
    day_of_week: 1,
    send_hour_utc: 8,
    date_range_days: 7,
    is_active: true,
  });
  const [recipientInput, setRecipientInput] = useState("");
  const [recipientsList, setRecipientsList] = useState<string[]>(["mali@americanbathgroup.com"]);
  const [schedSaving, setSchedSaving] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAdmin(session?.user?.email === "mali@americanbathgroup.com");
    });
  }, []);

  // Silently load schedule on mount so the button shows status before dialog opens
  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("email_schedules")
      .select("*")
      .eq("brand_id", brand.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setBrandSchedule(data as EmailSchedule);
          setRecipientsList(data.recipients);
          setSchedForm({
            recipients: data.recipients.join(", "),
            day_of_week: data.day_of_week,
            send_hour_utc: data.send_hour_utc,
            date_range_days: data.date_range_days,
            is_active: data.is_active,
          });
        }
      });
  }, [isAdmin, brand.id]);

  async function openEmailDialog() {
    setRecipientInput("");
    setEmailDialogOpen(true);
  }

  async function saveSchedule() {
    setSchedSaving(true);
    if (!recipientsList.length) {
      toast.error("Add at least one recipient email");
      setSchedSaving(false);
      return;
    }
    const payload = {
      brand_id: brand.id,
      brand_name: brand.name,
      recipients: recipientsList,
      day_of_week: schedForm.day_of_week,
      send_hour_utc: schedForm.send_hour_utc,
      date_range_days: schedForm.date_range_days,
      is_active: schedForm.is_active,
    };
    // Upsert on brand_id — guarantees one schedule per brand, no duplicates
    const { data } = await supabase
      .from("email_schedules")
      .upsert(payload, { onConflict: "brand_id" })
      .select()
      .single();
    if (data) setBrandSchedule(data as EmailSchedule);
    setSchedSaving(false);
    toast.success(brandSchedule ? "Schedule updated" : "Schedule created");
    setEmailDialogOpen(false);
  }

  async function sendNow() {
    if (!brandSchedule) { toast.error("Save a schedule first, then use Send Now"); return; }
    setSendingNow(true);
    try {
      const { error } = await supabase.functions.invoke("send-scheduled-report", {
        body: { schedule_id: brandSchedule.id },
      });
      if (error) throw error;
      toast.success(`Report sent to ${brandSchedule.recipients.join(", ")}`);
    } catch {
      toast.error("Failed to send — check Edge Function logs");
    } finally {
      setSendingNow(false);
    }
  }

  async function sendTestEmail() {
    if (!recipientsList.length) {
      toast.error("Add at least one recipient email");
      return;
    }
    setSendingNow(true);
    try {
      // Build the PDF for the period selected in the dialog — not necessarily
      // the same range the main dashboard is currently showing.
      const days        = schedForm.date_range_days;
      const pdfDateTo   = new Date();
      const pdfDateFrom = new Date(pdfDateTo.getTime() - days * 24 * 60 * 60 * 1000);

      const [pdfGa4, pdfGsc, pdfChannels] = await Promise.all([
        brand.hasGA4 ? fetchGA4Data(brand, pdfDateFrom, pdfDateTo) : Promise.resolve(null),
        brand.hasGSC ? fetchGSCData(brand, pdfDateFrom, pdfDateTo) : Promise.resolve(null),
        brand.hasGA4 && brand.ga4PropertyIds?.length
          ? supabase.functions
              .invoke("ga4-channel-data", {
                body: {
                  propertyIds: brand.ga4PropertyIds,
                  startDate: pdfDateFrom.toISOString().split("T")[0],
                  endDate:   pdfDateTo.toISOString().split("T")[0],
                },
              })
              .then(({ data }) => data?.channels ?? [])
              .catch(() => [])
          : Promise.resolve([]),
      ]);

      // Same raster resolution + format as "Download Report" — pixel-identical
      // colors. Uploading to Storage (rather than emailing the bytes directly)
      // sidesteps the Edge Function's ~2MB resource ceiling entirely.
      const { pdf, filename } = await buildReportPdf(pdfDateFrom, pdfDateTo, pdfGa4, pdfGsc, pdfChannels);
      const pdfBlob = pdf.output("blob") as Blob;

      const storagePath = `${brand.id}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("report-pdfs")
        .upload(storagePath, pdfBlob, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("report-pdfs").getPublicUrl(storagePath);
      const downloadUrl = `${publicUrl}?download=${encodeURIComponent(filename)}`;

      const { error } = await supabase.functions.invoke("send-test-email", {
        body: {
          recipients: recipientsList,
          brand_id: brand.id,
          brand_name: brand.name,
          date_range_days: days,
          pdf_url: downloadUrl,
          pdf_filename: filename,
        },
      });
      if (error) throw error;
      toast.success(`Test email sent to ${recipientsList.join(", ")}`);
    } catch (err) {
      console.error("Test email failed:", err);
      toast.error("Failed to send test email — check Edge Function logs");
    } finally {
      setSendingNow(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setGa4(null); setGsc(null); setGscPrior(null); setHubspot(null); setChannels([]); setChannelsPrior([]);

    const startDate = dateFrom.toISOString().split("T")[0];
    const endDate   = dateTo.toISOString().split("T")[0];

    // Prior period: same duration, shifted back immediately before dateFrom
    const periodMs   = dateTo.getTime() - dateFrom.getTime();
    const priorTo    = new Date(dateFrom.getTime() - 86_400_000); // day before current period starts
    const priorFrom  = new Date(priorTo.getTime() - periodMs);
    const priorStart = priorFrom.toISOString().split("T")[0];
    const priorEnd   = priorTo.toISOString().split("T")[0];

    const channelFetch = brand.hasGA4 && brand.ga4PropertyIds?.length
      ? supabase.functions
          .invoke("ga4-channel-data", { body: { propertyIds: brand.ga4PropertyIds, startDate, endDate } })
          .then(({ data }) => data?.channels ?? []).catch(() => [])
      : Promise.resolve([]);

    const channelPriorFetch = brand.hasGA4 && brand.ga4PropertyIds?.length
      ? supabase.functions
          .invoke("ga4-channel-data", { body: { propertyIds: brand.ga4PropertyIds, startDate: priorStart, endDate: priorEnd } })
          .then(({ data }) => data?.channels ?? []).catch(() => [])
      : Promise.resolve([]);

    Promise.all([
      brand.hasGA4    ? fetchGA4Data(brand, dateFrom, dateTo)                        : Promise.resolve(null),
      brand.hasGSC    ? fetchGSCData(brand, dateFrom, dateTo)                        : Promise.resolve(null),
      brand.hasGSC    ? fetchGSCData(brand, priorFrom, priorTo).catch(() => null)    : Promise.resolve(null),
      brand.hasHubSpot? fetchHubSpotData(brand, dateFrom, dateTo).catch(() => null)  : Promise.resolve(null),
      channelFetch,
      channelPriorFetch,
    ]).then(([ga4Data, gscData, gscPriorData, hubspotData, channelData, channelPriorData]) => {
      if (cancelled) return;
      setGa4(ga4Data); setGsc(gscData); setGscPrior(gscPriorData);
      setHubspot(hubspotData); setChannels(channelData); setChannelsPrior(channelPriorData);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [brand.id, dateFrom.getTime(), dateTo.getTime()]);

  const recommendations = useMemo(() => {
    function computeDelta(series: any[], key: string): number | null {
      if (!series || series.length < 4) return null;
      const mid = Math.floor(series.length / 2);
      const prev = series.slice(0, mid).reduce((s: number, d: any) => s + (d[key] ?? 0), 0);
      const curr = series.slice(mid).reduce((s: number, d: any) => s + (d[key] ?? 0), 0);
      if (prev === 0) return null;
      return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
    }

    const sessionsDelta    = computeDelta(ga4?.sessionsOverTime, "sessions");
    const impressionsDelta = computeDelta(gsc?.clicksImpressionsOverTime, "impressions");
    const clicksDelta      = computeDelta(gsc?.clicksImpressionsOverTime, "clicks");

    // Per-page comparison: current period vs prior period
    const pageComparison = (() => {
      const curr = gsc?.topLandingPages ?? [];
      const prior = gscPrior?.topLandingPages ?? [];
      if (!curr.length || !prior.length) return [];
      const priorMap = new Map<string, any>(prior.map((p: any) => [p.page, p] as [string, any]));
      return curr.map((c: any) => {
        const p = priorMap.get(c.page);
        if (!p) return null;
        return {
          page:            c.page,
          prevImpressions: p.impressions,  currImpressions: c.impressions,
          prevClicks:      p.clicks,       currClicks:      c.clicks,
          prevCTR:         p.ctr,          currCTR:         c.ctr,
          prevPosition:    p.position,     currPosition:    c.position,
          imprDelta:  p.impressions > 0 ? ((c.impressions - p.impressions) / p.impressions) * 100 : null,
          clickDelta: p.clicks > 0       ? ((c.clicks - p.clicks) / p.clicks) * 100               : null,
          posDelta:   c.position - p.position,  // positive = ranking got worse
        };
      }).filter(Boolean);
    })();

    // Pages that existed in prior period but completely vanished from current period
    // These are the strongest signal for missing 301 redirects after a site relaunch
    const disappearedPages = (() => {
      const prior = gscPrior?.topLandingPages ?? [];
      const curr  = gsc?.topLandingPages ?? [];
      if (!prior.length || !curr.length) return [];
      const currUrls = new Set(curr.map((p: any) => p.page));
      return prior
        .filter((p: any) => !currUrls.has(p.page) && p.impressions > 50)
        .sort((a: any, b: any) => b.impressions - a.impressions);
    })();

    // Per-channel comparison: current period vs prior period
    const channelComparison = (() => {
      if (!channels.length || !channelsPrior.length) return [];
      const priorMap = new Map(channelsPrior.map((c: any) => [c.channel, c]));
      return channels.map((c: any) => {
        const p = priorMap.get(c.channel);
        const currSess = c.sessions ?? c.users ?? 0;
        const prevSess = p ? (p.sessions ?? p.users ?? 0) : 0;
        return {
          channel: c.channel,
          prev:    prevSess,
          curr:    currSess,
          delta:   prevSess > 0 ? ((currSess - prevSess) / prevSess) * 100 : null,
        };
      });
    })();

    const periodDays = Math.round((dateTo.getTime() - dateFrom.getTime()) / 86_400_000);

    const m: Record<string, any> = {
      sessionsDelta,
      organicSessionsDelta: computeDelta(ga4?.sessionsOverTime, "organicSessions") ?? ga4?.organicSessionsDelta,
      totalImpressionsDelta: impressionsDelta,
      totalClicksDelta: clicksDelta,
      averageCTR:       gsc?.averageCTR,
      averagePosition:  gsc?.averagePosition,
      totalSessions:    ga4?.sessions,
      totalImpressions: gsc?.totalImpressions,
      totalClicks:      gsc?.totalClicks,
      impressionsSeries: gsc?.clicksImpressionsOverTime ?? [],
      sessionsSeries:    ga4?.sessionsOverTime ?? [],
      periodDays,
      channels,
      channelComparison,
      topQueries:      gsc?.topQueries ?? [],
      topLandingPages: gsc?.topLandingPages ?? [],
      pageComparison,
      disappearedPages,
      canonicalIssue:  gsc?.canonicalIssue ?? null,
      brandName: brand.name,
      dateFrom,
      dateTo,
    };
    return generateRecommendations("summary", m);
  }, [ga4, gsc, gscPrior, channels, channelsPrior, brand.name, dateFrom, dateTo]);

  const execSummary = useMemo(
    () => buildExecutiveSummary(brand.name, ga4, gsc, dateFrom, dateTo),
    [brand.name, ga4, gsc, dateFrom, dateTo]
  );

  const axisStyle  = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };
  const gridColor  = "hsl(var(--border))";
  const reportRef  = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  async function buildReportPdf(
    pdfDateFrom: Date,
    pdfDateTo: Date,
    pdfGa4: any,
    pdfGsc: any,
    pdfChannels: any[],
    opts?: { scale?: number; imageFormat?: "PNG" | "JPEG"; jpegQuality?: number }
  ) {
    const rasterScale  = opts?.scale ?? 2;
    const imageFormat  = opts?.imageFormat ?? "PNG";
    const jpegQuality  = opts?.jpegQuality ?? 0.8;
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    // Off-screen container — must be position:absolute (not fixed) so
    // offsetHeight reflects real content height, not viewport height.
    const container = document.createElement("div");
    container.style.cssText = [
      "position:absolute",
      "top:0",
      "left:-9999px",
      "width:794px",
      "background:#fff",
      "z-index:-1",
      "overflow:visible",
    ].join(";");
    document.body.appendChild(container);

    const root = ReactDOM.createRoot(container);
    root.render(
      <SummaryPrintView
        brand={brand}
        dateFrom={pdfDateFrom}
        dateTo={pdfDateTo}
        ga4={pdfGa4}
        gsc={pdfGsc}
        channels={pdfChannels}
        recommendations={[]}
      />
    );

    // Wait for React + Recharts SVGs to paint
    await new Promise(r => setTimeout(r, 1500));

    const el = container.firstElementChild as HTMLElement;
    const scale = rasterScale;
    const elW = el.offsetWidth;
    const elH = el.offsetHeight;

    // Collect safe break Y-positions from data-pb markers BEFORE capturing.
    // These are the Gap() divs between sections — always safe to cut here.
    const pbEls = Array.from(el.querySelectorAll("[data-pb]")) as HTMLElement[];
    // Convert DOM px → canvas px (scale=2). Use the mid-point of each gap.
    const safeBreaks: number[] = pbEls.map(
      (e) => Math.round((e.offsetTop + e.offsetHeight / 2) * scale)
    );
    // Always include start and end
    safeBreaks.unshift(0);
    safeBreaks.push(elH * scale);

    const canvas = await html2canvas(el, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: elW,
      height: elH,
      windowWidth: elW,
      windowHeight: elH,
      scrollX: 0,
      scrollY: 0,
    });

    root.unmount();
    document.body.removeChild(container);

    // A4: 210 × 297 mm. canvas.width = elW * scale.
    const pdf     = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWmm = 210;
    const pageHmm = 297;
    const pxPerMm = canvas.width / pageWmm;
    const pageHpx = Math.round(pageHmm * pxPerMm);

    // For each page boundary, pick the nearest safe break that doesn't
    // overshoot the page limit — guarantees cuts always land between sections.
    function pickBreak(fromY: number): number {
      const target = fromY + pageHpx;
      if (target >= canvas.height) return canvas.height;
      // Find safe break points between fromY and target
      const candidates = safeBreaks.filter(b => b > fromY && b <= target);
      // Pick the one closest to (but not past) target
      return candidates.length > 0
        ? candidates[candidates.length - 1]
        : target; // fallback: hard cut at A4 boundary
    }

    let srcY = 0;
    let page = 0;

    while (srcY < canvas.height) {
      const breakY = pickBreak(srcY);
      const sliceH = breakY - srcY;
      if (sliceH <= 0) break;

      const slice = document.createElement("canvas");
      slice.width  = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      if (page > 0) pdf.addPage();
      const sliceDataUrl = imageFormat === "JPEG"
        ? slice.toDataURL("image/jpeg", jpegQuality)
        : slice.toDataURL("image/png");
      pdf.addImage(sliceDataUrl, imageFormat, 0, 0, pageWmm, sliceH / pxPerMm);

      srcY = breakY;
      page++;
    }

    const safeName = brand.name.replace(/[^a-zA-Z0-9]/g, "_");
    const from     = format(pdfDateFrom, "yyyy-MM-dd");
    const to       = format(pdfDateTo,   "yyyy-MM-dd");
    return { pdf, filename: `${safeName}_${from}_${to}.pdf` };
  }

  async function handleDownloadPDF() {
    setExporting(true);
    try {
      const { pdf, filename } = await buildReportPdf(dateFrom, dateTo, ga4, gsc, channels);
      pdf.save(filename);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  if (showLoader || (isMulti && multiLoading)) return <WaterFillLoader fullScreen={false} message="Building report…" />;

  if (isMulti) {
    if (!multiGa4.length && !multiGsc.length) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-sm font-medium text-foreground">None of the selected brands have GA4/GSC data.</p>
        </div>
      );
    }
    const k = multiKpi!;
    const gaBrands = multiGa4.map((x) => x.brand);
    const gscBrands = multiGsc.map((x) => x.brand);
    return (
      <div className="p-6 space-y-8 max-w-[1400px] bg-background">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-red mb-1">Performance Report Brief</p>
          <h1 className="text-3xl font-black text-foreground leading-tight">{brands!.length} Brands</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(dateFrom, "MMM d")} – {format(dateTo, "MMM d, yyyy")}
          </p>
        </div>

        <div>
          <SectionHeader label="Overview" />
          <div className="flex flex-wrap border border-border rounded-lg overflow-hidden">
            <KpiTile label="Sessions" value={fmt(k.sessions)} />
            <KpiTile label="Organic Sessions" value={fmt(k.organicSessions)} />
            <KpiTile label="Page Views" value={fmt(k.pageViews)} />
            <KpiTile label="Impressions" value={fmt(k.totalImpressions)} />
            <KpiTile label="Clicks" value={fmt(k.totalClicks)} />
            <KpiTile label="Avg CTR" value={fmtPct(k.averageCTR)} />
          </div>
        </div>

        {gaBrands.length > 0 && (
          <div>
            <SectionHeader label="Sessions Over Time" source="Google Analytics" />
            <div className="rounded-lg border border-border p-4">
              <MultiBrandLineChart data={multiSessionsData} brands={gaBrands} valueFormatter={fmt} />
            </div>
          </div>
        )}

        {gscBrands.length > 0 && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <SectionHeader label="Clicks Over Time" source="Search Console" />
              <div className="rounded-lg border border-border p-4">
                <MultiBrandLineChart data={multiClicksData} brands={gscBrands} valueFormatter={fmt} />
              </div>
            </div>
            <div>
              <SectionHeader label="Impressions Over Time" source="Search Console" />
              <div className="rounded-lg border border-border p-4">
                <MultiBrandLineChart data={multiImpressionsData} brands={gscBrands} valueFormatter={fmt} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={reportRef} className="p-6 space-y-8 max-w-[1400px] bg-background">

      {/* ── 1. HEADER ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-start justify-between pb-3 border-b border-border">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-red mb-1">
              Performance Report Brief
            </p>
            <h1 className="text-3xl font-black text-foreground leading-tight">{brand.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {format(dateFrom, "MMM d")} – {format(dateTo, "MMM d, yyyy")} · {Math.round((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))} days
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="text-[11px] text-muted-foreground">Issued {format(new Date(), "MMM d, yyyy")}</p>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[11px] font-semibold transition-colors ${
                        brandSchedule
                          ? "border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-700"
                          : "border-border bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {brandSchedule
                        ? `Scheduled · ${DOW_LABELS[brandSchedule.day_of_week]}s`
                        : "Email this dashboard"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="end">
                    {brandSchedule ? (
                      <div className="space-y-4 p-4">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2">Schedule Status</p>
                          <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
                            <div className="h-2 w-2 rounded-full bg-emerald-500" />
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Active</span>
                          </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-border">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Send Day & Time</p>
                            <p className="text-sm font-semibold text-foreground mt-1">
                              {DOW_LABELS[brandSchedule.day_of_week]}s at {String(brandSchedule.send_hour_utc).padStart(2,"0")}:00 UTC
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recipients</p>
                            <div className="mt-1 space-y-1">
                              {brandSchedule.recipients.map((email, idx) => (
                                <p key={idx} className="text-xs text-foreground font-mono bg-muted/40 rounded px-2 py-1">
                                  {email}
                                </p>
                              ))}
                            </div>
                          </div>

                          {brandSchedule.last_sent_at && (
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Last Sent</p>
                              <p className="text-xs text-foreground mt-1">{format(new Date(brandSchedule.last_sent_at), "MMM d, yyyy 'at' h:mm a")}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2 pt-2 border-t border-border">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-[11px]"
                            disabled={sendingNow}
                            onClick={() => {
                              sendNow();
                            }}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            {sendingNow ? "Sending…" : "Send Now"}
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 bg-brand-red hover:bg-brand-red/90 text-[11px]"
                            onClick={() => {
                              setEmailDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 p-4">
                        <p className="text-sm text-foreground font-semibold">No schedule yet</p>
                        <p className="text-xs text-muted-foreground">Create a schedule to send this report automatically to your team.</p>
                        <Button
                          className="w-full bg-brand-red hover:bg-brand-red/90"
                          size="sm"
                          onClick={() => {
                            setEmailDialogOpen(true);
                          }}
                        >
                          <Mail className="h-3 w-3 mr-1.5" />
                          Create Schedule
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )}
              <button
                onClick={handleDownloadPDF}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-red text-white text-[11px] font-semibold hover:bg-brand-red/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5" />
                {exporting ? "Exporting…" : "Download Report"}
              </button>
            </div>
          </div>
        </div>
        {/* meta bar */}
        <div className="flex items-center justify-between pt-2 text-[11px] text-muted-foreground">
          <span>{brand.name}</span>
          <span className="flex gap-3">
            {brand.hasGA4 && <span>Google Analytics 4</span>}
            {brand.hasGSC && <span>Search Console</span>}
            {brand.hasHubSpot && <span>HubSpot</span>}
          </span>
          <span>Direct-to-Consumer + Trade</span>
        </div>
      </div>

      {/* ── 2. EXECUTIVE SUMMARY ──────────────────────────────────────────── */}
      <div className="border-l-4 border-l-brand-red bg-muted/40 px-5 py-4 rounded-r-lg">
        {loading ? (
          <div className="space-y-2">
            <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <p className="text-sm text-foreground leading-relaxed font-medium">{execSummary}</p>
        )}
      </div>

      {/* ── 3. KPI STRIP ──────────────────────────────────────────────────── */}
      {(brand.hasGA4 || brand.hasGSC) && (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          <div className="flex flex-wrap divide-y divide-border md:divide-y-0 md:divide-x divide-border">
            {brand.hasGA4 && (
              <>
                <KpiTile loading={loading} label="Active Users" value={fmt(ga4?.activeUsers1Day)} delta={ga4?.activeUsers1DayDelta}
                  sub={ga4 && !loading ? `${fmt(ga4.sessions)} sessions` : undefined} />
                <KpiTile loading={loading} label="Sessions" value={fmt(ga4?.sessions)} delta={ga4?.sessionsDelta}
                  sub={ga4 && !loading ? `${fmt(ga4.pageViews)} pageviews` : undefined} />
                <KpiTile loading={loading} label="Organic Sessions" value={fmt(ga4?.organicSessions)} delta={ga4?.organicSessionsDelta} />
              </>
            )}
            {brand.hasGSC && (
              <>
                <KpiTile loading={loading} label="Search Impressions" value={fmt(gsc?.totalImpressions)} delta={gsc?.totalImpressionsDelta} />
                <KpiTile loading={loading} label="Search Clicks" value={fmt(gsc?.totalClicks)} delta={gsc?.totalClicksDelta} />
                <KpiTile loading={loading} label="Avg. Position" value={gsc?.averagePosition?.toFixed(1) ?? "—"} delta={gsc?.averagePositionDelta} invertDelta
                  sub={gsc && !loading ? `${fmtPct(gsc?.averageCTR)} CTR` : undefined} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 4. TWO CHARTS SIDE BY SIDE (Sessions | Traffic Sources) ──────── */}
      {brand.hasGA4 && !loading && (ga4?.sessionsOverTime?.length > 0 || channels.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sessions bar chart */}
          {ga4?.sessionsOverTime?.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground mb-4">
                Sessions — Daily
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ga4.sessionsOverTime} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={axisStyle} tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Sessions" fill="hsl(var(--brand-red))" radius={[2, 2, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Traffic sources */}
          {channels.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground mb-1">
                Where Visitors Came From <span className="font-normal text-muted-foreground normal-case">(Users)</span>
              </p>
              <p className="text-[11px] text-muted-foreground mb-4">Session primary channel group</p>
              <TrafficSourcesChart channels={channels} />
            </div>
          )}
        </div>
      )}

      {/* ── 5. SEARCH & DISCOVERY ─────────────────────────────────────────── */}
      {brand.hasGSC && (
        <section>
          <SectionHeader label="Search & Discovery" source="Google Search Console" />

          {!loading && gsc?.clicksImpressionsOverTime?.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5 mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground mb-1">
                Clicks &amp; Impressions Over Time
              </p>
              <p className="text-[11px] text-muted-foreground mb-4">Search visibility trend</p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={gsc.clicksImpressionsOverTime} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={axisStyle} tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Line yAxisId="left" type="monotone" dataKey="clicks" name="Clicks"
                    stroke="#7C3AED" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Line yAxisId="right" type="monotone" dataKey="impressions" name="Impressions"
                    stroke="#EC4899" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {!loading && (gsc?.topQueries?.length > 0 || gsc?.opportunityQueries?.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {gsc?.topQueries?.length > 0 && (
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="px-5 py-3 border-b border-border">
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground">Top Search Queries</p>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-5 py-2 text-left text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Query</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Clicks</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Pos.</th>
                        <th className="px-4 py-2 text-right text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">CTR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {gsc.topQueries.slice(0, 8).map((row: any) => (
                        <tr key={row.query} className="hover:bg-muted/20">
                          <td className="px-5 py-2.5 text-foreground truncate max-w-[160px]">{row.query}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{row.clicks}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{row.position?.toFixed(1)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.ctr}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {gsc?.opportunityQueries?.length > 0 && (
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="px-5 py-3 border-b border-border">
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground">Biggest Ranking Opportunities</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Impr. / Avg Pos.</p>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-5 py-2 text-left text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Query</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Impr.</th>
                        <th className="px-4 py-2 text-right text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Pos.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {gsc.opportunityQueries.slice(0, 8).map((row: any) => (
                        <tr key={row.query} className="hover:bg-muted/20">
                          <td className="px-5 py-2.5 text-foreground truncate max-w-[200px]">{row.query}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmt(row.impressions)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">#{row.position?.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!brand.hasGSC && <NoDataNote label="No Search Console Connected." />}
        </section>
      )}

      {/* ── 6. SITE HEALTH & ENGAGEMENT ───────────────────────────────────── */}
      {brand.hasGA4 && !loading && ga4?.topPages?.length > 0 && (
        <section>
          <SectionHeader label="Site Health & Engagement" source="GSC · GA4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Pages */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground">Top Pages by Sessions</p>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-5 py-2 text-left text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Page</th>
                    <th className="px-5 py-2 text-right text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Sessions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ga4.topPages.slice(0, 8).map((row: any, i: number) => (
                    <tr key={row.page} className="hover:bg-muted/20">
                      <td className="px-5 py-2.5 font-mono text-foreground">
                        <span className="inline-flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-4 shrink-0">{i + 1}</span>
                          <span className="truncate max-w-[200px] block">{row.page}</span>
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{row.sessions?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Engagement metrics */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground">Engagement Quality</p>
              </div>
              <div className="divide-y divide-border">
                {[
                  { label: "Total Sessions", value: fmt(ga4.sessions) },
                  { label: "Page Views", value: fmt(ga4.pageViews) },
                  { label: "Active Users (1-day)", value: fmt(ga4.activeUsers1Day) },
                  { label: "Organic Sessions", value: fmt(ga4.organicSessions) },
                  ...(gsc ? [
                    { label: "Avg. Search CTR", value: fmtPct(gsc.averageCTR) },
                    { label: "Avg. Position", value: `#${gsc.averagePosition?.toFixed(1) ?? "—"}` },
                  ] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between px-5 py-3">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-xs font-semibold tabular-nums text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 7. RECOMMENDATIONS ────────────────────────────────────────────── */}
      {showInsights && recommendations.length > 0 && (
        <section>
          <SectionHeader label="Insights" />
          <div className="space-y-3">
            {recommendations.slice(0, 6).map((rec, i) => {
              const isRed   = rec.status === "action_required";
              const isAmber = rec.status === "attention";
              const isGreen = rec.status === "strong" || rec.status === "trending_up";

              const accent     = isRed ? "#ef4444" : isAmber ? "#f59e0b" : isGreen ? "#10b981" : "#60a5fa";
              const badgeBg    = isRed    ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                               : isAmber  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                               : isGreen  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                               : "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400";
              const badgeLabel = isRed ? "Fix needed" : isAmber ? "Watch" : isGreen ? "Positive" : "Info";

              // Root cause = last item in whyChain, stripped of the "Root cause — " prefix
              const rootCause = rec.whyChain?.length
                ? rec.whyChain[rec.whyChain.length - 1].replace(/^Root cause:\s*/i, "")
                : null;

              const isExpanded = expandedCards.has(rec.id);
              const toggle = () => setExpandedCards(prev => {
                const next = new Set(prev);
                isExpanded ? next.delete(rec.id) : next.add(rec.id);
                return next;
              });

              // Evidence rows: always show all in expanded, max 3 collapsed
              const visibleFindings = isExpanded ? rec.findings : rec.findings?.slice(0, 3);
              const hiddenFindingCount = (rec.findings?.length ?? 0) - 3;

              return (
                <div
                  key={rec.id}
                  className="rounded-lg border border-border bg-card overflow-hidden"
                  style={{ borderLeft: `4px solid ${accent}` }}
                >
                  {/* ── Header row ── */}
                  <button
                    onClick={toggle}
                    className="w-full flex items-start justify-between gap-3 px-5 pt-4 pb-3 text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white mt-0.5" style={{ backgroundColor: accent }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground leading-snug">{rec.headline}</p>
                        {/* Root cause pill — always visible, one line */}
                        {rootCause && (
                          <p className="mt-1 text-[11px] text-muted-foreground leading-snug line-clamp-2">
                            <span className="font-semibold" style={{ color: accent }}>Root cause: </span>
                            {rootCause}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 mt-0.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeBg}`}>{badgeLabel}</span>
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* ── Always-visible: compact evidence ── */}
                  {visibleFindings && visibleFindings.length > 0 && (
                    <div className="mx-5 mb-3 ml-14 rounded-md border border-border overflow-hidden">
                      {visibleFindings.map((f, fi) => {
                        const rowAccent = f.severity === "high" ? "border-l-red-400" : f.severity === "medium" ? "border-l-amber-400" : "border-l-border";
                        return (
                          <div key={fi} className={`flex items-center justify-between gap-3 px-3 py-2 border-l-2 ${rowAccent} ${fi > 0 ? "border-t border-border" : ""} bg-muted/20`}>
                            <span className="text-[11px] font-mono text-foreground truncate max-w-[50%]">{f.label}</span>
                            <span className="text-[11px] text-muted-foreground text-right">{f.value}</span>
                          </div>
                        );
                      })}
                      {!isExpanded && hiddenFindingCount > 0 && (
                        <button onClick={toggle} className="w-full px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground border-t border-border bg-muted/10 text-left transition-colors">
                          +{hiddenFindingCount} more rows — click to expand
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Always-visible: top action only ── */}
                  {rec.actions && rec.actions.length > 0 && !isExpanded && (
                    <div className="mx-5 mb-4 ml-14">
                      <div className="flex items-start gap-2">
                        <div className="mt-1 h-4 w-4 shrink-0 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ backgroundColor: accent }}>
                          1
                        </div>
                        <p className="text-xs text-foreground leading-relaxed">{rec.actions[0]}</p>
                      </div>
                      {rec.actions.length > 1 && (
                        <button onClick={toggle} className="mt-1.5 ml-6 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                          +{rec.actions.length - 1} more steps — click to expand
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── EXPANDED: full why chain + all actions ── */}
                  {isExpanded && (
                    <div>
                      {/* Full observation */}
                      <div className="px-5 pb-2 pl-14">
                        <p className="text-xs text-muted-foreground leading-relaxed">{rec.detail}</p>
                      </div>

                      {/* Full 5-Why chain */}
                      {rec.whyChain && rec.whyChain.length > 1 && (
                        <div className="mx-5 mb-3 ml-14">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Why this happened</p>
                          <div className="relative pl-4 border-l-2 border-border space-y-2">
                            {rec.whyChain.map((why, wi) => {
                              const isRoot = wi === rec.whyChain!.length - 1;
                              return (
                                <div key={wi} className="flex items-start gap-2">
                                  <div
                                    className={`shrink-0 mt-0.5 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-black absolute -left-[9px] ${isRoot ? "text-white" : "text-muted-foreground bg-background border border-border"}`}
                                    style={isRoot ? { backgroundColor: accent } : {}}
                                  >
                                    {wi + 1}
                                  </div>
                                  <p className={`text-xs leading-relaxed pl-2 ${isRoot ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                                    {isRoot && <span className="text-[10px] font-black uppercase tracking-widest mr-1" style={{ color: accent }}>Root cause — </span>}
                                    {why}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* All actions */}
                      {rec.actions && rec.actions.length > 0 && (
                        <div className="mx-5 mb-4 ml-14 space-y-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">What to do</p>
                          {rec.actions.map((action, ai) => (
                            <div key={ai} className="flex items-start gap-2">
                              <div className="mt-1 h-4 w-4 shrink-0 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ backgroundColor: accent }}>
                                {ai + 1}
                              </div>
                              <p className="text-xs text-foreground leading-relaxed">{action}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 8. FOOTER ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border pt-4 text-[11px] text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Sources:{" "}
            {[brand.hasGA4 && "GA4", brand.hasGSC && "Search Console", brand.hasHubSpot && "HubSpot"]
              .filter(Boolean).join(" · ")}
          </span>
          <span>{format(dateFrom, "MMM d")} – {format(dateTo, "MMM d, yyyy")} · GSC data lags 48–72 hours · Confidential</span>
        </div>
      </footer>

      {/* ── EMAIL SCHEDULE DIALOG ─────────────────────────────────────────── */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-brand-red" />
              Email this dashboard — {brand.name}
            </DialogTitle>
          </DialogHeader>

          {/* Existing schedule status */}
          {brandSchedule && (
            <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <Pencil className="h-3 w-3 flex-shrink-0" />
              <span>
                Active schedule: <strong>{DOW_LABELS[brandSchedule.day_of_week]}s at {String(brandSchedule.send_hour_utc).padStart(2,"0")}:00 UTC</strong>
                {" · "}{brandSchedule.recipients.length} recipient{brandSchedule.recipients.length !== 1 ? "s" : ""}
                {brandSchedule.last_sent_at && <> · Last sent {format(new Date(brandSchedule.last_sent_at), "MMM d")}</>}
              </span>
            </div>
          )}

          <div className="space-y-4 py-1">
            {/* Recipients */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" /> Recipients ({recipientsList.length})
              </label>

              {/* Current Recipients as Chips */}
              <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-md min-h-[44px] border border-border">
                {recipientsList.length > 0 ? (
                  recipientsList.map((email, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-brand-red/10 text-brand-red rounded-full text-xs font-medium border border-brand-red/20"
                    >
                      <span className="font-mono">{email}</span>
                      <button
                        onClick={() => {
                          const newList = recipientsList.filter((_, i) => i !== idx);
                          setRecipientsList(newList);
                          setSchedForm(s => ({ ...s, recipients: newList.join(", ") }));
                        }}
                        className="ml-1 hover:text-brand-red/70 transition-colors"
                        title="Remove recipient"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground italic">No recipients added yet</span>
                )}
              </div>

              {/* Add New Recipient */}
              <div className="flex gap-2">
                <Input
                  placeholder="name@company.com"
                  value={recipientInput}
                  onChange={e => setRecipientInput(e.target.value)}
                  onKeyPress={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const email = recipientInput.trim().toLowerCase();
                      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !recipientsList.includes(email)) {
                        const newList = [...recipientsList, email];
                        setRecipientsList(newList);
                        setSchedForm(s => ({ ...s, recipients: newList.join(", ") }));
                        setRecipientInput("");
                      }
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const email = recipientInput.trim().toLowerCase();
                    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !recipientsList.includes(email)) {
                      const newList = [...recipientsList, email];
                      setRecipientsList(newList);
                      setSchedForm(s => ({ ...s, recipients: newList.join(", ") }));
                      setRecipientInput("");
                    } else if (recipientsList.includes(email)) {
                      alert("This email is already in the list");
                    } else {
                      alert("Please enter a valid email address");
                    }
                  }}
                  className="text-[11px]"
                >
                  Add
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Type an email and press Enter or click Add. Remove recipients by clicking the X on their chip.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Day of week */}
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Send Day
                </label>
                <Select
                  value={String(schedForm.day_of_week)}
                  onValueChange={v => setSchedForm(s => ({ ...s, day_of_week: Number(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOW_LABELS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Send time */}
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Time (UTC)
                </label>
                <Select
                  value={String(schedForm.send_hour_utc)}
                  onValueChange={v => setSchedForm(s => ({ ...s, send_hour_utc: Number(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, h) => (
                      <SelectItem key={h} value={String(h)}>
                        {String(h).padStart(2,"0")}:00 UTC{h >= 4 && h <= 12 ? ` (${h-4}:00 ET)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Report period */}
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Report Period</label>
              <Select
                value={String(schedForm.date_range_days)}
                onValueChange={v => setSchedForm(s => ({ ...s, date_range_days: Number(v) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="60">Last 60 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex gap-1.5 justify-end flex-nowrap">
            {brandSchedule && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={sendingNow}
                  onClick={sendNow}
                  className="flex items-center gap-1 text-xs"
                >
                  <Send className="h-3 w-3" />
                  Send Now
                </Button>
                <Button
                  size="sm"
                  disabled={sendingNow}
                  onClick={sendTestEmail}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 dark:bg-blue-600 dark:text-white dark:border-blue-700 dark:hover:bg-blue-700"
                  title="Send a test email to verify the schedule will work"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sendingNow ? "Testing…" : "Test Email"}
                </Button>
              </>
            )}
            <Button
              onClick={saveSchedule}
              disabled={schedSaving}
              size="sm"
              className="bg-brand-red hover:bg-brand-red/90 text-white flex items-center gap-1 text-xs"
            >
              <Mail className="h-3 w-3" />
              {schedSaving ? "Saving…" : brandSchedule ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
