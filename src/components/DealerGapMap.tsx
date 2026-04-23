import { useMemo } from "react";
import { MapPin, AlertTriangle, CheckCircle2, SplitSquareHorizontal } from "lucide-react";
import usStatesSvg from "@/assets/us-states.svg?raw";

interface StateData {
  state: string;
  count: number;
}

interface DealerGapMapProps {
  dealerWithDealDistribution?: StateData[];
  dealerWithoutDealDistribution?: StateData[];
  dealerAssignedTotal?: number;
  dealerUnassignedTotal?: number;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

type CoverageStatus = "covered" | "gap" | "partial" | "none";

function getStatusColor(status: CoverageStatus): string {
  switch (status) {
    case "covered": return "#10B981";
    case "partial": return "#F59E0B";
    case "gap":     return "#EF4444";
    case "none":    return "#E2E8F0";
  }
}

function getStatusLabel(status: CoverageStatus): string {
  switch (status) {
    case "covered": return "Covered";
    case "partial": return "Partial";
    case "gap":     return "Gap";
    case "none":    return "No contacts";
  }
}

export function DealerGapMap({
  dealerWithDealDistribution = [],
  dealerWithoutDealDistribution = [],
  dealerAssignedTotal = 0,
  dealerUnassignedTotal = 0,
}: DealerGapMapProps) {
  const hasStateData =
    dealerWithDealDistribution.length > 0 || dealerWithoutDealDistribution.length > 0;

  // Use totals from props when available, otherwise sum from state distributions
  const totalAssigned = dealerAssignedTotal > 0
    ? dealerAssignedTotal
    : dealerWithDealDistribution.reduce((s, d) => s + d.count, 0);
  const totalUnassigned = dealerUnassignedTotal > 0
    ? dealerUnassignedTotal
    : dealerWithoutDealDistribution.reduce((s, d) => s + d.count, 0);

  const { assignedMap, unassignedMap, statusMap, summaryStats, gapList } = useMemo(() => {
    const assigned: Record<string, number> = {};
    const unassigned: Record<string, number> = {};

    for (const s of dealerWithDealDistribution) {
      if (STATE_NAMES[s.state]) assigned[s.state] = (assigned[s.state] || 0) + s.count;
    }
    for (const s of dealerWithoutDealDistribution) {
      if (STATE_NAMES[s.state]) unassigned[s.state] = (unassigned[s.state] || 0) + s.count;
    }

    const status: Record<string, CoverageStatus> = {};
    const allStates = new Set([...Object.keys(assigned), ...Object.keys(unassigned)]);

    let covered = 0, partial = 0, gap = 0;
    let totalUnassignedState = 0;

    for (const abbr of allStates) {
      const a = assigned[abbr] || 0;
      const u = unassigned[abbr] || 0;
      if (a > 0 && u === 0) { status[abbr] = "covered"; covered++; }
      else if (a > 0 && u > 0) { status[abbr] = "partial"; partial++; totalUnassignedState += u; }
      else if (u > 0) { status[abbr] = "gap"; gap++; totalUnassignedState += u; }
    }

    const gaps = Object.entries(unassigned)
      .filter(([abbr]) => (status[abbr] === "gap" || status[abbr] === "partial"))
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([abbr, count]) => ({
        abbr,
        name: STATE_NAMES[abbr],
        assigned: assigned[abbr] || 0,
        unassigned: count,
        status: status[abbr] || "gap",
      }));

    return {
      assignedMap: assigned,
      unassignedMap: unassigned,
      statusMap: status,
      summaryStats: { covered, partial, gap, totalUnassigned: totalUnassignedState },
      gapList: gaps,
    };
  }, [dealerWithDealDistribution, dealerWithoutDealDistribution]);

  const svgMarkup = useMemo(() => {
    const fillRules = Object.keys(STATE_NAMES)
      .map((abbr) => {
        const status = statusMap[abbr] || "none";
        return `.${abbr.toLowerCase()}{fill:${getStatusColor(status)};}`;
      })
      .join("\n");

    const titleRules = Object.entries(STATE_NAMES).map(([abbr, name]) => {
      const a = assignedMap[abbr] || 0;
      const u = unassignedMap[abbr] || 0;
      const status = statusMap[abbr] || "none";
      let tooltip = `${name}: No contacts`;
      if (status === "covered") tooltip = `${name}: ${a} assigned ✓`;
      else if (status === "gap") tooltip = `${name}: ${u} unassigned ⚠`;
      else if (status === "partial") tooltip = `${name}: ${a} assigned ✓ · ${u} unassigned ⚠`;
      return { original: `<title>${name}</title>`, replacement: `<title>${tooltip}</title>` };
    });

    let svg = usStatesSvg.replace(
      "</style>",
      `
.state path{transition:fill 180ms ease,opacity 180ms ease;cursor:default;}
.state path:hover{opacity:.84;}
.borders{stroke:#FFFFFF;stroke-width:1.25;}
.separator1{stroke:#C8D5E3;stroke-width:1.4;}
${fillRules}
</style>`,
    );

    for (const { original, replacement } of titleRules) {
      svg = svg.replace(original, replacement);
    }

    return svg;
  }, [statusMap, assignedMap, unassignedMap]);

  return (
    <div className="space-y-5">
      {/* Section label */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600">
          <AlertTriangle className="h-4 w-4 text-white" />
        </div>
        <h2 className="text-base font-bold text-foreground">Dealer Coverage Gap Analysis</h2>
        <div className="flex-1 border-t border-border" />
      </div>

      {/* Summary cards — always show, use totals */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Assigned</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{totalAssigned.toLocaleString()}</p>
            <p className="text-[10px] text-emerald-600/70 dark:text-emerald-500">dealer_assigned is set</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">Unassigned</p>
            <p className="text-2xl font-bold tabular-nums text-red-700 dark:text-red-300">{totalUnassigned.toLocaleString()}</p>
            <p className="text-[10px] text-red-600/70 dark:text-red-500">No dealer assigned</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
            <SplitSquareHorizontal className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Partial States</p>
            <p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{summaryStats.partial}</p>
            <p className="text-[10px] text-amber-600/70 dark:text-amber-500">Mixed coverage</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-700 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-500/10">
            <MapPin className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Gap States</p>
            <p className="text-2xl font-bold tabular-nums text-slate-700 dark:text-slate-200">{summaryStats.gap}</p>
            <p className="text-[10px] text-slate-500">No dealer, leads exist</p>
          </div>
        </div>
      </div>

      {/* Map + gap list */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_320px]">
        <div className="rounded-[28px] border border-border bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Dealer Coverage by State</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasStateData
                  ? "Green = fully covered · Amber = partial · Red = gap (no dealer assigned)"
                  : "State-level breakdown requires contacts with IP State/Region populated"}
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
              {(["covered", "partial", "gap", "none"] as CoverageStatus[]).map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-white/40 shadow-sm"
                    style={{ backgroundColor: getStatusColor(s) }}
                  />
                  <span className="capitalize">{getStatusLabel(s)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-[24px] border border-border bg-white dark:bg-slate-900 p-4">
            <div
              className="w-full [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
          </div>
        </div>

        <div className="rounded-[28px] border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-foreground">Top Coverage Gaps</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            States ranked by unassigned leads — prioritize dealer acquisition here
          </p>

          <div className="mt-5 space-y-3">
            {!hasStateData ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 text-center">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  No state breakdown available
                </p>
                <p className="mt-1 text-[10px] text-amber-600/80 dark:text-amber-500">
                  {totalUnassigned > 0
                    ? `${totalUnassigned.toLocaleString()} unassigned contacts exist but don't have IP State/Region set in HubSpot`
                    : "Contacts may not have the dealer_assigned property populated yet"}
                </p>
              </div>
            ) : gapList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No gaps — all leads have dealer coverage!</p>
            ) : (
              gapList.map((s, i) => {
                const total = s.assigned + s.unassigned;
                const gapPct = total > 0 ? (s.unassigned / total) * 100 : 0;
                const barPct = gapList[0].unassigned > 0
                  ? Math.max((s.unassigned / gapList[0].unassigned) * 100, 6)
                  : 0;
                return (
                  <div key={s.abbr} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-right font-medium text-muted-foreground">{i + 1}</span>
                        <span className="font-semibold text-foreground">{s.name}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: getStatusColor(s.status) }}
                        >
                          {s.abbr}
                        </span>
                      </div>
                      <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                        {s.unassigned.toLocaleString()} unassigned
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${barPct}%`, backgroundColor: getStatusColor(s.status) }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{s.assigned.toLocaleString()} assigned</span>
                      <span>{gapPct.toFixed(0)}% gap rate</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
