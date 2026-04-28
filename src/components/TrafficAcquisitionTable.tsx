import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/lib/brands";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrafficAcquisitionTableProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
}

interface ChannelRow {
  channel: string;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  avgSessionDuration: number;
  eventsPerSession: number;
  totalUsers: number;
  newUsers: number;
  returningUsers: number;
  avgEngagementTimePerUser: number;
  engagedSessionsPerUser: number;
}

type SortKey = keyof ChannelRow;

const CHANNEL_COLORS: Record<string, { dot: string; text: string; bg: string }> = {
  "Organic Search":   { dot: "#16a34a", text: "text-emerald-700", bg: "bg-emerald-100" },
  "Direct":           { dot: "#2563eb", text: "text-blue-700",    bg: "bg-blue-100" },
  "Referral":         { dot: "#7c3aed", text: "text-violet-700",  bg: "bg-violet-100" },
  "Email":            { dot: "#ea580c", text: "text-orange-700",  bg: "bg-orange-100" },
  "Unassigned":       { dot: "#94a3b8", text: "text-slate-600",   bg: "bg-slate-100" },
  "Paid Search":      { dot: "#dc2626", text: "text-red-700",     bg: "bg-red-100" },
  "Organic Social":   { dot: "#db2777", text: "text-pink-700",    bg: "bg-pink-100" },
  "Organic Shopping": { dot: "#d97706", text: "text-amber-700",   bg: "bg-amber-100" },
  "Organic Video":    { dot: "#0891b2", text: "text-cyan-700",    bg: "bg-cyan-100" },
  "Paid Other":       { dot: "#c026d3", text: "text-fuchsia-700", bg: "bg-fuchsia-100" },
};
const DEFAULT_COLOR = { dot: "#9ca3af", text: "text-gray-600", bg: "bg-gray-100" };

function getColor(channel: string) {
  return CHANNEL_COLORS[channel] ?? DEFAULT_COLOR;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function pct(value: number, total: number): string {
  if (!total) return "0.00%";
  return ((value / total) * 100).toFixed(2) + "%";
}

function engRateClass(rate: number): string {
  if (rate >= 65) return "bg-emerald-100 text-emerald-700";
  if (rate >= 45) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-600";
}

function SortIcon({ col, sortKey, sortAsc }: { col: SortKey; sortKey: SortKey; sortAsc: boolean }) {
  if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
  return sortAsc
    ? <ArrowUp className="h-3 w-3 opacity-80" />
    : <ArrowDown className="h-3 w-3 opacity-80" />;
}

export function TrafficAcquisitionTable({ brand, dateFrom, dateTo }: TrafficAcquisitionTableProps) {
  const [data, setData] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("sessions");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (!brand.hasGA4 || !brand.ga4PropertyIds?.length) {
      setData([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase.functions
      .invoke("ga4-channel-data", {
        body: {
          propertyIds: brand.ga4PropertyIds,
          startDate: dateFrom.toISOString().split("T")[0],
          endDate: dateTo.toISOString().split("T")[0],
        },
      })
      .then(({ data: result, error: err }) => {
        if (cancelled) return;
        if (err || result?.error) {
          setError(err?.message || result?.error || "Failed to load");
          setData([]);
        } else {
          setData(result?.channels || []);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [brand.id, dateFrom.getTime(), dateTo.getTime()]);

  const sorted = useMemo(
    () =>
      [...data].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (typeof av === "string" && typeof bv === "string")
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
      }),
    [data, sortKey, sortAsc]
  );

  const totals = useMemo(() => {
    if (!data.length) return null;
    const totalSessions = data.reduce((s, r) => s + r.sessions, 0);
    const totalEngaged = data.reduce((s, r) => s + r.engagedSessions, 0);
    const totalEvents = data.reduce((s, r) => s + Math.round(r.sessions * r.eventsPerSession), 0);
    const totalUsers = data.reduce((s, r) => s + r.totalUsers, 0);
    const totalNew = data.reduce((s, r) => s + r.newUsers, 0);
    const len = data.length;
    return {
      sessions: totalSessions,
      engagedSessions: totalEngaged,
      engagementRate: parseFloat((data.reduce((s, r) => s + r.engagementRate, 0) / len).toFixed(1)),
      avgSessionDuration: parseFloat((data.reduce((s, r) => s + r.avgSessionDuration, 0) / len).toFixed(1)),
      eventsPerSession: parseFloat((data.reduce((s, r) => s + r.eventsPerSession, 0) / len).toFixed(2)),
      eventCount: totalEvents,
      totalUsers,
      newUsers: totalNew,
    };
  }, [data]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  if (!brand.hasGA4) return null;

  const totalSessions = totals?.sessions ?? 1;
  const totalEngaged = totals?.engagedSessions ?? 1;
  const totalEvents = totals?.eventCount ?? 1;

  const HeaderCell = ({ col, label, right }: { col: SortKey; label: string; right?: boolean }) => (
    <th
      className={cn(
        "px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/80 cursor-pointer select-none whitespace-nowrap hover:text-primary-foreground transition-colors",
        right ? "text-right" : "text-left"
      )}
      onClick={() => toggleSort(col)}
    >
      <span className={cn("inline-flex items-center gap-1", right && "justify-end w-full")}>
        {label}
        <SortIcon col={col} sortKey={sortKey} sortAsc={sortAsc} />
      </span>
    </th>
  );

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/30">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Traffic Acquisition</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Session primary channel group</p>
        </div>
        {totals && (
          <div className="flex items-center gap-4 text-right">
            <div>
              <div className="text-xs text-muted-foreground">Total Sessions</div>
              <div className="text-sm font-bold tabular-nums">{totals.sessions.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Users</div>
              <div className="text-sm font-bold tabular-nums">{totals.totalUsers.toLocaleString()}</div>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : error ? (
        <div className="px-5 py-6 space-y-1">
          <p className="text-sm font-medium text-destructive">Channel data unavailable</p>
          <p className="text-xs text-muted-foreground">
            {error.toLowerCase().includes("failed to send") || error.toLowerCase().includes("fetch")
              ? "The ga4-channel-data Edge Function could not be reached. Redeploy it via: supabase functions deploy ga4-channel-data"
              : error}
          </p>
        </div>
      ) : data.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">No data available for {brand.name}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-table-header">
                <HeaderCell col="channel" label="Channel Group" />
                <HeaderCell col="sessions" label="Sessions" right />
                <HeaderCell col="engagedSessions" label="Engaged Sessions" right />
                <HeaderCell col="engagementRate" label="Eng. Rate" right />
                <HeaderCell col="avgSessionDuration" label="Avg. Time" right />
                <HeaderCell col="eventsPerSession" label="Events / Session" right />
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/80 text-right whitespace-nowrap">
                  Event Count
                </th>
                <HeaderCell col="newUsers" label="New Users" right />
                <HeaderCell col="returningUsers" label="Returning" right />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((row, idx) => {
                const color = getColor(row.channel);
                const eventCount = Math.round(row.sessions * row.eventsPerSession);
                const sessionPct = totalSessions > 0 ? (row.sessions / totalSessions) * 100 : 0;
                const engagedPct = totalEngaged > 0 ? (row.engagedSessions / totalEngaged) * 100 : 0;
                const eventPct = totalEvents > 0 ? (eventCount / totalEvents) * 100 : 0;
                return (
                  <tr
                    key={row.channel}
                    className={cn(
                      "group hover:bg-muted/40 transition-colors",
                      idx % 2 === 0 ? "bg-card" : "bg-muted/10"
                    )}
                  >
                    {/* Channel badge */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color.dot }} />
                        <span className="font-medium text-foreground whitespace-nowrap">{row.channel}</span>
                      </div>
                    </td>

                    {/* Sessions + bar */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-semibold tabular-nums">{row.sessions.toLocaleString()}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${sessionPct}%`, backgroundColor: color.dot }}
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right">
                            {sessionPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Engaged sessions + bar */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="tabular-nums">{row.engagedSessions.toLocaleString()}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${engagedPct}%`, backgroundColor: color.dot, opacity: 0.7 }}
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right">
                            {engagedPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Engagement rate — color coded */}
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums min-w-[52px]",
                        engRateClass(row.engagementRate)
                      )}>
                        {row.engagementRate.toFixed(1)}%
                      </span>
                    </td>

                    {/* Avg session duration */}
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {formatDuration(row.avgSessionDuration)}
                    </td>

                    {/* Events per session */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.eventsPerSession.toFixed(2)}
                    </td>

                    {/* Event count + bar */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="tabular-nums">{eventCount.toLocaleString()}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${eventPct}%`, backgroundColor: color.dot, opacity: 0.6 }}
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right">
                            {eventPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* New users */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.newUsers.toLocaleString()}
                    </td>

                    {/* Returning users */}
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {row.returningUsers.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Totals footer */}
            {totals && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                  <td className="px-4 py-3 text-sm">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm">
                    {totals.sessions.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm">
                    {totals.engagedSessions.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      "inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold min-w-[52px]",
                      engRateClass(totals.engagementRate)
                    )}>
                      {totals.engagementRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-muted-foreground">
                    {formatDuration(totals.avgSessionDuration)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm">
                    {totals.eventsPerSession.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm">
                    {totals.eventCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm">
                    {totals.newUsers.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-muted-foreground">
                    {(totals.sessions - totals.newUsers).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}
