import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ScoreCard } from "@/components/ScoreCard";
import { demoEmails, TABLEAU } from "@/lib/demoData";

const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const gridColor = "hsl(var(--border))";

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs">
      {label !== undefined && <p className="mb-1 font-semibold text-muted-foreground">{label}</p>}
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

export function DemoEmailsTab() {
  const k = demoEmails.kpis;
  return (
    <div className="space-y-8 p-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <ScoreCard title="Sent" value={k.sent.value.toLocaleString()} delta={k.sent.delta} />
        <ScoreCard title="Opens" value={k.opens.value.toLocaleString()} delta={k.opens.delta} />
        <ScoreCard title="Clicks" value={k.clicks.value.toLocaleString()} delta={k.clicks.delta} />
        <ScoreCard title="Open Rate" value={k.openRate.value} delta={k.openRate.delta} />
        <ScoreCard title="Click Rate" value={k.clickRate.value} delta={k.clickRate.delta} />
        <ScoreCard title="Unsubscribes" value={k.unsubscribes.value.toLocaleString()} delta={k.unsubscribes.delta} />
      </section>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Opens Trend</h3>
        <p className="mb-5 text-xs text-muted-foreground">Daily opens across all campaigns</p>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={demoEmails.openTrend}>
            <defs>
              <linearGradient id="opnGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TABLEAU.purple} stopOpacity={0.5} />
                <stop offset="100%" stopColor={TABLEAU.purple} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={6} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip />} />
            <Area type="monotone" dataKey="value" name="Opens" stroke={TABLEAU.purple} strokeWidth={2} fill="url(#opnGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Recent Campaigns</h3>
        <p className="mb-5 text-xs text-muted-foreground">Latest sends with engagement breakdown</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">Campaign</th>
                <th className="py-2 pr-4 font-semibold">Sent Date</th>
                <th className="py-2 pr-4 text-right font-semibold">Sent</th>
                <th className="py-2 pr-4 text-right font-semibold">Open Rate</th>
                <th className="py-2 text-right font-semibold">Click Rate</th>
              </tr>
            </thead>
            <tbody>
              {demoEmails.campaigns.map((c) => (
                <tr key={c.name} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-foreground">{c.name}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{c.sentDate}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{c.sent.toLocaleString()}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                      {c.openRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                      {c.clickRate.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
