import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, PieChart, Pie,
} from "recharts";
import { fetchHubSpotData } from "@/lib/api-client";
import { Brand } from "@/lib/brands";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Loader2, ArrowRight, ArrowDown, TrendingUp, TrendingDown } from "lucide-react";

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
  // For negative metrics (bounce, unsub, spam), down is good
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

const PIE_COLORS = [
  "hsl(217, 91%, 60%)", "hsl(24, 95%, 53%)", "hsl(142, 71%, 45%)",
  "hsl(262, 83%, 58%)", "hsl(38, 92%, 50%)", "hsl(215, 16%, 65%)",
];

const LIFECYCLE_COLORS = [
  "hsl(215 16% 65%)", "hsl(217 91% 60%)", "hsl(262 83% 58%)",
  "hsl(38 92% 50%)", "hsl(24 95% 53%)", "hsl(158 64% 52%)",
];

export function HubSpotTab({ brand, dateFrom, dateTo }: HubSpotTabProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
    return { ...data, brandName: brand.hubspotName || brand.name };
  }, [data, brand]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!d) return null;

  const dl = d.deltas || {};

  // AVG emails per week calculation
  const daysBetween = Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / 86400000));
  const weeks = daysBetween / 7;
  const avgEmailsPerWeek = weeks > 0 ? parseFloat((d.totalEmails / weeks).toFixed(1)) : 0;

  return (
    <div className="space-y-6 p-6">
      {/* ═══ SECTION 1 — KPI Funnel ═══ */}
      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Funnel</h2>

        {/* Row 1 — Core metrics with arrows */}
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

        {/* Row 2 — Ratio metrics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FunnelCard
            label="AVG Emails Per Week"
            value={String(avgEmailsPerWeek)}
            sub={`Based on ${d.totalEmails} emails over ${Math.round(weeks)} weeks`}
            variant="pending"
          />
          <FunnelCard label="Delivered Ratio" value={`${d.deliveredRate}%`} delta={dl.deliveredRate} />
          <FunnelCard label="Open Ratio" value={`${d.openRate}%`} delta={dl.openRate} />
          <FunnelCard label="Click Ratio" value={`${d.clickRate}%`} delta={dl.clickRate} />
        </div>

        <VArrow />

        {/* Row 3 — Negative metrics */}
        <div className="grid grid-cols-2 gap-3">
          <FunnelCard label="Bounce" value={fmt(d.totalBounce ?? 0)} sub={`${d.bounceRate}%`} variant="negative" delta={dl.bounce} invertDelta />
          <FunnelCard label="Unsubscribed" value={fmt(d.totalUnsub ?? 0)} sub={`${d.unsubscribeRate}%`} variant="negative" delta={dl.unsubscribed} invertDelta />
        </div>

        <VArrow />

        {/* Row 4 — Deep negative metrics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <FunnelCard label="Hard Bounce" value={fmt(d.totalHardBounce ?? 0)} sub={`${d.hardBounceRate ?? 0}%`} variant="negative" delta={dl.hardBounce} invertDelta />
          <FunnelCard label="Soft Bounce" value={fmt(d.totalSoftBounce ?? 0)} sub={`${d.softBounceRate ?? 0}%`} variant="negative" delta={dl.softBounce} invertDelta />
          <FunnelCard label="Spam Report" value={String(d.spamReports)} sub={`${d.spamRate ?? 0}%`} variant="negative" delta={dl.spam} invertDelta />
        </div>
      </section>

      {/* ═══ SECTION 2 — Performance Over Time ═══ */}
      {d.deliveryOverTime && d.deliveryOverTime.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-6 shadow-card">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Marketing Email Delivered Over Time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={d.deliveryOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="delivered" stroke="hsl(var(--brand-blue))" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      )}

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
                <TableHead className="text-xs text-primary-foreground">State</TableHead>
                <TableHead className="text-xs text-primary-foreground">Subcategory</TableHead>
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
                  <TableCell colSpan={13} className="py-8 text-center text-sm text-muted-foreground">
                    No emails found for "{d.brandName}" in selected date range.
                  </TableCell>
                </TableRow>
              ) : (
                d.emails.map((row: any, idx: number) => (
                  <TableRow key={`${row.name}-${idx}`}>
                    <TableCell className="max-w-[260px] truncate text-sm font-medium">{row.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.brandName || d.brandName}</TableCell>
                    <TableCell className="text-sm">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                        row.state === "AUTOMATED" ? "bg-brand-blue/10 text-brand-blue" : "bg-brand-green/10 text-brand-green",
                      )}>
                        {row.state || "PUBLISHED"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.subcategory || "—"}</TableCell>
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

      {/* ═══ SECTION 4 — Distribution Charts (donuts) ═══ */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {d.stateDistribution && d.stateDistribution.length > 0 && (
          <section className="rounded-lg border border-border bg-card p-6 shadow-card">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Breakdown by State</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={d.stateDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {d.stateDistribution.map((_: any, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap justify-center gap-4">
              {d.stateDistribution.map((item: any, i: number) => (
                <div key={item.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {d.subcategoryDistribution && d.subcategoryDistribution.length > 0 && (
          <section className="rounded-lg border border-border bg-card p-6 shadow-card">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Breakdown by Subcategory</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={d.subcategoryDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {d.subcategoryDistribution.map((_: any, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap justify-center gap-4">
              {d.subcategoryDistribution.map((item: any, i: number) => (
                <div key={item.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

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
