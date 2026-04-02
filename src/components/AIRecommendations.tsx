import { useState, useMemo } from "react";
import { Sparkles, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, XCircle, TrendingUp, TrendingDown } from "lucide-react";
import { generateRecommendations, type Recommendation, type RecommendationStatus } from "@/lib/recommendation-rules";
import { cn } from "@/lib/utils";

interface AIRecommendationsProps {
  tabName: string;
  brandName: string;
  dateRange: string;
  metrics: Record<string, any>;
}

const statusConfig: Record<RecommendationStatus, { label: string; icon: typeof CheckCircle2; bg: string; border: string; text: string; badge: string }> = {
  strong:          { label: "Strong",           icon: CheckCircle2,  bg: "bg-green-50",  border: "border-l-green-500",  text: "text-green-700",  badge: "bg-green-100 text-green-700" },
  attention:       { label: "Needs Attention",  icon: AlertTriangle, bg: "bg-amber-50",  border: "border-l-amber-500",  text: "text-amber-700",  badge: "bg-amber-100 text-amber-700" },
  action_required: { label: "Action Required",  icon: XCircle,       bg: "bg-red-50",    border: "border-l-red-500",    text: "text-red-700",    badge: "bg-red-100 text-red-700" },
  trending_up:     { label: "Trending Up",      icon: TrendingUp,    bg: "bg-blue-50",   border: "border-l-blue-500",   text: "text-blue-700",   badge: "bg-blue-100 text-blue-700" },
  trending_down:   { label: "Trending Down",    icon: TrendingDown,  bg: "bg-gray-50",   border: "border-l-gray-400",   text: "text-gray-600",   badge: "bg-gray-100 text-gray-600" },
};

function RecommendationItem({ rec }: { rec: Recommendation }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[rec.status];
  const Icon = cfg.icon;

  return (
    <div className={cn("border-l-4 rounded-lg transition-all duration-200", cfg.border, cfg.bg)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Icon className={cn("h-5 w-5 shrink-0", cfg.text)} />
        <span className="flex-1 text-sm font-medium text-foreground">{rec.headline}</span>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", cfg.badge)}>
          {cfg.label}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 animate-in fade-in duration-200">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">What we found</p>
            <p className="text-sm text-foreground/80">{rec.detail}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Why it matters</p>
            <p className="text-sm text-foreground/80">{rec.whyItMatters}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Recommended actions</p>
            <ul className="space-y-1.5">
              {rec.actions.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
                  {action}
                </li>
              ))}
            </ul>
          </div>
          {rec.benchmark && (
            <div className="rounded-md bg-background/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">Benchmark:</span> {rec.benchmark}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AIRecommendations({ tabName, brandName, dateRange, metrics }: AIRecommendationsProps) {
  const [collapsed, setCollapsed] = useState(false);

  const recommendations = useMemo(
    () => generateRecommendations(tabName, metrics),
    [tabName, metrics]
  );

  if (recommendations.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-gradient-to-br from-blue-50/30 to-background shadow-card overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-3 px-6 py-4 text-left"
      >
        <Sparkles className="h-5 w-5 text-blue-500 shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">AI Insights & Recommendations</h3>
          <p className="text-xs text-muted-foreground">Based on {brandName} data for {dateRange}</p>
        </div>
        <span className="text-xs text-muted-foreground mr-1">{recommendations.length} insights</span>
        {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </button>
      {!collapsed && (
        <div className="px-6 pb-6 space-y-3">
          {recommendations.map((rec) => (
            <RecommendationItem key={rec.id} rec={rec} />
          ))}
        </div>
      )}
    </section>
  );
}
