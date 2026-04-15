import { useMemo, useState } from "react";
import { MapPin, MapPinOff } from "lucide-react";

interface StateData {
  state: string;
  count: number;
}

interface USStateMapProps {
  stateDistribution: StateData[];
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

// Simplified US state paths (viewBox: 0 0 960 600)
const STATE_PATHS: Record<string, string> = {
  AL: "M628,426 L629,467 L631,488 L617,490 L616,479 L610,474 L612,426Z",
  AK: "M161,485 L183,485 L183,493 L193,493 L193,485 L221,485 L221,525 L161,525Z",
  AZ: "M205,410 L280,410 L280,490 L225,490 L205,460Z",
  AR: "M555,410 L610,410 L612,455 L555,455Z",
  CA: "M120,285 L165,285 L185,340 L195,410 L185,470 L125,470 L100,400 L110,340Z",
  CO: "M290,310 L378,310 L378,380 L290,380Z",
  CT: "M852,205 L876,195 L882,215 L858,225Z",
  DE: "M820,300 L835,290 L838,315 L825,320Z",
  FL: "M660,470 L720,450 L750,490 L730,535 L695,540 L670,510 L660,490Z",
  GA: "M660,400 L710,400 L720,450 L660,470 L640,445Z",
  HI: "M260,510 L300,510 L300,545 L260,545Z",
  ID: "M215,155 L260,155 L265,260 L225,280 L210,240Z",
  IL: "M578,255 L612,250 L618,350 L595,370 L575,355 L575,290Z",
  IN: "M618,260 L652,260 L652,355 L618,360Z",
  IA: "M510,240 L578,240 L578,300 L510,300Z",
  KS: "M400,340 L500,340 L500,400 L400,400Z",
  KY: "M620,345 L710,330 L715,365 L620,375Z",
  LA: "M555,460 L610,460 L615,510 L580,520 L555,500Z",
  ME: "M870,100 L895,100 L900,170 L875,180 L865,155Z",
  MD: "M770,290 L820,280 L830,310 L805,320 L770,310Z",
  MA: "M855,185 L895,175 L895,195 L855,200Z",
  MI: "M610,155 L660,155 L665,200 L645,240 L610,245 L620,200Z M640,130 L680,115 L695,160 L660,170Z",
  MN: "M478,115 L545,115 L545,210 L478,210Z",
  MS: "M585,410 L615,410 L617,490 L585,490Z",
  MO: "M510,310 L580,310 L595,370 L575,405 L530,405 L510,370Z",
  MT: "M255,115 L378,115 L378,190 L255,190Z",
  NE: "M378,275 L500,275 L500,335 L378,330Z",
  NV: "M185,260 L225,260 L235,385 L195,410 L165,350Z",
  NH: "M860,130 L878,125 L878,185 L860,190Z",
  NJ: "M825,245 L845,235 L845,290 L830,300 L822,275Z",
  NM: "M255,400 L350,400 L350,490 L255,490Z",
  NY: "M760,155 L855,150 L855,230 L825,240 L800,225 L760,225Z",
  NC: "M690,355 L800,340 L810,370 L730,390 L690,385Z",
  ND: "M378,115 L478,115 L478,185 L378,185Z",
  OH: "M652,255 L710,245 L715,325 L660,340 L652,305Z",
  OK: "M380,395 L500,395 L505,425 L460,440 L400,440 L380,420Z",
  OR: "M115,155 L215,155 L210,240 L145,255 L100,220Z",
  PA: "M725,230 L822,220 L825,275 L730,290Z",
  RI: "M872,200 L885,195 L887,215 L874,218Z",
  SC: "M700,385 L750,375 L760,410 L720,425 L695,410Z",
  SD: "M378,190 L478,190 L478,265 L378,270Z",
  TN: "M600,370 L715,360 L720,395 L600,405Z",
  TX: "M350,430 L460,430 L505,445 L510,530 L460,560 L400,540 L360,510 L350,460Z",
  UT: "M235,285 L290,285 L290,385 L235,385Z",
  VT: "M848,125 L862,120 L862,180 L848,185Z",
  VA: "M710,310 L810,295 L815,340 L730,355 L700,345Z",
  WA: "M130,80 L225,80 L225,155 L130,155Z",
  WV: "M710,295 L745,290 L740,345 L715,355 L700,335Z",
  WI: "M530,130 L595,130 L600,225 L530,235Z",
  WY: "M280,195 L378,195 L378,285 L280,285Z",
  DC: "M795,310 L805,305 L808,315 L798,318Z",
};

function getHeatColor(ratio: number): string {
  if (ratio === 0) return "#e2e8f0";
  if (ratio < 0.1) return "#dbeafe";
  if (ratio < 0.2) return "#bfdbfe";
  if (ratio < 0.35) return "#93c5fd";
  if (ratio < 0.5) return "#60a5fa";
  if (ratio < 0.65) return "#3b82f6";
  if (ratio < 0.8) return "#2563eb";
  return "#1d4ed8";
}

function getTextColor(ratio: number): string {
  return ratio >= 0.35 ? "#ffffff" : "#334155";
}

export function USStateMap({ stateDistribution }: USStateMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const { stateMap, knownCount, unknownCount, maxCount, topStates } = useMemo(() => {
    const map: Record<string, number> = {};
    let known = 0;
    let unknown = 0;
    for (const s of stateDistribution) {
      if (s.state === "UNKNOWN" || !STATE_NAMES[s.state]) {
        unknown += s.count;
      } else {
        map[s.state] = (map[s.state] || 0) + s.count;
        known += s.count;
      }
    }
    const max = Math.max(...Object.values(map), 1);
    const top = Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([state, count]) => ({ state, name: STATE_NAMES[state], count }));
    return { stateMap: map, knownCount: known, unknownCount: unknown, maxCount: max, topStates: top };
  }, [stateDistribution]);

  const totalKnownAndUnknown = knownCount + unknownCount;

  const handleMouseMove = (e: React.MouseEvent, abbr: string) => {
    const rect = e.currentTarget.closest("svg")?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10 });
    }
    setHoveredState(abbr);
  };

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
            <MapPin className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Known States</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">{knownCount.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15">
            <MapPinOff className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Unknown States</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">{unknownCount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* SVG Map */}
      {knownCount > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Contact Distribution by State</h3>
          <p className="mb-5 text-xs text-muted-foreground">Heat map based on IP state/region — darker = more contacts</p>

          <div className="relative overflow-hidden">
            <svg
              viewBox="80 70 840 490"
              className="w-full h-auto"
              style={{ maxHeight: 420 }}
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
                    fill={getHeatColor(ratio)}
                    stroke={isHovered ? "#1e293b" : "#94a3b8"}
                    strokeWidth={isHovered ? 2 : 0.75}
                    className="transition-all duration-150 cursor-default"
                    style={{
                      filter: isHovered ? "brightness(0.9)" : undefined,
                      opacity: isHovered ? 1 : count > 0 ? 1 : 0.7,
                    }}
                    onMouseMove={(e) => handleMouseMove(e, abbr)}
                    onMouseEnter={() => setHoveredState(abbr)}
                  />
                );
              })}
            </svg>

            {/* Tooltip */}
            {hoveredState && (
              <div
                className="pointer-events-none absolute z-50 rounded-lg border border-border bg-card px-3 py-2 shadow-xl text-xs"
                style={{
                  left: tooltipPos.x,
                  top: tooltipPos.y,
                  transform: "translate(-50%, -100%)",
                }}
              >
                <p className="font-bold text-foreground">{STATE_NAMES[hoveredState]} ({hoveredState})</p>
                <p className="text-muted-foreground">
                  {(stateMap[hoveredState] || 0).toLocaleString()} contacts
                  {totalKnownAndUnknown > 0 && (
                    <span className="ml-1">
                      ({(((stateMap[hoveredState] || 0) / totalKnownAndUnknown) * 100).toFixed(1)}%)
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
            <span>Fewer</span>
            <div className="flex gap-0.5">
              {[0.05, 0.15, 0.3, 0.5, 0.7, 0.9].map((r) => (
                <div
                  key={r}
                  className="h-3 w-6 rounded-sm"
                  style={{ backgroundColor: getHeatColor(r) }}
                />
              ))}
            </div>
            <span>More</span>
          </div>
        </div>
      )}

      {/* Top states table */}
      {topStates.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Top 10 States</h3>
          <div className="space-y-2">
            {topStates.map((s, i) => {
              const pct = totalKnownAndUnknown > 0 ? (s.count / totalKnownAndUnknown) * 100 : 0;
              return (
                <div key={s.state} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-medium text-muted-foreground text-right">{i + 1}</span>
                  <span className="w-8 text-xs font-bold text-foreground">{s.state}</span>
                  <div className="flex-1 h-5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max((s.count / topStates[0].count) * 100, 2)}%`,
                        backgroundColor: getHeatColor(s.count / maxCount),
                      }}
                    />
                  </div>
                  <span className="w-16 text-right text-xs font-semibold tabular-nums text-foreground">
                    {s.count.toLocaleString()}
                  </span>
                  <span className="w-12 text-right text-[10px] text-muted-foreground">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
