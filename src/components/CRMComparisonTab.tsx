import { useState, useRef } from "react";
import { subDays, format } from "date-fns";
import { callFunction } from "@/lib/api-client";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import { TrendingUp, TrendingDown, Minus, RefreshCw, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from "recharts";

// ─── access control ───────────────────────────────────────────────────────────
const ALLOWED_EMAILS = new Set([
  "mali@americanbathgroup.com",
  "clee@americanbathgroup.com",
]);

// ─── brand + period config ────────────────────────────────────────────────────
const SECONDARY_BRANDS = ["American Whirlpool", "Vita Spa", "MAAX Sauna"] as const;
type SecondaryBrand = typeof SECONDARY_BRANDS[number];

const PERIOD_OPTIONS = [
  { label: "Last 30 days",  days: 30  },
  { label: "Last 60 days",  days: 60  },
  { label: "Last 90 days",  days: 90  },
  { label: "Last 6 months", days: 180 },
] as const;

const BRAND_PALETTE: Record<SecondaryBrand, { solid: string; faded: string }> = {
  "American Whirlpool": { solid: "#3B82F6", faded: "#93C5FD" },
  "Vita Spa":           { solid: "#7C3AED", faded: "#C4B5FD" },
  "MAAX Sauna":         { solid: "#059669", faded: "#6EE7B7" },
};

// Short labels for chart x-axis
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

// ─── helpers ──────────────────────────────────────────────────────────────────
function dateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPeriods(days: number) {
  const today    = new Date();
  const currEnd   = today;
  const currStart = subDays(today, days - 1);
  const prevEnd   = subDays(today, days);
  const prevStart = subDays(today, days * 2 - 1);
  return { currStart, currEnd, prevStart, prevEnd };
}

async function fetchAllBrandsForPeriod(
  brands: SecondaryBrand[],
  from: Date,
  to: Date,
): Promise<Record<SecondaryBrand, PeriodData>> {
  const data = await callFunction("hubspot-contacts", {
    brandNames: brands,
    startDate: dateStr(from),
    endDate: dateStr(to),
  });
  if (data?.error) throw new Error(data.error);
  const result = {} as Record<SecondaryBrand, PeriodData>;
  for (const brand of brands) {
    const s = data?.brandData?.[brand];
    result[brand] = {
      totalContacts:    s?.totalContacts        ?? 0,
      dealerAssigned:   s?.dealerAssignedTotal   ?? 0,
      dealerUnassigned: s?.dealerUnassignedTotal ?? 0,
    };
  }
  return result;
}

function pct(n: number, total: number) {
  return total ? Math.round((n / total) * 100) : 0;
}

// ─── change badge ─────────────────────────────────────────────────────────────
function ChangeBadge({ curr, prev }: { curr: number; prev: number }) {
  if (!prev) return <span className="text-[10px] text-muted-foreground/40">—</span>;
  const d = ((curr - prev) / prev) * 100;
  const up = d > 0.4;
  const dn = d < -0.4;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
      up && "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
      dn && "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
      !up && !dn && "bg-muted text-muted-foreground",
    )}>
      {up ? <TrendingUp className="h-3 w-3" /> : dn ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {(up || dn) ? `${up ? "+" : ""}${d.toFixed(1)}%` : "—"}
    </span>
  );
}

// ─── chart tooltip ────────────────────────────────────────────────────────────
function MetricTooltip({
  active, payload, label, currLabel, prevLabel,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  currLabel: string;
  prevLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const curr = payload.find((p: any) => p.dataKey === "curr");
  const prev = payload.find((p: any) => p.dataKey === "prev");
  const delta = curr && prev && prev.value > 0
    ? ((curr.value - prev.value) / prev.value) * 100
    : null;
  return (
    <div className="rounded-xl border border-border bg-card shadow-xl px-4 py-3 text-xs min-w-[180px] space-y-2.5">
      <p className="font-semibold text-sm text-foreground">{label}</p>
      <div className="space-y-1.5">
        {curr && (
          <div className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: curr.fill }} />
              {currLabel}
            </span>
            <span className="font-bold text-foreground tabular-nums">{(curr.value ?? 0).toLocaleString()}</span>
          </div>
        )}
        {prev && (
          <div className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: prev.fill }} />
              {prevLabel}
            </span>
            <span className="font-bold text-foreground tabular-nums">{(prev.value ?? 0).toLocaleString()}</span>
          </div>
        )}
      </div>
      {delta !== null && (
        <div className={cn(
          "pt-2 border-t border-border text-[11px] font-semibold",
          delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta < 0 ? "text-red-500 dark:text-red-400" : "text-muted-foreground",
        )}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "→"} {Math.abs(delta).toFixed(1)}% vs previous period
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
interface CRMComparisonTabProps { userEmail: string }

export function CRMComparisonTab({ userEmail }: CRMComparisonTabProps) {
  if (!ALLOWED_EMAILS.has(userEmail)) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        You don't have access to this report.
      </div>
    );
  }
  return <ComparisonContent />;
}

type BrandResults = Record<SecondaryBrand, { curr: PeriodData; prev: PeriodData }>;

const METRICS = [
  { key: "totalContacts"    as const, label: "Total Created",      sub: "New contacts in period" },
  { key: "dealerAssigned"   as const, label: "Assigned to Dealer", sub: "Has nearest dealer email" },
  { key: "dealerUnassigned" as const, label: "Not Assigned",       sub: "No dealer email on record" },
];

function ComparisonContent() {
  const [selectedDays, setSelectedDays]     = useState<number | null>(null);
  const [selectedBrands, setSelectedBrands] = useState<SecondaryBrand[]>([]);
  const [results, setResults]               = useState<BrandResults | null>(null);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const requestIdRef                        = useRef(0);

  function toggleBrand(b: SecondaryBrand) {
    setSelectedBrands((prev) =>
      prev.includes(b)
        ? prev.filter((x) => x !== b)
        : prev.length < 3 ? [...prev, b] : prev,
    );
  }

  function runReport(days: number | null, brands: SecondaryBrand[]) {
    if (!days || !brands.length) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const { currStart, currEnd, prevStart, prevEnd } = getPeriods(days);
    Promise.all([
      fetchAllBrandsForPeriod(brands, currStart, currEnd),
      fetchAllBrandsForPeriod(brands, prevStart, prevEnd),
    ]).then(([currAll, prevAll]) => {
      if (requestIdRef.current !== requestId) return;
      const map = {} as BrandResults;
      for (const brand of brands) map[brand] = { curr: currAll[brand], prev: prevAll[brand] };
      setResults(map);
      setLoading(false);
    }).catch((err) => {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : "Failed to load");
      setLoading(false);
    });
  }

  const periods   = selectedDays ? getPeriods(selectedDays) : null;
  const currLabel = periods ? `${format(periods.currStart, "MMM d")} – ${format(periods.currEnd, "MMM d, yyyy")}` : "—";
  const prevLabel = periods ? `${format(periods.prevStart, "MMM d")} – ${format(periods.prevEnd, "MMM d, yyyy")}` : "—";

  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

  return (
    <div className="space-y-5 p-6">

      {/* ═══ CONTROLS ═══ */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-5">

        {/* Period pills */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Period{!selectedDays && <span className="ml-1.5 normal-case font-normal text-destructive/70">← pick one</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map(({ label, days }) => (
              <button
                key={days}
                onClick={() => setSelectedDays(days)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                  selectedDays === days
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {selectedDays && (
            <div className="flex flex-wrap gap-4 pt-0.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-sm inline-block bg-foreground/25" />
                <span className="font-medium text-foreground">Current:</span> {currLabel}
              </span>
              <span className="text-muted-foreground/40">vs</span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-sm inline-block bg-muted-foreground/25 border border-dashed border-muted-foreground/40" />
                <span className="font-medium text-foreground">Previous:</span> {prevLabel}
              </span>
            </div>
          )}
        </div>

        {/* Brand toggles */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Brands{" "}
            <span className="normal-case font-normal">
              {selectedBrands.length === 0
                ? <span className="text-destructive/70">← pick 1–3</span>
                : `(${selectedBrands.length} selected)`}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {SECONDARY_BRANDS.map((brand) => {
              const active  = selectedBrands.includes(brand);
              const palette = BRAND_PALETTE[brand];
              return (
                <button
                  key={brand}
                  onClick={() => toggleBrand(brand)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-transparent text-white"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                  style={active ? { background: palette.solid } : {}}
                >
                  {active && <Check className="h-3 w-3" />}
                  {brand}
                </button>
              );
            })}
          </div>
        </div>

        {/* Run */}
        <button
          onClick={() => runReport(selectedDays, selectedBrands)}
          disabled={loading || !selectedDays || selectedBrands.length === 0}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {loading ? "Loading…" : "Run Report"}
        </button>
      </div>

      {/* ═══ EMPTY STATE ═══ */}
      {!loading && !results && !error && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 py-16 text-center">
          <p className="text-sm font-medium text-foreground">Select a period and at least one brand, then click Run Report</p>
          <p className="mt-1 text-xs text-muted-foreground">Data will only load when you're ready</p>
        </div>
      )}

      {loading && <WaterFillLoader fullScreen={false} message="Loading comparison data…" />}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {!loading && results && (() => {
        const activeBrands = selectedBrands.filter((b) => results[b]);

        // ── KPI summary row ──────────────────────────────────────────────────
        const kpiCards = (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${activeBrands.length}, 1fr)` }}>
            {activeBrands.map((brand) => {
              const r = results[brand];
              const { solid } = BRAND_PALETTE[brand];
              return (
                <div key={brand} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: solid }} />
                    <span className="text-xs font-semibold text-foreground truncate">{brand}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {METRICS.map(({ key, label }) => (
                      <div key={key} className="rounded-xl bg-muted/30 px-3 py-2.5">
                        <p className="text-[10px] text-muted-foreground leading-tight mb-1.5">{label}</p>
                        <p className="text-lg font-bold tabular-nums text-foreground leading-none">
                          {r.curr[key].toLocaleString()}
                        </p>
                        <div className="mt-1.5">
                          <ChangeBadge curr={r.curr[key]} prev={r.prev[key]} />
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                          prev {r.prev[key].toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );

        // ── Chart data: one row per brand, curr + prev per metric ────────────
        const buildChartRows = (metricKey: keyof PeriodData) =>
          activeBrands.map((b) => ({
            name:  BRAND_SHORT[b],
            curr:  results[b].curr[metricKey],
            prev:  results[b].prev[metricKey],
            solid: BRAND_PALETTE[b].solid,
            faded: BRAND_PALETTE[b].faded,
          }));

        // ── 3 metric charts ──────────────────────────────────────────────────
        const metricCharts = (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {/* chart header */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-5 pb-4 border-b border-border">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Period Comparison</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Current vs previous equivalent period — hover bars for details
                </p>
              </div>
              <div className="flex items-center gap-5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-foreground/20 shrink-0" />
                  <span><span className="font-medium text-foreground">Current</span> {currLabel}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-muted-foreground/20 border border-dashed border-muted-foreground/30 shrink-0" />
                  <span><span className="font-medium text-foreground">Previous</span> {prevLabel}</span>
                </span>
              </div>
            </div>

            {/* 3 charts side-by-side */}
            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {METRICS.map(({ key, label, sub }) => {
                const rows = buildChartRows(key);
                const maxVal = Math.max(...rows.flatMap(r => [r.curr, r.prev]), 1);

                return (
                  <div key={key} className="px-5 pt-5 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5 mb-4">{sub}</p>

                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={rows}
                        margin={{ top: 24, right: 4, bottom: 0, left: -10 }}
                        barGap={3}
                        barCategoryGap={activeBrands.length === 1 ? "55%" : "30%"}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="hsl(var(--border))"
                        />
                        <XAxis
                          dataKey="name"
                          tick={axisStyle}
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                        />
                        <YAxis
                          tick={axisStyle}
                          tickLine={false}
                          axisLine={false}
                          width={36}
                          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                          domain={[0, Math.ceil(maxVal * 1.18)]}
                        />
                        <Tooltip
                          content={
                            <MetricTooltip
                              currLabel={currLabel}
                              prevLabel={prevLabel}
                            />
                          }
                          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4, radius: 6 } as any}
                        />

                        {/* Current bars */}
                        <Bar dataKey="curr" name="Current" radius={[5, 5, 0, 0]} maxBarSize={52}>
                          {rows.map((r, i) => <Cell key={i} fill={r.solid} />)}
                          <LabelList
                            dataKey="curr"
                            position="top"
                            style={{ fontSize: 11, fontWeight: 700, fill: "hsl(var(--foreground))" }}
                            formatter={(v: number) => v > 0 ? v.toLocaleString() : ""}
                          />
                        </Bar>

                        {/* Previous bars */}
                        <Bar dataKey="prev" name="Previous" radius={[5, 5, 0, 0]} maxBarSize={52}>
                          {rows.map((r, i) => <Cell key={i} fill={r.faded} />)}
                          <LabelList
                            dataKey="prev"
                            position="top"
                            style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            formatter={(v: number) => v > 0 ? v.toLocaleString() : ""}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>
          </div>
        );

        // ── Details table (compact) ──────────────────────────────────────────
        const detailTable = (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="grid border-b border-border bg-muted/30"
              style={{ gridTemplateColumns: `180px repeat(${activeBrands.length}, 1fr)` }}
            >
              <div className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Metric</div>
              {activeBrands.map((brand) => (
                <div key={brand} className="px-4 py-3 text-[11px] font-semibold text-foreground border-l border-border">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: BRAND_PALETTE[brand].solid }} />
                    <span className="truncate">{brand}</span>
                  </div>
                </div>
              ))}
            </div>

            {[
              { key: "totalContacts"    as const, label: "Total Created",      sub: "New contacts in period" },
              { key: "dealerAssigned"   as const, label: "Assigned to Dealer", sub: "Nearest Dealer Email is known" },
              { key: "dealerUnassigned" as const, label: "Not Assigned",       sub: "Nearest Dealer Email is empty" },
            ].map(({ key, label, sub }, ri) => (
              <div
                key={key}
                className={cn(
                  "grid items-center border-b border-border last:border-0",
                  ri % 2 === 1 && "bg-muted/10",
                )}
                style={{ gridTemplateColumns: `180px repeat(${activeBrands.length}, 1fr)` }}
              >
                <div className="px-4 py-4">
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
                </div>
                {activeBrands.map((brand) => {
                  const r        = results[brand];
                  const currVal  = r.curr[key];
                  const total    = r.curr.totalContacts;
                  return (
                    <div key={brand} className="px-4 py-4 border-l border-border">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-lg font-bold tabular-nums text-foreground">{currVal.toLocaleString()}</p>
                        <ChangeBadge curr={currVal} prev={r.prev[key]} />
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="tabular-nums">
                          prev: {r.prev[key].toLocaleString()}
                          {key !== "totalContacts" && r.prev.totalContacts > 0 && (
                            <span className="text-muted-foreground/60"> · {pct(r.prev[key], r.prev.totalContacts)}%</span>
                          )}
                        </span>
                        {key !== "totalContacts" && total > 0 && (
                          <span>{pct(currVal, total)}% of total</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );

        return (
          <div className="space-y-5">
            {kpiCards}
            {metricCharts}
            {detailTable}
          </div>
        );
      })()}
    </div>
  );
}
