import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { generateRecommendations, type Recommendation, type RecommendationStatus } from "@/lib/recommendation-rules";
import { cn } from "@/lib/utils";

interface PlatformConfig {
  name: string;
  Icon: React.ElementType;
  headerFrom: string;
  headerTo: string;
}

interface AIRecommendationsProps {
  tabName: string;
  brandName: string;
  dateRange: string;
  metrics: Record<string, any>;
  platform?: PlatformConfig;
}

const statusConfig: Record<
  RecommendationStatus,
  { label: string; icon: typeof CheckCircle2; bg: string; border: string; text: string; badge: string }
> = {
  strong: {
    label: "Strong",
    icon: CheckCircle2,
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-l-green-500",
    text: "text-green-700 dark:text-green-400",
    badge: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400",
  },
  attention: {
    label: "Needs Attention",
    icon: AlertTriangle,
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-l-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",
  },
  action_required: {
    label: "Action Required",
    icon: XCircle,
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-l-red-500",
    text: "text-red-700 dark:text-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400",
  },
  trending_up: {
    label: "Trending Up",
    icon: TrendingUp,
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-l-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400",
  },
  trending_down: {
    label: "Trending Down",
    icon: TrendingDown,
    bg: "bg-slate-50 dark:bg-slate-900/40",
    border: "border-l-slate-400",
    text: "text-slate-600 dark:text-slate-400",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
};

function RecommendationItem({ rec }: { rec: Recommendation }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[rec.status];
  const Icon = cfg.icon;

  return (
    <div className={cn("border-l-[5px] rounded-xl shadow-sm transition-all duration-200", cfg.border, cfg.bg)}>
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <Icon className={cn("h-6 w-6 shrink-0", cfg.text)} />
        <span className="flex-1 text-sm font-bold text-foreground leading-snug">{rec.headline}</span>
        <span className={cn("shrink-0 rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap", cfg.badge)}>
          {cfg.label}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
        )}
      </button>
      {expanded && (
        <div className="px-5 pb-5 pt-1 space-y-4 animate-in fade-in duration-200">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">What we found</p>
            <p className="text-sm text-foreground/90 leading-relaxed">{rec.detail}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Why it matters</p>
            <p className="text-sm text-foreground/90 leading-relaxed">{rec.whyItMatters}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
              Recommended actions
            </p>
            <ul className="space-y-2">
              {rec.actions.map((action, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/90">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/50" />
                  <span className="leading-relaxed">{action}</span>
                </li>
              ))}
            </ul>
          </div>
          {rec.benchmark && (
            <div className="rounded-lg bg-background/80 border border-border/60 px-4 py-2.5">
              <p className="text-xs text-muted-foreground">
                <span className="font-bold">Benchmark:</span> {rec.benchmark}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AIRecommendations({ tabName, brandName, dateRange, metrics, platform }: AIRecommendationsProps) {
  const [collapsed, setCollapsed] = useState(true);

  const recommendations = useMemo(() => generateRecommendations(tabName, metrics), [tabName, metrics]);

  if (recommendations.length === 0) return null;

  const headerStyle = platform
    ? { background: `linear-gradient(135deg, ${platform.headerFrom} 0%, ${platform.headerTo} 100%)` }
    : { background: "linear-gradient(135deg, hsl(217 91% 18%) 0%, hsl(214 100% 12%) 100%)" };

  return (
    <section className="rounded-xl border border-border overflow-hidden shadow-md">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-4 px-6 py-5 text-left"
        style={headerStyle}
      >
        {platform && <platform.Icon className="h-7 w-7 text-white shrink-0 opacity-90" />}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-white leading-tight">
            {platform ? `${platform.name} Insights` : "Insights & Recommendations"}
          </h3>
          <p className="text-xs text-white/55 mt-0.5 truncate">
            {brandName} · {dateRange}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white/90">
          {recommendations.length} insight{recommendations.length !== 1 ? "s" : ""}
        </span>
        {collapsed ? (
          <ChevronDown className="h-5 w-5 text-white/60 shrink-0" />
        ) : (
          <ChevronUp className="h-5 w-5 text-white/60 shrink-0" />
        )}
      </button>
      {!collapsed && (
        <div className="bg-card px-6 pb-6 pt-4 space-y-3">
          {recommendations.map((rec) => (
            <RecommendationItem key={rec.id} rec={rec} />
          ))}
        </div>
      )}
    </section>
  );
}
