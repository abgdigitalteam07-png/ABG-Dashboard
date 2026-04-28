import { useState, useEffect, useMemo } from "react";
import { subDays, format } from "date-fns";
import { callFunction } from "@/lib/api-client";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import { TrendingUp, TrendingDown, Minus, Users, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts";

const ALLOWED_EMAILS = new Set([
  "mali@americanbathgroup.com",
  "clee@americanbathgroup.com",
]);

const COMPARISON_BRANDS = ["American Whirlpool", "Vita Spa"] as const;
type BrandName = typeof COMPARISON_BRANDS[number];

interface PeriodData {
  totalContacts: number;
  dealerAssigned: number;
  dealerUnassigned: number;
}

function formatDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

async function fetchPeriodData(brandName: string, start: Date, end: Date): Promise<PeriodData> {
  const data = await callFunction("hubspot-data", {
    brandName,
    startDate: formatDateStr(start),
    endDate: formatDateStr(end),
  });
  return {
    totalContacts:    data?.totalContacts      ?? 0,
    dealerAssigned:   data?.dealerAssignedTotal   ?? 0,
    dealerUnassigned: data?.dealerUnassignedTotal ?? 0,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

function ChangeBadge({ current, previous }: { current: number; previous: number }) {
  if (!previous) return null;
  const diff = ((current - previous) / previous) * 100;
  const up   = diff > 0.4;
  const down = diff < -0.4;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
      up   && "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400",
      down && "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400",
      !up && !down && "bg-muted text-muted-foreground",
    )}>
      {up   ? <TrendingUp   className="h-3 w-3" /> :
       down ? <TrendingDown className="h-3 w-3" /> :
              <Minus        className="h-3 w-3" />}
      {up || down ? `${up ? "+" : ""}${diff.toFixed(1)}%` : "—"}
    </span>
  );
}

// One metric row: label | current value + % | vs previous | change badge
function MetricRow({
  icon: Icon,
  iconClass,
  label,
  curr,
  prev,
  currTotal,
  prevTotal,
}: {
  icon: React.ElementType;
  iconClass: string;
  label: string;
  curr: number;
  prev: number;
  currTotal: number;
  prevTotal: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3 gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={cn("h-4 w-4 shrink-0", iconClass)} />
        <span className="text-sm font-medium text-foreground truncate">{label}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {/* current */}
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums text-foreground">{curr.toLocaleString()}</p>
          {currTotal > 0 && (
            <p className="text-[10px] text-muted-foreground">{pct(curr, currTotal)}% of total</p>
          )}
        </div>
        {/* previous */}
        <div className="text-right min-w-[48px]">
          <p className="text-xs tabular-nums text-muted-foreground">{prev.toLocaleString()}</p>
          {prevTotal > 0 && (
            <p className="text-[10px] text-muted-foreground/70">{pct(prev, prevTotal)}%</p>
          )}
        </div>
        <ChangeBadge current={curr} previous={prev} />
      </div>
    </div>
  );
}

// ─── brand card ───────────────────────────────────────────────────────────────

function BrandCard({
  name,
  current,
  previous,
  currentLabel,
  previousLabel,
  accentColor,
}: {
  name: BrandName;
  current: PeriodData;
  previous: PeriodData;
  currentLabel: string;
  previousLabel: string;
  accentColor: string;
}) {
  const assignedPct   = pct(current.dealerAssigned,   current.totalContacts);
  const unassignedPct = pct(current.dealerUnassigned, current.totalContacts);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* header strip */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: accentColor }} />
        <h3 className="text-sm font-bold text-foreground">{name}</h3>
      </div>

      <div className="p-5 space-y-4">
        {/* column headers */}
        <div className="flex items-center justify-between px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          <span>Metric</span>
          <div className="flex gap-3">
            <span className="min-w-[56px] text-right">Current</span>
            <span className="min-w-[48px] text-right">Previous</span>
            <span className="min-w-[52px] text-right">Change</span>
          </div>
        </div>

        {/* rows */}
        <div className="space-y-2">
          <MetricRow
            icon={Users}
            iconClass="text-blue-500"
            label="Total Created"
            curr={current.totalContacts}
            prev={previous.totalContacts}
            currTotal={0}
            prevTotal={0}
          />
          <MetricRow
            icon={CheckCircle2}
            iconClass="text-emerald-500"
            label="Assigned to Dealer"
            curr={current.dealerAssigned}
            prev={previous.dealerAssigned}
            currTotal={current.totalContacts}
            prevTotal={previous.totalContacts}
          />
          <MetricRow
            icon={XCircle}
            iconClass="text-red-400"
            label="Not Assigned"
            curr={current.dealerUnassigned}
            prev={previous.dealerUnassigned}
            currTotal={current.totalContacts}
            prevTotal={previous.totalContacts}
          />
        </div>

        {/* assignment rate bar */}
        {current.totalContacts > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Dealer assignment rate (current)</span>
              <span className="font-semibold text-foreground">{assignedPct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${assignedPct}%`, background: accentColor }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: accentColor }} />
                Assigned {assignedPct}%
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-red-300 dark:bg-red-700" />
                Not assigned {unassignedPct}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

interface CRMComparisonTabProps {
  userEmail: string;
}

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

function ComparisonContent() {
  const [results, setResults] = useState<Record<BrandName, { current: PeriodData; previous: PeriodData }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const periods = useMemo(() => {
    const today = new Date();
    return {
      current:  { start: subDays(today, 89), end: today },
      previous: { start: subDays(today, 179), end: subDays(today, 90) },
    };
  }, []);

  const currentLabel  = `${format(periods.current.start,  "MMM d")} – ${format(periods.current.end,  "MMM d, yyyy")}`;
  const previousLabel = `${format(periods.previous.start, "MMM d")} – ${format(periods.previous.end, "MMM d, yyyy")}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(
      COMPARISON_BRANDS.map(async (brand) => {
        const [curr, prev] = await Promise.all([
          fetchPeriodData(brand, periods.current.start,  periods.current.end),
          fetchPeriodData(brand, periods.previous.start, periods.previous.end),
        ]);
        return { brand, current: curr, previous: prev };
      })
    ).then((data) => {
      if (cancelled) return;
      const map = {} as Record<BrandName, { current: PeriodData; previous: PeriodData }>;
      for (const d of data) map[d.brand as BrandName] = d;
      setResults(map);
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : "Failed to load");
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  if (loading) return <WaterFillLoader fullScreen={false} message="Loading comparison data…" />;
  if (error)   return <div className="p-6 text-sm text-destructive">{error}</div>;
  if (!results) return null;

  const BRAND_COLORS: Record<BrandName, string> = {
    "American Whirlpool": "#3B82F6",
    "Vita Spa":           "#7C3AED",
  };

  // Grouped bar chart — one group per brand, three bars: total / assigned / unassigned
  const barData = COMPARISON_BRANDS.map((brand) => ({
    brand: brand === "American Whirlpool" ? "Am. Whirlpool" : "Vita Spa",
    "Created (current)":        results[brand].current.totalContacts,
    "Assigned (current)":       results[brand].current.dealerAssigned,
    "Not assigned (current)":   results[brand].current.dealerUnassigned,
    "Created (previous)":       results[brand].previous.totalContacts,
    "Assigned (previous)":      results[brand].previous.dealerAssigned,
    "Not assigned (previous)":  results[brand].previous.dealerUnassigned,
  }));

  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
  const gridColor = "hsl(var(--border))";

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs space-y-1">
        <p className="font-semibold text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.fill }} />
            <span className="text-foreground font-medium">{(p.value ?? 0).toLocaleString()}</span>
            <span className="text-muted-foreground">{p.name}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8 p-6">

      {/* ═══ HEADER ═══ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground">Lead Comparison Report</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            American Whirlpool &amp; Vita Spa — contacts created and dealer assignment
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-2 text-[11px]">
          <div>
            <p className="font-semibold text-foreground">Current period</p>
            <p className="text-muted-foreground">{currentLabel}</p>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <p className="font-semibold text-foreground">Previous period</p>
            <p className="text-muted-foreground">{previousLabel}</p>
          </div>
        </div>
      </div>

      {/* ═══ BRAND CARDS ═══ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {COMPARISON_BRANDS.map((brand) => (
          <BrandCard
            key={brand}
            name={brand}
            current={results[brand].current}
            previous={results[brand].previous}
            currentLabel={currentLabel}
            previousLabel={previousLabel}
            accentColor={BRAND_COLORS[brand]}
          />
        ))}
      </div>

      {/* ═══ COMBINED CHART ═══ */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Current vs Previous — Side by Side</h3>
        <p className="mb-5 text-xs text-muted-foreground">
          Contacts created, dealer-assigned, and not assigned for each brand across both periods
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={barData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }} barCategoryGap="25%" barGap={2}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis dataKey="brand" tick={axisStyle} tickLine={false} axisLine={false} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Created (current)"       fill="#3B82F6" radius={[3,3,0,0]} />
            <Bar dataKey="Assigned (current)"      fill="#10B981" radius={[3,3,0,0]} />
            <Bar dataKey="Not assigned (current)"  fill="#F87171" radius={[3,3,0,0]} />
            <Bar dataKey="Created (previous)"      fill="#93C5FD" radius={[3,3,0,0]} />
            <Bar dataKey="Assigned (previous)"     fill="#6EE7B7" radius={[3,3,0,0]} />
            <Bar dataKey="Not assigned (previous)" fill="#FCA5A5" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
