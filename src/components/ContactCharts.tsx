import { useState, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { Brand } from "@/lib/brands";
import { USStateMap } from "@/components/USStateMap";
import {
  format, parseISO, startOfWeek, startOfMonth, startOfDay, startOfQuarter,
  addDays, addWeeks, addMonths, isBefore, isEqual,
} from "date-fns";

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
  } | null;
  loading?: boolean;
  error?: string | null;
  externalStateDistribution?: { state: string; count: number }[];
  externalUnknownStateCount?: number;
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

/* ── Chart card wrapper ── */
function ChartCard({ title, subtitle, children, headerRight }: {
  title: string; subtitle?: string; children: React.ReactNode; headerRight?: React.ReactNode;
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
}: ContactChartsProps) {
  const [granularity, setGranularity] = useState<Granularity>("week");
  const contactsOverTime = data?.contactsOverTime || [];
  const totalContacts = data?.totalContacts || 0;
  const totalContactsAllTime = data?.totalContactsAllTime || 0;
  const jobTitles = data?.jobTitles || [];
  const stateDistribution = data?.contactStateDistribution || [];

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
    let cursor = granularity === "day"
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
    try { return format(parseISO(v), granularity === "month" ? "MMM yy" : "M/d"); } catch { return v; }
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
          <p className="py-12 text-center text-sm text-muted-foreground">
            No data available for {brand.name}
          </p>
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
              <XAxis dataKey="date" tick={axisStyle} tickFormatter={xTickFormatter}
                interval="preserveStartEnd" tickLine={false} axisLine={false} />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="total"
                name="New Contacts"
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
      <ChartCard title="Contacts Source Breakdown" subtitle="HubSpot vs Salesforce origin vs Import">
        {loading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : error ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{error}</p>
        ) : aggregatedContacts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No data available for {brand.name}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={aggregatedContacts} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="date" tick={axisStyle} tickFormatter={xTickFormatter}
                interval="preserveStartEnd" tickLine={false} axisLine={false} />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="hubspot" name="HubSpot" stackId="source" fill="#F97316" radius={[0, 0, 0, 0]} />
              <Bar dataKey="salesforce" name="Salesforce" stackId="source" fill="#374151" radius={[0, 0, 0, 0]} />
              <Bar dataKey="import" name="Import" stackId="source" fill="#6366F1" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── State Map ── */}
      {!loading && !error && (
        <USStateMap
          stateDistribution={
            externalStateDistribution && externalStateDistribution.length > 0
              ? externalStateDistribution
              : stateDistribution.length > 0
                ? stateDistribution
                : totalContacts > 0
                  ? [{ state: "UNKNOWN", count: totalContacts }]
                  : []
          }
        />
      )}

      {/* ── Job Title Distribution ── */}
      <ChartCard title="Contact Distribution by Job Title" subtitle="Top job titles in your contact database">
        {loading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : error ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{error}</p>
        ) : jobTitles.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No data available for {brand.name}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, jobTitles.length * 28)}>
            <BarChart data={jobTitles} layout="vertical" margin={{ left: 20, right: 16, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
              <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="title" tick={axisStyle} width={180} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Contacts" fill="#3B82F6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </>
  );
}
