import { useState, useRef } from "react";
import { subDays, format, addDays, parseISO, startOfWeek, startOfMonth } from "date-fns";
import { callFunction } from "@/lib/api-client";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import { TrendingUp, TrendingDown, Minus, RefreshCw, Check, Users, UserCheck, UserX, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, ReferenceLine,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── access control ───────────────────────────────────────────────────────────
const ALLOWED_EMAILS = new Set([
  "mali@americanbathgroup.com",
  "clee@americanbathgroup.com",
]);

// ─── config ───────────────────────────────────────────────────────────────────
const SECONDARY_BRANDS = ["American Whirlpool", "Vita Spa", "MAAX Sauna"] as const;
type SecondaryBrand = typeof SECONDARY_BRANDS[number];

const PERIOD_OPTIONS = [
  { label: "30d",  days: 30,  full: "Last 30 days"  },
  { label: "60d",  days: 60,  full: "Last 60 days"  },
  { label: "90d",  days: 90,  full: "Last 90 days"  },
  { label: "6mo",  days: 180, full: "Last 6 months" },
] as const;

const BRAND_PALETTE: Record<SecondaryBrand, { solid: string; faded: string; bg: string }> = {
  "American Whirlpool": { solid: "#3B82F6", faded: "#93C5FD", bg: "#EFF6FF" },
  "Vita Spa":           { solid: "#7C3AED", faded: "#C4B5FD", bg: "#F5F3FF" },
  "MAAX Sauna":         { solid: "#059669", faded: "#6EE7B7", bg: "#ECFDF5" },
};

const BRAND_SHORT: Record<SecondaryBrand, string> = {
  "American Whirlpool": "Am. Whirlpool",
  "Vita Spa":           "Vita Spa",
  "MAAX Sauna":         "MAAX Sauna",
};

// ─── types ────────────────────────────────────────────────────────────────────
interface PeriodData {
  totalContacts: number;
  dealerAssigned: number;
  dealerUnassigned: number;
}

type BrandResults = Record<SecondaryBrand, { curr: PeriodData; prev: PeriodData }>;
type TimeSeries   = Record<string, number>; // date -> count

const METRICS = [
  { key: "totalContacts"    as const, label: "Total Created",      Icon: Users,      color: "#3B82F6" },
  { key: "dealerAssigned"   as const, label: "Assigned to Dealer", Icon: UserCheck,  color: "#10B981" },
  { key: "dealerUnassigned" as const, label: "Not Assigned",       Icon: UserX,      color: "#F59E0B" },
] as const;

type Granularity = "day" | "week" | "month";

// ─── helpers ──────────────────────────────────────────────────────────────────
function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getPeriods(days: number) {
  const today = new Date();
  return {
    currEnd:   today,
    currStart: subDays(today, days - 1),
    prevEnd:   subDays(today, days),
    prevStart: subDays(today, days * 2 - 1),
  };
}

async function fetchAllBrandsForPeriod(
  brands: SecondaryBrand[], from: Date, to: Date,
): Promise<{ periodData: Record<SecondaryBrand, PeriodData>; timeSeries: TimeSeries }> {
  const data = await callFunction("hubspot-contacts", {
    brandNames: brands,
    startDate: dateStr(from),
    endDate: dateStr(to),
  });
  if (data?.error) throw new Error(data.error);

  const periodData = {} as Record<SecondaryBrand, PeriodData>;
  const timeSeries: TimeSeries = {};

  for (const brand of brands) {
    const s = data?.brandData?.[brand];
    periodData[brand] = {
      totalContacts:    s?.totalContacts        ?? 0,
      dealerAssigned:   s?.dealerAssignedTotal   ?? 0,
      dealerUnassigned: s?.dealerUnassignedTotal ?? 0,
    };
    // Combine daily series across all brands into one aggregate
    const ts: TimeSeries = data?.brandTimeSeries?.[brand] ?? {};
    for (const [date, count] of Object.entries(ts)) {
      timeSeries[date] = (timeSeries[date] || 0) + (count as number);
    }
  }
  return { periodData, timeSeries };
}

/** Build chart rows: align current + previous by day-offset so they overlay */
function buildTrendRows(
  currSeries: TimeSeries, prevSeries: TimeSeries,
  currStart: Date, prevStart: Date,
  days: number, gran: Granularity,
) {
  // Day-level aligned pairs
  const daily = Array.from({ length: days }, (_, i) => ({
    cDate: dateStr(addDays(currStart, i)),
    pDate: dateStr(addDays(prevStart, i)),
  }));

  if (gran === "day") {
    return daily.map(({ cDate, pDate }) => ({
      label:     format(parseISO(cDate), "MMM d"),
      prevLabel: format(parseISO(pDate), "MMM d"),
      curr:      currSeries[cDate] || 0,
      prev:      prevSeries[pDate] || 0,
    }));
  }

  // Aggregate into week/month buckets (keyed by current-period bucket)
  type Bucket = { label: string; prevLabel: string; curr: number; prev: number };
  const buckets = new Map<string, Bucket>();
  for (const { cDate, pDate } of daily) {
    const cd = parseISO(cDate);
    const pd = parseISO(pDate);
    const key   = gran === "week"
      ? dateStr(startOfWeek(cd, { weekStartsOn: 0 }))
      : format(startOfMonth(cd), "yyyy-MM");
    const label = gran === "week"
      ? `Wk ${format(cd, "MMM d")}`
      : format(startOfMonth(cd), "MMM yyyy");
    const prevLabel = gran === "week"
      ? `Wk ${format(pd, "MMM d")}`
      : format(startOfMonth(pd), "MMM yyyy");
    if (!buckets.has(key)) buckets.set(key, { label, prevLabel, curr: 0, prev: 0 });
    buckets.get(key)!.curr += currSeries[cDate] || 0;
    buckets.get(key)!.prev += prevSeries[pDate] || 0;
  }
  return [...buckets.values()];
}

// ─── pdf export ───────────────────────────────────────────────────────────────
type TrendRow = { label: string; prevLabel: string; curr: number; prev: number };

type RGB = [number, number, number];
const HEX2RGB = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

function downloadPDF(opts: {
  currLabel: string; prevLabel: string; selectedDays: number;
  activeBrands: SecondaryBrand[]; results: BrandResults;
  trendRows: TrendRow[]; granularity: Granularity;
  currSeries: TimeSeries; prevSeries: TimeSeries;
  currStart: Date; prevStart: Date;
}) {
  const { currLabel, prevLabel, activeBrands, results, granularity,
          currSeries, prevSeries, currStart, prevStart } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const ML = 13;
  const MR = 13;

  // ── colors & helpers ────────────────────────────────────────────────────────
  const BLUE  = "#3B82F6";
  const DARK  = "#1E293B";
  const GRAY  = "#64748B";
  const LGRAY = "#F1F5F9";
  const GREEN = "#059669";
  const RED   = "#DC2626";
  const CW    = PW - ML - MR;

  const dSign  = (d: number) => d > 0.4 ? "+" : "";
  const dColor = (d: number): [number, number, number] =>
    d > 0.4 ? HEX2RGB(GREEN) : d < -0.4 ? HEX2RGB(RED) : HEX2RGB(GRAY);

  // compact autoTable base
  const AT = {
    margin: { left: ML, right: MR },
    tableLineColor: [226, 232, 240] as [number, number, number],
    tableLineWidth: 0.25,
    styles: {
      font: "helvetica" as const,
      fontSize: 7.5,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      textColor: HEX2RGB(DARK),
      lineColor: [226, 232, 240] as [number, number, number],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: HEX2RGB(DARK) as [number, number, number],
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: "bold" as const,
      fontSize: 7.5,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: HEX2RGB(LGRAY) as [number, number, number] },
  };

  // section label with blue left bar
  const secLabel = (title: string, y: number) => {
    doc.setFillColor(...HEX2RGB(BLUE));
    doc.rect(ML, y, 2.5, 4.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...HEX2RGB(DARK));
    doc.text(title, ML + 5, y + 3.8);
    return y + 8;
  };

  // ── smart trend rows for PDF: always weekly (or monthly if >90 days) ───────
  const pdfGran: Granularity = opts.selectedDays > 90 ? "month" : "week";
  const pdfTrendRows = buildTrendRows(
    currSeries, prevSeries, currStart, prevStart, opts.selectedDays, pdfGran,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SINGLE PAGE LAYOUT
  // ══════════════════════════════════════════════════════════════════════════

  // ── 1. HEADER BAR (14mm) ─────────────────────────────────────────────────
  doc.setFillColor(...HEX2RGB(DARK));
  doc.rect(0, 0, PW, 14, "F");
  doc.setFillColor(...HEX2RGB(BLUE));
  doc.rect(0, 0, 4, 14, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("CRM Contact Comparison Report", ML + 3, 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`American Bath Group  —  Brand Performance Hub`, ML + 3, 13.5);  // will be cut – just fills space

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(`Generated: ${format(new Date(), "MMM d, yyyy  h:mm a")}`, PW - MR, 6.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  doc.text(`${opts.selectedDays}-day comparison`, PW - MR, 11.5, { align: "right" });

  let y = 18;

  // ── 2. PERIOD + BRANDS STRIP (10mm) ──────────────────────────────────────
  doc.setFillColor(...HEX2RGB(LGRAY));
  doc.rect(ML, y, CW, 10, "F");
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.rect(ML, y, CW, 10, "S");

  // Blue dot + current
  doc.setFillColor(...HEX2RGB(BLUE));
  doc.circle(ML + 4, y + 3.8, 1.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...HEX2RGB(DARK));
  doc.text("Current:", ML + 7, y + 4.3);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...HEX2RGB(GRAY));
  doc.text(currLabel, ML + 22, y + 4.3);

  // Gray dot + previous
  doc.setFillColor(203, 213, 225);
  doc.circle(ML + 4, y + 7.5, 1.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...HEX2RGB(DARK));
  doc.text("Previous:", ML + 7, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...HEX2RGB(GRAY));
  doc.text(prevLabel, ML + 22, y + 8);

  // Brands (right)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...HEX2RGB(BLUE));
  doc.text("BRANDS:", PW - MR - doc.getTextWidth(activeBrands.join("  |  ")) - 16, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...HEX2RGB(DARK));
  doc.text(activeBrands.join("  |  "), PW - MR, y + 6, { align: "right" });

  y += 14;

  // ── 3. KPI BOXES (21mm) ──────────────────────────────────────────────────
  const boxW = (CW - 6) / 3;
  METRICS.forEach(({ key, label, color }, i) => {
    const gc = activeBrands.reduce((s, b) => s + results[b].curr[key], 0);
    const gp = activeBrands.reduce((s, b) => s + results[b].prev[key], 0);
    const d  = gp > 0 ? ((gc - gp) / gp) * 100 : null;
    const bx = ML + i * (boxW + 3);

    doc.setFillColor(...HEX2RGB(LGRAY));
    doc.rect(bx, y, boxW, 21, "F");
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.rect(bx, y, boxW, 21, "S");
    // color top bar
    doc.setFillColor(...HEX2RGB(color));
    doc.rect(bx, y, boxW, 2, "F");

    // label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...HEX2RGB(GRAY));
    doc.text(label.toUpperCase(), bx + 3, y + 6.5);

    // big number
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...HEX2RGB(DARK));
    doc.text(gc.toLocaleString(), bx + 3, y + 15.5);

    // delta top-right
    if (d !== null) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...dColor(d));
      doc.text(`${dSign(d)}${d.toFixed(1)}%`, bx + boxW - 3, y + 15.5, { align: "right" });
    }
    // prev small
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...HEX2RGB(GRAY));
    doc.text(`prev ${gp.toLocaleString()}`, bx + 3, y + 19.5);
  });

  y += 25;

  // ── 4. BRAND BREAKDOWN TABLE ──────────────────────────────────────────────
  y = secLabel("Brand Breakdown", y);

  // Build cross-tab: rows = metrics, cols = brands (curr + delta combined)
  const brandHead = ["Metric", ...activeBrands.map(b => BRAND_SHORT[b])];
  const brandBody = METRICS.map(({ key, label }) =>
    [
      label,
      ...activeBrands.map(b => {
        const curr = results[b].curr[key];
        const prev = results[b].prev[key];
        const d    = prev > 0 ? ((curr - prev) / prev) * 100 : null;
        return d !== null ? `${curr.toLocaleString()}  (${dSign(d)}${d.toFixed(1)}%)` : curr.toLocaleString();
      }),
    ]
  );

  // fill full content width: CW=184mm minus Metric col (52mm) split across brand cols
  const brandColW = Math.floor((CW - 52) / activeBrands.length);

  autoTable(doc, {
    ...AT,
    startY: y,
    head: [brandHead],
    body: brandBody,
    columnStyles: {
      0: { cellWidth: 52, fontStyle: "bold" },
      ...Object.fromEntries(activeBrands.map((b, i) => {
        const [br, bg2, bb] = HEX2RGB(BRAND_PALETTE[b].solid);
        return [i + 1, { cellWidth: brandColW, halign: "center" as const,
          textColor: [br, bg2, bb] as [number,number,number], fontStyle: "bold" as const }];
      })),
    },
    didParseCell: (data) => {
      if (data.section === "head") {
        if (data.column.index > 0) {
          const brand = activeBrands[data.column.index - 1];
          if (brand) data.cell.styles.fillColor = HEX2RGB(BRAND_PALETTE[brand].solid) as [number,number,number];
        }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 5;

  // ── 5. TREND TABLE ───────────────────────────────────────────────────────
  if (pdfTrendRows.length > 0) {
    y = secLabel(`Contact Trend  —  by ${pdfGran.charAt(0).toUpperCase() + pdfGran.slice(1)}`, y);

    const trendBody = pdfTrendRows.map(({ label, prevLabel: pLbl, curr, prev }) => {
      const d = prev > 0 ? ((curr - prev) / prev) * 100 : null;
      return [
        label,
        curr.toLocaleString(),
        `${prev.toLocaleString()}`,
        d !== null ? `${dSign(d)}${d.toFixed(1)}%` : "—",
        pLbl,
      ];
    });

    autoTable(doc, {
      ...AT,
      startY: y,
      head: [["Period (Current)", "Contacts", "Contacts (Prev)", "Change", "Period (Prev)"]],
      body: trendBody,
      styles: { ...AT.styles, fontSize: 7 },
      columnStyles: {
        // 38+28+28+24+66 = 184 = CW — fills full page width
        0: { cellWidth: 38, fontStyle: "bold" },
        1: { cellWidth: 28, halign: "center" as const, fontStyle: "bold" as const, textColor: HEX2RGB(BLUE) as [number,number,number] },
        2: { cellWidth: 28, halign: "center" as const, textColor: HEX2RGB(GRAY) as [number,number,number] },
        3: { cellWidth: 24, halign: "center" as const, fontStyle: "bold" as const },
        4: { cellWidth: 66, textColor: HEX2RGB(GRAY) as [number,number,number] },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const v = String(data.cell.raw ?? "");
          if (v.startsWith("+")) data.cell.styles.textColor = HEX2RGB(GREEN) as [number,number,number];
          else if (v.startsWith("-")) data.cell.styles.textColor = HEX2RGB(RED) as [number,number,number];
        }
      },
    });
  }

  // ── footer ────────────────────────────────────────────────────────────────
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.line(ML, 286, PW - MR, 286);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...HEX2RGB(GRAY));
  doc.text("American Bath Group  —  CRM Comparison Report  —  Confidential", ML, 291);
  doc.text("Page 1 of 1", PW - MR, 291, { align: "right" });

  doc.save(`ABG-CRM-Comparison-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}

// ─── sub-components ───────────────────────────────────────────────────────────
function Delta({ curr, prev, size = "md" }: { curr: number; prev: number; size?: "sm" | "md" }) {
  if (!prev) return <span className="text-[10px] text-muted-foreground/40">—</span>;
  const d  = ((curr - prev) / prev) * 100;
  const up = d > 0.4, dn = d < -0.4;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded-full font-semibold tabular-nums",
      size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
      up && "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
      dn && "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
      !up && !dn && "bg-muted text-muted-foreground",
    )}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : dn ? <TrendingDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
      {(up || dn) ? `${up ? "+" : ""}${d.toFixed(1)}%` : "—"}
    </span>
  );
}

function BarTooltip({ active, payload, label, currLabel, prevLabel }:
  { active?: boolean; payload?: any[]; label?: string; currLabel: string; prevLabel: string }) {
  if (!active || !payload?.length) return null;
  const curr  = payload.find((p: any) => p.dataKey === "curr");
  const prev  = payload.find((p: any) => p.dataKey === "prev");
  const delta = curr && prev && prev.value > 0 ? ((curr.value - prev.value) / prev.value) * 100 : null;
  return (
    <div className="rounded-xl border border-border bg-card shadow-xl px-4 py-3 text-xs min-w-[190px] space-y-2">
      <p className="font-bold text-sm text-foreground">{label}</p>
      <div className="space-y-1.5">
        {[{ p: curr, lbl: currLabel, dashed: false }, { p: prev, lbl: prevLabel, dashed: true }].map(({ p, lbl, dashed }) =>
          p ? (
            <div key={lbl} className="flex items-center justify-between gap-8">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className={cn("h-2.5 w-2.5 rounded-sm shrink-0", dashed && "border border-dashed border-muted-foreground/50")}
                  style={{ background: p.fill }} />
                {lbl}
              </span>
              <span className="font-bold text-foreground tabular-nums">{(p.value ?? 0).toLocaleString()}</span>
            </div>
          ) : null
        )}
      </div>
      {delta !== null && (
        <div className={cn("pt-1.5 border-t border-border text-[11px] font-semibold",
          delta > 0.4  ? "text-emerald-600 dark:text-emerald-400" :
          delta < -0.4 ? "text-red-500 dark:text-red-400" : "text-muted-foreground")}>
          {delta > 0.4 ? "▲" : delta < -0.4 ? "▼" : "→"} {Math.abs(delta).toFixed(1)}% vs previous period
        </div>
      )}
    </div>
  );
}

function TrendTooltip({ active, payload, label }:
  { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const curr = payload.find((p: any) => p.dataKey === "curr");
  const prev = payload.find((p: any) => p.dataKey === "prev");
  const prevLabel = payload[0]?.payload?.prevLabel;
  const currVal = curr?.value ?? 0;
  const prevVal = prev?.value ?? 0;
  const delta = prevVal > 0 ? ((currVal - prevVal) / prevVal) * 100 : null;
  return (
    <div className="rounded-xl border border-border bg-card shadow-xl px-4 py-3 text-xs min-w-[200px] space-y-2">
      <p className="font-bold text-sm text-foreground">{label}</p>
      <div className="space-y-1.5">
        {curr && (
          <div className="flex items-center justify-between gap-8">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0 bg-[#3B82F6]" />
              Current period
            </span>
            <span className="font-bold text-foreground tabular-nums">{currVal.toLocaleString()}</span>
          </div>
        )}
        {prev && (
          <div className="flex items-center justify-between gap-8">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-0.5 w-4 shrink-0 border-t-2 border-dashed border-[#F97316]" />
              {prevLabel || label}
            </span>
            <span className="font-semibold text-muted-foreground tabular-nums">{prevVal.toLocaleString()}</span>
          </div>
        )}
      </div>
      {delta !== null && (
        <div className={cn("pt-1.5 border-t border-border text-[11px] font-semibold",
          delta > 0.4  ? "text-emerald-600 dark:text-emerald-400" :
          delta < -0.4 ? "text-red-500 dark:text-red-400" : "text-muted-foreground")}>
          {delta > 0.4 ? "▲" : delta < -0.4 ? "▼" : "→"} {Math.abs(delta).toFixed(1)}% vs previous
        </div>
      )}
    </div>
  );
}

// ─── main export ──────────────────────────────────────────────────────────────
export function CRMComparisonTab({ userEmail }: { userEmail: string }) {
  if (!ALLOWED_EMAILS.has(userEmail)) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        You don't have access to this report.
      </div>
    );
  }
  return <ComparisonContent />;
}

function ComparisonContent() {
  const [selectedDays,   setSelectedDays]   = useState<number | null>(null);
  const [selectedBrands, setSelectedBrands] = useState<SecondaryBrand[]>([]);
  const [results,        setResults]        = useState<BrandResults | null>(null);
  const [currSeries,     setCurrSeries]     = useState<TimeSeries | null>(null);
  const [prevSeries,     setPrevSeries]     = useState<TimeSeries | null>(null);
  const [granularity,    setGranularity]    = useState<Granularity>("week");
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const reqRef = useRef(0);

  function toggleBrand(b: SecondaryBrand) {
    setSelectedBrands(p => p.includes(b) ? p.filter(x => x !== b) : p.length < 3 ? [...p, b] : p);
  }

  function runReport(days: number | null, brands: SecondaryBrand[]) {
    if (!days || !brands.length) return;
    const id = ++reqRef.current;
    setLoading(true); setError(null);
    const { currStart, currEnd, prevStart, prevEnd } = getPeriods(days);
    Promise.all([
      fetchAllBrandsForPeriod(brands, currStart, currEnd),
      fetchAllBrandsForPeriod(brands, prevStart, prevEnd),
    ]).then(([cRes, pRes]) => {
      if (reqRef.current !== id) return;
      const map = {} as BrandResults;
      for (const b of brands) map[b] = { curr: cRes.periodData[b], prev: pRes.periodData[b] };
      setResults(map);
      setCurrSeries(cRes.timeSeries);
      setPrevSeries(pRes.timeSeries);
      setLoading(false);
    }).catch(e => {
      if (reqRef.current !== id) return;
      setError(e instanceof Error ? e.message : "Failed to load");
      setLoading(false);
    });
  }

  const periods   = selectedDays ? getPeriods(selectedDays) : null;
  const currLabel = periods ? `${format(periods.currStart, "MMM d")} – ${format(periods.currEnd, "MMM d, yyyy")}` : "";
  const prevLabel = periods ? `${format(periods.prevStart, "MMM d")} – ${format(periods.prevEnd, "MMM d, yyyy")}` : "";
  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
  const canRun    = !!selectedDays && selectedBrands.length > 0;

  // Build trend rows whenever we have series data
  const trendRows = (currSeries && prevSeries && selectedDays && periods)
    ? buildTrendRows(currSeries, prevSeries, periods.currStart, periods.prevStart, selectedDays, granularity)
    : [];

  // x-axis tick interval — show fewer labels when many points
  const tickInterval = trendRows.length > 60 ? 13
    : trendRows.length > 30 ? 6
    : trendRows.length > 14 ? 3
    : 0;

  return (
    <div className="space-y-5 p-6">

      {/* ══ TOOLBAR ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-card px-5 py-3.5 shadow-sm">

        {/* Period pills */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1">
          {PERIOD_OPTIONS.map(({ label, days, full }) => (
            <button key={days} title={full} onClick={() => setSelectedDays(days)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-bold cursor-pointer transition-all duration-150",
                selectedDays === days
                  ? "bg-[#3B82F6] text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}>
              {label}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Brand toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          {SECONDARY_BRANDS.map((brand) => {
            const active = selectedBrands.includes(brand);
            const { solid, bg } = BRAND_PALETTE[brand];
            return (
              <button key={brand} onClick={() => toggleBrand(brand)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all duration-200",
                  active ? "border-transparent text-white shadow-sm" : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
                )}
                style={active ? { background: solid } : {}}>
                <span className="h-2 w-2 rounded-full shrink-0 transition-all"
                  style={{ background: active ? "rgba(255,255,255,0.7)" : solid }} />
                {brand}
                {active && <Check className="h-3 w-3 ml-0.5" />}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Download PDF — visible only when results are loaded */}
        {results && !loading && (
          <button
            onClick={() => {
              const activeBrands = selectedBrands.filter(b => results[b]);
              downloadPDF({
                currLabel, prevLabel,
                selectedDays: selectedDays!,
                activeBrands,
                results,
                trendRows,
                granularity,
                currSeries: currSeries!,
                prevSeries: prevSeries!,
                currStart: periods!.currStart,
                prevStart: periods!.prevStart,
              });
            }}
            className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground cursor-pointer hover:bg-muted transition-all duration-150 shadow-sm">
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </button>
        )}

        <button
          onClick={() => runReport(selectedDays, selectedBrands)}
          disabled={loading || !canRun}
          className="flex items-center gap-2 rounded-xl bg-[#3B82F6] px-5 py-2 text-xs font-bold text-white cursor-pointer hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shadow-sm">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {loading ? "Loading…" : "Run Report"}
        </button>
      </div>

      {/* ══ EMPTY STATE ══════════════════════════════════════════════════════ */}
      {!loading && !results && !error && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/10 py-24 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3B82F6]/10">
            <Users className="h-6 w-6 text-[#3B82F6]" />
          </div>
          <p className="text-base font-bold text-foreground">Select a period and brand to start</p>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-sm mx-auto">
            {!selectedDays && !selectedBrands.length
              ? "Choose a time range and at least one brand above, then click Run Report"
              : !selectedDays ? "Choose a time range, then click Run Report"
              : !selectedBrands.length ? "Select at least one brand above, then click Run Report"
              : "Click Run Report to load the comparison data"}
          </p>
        </div>
      )}

      {loading && <WaterFillLoader fullScreen={false} message="Fetching comparison data…" />}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {/* ══ RESULTS ══════════════════════════════════════════════════════════ */}
      {!loading && results && (() => {
        const activeBrands = selectedBrands.filter(b => results[b]);

        // Aggregate totals per metric
        const grandTotals = METRICS.map(({ key, label, Icon, color }) => {
          const grandCurr = activeBrands.reduce((s, b) => s + results[b].curr[key], 0);
          const grandPrev = activeBrands.reduce((s, b) => s + results[b].prev[key], 0);
          const d = grandPrev > 0 ? ((grandCurr - grandPrev) / grandPrev) * 100 : null;
          return { key, label, Icon, color, grandCurr, grandPrev, d };
        });

        // Top insight: metric with biggest absolute % change
        const topInsight = grandTotals
          .filter(m => m.d !== null && Math.abs(m.d!) > 0.4)
          .sort((a, b) => Math.abs(b.d!) - Math.abs(a.d!))[0];

        const totalCurr     = trendRows.reduce((s, r) => s + r.curr, 0);
        const totalPrev     = trendRows.reduce((s, r) => s + r.prev, 0);
        const trendDelta    = totalPrev > 0 ? ((totalCurr - totalPrev) / totalPrev) * 100 : null;
        const showTrendLabels = trendRows.length <= 20;
        const maxTrendBar   = granularity === "month" ? 72 : granularity === "week" ? 40 : 12;

        return (
          <div className="space-y-4">

            {/* ── Period Summary Header ────────────────────────────────── */}
            <div className="rounded-2xl border border-border bg-gradient-to-br from-[#3B82F6]/5 via-card to-card overflow-hidden">
              <div className="flex flex-wrap items-center gap-4 px-6 py-4">
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#3B82F6]">CRM Comparison Report</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeBrands.map(brand => (
                      <span key={brand}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white shadow-sm"
                        style={{ background: BRAND_PALETTE[brand].solid }}>
                        <span className="h-1.5 w-1.5 rounded-full bg-white/60 shrink-0" />
                        {brand}
                      </span>
                    ))}
                  </div>
                  {topInsight && (
                    <p className={cn("text-[11px] font-semibold",
                      topInsight.d! > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                      {topInsight.d! > 0 ? "▲" : "▼"} {topInsight.label} {topInsight.d! > 0 ? "up" : "down"} {Math.abs(topInsight.d!).toFixed(1)}% vs previous period
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="rounded-xl bg-[#3B82F6]/10 px-4 py-2.5 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#3B82F6] mb-0.5">Current</p>
                    <p className="text-xs font-bold text-foreground whitespace-nowrap">{currLabel}</p>
                  </div>
                  <span className="text-xs font-black text-muted-foreground/50">vs</span>
                  <div className="rounded-xl bg-muted/50 px-4 py-2.5 text-center">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Previous</p>
                    <p className="text-xs font-semibold text-muted-foreground whitespace-nowrap">{prevLabel}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── KPI Row ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {grandTotals.map(({ key, label, Icon, color, grandCurr, grandPrev, d }) => {
                const up = d !== null && d > 0.4;
                const dn = d !== null && d < -0.4;
                return (
                  <div key={key} className="relative rounded-2xl border border-border bg-card overflow-hidden">
                    {/* Left accent bar */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: color }} />
                    <div className="pl-6 pr-5 pt-5 pb-5 space-y-3.5">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl shrink-0"
                            style={{ background: `${color}15` }}>
                            <Icon className="h-4 w-4" style={{ color }} />
                          </div>
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
                        </div>
                        {d !== null && (
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0",
                            up  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" :
                            dn  ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400" :
                                  "bg-muted text-muted-foreground",
                          )}>
                            {up ? <TrendingUp className="h-2.5 w-2.5" /> : dn ? <TrendingDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                            {up ? "+" : ""}{d.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      {/* Big number */}
                      <div>
                        <p className="text-5xl font-black tabular-nums text-foreground leading-none">
                          {grandCurr.toLocaleString()}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          vs <span className="font-semibold text-foreground/80 tabular-nums">{grandPrev.toLocaleString()}</span> previous period
                        </p>
                      </div>
                      {/* Per-brand rows */}
                      {activeBrands.length > 1 && (
                        <div className="pt-3 border-t border-border/60 space-y-2.5">
                          {activeBrands.map(brand => {
                            const curr = results[brand].curr[key];
                            const prev = results[brand].prev[key];
                            return (
                              <div key={brand} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: BRAND_PALETTE[brand].solid }} />
                                  <span className="text-[11px] text-muted-foreground truncate">{BRAND_SHORT[brand]}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[11px] font-bold tabular-nums text-foreground">{curr.toLocaleString()}</span>
                                  <Delta curr={curr} prev={prev} size="sm" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Trend Chart ─────────────────────────────────────────── */}
            {trendRows.length > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-5 pb-4 border-b border-border bg-gradient-to-r from-muted/20 to-transparent">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">New Contacts Over Time</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Per {granularity} — current vs previous period
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="hidden sm:flex items-center gap-5 rounded-xl bg-muted/30 px-4 py-2.5">
                      <div className="text-center">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Current</p>
                        <p className="text-lg font-black tabular-nums text-[#3B82F6]">{totalCurr.toLocaleString()}</p>
                      </div>
                      {trendDelta !== null && (
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
                          trendDelta > 0.4  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" :
                          trendDelta < -0.4 ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {trendDelta > 0.4 ? <TrendingUp className="h-3 w-3" /> : trendDelta < -0.4 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {trendDelta > 0 ? "+" : ""}{trendDelta.toFixed(1)}%
                        </span>
                      )}
                      <div className="text-center">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Previous</p>
                        <p className="text-lg font-black tabular-nums text-slate-400">{totalPrev.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="h-5 w-px bg-border hidden sm:block" />
                    <div className="flex items-center gap-0.5 rounded-xl border border-border p-0.5 bg-muted/30">
                      {(["day", "week", "month"] as Granularity[]).map(g => (
                        <button key={g} onClick={() => setGranularity(g)}
                          className={cn(
                            "rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all duration-150",
                            granularity === g ? "bg-[#3B82F6] text-white shadow-sm" : "text-muted-foreground hover:text-foreground",
                          )}>
                          {g === "day" ? "Day" : g === "week" ? "Week" : "Month"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="px-4 pt-6 pb-2">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={trendRows}
                      margin={{ top: showTrendLabels ? 26 : 10, right: 16, bottom: 4, left: 0 }}
                      barCategoryGap={trendRows.length > 20 ? "18%" : "30%"}
                      barGap={4}
                    >
                      <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                      <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} interval={tickInterval} dy={6} />
                      <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={36}
                        tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                        allowDecimals={false} />
                      <Tooltip content={<TrendTooltip />}
                        cursor={{ fill: "hsl(var(--muted))", opacity: 0.35, radius: [4, 4, 0, 0] } as any} />
                      <Bar dataKey="prev" name="Previous" fill="#CBD5E1" radius={[4, 4, 0, 0]} maxBarSize={maxTrendBar}>
                        {showTrendLabels && (
                          <LabelList dataKey="prev" position="top"
                            style={{ fontSize: 10, fill: "#94A3B8", fontWeight: 600 }}
                            formatter={(v: number) => v > 0 ? v : ""} />
                        )}
                      </Bar>
                      <Bar dataKey="curr" name="Current" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={maxTrendBar}>
                        {showTrendLabels && (
                          <LabelList dataKey="curr" position="top"
                            style={{ fontSize: 11, fill: "#1E40AF", fontWeight: 800 }}
                            formatter={(v: number) => v > 0 ? v : ""} />
                        )}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="px-6 pb-5 pt-2 flex items-center gap-6 text-xs text-muted-foreground border-t border-border">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm bg-[#3B82F6] shrink-0" />
                    <span className="font-semibold text-foreground">Current</span>&nbsp;{currLabel}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm bg-slate-300 shrink-0" />
                    <span className="font-semibold text-foreground">Previous</span>&nbsp;{prevLabel}
                  </span>
                </div>
              </div>
            )}

            {/* ── Brand Comparison Matrix ──────────────────────────────── */}
            {activeBrands.length >= 1 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Brand Breakdown</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">All metrics compared by brand</p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" /> up vs prev
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-500" /> down vs prev
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          Metric
                        </th>
                        {activeBrands.map(brand => (
                          <th key={brand} className="px-6 py-3.5 text-center text-[11px] font-bold">
                            <div className="flex flex-col items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: BRAND_PALETTE[brand].solid }} />
                              <span style={{ color: BRAND_PALETTE[brand].solid }}>{BRAND_SHORT[brand]}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {METRICS.map(({ key, label, Icon, color }, rowIdx) => (
                        <tr key={key} className={cn(
                          "border-b border-border/50 transition-colors hover:bg-muted/20 cursor-default",
                          rowIdx % 2 === 0 ? "bg-background" : "bg-muted/10"
                        )}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                                style={{ background: `${color}12` }}>
                                <Icon className="h-3.5 w-3.5" style={{ color }} />
                              </div>
                              <span className="text-xs font-semibold text-foreground">{label}</span>
                            </div>
                          </td>
                          {activeBrands.map(brand => {
                            const curr = results[brand].curr[key];
                            const prev = results[brand].prev[key];
                            const d = prev > 0 ? ((curr - prev) / prev) * 100 : null;
                            const up = d !== null && d > 0.4;
                            const dn = d !== null && d < -0.4;
                            return (
                              <td key={brand} className="px-6 py-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-2xl font-black tabular-nums text-foreground leading-none">
                                    {curr.toLocaleString()}
                                  </span>
                                  {d !== null && (
                                    <span className={cn(
                                      "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold",
                                      up ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" :
                                      dn ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400" :
                                           "bg-muted text-muted-foreground"
                                    )}>
                                      {up ? <TrendingUp className="h-2.5 w-2.5" /> : dn ? <TrendingDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                                      {up ? "+" : ""}{d.toFixed(1)}%
                                    </span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground tabular-nums">
                                    prev {prev.toLocaleString()}
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        );
      })()}
    </div>
  );
}
