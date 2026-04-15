import { useMemo, useState } from "react";
import { MapPin, MapPinOff } from "lucide-react";
import { STATE_PATHS } from "@/lib/us-state-paths";

interface StateData {
  state: string;
  count: number;
}

interface USStateMapProps {
  stateDistribution: StateData[];
  unknownCount?: number;
}
...
export function USStateMap({ stateDistribution, unknownCount = 0 }: USStateMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const { stateMap, knownCount, totalUnknownCount, maxCount, topStates } = useMemo(() => {
    const map: Record<string, number> = {};
    let known = 0;
    let unknown = unknownCount;
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
    return { stateMap: map, knownCount: known, totalUnknownCount: unknown, maxCount: max, topStates: top };
  }, [stateDistribution, unknownCount]);

  const totalKnownAndUnknown = knownCount + totalUnknownCount;
...
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Unknown States</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">{totalUnknownCount.toLocaleString()}</p>
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
              viewBox="60 40 830 500"
              className="w-full h-auto"
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
                    fill={getHeatColor(ratio)}
                    stroke={isHovered ? "#1e293b" : "#94a3b8"}
                    strokeWidth={isHovered ? 2 : 0.5}
                    className="transition-colors duration-150 cursor-default"
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
