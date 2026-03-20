import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { fetchHubSpotData } from "@/lib/api-client";
import { Brand } from "@/lib/brands";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface HubSpotTabProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
}

const LIFECYCLE_COLORS = ["#94A3B8", "#3B82F6", "#8B5CF6", "#F59E0B", "#F97316", "#10B981"];

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

function BenchmarkBadge({ label }: { label: string }) {
  const color = label === "Excellent" ? "text-brand-green bg-brand-green/10" :
    label === "Good" ? "text-brand-blue bg-brand-blue/10" :
    "text-brand-red bg-brand-red/10";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", color)}>
      {label}
    </span>
  );
}

function HealthGauge({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score >= 7 ? "hsl(var(--brand-green))" : score >= 4 ? "hsl(var(--brand-orange))" : "hsl(var(--brand-red))";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
          <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${pct * 2.64} 264`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-card-foreground">{score.toFixed(1)}</span>
          <span className="text-[10px] text-muted-foreground">/10</span>
        </div>
      </div>
      <span className="text-xs font-medium text-muted-foreground">Health Score</span>
    </div>
  );
}

function MetricCard({ label, value, sub, benchmark }: { label: string; value: string; sub?: string; benchmark?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      {benchmark && <div className="mt-1"><BenchmarkBadge label={benchmark} /></div>}
    </div>
  );
}

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

  const emailCount = d.totalEmails ?? d.emails?.length ?? 0;
  const ctr = d.totalOpens > 0
    ? parseFloat(((d.totalClicks ?? 0) / d.totalOpens * 100).toFixed(1))
    : (d.clickRate && d.openRate && d.openRate > 0 ? parseFloat((d.clickRate / d.openRate * 100).toFixed(1)) : 0);

  return (
    <div className="space-y-6 p-6">

      {/* ── SECTION 1 — Email Health Score (gauge + metrics inline) ── */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Health Score</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr]">
          <div className="flex items-center justify-center rounded-lg border border-border bg-card p-6 shadow-card">
            <HealthGauge score={d.healthScore} />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <MetricCard label="Open Rate" value={`${d.openRate}%`} benchmark={d.openRateLabel} />
            <MetricCard label="Click-Through Rate" value={`${d.clickRate}%`} benchmark={d.clickRateLabel} />
            <MetricCard label="Hard Bounces" value={`${d.bounceRate}%`} benchmark={d.bounceRateLabel} />
            <MetricCard label="Unsubscribes" value={`${d.unsubscribeRate}%`} benchmark={d.unsubscribeRateLabel} />
            <MetricCard label="Spam Reports" value={String(d.spamReports)} />
            <MetricCard label="Total Emails Sent" value={formatNumber(d.totalEmailsSent)} />
          </div>
        </div>
      </div>

      {/* ── SECTION 2 — Recipient Engagement ── */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recipient Engagement</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard label="Sent" value={formatNumber(d.totalEmailsSent)} sub={`${emailCount} emails`} />
          <MetricCard label="Open Rate" value={`${d.openRate}%`} />
          <MetricCard label="Click Rate" value={`${d.clickRate}%`} />
          <MetricCard label="Click-Through Rate" value={`${ctr}%`} sub="clicks / opens" />
        </div>
      </div>

      {/* ── SECTION 3 — Delivery ── */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delivery</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard label="Delivery Rate" value={`${d.deliveredRate}%`} />
          <MetricCard label="Hard Bounce Rate" value={`${d.bounceRate}%`} />
          <MetricCard label="Unsubscribe Rate" value={`${d.unsubscribeRate}%`} />
          <MetricCard label="Spam Report Rate" value={`${d.spamReports > 0 && d.totalEmailsSent > 0 ? (d.spamReports / d.totalEmailsSent * 100).toFixed(2) : "0"}%`} />
        </div>
      </div>

      {/* ── SECTION 4 — Lifecycle Stage Breakdown ── */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-card">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lifecycle Stage Breakdown</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={d.lifecycleStages} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} width={100} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {d.lifecycleStages.map((_: any, i: number) => (
                <Cell key={i} fill={LIFECYCLE_COLORS[i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── SECTION 5 — Email Performance Table ── */}
      <div className="rounded-lg border border-border bg-card shadow-card">
        <div className="p-6 pb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Email Name</TableHead>
                <TableHead className="text-xs">Sender</TableHead>
                <TableHead className="text-xs">Publish Date</TableHead>
                <TableHead className="text-right text-xs">Sent</TableHead>
                <TableHead className="text-right text-xs">Delivered</TableHead>
                <TableHead className="text-right text-xs">Open Rate</TableHead>
                <TableHead className="text-right text-xs">Click Rate</TableHead>
                <TableHead className="text-right text-xs">Hard Bounce</TableHead>
                <TableHead className="text-right text-xs">Unsub Rate</TableHead>
                <TableHead className="text-right text-xs">Spam Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.emails.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">
                    No emails found in this date range.
                  </TableCell>
                </TableRow>
              ) : (
                d.emails.map((row: any, idx: number) => (
                  <TableRow key={`${row.name}-${idx}`}>
                    <TableCell className="text-sm font-medium max-w-[260px] truncate">{row.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.sender}</TableCell>
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
      </div>

      {/* Debug */}
      <p className="text-xs text-muted-foreground px-1">
        {emailCount} emails for "{d.brandName}"
        {d.totalFetched != null && ` · ${d.totalFetched} total in account`}
        {d.businessUnitId && ` · BU: ${d.businessUnitId}`}
      </p>
    </div>
  );
}
