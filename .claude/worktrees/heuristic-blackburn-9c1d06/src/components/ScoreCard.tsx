import { TrendingUp, TrendingDown } from "lucide-react";

interface ScoreCardProps {
  title: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  loading?: boolean;
}

export function ScoreCard({ title, value, delta, deltaLabel = "vs prev period", loading }: ScoreCardProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 md:p-6 shadow-card">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-7 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const isPositive = delta !== undefined && delta >= 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 md:p-6 shadow-card transition-transform hover:-translate-y-0.5">
      <p className="text-[10px] md:text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="mt-1.5 md:mt-2 text-xl md:text-2xl font-semibold tracking-tight tabular-nums text-card-foreground">
        {value}
      </p>
      {delta !== undefined && (
        <div className="mt-2 flex items-center gap-1">
          {isPositive ? (
            <TrendingUp className="h-3 w-3 text-brand-green" />
          ) : (
            <TrendingDown className="h-3 w-3 text-brand-red" />
          )}
          <span
            className={`text-xs font-medium tabular-nums ${
              isPositive ? "text-brand-green" : "text-brand-red"
            }`}
          >
            {isPositive ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">{deltaLabel}</span>
        </div>
      )}
    </div>
  );
}
