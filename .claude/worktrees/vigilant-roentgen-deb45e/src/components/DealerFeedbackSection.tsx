import { useState, useEffect } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, Legend,
} from "recharts";
import { MessageSquare, CheckCircle2, TrendingUp, Users } from "lucide-react";
import { callFunction } from "@/lib/api-client";
import { Brand } from "@/lib/brands";
import { format } from "date-fns";
import { WaterFillLoader } from "@/components/WaterFillLoader";

interface DealerFeedbackSectionProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
}

const STAGE_COLORS: Record<string, string> = {
  customer:    "#10B981",
  other:       "#F59E0B",
  opportunity: "#3B82F6",
  lead:        "#8B5CF6",
  none:        "#94A3B8",
};

const TIMING_COLOR = "#3B82F6";

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function KpiCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="relative rounded-2xl border border-border bg-card overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: color }} />
      <div className="pl-6 pr-5 pt-5 pb-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl shrink-0" style={{ background: `${color}18` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
        </div>
        <p className="text-4xl font-black tabular-nums text-foreground leading-none">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function ChartCard({
  title, subtitle, children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
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

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="mb-1 font-semibold text-muted-foreground">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey || p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-foreground font-medium">{(p.value || 0).toLocaleString()}</span>
          <span className="text-muted-foreground">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

export function DealerFeedbackSection({ brand, dateFrom, dateTo }: DealerFeedbackSectionProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    callFunction("hubspot-dealer-feedback", {
      brandName: brand.name,
      startDate: dateFrom.toISOString().split("T")[0],
      endDate: dateTo.toISOString().split("T")[0],
    })
      .then(result => { if (!cancelled) { setData(result); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [brand.id, dateFrom.getTime(), dateTo.getTime()]);

  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
  const gridColor = "hsl(var(--border))";

  if (loading) {
    return (
      <div className="py-10">
        <WaterFillLoader fullScreen={false} message="Loading dealer feedback data…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Could not load dealer feedback data: {error}
      </div>
    );
  }

  if (!data) return null;

  const {
    totalContacts = 0,
    feedbackCount = 0,
    feedbackRate = 0,
    stageDistribution = [],
    responseTimingBuckets = [],
    dailyTrend = [],
  } = data;

  const customerCount = stageDistribution.find((s: any) => s.stage === "customer")?.count ?? 0;
  const customerRate = totalContacts > 0 ? (customerCount / totalContacts) * 100 : 0;

  // Filter out "none" for the donut so empty states don't show a grey block when data is present
  const donutData = stageDistribution.filter((s: any) => s.count > 0);
  const hasTimingData = responseTimingBuckets.some((b: any) => b.count > 0);
  const hasDailyData = dailyTrend.length > 0;

  // Top 10 dealers by total leads

  return (
    <section className="space-y-5">
      <SectionHeader
        icon={MessageSquare}
        label="Dealer Lead Feedback"
        color="bg-violet-600"
      />

      <p className="text-xs text-muted-foreground -mt-1">
        Tracks responses from the "Update us on the status of this lead" dealer form sent at day&nbsp;2, 7, and 14.
        Lifecycle stage is updated directly on the lead when a dealer submits the form.
      </p>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard icon={Users}          label="Total Leads"        value={fmt(totalContacts)} sub="Contacts sent to dealers" color="#3B82F6" />
        <KpiCard icon={MessageSquare}  label="Feedback Received"  value={fmt(feedbackCount)} sub="Dealers who responded"    color="#8B5CF6" />
        <KpiCard icon={CheckCircle2}   label="Response Rate"      value={`${Math.round(feedbackRate * 100)}%`} sub="Of all leads in period" color="#10B981" />
        <KpiCard icon={TrendingUp}     label="Customer"           value={`${customerRate.toFixed(1)}%`} sub={`${fmt(customerCount)} confirmed customers`} color="#F59E0B" />
      </div>

      {/* Stage distribution — donut */}
      <ChartCard
        title="Lead Outcome Breakdown"
        subtitle="Distribution of lifecycle stages set by dealers via the feedback form"
      >
        {donutData.length > 0 ? (
          <div className="flex flex-col sm:flex-row gap-6 items-center">
            <ResponsiveContainer width={220} height={220}>
              <PieChart>
                <Pie data={donutData} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2}>
                  {donutData.map((entry: any) => (
                    <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] ?? entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 flex-1">
              {donutData.map((entry: any) => (
                <div key={entry.stage} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: STAGE_COLORS[entry.stage] ?? entry.color }} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-foreground truncate">{entry.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {entry.count.toLocaleString()}
                      {totalContacts > 0 && ` · ${((entry.count / totalContacts) * 100).toFixed(1)}%`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">No feedback data for this period.</p>
        )}
      </ChartCard>

      {/* Daily trend */}
      {hasDailyData && (
        <ChartCard
          title="Feedback Trend Over Time"
          subtitle="Daily count of dealer form submissions by outcome"
        >
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyTrend} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <defs>
                {Object.entries(STAGE_COLORS).filter(([k]) => k !== "none").map(([key, color]) => (
                  <linearGradient key={key} id={`fg-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false}
                tickFormatter={d => { try { return format(new Date(d), "MMM d"); } catch { return d; } }}
              />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />}
                labelFormatter={d => { try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; } }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Area dataKey="customer"    name="Customer"    stroke={STAGE_COLORS.customer}    fill={`url(#fg-customer)`}    strokeWidth={1.5} dot={false} />
              <Area dataKey="other"       name="Other"       stroke={STAGE_COLORS.other}       fill={`url(#fg-other)`}       strokeWidth={1.5} dot={false} />
              <Area dataKey="opportunity" name="Opportunity"  stroke={STAGE_COLORS.opportunity} fill={`url(#fg-opportunity)`} strokeWidth={1.5} dot={false} />
              <Area dataKey="lead"        name="Lead"        stroke={STAGE_COLORS.lead}        fill={`url(#fg-lead)`}        strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

    </section>
  );
}
