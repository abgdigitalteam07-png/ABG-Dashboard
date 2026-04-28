import { useState, useEffect, useMemo } from "react";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, Legend,
} from "recharts";
import { fetchHubSpotData } from "@/lib/api-client";
import { Brand } from "@/lib/brands";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  ArrowRight, ArrowDown, TrendingUp, TrendingDown, ChevronLeft, ChevronRight,
  Mail, BarChart2, Search, X, ExternalLink, Clock, CheckCircle2,
} from "lucide-react";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
const ANON_KEY = SUPABASE_PUBLISHABLE_KEY;

async function callEdgeFunction(name: string, body: any) {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name} → ${res.status}`);
  return res.json();
}
import {
  format, startOfWeek, startOfMonth, startOfDay, startOfQuarter,
  parseISO, addDays, addWeeks, addMonths, isBefore, isEqual,
} from "date-fns";
import { EmailPreviewModal } from "@/components/EmailPreviewModal";
import { Button } from "@/components/ui/button";
import { AIRecommendations } from "./AIRecommendations";

interface HubSpotTabProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

/* ── Skeleton pulse ── */
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
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

/* ── Chart card wrapper ── */
function ChartCard({ title, subtitle, children, headerRight }: { title: string; subtitle?: string; children: React.ReactNode; headerRight?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {headerRight}
      </div>
      {children}
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
          <span className="text-foreground font-medium">{p.value}%</span>
          <span className="text-muted-foreground">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Delta badge ── */
function DeltaBadge({ delta, invert }: { delta?: number | null; invert?: boolean }) {
  if (delta === null || delta === undefined) return null;
  const isGood = invert ? delta <= 0 : delta >= 0;
  const arrow = delta >= 0 ? "↑" : "↓";
  return (
    <span className={cn("mt-0.5 flex items-center gap-0.5 text-[10px] font-medium tabular-nums", isGood ? "text-emerald-600" : "text-red-600")}>
      {delta >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {arrow} {Math.abs(delta).toFixed(2)}% vs prev period
    </span>
  );
}

/* ── KPI Funnel Card — upgraded visual ── */
function FunnelCard({
  label, value, sub, variant = "positive", delta, invertDelta,
}: {
  label: string; value: string; sub?: string;
  variant?: "positive" | "pending" | "negative";
  delta?: number | null;
  invertDelta?: boolean;
}) {
  const styles = {
    positive: "bg-card border-border",
    pending: "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700",
    negative: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700",
  };
  const textStyles = {
    positive: "text-foreground",
    pending: "text-amber-900 dark:text-amber-100",
    negative: "text-red-900 dark:text-red-100",
  };
  return (
    <div className={cn("rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md", styles[variant])}>
      <p className={cn("text-[11px] font-semibold uppercase tracking-wider opacity-70", textStyles[variant])}>{label}</p>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums tracking-tight", textStyles[variant])}>{value}</p>
      {sub && <p className={cn("mt-0.5 text-[11px] opacity-60", textStyles[variant])}>{sub}</p>}
      <DeltaBadge delta={delta} invert={invertDelta} />
    </div>
  );
}

/* ── SVG Arrow connectors ── */
function HArrow() {
  return (
    <div className="hidden items-center lg:flex">
      <ArrowRight className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
function VArrow() {
  return (
    <div className="flex justify-center py-1">
      <ArrowDown className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

type ChartType = "line" | "area" | "bar" | "column";
type Granularity = "day" | "week" | "month" | "quarter";

/* ── Granularity Toggle ── */
function GranularityToggle({ value, onChange }: { value: Granularity; onChange: (v: Granularity) => void }) {
  const options: { label: string; value: Granularity }[] = [
    { label: "Day", value: "day" },
    { label: "Week", value: "week" },
    { label: "Month", value: "month" },
    { label: "Quarter", value: "quarter" },
  ];
  return (
    <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 font-medium transition-all ${
            value === o.value
              ? "bg-white shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Quarter key helper ── */
function quarterKey(date: Date): string {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `Q${q} ${date.getFullYear()}`;
}

/* ── Performance score for ranking emails ── */
function emailScore(e: any): number {
  return (e.openRate || 0) * 2 + (e.clickRate || 0) * 3 - (e.bounceRate || 0) * 4 - (e.unsubscribeRate || 0) * 5;
}

/* ── Clickable email name ── */
function EmailNameLink({ email, onClick }: { email: any; onClick: (email: any) => void }) {
  return (
    <button
      onClick={() => onClick(email)}
      className="text-left text-sm font-medium text-[#2563eb] hover:underline cursor-pointer whitespace-normal break-words"
    >
      {email.name}
    </button>
  );
}

const PAGE_SIZE = 10;

export function HubSpotTab({ brand, dateFrom, dateTo }: HubSpotTabProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const showLoader = useFirstLoad(loading);
  const [chartType, setChartType] = useState<ChartType>("area");
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [previewEmail, setPreviewEmail] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // Debounced global email search
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await callEdgeFunction("hubspot-email-search", { searchQuery: q });
        setSearchResults(data.results || []);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const openPreview = (email: any) => {
    setPreviewEmail(email);
    setPreviewOpen(true);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCurrentPage(1);
    setShowAll(false);
    fetchHubSpotData(brand, dateFrom, dateTo)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : "Failed to load");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [brand.id, dateFrom.getTime(), dateTo.getTime()]);

  const d = useMemo(() => {
    if (!data) return null;
    return { ...data, brandName: brand.name };
  }, [data, brand]);

  /* ── Aggregate chart data by granularity ── */
  const chartData = useMemo(() => {
    if (!d) return [];

    const buckets: Record<string, { opens: number; delivered: number; clicks: number }> = {};
    for (const email of d.emails || []) {
      if (!email.publishDate) continue;
      let key: string;
      const date = parseISO(email.publishDate);
      if (granularity === "day") {
        key = format(startOfDay(date), "yyyy-MM-dd");
      } else if (granularity === "week") {
        key = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
      } else if (granularity === "month") {
        key = format(startOfMonth(date), "yyyy-MM");
      } else {
        key = quarterKey(startOfQuarter(date));
      }
      if (!buckets[key]) buckets[key] = { opens: 0, delivered: 0, clicks: 0 };
      buckets[key].opens += email.opens || 0;
      buckets[key].delivered += email.delivered || 0;
      buckets[key].clicks += email.clicks || 0;
    }

    if (granularity === "quarter") {
      // For quarters, just return bucket entries in order
      return Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          date,
          openRate: v.delivered > 0 ? parseFloat(((v.opens / v.delivered) * 100).toFixed(1)) : 0,
          ctr: v.opens > 0 ? parseFloat(((v.clicks / v.opens) * 100).toFixed(1)) : 0,
        }));
    }

    const slots: string[] = [];
    let cursor = granularity === "day"
      ? startOfDay(dateFrom)
      : granularity === "week"
        ? startOfWeek(dateFrom, { weekStartsOn: 1 })
        : startOfMonth(dateFrom);
    const end = dateTo;
    const advance = granularity === "day" ? addDays : granularity === "week" ? addWeeks : addMonths;
    const fmtStr = granularity === "month" ? "yyyy-MM" : "yyyy-MM-dd";

    while (isBefore(cursor, end) || isEqual(cursor, end)) {
      slots.push(format(cursor, fmtStr));
      cursor = advance(cursor, 1);
    }

    return slots.map((date) => {
      const v = buckets[date] || { opens: 0, delivered: 0, clicks: 0 };
      return {
        date,
        openRate: v.delivered > 0 ? parseFloat(((v.opens / v.delivered) * 100).toFixed(1)) : 0,
        ctr: v.opens > 0 ? parseFloat(((v.clicks / v.opens) * 100).toFixed(1)) : 0,
      };
    });
  }, [d, granularity, dateFrom, dateTo]);

  /* ── High & low performing emails ── */
  const { highPerf, lowPerf } = useMemo(() => {
    if (!d?.emails?.length) return { highPerf: [], lowPerf: [] };
    const sorted = [...d.emails].sort((a: any, b: any) => emailScore(b) - emailScore(a));
    return {
      highPerf: sorted.slice(0, 4),
      lowPerf: sorted.slice(-4).reverse(),
    };
  }, [d]);

  /* ── Email table totals ── */
  const emailTotals = useMemo(() => {
    if (!d?.emails?.length) return null;
    const emails = d.emails;
    const totalSent = emails.reduce((s: number, e: any) => s + (e.sent || 0), 0);
    const totalDelivered = emails.reduce((s: number, e: any) => s + (e.delivered || 0), 0);
    const avgOpen = (emails.reduce((s: number, e: any) => s + (e.openRate || 0), 0) / emails.length).toFixed(1);
    const avgClick = (emails.reduce((s: number, e: any) => s + (e.clickRate || 0), 0) / emails.length).toFixed(1);
    const avgBounce = (emails.reduce((s: number, e: any) => s + (e.bounceRate || 0), 0) / emails.length).toFixed(2);
    const avgUnsub = (emails.reduce((s: number, e: any) => s + (e.unsubscribeRate || 0), 0) / emails.length).toFixed(2);
    const avgSpam = (emails.reduce((s: number, e: any) => s + (e.spamRate || 0), 0) / emails.length).toFixed(2);
    return { totalSent, totalDelivered, avgOpen, avgClick, avgBounce, avgUnsub, avgSpam };
  }, [d]);

  /* ── Pagination ── */
  const totalPages = useMemo(() => {
    if (!d?.emails?.length) return 1;
    return Math.ceil(d.emails.length / PAGE_SIZE);
  }, [d]);

  const paginatedEmails = useMemo(() => {
    if (!d?.emails?.length) return [];
    if (showAll) return d.emails;
    const start = (currentPage - 1) * PAGE_SIZE;
    return d.emails.slice(start, start + PAGE_SIZE);
  }, [d, currentPage, showAll]);

  if (!loading && error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-foreground">HubSpot data unavailable</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (showLoader) {
    return <WaterFillLoader fullScreen={false} message="Loading emails…" />;
  }

  if (!d) return null;

  const dl = d.deltas || {};
  const daysBetween = Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / 86400000));
  const weeks = daysBetween / 7;
  const avgEmailsPerWeek = weeks > 0 ? parseFloat((d.totalEmails / weeks).toFixed(1)) : 0;

  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
  const gridColor = "hsl(var(--border))";

  const renderChart = () => {
    const commonProps = { data: chartData };
    const xAxisFormatter = (v: string) => {
      if (granularity === "quarter") return v;
      try { const dt = parseISO(v); return format(dt, granularity === "month" ? "MMM yy" : "M/d"); } catch { return v; }
    };
    const xAxis = (
      <XAxis dataKey="date" tick={axisStyle} tickFormatter={xAxisFormatter}
        interval="preserveStartEnd" tickLine={false} axisLine={false} />
    );
    const yAxis = (
      <YAxis tick={axisStyle} domain={[0, 125]} tickFormatter={(v: number) => `${v}%`}
        tickLine={false} axisLine={false} />
    );
    const grid = <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />;
    const tooltip = <Tooltip content={<ChartTooltip />} />;
    const legend = <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />;

    if (chartType === "area") {
      return (
        <AreaChart {...commonProps} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gOpenRate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gCtr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#F97316" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
            </linearGradient>
          </defs>
          {grid}{xAxis}{yAxis}{tooltip}{legend}
          <Area type="monotone" dataKey="openRate" name="Open Rate" stroke="#3B82F6" strokeWidth={2}
            fill="url(#gOpenRate)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#3B82F6" }} />
          <Area type="monotone" dataKey="ctr" name="Click-through Rate" stroke="#F97316" strokeWidth={2}
            fill="url(#gCtr)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#F97316" }} />
        </AreaChart>
      );
    }
    if (chartType === "bar" || chartType === "column") {
      return (
        <BarChart {...commonProps} layout={chartType === "bar" ? "vertical" : "horizontal"}>
          {grid}
          {chartType === "bar" ? (
            <>
              <YAxis type="category" dataKey="date" tick={axisStyle} width={80} tickLine={false} axisLine={false} />
              <XAxis type="number" domain={[0, 125]} tickFormatter={(v: number) => `${v}%`} tick={axisStyle} tickLine={false} axisLine={false} />
            </>
          ) : (
            <>{xAxis}{yAxis}</>
          )}
          {tooltip}{legend}
          <Bar dataKey="openRate" name="Open Rate" fill="#3B82F6" radius={[2, 2, 0, 0]} />
          <Bar dataKey="ctr" name="Click-through Rate" fill="#F97316" radius={[2, 2, 0, 0]} />
        </BarChart>
      );
    }
    return (
      <LineChart {...commonProps} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        {grid}{xAxis}{yAxis}{tooltip}{legend}
        <Line type="monotone" dataKey="openRate" name="Open Rate" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="ctr" name="Click-through Rate" stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    );
  };

  const chartTypes: { value: ChartType; label: string }[] = [
    { value: "area", label: "Area" },
    { value: "bar", label: "Bar" },
    { value: "column", label: "Column" },
    { value: "line", label: "Line" },
  ];

  return (
    <div className="space-y-8 p-6">
      {/* Email Preview Modal */}
      <EmailPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        email={previewEmail}
      />

      {/* ═══ GLOBAL EMAIL SEARCH ═══ */}
      <div className="relative">
        <div className={`flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-all duration-200 ${searchFocused ? "border-blue-400 ring-2 ring-blue-100 shadow-sm" : "border-border"}`}>
          <Search className={`h-4 w-4 shrink-0 transition-colors ${searchFocused ? "text-blue-500" : "text-muted-foreground"}`} />
          <input
            type="text"
            placeholder="Search emails across all brands…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(""); setSearchResults([]); }} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          )}
          {searchLoading && (
            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
          )}
        </div>

        {/* Search results dropdown */}
        {searchQuery.trim().length >= 2 && (searchFocused || searchResults.length > 0) && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
            {searchResults.length === 0 && !searchLoading ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Mail className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No emails found for "{searchQuery}"</p>
                <p className="text-xs text-muted-foreground/60">Try a different keyword or partial email name</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} across all brands
                  </span>
                  <span className="text-[10px] text-muted-foreground">Click to preview</span>
                </div>
                <div className="max-h-[420px] overflow-y-auto divide-y divide-border/50">
                  {searchResults.map((r: any) => (
                    <button
                      key={r.id}
                      onMouseDown={() => openPreview(r)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors cursor-pointer group"
                    >
                      {/* Brand color dot */}
                      <div
                        className="mt-0.5 h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ backgroundColor: r.brandColor }}
                      >
                        {r.brand.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-foreground truncate">{r.name}</span>
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                            style={{ backgroundColor: r.brandColor }}
                          >
                            {r.brand}
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            r.state === "PUBLISHED" || r.state === "SENT"
                              ? "bg-emerald-100 text-emerald-700"
                              : r.state === "SCHEDULED"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {r.state === "PUBLISHED" ? "Sent" : r.state === "SCHEDULED" ? "Scheduled" : r.state}
                          </span>
                        </div>
                        {r.subject && (
                          <p className="mt-0.5 text-xs text-muted-foreground truncate">{r.subject}</p>
                        )}
                        <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground/70">
                          {r.date && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {r.date}
                            </span>
                          )}
                          {r.sender && <span>{r.sender}</span>}
                        </div>
                      </div>

                      <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══ SECTION 1 — KPI Funnel ═══ */}
      <section className="space-y-5">
        <SectionHeader icon={Mail} label="Email Funnel" color="bg-orange-500" />

        <div className="grid grid-cols-2 gap-3 lg:flex lg:items-center lg:gap-0">
          <div className="lg:flex-1"><FunnelCard label="Sent" value={fmt(d.totalEmailsSent)} sub={`${d.totalEmails} emails`} delta={dl.sent} /></div>
          <HArrow />
          <div className="lg:flex-1"><FunnelCard label="Delivered" value={fmt(d.totalDelivered ?? 0)} delta={dl.delivered} /></div>
          <HArrow />
          <div className="lg:flex-1"><FunnelCard label="Opens" value={fmt(d.totalOpens)} delta={dl.opens} /></div>
          <HArrow />
          <div className="lg:flex-1"><FunnelCard label="Clicks" value={fmt(d.totalClicks)} delta={dl.clicks} /></div>
        </div>
        <VArrow />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FunnelCard label="AVG Emails Per Week" value={String(avgEmailsPerWeek)} sub={`Based on ${d.totalEmails} emails over ${Math.round(weeks)} weeks`} variant="pending" />
          <FunnelCard label="Delivered Ratio" value={`${d.deliveredRate}%`} delta={dl.deliveredRate} />
          <FunnelCard label="Open Ratio" value={`${d.openRate}%`} delta={dl.openRate} />
          <FunnelCard label="Click Ratio" value={`${d.clickRate}%`} delta={dl.clickRate} />
        </div>
        <VArrow />
        <div className="grid grid-cols-2 gap-3">
          <FunnelCard label="Bounce" value={fmt(d.totalBounce ?? 0)} sub={`${d.bounceRate}%`} variant="negative" delta={dl.bounce} invertDelta />
          <FunnelCard label="Unsubscribed" value={fmt(d.totalUnsub ?? 0)} sub={`${d.unsubscribeRate}%`} variant="negative" delta={dl.unsubscribed} invertDelta />
        </div>
        <VArrow />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <FunnelCard label="Hard Bounce" value={fmt(d.totalHardBounce ?? 0)} sub={`${d.hardBounceRate ?? 0}%`} variant="negative" delta={dl.hardBounce} invertDelta />
          <FunnelCard label="Soft Bounce" value={fmt(d.totalSoftBounce ?? 0)} sub={`${d.softBounceRate ?? 0}%`} variant="negative" delta={dl.softBounce} invertDelta />
          <FunnelCard label="Spam Report" value={String(d.spamReports)} sub={`${d.spamRate ?? 0}%`} variant="negative" delta={dl.spam} invertDelta />
        </div>
      </section>

      {/* ═══ SECTION 2 — Performance Over Time ═══ */}
      <section className="space-y-5">
        <SectionHeader icon={BarChart2} label="Performance Over Time" color="bg-blue-600" />
        <ChartCard
          title="Open Rate & Click-through Rate"
          subtitle={`${format(dateFrom, "MMM d, yyyy")} – ${format(dateTo, "MMM d, yyyy")}`}
          headerRight={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
                {chartTypes.map((ct) => (
                  <button
                    key={ct.value}
                    onClick={() => setChartType(ct.value)}
                    className={cn(
                      "rounded-md px-3 py-1 font-medium transition-all",
                      chartType === ct.value ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
              <GranularityToggle value={granularity} onChange={setGranularity} />
            </div>
          }
        >
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              {renderChart()}
            </ResponsiveContainer>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">No data for chart</p>
          )}
        </ChartCard>
      </section>

      {/* ═══ SECTION 3 — Email Performance Table ═══ */}
      <section className="space-y-5">
        <SectionHeader icon={Mail} label="Email Performance" color="bg-indigo-600" />
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-semibold pl-6">Email Name</TableHead>
                  <TableHead className="text-xs font-semibold">Brand</TableHead>
                  <TableHead className="text-xs font-semibold">Sender</TableHead>
                  <TableHead className="text-xs font-semibold">Publish Date</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Sent</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Delivered</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Open Rate</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Click Rate</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Hard Bounce</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Unsub Rate</TableHead>
                  <TableHead className="text-right text-xs font-semibold pr-6">Spam Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.emails.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                      No emails found for "{d.brandName}" in selected date range.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedEmails.map((row: any, idx: number) => (
                    <TableRow key={`${row.name}-${idx}`} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="max-w-[300px] whitespace-normal break-words pl-6" style={{ overflowWrap: "break-word", wordWrap: "break-word", lineHeight: 1.4 }}>
                        <EmailNameLink email={{ ...row, brandName: row.brandName || d.brandName }} onClick={openPreview} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.brandName || d.brandName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.sender || ""}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.publishDate}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{row.sent.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{row.delivered.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{row.openRate}%</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{row.clickRate}%</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{row.bounceRate}%</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{row.unsubscribeRate}%</TableCell>
                      <TableCell className="text-right tabular-nums text-sm pr-6">{row.spamRate}%</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {emailTotals && (
                <TableFooter>
                  <TableRow className="bg-muted/80 font-semibold">
                    <TableCell className="text-sm pl-6">Totals / Averages</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right tabular-nums text-sm">{emailTotals.totalSent.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{emailTotals.totalDelivered.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{emailTotals.avgOpen}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{emailTotals.avgClick}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{emailTotals.avgBounce}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{emailTotals.avgUnsub}%</TableCell>
                    <TableCell className="text-right tabular-nums text-sm pr-6">{emailTotals.avgSpam}%</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
          {/* Pagination */}
          {d.emails.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border px-6 py-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={showAll || currentPage === 1} className="h-8 text-xs">
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={showAll || currentPage === totalPages} className="h-8 text-xs">
                  Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">
                {showAll ? `Showing all ${d.emails.length} emails` : `Page ${currentPage} of ${totalPages}`}
              </span>
              <Button variant="ghost" size="sm" onClick={() => { setShowAll(!showAll); setCurrentPage(1); }} className="h-8 text-xs">
                {showAll ? "Paginate" : "Show All"}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ═══ SECTION 4 — High & Low Performing Emails ═══ */}
      {d.emails.length > 0 && (
        <section className="space-y-5">
          <SectionHeader icon={BarChart2} label="Email Rankings" color="bg-emerald-600" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* High performing */}
            <ChartCard title="High Performing Emails" subtitle="These emails scored well across all deliverability metrics.">
              <div className="space-y-4">
                {highPerf.map((email: any, i: number) => (
                  <div key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">{i + 1}</span>
                    <div className="min-w-0">
                      <EmailNameLink email={{ ...email, brandName: email.brandName || d.brandName }} onClick={openPreview} />
                      <p className="text-[11px] text-muted-foreground">
                        Published {email.publishDate}. Sent to {email.sent.toLocaleString()}.
                      </p>
                      {email.sender && (
                        <p className="text-[11px] text-muted-foreground">Published by: {email.sender}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {email.clickRate}% clicks, {email.openRate}% opens, {email.bounceRate}% hard bounces, {email.unsubscribeRate}% unsubscribes.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>

            {/* Low performing */}
            <ChartCard title="Low Performing Emails" subtitle="These emails scored poorly in at least one deliverability metric.">
              <div className="space-y-4">
                {lowPerf.map((email: any, i: number) => (
                  <div key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-bold text-red-700">{i + 1}</span>
                    <div className="min-w-0">
                      <EmailNameLink email={{ ...email, brandName: email.brandName || d.brandName }} onClick={openPreview} />
                      <p className="text-[11px] text-muted-foreground">
                        Published {email.publishDate}. Sent to {email.sent.toLocaleString()}.
                      </p>
                      {email.sender && (
                        <p className="text-[11px] text-muted-foreground">Published by: {email.sender}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {email.clickRate}% clicks, {email.openRate}% opens, {email.bounceRate}% hard bounces, {email.unsubscribeRate}% unsubscribes.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>
        </section>
      )}

      <AIRecommendations
        tabName="crm_email"
        brandName={brand.name}
        dateRange={`${format(dateFrom, "MMM d, yyyy")} – ${format(dateTo, "MMM d, yyyy")}`}
        metrics={{
          openRate: parseFloat(d.openRate),
          clickRate: parseFloat(d.clickRate),
          bounceRate: parseFloat(d.bounceRate || d.hardBounceRate || "0"),
          unsubscribeRate: parseFloat(d.unsubscribeRate || "0"),
        }}
      />

      <p className="px-1 text-xs text-muted-foreground">
        {d.totalEmails} emails for "{d.brandName}"
        {d.totalFetched != null && ` · ${d.totalFetched} total in account`}
        {d.prevPeriod && ` · Compared to ${d.prevPeriod.start} – ${d.prevPeriod.end}`}
      </p>
    </div>
  );
}
