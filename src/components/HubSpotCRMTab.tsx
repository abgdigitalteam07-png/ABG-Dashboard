import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { fetchHubSpotData } from "@/lib/api-client";
import { Brand } from "@/lib/brands";
import { ArrowRight, Users, TrendingUp, BarChart2, CheckCircle2 } from "lucide-react";
import { ContactCharts } from "@/components/ContactCharts";
import { AIRecommendations } from "./AIRecommendations";
import { cn } from "@/lib/utils";

interface HubSpotCRMTabProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
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

export function HubSpotCRMTab({ brand, dateFrom, dateTo }: HubSpotCRMTabProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const showLoader = useFirstLoad(loading);

  useEffect(() => {
    let cancelled = false;
    setData(null);
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
  }, [brand.id, dateFrom.getTime(), dateTo.getTime()]);

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

  if (showLoader) {
    return <WaterFillLoader fullScreen={false} message="Loading CRM data…" />;
  }

  if (!data) return null;

  return (
    <div className="space-y-8 p-6">

      {/* ═══ TOP — Total Contacts Created (Hero Stats) ═══ */}
      <section>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Contacts Created</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
              {(data.totalContactsAllTime || 0).toLocaleString()}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">All-time lifetime total in CRM</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contacts Created (Selected Period)</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
              {(data.totalContacts || 0).toLocaleString()}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">New contacts in date range</p>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 1 — Marketing Leads Cycle ═══ */}
      <section className="space-y-5">
        <SectionHeader icon={TrendingUp} label="Marketing Leads Cycle" color="bg-blue-600" />

        <ChartCard
          title="Subscriber to MQL Funnel"
          subtitle="Contacts created in selected period, by current lifecycle stage"
        >
          {/* Funnel cards — horizontal flow */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
            {marketingFunnelData.map((stage, i) => (
              <div key={stage.key} className={cn("flex items-center", i > 0 && "sm:flex-row")}>
                {i > 0 && (
                  <div className="hidden items-center px-3 sm:flex">
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div
                  className="flex-1 rounded-2xl border p-5 transition-all hover:shadow-md"
                  style={{ borderColor: stage.color, background: `${stage.color}15` }}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: stage.color }}>
                    {stage.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
                    {stage.count.toLocaleString()}
                  </p>
                  {stage.conversionRate !== undefined && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {stage.conversionRate.toFixed(1)}% from prev stage
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Bar chart visual for the marketing funnel */}
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
                    {marketingFunnelData.map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-6 py-8 text-center text-sm text-muted-foreground">
              No lifecycle stage data available for {brand.name}
            </p>
          )}
        </ChartCard>
      </section>

      {/* ═══ SECTION 2 — Sales Lifecycle Stage ═══ */}
      <section className="space-y-5">
        <SectionHeader icon={BarChart2} label="Sales Lifecycle Stage" color="bg-amber-500" />

        <ChartCard
          title="SQL to Customer Funnel"
          subtitle="Contacts created in selected period, by current lifecycle stage"
          headerRight={
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">HubSpot &amp; Salesforce connected</span>
            </div>
          }
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
            {salesFunnelData.map((stage, i) => (
              <div key={stage.key} className={cn("flex items-center", i > 0 && "sm:flex-row")}>
                {i > 0 && (
                  <div className="hidden items-center px-3 sm:flex">
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div
                  className="flex-1 rounded-2xl border p-5 transition-all hover:shadow-md"
                  style={{ borderColor: stage.color, background: `${stage.color}15` }}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: stage.color }}>
                    {stage.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
                    {stage.count.toLocaleString()}
                  </p>
                  {stage.conversionRate !== undefined && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {stage.conversionRate.toFixed(1)}% from prev stage
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {salesFunnelData.some((s) => s.count > 0) ? (
            <div className="mt-6">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={salesFunnelData.map((s) => ({ name: s.label, count: s.count, color: s.color }))}
                  layout="vertical"
                  margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                  <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={axisStyle} width={90} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Contacts" radius={[0, 4, 4, 0]}>
                    {salesFunnelData.map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-6 py-8 text-center text-sm text-muted-foreground">
              No sales stage data available for {brand.name}
            </p>
          )}
        </ChartCard>
      </section>

      {/* ═══ SECTION 3 — Contact Charts ═══ */}
      <section className="space-y-5">
        <SectionHeader icon={Users} label="Contact Analytics" color="bg-emerald-600" />
        <ContactCharts
          brand={brand}
          dateFrom={dateFrom}
          dateTo={dateTo}
          data={data}
          loading={loading}
          error={error}
          externalStateDistribution={data?.contactStateDistribution}
          externalUnknownStateCount={data?.contactUnknownStateCount}
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
  );
}
