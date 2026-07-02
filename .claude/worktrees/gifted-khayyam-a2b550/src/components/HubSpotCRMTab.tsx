import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { fetchHubSpotData } from "@/lib/api-client";
import { Brand } from "@/lib/brands";
import { Users, TrendingUp, UserCheck, UserX, RefreshCw } from "lucide-react";
import { ContactCharts } from "@/components/ContactCharts";
import { AIRecommendations } from "./AIRecommendations";
import { CRMComparisonSection } from "./CRMComparisonTab";
import { CRMChatPanel } from "./CRMChatPanel";


interface HubSpotCRMTabProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
  userEmail?: string;
}

// Marketing funnel: Subscriber → MQL only
const MARKETING_FUNNEL_STAGES = [
  "subscriber",
  "lead",
  "marketingqualifiedlead",
];

const MARKETING_STAGE_LABELS: Record<string, string> = {
  subscriber: "Subscriber",
  lead: "Lead",
  marketingqualifiedlead: "MQL",
};

const MARKETING_FUNNEL_COLORS = [
  "#3B82F6",
  "#7C3AED",
  "#10B981",
];

// Sales funnel: SQL → Opportunity → Customer
const SALES_FUNNEL_STAGES = [
  "salesqualifiedlead",
  "opportunity",
  "customer",
];

const SALES_STAGE_LABELS: Record<string, string> = {
  salesqualifiedlead: "SQL",
  opportunity: "Opportunity",
  customer: "Customer",
};

const SALES_FUNNEL_COLORS = [
  "#F59E0B",
  "#F97316",
  "#10B981",
];

/* ── Skeleton pulse ── */
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

/* ── Section header ── */
function SectionHeader({ icon: Icon, label, color }: { icon: React.ElementType; label: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <h2 className="text-base font-bold text-foreground">{label}</h2>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

/* ── Chart card wrapper ── */
function ChartCard({ title, subtitle, children, headerRight }: { title: string; subtitle?: string; children: React.ReactNode; headerRight?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

/* ── Custom tooltip ── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="mb-1 font-semibold text-muted-foreground">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-foreground font-medium">{(p.value || 0).toLocaleString()}</span>
          <span className="text-muted-foreground">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

const SECONDARY_BRAND_NAMES = new Set(["American Whirlpool", "Vita Spa", "MAAX Sauna"]);

interface SecondaryStats {
  total: number; assigned: number; unassigned: number;
  prevTotal: number; prevAssigned: number; prevUnassigned: number;
  timeSeries?: Record<string, number>;
}

export function HubSpotCRMTab({ brand, dateFrom, dateTo, userEmail = "" }: HubSpotCRMTabProps) {
  const isSecondaryBrand = SECONDARY_BRAND_NAMES.has(brand.name) || brand.hubspotAccount === "secondary";

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const showLoader = useFirstLoad(loading);

  const [secondaryStats, setSecondaryStats] = useState<SecondaryStats | null>(null);
  // Reset lifted stats when brand or date range changes
  useEffect(() => { setSecondaryStats(null); }, [brand.id, dateFrom.getTime(), dateTo.getTime()]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHubSpotData(brand, dateFrom, dateTo)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [brand.id, dateFrom.getTime(), dateTo.getTime(), refreshKey]);

  // Build lifecycle stage map helper
  function buildStageMap(stages: any[]): Record<string, number> {
    const map: Record<string, number> = {};
    for (const s of stages) {
      if (s.key) map[s.key] = s.count;
      map[(s.stage || "").toLowerCase().replace(/\s/g, "")] = s.count;
    }
    return map;
  }

  // Use date-filtered lifecycle stages for the funnel cards (contacts created in selected period)
  const marketingFunnelData = useMemo(() => {
    const stages = data?.lifecycleStages || data?.lifecycleStagesAllTime;
    if (!stages) return [];
    const map = buildStageMap(stages);
    return MARKETING_FUNNEL_STAGES.map((key, i) => ({
      key,
      label: MARKETING_STAGE_LABELS[key],
      count: map[key] || 0,
      color: MARKETING_FUNNEL_COLORS[i],
      conversionRate:
        i > 0 && map[MARKETING_FUNNEL_STAGES[i - 1]] > 0
          ? (map[key] / map[MARKETING_FUNNEL_STAGES[i - 1]]) * 100
          : undefined,
    }));
  }, [data]);

  const salesFunnelData = useMemo(() => {
    const stages = data?.lifecycleStages || data?.lifecycleStagesAllTime;
    if (!stages) return [];
    const map = buildStageMap(stages);
    return SALES_FUNNEL_STAGES.map((key, i) => ({
      key,
      label: SALES_STAGE_LABELS[key],
      count: map[key] || 0,
      color: SALES_FUNNEL_COLORS[i],
      conversionRate:
        i > 0 && map[SALES_FUNNEL_STAGES[i - 1]] > 0
          ? (map[key] / map[SALES_FUNNEL_STAGES[i - 1]]) * 100
          : undefined,
    }));
  }, [data]);

  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
  const gridColor = "hsl(var(--border))";

  if (loading) {
    return <WaterFillLoader fullScreen={false} message="Loading CRM data…" />;
  }

  if (!data) return null;

  const chatContext = {
    totalContacts: data?.totalContacts,
    dealerAssignedTotal: data?.dealerAssignedTotal,
    dealerUnassignedTotal: data?.dealerUnassignedTotal,
    dateRange: `${format(dateFrom, "MMM d, yyyy")} – ${format(dateTo, "MMM d, yyyy")}`,
    secondaryStats: secondaryStats ?? undefined,
  };

  return (
    <>
    <div className="space-y-8 p-6">
      {/* ── Refresh button ── */}
      <div className="flex justify-end">
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {isSecondaryBrand ? (
        /* ═══ TOP — 3 KPI cards for secondary brands ═══ */
        <section>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                label: "Total Created",
                curr: secondaryStats?.total    ?? data.totalContacts        ?? 0,
                prev: secondaryStats?.prevTotal    ?? null,
                color: "#3B82F6", Icon: Users,
              },
              {
                label: "Assigned to Dealer",
                curr: secondaryStats?.assigned ?? data.dealerAssignedTotal  ?? 0,
                prev: secondaryStats?.prevAssigned ?? null,
                color: "#10B981", Icon: UserCheck,
              },
              {
                label: "Not Assigned",
                curr: secondaryStats?.unassigned ?? data.dealerUnassignedTotal ?? 0,
                prev: secondaryStats?.prevUnassigned ?? null,
                color: "#F59E0B", Icon: UserX,
              },
            ].map(({ label, curr, prev, color, Icon }) => {
              const delta = (prev !== null && prev > 0) ? ((curr - prev) / prev) * 100 : null;
              const up = delta !== null && delta > 0.4;
              const dn = delta !== null && delta < -0.4;
              return (
                <div key={label} className="relative rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: color }} />
                  <div className="pl-6 pr-5 pt-5 pb-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl shrink-0" style={{ background: `${color}15` }}>
                          <Icon className="h-4 w-4" style={{ color }} />
                        </div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
                      </div>
                      {delta !== null && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0 ${
                          up  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" :
                          dn  ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400" :
                                "bg-muted text-muted-foreground"
                        }`}>
                          {up ? "▲" : dn ? "▼" : "→"} {up ? "+" : ""}{delta.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <p className="text-5xl font-black tabular-nums text-foreground leading-none">{curr.toLocaleString()}</p>
                    {prev !== null ? (
                      <p className="text-[11px] text-muted-foreground">
                        vs <span className="font-semibold tabular-nums">{prev.toLocaleString()}</span> previous period
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">New contacts in selected date range</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <>
          {/* ═══ TOP — Contacts Created ═══ */}
          <section>
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contacts Created</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
                {(data.totalContacts || 0).toLocaleString()}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">New contacts in selected date range</p>
            </div>
          </section>

          {/* ═══ SECTION 1 — Marketing Leads Cycle ═══ */}
          <section className="space-y-5">
            <SectionHeader icon={TrendingUp} label="Marketing Leads Cycle" color="bg-blue-600" />
            <ChartCard
              title="Subscriber to MQL Funnel"
              subtitle="Contacts created in selected period, by current lifecycle stage"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {marketingFunnelData.map((stage) => (
                  <div key={stage.key} className="rounded-xl bg-muted/40 p-5 transition-colors hover:bg-muted/60">
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: stage.color }}>
                      {stage.label}
                    </p>
                    <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{stage.count.toLocaleString()}</p>
                    {stage.conversionRate !== undefined && (
                      <p className="mt-1 text-[11px] text-muted-foreground">{stage.conversionRate.toFixed(1)}% from prev stage</p>
                    )}
                  </div>
                ))}
              </div>
              {marketingFunnelData.some((s) => s.count > 0) ? (
                <div className="mt-6">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={marketingFunnelData.map((s) => ({ name: s.label, count: s.count, color: s.color }))}
                      layout="vertical"
                      margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                      <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" tick={axisStyle} width={90} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Contacts" radius={[0, 4, 4, 0]}>
                        {marketingFunnelData.map((s, i) => (<Cell key={i} fill={s.color} />))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="mt-6 py-8 text-center text-sm text-muted-foreground">No lifecycle stage data available for {brand.name}</p>
              )}
            </ChartCard>
          </section>
        </>
      )}

      {/* ═══ SECTION 3 — Contact Charts ═══ */}
      <section className="space-y-5">
        <SectionHeader icon={Users} label={isSecondaryBrand ? "Lead Analytics" : "Contact Analytics"} color="bg-emerald-600" />
        <ContactCharts
          brand={brand}
          dateFrom={dateFrom}
          dateTo={dateTo}
          data={data}
          loading={loading}
          error={error}
          externalStateDistribution={data?.contactStateDistribution}
          externalUnknownStateCount={data?.contactUnknownStateCount}
          dealerWithDealDistribution={data?.dealerWithDealStateDistribution}
          dealerWithoutDealDistribution={data?.dealerWithoutDealStateDistribution}
          hideSourceBreakdown={isSecondaryBrand}
          useLeadLabel={isSecondaryBrand}
          overrideAssignedTotal={isSecondaryBrand ? (secondaryStats?.assigned ?? undefined) : undefined}
          overrideUnassignedTotal={isSecondaryBrand ? (secondaryStats?.unassigned ?? undefined) : undefined}
          overrideTimeSeries={isSecondaryBrand ? (secondaryStats?.timeSeries ?? undefined) : undefined}
        />
      </section>

      <AIRecommendations
        tabName="hubspot_crm"
        brandName={brand.name}
        dateRange={`${format(dateFrom, "MMM d, yyyy")} – ${format(dateTo, "MMM d, yyyy")}`}
        metrics={{
          totalContacts: data?.totalContacts,
          totalContactsAllTime: data?.totalContactsAllTime,
        }}
      />
    </div>

    {/* ── Claude chat panel — fixed floating, secondary brands only ── */}
    {isSecondaryBrand && <CRMChatPanel brandName={brand.name} context={chatContext} />}

    {isSecondaryBrand && (
      <CRMComparisonSection
        dateFrom={dateFrom}
        dateTo={dateTo}
        userEmail={userEmail}
        currentBrandName={brand.name}
        onStatsReady={setSecondaryStats}
      />
    )}
    </>
  );
}
