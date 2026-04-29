import { useState, useRef } from "react";
import { subDays, format, addDays, parseISO, startOfWeek, startOfMonth } from "date-fns";
import { callFunction } from "@/lib/api-client";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import { TrendingUp, TrendingDown, Minus, RefreshCw, Check, Users, UserCheck, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, ReferenceLine,
  ComposedChart, Line,
} from "recharts";

// ─── access control ───────────────────────────────────────────────────────────
const ALLOWED_EMAILS = new Set([
  "mali@americanbathgroup.com",
  "clee@americanbathgroup.com",
]);

// ─── config ───────────────────────────────────────────────────────────────────
const SECONDARY_BRANDS = ["American Whirlpool", "Vita Spa", "MAAX Sauna"] as const;
type SecondaryBrand = typeof SECONDARY_BRANDS[number];

const PERIOD_OPTIONS = [
  { label: "30d",  days: 30,  full: "Last 30 days"  },
  { label: "60d",  days: 60,  full: "Last 60 days"  },
  { label: "90d",  days: 90,  full: "Last 90 days"  },
  { label: "6mo",  days: 180, full: "Last 6 months" },
] as const;

const BRAND_PALETTE: Record<SecondaryBrand, { solid: string; faded: string; bg: string }> = {
  "American Whirlpool": { solid: "#3B82F6", faded: "#93C5FD", bg: "#EFF6FF" },
  "Vita Spa":           { solid: "#7C3AED", faded: "#C4B5FD", bg: "#F5F3FF" },
  "MAAX Sauna":         { solid: "#059669", faded: "#6EE7B7", bg: "#ECFDF5" },
};

const BRAND_SHORT: Record<SecondaryBrand, string> = {
  "American Whirlpool": "Am. Whirlpool",
  "Vita Spa":           "Vita Spa",
  "MAAX Sauna":         "MAAX Sauna",
};

// ─── types ────────────────────────────────────────────────────────────────────
interface PeriodData {
  totalContacts: number;
  dealerAssigned: number;
  dealerUnassigned: number;
}

type BrandResults = Record<SecondaryBrand, { curr: PeriodData; prev: PeriodData }>;
type TimeSeries   = Record<string, number>; // date -> count

const METRICS = [
  { key: "totalContacts"    as const, label: "Total Created",      Icon: Users,      color: "#3B82F6" },
  { key: "dealerAssigned"   as const, label: "Assigned to Dealer", Icon: UserCheck,  color: "#10B981" },
  { key: "dealerUnassigned" as const, label: "Not Assigned",       Icon: UserX,      color: "#F59E0B" },
] as const;

type Granularity = "day" | "week" | "month";

// ─── helpers ──────────────────────────────────────────────────────────────────
function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getPeriods(days: number) {
  const today = new Date();
  return {
    currEnd:   today,
    currStart: subDays(today, days - 1),
    prevEnd:   subDays(today, days),
    prevStart: subDays(today, days * 2 - 1),
  };
}

async function fetchAllBrandsForPeriod(
  brands: SecondaryBrand[], from: Date, to: Date,
): Promise<{ periodData: Record<SecondaryBrand, PeriodData>; timeSeries: TimeSeries }> {
  const data = await callFunction("hubspot-contacts", {
    brandNames: brands,
    startDate: dateStr(from),
    endDate: dateStr(to),
  });
  if (data?.error) throw new Error(data.error);

  const periodData = {} as Record<SecondaryBrand, PeriodData>;
  const timeSeries: TimeSeries = {};

  for (const brand of brands) {
    const s = data?.brandData?.[brand];
    periodData[brand] = {
      totalContacts:    s?.totalContacts        ?? 0,
      dealerAssigned:   s?.dealerAssignedTotal   ?? 0,
      dealerUnassigned: s?.dealerUnassignedTotal ?? 0,
    };
    // Combine daily series across all brands into one aggregate
    const ts: TimeSeries = data?.brandTimeSeries?.[brand] ?? {};
    for (const [date, count] of Object.entries(ts)) {
      timeSeries[date] = (timeSeries[date] || 0) + (count as number);
    }
  }
  return { periodData, timeSeries };
}

/** Build chart rows: align current + previous by day-offset so they overlay */
function buildTrendRows(
  currSeries: TimeSeries, prevSeries: TimeSeries,
  currStart: Date, prevStart: Date,
  days: number, gran: Granularity,
) {
  // Day-level aligned pairs
  const daily = Array.from({ length: days }, (_, i) => ({
    cDate: dateStr(addDays(currStart, i)),
    pDate: dateStr(addDays(prevStart, i)),
  }));

  if (gran === "day") {
    return daily.map(({ cDate, pDate }) => ({
      label:     format(parseISO(cDate), "MMM d"),
      prevLabel: format(parseISO(pDate), "MMM d"),
      curr:      currSeries[cDate] || 0,
      prev:      prevSeries[pDate] || 0,
    }));
  }

  // Aggregate into week/month buckets (keyed by current-period bucket)
  type Bucket = { label: string; prevLabel: string; curr: number; prev: number };
  const buckets = new Map<string, Bucket>();
  for (const { cDate, pDate } of daily) {
    const cd = parseISO(cDate);
    const pd = parseISO(pDate);
    const key   = gran === "week"
      ? dateStr(startOfWeek(cd, { weekStartsOn: 0 }))
      : format(startOfMonth(cd), "yyyy-MM");
    const label = gran === "week"
      ? `Wk ${format(cd, "MMM d")}`
      : format(startOfMonth(cd), "MMM yyyy");
    const prevLabel = gran === "week"
      ? `Wk ${format(pd, "MMM d")}`
      : format(startOfMonth(pd), "MMM yyyy");
    if (!buckets.has(key)) buckets.set(key, { label, prevLabel, curr: 0, prev: 0 });
    buckets.get(key)!.curr += currSeries[cDate] || 0;
    buckets.get(key)!.prev += prevSeries[pDate] || 0;
  }
  return [...buckets.values()];
}

// ─── sub-components ───────────────────────────────────────────────────────────
function Delta({ curr, prev, size = "md" }: { curr: number; prev: number; size?: "sm" | "md" }) {
  if (!prev) return <span className="text-[10px] text-muted-foreground/40">—</span>;
  const d  = ((curr - prev) / prev) * 100;
  const up = d > 0.4, dn = d < -0.4;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded-full font-semibold tabular-nums",
      size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
      up && "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
      dn && "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
      !up && !dn && "bg-muted text-muted-foreground",
    )}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : dn ? <TrendingDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
      {(up || dn) ? `${up ? "+" : ""}${d.toFixed(1)}%` : "—"}
    </span>
  );
}

function BarTooltip({ active, payload, label, currLabel, prevLabel }:
  { active?: boolean; payload?: any[]; label?: string; currLabel: string; prevLabel: string }) {
  if (!active || !payload?.length) return null;
  const curr  = payload.find((p: any) => p.dataKey === "curr");
  const prev  = payload.find((p: any) => p.dataKey === "prev");
  const delta = curr && prev && prev.value > 0 ? ((curr.value - prev.value) / prev.value) * 100 : null;
  return (
    <div className="rounded-xl border border-border bg-card shadow-xl px-4 py-3 text-xs min-w-[190px] space-y-2">
      <p className="font-bold text-sm text-foreground">{label}</p>
      <div className="space-y-1.5">
        {[{ p: curr, lbl: currLabel, dashed: false }, { p: prev, lbl: prevLabel, dashed: true }].map(({ p, lbl, dashed }) =>
          p ? (
            <div key={lbl} className="flex items-center justify-between gap-8">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className={cn("h-2.5 w-2.5 rounded-sm shrink-0", dashed && "border border-dashed border-muted-foreground/50")}
                  style={{ background: p.fill }} />
                {lbl}
              </span>
              <span className="font-bold text-foreground tabular-nums">{(p.value ?? 0).toLocaleString()}</span>
            </div>
          ) : null
        )}
      </div>
      {delta !== null && (
        <div className={cn("pt-1.5 border-t border-border text-[11px] font-semibold",
          delta > 0.4  ? "text-emerald-600 dark:text-emerald-400" :
          delta < -0.4 ? "text-red-500 dark:text-red-400" : "text-muted-foreground")}>
          {delta > 0.4 ? "▲" : delta < -0.4 ? "▼" : "→"} {Math.abs(delta).toFixed(1)}% vs previous period
        </div>
      )}
    </div>
  );
}

function TrendTooltip({ active, payload, label }:
  { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const curr = payload.find((p: any) => p.dataKey === "curr");
  const prev = payload.find((p: any) => p.dataKey === "prev");
  const prevLabel = payload[0]?.payload?.prevLabel;
  const currVal = curr?.value ?? 0;
  const prevVal = prev?.value ?? 0;
  const delta = prevVal > 0 ? ((currVal - prevVal) / prevVal) * 100 : null;
  return (
    <div className="rounded-xl border border-border bg-card shadow-xl px-4 py-3 text-xs min-w-[200px] space-y-2">
      <p className="font-bold text-sm text-foreground">{label}</p>
      <div className="space-y-1.5">
        {curr && (
          <div className="flex items-center justify-between gap-8">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0 bg-[#3B82F6]" />
              Current period
            </span>
            <span className="font-bold text-foreground tabular-nums">{currVal.toLocaleString()}</span>
          </div>
        )}
        {prev && (
          <div className="flex items-center justify-between gap-8">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-0.5 w-4 shrink-0 border-t-2 border-dashed border-[#F97316]" />
              {prevLabel || label}
            </span>
            <span className="font-semibold text-muted-foreground tabular-nums">{prevVal.toLocaleString()}</span>
          </div>
        )}
      </div>
      {delta !== null && (
        <div className={cn("pt-1.5 border-t border-border text-[11px] font-semibold",
          delta > 0.4  ? "text-emerald-600 dark:text-emerald-400" :
          delta < -0.4 ? "text-red-500 dark:text-red-400" : "text-muted-foreground")}>
          {delta > 0.4 ? "▲" : delta < -0.4 ? "▼" : "→"} {Math.abs(delta).toFixed(1)}% vs previous
        </div>
      )}
    </div>
  );
}

// ─── main export ──────────────────────────────────────────────────────────────
export function CRMComparisonTab({ userEmail }: { userEmail: string }) {
  if (!ALLOWED_EMAILS.has(userEmail)) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        You don't have access to this report.
      </div>
    );
  }
  return <ComparisonContent />;
}

function ComparisonContent() {
  const [selectedDays,   setSelectedDays]   = useState<number | null>(null);
  const [selectedBrands, setSelectedBrands] = useState<SecondaryBrand[]>([]);
  const [results,        setResults]        = useState<BrandResults | null>(null);
  const [currSeries,     setCurrSeries]     = useState<TimeSeries | null>(null);
  const [prevSeries,     setPrevSeries]     = useState<TimeSeries | null>(null);
  const [granularity,    setGranularity]    = useState<Granularity>("day");
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const reqRef = useRef(0);

  function toggleBrand(b: SecondaryBrand) {
    setSelectedBrands(p => p.includes(b) ? p.filter(x => x !== b) : p.length < 3 ? [...p, b] : p);
  }

  function runReport(days: number | null, brands: SecondaryBrand[]) {
    if (!days || !brands.length) return;
    const id = ++reqRef.current;
    setLoading(true); setError(null);
    const { currStart, currEnd, prevStart, prevEnd } = getPeriods(days);
    Promise.all([
      fetchAllBrandsForPeriod(brands, currStart, currEnd),
      fetchAllBrandsForPeriod(brands, prevStart, prevEnd),
    ]).then(([cRes, pRes]) => {
      if (reqRef.current !== id) return;
      const map = {} as BrandResults;
      for (const b of brands) map[b] = { curr: cRes.periodData[b], prev: pRes.periodData[b] };
      setResults(map);
      setCurrSeries(cRes.timeSeries);
      setPrevSeries(pRes.timeSeries);
      setLoading(false);
    }).catch(e => {
      if (reqRef.current !== id) return;
      setError(e instanceof Error ? e.message : "Failed to load");
      setLoading(false);
    });
  }

  const periods   = selectedDays ? getPeriods(selectedDays) : null;
  const currLabel = periods ? `${format(periods.currStart, "MMM d")} – ${format(periods.currEnd, "MMM d, yyyy")}` : "";
  const prevLabel = periods ? `${format(periods.prevStart, "MMM d")} – ${format(periods.prevEnd, "MMM d, yyyy")}` : "";
  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
  const canRun    = !!selectedDays && selectedBrands.length > 0;

  // Build trend rows whenever we have series data
  const trendRows = (currSeries && prevSeries && selectedDays && periods)
    ? buildTrendRows(currSeries, prevSeries, periods.currStart, periods.prevStart, selectedDays, granularity)
    : [];

  // x-axis tick interval — show fewer labels when many points
  const tickInterval = trendRows.length > 60 ? 13
    : trendRows.length > 30 ? 6
    : trendRows.length > 14 ? 3
    : 0;

  return (
    <div className="space-y-4 p-6">

      {/* ══ TOOLBAR ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-1">Period</span>
        <div className="flex items-center gap-1">
          {PERIOD_OPTIONS.map(({ label, days, full }) => (
            <button key={days} title={full} onClick={() => setSelectedDays(days)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all duration-150",
                selectedDays === days
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}>
              {label}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border mx-1" />

        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-1">Brands</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {SECONDARY_BRANDS.map((brand) => {
            const active = selectedBrands.includes(brand);
            return (
              <button key={brand} onClick={() => toggleBrand(brand)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all duration-150",
                  active ? "border-transparent text-white shadow-sm" : "border-border text-muted-foreground hover:text-foreground",
                )}
                style={active ? { background: BRAND_PALETTE[brand].solid } : {}}>
                {active && <Check className="h-3 w-3" />}
                {brand}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => runReport(selectedDays, selectedBrands)}
          disabled={loading || !canRun}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-accent-foreground cursor-pointer hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {loading ? "Loading…" : "Run Report"}
        </button>
      </div>

      {/* Period range labels */}
      {selectedDays && currLabel && (
        <div className="flex flex-wrap items-center gap-4 px-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-[#3B82F6]/40" />
            <span className="font-semibold text-foreground">Current</span> {currLabel}
          </span>
          <span className="text-muted-foreground/30">vs</span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-[#F97316]/40" />
            <span className="font-semibold text-foreground">Previous</span> {prevLabel}
          </span>
        </div>
      )}

      {/* ══ EMPTY STATE ══════════════════════════════════════════════════════ */}
      {!loading && !results && !error && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 py-20 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">No data yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {!selectedDays && !selectedBrands.length ? "Pick a period and at least one brand, then click Run Report"
              : !selectedDays ? "Pick a period, then click Run Report"
              : !selectedBrands.length ? "Pick at least one brand, then click Run Report"
              : "Click Run Report to load data"}
          </p>
        </div>
      )}

      {loading && <WaterFillLoader fullScreen={false} message="Fetching comparison data…" />}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {/* ══ RESULTS ══════════════════════════════════════════════════════════ */}
      {!loading && results && (() => {
        const activeBrands = selectedBrands.filter(b => results[b]);

        /* ── KPI cards ─────────────────────────────────────────────────────── */
        const kpiSection = (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {METRICS.map(({ key, label, Icon, color }) => {
              const grandCurr = activeBrands.reduce((s, b) => s + results[b].curr[key], 0);
              const grandPrev = activeBrands.reduce((s, b) => s + results[b].prev[key], 0);
              return (
                <div key={key} className="rounded-2xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{ background: `${color}18` }}>
                      <Icon className="h-4 w-4" style={{ color }} />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground leading-none">{label}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground/60">All selected brands</p>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-3xl font-black tabular-nums text-foreground leading-none">{grandCurr.toLocaleString()}</span>
                    <Delta curr={grandCurr} prev={grandPrev} />
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-2 tabular-nums">prev {grandPrev.toLocaleString()}</p>
                  {activeBrands.length > 1 && (
                    <div className="space-y-2.5 pt-1 border-t border-border">
                      {activeBrands.map(brand => {
                        const curr  = results[brand].curr[key];
                        const prev  = results[brand].prev[key];
                        const share = grandCurr > 0 ? (curr / grandCurr) * 100 : 0;
                        const { solid, bg } = BRAND_PALETTE[brand];
                        return (
                          <div key={brand}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: solid }} />
                                <span className="text-[11px] text-muted-foreground truncate">{brand}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-bold tabular-nums text-foreground">{curr.toLocaleString()}</span>
                                <Delta curr={curr} prev={prev} size="sm" />
                              </div>
                            </div>
                            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: bg }}>
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${share}%`, background: solid }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );

        /* ── Trend chart (bars = current, dashed line = previous) ───────────── */
        // Summary stats for the trend header
        const totalCurr = trendRows.reduce((s, r) => s + r.curr, 0);
        const totalPrev = trendRows.reduce((s, r) => s + r.prev, 0);
        const trendDelta = totalPrev > 0 ? ((totalCurr - totalPrev) / totalPrev) * 100 : null;

        // For "day" with many points, add value labels only when few bars
        const showBarLabels = granularity !== "day" && trendRows.length <= 16;

        // Prev avg line
        const prevAvgTrend = trendRows.length > 0
          ? Math.round(trendRows.reduce((s, r) => s + r.prev, 0) / trendRows.length)
          : 0;

        const trendSection = trendRows.length > 0 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {/* header */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-5 pb-4 border-b border-border">
              <div className="flex items-center gap-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Contact Trends</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    New contacts created per {granularity} — bars = current · dashed line = previous
                  </p>
                </div>
                {/* inline summary */}
                <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-border">
                  <div className="text-center">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Total (curr)</p>
                    <p className="text-base font-black tabular-nums text-foreground">{totalCurr.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Total (prev)</p>
                    <p className="text-base font-black tabular-nums text-muted-foreground">{totalPrev.toLocaleString()}</p>
                  </div>
                  {trendDelta !== null && (
                    <span className={cn(
                      "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold",
                      trendDelta > 0.4  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" :
                      trendDelta < -0.4 ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {trendDelta > 0.4 ? <TrendingUp className="h-3 w-3" /> : trendDelta < -0.4 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                      {Math.abs(trendDelta).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {/* Legend */}
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm bg-[#3B82F6]" />
                    <span className="font-semibold text-foreground">Current</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg width="18" height="10" className="shrink-0">
                      <line x1="0" y1="5" x2="18" y2="5" stroke="#F97316" strokeWidth="2" strokeDasharray="4 2" />
                    </svg>
                    <span className="font-semibold text-foreground">Previous</span>
                  </span>
                </div>
                {/* Granularity toggle */}
                <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5 bg-muted/30">
                  {(["day", "week", "month"] as Granularity[]).map(g => (
                    <button
                      key={g}
                      onClick={() => setGranularity(g)}
                      className={cn(
                        "rounded-md px-3 py-1 text-[11px] font-semibold cursor-pointer transition-all duration-150",
                        granularity === g
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}>
                      {g === "day" ? "Day" : g === "week" ? "Week" : "Month"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* chart */}
            <div className="px-4 pt-5 pb-3">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={trendRows} margin={{ top: showBarLabels ? 22 : 10, right: 16, bottom: 0, left: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    tick={axisStyle}
                    tickLine={false}
                    axisLine={false}
                    interval={tickInterval}
                  />
                  <YAxis
                    tick={axisStyle}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={<TrendTooltip />}
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.45, radius: 4 } as any}
                  />
                  {/* Prev average reference */}
                  {prevAvgTrend > 0 && (
                    <ReferenceLine
                      y={prevAvgTrend}
                      stroke="#F97316"
                      strokeDasharray="3 4"
                      strokeOpacity={0.3}
                      strokeWidth={1}
                    />
                  )}
                  {/* Current period: bars */}
                  <Bar
                    dataKey="curr"
                    name="Current"
                    fill="#3B82F6"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={granularity === "month" ? 72 : granularity === "week" ? 40 : 18}
                    opacity={0.9}
                  >
                    {showBarLabels && (
                      <LabelList
                        dataKey="curr"
                        position="top"
                        style={{ fontSize: 11, fontWeight: 700, fill: "hsl(var(--foreground))" }}
                        formatter={(v: number) => v > 0 ? v.toLocaleString() : ""}
                      />
                    )}
                  </Bar>
                  {/* Previous period: dashed line with dots */}
                  <Line
                    type="linear"
                    dataKey="prev"
                    name="Previous"
                    stroke="#F97316"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={granularity !== "day" ? { r: 4, fill: "#F97316", stroke: "#fff", strokeWidth: 1.5 } : false}
                    activeDot={{ r: 5, fill: "#F97316", stroke: "#fff", strokeWidth: 1.5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* footer hint */}
            <div className="px-6 pb-4 flex items-center gap-2 text-[10px] text-muted-foreground/60">
              <svg width="14" height="8" className="shrink-0">
                <rect width="14" height="8" rx="2" fill="#3B82F6" opacity="0.7" />
              </svg>
              Bars show new contacts in current period ·
              <svg width="18" height="8" className="shrink-0 mx-0.5">
                <line x1="0" y1="4" x2="18" y2="4" stroke="#F97316" strokeWidth="1.5" strokeDasharray="4 2" />
              </svg>
              Line shows same {granularity}s in previous period
            </div>
          </div>
        );

        /* ── Grouped bar charts ─────────────────────────────────────────────── */
        const buildRows = (metricKey: keyof PeriodData) =>
          activeBrands.map(b => ({
            name:  BRAND_SHORT[b],
            curr:  results[b].curr[metricKey],
            prev:  results[b].prev[metricKey],
            solid: BRAND_PALETTE[b].solid,
            faded: BRAND_PALETTE[b].faded,
          }));

        const barCharts = (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-5 pb-4 border-b border-border">
              <div>
                <h3 className="text-sm font-bold text-foreground">Period Comparison</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Current (solid) vs previous (faded) — hover for detail</p>
              </div>
              <div className="flex items-center gap-5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-foreground/25 shrink-0" />
                  <span className="font-semibold text-foreground">Current</span> {currLabel}
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm border border-dashed border-muted-foreground/50 bg-muted-foreground/15 shrink-0" />
                  <span className="font-semibold text-foreground">Previous</span> {prevLabel}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {METRICS.map(({ key, label, Icon, color }) => {
                const rows   = buildRows(key);
                const maxVal = Math.max(...rows.flatMap(r => [r.curr, r.prev]), 1);
                const prevAvg = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.prev, 0) / rows.length) : 0;
                return (
                  <div key={key} className="px-5 pt-5 pb-6">
                    <div className="flex items-center gap-2 mb-5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: `${color}18` }}>
                        <Icon className="h-3.5 w-3.5" style={{ color }} />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-foreground leading-none">{label}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {rows.reduce((s, r) => s + r.curr, 0).toLocaleString()} total
                        </p>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={rows} margin={{ top: 22, right: 6, bottom: 0, left: -8 }}
                        barGap={4} barCategoryGap={activeBrands.length === 1 ? "60%" : "28%"}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} interval={0} />
                        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={38}
                          tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                          domain={[0, Math.ceil(maxVal * 1.2)]} />
                        <Tooltip
                          content={<BarTooltip currLabel={currLabel} prevLabel={prevLabel} />}
                          cursor={{ fill: "hsl(var(--muted))", opacity: 0.5, radius: 4 } as any}
                        />
                        {prevAvg > 0 && (
                          <ReferenceLine y={prevAvg} stroke="hsl(var(--muted-foreground))"
                            strokeDasharray="4 3" strokeOpacity={0.35} />
                        )}
                        <Bar dataKey="curr" name="Current" radius={[5, 5, 0, 0]} maxBarSize={56}>
                          {rows.map((r, i) => <Cell key={i} fill={r.solid} />)}
                          <LabelList dataKey="curr" position="top"
                            style={{ fontSize: 11, fontWeight: 700, fill: "hsl(var(--foreground))" }}
                            formatter={(v: number) => v > 0 ? v.toLocaleString() : ""} />
                        </Bar>
                        <Bar dataKey="prev" name="Previous" radius={[5, 5, 0, 0]} maxBarSize={56}>
                          {rows.map((r, i) => <Cell key={i} fill={r.faded} />)}
                          <LabelList dataKey="prev" position="top"
                            style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            formatter={(v: number) => v > 0 ? v.toLocaleString() : ""} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>
          </div>
        );

        /* ── Detail table ──────────────────────────────────────────────────── */
        const detailTable = (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border bg-muted/20">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Detailed Breakdown</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground w-36">Metric</th>
                    {activeBrands.map(brand => (
                      <th key={brand} colSpan={2} className="px-4 py-3 text-center text-[11px] font-semibold text-foreground border-l border-border">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: BRAND_PALETTE[brand].solid }} />
                          {brand}
                        </div>
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b border-border bg-muted/10">
                    <th className="px-4 py-2" />
                    {activeBrands.map(brand => (
                      <>
                        <th key={`${brand}-c`} className="px-4 py-2 text-center text-[10px] font-semibold text-foreground border-l border-border">Current</th>
                        <th key={`${brand}-p`} className="px-4 py-2 text-center text-[10px] font-medium text-muted-foreground">Previous</th>
                      </>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map(({ key, label, color }, ri) => (
                    <tr key={key} className={cn("border-b border-border last:border-0 transition-colors hover:bg-muted/20", ri % 2 === 1 && "bg-muted/5")}>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="font-semibold text-foreground">{label}</span>
                        </div>
                      </td>
                      {activeBrands.map(brand => {
                        const r    = results[brand];
                        const curr = r.curr[key];
                        const prev = r.prev[key];
                        return (
                          <>
                            <td key={`${brand}-c`} className="px-4 py-3.5 text-center border-l border-border">
                              <div className="flex flex-col items-center gap-1">
                                <span className="font-bold tabular-nums text-foreground text-sm">{curr.toLocaleString()}</span>
                                <Delta curr={curr} prev={prev} size="sm" />
                              </div>
                            </td>
                            <td key={`${brand}-p`} className="px-4 py-3.5 text-center">
                              <span className="tabular-nums text-muted-foreground">{prev.toLocaleString()}</span>
                            </td>
                          </>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

        return (
          <div className="space-y-4">
            {kpiSection}
            {trendSection}
            {barCharts}
            {detailTable}
          </div>
        );
      })()}
    </div>
  );
}
