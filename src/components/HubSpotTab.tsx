import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, AreaChart, Area, Legend,
} from "recharts";
import { fetchHubSpotData } from "@/lib/api-client";
import { Brand } from "@/lib/brands";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Loader2, ArrowRight, ArrowDown, TrendingUp, TrendingDown } from "lucide-react";
import { format, startOfWeek, startOfMonth, startOfDay, parseISO, addDays, addWeeks, addMonths, isBefore, isEqual } from "date-fns";

interface HubSpotTabProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

/* ── Delta badge ── */
function DeltaBadge({ delta, invert }: { delta?: number | null; invert?: boolean }) {
  if (delta === null || delta === undefined) return null;
  const isGood = invert ? delta <= 0 : delta >= 0;
  const arrow = delta >= 0 ? "↑" : "↓";
  return (
    <span className={cn("mt-0.5 flex items-center gap-0.5 text-[10px] font-medium tabular-nums", isGood ? "text-brand-green" : "text-brand-red")}>
      {delta >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {arrow} {Math.abs(delta).toFixed(2)}% vs prev period
    </span>
  );
}

/* ── KPI Funnel Card ── */
function FunnelCard({
  label, value, sub, variant = "positive", delta, invertDelta,
}: {
  label: string; value: string; sub?: string;
  variant?: "positive" | "pending" | "negative";
  delta?: number | null;
  invertDelta?: boolean;
}) {
  const bg = variant === "pending"
    ? "bg-funnel-pending text-funnel-pending-foreground"
    : variant === "negative"
    ? "bg-funnel-negative text-funnel-negative-foreground"
    : "bg-card text-card-foreground";
  return (
    <div className={cn("rounded-lg border border-border p-4 shadow-card", bg)}>
      <p className="text-[11px] font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] opacity-60">{sub}</p>}
      <DeltaBadge delta={delta} invert={invertDelta} />
    </div>
  );
}

/* ── SVG Arrow connectors ── */
function HArrow() {
  return (
    <div className="hidden items-center lg:flex">
      <ArrowRight className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
function VArrow() {
  return (
    <div className="flex justify-center py-1">
      <ArrowDown className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

const LIFECYCLE_COLORS = [
  "hsl(215 16% 65%)", "hsl(217 91% 60%)", "hsl(262 83% 58%)",
  "hsl(38 92% 50%)", "hsl(24 95% 53%)", "hsl(158 64% 52%)",
];

type ChartType = "line" | "area" | "bar" | "column";
type TimeInterval = "daily" | "weekly" | "monthly";

/* ── Performance score for ranking emails ── */
function emailScore(e: any): number {
  return (e.openRate || 0) * 2 + (e.clickRate || 0) * 3 - (e.bounceRate || 0) * 4 - (e.unsubscribeRate || 0) * 5;
}

export function HubSpotTab({ brand, dateFrom, dateTo }: HubSpotTabProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<ChartType>("line");
  const [interval, setInterval] = useState<TimeInterval>("weekly");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHubSpotData(brand, dateFrom, dateTo).then((result) => {
      if (!cancelled) { setData(result); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [brand.id, dateFrom.getTime(), dateTo.getTime()]);

  const d = useMemo(() => {
    if (!data) return null;
    return { ...data, brandName: brand.name };
  }, [data, brand]);

  /* ── Aggregate chart data by interval ── */
  const chartData = useMemo(() => {
    if (!d) return [];

    // Build buckets from emails
    const buckets: Record<string, { opens: number; delivered: number; clicks: number }> = {};
    for (const email of d.emails || []) {
      if (!email.publishDate) continue;
      let key: string;
      const date = parseISO(email.publishDate);
      if (interval === "daily") {
        key = format(startOfDay(date), "yyyy-MM-dd");
      } else if (interval === "weekly") {
        key = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
      } else {
        key = format(startOfMonth(date), "yyyy-MM");
      }
      if (!buckets[key]) buckets[key] = { opens: 0, delivered: 0, clicks: 0 };
      buckets[key].opens += email.opens || 0;
      buckets[key].delivered += email.delivered || 0;
      buckets[key].clicks += email.clicks || 0;
    }

    // Generate ALL time slots in the date range (fill gaps with 0)
    const slots: string[] = [];
    let cursor = interval === "daily"
      ? startOfDay(dateFrom)
      : interval === "weekly"
        ? startOfWeek(dateFrom, { weekStartsOn: 1 })
        : startOfMonth(dateFrom);
    const end = dateTo;
    const advance = interval === "daily" ? addDays : interval === "weekly" ? addWeeks : addMonths;
    const fmt = interval === "monthly" ? "yyyy-MM" : "yyyy-MM-dd";

    while (isBefore(cursor, end) || isEqual(cursor, end)) {
      slots.push(format(cursor, fmt));
      cursor = advance(cursor, 1);
    }

    return slots.map((date) => {
      const v = buckets[date] || { opens: 0, delivered: 0, clicks: 0 };
      return {
        date,
        openRate: v.delivered > 0 ? parseFloat(((v.opens / v.delivered) * 100).toFixed(1)) : 0,
        ctr: v.opens > 0 ? parseFloat(((v.clicks / v.opens) * 100).toFixed(1)) : 0,
      };
    });
  }, [d, interval, dateFrom, dateTo]);

  /* ── High & low performing emails ── */
  const { highPerf, lowPerf } = useMemo(() => {
    if (!d?.emails?.length) return { highPerf: [], lowPerf: [] };
    const sorted = [...d.emails].sort((a: any, b: any) => emailScore(b) - emailScore(a));
    return {
      highPerf: sorted.slice(0, 4),
      lowPerf: sorted.slice(-4).reverse(),
    };
  }, [d]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!d) return null;

  const dl = d.deltas || {};
  const daysBetween = Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / 86400000));
  const weeks = daysBetween / 7;
  const avgEmailsPerWeek = weeks > 0 ? parseFloat((d.totalEmails / weeks).toFixed(1)) : 0;

  const dateLabel = `FROM ${format(dateFrom, "MMM d, yyyy").toUpperCase()} TO ${format(dateTo, "MMM d, yyyy").toUpperCase()} | ${interval.toUpperCase()}`;

  const renderChart = () => {
    const commonProps = { data: chartData };
    const xAxis = <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => { try { const d = parseISO(v); return format(d, "M/d/yyyy"); } catch { return v; } }} interval="preserveStartEnd" />;
    const yAxis = <YAxis tick={{ fontSize: 10 }} domain={[0, 125]} tickFormatter={(v: number) => `${v}%`} />;
    const grid = <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />;
    const tooltip = <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => `${v}%`} />;
    const legend = <Legend wrapperStyle={{ fontSize: 11 }} />;

    if (chartType === "area") {
      return (
        <AreaChart {...commonProps}>
          {grid}{xAxis}{yAxis}{tooltip}{legend}
          <Area type="monotone" dataKey="openRate" name="Open Rate" stroke="hsl(var(--brand-blue))" fill="hsl(var(--brand-blue))" fillOpacity={0.15} strokeWidth={2} />
          <Area type="monotone" dataKey="ctr" name="Click-through Rate" stroke="hsl(24, 95%, 53%)" fill="hsl(24, 95%, 53%)" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      );
    }
    if (chartType === "bar" || chartType === "column") {
      return (
        <BarChart {...commonProps} layout={chartType === "bar" ? "vertical" : "horizontal"}>
          {grid}
          {chartType === "bar" ? (
            <>
              <YAxis type="category" dataKey="date" tick={{ fontSize: 10 }} width={80} />
              <XAxis type="number" domain={[0, 125]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 10 }} />
            </>
          ) : (
            <>{xAxis}{yAxis}</>
          )}
          {tooltip}{legend}
          <Bar dataKey="openRate" name="Open Rate" fill="hsl(var(--brand-blue))" radius={[2, 2, 0, 0]} />
          <Bar dataKey="ctr" name="Click-through Rate" fill="hsl(24, 95%, 53%)" radius={[2, 2, 0, 0]} />
        </BarChart>
      );
    }
    // Default: line
    return (
      <LineChart {...commonProps}>
        {grid}{xAxis}{yAxis}{tooltip}{legend}
        <Line type="monotone" dataKey="openRate" name="Open Rate" stroke="hsl(var(--brand-blue))" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="ctr" name="Click-through Rate" stroke="hsl(24, 95%, 53%)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    );
  };

  const chartTypes: { value: ChartType; label: string }[] = [
    { value: "area", label: "Area" },
    { value: "bar", label: "Bar" },
    { value: "column", label: "Column" },
    { value: "line", label: "Line" },
  ];
  const intervals: { value: TimeInterval; label: string }[] = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* ═══ SECTION 1 — KPI Funnel ═══ */}
      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Funnel</h2>
        <div className="grid grid-cols-2 gap-3 lg:flex lg:items-center lg:gap-0">
          <div className="lg:flex-1"><FunnelCard label="Sent" value={fmt(d.totalEmailsSent)} sub={`${d.totalEmails} emails`} delta={dl.sent} /></div>
          <HArrow />
          <div className="lg:flex-1"><FunnelCard label="Delivered" value={fmt(d.totalDelivered ?? 0)} delta={dl.delivered} /></div>
          <HArrow />
          <div className="lg:flex-1"><FunnelCard label="Opens" value={fmt(d.totalOpens)} delta={dl.opens} /></div>
          <HArrow />
          <div className="lg:flex-1"><FunnelCard label="Clicks" value={fmt(d.totalClicks)} delta={dl.clicks} /></div>
        </div>
        <VArrow />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FunnelCard label="AVG Emails Per Week" value={String(avgEmailsPerWeek)} sub={`Based on ${d.totalEmails} emails over ${Math.round(weeks)} weeks`} variant="pending" />
          <FunnelCard label="Delivered Ratio" value={`${d.deliveredRate}%`} delta={dl.deliveredRate} />
          <FunnelCard label="Open Ratio" value={`${d.openRate}%`} delta={dl.openRate} />
          <FunnelCard label="Click Ratio" value={`${d.clickRate}%`} delta={dl.clickRate} />
        </div>
        <VArrow />
        <div className="grid grid-cols-2 gap-3">
          <FunnelCard label="Bounce" value={fmt(d.totalBounce ?? 0)} sub={`${d.bounceRate}%`} variant="negative" delta={dl.bounce} invertDelta />
          <FunnelCard label="Unsubscribed" value={fmt(d.totalUnsub ?? 0)} sub={`${d.unsubscribeRate}%`} variant="negative" delta={dl.unsubscribed} invertDelta />
        </div>
        <VArrow />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <FunnelCard label="Hard Bounce" value={fmt(d.totalHardBounce ?? 0)} sub={`${d.hardBounceRate ?? 0}%`} variant="negative" delta={dl.hardBounce} invertDelta />
          <FunnelCard label="Soft Bounce" value={fmt(d.totalSoftBounce ?? 0)} sub={`${d.softBounceRate ?? 0}%`} variant="negative" delta={dl.softBounce} invertDelta />
          <FunnelCard label="Spam Report" value={String(d.spamReports)} sub={`${d.spamRate ?? 0}%`} variant="negative" delta={dl.spam} invertDelta />
        </div>
      </section>

      {/* ═══ SECTION 2 — Performance Over Time (Open Rate + CTR) ═══ */}
      <section className="rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Open Rate & Click-through Rate Over Time</h3>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{dateLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border bg-muted/40 text-[11px]">
              {chartTypes.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => setChartType(ct.value)}
                  className={cn(
                    "px-2.5 py-1 transition-colors first:rounded-l-md last:rounded-r-md",
                    chartType === ct.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {ct.label}
                </button>
              ))}
            </div>
            <div className="flex rounded-md border border-border bg-muted/40 text-[11px]">
              {intervals.map((iv) => (
                <button
                  key={iv.value}
                  onClick={() => setInterval(iv.value)}
                  className={cn(
                    "px-2.5 py-1 transition-colors first:rounded-l-md last:rounded-r-md",
                    interval === iv.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {iv.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            {renderChart()}
          </ResponsiveContainer>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">No data for chart</p>
        )}
      </section>

      {/* ═══ SECTION 3 — Email Performance Table ═══ */}
      <section className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
        <div className="p-6 pb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-table-header">
                <TableHead className="text-xs text-primary-foreground">Campaign</TableHead>
                <TableHead className="text-xs text-primary-foreground">Brand</TableHead>
                <TableHead className="text-xs text-primary-foreground">Sender</TableHead>
                <TableHead className="text-xs text-primary-foreground">Publish Date</TableHead>
                <TableHead className="text-right text-xs text-primary-foreground">Sent</TableHead>
                <TableHead className="text-right text-xs text-primary-foreground">Delivered</TableHead>
                <TableHead className="text-right text-xs text-primary-foreground">Open Rate</TableHead>
                <TableHead className="text-right text-xs text-primary-foreground">Click Rate</TableHead>
                <TableHead className="text-right text-xs text-primary-foreground">Hard Bounce</TableHead>
                <TableHead className="text-right text-xs text-primary-foreground">Unsub Rate</TableHead>
                <TableHead className="text-right text-xs text-primary-foreground">Spam Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.emails.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                    No emails found for "{d.brandName}" in selected date range.
                  </TableCell>
                </TableRow>
              ) : (
                d.emails.map((row: any, idx: number) => (
                  <TableRow key={`${row.name}-${idx}`}>
                    <TableCell className="max-w-[260px] truncate text-sm font-medium">{row.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.brandName || d.brandName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.sender || ""}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.publishDate}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.sent.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.delivered.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.openRate}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.clickRate}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.bounceRate}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.unsubscribeRate}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.spamRate}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* ═══ SECTION 4 — High & Low Performing Emails ═══ */}
      {d.emails.length > 0 && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* High performing */}
          <section className="rounded-lg border border-border bg-card p-6 shadow-card">
            <h3 className="text-sm font-semibold text-foreground">High performing emails</h3>
            <p className="mb-4 text-xs text-muted-foreground">These emails scored well in all deliverability metrics.</p>
            <div className="space-y-4">
              {highPerf.map((email: any, i: number) => (
                <div key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-green/10 text-xs font-bold text-brand-green">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-brand-blue">{email.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Published {email.publishDate}. Sent to {email.sent.toLocaleString()}.
                    </p>
                    {email.sender && (
                      <p className="text-[11px] text-muted-foreground">Published by: {email.sender}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {email.clickRate}% clicks, {email.openRate}% opens, {email.bounceRate}% hard bounces, {email.unsubscribeRate}% unsubscribes.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Low performing */}
          <section className="rounded-lg border border-border bg-card p-6 shadow-card">
            <h3 className="text-sm font-semibold text-foreground">Low performing emails</h3>
            <p className="mb-4 text-xs text-muted-foreground">These emails scored poorly in at least one deliverability metric.</p>
            <div className="space-y-4">
              {lowPerf.map((email: any, i: number) => (
                <div key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-red/10 text-xs font-bold text-brand-red">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-brand-blue">{email.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Published {email.publishDate}. Sent to {email.sent.toLocaleString()}.
                    </p>
                    {email.sender && (
                      <p className="text-[11px] text-muted-foreground">Published by: {email.sender}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {email.clickRate}% clicks, {email.openRate}% opens, {email.bounceRate}% hard bounces, {email.unsubscribeRate}% unsubscribes.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ═══ SECTION 5 — Lifecycle Stage Breakdown ═══ */}
      <section className="rounded-lg border border-border bg-card p-6 shadow-card">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lifecycle Stage Breakdown</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={d.lifecycleStages} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} width={100} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {d.lifecycleStages.map((_: any, i: number) => (
                <Cell key={i} fill={LIFECYCLE_COLORS[i % LIFECYCLE_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      <p className="px-1 text-xs text-muted-foreground">
        {d.totalEmails} emails for "{d.brandName}"
        {d.totalFetched != null && ` · ${d.totalFetched} total in account`}
        {d.prevPeriod && ` · Compared to ${d.prevPeriod.start} – ${d.prevPeriod.end}`}
      </p>
    </div>
  );
}
