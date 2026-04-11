import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  FunnelChart, Funnel, LabelList,
} from "recharts";
import { fetchHubSpotData } from "@/lib/api-client";
import { Brand } from "@/lib/brands";
import { Loader2, ArrowRight } from "lucide-react";
import { format } from "date-fns";
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
  "hsl(217 91% 60%)",
  "hsl(262 83% 58%)",
  "hsl(158 64% 52%)",
];

const LIFECYCLE_COLORS = [
  "hsl(215 16% 65%)",
  "hsl(217 91% 60%)",
  "hsl(262 83% 58%)",
  "hsl(38 92% 50%)",
  "hsl(24 95% 53%)",
  "hsl(158 64% 52%)",
  "hsl(355 78% 56%)",
  "hsl(190 80% 50%)",
];

function StageArrow() {
  return (
    <div className="flex items-center justify-center py-1 text-muted-foreground">
      <ArrowRight className="h-4 w-4" />
    </div>
  );
}

interface MarketingFunnelCardProps {
  label: string;
  count: number;
  conversionRate?: number;
  color: string;
  isFirst?: boolean;
}

function MarketingFunnelCard({ label, count, conversionRate, color, isFirst }: MarketingFunnelCardProps) {
  return (
    <div className="flex items-center gap-3">
      {!isFirst && <StageArrow />}
      <div
        className="flex-1 rounded-lg border p-4 shadow-sm"
        style={{ borderColor: color, background: `${color}18` }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color }}
        >
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
          {count.toLocaleString()}
        </p>
        {conversionRate !== undefined && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {conversionRate.toFixed(1)}% conversion
          </p>
        )}
      </div>
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
    // Build map using both the internal key (if provided) and the lowercased stage name
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 p-6">

      {/* ═══ SECTION 1 — Marketing Leads Cycle ═══ */}
      <section className="rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Marketing Leads Cycle
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Contact journey from Subscriber to Marketing Qualified Lead (MQL)
          </p>
        </div>

        {/* Funnel cards — horizontal flow */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
          {marketingFunnelData.map((stage, i) => (
            <div key={stage.key} className={cn("flex items-center", i > 0 && "sm:flex-row")}>
              {i > 0 && (
                <div className="hidden items-center px-2 sm:flex">
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div
                className="flex-1 rounded-lg border p-4 shadow-sm"
                style={{ borderColor: stage.color, background: `${stage.color}18` }}
              >
                <p
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: stage.color }}
                >
                  {stage.label}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                  {stage.count.toLocaleString()}
                </p>
                {stage.conversionRate !== undefined && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
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
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={90} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
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
      </section>

      {/* ═══ SECTION 2 — Overall Lifecycle Stage Breakdown ═══ */}
      <section className="rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Overall Lifecycle Stage Breakdown
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Full contact distribution across all lifecycle stages
          </p>
        </div>

        {allLifecycleData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(220, allLifecycleData.length * 40)}>
            <BarChart data={allLifecycleData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} width={160} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
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
      </section>

      {/* ═══ SECTION 3 — Contact Charts ═══ */}
      {/* Total Contacts Created, New Contacts Over Time, Source Breakdown, Job Title Distribution */}
      <ContactCharts brand={brand} dateFrom={dateFrom} dateTo={dateTo} />

    </div>
  );
}
