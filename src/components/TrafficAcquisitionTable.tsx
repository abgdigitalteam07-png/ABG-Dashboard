import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/lib/brands";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown } from "lucide-react";

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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
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

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [data, sortKey, sortAsc]);

  const totals = useMemo(() => {
    if (!data.length) return null;
    const len = data.length;
    return {
      sessions: data.reduce((s, r) => s + r.sessions, 0),
      engagedSessions: data.reduce((s, r) => s + r.engagedSessions, 0),
      engagementRate: parseFloat((data.reduce((s, r) => s + r.engagementRate, 0) / len).toFixed(1)),
      avgSessionDuration: parseFloat((data.reduce((s, r) => s + r.avgSessionDuration, 0) / len).toFixed(1)),
      eventsPerSession: parseFloat((data.reduce((s, r) => s + r.eventsPerSession, 0) / len).toFixed(2)),
      totalUsers: data.reduce((s, r) => s + r.totalUsers, 0),
      newUsers: data.reduce((s, r) => s + r.newUsers, 0),
      returningUsers: data.reduce((s, r) => s + r.returningUsers, 0),
      avgEngagementTimePerUser: parseFloat((data.reduce((s, r) => s + r.avgEngagementTimePerUser, 0) / len).toFixed(1)),
      engagedSessionsPerUser: parseFloat((data.reduce((s, r) => s + r.engagedSessionsPerUser, 0) / len).toFixed(2)),
    };
  }, [data]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  if (!brand.hasGA4) return null;

  const columns: { key: SortKey; label: string; align?: "right" }[] = [
    { key: "channel", label: "Channel Group" },
    { key: "sessions", label: "Sessions", align: "right" },
    { key: "engagedSessions", label: "Engaged Sessions", align: "right" },
    { key: "engagementRate", label: "Engagement Rate", align: "right" },
    { key: "avgSessionDuration", label: "Avg Engagement Time", align: "right" },
    { key: "eventsPerSession", label: "Events/Session", align: "right" },
    { key: "totalUsers", label: "Total Users", align: "right" },
    { key: "newUsers", label: "New Users", align: "right" },
    { key: "returningUsers", label: "Returning Users", align: "right" },
    { key: "avgEngagementTimePerUser", label: "Avg Time/User", align: "right" },
    { key: "engagedSessionsPerUser", label: "Engaged Sess./User", align: "right" },
  ];

  return (
    <section className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
      <div className="p-6 pb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Traffic Acquisition by Channel Group
        </h3>
      </div>

      {loading ? (
        <div className="space-y-2 p-6 pt-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">{error}</p>
      ) : data.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">
          No data available for {brand.name}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-table-header">
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={`text-xs text-primary-foreground cursor-pointer select-none hover:bg-primary/80 ${col.align === "right" ? "text-right" : ""}`}
                    onClick={() => toggleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.channel} className="hover:bg-muted/60">
                  <TableCell className="text-sm font-medium">{row.channel}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.sessions.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.engagedSessions.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.engagementRate}%</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{formatDuration(row.avgSessionDuration)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.eventsPerSession}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.totalUsers.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.newUsers.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.returningUsers.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{formatDuration(row.avgEngagementTimePerUser)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.engagedSessionsPerUser}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {totals && (
              <TableFooter>
                <TableRow className="bg-muted/80 font-semibold sticky bottom-0">
                  <TableCell className="text-sm">Total</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{totals.sessions.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{totals.engagedSessions.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{totals.engagementRate}%</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{formatDuration(totals.avgSessionDuration)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{totals.eventsPerSession}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{totals.totalUsers.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{totals.newUsers.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{totals.returningUsers.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{formatDuration(totals.avgEngagementTimePerUser)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{totals.engagedSessionsPerUser}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      )}
    </section>
  );
}
