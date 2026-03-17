import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { ScoreCard } from "./ScoreCard";
import { generateHubSpotData } from "@/lib/mock-data";
import { Brand } from "@/lib/brands";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface HubSpotTabProps {
  brand: Brand;
}

const LIFECYCLE_COLORS = ["#94A3B8", "#3B82F6", "#8B5CF6", "#F59E0B", "#F97316", "#10B981"];

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

export function HubSpotTab({ brand }: HubSpotTabProps) {
  const data = useMemo(() => generateHubSpotData(), [brand.id]);

  return (
    <div className="space-y-6 p-6">
      {/* Contact + Email Scorecards */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          CRM Overview
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ScoreCard title="Total Contacts" value={formatNumber(data.totalContacts)} delta={data.totalContactsDelta} />
          <ScoreCard title="Open Rate" value={`${data.emailPerformance.openRate}%`} delta={data.emailPerformance.openRateDelta} />
          <ScoreCard title="Click Rate" value={`${data.emailPerformance.clickRate}%`} delta={data.emailPerformance.clickRateDelta} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ScoreCard title="Bounce Rate" value={`${data.emailPerformance.bounceRate}%`} delta={data.emailPerformance.bounceRateDelta} />
        <ScoreCard title="Unsubscribe Rate" value={`${data.emailPerformance.unsubscribeRate}%`} delta={data.emailPerformance.unsubscribeRateDelta} />
        <ScoreCard title="Delivered Rate" value={`${data.emailPerformance.deliveredRate}%`} delta={data.emailPerformance.deliveredRateDelta} />
      </div>

      {/* Lifecycle Stage Breakdown */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-card">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Lifecycle Stage Breakdown
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.lifecycleStages} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} width={100} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.lifecycleStages.map((_, i) => (
                <Cell key={i} fill={LIFECYCLE_COLORS[i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6 shadow-card">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Email Open Rate Over Time
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.openRateOverTime}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="linear" dataKey="value" name="Open Rate" stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-card">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Unsubscribe Rate Over Time
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.unsubscribeRateOverTime}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="linear" dataKey="value" name="Unsubscribe Rate" stroke="#EF4444" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Email Performance Table */}
      <div className="rounded-lg border border-border bg-card shadow-card">
        <div className="p-6 pb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Email Performance
          </h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Subject</TableHead>
                <TableHead className="text-right text-xs">Sent</TableHead>
                <TableHead className="text-right text-xs">Delivered</TableHead>
                <TableHead className="text-right text-xs">Opens</TableHead>
                <TableHead className="text-right text-xs">Clicks</TableHead>
                <TableHead className="text-right text-xs">Bounce</TableHead>
                <TableHead className="text-right text-xs">Unsub</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.emails.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="text-sm font-medium">{row.name}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{row.subject}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.sent.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.delivered.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.opens.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.clicks.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.bounce}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{row.unsubscribe}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
