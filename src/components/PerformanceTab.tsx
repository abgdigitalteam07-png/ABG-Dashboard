import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { ScoreCard } from "./ScoreCard";
import { generateGA4Data, generateGSCData } from "@/lib/mock-data";
import { Brand } from "@/lib/brands";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface PerformanceTabProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

export function PerformanceTab({ brand, dateFrom, dateTo }: PerformanceTabProps) {
  const ga4 = useMemo(() => generateGA4Data(brand.id, dateFrom, dateTo), [brand.id, dateFrom, dateTo]);
  const gsc = useMemo(() => generateGSCData(brand.id, dateFrom, dateTo), [brand.id, dateFrom, dateTo]);

  if (!brand.hasGA4 && !brand.hasGSC) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium text-muted-foreground">No GA4/GSC property linked for {brand.name}.</p>
        <p className="mt-1 text-xs text-muted-foreground">This brand is HubSpot-only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {brand.hasGA4 && (
        <>
          <div>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Google Analytics</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ScoreCard title="Sessions" value={formatNumber(ga4.sessions)} delta={ga4.sessionsDelta} />
              <ScoreCard title="Organic Sessions" value={formatNumber(ga4.organicSessions)} delta={ga4.organicSessionsDelta} />
              <ScoreCard title="Page Views" value={formatNumber(ga4.pageViews)} delta={ga4.pageViewsDelta} />
              <ScoreCard title="1-Day Active Users" value={formatNumber(ga4.activeUsers1Day)} delta={ga4.activeUsers1DayDelta} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-6 shadow-card">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sessions Over Time</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={ga4.sessionsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Line type="linear" dataKey="value" name="Sessions" stroke="hsl(var(--brand-blue))" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-lg border border-border bg-card p-6 shadow-card">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Users & Views Over Time</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={ga4.activeUsersOverTime}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="linear" dataKey="activeUsers" name="Active Users" stroke="hsl(var(--brand-orange))" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Line type="linear" dataKey="views" name="Views" stroke="hsl(var(--chart-views))" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card shadow-card">
            <div className="p-6 pb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Pages</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Page</TableHead>
                  <TableHead className="text-right text-xs">Sessions</TableHead>
                  <TableHead className="text-right text-xs">Views</TableHead>
                  <TableHead className="text-right text-xs">Avg Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ga4.topPages.map((row) => (
                  <TableRow key={row.page}>
                    <TableCell className="font-mono text-xs">{row.page}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.sessions.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.views.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.avgDuration}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {brand.hasGSC && (
        <>
          <div className="mt-8">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Search Console</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ScoreCard title="Total Clicks" value={formatNumber(gsc.totalClicks)} delta={gsc.totalClicksDelta} />
              <ScoreCard title="Total Impressions" value={formatNumber(gsc.totalImpressions)} delta={gsc.totalImpressionsDelta} />
              <ScoreCard title="Average CTR" value={`${gsc.averageCTR}%`} delta={gsc.averageCTRDelta} />
              <ScoreCard title="Average Position" value={gsc.averagePosition.toFixed(1)} delta={gsc.averagePositionDelta} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 shadow-card">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clicks & Impressions Over Time</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={gsc.clicksImpressionsOverTime}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="left" type="linear" dataKey="clicks" name="Clicks" stroke="hsl(var(--brand-blue))" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                <Line yAxisId="right" type="linear" dataKey="impressions" name="Impressions" stroke="hsl(var(--brand-orange))" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-lg border border-border bg-card shadow-card">
            <div className="p-6 pb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Queries</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Query</TableHead>
                  <TableHead className="text-right text-xs">Clicks</TableHead>
                  <TableHead className="text-right text-xs">Impressions</TableHead>
                  <TableHead className="text-right text-xs">CTR</TableHead>
                  <TableHead className="text-right text-xs">Position</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gsc.topQueries.map((row) => (
                  <TableRow key={row.query}>
                    <TableCell className="text-sm">{row.query}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.ctr}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{row.position.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
