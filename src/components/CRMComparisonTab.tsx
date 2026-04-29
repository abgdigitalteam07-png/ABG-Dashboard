import { useState, useRef } from "react";
import { subDays, format } from "date-fns";
import { callFunction } from "@/lib/api-client";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import { TrendingUp, TrendingDown, Minus, RefreshCw, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
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

const BRAND_PALETTE: Record<SecondaryBrand, { solid: string; light: string }> = {
  "American Whirlpool": { solid: "#3B82F6", light: "#BFDBFE" },
  "Vita Spa":           { solid: "#7C3AED", light: "#DDD6FE" },
  "MAAX Sauna":         { solid: "#059669", light: "#A7F3D0" },
};

// ─── types ────────────────────────────────────────────────────────────────────
interface PeriodData {
  totalContacts: number;
  dealerAssigned: number;
  dealerUnassigned: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function dateStr(d: Date) {
  // Use local date components — toISOString() converts to UTC and can shift the
  // date by up to ±14 hours, causing wrong date ranges and numbers that change
  // depending on the time of day the report is run.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPeriods(days: number) {
  const today   = new Date();
  const currEnd  = today;
  const currStart = subDays(today, days - 1);
  const prevEnd   = subDays(today, days);
  const prevStart = subDays(today, days * 2 - 1);
  return { currStart, currEnd, prevStart, prevEnd };
}

// Fetch all selected brands for one period in a single edge function call.
// This avoids 4 parallel calls hitting the same HubSpot account concurrently
// and causing rate-limit-induced partial results.
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
  const up = d > 0.4; const dn = d < -0.4;
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

// ─── tooltip ──────────────────────────────────────────────────────────────────
interface ChartTooltipPayload {
  dataKey?: string | number;
  fill?: string;
  value?: string | number;
  name?: string | number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: ChartTooltipPayload[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-lg text-xs space-y-1.5">
      <p className="font-semibold text-muted-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.fill }} />
          <span className="text-foreground font-medium">{(p.value ?? 0).toLocaleString()}</span>
          <span className="text-muted-foreground text-[10px]">{p.name}</span>
        </div>
      ))}
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

function ComparisonContent() {
  const [selectedDays, setSelectedDays] = useState<number | null>(null);
  const [selectedBrands, setSelectedBrands] = useState<SecondaryBrand[]>([]);
  const [results, setResults] = useState<BrandResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const requestIdRef = useRef(0);

  function toggleBrand(b: SecondaryBrand) {
    setSelectedBrands((prev) => {
      const next = prev.includes(b)
        ? prev.filter((x) => x !== b)
        : prev.length < 3 ? [...prev, b] : prev;                 // max 3
      return next;
    });
  }

  function runReport(days: number | null, brands: SecondaryBrand[]) {
    if (!days || !brands.length) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    const { currStart, currEnd, prevStart, prevEnd } = getPeriods(days);

    // Two calls only: current period + previous period, each counting all brands
    // in a single pass. Previously this was 4 parallel calls all paging through
    // the same HubSpot account simultaneously, hammering rate limits.
    Promise.all([
      fetchAllBrandsForPeriod(brands, currStart, currEnd),
      fetchAllBrandsForPeriod(brands, prevStart, prevEnd),
    ]).then(([currAll, prevAll]) => {
      if (requestIdRef.current !== requestId) return;
      const map = {} as BrandResults;
      for (const brand of brands) {
        map[brand] = { curr: currAll[brand], prev: prevAll[brand] };
      }
      setResults(map);
      setLoading(false);
    }).catch((err) => {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : "Failed to load");
      setLoading(false);
    });
  }

  const periods = selectedDays ? getPeriods(selectedDays) : null;
  const currLabel = periods ? `${format(periods.currStart, "MMM d")} – ${format(periods.currEnd, "MMM d, yyyy")}` : "—";
  const prevLabel = periods ? `${format(periods.prevStart, "MMM d")} – ${format(periods.prevEnd, "MMM d, yyyy")}` : "—";

  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
  const gridColor = "hsl(var(--border))";

  // ─── Build chart data: X = metric, bars = brand×period ─────────────────────
  const METRICS = [
    { key: "totalContacts",    label: "Total Created" },
    { key: "dealerAssigned",   label: "Assigned" },
    { key: "dealerUnassigned", label: "Not Assigned" },
  ] as const;

  const chartData = results
    ? METRICS.map(({ key, label }) => {
        const row: Record<string, string | number> = { metric: label };
        for (const brand of selectedBrands) {
          const r = results[brand];
          if (!r) continue;
          row[`${brand} · current`]  = r.curr[key];
          row[`${brand} · previous`] = r.prev[key];
        }
        return row;
      })
    : [];

  return (
    <div className="space-y-5 p-6">

      {/* ═══ CONTROLS ═══ */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-5">

        {/* Period pills */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Period {!selectedDays && <span className="normal-case font-normal text-destructive/70">← pick one</span>}
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
          {/* period labels — only shown once a period is selected */}
          {selectedDays && (
            <div className="flex flex-wrap gap-3 pt-0.5">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-2 w-5 rounded-sm inline-block bg-foreground/30" />
                <span className="font-medium text-foreground">Current:</span> {currLabel}
              </div>
              <span className="text-muted-foreground/30">vs</span>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-2 w-5 rounded-sm inline-block bg-muted-foreground/30" />
                <span className="font-medium text-foreground">Previous:</span> {prevLabel}
              </div>
            </div>
          )}
        </div>

        {/* Brand checkboxes */}
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
              const active = selectedBrands.includes(brand);
              const palette = BRAND_PALETTE[brand];
              return (
                <button
                  key={brand}
                  onClick={() => toggleBrand(brand)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active ? "border-transparent text-white" : "border-border bg-background text-muted-foreground hover:text-foreground",
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

        {/* Run button */}
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

      {/* ═══ RESULTS ═══ */}
      {loading && <WaterFillLoader fullScreen={false} message="Loading comparison data…" />}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {!loading && results && (() => {
        const activeBrands = selectedBrands.filter((b) => results[b]);

        return (
          <div className="space-y-5">

            {/* ── Period comparison table ── */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              {/* table header */}
              <div className="grid border-b border-border bg-muted/30"
                style={{ gridTemplateColumns: `200px repeat(${activeBrands.length}, 1fr)` }}
              >
                <div className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Metric</div>
                {activeBrands.map((brand) => (
                  <div key={`${brand}-hd`} className="px-4 py-3 text-[11px] font-semibold text-foreground border-l border-border">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: BRAND_PALETTE[brand].solid }} />
                      <span className="truncate">{brand}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* rows */}
              {[
                { key: "totalContacts" as const,    label: "Total Created",      sub: "New contacts in period" },
                { key: "dealerAssigned" as const,   label: "Assigned to Dealer", sub: "Nearest Dealer Email is known" },
                { key: "dealerUnassigned" as const, label: "Not Assigned",       sub: "Nearest Dealer Email is empty" },
              ].map(({ key, label, sub }, ri) => (
                <div
                  key={key}
                  className={cn(
                    "grid items-center border-b border-border last:border-0",
                    ri % 2 === 1 && "bg-muted/10",
                  )}
                  style={{ gridTemplateColumns: `200px repeat(${activeBrands.length}, 1fr)` }}
                >
                  <div className="px-4 py-4">
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
                  </div>
                  {activeBrands.map((brand) => {
                    const r = results[brand];
                    const currVal = r.curr[key];
                    const total   = r.curr.totalContacts;
                    return (
                      <div key={`${brand}-cell`} className="px-4 py-4 border-l border-border">
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

            {/* ── Chart: grouped by metric, period = bar pair per brand ── */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-1 text-sm font-semibold text-foreground">Period Comparison Chart</h3>
              <p className="mb-5 text-xs text-muted-foreground">
                Each group shows current (solid) vs previous (light) — same period length shifted back
              </p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }} barCategoryGap="28%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis dataKey="metric" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value) => {
                      // shorten legend labels
                      const parts = (value as string).split(" · ");
                      return parts.length === 2 ? `${parts[0].replace("American Whirlpool", "Am. Whirlpool")} (${parts[1]})` : value;
                    }}
                  />
                  {activeBrands.map((brand) => (
                    <>
                      <Bar key={`${brand}-curr`}  dataKey={`${brand} · current`}  name={`${brand} · current`}  fill={BRAND_PALETTE[brand].solid} radius={[3,3,0,0]} />
                      <Bar key={`${brand}-prev`}  dataKey={`${brand} · previous`} name={`${brand} · previous`} fill={BRAND_PALETTE[brand].light} radius={[3,3,0,0]} />
                    </>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>
        );
      })()}
    </div>
  );
}
