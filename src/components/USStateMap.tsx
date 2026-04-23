import { useMemo, useState, useRef } from "react";
import { MapPin, MapPinOff } from "lucide-react";
import usStatesSvg from "@/assets/us-states.svg?raw";

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

// Approximate SVG-space centroids for each state (viewBox 0 0 959 593)
const STATE_CENTROIDS: Record<string, [number, number]> = {
  AL: [660, 450], AK: [178, 553], AZ: [196, 367], AR: [563, 402],
  CA: [112, 345], CO: [340, 286], CT: [858, 184], DE: [833, 243],
  FL: [725, 505], GA: [722, 442], HI: [290, 556], ID: [207, 218],
  IL: [590, 282], IN: [655, 273], IA: [532, 226], KS: [460, 315],
  KY: [672, 338], LA: [578, 478], ME: [900, 115], MD: [822, 243],
  MA: [875, 174], MI: [655, 206], MN: [512, 162], MS: [625, 443],
  MO: [566, 332], MT: [286, 172], NE: [436, 268], NV: [184, 295],
  NH: [882, 152], NJ: [838, 223], NM: [292, 390], NY: [820, 178],
  NC: [778, 363], ND: [438, 166], OH: [705, 273], OK: [490, 377],
  OR: [144, 216], PA: [788, 218], RI: [882, 186], SC: [772, 398],
  SD: [444, 213], TN: [680, 378], TX: [460, 438], UT: [244, 313],
  VT: [858, 150], VA: [795, 333], WA: [153, 167], WV: [758, 298],
  WI: [588, 202], WY: [322, 228], DC: [827, 260],
};

// Lowercase → uppercase for SVG class matching
const STATE_CLASS_MAP: Record<string, string> = {};
for (const code of Object.keys(STATE_NAMES)) STATE_CLASS_MAP[code.toLowerCase()] = code;

function getHeatColor(ratio: number): string {
  if (ratio <= 0) return "#EEF4FB";
  if (ratio < 0.15) return "#D6E8F9";
  if (ratio < 0.3) return "#B3D3F2";
  if (ratio < 0.5) return "#85B8E8";
  if (ratio < 0.7) return "#5A99D8";
  return "#3A7BC8";
}

function getDealerColor(ratio: number): string {
  if (ratio <= 0) return "#E7EDF4";
  if (ratio < 0.15) return "#D1FAE5";
  if (ratio < 0.3) return "#A7F3D0";
  if (ratio < 0.5) return "#6EE7B7";
  if (ratio < 0.7) return "#10B981";
  return "#047857";
}

function getUnassignedColor(ratio: number): string {
  if (ratio <= 0) return "#E7EDF4";
  if (ratio < 0.15) return "#FEF3C7";
  if (ratio < 0.3) return "#FDE68A";
  if (ratio < 0.5) return "#FCD34D";
  if (ratio < 0.7) return "#F59E0B";
  return "#B45309";
}

const MODE_CONFIG = {
  all: {
    label: "All Contacts",
    title: "Contact Distribution by State",
    subtitle: "Geographic choropleth by state",
    knownLabel: "Known States",
    tooltipUnit: "contacts",
    colorFn: getHeatColor,
  },
  "with-deal": {
    label: "Dealer Assigned",
    title: "Contacts with Assigned Dealer by State",
    subtitle: "Contacts where dealer_assigned is set — opportunity coverage",
    knownLabel: "States with Assigned",
    tooltipUnit: "assigned",
    colorFn: getDealerColor,
  },
  "no-deal": {
    label: "No Dealer Assigned",
    title: "Contacts Without Assigned Dealer by State",
    subtitle: "Contacts where dealer_assigned is empty — coverage gaps",
    knownLabel: "States with Gaps",
    tooltipUnit: "unassigned",
    colorFn: getUnassignedColor,
  },
} as const;

function buildStateData(distribution: StateData[]) {
  const map: Record<string, number> = {};
  let known = 0;
  let unknown = 0;
  for (const s of distribution) {
    if (!STATE_NAMES[s.state]) { unknown += s.count; continue; }
    map[s.state] = (map[s.state] || 0) + s.count;
    known += s.count;
  }
  const max = Math.max(...Object.values(map), 1);
  const top = Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([state, count]) => ({ state, name: STATE_NAMES[state], count }));
  return { stateMap: map, knownCount: known, unknownCount: unknown, maxCount: max, topStates: top };
}

function MapModeToggle({ mode, onChange }: { mode: MapMode; onChange: (m: MapMode) => void }) {
  const options: { value: MapMode; label: string }[] = [
    { value: "all", label: "All Contacts" },
    { value: "with-deal", label: "Dealer Assigned" },
    { value: "no-deal", label: "No Dealer Assigned" },
  ];
  return (
    <div className="flex rounded-lg border border-slate-200 bg-slate-100/60 p-0.5 text-xs shrink-0">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 font-medium transition-all whitespace-nowrap ${
            mode === o.value
              ? "bg-white shadow-sm text-slate-900"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface TooltipState { x: number; y: number; stateCode: string; }

export function USStateMap({
  stateDistribution,
  unknownCount: externalUnknownCount,
  dealerWithDealDistribution,
  dealerWithoutDealDistribution,
}: USStateMapProps) {
  const showDealerToggle =
    (dealerWithDealDistribution && dealerWithDealDistribution.length > 0) ||
    (dealerWithoutDealDistribution && dealerWithoutDealDistribution.length > 0);

  const [mode, setMode] = useState<MapMode>("all");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const base = useMemo(() => buildStateData(stateDistribution), [stateDistribution]);

  const active = useMemo(() => {
    if (mode === "with-deal") return buildStateData(dealerWithDealDistribution ?? []);
    if (mode === "no-deal") return buildStateData(dealerWithoutDealDistribution ?? []);
    return base;
  }, [mode, base, dealerWithDealDistribution, dealerWithoutDealDistribution]);

  const totalKnownAndUnknown = base.knownCount + (externalUnknownCount ?? base.unknownCount);
  const cfg = MODE_CONFIG[mode];

  const svgMarkup = useMemo(() => {
    const fillRules = Object.keys(STATE_NAMES)
      .map((abbr) => {
        const ratio = (active.stateMap[abbr] || 0) / active.maxCount;
        return `.${abbr.toLowerCase()}{fill:${cfg.colorFn(ratio)};}`;
      })
      .join("\n");

    // Inject state count labels as SVG text elements
    const labels = Object.entries(STATE_CENTROIDS)
      .filter(([abbr]) => (active.stateMap[abbr] || 0) > 0)
      .map(([abbr, [cx, cy]]) => {
        const count = active.stateMap[abbr];
        const label = count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k` : String(count);
        return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" style="font-size:9px;font-family:system-ui,sans-serif;font-weight:700;fill:#1e3a5f;pointer-events:none;paint-order:stroke;stroke:#ffffff;stroke-width:2.5;stroke-linejoin:round;">${label}</text>`;
      })
      .join("\n");

    let svg = usStatesSvg
      .replace(
        "</style>",
        `
.state path{transition:fill 180ms ease,opacity 180ms ease;cursor:default;}
.state path:hover{opacity:.82;}
.borders{stroke:#FFFFFF;stroke-width:1.25;}
.separator1{stroke:#C8D5E3;stroke-width:1.4;}
${fillRules}
</style>`,
      )
      // Remove native SVG titles — we handle tooltips in React
      .replace(/<title>[^<]*<\/title>/g, "")
      .replace("</svg>", `${labels}\n</svg>`);

    return svg;
  }, [active.stateMap, active.maxCount, cfg]);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const container = mapRef.current;
    if (!container) return;
    const el = e.target as Element;
    let cur: Element | null = el;
    let stateCode: string | null = null;
    while (cur && cur !== container) {
      const cls = (cur.getAttribute("class") || "").trim().split(/\s+/);
      for (const c of cls) {
        if (STATE_CLASS_MAP[c]) { stateCode = STATE_CLASS_MAP[c]; break; }
      }
      if (stateCode) break;
      cur = cur.parentElement;
    }
    if (stateCode) {
      const rect = container.getBoundingClientRect();
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, stateCode });
    } else {
      setTooltip(null);
    }
  }

  const legendRatios = [0, 0.15, 0.3, 0.5, 0.7, 1];

  const tooltipCount = tooltip ? (active.stateMap[tooltip.stateCode] || 0) : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12">
            <MapPin className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Known States</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{base.knownCount.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Mapped from State field</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/12">
            <MapPinOff className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Unknown States</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">
              {(externalUnknownCount ?? base.unknownCount).toLocaleString()}
            </p>
            <p className="text-xs text-slate-500">Missing State field</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_320px]">
        <div className="rounded-[28px] border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{cfg.title}</h3>
              <p className="mt-1 text-xs text-slate-500">{cfg.subtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {showDealerToggle && <MapModeToggle mode={mode} onChange={setMode} />}
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>Lower</span>
                <div className="flex overflow-hidden rounded-full border border-slate-200">
                  {legendRatios.map((ratio) => (
                    <span
                      key={ratio}
                      className="h-3 w-7"
                      style={{ backgroundColor: cfg.colorFn(ratio === 0 ? 0.01 : ratio) }}
                    />
                  ))}
                </div>
                <span>Higher</span>
              </div>
            </div>
          </div>

          <div
            ref={mapRef}
            className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-4"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
          >
            <div
              className="w-full [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />

            {tooltip && (
              <div
                className="pointer-events-none absolute z-10 rounded-xl border border-slate-200 bg-white shadow-lg px-3 py-2 text-xs"
                style={{
                  left: tooltip.x + 12,
                  top: tooltip.y - 10,
                  transform: tooltip.x > 400 ? "translateX(-110%)" : undefined,
                }}
              >
                <p className="font-semibold text-slate-900">{STATE_NAMES[tooltip.stateCode]}</p>
                <p className="text-slate-500 mt-0.5">
                  {tooltipCount > 0
                    ? `${tooltipCount.toLocaleString()} ${cfg.tooltipUnit}`
                    : "No contacts"}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Top States{mode !== "all" ? ` — ${cfg.label}` : ""}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {mode === "all"
              ? "Share of contacts with a known state"
              : `Share of ${cfg.tooltipUnit} contacts per state`}
          </p>

          <div className="mt-5 space-y-3">
            {active.topStates.length > 0 ? active.topStates.map((s, i) => {
              const pct = totalKnownAndUnknown > 0 ? (s.count / totalKnownAndUnknown) * 100 : 0;
              const width = active.topStates[0]?.count
                ? Math.max((s.count / active.topStates[0].count) * 100, 8)
                : 0;
              return (
                <div key={s.state} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-right font-medium text-slate-400">{i + 1}</span>
                      <span className="font-semibold text-slate-900">{s.name}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {s.state}
                      </span>
                    </div>
                    <span className="font-semibold tabular-nums text-slate-900">{s.count.toLocaleString()}</span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${width}%`,
                        backgroundColor: cfg.colorFn((active.stateMap[s.state] || 0) / active.maxCount),
                      }}
                    />
                  </div>

                  <div className="text-right text-[11px] text-slate-500">{pct.toFixed(1)}%</div>
                </div>
              );
            }) : (
              <p className="text-sm text-slate-500">No state data available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
