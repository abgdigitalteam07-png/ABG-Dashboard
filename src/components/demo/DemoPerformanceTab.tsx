import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { TrendingUp, TrendingDown, Search, MousePointerClick, Eye, Target } from "lucide-react";
import { ScoreCard } from "@/components/ScoreCard";
import { demoPerformance, TABLEAU } from "@/lib/demoData";

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

const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const gridColor = "hsl(var(--border))";

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs">
      {label !== undefined && <p className="mb-1 font-semibold text-muted-foreground">{label}</p>}
      {payload.map((p: any) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-foreground font-medium">{(p.value || 0).toLocaleString()}</span>
          <span className="text-muted-foreground">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

export function DemoPerformanceTab() {
  const k = demoPerformance.kpis;
  const g = demoPerformance.gscKpis;

  return (
    <div className="space-y-8 p-6">
      {/* GA4 KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <ScoreCard title="Sessions" value={k.sessions.value.toLocaleString()} delta={k.sessions.delta} />
        <ScoreCard title="Users" value={k.users.value.toLocaleString()} delta={k.users.delta} />
        <ScoreCard title="Pageviews" value={k.pageviews.value.toLocaleString()} delta={k.pageviews.delta} />
        <ScoreCard title="Conversions" value={k.conversions.value.toLocaleString()} delta={k.conversions.delta} />
        <ScoreCard title="Avg Session" value={k.avgSession.value} delta={k.avgSession.delta} />
        <ScoreCard title="Bounce Rate" value={k.bounce.value} delta={k.bounce.delta} />
      </section>

      {/* Traffic trend */}
      <ChartCard title="Sessions Trend" subtitle="Daily sessions over the selected period">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={demoPerformance.trafficTrend}>
            <defs>
              <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TABLEAU.blue} stopOpacity={0.5} />
                <stop offset="100%" stopColor={TABLEAU.blue} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={6} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip />} />
            <Area type="monotone" dataKey="value" name="Sessions" stroke={TABLEAU.blue} strokeWidth={2} fill="url(#sessGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Channel mix */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Traffic by Channel" subtitle="Sessions split across acquisition channels">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={demoPerformance.channelMix} layout="vertical" margin={{ left: 0, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
              <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="channel" tick={axisStyle} width={110} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip />} />
              <Bar dataKey="sessions" name="Sessions" radius={[0, 6, 6, 0]}>
                {demoPerformance.channelMix.map((c, i) => <Cell key={i} fill={c.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Conversions by Channel" subtitle="Goal completions per channel">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={demoPerformance.channelMix}
                dataKey="conversions"
                nameKey="channel"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={2}
              >
                {demoPerformance.channelMix.map((c, i) => <Cell key={i} fill={c.color} stroke="hsl(var(--card))" strokeWidth={2} />)}
              </Pie>
              <Tooltip content={<Tip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
            {demoPerformance.channelMix.map((c) => (
              <div key={c.channel} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                <span className="text-foreground">{c.channel}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* GSC section */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: TABLEAU.green }}>
          <Search className="h-4 w-4 text-white" />
        </div>
        <h2 className="text-base font-bold text-foreground">Search Console</h2>
        <div className="flex-1 border-t border-border" />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ScoreCard title="Clicks" value={g.clicks.value.toLocaleString()} delta={g.clicks.delta} />
        <ScoreCard title="Impressions" value={g.impressions.value.toLocaleString()} delta={g.impressions.delta} />
        <ScoreCard title="CTR" value={g.ctr.value} delta={g.ctr.delta} />
        <ScoreCard title="Avg Position" value={g.position.value} delta={g.position.delta} />
      </section>

      <ChartCard title="Top Search Queries" subtitle="Highest-clicked queries from Google Search">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">Query</th>
                <th className="py-2 pr-4 text-right font-semibold">Clicks</th>
                <th className="py-2 pr-4 text-right font-semibold">Impressions</th>
                <th className="py-2 pr-4 text-right font-semibold">CTR</th>
                <th className="py-2 text-right font-semibold">Position</th>
              </tr>
            </thead>
            <tbody>
              {demoPerformance.topQueries.map((q) => (
                <tr key={q.query} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-foreground">{q.query}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{q.clicks.toLocaleString()}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">{q.impr.toLocaleString()}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{q.ctr.toFixed(1)}%</td>
                  <td className="py-2.5 text-right tabular-nums">{q.pos.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
