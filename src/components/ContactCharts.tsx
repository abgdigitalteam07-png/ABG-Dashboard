import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/lib/brands";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format, parseISO, startOfWeek, startOfMonth, startOfDay, addDays, addWeeks, addMonths, isBefore, isEqual } from "date-fns";

interface ContactChartsProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
}

type TimeInterval = "daily" | "weekly" | "monthly";

interface DayData {
  date: string;
  total: number;
  hubspot: number;
  salesforce: number;
}

interface JobTitle {
  title: string;
  count: number;
}

export function ContactCharts({ brand, dateFrom, dateTo }: ContactChartsProps) {
  const [contactsOverTime, setContactsOverTime] = useState<DayData[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<TimeInterval>("weekly");

  useEffect(() => {
    if (!brand.hasHubSpot) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase.functions
      .invoke("hubspot-contacts", {
        body: {
          brandName: brand.name,
          startDate: dateFrom.toISOString().split("T")[0],
          endDate: dateTo.toISOString().split("T")[0],
        },
      })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || data?.error) {
          setError(err?.message || data?.error || "Failed to load");
        } else {
          setContactsOverTime(data?.contactsOverTime || []);
          setJobTitles(data?.jobTitles || []);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [brand.id, dateFrom.getTime(), dateTo.getTime()]);

  // Aggregate by interval
  const aggregatedContacts = useMemo(() => {
    if (!contactsOverTime.length) return [];

    const buckets: Record<string, { total: number; hubspot: number; salesforce: number }> = {};
    for (const day of contactsOverTime) {
      const date = parseISO(day.date);
      let key: string;
      if (interval === "daily") key = format(startOfDay(date), "yyyy-MM-dd");
      else if (interval === "weekly") key = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
      else key = format(startOfMonth(date), "yyyy-MM");

      if (!buckets[key]) buckets[key] = { total: 0, hubspot: 0, salesforce: 0 };
      buckets[key].total += day.total;
      buckets[key].hubspot += day.hubspot;
      buckets[key].salesforce += day.salesforce;
    }

    // Fill in missing slots
    const slots: string[] = [];
    let cursor = interval === "daily"
      ? startOfDay(dateFrom)
      : interval === "weekly"
        ? startOfWeek(dateFrom, { weekStartsOn: 1 })
        : startOfMonth(dateFrom);
    const advance = interval === "daily" ? addDays : interval === "weekly" ? addWeeks : addMonths;
    const fmtStr = interval === "monthly" ? "yyyy-MM" : "yyyy-MM-dd";
    while (isBefore(cursor, dateTo) || isEqual(cursor, dateTo)) {
      slots.push(format(cursor, fmtStr));
      cursor = advance(cursor, 1);
    }

    return slots.map((date) => ({
      date,
      ...(buckets[date] || { total: 0, hubspot: 0, salesforce: 0 }),
    }));
  }, [contactsOverTime, interval, dateFrom, dateTo]);

  const intervals: { value: TimeInterval; label: string }[] = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  if (!brand.hasHubSpot) return null;

  return (
    <>
      {/* ── Separator ── */}
      <div className="border-t border-border" />

      {/* ── New Contacts Over Time ── */}
      <section className="rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            New Contacts Created Over Time
          </h3>
          <div className="flex rounded-md border border-border bg-muted/40 text-[11px]">
            {intervals.map((iv) => (
              <button
                key={iv.value}
                onClick={() => setInterval(iv.value)}
                className={cn(
                  "px-2.5 py-1 transition-colors first:rounded-l-md last:rounded-r-md",
                  interval === iv.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {iv.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-[280px] w-full" />
          </div>
        ) : error ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{error}</p>
        ) : aggregatedContacts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No data available for {brand.name}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={aggregatedContacts}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => { try { return format(parseISO(v), "M/d"); } catch { return v; } }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="total"
                name="New Contacts"
                stroke="hsl(var(--brand-blue))"
                fill="hsl(var(--brand-blue))"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* ── Source Breakdown ── */}
      <section className="rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Contacts Source Breakdown
          </h3>
        </div>

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
            <BarChart data={aggregatedContacts}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => { try { return format(parseISO(v), "M/d"); } catch { return v; } }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="hubspot" name="HubSpot" stackId="source" fill="#F97316" radius={[0, 0, 0, 0]} />
              <Bar dataKey="salesforce" name="Salesforce" stackId="source" fill="#374151" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* ── Job Title Distribution ── */}
      <section className="rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Contact Distribution by Job Title
          </h3>
        </div>

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
            <BarChart data={jobTitles} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="title"
                tick={{ fontSize: 11 }}
                width={180}
              />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="count" name="Contacts" fill="hsl(var(--brand-blue))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>
    </>
  );
}
