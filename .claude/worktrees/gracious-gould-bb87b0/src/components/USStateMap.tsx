import { useMemo, useState } from "react";
import { MapPin, MapPinOff } from "lucide-react";
import { STATE_PATHS } from "@/lib/us-state-paths";

interface StateData {
  state: string;
  count: number;
}

type MapMode = "all" | "with-deal" | "no-deal";

interface USStateMapProps {
  stateDistribution: StateData[];
  unknownCount?: number;
  dealerWithDealDistribution?: StateData[];
  dealerWithoutDealDistribution?: StateData[];
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

function getHeatColor(ratio: number): string {
  if (ratio === 0) return "#cbd5e1";
  if (ratio < 0.1) return "#dbeafe";
  if (ratio < 0.2) return "#bfdbfe";
  if (ratio < 0.35) return "#93c5fd";
  if (ratio < 0.5) return "#60a5fa";
  if (ratio < 0.65) return "#3b82f6";
  if (ratio < 0.8) return "#2563eb";
  return "#1d4ed8";
}

function getDealerColor(ratio: number): string {
  if (ratio === 0) return "#cbd5e1";
  if (ratio < 0.1) return "#d1fae5";
  if (ratio < 0.2) return "#a7f3d0";
  if (ratio < 0.35) return "#6ee7b7";
  if (ratio < 0.5) return "#34d399";
  if (ratio < 0.65) return "#10b981";
  if (ratio < 0.8) return "#059669";
  return "#047857";
}

function getUnassignedColor(ratio: number): string {
  if (ratio === 0) return "#cbd5e1";
  if (ratio < 0.1) return "#fef3c7";
  if (ratio < 0.2) return "#fde68a";
  if (ratio < 0.35) return "#fcd34d";
  if (ratio < 0.5) return "#fbbf24";
  if (ratio < 0.65) return "#f59e0b";
  if (ratio < 0.8) return "#d97706";
  return "#b45309";
}

const MODE_CONFIG = {
  "all": {
    label: "All Contacts",
    title: "Contact Distribution by State",
    subtitle: "Heat map based on contact state data — darker = more contacts",
    knownLabel: "Known States",
    colorFn: getHeatColor,
    legendColors: [0.05, 0.15, 0.3, 0.5, 0.7, 0.9].map(r => getHeatColor(r)),
    tooltipUnit: "contacts",
  },
  "with-deal": {
    label: "Dealer Assigned",
    title: "Contacts with Assigned Dealer by State",
    subtitle: "Contacts where dealer_assigned is set — darker = more assigned",
    knownLabel: "States with Assigned",
    colorFn: getDealerColor,
    legendColors: [0.05, 0.15, 0.3, 0.5, 0.7, 0.9].map(r => getDealerColor(r)),
    tooltipUnit: "assigned",
  },
  "no-deal": {
    label: "No Dealer Assigned",
    title: "Contacts Without Assigned Dealer by State",
    subtitle: "Contacts where dealer_assigned is empty — opportunity areas — darker = more unassigned",
    knownLabel: "States with Gaps",
    colorFn: getUnassignedColor,
    legendColors: [0.05, 0.15, 0.3, 0.5, 0.7, 0.9].map(r => getUnassignedColor(r)),
    tooltipUnit: "unassigned",
  },
} as const;

function MapModeToggle({ mode, onChange }: { mode: MapMode; onChange: (m: MapMode) => void }) {
  const options: { value: MapMode; label: string }[] = [
    { value: "all", label: "All Contacts" },
    { value: "with-deal", label: "Dealer Assigned" },
    { value: "no-deal", label: "No Dealer Assigned" },
  ];
  return (
    <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs shrink-0">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 font-medium transition-all whitespace-nowrap ${
            mode === o.value ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function USStateMap({
  stateDistribution,
  unknownCount = 0,
  dealerWithDealDistribution,
  dealerWithoutDealDistribution,
}: USStateMapProps) {
  const showDealerToggle =
    (dealerWithDealDistribution && dealerWithDealDistribution.length > 0) ||
    (dealerWithoutDealDistribution && dealerWithoutDealDistribution.length > 0);

  const [mode, setMode] = useState<MapMode>("all");
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const activeDistribution = useMemo(() => {
    if (mode === "with-deal") return dealerWithDealDistribution ?? [];
    if (mode === "no-deal") return dealerWithoutDealDistribution ?? [];
    return stateDistribution;
  }, [mode, stateDistribution, dealerWithDealDistribution, dealerWithoutDealDistribution]);

  const { stateMap, knownCount, totalUnknownCount, maxCount, topStates } = useMemo(() => {
    const map: Record<string, number> = {};
    let known = 0;
    let unknown = mode === "all" ? unknownCount : 0;

    for (const entry of activeDistribution) {
      if (entry.state === "UNKNOWN" || !STATE_NAMES[entry.state]) {
        unknown += entry.count;
      } else {
        map[entry.state] = (map[entry.state] || 0) + entry.count;
        known += entry.count;
      }
    }

    const max = Math.max(...Object.values(map), 1);
    const top = Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([state, count]) => ({ state, name: STATE_NAMES[state], count }));

    return {
      stateMap: map,
      knownCount: known,
      totalUnknownCount: unknown,
      maxCount: max,
      topStates: top,
    };
  }, [activeDistribution, unknownCount, mode]);

  const totalKnownAndUnknown = knownCount + totalUnknownCount;
  const cfg = MODE_CONFIG[mode];

  const handleMouseMove = (e: React.MouseEvent<SVGPathElement>, abbr: string) => {
    const rect = e.currentTarget.closest("svg")?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10 });
    }
    setHoveredState(abbr);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
            <MapPin className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{cfg.knownLabel}</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">{knownCount.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15">
            <MapPinOff className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Unknown States</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">{totalUnknownCount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {(knownCount > 0 || showDealerToggle) && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{cfg.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{cfg.subtitle}</p>
            </div>
            {showDealerToggle && <MapModeToggle mode={mode} onChange={setMode} />}
          </div>

          {knownCount === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No state data available for this view</p>
          ) : (
            <div className="relative overflow-hidden">
              <svg
                viewBox="60 40 830 500"
                className="h-auto w-full"
                style={{ maxHeight: 440 }}
                onMouseLeave={() => setHoveredState(null)}
              >
                {Object.entries(STATE_PATHS).map(([abbr, path]) => {
                  const count = stateMap[abbr] || 0;
                  const ratio = count / maxCount;
                  const isHovered = hoveredState === abbr;

                  return (
                    <path
                      key={abbr}
                      d={path}
                      fill={cfg.colorFn(ratio)}
                      stroke={isHovered ? "#1e293b" : "#94a3b8"}
                      strokeWidth={isHovered ? 2 : 0.5}
                      className="cursor-default transition-colors duration-150"
                      style={{
                        filter: isHovered ? "brightness(0.85)" : undefined,
                        opacity: count > 0 ? 1 : 0.45,
                      }}
                      onMouseMove={(e) => handleMouseMove(e, abbr)}
                      onMouseEnter={() => setHoveredState(abbr)}
                    />
                  );
                })}
              </svg>

              {hoveredState && (
                <div
                  className="pointer-events-none absolute z-50 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl"
                  style={{
                    left: tooltipPos.x,
                    top: tooltipPos.y,
                    transform: "translate(-50%, -100%)",
                  }}
                >
                  <p className="font-bold text-foreground">
                    {STATE_NAMES[hoveredState]} ({hoveredState})
                  </p>
                  <p className="text-muted-foreground">
                    {(stateMap[hoveredState] || 0).toLocaleString()} {cfg.tooltipUnit}
                    {totalKnownAndUnknown > 0 && (
                      <span className="ml-1">
                        ({(((stateMap[hoveredState] || 0) / totalKnownAndUnknown) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
            <span>Fewer</span>
            <div className="flex gap-0.5">
              {cfg.legendColors.map((color, i) => (
                <div key={i} className="h-3 w-6 rounded-sm" style={{ backgroundColor: color }} />
              ))}
            </div>
            <span>More</span>
          </div>
        </div>
      )}

      {topStates.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            Top 10 States{mode !== "all" ? ` — ${cfg.label}` : ""}
          </h3>
          <div className="space-y-2">
            {topStates.map((state, index) => {
              const pct = totalKnownAndUnknown > 0 ? (state.count / totalKnownAndUnknown) * 100 : 0;
              return (
                <div key={state.state} className="flex items-center gap-3">
                  <span className="w-5 text-right text-xs font-medium text-muted-foreground">{index + 1}</span>
                  <span className="w-8 text-xs font-bold text-foreground">{state.state}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max((state.count / topStates[0].count) * 100, 2)}%`,
                        backgroundColor: cfg.colorFn(state.count / maxCount),
                      }}
                    />
                  </div>
                  <span className="w-16 text-right text-xs font-semibold tabular-nums text-foreground">
                    {state.count.toLocaleString()}
                  </span>
                  <span className="w-12 text-right text-[10px] text-muted-foreground">{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
