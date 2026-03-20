import { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import { ScoreCard } from "./ScoreCard";
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
    <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", color)}>
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

function EmailCard({ email }: { email: any }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <a href="#" className="text-sm font-semibold text-brand-blue hover:underline">{email.name}</a>
      <p className="mt-1 text-xs text-muted-foreground">{email.publishDate} · {email.sent.toLocaleString()} sent</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Clicks</p>
          <p className="text-sm font-semibold tabular-nums">{email.clickRate}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Opens</p>
          <p className="text-sm font-semibold tabular-nums">{email.openRate}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Bounces</p>
          <p className="text-sm font-semibold tabular-nums">{email.bounceRate}%</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Unsubs</p>
          <p className="text-sm font-semibold tabular-nums">{email.unsubscribeRate}%</p>
        </div>
      </div>
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
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [brand.id, dateFrom.getTime(), dateTo.getTime()]);

  // Filter emails by date range (mock data generates dates that may fall outside)
  const filteredData = useMemo(() => {
    if (!data) return null;

    // The edge function already handles brand filtering and date filtering,
    // so use the server-returned data directly. Add brandName for debug display.
    return {
      ...data,
      brandName: brand.hubspotName || brand.name,
    };
  }, [data, brand]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!filteredData) return null;

  return (
    <div className="space-y-6 p-6">
      {/* SECTION A - Email Health Score */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Email Health Score
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr]">
          <div className="flex items-center justify-center rounded-lg border border-border bg-card p-6 shadow-card">
            <HealthGauge score={filteredData.healthScore} />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Open Rate</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{filteredData.openRate}%</p>
              <BenchmarkBadge label={filteredData.openRateLabel} />
            </div>
            <div className="rounded-lg border border-border bg-card p-4 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Click-Through Rate</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{filteredData.clickRate}%</p>
              <BenchmarkBadge label={filteredData.clickRateLabel} />
            </div>
            <div className="rounded-lg border border-border bg-card p-4 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Hard Bounces</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{filteredData.bounceRate}%</p>
              <BenchmarkBadge label={filteredData.bounceRateLabel} />
            </div>
            <div className="rounded-lg border border-border bg-card p-4 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Unsubscribes</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{filteredData.unsubscribeRate}%</p>
              <BenchmarkBadge label={filteredData.unsubscribeRateLabel} />
            </div>
            <div className="rounded-lg border border-border bg-card p-4 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Spam Reports</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{filteredData.spamReports}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 shadow-card">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Sent</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(filteredData.totalEmailsSent)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* CRM Overview */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">CRM Overview</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <ScoreCard title="Total Contacts" value={formatNumber(filteredData.totalContacts)} delta={filteredData.totalContactsDelta} />
          <ScoreCard title="Delivered Rate" value={`${filteredData.deliveredRate}%`} delta={filteredData.deliveredRateDelta} />
          <ScoreCard title="Total Emails Sent" value={formatNumber(filteredData.totalEmailsSent)} />
          <ScoreCard title="Total Emails" value={formatNumber(filteredData.totalEmails ?? 0)} />
          <ScoreCard title="Contacts Reached" value={formatNumber(filteredData.contactsReached ?? 0)} />
        </div>
      </div>

      {/* Lifecycle Stage Breakdown */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-card">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lifecycle Stage Breakdown</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={filteredData.lifecycleStages} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} width={100} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {filteredData.lifecycleStages.map((_: any, i: number) => (
                <Cell key={i} fill={LIFECYCLE_COLORS[i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* SECTION B - High & Low Performing Emails */}
      {filteredData.emails.length > 0 && (
        <div>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            High & Low Performing Emails
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-brand-green">🔥 High Performing</h3>
              <div className="space-y-3">
                {filteredData.highPerforming.map((e: any) => <EmailCard key={e.name} email={e} />)}
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-brand-red">⚠️ Low Performing</h3>
              <div className="space-y-3">
                {filteredData.lowPerforming.map((e: any) => <EmailCard key={e.name} email={e} />)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6 shadow-card">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Open Rate Over Time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={filteredData.openRateOverTime}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="linear" dataKey="value" name="Open Rate" stroke="hsl(var(--brand-blue))" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-card">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unsubscribe Rate Over Time</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={filteredData.unsubscribeRateOverTime}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="linear" dataKey="value" name="Unsubscribe Rate" stroke="hsl(var(--brand-red))" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Debug info */}
      <p className="text-xs text-muted-foreground px-1">
        Fetched {filteredData.emails?.length ?? 0} emails for "{filteredData.brandName ?? ""}"
        {filteredData.totalFetched != null && ` (${filteredData.totalFetched} total in account)`}
      </p>

      {/* SECTION C - Email Performance Table */}
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
                <TableHead className="text-xs">Published</TableHead>
                <TableHead className="text-right text-xs">Sent</TableHead>
                <TableHead className="text-right text-xs">Click %</TableHead>
                <TableHead className="text-right text-xs">Delivered %</TableHead>
                <TableHead className="text-right text-xs">Unsub %</TableHead>
                <TableHead className="text-right text-xs">Spam %</TableHead>
                <TableHead className="text-right text-xs">Opens %</TableHead>
                <TableHead className="text-right text-xs">Bounces %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.emails.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">
                    No emails found in this date range.
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.emails.map((row: any, idx: number) => (
                  <TableRow key={`${row.name}-${idx}`}>
                    <TableCell className="text-sm font-medium">{row.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.sender}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.publishDate}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.account}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.sent.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.clickRate}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.deliveredRate}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.unsubscribeRate}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.spamRate}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.openRate}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.bounceRate}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
