import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { Users, MapPin, Trophy, TrendingUp } from "lucide-react";
import { USStateMap } from "@/components/USStateMap";
import { demoCRM, TABLEAU, RWFD } from "@/lib/demoData";
import { RwfdKpiTile } from "./RwfdKpiTile";

const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const gridColor = "hsl(var(--border))";

function SectionHeader({ icon: Icon, label, color }: { icon: React.ElementType; label: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ background: color }}
      >
        <Icon className="h-4 w-4 text-white" />
      </div>
      <h2 className="text-base font-bold" style={{ color: RWFD.navy }}>{label}</h2>
      <div className="flex-1 border-t border-slate-200" />
    </div>
  );
}

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

function fmtMoney(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

function fmtCompact(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

export function DemoHubSpotCRMTab() {
  const k = demoCRM.kpis;

  return (
    <div className="space-y-8 p-6">
      {/* ── KPI tiles (RWFD style) ── */}
      <section className="grid gap-4 grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <RwfdKpiTile data={k.totalContacts}    accentColor={RWFD.coral} fmt={fmtCompact} />
        <RwfdKpiTile data={k.newContacts}      accentColor={RWFD.blue}  fmt={fmtCompact} />
        <RwfdKpiTile data={k.assigned}         accentColor={RWFD.navy}  fmt={fmtCompact} />
        <RwfdKpiTile data={k.unassigned}       accentColor={RWFD.coral} fmt={fmtCompact} />
        <RwfdKpiTile data={k.customers}        accentColor={RWFD.blue}  fmt={fmtCompact} />
        <RwfdKpiTile data={k.pipelineValue}    accentColor={RWFD.navy}  fmt={fmtMoney} />
      </section>

      {/* ── Lifecycle funnel ── */}
      <SectionHeader icon={TrendingUp} label="Lifecycle Funnel" color={TABLEAU.blue} />
      <ChartCard title="Subscriber → Customer Funnel" subtitle="Conversion through each lifecycle stage in the selected period">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {demoCRM.funnel.map((s, i) => {
            const prev = i > 0 ? demoCRM.funnel[i - 1].count : null;
            const rate = prev && prev > 0 ? (s.count / prev) * 100 : null;
            return (
              <div key={s.stage} className="rounded-xl bg-muted/40 p-4 transition-colors hover:bg-muted/60">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: s.color }}>{s.stage}</p>
                <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{s.count.toLocaleString()}</p>
                {rate !== null && <p className="mt-0.5 text-[10px] text-muted-foreground">{rate.toFixed(1)}% from prev</p>}
              </div>
            );
          })}
        </div>
        <div className="mt-6">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={demoCRM.funnel} layout="vertical" margin={{ left: 0, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
              <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="stage" tick={axisStyle} width={100} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip />} />
              <Bar dataKey="count" name="Contacts" radius={[0, 6, 6, 0]}>
                {demoCRM.funnel.map((s, i) => <Cell key={i} fill={s.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* ── Geographic Distribution — single brand ── */}
      <SectionHeader icon={MapPin} label="Geographic Distribution" color={TABLEAU.green} />
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white"
              style={{ background: TABLEAU.blue }}
            >
              M
            </span>
            <div>
              <h4 className="text-base font-bold text-foreground">Brand Mostafa</h4>
              <p className="text-[11px] text-muted-foreground">Contact distribution across U.S. states</p>
            </div>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-bold text-white"
            style={{ background: TABLEAU.blue }}
          >
            {demoCRM.geoTotal.toLocaleString()} contacts
          </span>
        </div>
        <USStateMap stateDistribution={demoCRM.geoStates} hideStatSummary />
      </div>

      {/* ── Lead Source Mix + Industries side-by-side ── */}
      <SectionHeader icon={Users} label="Acquisition & Industry Mix" color={TABLEAU.purple} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Lead Source Breakdown" subtitle="Where contacts are coming from across all channels">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={demoCRM.leadSource}
                dataKey="value"
                nameKey="source"
                innerRadius={70}
                outerRadius={120}
                paddingAngle={2}
              >
                {demoCRM.leadSource.map((s, i) => (
                  <Cell key={i} fill={s.color} stroke="hsl(var(--card))" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip content={<Tip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
            {demoCRM.leadSource.map((s) => (
              <div key={s.source} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="text-foreground">{s.source}</span>
                <span className="text-muted-foreground tabular-nums">{s.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Top Industries" subtitle="B2B contact distribution by industry segment">
          <div className="space-y-2.5 pt-1">
            {(() => {
              const total = demoCRM.industries.reduce((s, i) => s + i.contacts, 0);
              const max = Math.max(...demoCRM.industries.map((i) => i.contacts));
              return demoCRM.industries.map((row, idx) => {
                const pct = (row.contacts / total) * 100;
                const widthPct = (row.contacts / max) * 100;
                const isTop = idx === 0;
                return (
                  <div
                    key={row.industry}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate mb-1.5" style={{ color: RWFD.navy }}>
                        {row.industry}
                      </p>
                      <div className="relative h-4 w-full overflow-hidden rounded-md" style={{ background: "#EEF2F7" }}>
                        <div
                          className="h-full rounded-md"
                          style={{
                            width: `${widthPct}%`,
                            background: isTop ? RWFD.coral : RWFD.navy,
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <span className="text-sm font-bold tabular-nums" style={{ color: RWFD.navy }}>
                        {pct.toFixed(0)}%
                      </span>
                      <span className="ml-2 text-xs tabular-nums text-slate-500">
                        ({row.contacts.toLocaleString()})
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </ChartCard>
      </div>

      {/* ── Lifecycle Stage Trend + Deal Velocity ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Lifecycle Stages Over Time" subtitle="Weekly volume per stage across the last 12 weeks">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={demoCRM.lifecycleTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="week" tick={axisStyle} tickLine={false} axisLine={false} />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                <Tooltip content={<Tip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="Subscriber" stackId="1" stroke={TABLEAU.blue}   fill={TABLEAU.blue}   fillOpacity={0.75} />
                <Area type="monotone" dataKey="Lead"       stackId="1" stroke={TABLEAU.orange} fill={TABLEAU.orange} fillOpacity={0.75} />
                <Area type="monotone" dataKey="MQL"        stackId="1" stroke={TABLEAU.cyan}   fill={TABLEAU.cyan}   fillOpacity={0.75} />
                <Area type="monotone" dataKey="SQL"        stackId="1" stroke={TABLEAU.purple} fill={TABLEAU.purple} fillOpacity={0.75} />
                <Area type="monotone" dataKey="Customer"   stackId="1" stroke={TABLEAU.green}  fill={TABLEAU.green}  fillOpacity={0.85} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Deal Velocity" subtitle="Average days to advance between stages">
          <div className="space-y-4 pt-2">
            {demoCRM.dealVelocity.map((v) => {
              const max = Math.max(...demoCRM.dealVelocity.map((x) => x.days));
              const pct = (v.days / max) * 100;
              return (
                <div key={v.stage}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-foreground">{v.stage}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{v.days.toFixed(1)} days</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${TABLEAU.green}, ${TABLEAU.yellow}, ${TABLEAU.orange}, ${TABLEAU.red})`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="mt-4 rounded-xl bg-muted/40 p-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Sales Cycle</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">
                {demoCRM.dealVelocity.reduce((s, v) => s + v.days, 0).toFixed(1)} days
              </p>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* ── Top Accounts ── */}
      <SectionHeader icon={Trophy} label="Top Accounts" color={TABLEAU.orange} />
      <ChartCard title="Highest-Value Accounts" subtitle="Accounts ranked by ARR and active deal count">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">Account</th>
                <th className="py-2 pr-4 text-right font-semibold">Contacts</th>
                <th className="py-2 pr-4 text-right font-semibold">Active Deals</th>
                <th className="py-2 text-right font-semibold">ARR</th>
              </tr>
            </thead>
            <tbody>
              {demoCRM.topAccounts.map((a, i) => {
                const isTop = i === 0;
                return (
                  <tr
                    key={a.name}
                    className="border-b border-border/60 last:border-0"
                    style={isTop ? { background: RWFD.coralBg } : undefined}
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                          style={{ background: isTop ? RWFD.coral : RWFD.navy }}
                        >
                          {i + 1}
                        </span>
                        <span className="font-semibold" style={{ color: RWFD.navy }}>{a.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums" style={{ color: RWFD.navy }}>{a.contacts}</td>
                    <td className="py-3 pr-4 text-right tabular-nums" style={{ color: RWFD.navy }}>{a.deals}</td>
                    <td className="py-3 text-right">
                      <span
                        className="rounded-full px-2.5 py-0.5 font-bold tabular-nums text-white"
                        style={{ background: isTop ? RWFD.coral : RWFD.navy }}
                      >
                        {a.arr}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
