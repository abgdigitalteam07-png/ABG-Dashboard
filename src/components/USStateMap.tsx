import { useMemo } from "react";
import { MapPin, MapPinOff } from "lucide-react";

interface StateData {
  state: string;
  count: number;
}

interface USStateMapProps {
  stateDistribution: StateData[];
}

// US state abbreviations and names
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

// Grid-based US state cartogram layout [row, col]
const STATE_GRID: Record<string, [number, number]> = {
  AK: [0, 0], ME: [0, 10],
  WI: [1, 5], VT: [1, 9], NH: [1, 10],
  WA: [2, 0], ID: [2, 1], MT: [2, 2], ND: [2, 3], MN: [2, 4], IL: [2, 5], MI: [2, 6], NY: [2, 8], MA: [2, 9], CT: [2, 10],
  OR: [3, 0], NV: [3, 1], WY: [3, 2], SD: [3, 3], IA: [3, 4], IN: [3, 5], OH: [3, 6], PA: [3, 7], NJ: [3, 8], RI: [3, 9],
  CA: [4, 0], UT: [4, 1], CO: [4, 2], NE: [4, 3], MO: [4, 4], KY: [4, 5], WV: [4, 6], VA: [4, 7], MD: [4, 8], DE: [4, 9],
  AZ: [5, 1], NM: [5, 2], KS: [5, 3], AR: [5, 4], TN: [5, 5], NC: [5, 6], SC: [5, 7], DC: [5, 8],
  OK: [6, 3], LA: [6, 4], MS: [6, 5], AL: [6, 6], GA: [6, 7],
  HI: [7, 0], TX: [7, 3], FL: [7, 7],
};

function getHeatColor(ratio: number): string {
  if (ratio === 0) return "hsl(var(--muted))";
  if (ratio < 0.15) return "hsl(210, 80%, 90%)";
  if (ratio < 0.3) return "hsl(210, 80%, 75%)";
  if (ratio < 0.5) return "hsl(220, 80%, 60%)";
  if (ratio < 0.7) return "hsl(230, 75%, 50%)";
  return "hsl(240, 70%, 40%)";
}

function getTextColor(ratio: number): string {
  return ratio >= 0.3 ? "white" : "hsl(var(--foreground))";
}

export function USStateMap({ stateDistribution }: USStateMapProps) {
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

      {/* Grid map */}
      {knownCount > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-1 text-sm font-semibold text-foreground">Contact Distribution by State</h3>
          <p className="mb-5 text-xs text-muted-foreground">Heat map based on IP state/region — darker = more contacts</p>

          <div className="overflow-x-auto">
            <div
              className="mx-auto grid gap-1"
              style={{
                gridTemplateColumns: "repeat(11, minmax(38px, 1fr))",
                gridTemplateRows: "repeat(8, 38px)",
                maxWidth: 520,
              }}
            >
              {Object.entries(STATE_GRID).map(([abbr, [row, col]]) => {
                const count = stateMap[abbr] || 0;
                const ratio = count / maxCount;
                return (
                  <div
                    key={abbr}
                    className="relative flex flex-col items-center justify-center rounded-md text-[10px] font-bold transition-all hover:scale-110 hover:z-10 hover:shadow-md cursor-default"
                    style={{
                      gridRow: row + 1,
                      gridColumn: col + 1,
                      backgroundColor: getHeatColor(ratio),
                      color: getTextColor(ratio),
                    }}
                    title={`${STATE_NAMES[abbr]}: ${count.toLocaleString()} contacts`}
                  >
                    {abbr}
                    {count > 0 && (
                      <span className="text-[7px] font-medium opacity-80 leading-none">
                        {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
            <span>Fewer</span>
            <div className="flex gap-0.5">
              {[0, 0.15, 0.3, 0.5, 0.7, 1].map((r) => (
                <div
                  key={r}
                  className="h-3 w-6 rounded-sm"
                  style={{ backgroundColor: getHeatColor(r === 0 ? 0.01 : r) }}
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
