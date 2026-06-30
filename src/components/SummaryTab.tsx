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
import { TrendingUp, TrendingDown, WifiOff, Download, Mail, Send, Calendar, Clock, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

interface SummaryTabProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
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

export function SummaryTab({ brand, dateFrom, dateTo }: SummaryTabProps) {
  const [ga4, setGa4]       = useState<any>(null);
  const [gsc, setGsc]       = useState<any>(null);
  const [hubspot, setHubspot] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const showLoader = useFirstLoad(loading);

  // ── Email schedule state ───────────────────────────────────────────────────
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [brandSchedule, setBrandSchedule] = useState<EmailSchedule | null>(null);
  const [schedForm, setSchedForm] = useState({
    recipients: "mali@americanbathgroup.com",
    day_of_week: 1,
    send_hour_utc: 8,
    date_range_days: 7,
    is_active: true,
  });
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
    setEmailDialogOpen(true);
  }

  async function saveSchedule() {
    setSchedSaving(true);
    const recipientList = schedForm.recipients.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
    if (!recipientList.length) { toast.error("Add at least one recipient email"); setSchedSaving(false); return; }
    const payload = {
      brand_id: brand.id,
      brand_name: brand.name,
      recipients: recipientList,
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setGa4(null); setGsc(null); setHubspot(null); setChannels([]);

    const startDate = dateFrom.toISOString().split("T")[0];
    const endDate   = dateTo.toISOString().split("T")[0];

    const channelFetch = brand.hasGA4 && brand.ga4PropertyIds?.length
      ? supabase.functions
          .invoke("ga4-channel-data", { body: { propertyIds: brand.ga4PropertyIds, startDate, endDate } })
          .then(({ data }) => data?.channels ?? []).catch(() => [])
      : Promise.resolve([]);

    Promise.all([
      brand.hasGA4    ? fetchGA4Data(brand, dateFrom, dateTo)                        : Promise.resolve(null),
      brand.hasGSC    ? fetchGSCData(brand, dateFrom, dateTo)                        : Promise.resolve(null),
      brand.hasHubSpot? fetchHubSpotData(brand, dateFrom, dateTo).catch(() => null)  : Promise.resolve(null),
      channelFetch,
    ]).then(([ga4Data, gscData, hubspotData, channelData]) => {
      if (cancelled) return;
      setGa4(ga4Data); setGsc(gscData); setHubspot(hubspotData); setChannels(channelData);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [brand.id, dateFrom.getTime(), dateTo.getTime()]);

  const recommendations = useMemo(() => {
    // Edge functions return deltas hardcoded to 0 — compute real deltas
    // from the daily time series by comparing first half vs second half of period.
    function computeDelta(series: any[], key: string): number | null {
      if (!series || series.length < 4) return null;
      const mid = Math.floor(series.length / 2);
      const prev = series.slice(0, mid).reduce((s: number, d: any) => s + (d[key] ?? 0), 0);
      const curr = series.slice(mid).reduce((s: number, d: any) => s + (d[key] ?? 0), 0);
      if (prev === 0) return null;
      return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
    }

    const sessionsDelta   = computeDelta(ga4?.sessionsOverTime, "sessions");
    const impressionsDelta = computeDelta(gsc?.clicksImpressionsOverTime, "impressions");
    const clicksDelta      = computeDelta(gsc?.clicksImpressionsOverTime, "clicks");

    const m: Record<string, any> = {
      // Computed real deltas
      sessionsDelta,
      organicSessionsDelta: computeDelta(ga4?.sessionsOverTime, "organicSessions") ?? ga4?.organicSessionsDelta,
      totalImpressionsDelta: impressionsDelta,
      totalClicksDelta: clicksDelta,
      // Static metrics
      averageCTR:      gsc?.averageCTR,
      averagePosition: gsc?.averagePosition,
      totalSessions:   ga4?.sessions,
      totalImpressions: gsc?.totalImpressions,
      totalClicks:     gsc?.totalClicks,
      // Rich context for deeper analysis
      channels:        channels,
      topQueries:      gsc?.topQueries ?? [],
      topLandingPages: gsc?.topLandingPages ?? [],
      brandName:       brand.name,
      dateFrom,
      dateTo,
    };
    return generateRecommendations("summary", m);
  }, [ga4, gsc, channels, brand.name, dateFrom, dateTo]);

  const execSummary = useMemo(
    () => buildExecutiveSummary(brand.name, ga4, gsc, dateFrom, dateTo),
    [brand.name, ga4, gsc, dateFrom, dateTo]
  );

  const axisStyle  = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };
  const gridColor  = "hsl(var(--border))";
  const reportRef  = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  async function handleDownloadPDF() {
    setExporting(true);
    try {
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
          dateFrom={dateFrom}
          dateTo={dateTo}
          ga4={ga4}
          gsc={gsc}
          channels={channels}
          recommendations={[]}
        />
      );

      // Wait for React + Recharts SVGs to paint
      await new Promise(r => setTimeout(r, 1500));

      const el = container.firstElementChild as HTMLElement;
      const scale = 2;
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
        pdf.addImage(slice.toDataURL("image/png"), "PNG", 0, 0, pageWmm, sliceH / pxPerMm);

        srcY = breakY;
        page++;
      }

      const safeName = brand.name.replace(/[^a-zA-Z0-9]/g, "_");
      const from     = format(dateFrom, "yyyy-MM-dd");
      const to       = format(dateTo,   "yyyy-MM-dd");
      pdf.save(`${safeName}_${from}_${to}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  if (showLoader) return <WaterFillLoader fullScreen={false} message="Building report…" />;

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
              Week of {format(dateFrom, "MMM d")} – {format(dateTo, "MMM d, yyyy")} · weekly edition
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="text-[11px] text-muted-foreground">Issued {format(new Date(), "MMM d, yyyy")}</p>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  onClick={openEmailDialog}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[11px] font-semibold transition-colors ${
                    brandSchedule
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-700"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  <Mail className="h-3.5 w-3.5" />
                  {brandSchedule
                    ? `Scheduled · ${DOW_LABELS[brandSchedule.day_of_week]}s · Edit`
                    : "Email this dashboard"}
                </button>
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
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-foreground mb-4">
                Search Impressions — Daily
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={gsc.clicksImpressionsOverTime} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gscImpr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--brand-red))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--brand-red))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={axisStyle} tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="impressions" name="Impressions"
                    stroke="hsl(var(--brand-red))" strokeWidth={2}
                    fill="url(#gscImpr)" dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: "hsl(var(--brand-red))" }} />
                </AreaChart>
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
      {recommendations.length > 0 && (
        <section>
          <SectionHeader label="Insights" />
          <div className="space-y-4">
            {recommendations.slice(0, 6).map((rec, i) => {
              const isRed    = rec.status === "action_required";
              const isAmber  = rec.status === "attention";
              const isGreen  = rec.status === "strong" || rec.status === "trending_up";

              const accent      = isRed ? "#ef4444" : isAmber ? "#f59e0b" : isGreen ? "#10b981" : "#60a5fa";
              const badgeBg     = isRed ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                                : isAmber ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                                : isGreen ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                                : "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400";
              const badgeLabel  = isRed ? "Action Required" : isAmber ? "Monitor" : isGreen ? "Positive" : "Info";

              return (
                <div
                  key={rec.id}
                  className="rounded-lg border border-border bg-card overflow-hidden"
                  style={{ borderLeft: `4px solid ${accent}` }}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white mt-0.5"
                        style={{ backgroundColor: accent }}
                      >
                        {i + 1}
                      </div>
                      <p className="text-sm font-bold text-foreground leading-snug">{rec.headline}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rec.benchmark && (
                        <span className="text-[10px] text-muted-foreground hidden sm:block">{rec.benchmark}</span>
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeBg}`}>
                        {badgeLabel}
                      </span>
                    </div>
                  </div>

                  {/* Diagnosis */}
                  <div className="px-5 pb-3 ml-9">
                    <p className="text-xs text-muted-foreground leading-relaxed">{rec.detail}</p>
                  </div>

                  {/* Actions */}
                  {rec.actions && rec.actions.length > 0 && (
                    <div className="mx-5 mb-4 ml-14 rounded-md bg-muted/50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                        Actions to take
                      </p>
                      <ol className="space-y-1.5">
                        {rec.actions.map((action, ai) => (
                          <li key={ai} className="flex items-start gap-2 text-xs text-foreground">
                            <span className="shrink-0 font-bold text-muted-foreground mt-0.5">{ai + 1}.</span>
                            <span className="leading-relaxed">{action}</span>
                          </li>
                        ))}
                      </ol>
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
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" /> Recipients
              </label>
              <Input
                placeholder="mali@americanbathgroup.com, brad@americanbathgroup.com"
                value={schedForm.recipients}
                onChange={e => setSchedForm(s => ({ ...s, recipients: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground">
                {schedForm.recipients.split(",").filter(e => e.trim()).length} recipient(s) —
                separate multiple emails with a comma, e.g.{" "}
                <span className="font-mono text-foreground">mali@americanbathgroup.com, brad@americanbathgroup.com</span>
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

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {brandSchedule && (
              <Button
                variant="outline"
                disabled={sendingNow}
                onClick={sendNow}
                className="flex items-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                {sendingNow ? "Sending…" : "Send Now"}
              </Button>
            )}
            <Button
              onClick={saveSchedule}
              disabled={schedSaving}
              className="bg-brand-red hover:bg-brand-red/90 text-white flex items-center gap-1.5 flex-1"
            >
              <Mail className="h-3.5 w-3.5" />
              {schedSaving ? "Saving…" : brandSchedule ? "Update Schedule" : "Save Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
