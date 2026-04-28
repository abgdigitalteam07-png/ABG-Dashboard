import { useState, useEffect } from "react";
import { format, subDays } from "date-fns";
import { callFunction } from "@/lib/api-client";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import { TrendingUp, TrendingDown, Minus, Users, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ─── access + brand config ────────────────────────────────────────────────────

const ALLOWED_EMAILS = new Set([
  "mali@americanbathgroup.com",
  "clee@americanbathgroup.com",
]);

// All brands on the secondary HubSpot account
const SECONDARY_BRANDS = ["American Whirlpool", "Vita Spa", "MAAX Sauna"] as const;
type SecondaryBrand = typeof SECONDARY_BRANDS[number];

// ─── types ────────────────────────────────────────────────────────────────────

interface PeriodData {
  totalContacts: number;
  dealerAssigned: number;
  dealerUnassigned: number;
}

interface DateRange { from: string; to: string }

// ─── helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split("T")[0];
}
function daysAgoStr(n: number) {
  return subDays(new Date(), n).toISOString().split("T")[0];
}
function fmtLabel(range: DateRange) {
  return `${format(new Date(range.from + "T00:00:00"), "MMM d")} – ${format(new Date(range.to + "T00:00:00"), "MMM d, yyyy")}`;
}

async function fetchPeriodData(brandName: string, range: DateRange): Promise<PeriodData> {
  const data = await callFunction("hubspot-contacts", {
    brandName,
    startDate: range.from,
    endDate: range.to,
  });
  if (data?.error) throw new Error(data.error);
  return {
    totalContacts:    data?.totalContacts       ?? 0,
    dealerAssigned:   data?.dealerAssignedTotal  ?? 0,
    dealerUnassigned: data?.dealerUnassignedTotal ?? 0,
  };
}

function pct(n: number, total: number) {
  return total ? Math.round((n / total) * 100) : 0;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ChangeBadge({ current, previous }: { current: number; previous: number }) {
  if (!previous) return <span className="text-[10px] text-muted-foreground/50">—</span>;
  const diff = ((current - previous) / previous) * 100;
  const up = diff > 0.4; const dn = diff < -0.4;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
      up && "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400",
      dn && "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400",
      !up && !dn && "bg-muted text-muted-foreground",
    )}>
      {up ? <TrendingUp className="h-3 w-3" /> : dn ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {(up || dn) ? `${up ? "+" : ""}${diff.toFixed(1)}%` : "—"}
    </span>
  );
}

function MetricRow({
  icon: Icon, iconClass, label, curr, prev, currTotal,
}: {
  icon: React.ElementType; iconClass: string; label: string;
  curr: number; prev: number; currTotal: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-muted/30 px-4 py-3 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={cn("h-4 w-4 shrink-0", iconClass)} />
        <span className="text-sm font-medium text-foreground truncate">{label}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums text-foreground">{curr.toLocaleString()}</p>
          {currTotal > 0 && <p className="text-[10px] text-muted-foreground">{pct(curr, currTotal)}% of total</p>}
        </div>
        <div className="text-right min-w-[40px]">
          <p className="text-xs tabular-nums text-muted-foreground">{prev.toLocaleString()}</p>
          {currTotal > 0 && <p className="text-[10px] text-muted-foreground/60">{pct(prev, currTotal)}%</p>}
        </div>
        <ChangeBadge current={curr} previous={prev} />
      </div>
    </div>
  );
}

function BrandCard({
  brand, current, previous, accentColor,
}: {
  brand: string; current: PeriodData; previous: PeriodData; accentColor: string;
}) {
  const assignedPct = pct(current.dealerAssigned, current.totalContacts);
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: accentColor }} />
        <h3 className="text-sm font-bold text-foreground">{brand}</h3>
      </div>
      <div className="p-5 space-y-4">
        {/* column labels */}
        <div className="flex items-center justify-between px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          <span>Metric</span>
          <div className="flex gap-3">
            <span className="min-w-[48px] text-right">Current</span>
            <span className="min-w-[40px] text-right">Prev</span>
            <span className="min-w-[52px] text-right">Change</span>
          </div>
        </div>
        <div className="space-y-2">
          <MetricRow icon={Users}        iconClass="text-blue-500"   label="Total Created"      curr={current.totalContacts}    prev={previous.totalContacts}    currTotal={0} />
          <MetricRow icon={CheckCircle2} iconClass="text-emerald-500" label="Assigned to Dealer" curr={current.dealerAssigned}   prev={previous.dealerAssigned}   currTotal={current.totalContacts} />
          <MetricRow icon={XCircle}      iconClass="text-red-400"    label="Not Assigned"        curr={current.dealerUnassigned} prev={previous.dealerUnassigned} currTotal={current.totalContacts} />
        </div>
        {/* assignment rate bar */}
        {current.totalContacts > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Dealer assignment rate</span>
              <span className="font-semibold text-foreground">{assignedPct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${assignedPct}%`, background: accentColor }} />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm inline-block" style={{ background: accentColor }} />
                Assigned {assignedPct}%
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm inline-block bg-muted-foreground/30" />
                Not assigned {100 - assignedPct}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── date range input ─────────────────────────────────────────────────────────

function DateRangeInput({
  label, value, onChange,
}: {
  label: string; value: DateRange; onChange: (v: DateRange) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={value.from}
          max={value.to}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <input
          type="date"
          value={value.to}
          min={value.from}
          max={todayStr()}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
    </div>
  );
}

// ─── brand selector ───────────────────────────────────────────────────────────

function BrandSelect({
  label, value, exclude, onChange,
}: {
  label: string; value: SecondaryBrand; exclude: SecondaryBrand; onChange: (v: SecondaryBrand) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SecondaryBrand)}
        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {SECONDARY_BRANDS.filter((b) => b !== exclude).map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

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

const ACCENT_COLORS = ["#3B82F6", "#7C3AED"] as const;

function ComparisonContent() {
  const [brandA, setBrandA] = useState<SecondaryBrand>("American Whirlpool");
  const [brandB, setBrandB] = useState<SecondaryBrand>("Vita Spa");

  const [currentRange, setCurrentRange]   = useState<DateRange>({ from: daysAgoStr(89), to: todayStr() });
  const [previousRange, setPreviousRange] = useState<DateRange>({ from: daysAgoStr(179), to: daysAgoStr(90) });

  const [results, setResults] = useState<[PeriodData, PeriodData, PeriodData, PeriodData] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [ran, setRan]         = useState(false);

  function runReport() {
    setLoading(true);
    setError(null);
    setRan(true);
    Promise.all([
      fetchPeriodData(brandA, currentRange),
      fetchPeriodData(brandA, previousRange),
      fetchPeriodData(brandB, currentRange),
      fetchPeriodData(brandB, previousRange),
    ]).then(([aCurr, aPrev, bCurr, bPrev]) => {
      setResults([aCurr, aPrev, bCurr, bPrev]);
      setLoading(false);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load");
      setLoading(false);
    });
  }

  // Auto-run on first mount
  useEffect(() => { runReport(); }, []);

  const currLabel = fmtLabel(currentRange);
  const prevLabel = fmtLabel(previousRange);

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
    <div className="space-y-6 p-6">

      {/* ═══ CONTROLS ═══ */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-bold text-foreground">Report Settings</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <BrandSelect label="Brand A" value={brandA} exclude={brandB} onChange={setBrandA} />
          <BrandSelect label="Brand B" value={brandB} exclude={brandA} onChange={setBrandB} />
          <DateRangeInput label="Current Period"  value={currentRange}  onChange={setCurrentRange} />
          <DateRangeInput label="Previous Period" value={previousRange} onChange={setPreviousRange} />
        </div>

        <button
          onClick={runReport}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {loading ? "Loading…" : "Run Report"}
        </button>
      </div>

      {/* ═══ RESULTS ═══ */}
      {loading && <WaterFillLoader fullScreen={false} message="Loading comparison data…" />}
      {error   && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

      {!loading && results && (() => {
        const [aCurr, aPrev, bCurr, bPrev] = results;

        const barData = [
          {
            name: "Total Created",
            [`${brandA} (current)`]:  aCurr.totalContacts,
            [`${brandA} (previous)`]: aPrev.totalContacts,
            [`${brandB} (current)`]:  bCurr.totalContacts,
            [`${brandB} (previous)`]: bPrev.totalContacts,
          },
          {
            name: "Assigned",
            [`${brandA} (current)`]:  aCurr.dealerAssigned,
            [`${brandA} (previous)`]: aPrev.dealerAssigned,
            [`${brandB} (current)`]:  bCurr.dealerAssigned,
            [`${brandB} (previous)`]: bPrev.dealerAssigned,
          },
          {
            name: "Not Assigned",
            [`${brandA} (current)`]:  aCurr.dealerUnassigned,
            [`${brandA} (previous)`]: aPrev.dealerUnassigned,
            [`${brandB} (current)`]:  bCurr.dealerUnassigned,
            [`${brandB} (previous)`]: bPrev.dealerUnassigned,
          },
        ];

        return (
          <div className="space-y-5">
            {/* period labels */}
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Current period", value: currLabel, color: "bg-blue-500" },
                { label: "Previous period", value: prevLabel, color: "bg-blue-200 dark:bg-blue-900" },
              ].map((p) => (
                <div key={p.label} className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2 text-[11px]">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", p.color)} />
                  <span className="font-semibold text-foreground">{p.label}:</span>
                  <span className="text-muted-foreground">{p.value}</span>
                </div>
              ))}
            </div>

            {/* brand cards */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <BrandCard brand={brandA} current={aCurr} previous={aPrev} accentColor={ACCENT_COLORS[0]} />
              <BrandCard brand={brandB} current={bCurr} previous={bPrev} accentColor={ACCENT_COLORS[1]} />
            </div>

            {/* combined chart */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-1 text-sm font-semibold text-foreground">Side-by-Side Comparison</h3>
              <p className="mb-5 text-xs text-muted-foreground">
                Created, assigned, and not-assigned contacts — current vs previous period
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} margin={{ left: 0, right: 16, top: 4, bottom: 0 }} barCategoryGap="30%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey={`${brandA} (current)`}  fill="#3B82F6" radius={[3,3,0,0]} />
                  <Bar dataKey={`${brandA} (previous)`} fill="#93C5FD" radius={[3,3,0,0]} />
                  <Bar dataKey={`${brandB} (current)`}  fill="#7C3AED" radius={[3,3,0,0]} />
                  <Bar dataKey={`${brandB} (previous)`} fill="#C4B5FD" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      {!loading && !results && ran && !error && (
        <div className="py-16 text-center text-sm text-muted-foreground">No data found for the selected range.</div>
      )}
    </div>
  );
}
