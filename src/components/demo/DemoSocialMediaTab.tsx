import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Heart, Users2, Eye, Repeat2 } from "lucide-react";
import { ScoreCard } from "@/components/ScoreCard";
import { demoSocial, TABLEAU } from "@/lib/demoData";

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

export function DemoSocialMediaTab() {
  const k = demoSocial.kpis;
  return (
    <div className="space-y-8 p-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ScoreCard title="Reach" value={k.reach.value.toLocaleString()} delta={k.reach.delta} />
        <ScoreCard title="Impressions" value={k.impressions.value.toLocaleString()} delta={k.impressions.delta} />
        <ScoreCard title="Engagement" value={k.engagement.value.toLocaleString()} delta={k.engagement.delta} />
        <ScoreCard title="Followers" value={k.followers.value.toLocaleString()} delta={k.followers.delta} />
      </section>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Follower Growth</h3>
        <p className="mb-5 text-xs text-muted-foreground">Net new followers per day across Facebook & Instagram</p>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={demoSocial.followerGrowth}>
            <defs>
              <linearGradient id="folGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TABLEAU.pink} stopOpacity={0.6} />
                <stop offset="100%" stopColor={TABLEAU.pink} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={6} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip />} />
            <Area type="monotone" dataKey="value" name="Followers" stroke={TABLEAU.red} strokeWidth={2} fill="url(#folGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Top Posts</h3>
        <p className="mb-5 text-xs text-muted-foreground">Best-performing posts in the selected period</p>
        <div className="space-y-3">
          {demoSocial.topPosts.map((post, i) => (
            <div key={i} className="flex items-start gap-4 rounded-xl bg-muted/40 p-4">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ background: TABLEAU.red }}
              >
                {post.type[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{post.caption}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">{post.type}</p>
              </div>
              <div className="flex items-center gap-5 text-xs">
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Reach</p>
                  <p className="font-bold tabular-nums text-foreground">{post.reach.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Engagement</p>
                  <p className="font-bold tabular-nums text-foreground">{post.eng.toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
