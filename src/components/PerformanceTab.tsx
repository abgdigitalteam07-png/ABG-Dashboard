import { useState, useEffect, useMemo } from "react";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";
import { fetchGA4Data, fetchGSCData } from "@/lib/api-client";
import { Brand } from "@/lib/brands";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  TrendingUp, TrendingDown, Users, Eye, MousePointer, Search,
  Activity, Globe, BarChart2, Percent,
} from "lucide-react";
import { TrafficAcquisitionTable } from "./TrafficAcquisitionTable";
import { AIRecommendations } from "./AIRecommendations";
import { format } from "date-fns";

interface PerformanceTabProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
}

function fmt(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

/* ── Skeleton pulse ── */
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

/* ── Stat card ── */
interface StatCardProps {
  title: string;
  value: string;
  delta?: number;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  loading?: boolean;
}

function StatCard({ title, value, delta, icon: Icon, iconColor, iconBg, loading }: StatCardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-7 w-24" />
        <Skeleton className="mt-1.5 h-3.5 w-16" />
      </div>
    );
  }

  const positive = delta === undefined || delta >= 0;

  return (
    <div className="group rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/20 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        {delta !== undefined && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
          }`}>
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {positive ? "+" : ""}{delta.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">{title}</p>
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

/* ── Custom tooltip ── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="mb-1 font-semibold text-muted-foreground">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-foreground font-medium">{fmt(p.value)}</span>
          <span className="text-muted-foreground">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

export function PerformanceTab({ brand, dateFrom, dateTo }: PerformanceTabProps) {
  const [ga4, setGa4] = useState<any>(null);
  const [gsc, setGsc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const showLoader = useFirstLoad(loading);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setGa4(null);
    setGsc(null);

    Promise.all([
      brand.hasGA4 ? fetchGA4Data(brand, dateFrom, dateTo) : Promise.resolve(null),
      brand.hasGSC ? fetchGSCData(brand, dateFrom, dateTo) : Promise.resolve(null),
    ]).then(([ga4Data, gscData]) => {
      if (!cancelled) {
        setGa4(ga4Data);
        setGsc(gscData);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [brand.id, dateFrom.getTime(), dateTo.getTime()]);

  const topPagesTotals = useMemo(() => {
    if (!ga4?.topPages?.length) return null;
    const pages = ga4.topPages;
    return {
      sessions: pages.reduce((s: number, r: any) => s + (r.sessions || 0), 0),
      views: pages.reduce((s: number, r: any) => s + (r.views || 0), 0),
    };
  }, [ga4]);

  const topQueriesTotals = useMemo(() => {
    if (!gsc?.topQueries?.length) return null;
    const q = gsc.topQueries;
    return {
      clicks: q.reduce((s: number, r: any) => s + (r.clicks || 0), 0),
      impressions: q.reduce((s: number, r: any) => s + (r.impressions || 0), 0),
      ctr: (q.reduce((s: number, r: any) => s + (parseFloat(r.ctr) || 0), 0) / q.length).toFixed(1),
      position: (q.reduce((s: number, r: any) => s + (r.position || 0), 0) / q.length).toFixed(1),
    };
  }, [gsc]);

  if (!brand.hasGA4 && !brand.hasGSC) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <BarChart2 className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">
          {brand.name === "American Bath Group"
            ? "Select an individual brand to view analytics."
            : `No GA4 or GSC property linked for ${brand.name}.`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">This brand is HubSpot-only.</p>
      </div>
    );
  }

  if (showLoader) {
    return <WaterFillLoader fullScreen={false} message="Loading analytics…" />;
  }

  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
  const gridColor = "hsl(var(--border))";

  return (
    <div className="space-y-8 p-6">

      {/* ── Google Analytics ── */}
      {brand.hasGA4 && (
        <section className="space-y-5">
          <SectionHeader icon={Activity} label="Google Analytics" color="bg-blue-600" />

          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard loading={loading} title="Sessions" value={fmt(ga4?.sessions)} delta={ga4?.sessionsDelta}
              icon={Users} iconBg="bg-blue-50" iconColor="text-blue-600" />
            <StatCard loading={loading} title="Organic Sessions" value={fmt(ga4?.organicSessions)} delta={ga4?.organicSessionsDelta}
              icon={TrendingUp} iconBg="bg-indigo-50" iconColor="text-indigo-600" />
            <StatCard loading={loading} title="Page Views" value={fmt(ga4?.pageViews)} delta={ga4?.pageViewsDelta}
              icon={Eye} iconBg="bg-violet-50" iconColor="text-violet-600" />
            <StatCard loading={loading} title="1-Day Active Users" value={fmt(ga4?.activeUsers1Day)} delta={ga4?.activeUsers1DayDelta}
              icon={Activity} iconBg="bg-sky-50" iconColor="text-sky-600" />
          </div>

          {/* Charts */}
          {!loading && ga4 && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <ChartCard title="Sessions Over Time" subtitle="Daily visit volume">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={ga4.sessionsOverTime} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gSessions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={axisStyle} tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="value" name="Sessions" stroke="#3B82F6" strokeWidth={2}
                      fill="url(#gSessions)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#3B82F6" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Active Users & Page Views" subtitle="Engagement depth over time">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={ga4.activeUsersOverTime} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F97316" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94A3B8" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#94A3B8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={axisStyle} tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} />
                    <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Area type="monotone" dataKey="activeUsers" name="Active Users" stroke="#F97316" strokeWidth={2}
                      fill="url(#gUsers)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#F97316" }} />
                    <Area type="monotone" dataKey="views" name="Views" stroke="#94A3B8" strokeWidth={2}
                      fill="url(#gViews)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#94A3B8" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          {/* Top Pages */}
          {!loading && ga4?.topPages?.length > 0 && (
            <ChartCard title="Top Pages" subtitle="Pages ranked by traffic">
              <div className="-mx-6 -mb-6 overflow-hidden rounded-b-2xl">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs font-semibold pl-6">Page</TableHead>
                      <TableHead className="text-right text-xs font-semibold">Sessions</TableHead>
                      <TableHead className="text-right text-xs font-semibold">Views</TableHead>
                      <TableHead className="text-right text-xs font-semibold pr-6">Avg Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ga4.topPages.map((row: any, i: number) => (
                      <TableRow key={row.page} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                            <span className="font-mono text-xs text-foreground truncate max-w-[280px]">{row.page}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">{row.sessions.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{row.views.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm pr-6 text-muted-foreground">{row.avgDuration}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {topPagesTotals && (
                    <TableFooter>
                      <TableRow>
                        <TableCell className="pl-6 text-sm font-semibold">Total</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold">{topPagesTotals.sessions.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold">{topPagesTotals.views.toLocaleString()}</TableCell>
                        <TableCell className="pr-6" />
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </ChartCard>
          )}

          {!loading && <TrafficAcquisitionTable brand={brand} dateFrom={dateFrom} dateTo={dateTo} />}
        </section>
      )}

      {/* ── Search Console ── */}
      {brand.hasGSC && (
        <section className="space-y-5">
          <SectionHeader icon={Search} label="Google Search Console" color="bg-violet-600" />

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard loading={loading} title="Total Clicks" value={fmt(gsc?.totalClicks)} delta={gsc?.totalClicksDelta}
              icon={MousePointer} iconBg="bg-violet-50" iconColor="text-violet-600" />
            <StatCard loading={loading} title="Impressions" value={fmt(gsc?.totalImpressions)} delta={gsc?.totalImpressionsDelta}
              icon={Globe} iconBg="bg-purple-50" iconColor="text-purple-600" />
            <StatCard loading={loading} title="Avg CTR" value={gsc ? `${gsc.averageCTR}%` : "—"} delta={gsc?.averageCTRDelta}
              icon={Percent} iconBg="bg-fuchsia-50" iconColor="text-fuchsia-600" />
            <StatCard loading={loading} title="Avg Position" value={gsc ? gsc.averagePosition.toFixed(1) : "—"} delta={gsc?.averagePositionDelta}
              icon={BarChart2} iconBg="bg-pink-50" iconColor="text-pink-600" />
          </div>

          {!loading && gsc && (
            <ChartCard title="Clicks & Impressions Over Time" subtitle="Search visibility trend">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={gsc.clicksImpressionsOverTime} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={axisStyle} tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Line yAxisId="left" type="monotone" dataKey="clicks" name="Clicks"
                    stroke="#7C3AED" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Line yAxisId="right" type="monotone" dataKey="impressions" name="Impressions"
                    stroke="#EC4899" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {!loading && gsc?.topQueries?.length > 0 && (
            <ChartCard title="Top Queries" subtitle="Search terms driving traffic">
              <div className="-mx-6 -mb-6 overflow-hidden rounded-b-2xl">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="pl-6 text-xs font-semibold">Query</TableHead>
                      <TableHead className="text-right text-xs font-semibold">Clicks</TableHead>
                      <TableHead className="text-right text-xs font-semibold">Impressions</TableHead>
                      <TableHead className="text-right text-xs font-semibold">CTR</TableHead>
                      <TableHead className="text-right text-xs font-semibold pr-6">Position</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gsc.topQueries.map((row: any, i: number) => (
                      <TableRow key={row.query} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                            <span className="text-sm text-foreground">{row.query}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-medium">{row.clicks.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{row.impressions.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{row.ctr}%</TableCell>
                        <TableCell className="text-right tabular-nums text-sm pr-6 text-muted-foreground">{row.position.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {topQueriesTotals && (
                    <TableFooter>
                      <TableRow>
                        <TableCell className="pl-6 text-sm font-semibold">Total / Avg</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold">{topQueriesTotals.clicks.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold">{topQueriesTotals.impressions.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-semibold">{topQueriesTotals.ctr}%</TableCell>
                        <TableCell className="text-right tabular-nums text-sm pr-6">{topQueriesTotals.position}</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </ChartCard>
          )}
        </section>
      )}

    </div>
  );
}
