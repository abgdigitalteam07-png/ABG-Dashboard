import { useState, useMemo } from "react";
import { BarChart2, Sparkles, Bath, Ruler, PenTool, Mail, MapPin, Hash, TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { Brand } from "@/lib/brands";
import { USStateMap } from "@/components/USStateMap";
import { cn } from "@/lib/utils";
import { DealerGapMap } from "@/components/DealerGapMap";
import {
  format,
  parseISO,
  startOfWeek,
  startOfMonth,
  startOfDay,
  startOfQuarter,
  addDays,
  addWeeks,
  addMonths,
  isBefore,
  isEqual,
} from "date-fns";

interface DealerRow {
  email: string;
  name:  string;
  state: string;
  zip:   string;
  count: number;
}

interface ContactChartsProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
  data?: {
    totalContacts?: number;
    totalContactsAllTime?: number;
    contactsOverTime?: DayData[];
    jobTitles?: JobTitle[];
    contactStateDistribution?: { state: string; count: number }[];
    contactIndustryDistribution?: { industry: string; count: number }[];
    dealerBreakdown?: DealerRow[];
  } | null;
  loading?: boolean;
  error?: string | null;
  externalStateDistribution?: { state: string; count: number }[];
  externalUnknownStateCount?: number;
  dealerWithDealDistribution?: { state: string; count: number }[];
  dealerWithoutDealDistribution?: { state: string; count: number }[];
  hideSourceBreakdown?: boolean;
  useLeadLabel?: boolean;
  overrideAssignedTotal?: number;
  overrideUnassignedTotal?: number;
  overrideTimeSeries?: Record<string, number>;
}

type Granularity = "day" | "week" | "month" | "quarter";

interface DayData {
  date: string;
  total: number;
  hubspot: number;
  salesforce: number;
  import: number;
}

interface JobTitle {
  title: string;
  count: number;
}

interface GroupedTitle {
  group: string;
  count: number;
  breakdown: { title: string; count: number }[];
}

/* ── Job title grouping rules — ordered by priority, first match wins ── */
const TITLE_GROUPS: { label: string; patterns: RegExp[] }[] = [
  {
    label: "Executive / Owner",
    patterns: [
      /\bceo\b/,
      /\bcoo\b/,
      /\bcfo\b/,
      /\bpresident\b/,
      /\bvice[\s-]pres/,
      /\bvp\b/,
      /\bowner\b/,
      /\bfounder\b/,
      /\bchief\b/,
    ],
  },
  { label: "Sales", patterns: [/\bsales\b/] },
  { label: "Marketing", patterns: [/\bmarket/] },
  { label: "Engineering", patterns: [/\bengineer/] },
  { label: "Manufacturing", patterns: [/\bmanufactur/] },
  { label: "Production", patterns: [/\bproduction\b/] },
  { label: "Quality", patterns: [/\bquality\b/, /\b(qa|qc)\b/] },
  { label: "Operations", patterns: [/\boperation/] },
  { label: "Purchasing", patterns: [/\bpurchas/, /\bprocure/, /\bbuyer\b/, /\bbuying\b/] },
  { label: "Warehouse / Logistics", patterns: [/\bwarehouse\b/, /\bdistribut/, /\blogistic/, /\bshipping\b/] },
  { label: "Customer Service", patterns: [/\bcustomer[\s-]serv/, /\bcustomer[\s-]supp/, /\bclient\s+serv/] },
  { label: "Finance / Accounting", patterns: [/\bfinance\b/, /\bfinancial\b/, /\baccounti/, /\baccountant\b/] },
  { label: "Human Resources", patterns: [/\bhuman[\s-]resour/, /\brecruiter\b/, /\brecruiting\b/, /\btalent\b/] },
  { label: "IT / Technology", patterns: [/\binformation[\s-]tech/, /\btechnology\b/, /\bsoftware\b/, /\bsystems\b/] },
  { label: "Design", patterns: [/\bdesign/] },
  { label: "Director", patterns: [/\bdirector\b/] },
  { label: "Manager", patterns: [/\bmanag/, /\bmgr\b/] },
  { label: "Admin / Coordinator", patterns: [/\badmin/, /\bassistant\b/, /\bcoordinator\b/] },
  { label: "Contractor", patterns: [/\bcontract/] },
];

function groupJobTitles(jobTitles: JobTitle[]): GroupedTitle[] {
  const groups: Record<string, { count: number; breakdown: { title: string; count: number }[] }> = {};

  for (const jt of jobTitles) {
    const normalized = jt.title.toLowerCase().trim();
    const isBlank = normalized === "not specified" || normalized === "";

    if (isBlank) {
      const key = "Not Specified";
      if (!groups[key]) groups[key] = { count: 0, breakdown: [] };
      groups[key].count += jt.count;
      groups[key].breakdown.push(jt);
      continue;
    }

    let matched = false;
    for (const rule of TITLE_GROUPS) {
      if (rule.patterns.some((p) => p.test(normalized))) {
        if (!groups[rule.label]) groups[rule.label] = { count: 0, breakdown: [] };
        groups[rule.label].count += jt.count;
        groups[rule.label].breakdown.push(jt);
        matched = true;
        break;
      }
    }

    if (!matched) {
      const key = "Other";
      if (!groups[key]) groups[key] = { count: 0, breakdown: [] };
      groups[key].count += jt.count;
      groups[key].breakdown.push(jt);
    }
  }

  return Object.entries(groups)
    .map(([group, { count, breakdown }]) => ({
      group,
      count,
      breakdown: breakdown.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.count - a.count);
}

/* ── Skeleton pulse ── */
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

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
            value === o.value ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Chart card wrapper ── */
function ChartCard({
  title,
  subtitle,
  children,
  headerRight,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
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
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-foreground font-medium">{(p.value || 0).toLocaleString()}</span>
          <span className="text-muted-foreground">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Job title breakdown tooltip ── */
function JobTitleTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as GroupedTitle;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-lg text-xs max-w-[280px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: "#3B82F6" }} />
        <p className="font-semibold text-foreground">
          {d.group} <span className="text-muted-foreground font-normal">— {d.count.toLocaleString()} contacts</span>
        </p>
      </div>
      {d.breakdown.length > 1 && (
        <div className="space-y-1 border-t border-border pt-1.5 mt-1">
          {d.breakdown.slice(0, 8).map((b) => (
            <div key={b.title} className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground truncate">{b.title}</span>
              <span className="text-foreground font-medium shrink-0">{b.count.toLocaleString()}</span>
            </div>
          ))}
          {d.breakdown.length > 8 && (
            <p className="text-muted-foreground italic mt-1">+{d.breakdown.length - 8} more titles</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Quarter key helper ── */
function quarterKey(date: Date): string {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `Q${q} ${date.getFullYear()}`;
}

export function ContactCharts({
  brand,
  dateFrom,
  dateTo,
  data,
  loading = false,
  error = null,
  externalStateDistribution,
  externalUnknownStateCount,
  dealerWithDealDistribution,
  dealerWithoutDealDistribution,
  hideSourceBreakdown = false,
  useLeadLabel = false,
  overrideAssignedTotal,
  overrideUnassignedTotal,
  overrideTimeSeries,
}: ContactChartsProps) {
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [dealerSearch, setDealerSearch] = useState("");
  const [dealerPage,   setDealerPage]   = useState(0);
  const DEALER_PAGE_SIZE = 10;
  const contactsOverTime = overrideTimeSeries
    ? Object.entries(overrideTimeSeries).map(([date, total]) => ({ date, total, hubspot: total, salesforce: 0, import: 0 }))
    : data?.contactsOverTime || [];
  const totalContacts = data?.totalContacts || 0;
  const totalContactsAllTime = data?.totalContactsAllTime || 0;
  const jobTitles = data?.jobTitles || [];
  const stateDistribution = data?.contactStateDistribution || [];
  const groupedTitles = useMemo(() => groupJobTitles(jobTitles), [jobTitles]);
  const industryData = data?.contactIndustryDistribution || [];
  const dealerBreakdown: DealerRow[] = data?.dealerBreakdown || [];
  const dealerAssignedTotal: number = (data as any)?.dealerAssignedTotal ?? 0;
  // If backend hasn't been deployed yet with dealerBreakdown, we can detect it:
  // dealerAssignedTotal > 0 but dealerBreakdown is undefined means old function version
  const dealerBreakdownPending = dealerAssignedTotal > 0 && !data?.dealerBreakdown;
  const filteredDealers = useMemo(() => {
    setDealerPage(0); // reset page on search change
    return dealerSearch.trim()
      ? dealerBreakdown.filter(d =>
          d.email.toLowerCase().includes(dealerSearch.toLowerCase()) ||
          d.name.toLowerCase().includes(dealerSearch.toLowerCase()) ||
          d.state.toLowerCase().includes(dealerSearch.toLowerCase()),
        )
      : dealerBreakdown;
  }, [dealerBreakdown, dealerSearch]);

  const totalDealerPages = Math.ceil(filteredDealers.length / DEALER_PAGE_SIZE);
  const pagedDealers = filteredDealers.slice(
    dealerPage * DEALER_PAGE_SIZE,
    (dealerPage + 1) * DEALER_PAGE_SIZE,
  );

  // Aggregate by granularity
  const aggregatedContacts = useMemo(() => {
    if (!contactsOverTime.length) return [];

    const buckets: Record<string, { total: number; hubspot: number; salesforce: number; import: number }> = {};

    for (const day of contactsOverTime) {
      const date = parseISO(day.date);
      let key: string;
      if (granularity === "day") key = format(startOfDay(date), "yyyy-MM-dd");
      else if (granularity === "week") key = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
      else if (granularity === "month") key = format(startOfMonth(date), "yyyy-MM");
      else key = quarterKey(startOfQuarter(date));

      if (!buckets[key]) buckets[key] = { total: 0, hubspot: 0, salesforce: 0, import: 0 };
      buckets[key].total += day.total;
      buckets[key].hubspot += day.hubspot;
      buckets[key].salesforce += day.salesforce;
      buckets[key].import += day.import || 0;
    }

    if (granularity === "quarter") {
      return Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v }));
    }

    // Fill in missing slots for non-quarter granularities
    const slots: string[] = [];
    let cursor =
      granularity === "day"
        ? startOfDay(dateFrom)
        : granularity === "week"
          ? startOfWeek(dateFrom, { weekStartsOn: 1 })
          : startOfMonth(dateFrom);
    const advance = granularity === "day" ? addDays : granularity === "week" ? addWeeks : addMonths;
    const fmtStr = granularity === "month" ? "yyyy-MM" : "yyyy-MM-dd";
    while (isBefore(cursor, dateTo) || isEqual(cursor, dateTo)) {
      slots.push(format(cursor, fmtStr));
      cursor = advance(cursor, 1);
    }

    return slots.map((date) => ({
      date,
      ...(buckets[date] || { total: 0, hubspot: 0, salesforce: 0, import: 0 }),
    }));
  }, [contactsOverTime, granularity, dateFrom, dateTo]);

  const axisStyle = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };
  const gridColor = "hsl(var(--border))";

  const xTickFormatter = (v: string) => {
    if (granularity === "quarter") return v;
    try {
      return format(parseISO(v), granularity === "month" ? "MMM yy" : "M/d");
    } catch {
      return v;
    }
  };

  if (!brand.hasHubSpot) return null;

  return (
    <>
      {/* ── New Contacts Over Time ── */}
      <ChartCard
        title="New Contacts Created Over Time"
        subtitle="Contact acquisition trend by time period"
        headerRight={<GranularityToggle value={granularity} onChange={setGranularity} />}
      >
        {loading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : error ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{error}</p>
        ) : aggregatedContacts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No data available for {brand.name}</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={aggregatedContacts} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gContacts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis
                dataKey="date"
                tick={axisStyle}
                tickFormatter={xTickFormatter}
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="total"
                name={useLeadLabel ? "New Leads" : "New Contacts"}
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#gContacts)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: "#3B82F6" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── Source Breakdown ── */}
      {!hideSourceBreakdown && <ChartCard title="Contacts Source Breakdown" subtitle="HubSpot vs Salesforce origin vs Import">
        {loading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : error ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{error}</p>
        ) : aggregatedContacts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No data available for {brand.name}</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={aggregatedContacts} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis
                dataKey="date"
                tick={axisStyle}
                tickFormatter={xTickFormatter}
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="hubspot" name="HubSpot" stackId="source" fill="#F97316" radius={[0, 0, 0, 0]} />
              <Bar dataKey="salesforce" name="Salesforce" stackId="source" fill="#374151" radius={[0, 0, 0, 0]} />
              <Bar dataKey="import" name="Import" stackId="source" fill="#6366F1" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>}

      {/* ── State Map ── */}
      {!loading && !error && (
        <USStateMap
          stateDistribution={
            externalStateDistribution && externalStateDistribution.length > 0
              ? externalStateDistribution
              : stateDistribution
          }
          unknownCount={externalUnknownStateCount ?? 0}
          hideStatSummary={hideSourceBreakdown}
        />
      )}

      {/* ── Dealer Gap Map — secondary brands only ── */}
      {brand.hubspotAccount === "secondary" && !loading && !error && (
        <DealerGapMap
          dealerWithDealDistribution={dealerWithDealDistribution}
          dealerWithoutDealDistribution={dealerWithoutDealDistribution}
          dealerAssignedTotal={overrideAssignedTotal}
          dealerUnassignedTotal={overrideUnassignedTotal}
        />
      )}

      {/* ── Contact Distribution by Channel — Coming Soon (hidden for secondary brands) ── */}
      {brand.hubspotAccount !== "secondary" && <ChartCard
        title="Contact Distribution by Channel"
        subtitle="Account type breakdown for contacts in the selected period"
      >
        <div className="relative flex flex-col items-center justify-center py-20 text-center overflow-hidden">
          {/* Blueprint grid background */}
          <div className="absolute inset-0 rounded-xl" style={{
            backgroundImage: `
              linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px)
            `,
            backgroundSize: '24px 24px',
          }} />
          {/* Blueprint border accent */}
          <div className="absolute inset-3 rounded-lg border border-dashed border-blue-200/40 dark:border-blue-700/25" />
          <div className="absolute inset-5 rounded-md border border-dashed border-blue-200/20 dark:border-blue-700/15" />

          {/* Corner markers */}
          {['top-3 left-3','top-3 right-3','bottom-3 left-3','bottom-3 right-3'].map((pos) => (
            <div key={pos} className={`absolute ${pos} h-3 w-3 border-blue-300/50 dark:border-blue-600/40 ${
              pos.includes('top') && pos.includes('left') ? 'border-t-2 border-l-2 rounded-tl-sm' :
              pos.includes('top') && pos.includes('right') ? 'border-t-2 border-r-2 rounded-tr-sm' :
              pos.includes('bottom') && pos.includes('left') ? 'border-b-2 border-l-2 rounded-bl-sm' :
              'border-b-2 border-r-2 rounded-br-sm'
            }`} />
          ))}

          {/* Dimension lines (decorative) */}
          <div className="absolute top-8 left-12 right-12 flex items-center gap-1 opacity-20">
            <div className="h-px flex-1 bg-blue-400 dark:bg-blue-500" />
            <Ruler className="h-3 w-3 text-blue-400 dark:text-blue-500" />
            <div className="h-px flex-1 bg-blue-400 dark:bg-blue-500" />
          </div>

          {/* Bathtub icon */}
          <div className="relative mb-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white dark:bg-slate-800 border-2 border-blue-200/60 dark:border-blue-700/40 shadow-sm">
              <Bath className="h-8 w-8 text-blue-500 dark:text-blue-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-700">
              <PenTool className="h-2.5 w-2.5 text-blue-400" />
            </div>
          </div>

          {/* Text */}
          <p className="relative text-base font-bold text-foreground tracking-tight font-mono">COMING SOON</p>
          <p className="relative mt-1 text-[10px] font-mono text-blue-400/60 dark:text-blue-500/50 tracking-widest uppercase">Rev 1.0 — In Progress</p>
          <p className="relative mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
            Channel distribution analytics for bath &amp; shower contacts — currently on the drawing board.
          </p>

          {/* Status badge */}
          <div className="relative mt-5 flex items-center gap-2 rounded border border-blue-200/50 dark:border-blue-700/30 bg-white/60 dark:bg-slate-800/60 px-3 py-1.5 font-mono">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[10px] font-medium text-blue-500 dark:text-blue-400 tracking-wide">DRAFTING</span>
          </div>
        </div>
      </ChartCard>}

      {/* ── Assigned Dealer Details — secondary brands only ── */}
      {hideSourceBreakdown && <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-border bg-muted/20">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#3B82F6]" />
              Assigned Dealer Details
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Dealers who received leads in this period — sorted by volume
            </p>
          </div>
          {dealerBreakdown.length > 0 && (
            <div className="flex items-center gap-3 shrink-0">
              <div className="rounded-xl bg-[#3B82F6]/10 px-3 py-1.5 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#3B82F6]">Dealers</p>
                <p className="text-lg font-black tabular-nums text-[#3B82F6]">{dealerBreakdown.length}</p>
              </div>
              <div className="rounded-xl bg-emerald-500/10 px-3 py-1.5 text-center">
                <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Assigned Leads</p>
                <p className="text-lg font-black tabular-nums text-emerald-600">
                  {dealerBreakdown.reduce((s, d) => s + d.count, 0).toLocaleString()}
                </p>
              </div>
              {/* Search */}
              <input
                type="text"
                placeholder="Search dealer…"
                value={dealerSearch}
                onChange={e => setDealerSearch(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/40 w-40"
              />
            </div>
          )}
        </div>

        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : error ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{error}</p>
        ) : dealerBreakdownPending ? (
          <div className="py-12 flex flex-col items-center gap-3 text-center px-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <Mail className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {dealerAssignedTotal.toLocaleString()} assigned dealer leads found
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Dealer details require a one-time function deployment. Run this in your terminal:
            </p>
            <code className="rounded-lg bg-muted px-4 py-2 text-xs font-mono text-foreground select-all">
              npx supabase functions deploy hubspot-data --project-ref ffxhonryhaadyudpopvv
            </code>
          </div>
        ) : dealerBreakdown.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No assigned dealers for {brand.name} in this period</p>
        ) : (
          <div className="flex flex-col lg:flex-row gap-0">
            {/* ── Left: table ─────────────────────────────────────────── */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground w-6">#</th>
                    <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Mail className="h-3 w-3" />Dealer Email</span>
                    </th>
                    <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground hidden sm:table-cell">
                      <span className="flex items-center gap-1.5"><Hash className="h-3 w-3" />Name</span>
                    </th>
                    <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground hidden md:table-cell">
                      <span className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />State</span>
                    </th>
                    <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground hidden md:table-cell">ZIP</th>
                    <th className="px-4 py-3 text-right font-bold text-[10px] uppercase tracking-widest text-muted-foreground">
                      <span className="flex items-center justify-end gap-1.5"><TrendingUp className="h-3 w-3" />Leads</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedDealers.map((dealer, idx) => {
                    const maxCount = dealerBreakdown[0]?.count || 1;
                    const pct = Math.round((dealer.count / maxCount) * 100);
                    const rank = dealerPage * DEALER_PAGE_SIZE + idx + 1;
                    return (
                      <tr key={dealer.email}
                        className={`border-b border-border/50 transition-colors hover:bg-muted/20 ${idx % 2 === 0 ? "bg-background" : "bg-muted/10"}`}>
                        <td className="px-4 py-3 text-muted-foreground/50 font-mono font-bold text-[10px]">
                          {rank <= 3 ? (
                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white ${rank === 1 ? "bg-amber-400" : rank === 2 ? "bg-slate-400" : "bg-orange-400"}`}>
                              {rank}
                            </span>
                          ) : rank}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[11px] text-foreground truncate max-w-[200px] block">
                            {dealer.email || <span className="text-muted-foreground/40 italic">—</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground font-medium truncate max-w-[160px]">
                          {dealer.name || <span className="italic text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {dealer.state ? (
                            <span className="inline-flex items-center rounded-md bg-[#3B82F6]/10 px-2 py-0.5 text-[10px] font-bold text-[#3B82F6]">
                              {dealer.state}
                            </span>
                          ) : <span className="text-muted-foreground/40 italic text-[10px]">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-muted-foreground font-mono text-[10px]">
                          {dealer.zip || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-black tabular-nums text-foreground text-sm">{dealer.count.toLocaleString()}</span>
                            <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-[#3B82F6]" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredDealers.length === 0 && dealerSearch && (
                <p className="py-8 text-center text-xs text-muted-foreground">No dealers matching "{dealerSearch}"</p>
              )}
              {/* Pagination */}
              {totalDealerPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                  <p className="text-[11px] text-muted-foreground">
                    Showing {dealerPage * DEALER_PAGE_SIZE + 1}–{Math.min((dealerPage + 1) * DEALER_PAGE_SIZE, filteredDealers.length)} of {filteredDealers.length} dealers
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setDealerPage(p => Math.max(0, p - 1))}
                      disabled={dealerPage === 0}
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted cursor-pointer transition-colors">
                      ← Prev
                    </button>
                    {Array.from({ length: totalDealerPages }, (_, i) => (
                      <button key={i}
                        onClick={() => setDealerPage(i)}
                        className={cn(
                          "rounded-lg border px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors",
                          dealerPage === i
                            ? "bg-[#3B82F6] border-[#3B82F6] text-white"
                            : "border-border bg-background text-muted-foreground hover:bg-muted",
                        )}>
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setDealerPage(p => Math.min(totalDealerPages - 1, p + 1))}
                      disabled={dealerPage === totalDealerPages - 1}
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted cursor-pointer transition-colors">
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Right: Top 10 bar chart ──────────────────────────────── */}
            {dealerBreakdown.length >= 3 && (
              <div className="lg:w-[340px] shrink-0 border-t lg:border-t-0 lg:border-l border-border p-4 flex flex-col gap-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">
                  Top 10 Dealers by Lead Volume
                </p>
                <ResponsiveContainer width="100%" height={Math.min(dealerBreakdown.slice(0, 10).length * 36, 360)}>
                  <BarChart
                    data={dealerBreakdown.slice(0, 10).map(d => ({
                      name: d.name || d.email.split("@")[0],
                      count: d.count,
                      state: d.state,
                    }))}
                    layout="vertical"
                    margin={{ left: 0, right: 36, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                    <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", textAnchor: "end" }}
                      width={140}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => v.length > 20 ? v.slice(0, 19) + "…" : v}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted)/0.4)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        return (
                          <div className="rounded-xl border border-border bg-card shadow-xl px-3 py-2.5 text-xs space-y-1">
                            <p className="font-bold text-foreground">{d?.name}</p>
                            {d?.state && <p className="text-muted-foreground">State: <span className="font-semibold text-foreground">{d.state}</span></p>}
                            <p className="text-muted-foreground">Leads: <span className="font-black text-[#3B82F6]">{payload[0]?.value?.toLocaleString()}</span></p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                      {dealerBreakdown.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={
                          i === 0 ? "#3B82F6" :
                          i === 1 ? "#60A5FA" :
                          i === 2 ? "#93C5FD" :
                          "hsl(var(--muted-foreground)/0.25)"
                        } />
                      ))}
                      <LabelList
                        dataKey="count"
                        position="right"
                        style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontVariantNumeric: "tabular-nums" }}
                        formatter={(v: number) => v.toLocaleString()}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>}
    </>
  );
}
