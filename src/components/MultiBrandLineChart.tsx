import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Brand } from "@/lib/brands";
import { getBrandColor, TOTAL_COLOR, TOTAL_LINE_PROPS } from "@/lib/multiBrandColors";

interface MultiBrandLineChartProps {
  data: Record<string, any>[];
  brands: Brand[];
  height?: number;
  showTotal?: boolean;
  yTickFormatter?: (v: number) => string;
  valueFormatter?: (v: number) => string;
  reversedYAxis?: boolean;
  yDomain?: [number | string, number | string];
}

/** Reusable multi-brand comparison line chart: one line per brand + an optional Total line. */
export function MultiBrandLineChart({
  data,
  brands,
  height = 240,
  showTotal = true,
  yTickFormatter,
  valueFormatter,
  reversedYAxis,
  yDomain,
}: MultiBrandLineChartProps) {
  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
  const gridColor = "hsl(var(--border))";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={axisStyle}
          tickFormatter={(v) => (typeof v === "string" ? v.slice(5) : v)}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          reversed={reversedYAxis}
          domain={yDomain}
          tickFormatter={yTickFormatter}
        />
        <Tooltip
          content={({ active, payload, label }: any) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs">
                <p className="mb-1 font-semibold text-muted-foreground">{label}</p>
                {payload.map((p: any) => (
                  <div key={p.dataKey} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                    <span className="text-foreground font-medium">
                      {valueFormatter ? valueFormatter(p.value) : p.value}
                    </span>
                    <span className="text-muted-foreground">{p.name}</span>
                  </div>
                ))}
              </div>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        {brands.map((b, i) => (
          <Line
            key={b.id}
            type="monotone"
            dataKey={b.name}
            name={b.name}
            stroke={getBrandColor(i)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
        {showTotal && (
          <Line
            type="monotone"
            dataKey="Total"
            name="Total"
            stroke={TOTAL_COLOR}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            {...TOTAL_LINE_PROPS}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
