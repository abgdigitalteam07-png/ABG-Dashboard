import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { ChevronDown, ChevronUp } from "lucide-react";
import { RWFD, type KpiCard } from "@/lib/demoData";

interface RwfdKpiTileProps {
  data: KpiCard;
  accentColor?: string;
  fmt?: (v: number) => string;
}

const defaultFmt = (v: number) => v.toLocaleString();

export function RwfdKpiTile({ data, accentColor = RWFD.coral, fmt = defaultFmt }: RwfdKpiTileProps) {
  const isPositive = data.delta >= 0;
  const goodDirection = data.delta >= 0;
  const pillBg = goodDirection ? RWFD.blueBg : RWFD.coralBg;
  const pillFg = goodDirection ? RWFD.blue : RWFD.coral;
  const Arrow = goodDirection ? ChevronUp : ChevronDown;

  const sparkData = data.spark.map((v, i) => ({ i, v }));

  return (
    <div className="relative overflow-hidden rounded-xl bg-white border border-slate-200/80 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.06)] dark:bg-slate-900 dark:border-slate-800">
      <div className="p-5 pb-3">
        <div className="flex items-baseline gap-2 mb-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
            {data.label}
          </p>
        </div>

        <div className="flex items-stretch gap-2">
          {/* Accent bar */}
          <span
            className="block w-1.5 rounded-full self-stretch"
            style={{ background: accentColor }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <p
                className="text-[22px] font-bold tabular-nums leading-none truncate"
                style={{ color: RWFD.navy }}
              >
                {data.prefix ?? ""}{fmt(data.value)}{data.suffix ?? ""}
              </p>
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0"
                style={{ background: pillBg, color: pillFg }}
              >
                <Arrow className="h-3 w-3" strokeWidth={3} />
                {isPositive ? "+" : ""}{data.delta.toFixed(1)}%
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              PM: <span className="font-semibold tabular-nums" style={{ color: RWFD.navy90 }}>
                {data.prefix ?? ""}{fmt(data.prev)}{data.suffix ?? ""}
              </span>
            </p>
          </div>
        </div>

        {/* Gauge bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.max(2, data.gauge))}%`,
              background: RWFD.navy,
            }}
          />
        </div>
      </div>

      {/* Sparkline */}
      <div className="px-2 pt-1 pb-2 h-[64px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Line
              type="monotone"
              dataKey="v"
              stroke={RWFD.navy}
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
