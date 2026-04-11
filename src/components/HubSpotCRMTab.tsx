import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { fetchHubSpotData } from "@/lib/api-client";
import { Brand } from "@/lib/brands";
import { ArrowRight, Users, TrendingUp, BarChart2 } from "lucide-react";
import { ContactCharts } from "@/components/ContactCharts";
import { cn } from "@/lib/utils";

interface HubSpotCRMTabProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
}

// Lifecycle stage ordering for the full breakdown
const ALL_LIFECYCLE_ORDER = [
  "subscriber",
  "lead",
  "marketingqualifiedlead",
  "salesqualifiedlead",
  "opportunity",
  "customer",
  "evangelist",
  "other",
];

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

const LIFECYCLE_COLORS = [
  "#94A3B8",
  "#3B82F6",
  "#7C3AED",
  "#F59E0B",
  "#F97316",
  "#10B981",
  "#EF4444",
  "#06B6D4",
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
function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHubSpotData(brand, dateFrom, dateTo).then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [brand.id, dateFrom.getTime(), dateTo.getTime()]);

  // Build ordered lifecycle data for charts
  const allLifecycleData = useMemo(() => {
    if (!data?.lifecycleStages) return [];
    const map: Record<string, number> = {};
    for (const s of data.lifecycleStages) {
      if (s.key) map[s.key] = s.count;
      map[(s.stage || "").toLowerCase().replace(/\s/g, "")] = s.count;
    }
    const ordered = ALL_LIFECYCLE_ORDER.map((key) => {
      const match = data.lifecycleStages.find(
        (s: any) => s.key === key || (s.stage || "").toLowerCase().replace(/\s/g, "") === key
      );
      return {
        stage: match?.stage || MARKETING_STAGE_LABELS[key] || key,
        count: map[key] || 0,
        key,
      };
    }).filter((s) => s.count > 0);
    // Also include any stages not in our predefined list
    for (const s of data.lifecycleStages) {
      const k = s.key || (s.stage || "").toLowerCase().replace(/\s/g, "");
      if (!ALL_LIFECYCLE_ORDER.includes(k) && s.count > 0) {
        ordered.push({ stage: s.stage, count: s.count, key: k });
      }
    }
    return ordered;
  }, [data]);

  const marketingFunnelData = useMemo(() => {
    if (!data?.lifecycleStages) return [];
    const map: Record<string, number> = {};
    for (const s of data.lifecycleStages) {
      if (s.key) map[s.key] = s.count;
      map[(s.stage || "").toLowerCase().replace(/\s/g, "")] = s.count;
    }
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

  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
  const gridColor = "hsl(var(--border))";

  if (loading) {
    return (
      <div className="space-y-8 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-5 w-48" />
          <div className="flex-1 border-t border-border" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-3 w-64 mb-6" />
          <div className="flex gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 flex-1">
                {i > 0 && <ArrowRight className="h-5 w-5 text-muted-foreground" />}
                <div className="flex-1 rounded-2xl border border-border p-5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-3 h-8 w-16" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="mt-6 h-48 w-full rounded-lg" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8 p-6">

      {/* ═══ SECTION 1 — Marketing Leads Cycle ═══ */}
      <section className="space-y-5">
        <SectionHeader icon={TrendingUp} label="Marketing Leads Cycle" color="bg-blue-600" />

        <ChartCard
          title="Subscriber to MQL Funnel"
          subtitle="Contact journey from Subscriber to Marketing Qualified Lead"
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

      {/* ═══ SECTION 2 — Overall Lifecycle Stage Breakdown ═══ */}
      <section className="space-y-5">
        <SectionHeader icon={BarChart2} label="Lifecycle Stage Breakdown" color="bg-violet-600" />

        <ChartCard
          title="Full Contact Distribution"
          subtitle="Contact distribution across all lifecycle stages"
        >
          {allLifecycleData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, allLifecycleData.length * 44)}>
              <BarChart
                data={allLifecycleData}
                layout="vertical"
                margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="stage" tick={axisStyle} width={160} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Contacts" radius={[0, 4, 4, 0]}>
                  {allLifecycleData.map((_: any, i: number) => (
                    <Cell key={i} fill={LIFECYCLE_COLORS[i % LIFECYCLE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No lifecycle stage data available for {brand.name}
            </p>
          )}
        </ChartCard>
      </section>

      {/* ═══ SECTION 3 — Contact Charts ═══ */}
      <section className="space-y-5">
        <SectionHeader icon={Users} label="Contact Analytics" color="bg-emerald-600" />
        <ContactCharts brand={brand} dateFrom={dateFrom} dateTo={dateTo} />
      </section>

    </div>
  );
}
