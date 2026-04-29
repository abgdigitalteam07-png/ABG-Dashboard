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

function downloadPDF(opts: {
  currLabel: string; prevLabel: string; selectedDays: number;
  activeBrands: SecondaryBrand[]; results: BrandResults;
  trendRows: TrendRow[]; granularity: Granularity;
}) {
  const { currLabel, prevLabel, activeBrands, results, trendRows, granularity } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const PW = 210, PH = 297;
  const ML = 14, MR = 14;
  const CW = PW - ML - MR;
  let y = 0;

  // ── colour helpers ──────────────────────────────────────────────────────────
  type RGB = [number, number, number];
  const C_BLUE:  RGB = [59, 130, 246];
  const C_DARK:  RGB = [30,  41,  59];
  const C_GRAY:  RGB = [100, 116, 139];
  const C_LGRAY: RGB = [241, 245, 249];
  const C_WHITE: RGB = [255, 255, 255];
  const C_GREEN: RGB = [16,  185, 129];
  const C_RED:   RGB = [239,  68,  68];
  const C_SLATE: RGB = [203, 213, 225];
  const C_LINE:  RGB = [226, 232, 240];
  const hex2rgb = (h: string): RGB => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const setFill  = (...c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setStroke= (...c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const setTxt   = (...c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const deltaClr = (d: number): RGB => d > 0.4 ? C_GREEN : d < -0.4 ? C_RED : C_GRAY;

  // ── page helpers ────────────────────────────────────────────────────────────
  const addFooter = () => {
    const pg = doc.getCurrentPageInfo().pageNumber;
    const total = doc.getNumberOfPages();
    setStroke(...C_LINE); doc.setLineWidth(0.3);
    doc.line(ML, 285, PW - MR, 285);
    setTxt(...C_GRAY); doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
    doc.text("American Bath Group — CRM Comparison Report — Confidential", ML, 290);
    doc.text(`Page ${pg} of ${total}`, PW - MR, 290, { align: "right" });
  };
  const ensureSpace = (need: number) => {
    if (y + need > 278) {
      addFooter();
      doc.addPage();
      y = 22;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 1 ── COVER HEADER
  // ═══════════════════════════════════════════════════════════════════════════
  setFill(...C_BLUE); doc.rect(0, 0, PW, 32, "F");
  // white accent stripe
  setFill(255, 255, 255); doc.setGState(new (doc as any).GState({ opacity: 0.07 }));
  doc.rect(0, 0, PW, 32, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  setTxt(...C_WHITE);
  doc.setFontSize(17); doc.setFont("helvetica", "bold");
  doc.text("CRM Contact Comparison Report", ML, 13);
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
  doc.text("American Bath Group — Brand Performance Hub", ML, 20);
  doc.text(`Generated: ${format(new Date(), "MMM d, yyyy · h:mm a")}`, PW - MR, 13, { align: "right" });

  y = 42;

  // ═══════════════════════════════════════════════════════════════════════════
  // 2 ── PERIOD CONTEXT BOX
  // ═══════════════════════════════════════════════════════════════════════════
  setFill(...C_LGRAY); doc.roundedRect(ML, y, CW, 22, 3, 3, "F");
  setStroke(...C_LINE); doc.setLineWidth(0.3); doc.roundedRect(ML, y, CW, 22, 3, 3, "S");

  // current period
  setFill(...C_BLUE); doc.rect(ML + 4, y + 5, 3, 4, "F");
  setTxt(...C_DARK); doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
  doc.text("Current Period", ML + 10, y + 8.2);
  doc.setFont("helvetica", "normal"); setTxt(...C_GRAY);
  doc.text(currLabel, ML + 10 + doc.getTextWidth("Current Period  "), y + 8.2);

  // previous period
  setFill(...C_SLATE); doc.rect(ML + 4, y + 13, 3, 4, "F");
  setTxt(...C_DARK); doc.setFont("helvetica", "bold");
  doc.text("Previous Period", ML + 10, y + 16.2);
  doc.setFont("helvetica", "normal"); setTxt(...C_GRAY);
  doc.text(prevLabel, ML + 10 + doc.getTextWidth("Previous Period  "), y + 16.2);

  // brands (right side)
  setTxt(...C_BLUE); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  doc.text("BRANDS ANALYZED", PW - MR, y + 6, { align: "right" });
  setTxt(...C_DARK); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  activeBrands.forEach((b, i) => doc.text(b, PW - MR, y + 10.5 + i * 4.5, { align: "right" }));

  y += 30;

  // ═══════════════════════════════════════════════════════════════════════════
  // 3 ── PERFORMANCE SUMMARY TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  // section title
  setTxt(...C_BLUE); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("▌ PERFORMANCE SUMMARY", ML, y); y += 6;

  const COL = [ML, ML + 68, ML + 100, ML + 130, ML + 158];
  const ROW_H = 8;

  // thead
  setFill(...C_DARK); doc.rect(ML, y, CW, ROW_H, "F");
  setTxt(...C_WHITE); doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
  ["Metric", "Current", "Previous", "Change", "Trend"].forEach((h, i) =>
    doc.text(h, COL[i] + 2, y + 5.5)
  );
  y += ROW_H;

  METRICS.forEach(({ key, label }, ri) => {
    const gCurr = activeBrands.reduce((s, b) => s + results[b].curr[key], 0);
    const gPrev = activeBrands.reduce((s, b) => s + results[b].prev[key], 0);
    const d     = gPrev > 0 ? ((gCurr - gPrev) / gPrev) * 100 : null;
    const up    = d !== null && d > 0.4;
    const dn    = d !== null && d < -0.4;

    setFill(...(ri % 2 === 0 ? C_LGRAY : C_WHITE)); doc.rect(ML, y, CW, ROW_H, "F");

    setTxt(...C_DARK); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(label, COL[0] + 2, y + 5.5);
    doc.setFont("helvetica", "bold"); setTxt(...C_BLUE);
    doc.text(gCurr.toLocaleString(), COL[1] + 2, y + 5.5);
    doc.setFont("helvetica", "normal"); setTxt(...C_GRAY);
    doc.text(gPrev.toLocaleString(), COL[2] + 2, y + 5.5);

    if (d !== null) {
      setTxt(...deltaClr(d));
      doc.setFont("helvetica", "bold");
      doc.text(`${up ? "+" : ""}${d.toFixed(1)}%`, COL[3] + 2, y + 5.5);
    }
    // mini trend bar
    const maxV = Math.max(gCurr, gPrev, 1);
    const barW = 24;
    setFill(...C_LGRAY); doc.rect(COL[4] + 2, y + 2.5, barW, 3, "F");
    setFill(...C_BLUE); doc.rect(COL[4] + 2, y + 2.5, (gCurr / maxV) * barW, 3, "F");
    setFill(...C_SLATE); doc.rect(COL[4] + 2, y + 6, (gPrev / maxV) * barW, 2, "F");

    y += ROW_H;
  });
  // border
  setStroke(...C_LINE); doc.setLineWidth(0.3);
  doc.rect(ML, y - METRICS.length * ROW_H - ROW_H, CW, METRICS.length * ROW_H + ROW_H, "S");
  y += 10;

  // ═══════════════════════════════════════════════════════════════════════════
  // 4 ── BRAND BREAKDOWN
  // ═══════════════════════════════════════════════════════════════════════════
  ensureSpace(20);
  setTxt(...C_BLUE); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("▌ BRAND BREAKDOWN", ML, y); y += 7;

  activeBrands.forEach((brand) => {
    ensureSpace(METRICS.length * ROW_H + 24);
    const [br, bg2, bb] = hex2rgb(BRAND_PALETTE[brand].solid);

    // brand header row
    setFill(br, bg2, bb); doc.rect(ML, y, CW, 9, "F");
    setTxt(...C_WHITE); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(brand, ML + 4, y + 6.2);
    setTxt(255, 255, 255); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text(`${currLabel}  vs  ${prevLabel}`, PW - MR, y + 6.2, { align: "right" });
    y += 9;

    // col headers
    setFill(...C_LGRAY); doc.rect(ML, y, CW, 6.5, "F");
    setTxt(...C_GRAY); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    ["Metric", "Current", "Previous", "Change", "Visual"].forEach((h, i) =>
      doc.text(h, COL[i] + 2, y + 4.5)
    );
    y += 6.5;

    METRICS.forEach(({ key, label }, ri) => {
      const curr = results[brand].curr[key];
      const prev = results[brand].prev[key];
      const d    = prev > 0 ? ((curr - prev) / prev) * 100 : null;
      const up   = d !== null && d > 0.4;

      setFill(...(ri % 2 === 0 ? C_LGRAY : C_WHITE)); doc.rect(ML, y, CW, ROW_H, "F");
      setTxt(...C_DARK); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text(label, COL[0] + 2, y + 5.5);
      doc.setFont("helvetica", "bold"); doc.setTextColor(br, bg2, bb);
      doc.text(curr.toLocaleString(), COL[1] + 2, y + 5.5);
      doc.setFont("helvetica", "normal"); setTxt(...C_GRAY);
      doc.text(prev.toLocaleString(), COL[2] + 2, y + 5.5);
      if (d !== null) {
        setTxt(...deltaClr(d)); doc.setFont("helvetica", "bold");
        doc.text(`${up ? "+" : ""}${d.toFixed(1)}%`, COL[3] + 2, y + 5.5);
      }
      const maxV = Math.max(curr, prev, 1);
      const bW = 24;
      setFill(235, 248, 255); doc.rect(COL[4] + 2, y + 2, bW, 2.5, "F");
      setFill(br, bg2, bb);   doc.rect(COL[4] + 2, y + 2, (curr / maxV) * bW, 2.5, "F");
      setFill(...C_SLATE);    doc.rect(COL[4] + 2, y + 5.5, (prev / maxV) * bW, 1.8, "F");
      y += ROW_H;
    });

    setStroke(...C_LINE); doc.setLineWidth(0.3);
    doc.rect(ML, y - METRICS.length * ROW_H - 6.5, CW, METRICS.length * ROW_H + 6.5, "S");
    y += 8;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5 ── TREND DATA TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  if (trendRows.length > 0) {
    ensureSpace(30);
    setTxt(...C_BLUE); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(`▌ CONTACT TREND — BY ${granularity.toUpperCase()}`, ML, y); y += 7;

    const TC = [ML, ML + 48, ML + 90, ML + 128, ML + 158];
    const TH = 6.5;

    // thead
    setFill(...C_DARK); doc.rect(ML, y, CW, TH + 1, "F");
    setTxt(...C_WHITE); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    ["Period", "Current", "Previous period", "Change", "Bar"].forEach((h, i) =>
      doc.text(h, TC[i] + 2, y + 4.8)
    );
    y += TH + 1;

    trendRows.forEach(({ label, prevLabel: pLbl, curr, prev }, ri) => {
      ensureSpace(TH + 2);
      const d  = prev > 0 ? ((curr - prev) / prev) * 100 : null;
      const up = d !== null && d > 0.4;

      setFill(...(ri % 2 === 0 ? C_LGRAY : C_WHITE)); doc.rect(ML, y, CW, TH, "F");
      setTxt(...C_GRAY); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      doc.text(label, TC[0] + 2, y + 4.4);
      setTxt(...C_BLUE); doc.setFont("helvetica", "bold");
      doc.text(String(curr), TC[1] + 2, y + 4.4);
      doc.setFont("helvetica", "normal"); setTxt(...C_GRAY);
      doc.text(`${String(prev)}  (${pLbl})`, TC[2] + 2, y + 4.4);
      if (d !== null) {
        setTxt(...deltaClr(d)); doc.setFont("helvetica", "bold");
        doc.text(`${up ? "+" : ""}${d.toFixed(1)}%`, TC[3] + 2, y + 4.4);
      }
      // mini bar
      const maxV = Math.max(curr, prev, 1);
      const bW   = 24;
      setFill(235, 248, 255); doc.rect(TC[4] + 2, y + 1.2, bW, 2.2, "F");
      setFill(...C_BLUE);    doc.rect(TC[4] + 2, y + 1.2, (curr / maxV) * bW, 2.2, "F");
      setFill(...C_SLATE);   doc.rect(TC[4] + 2, y + 4,   (prev / maxV) * bW, 1.5, "F");
      y += TH;
    });

    setStroke(...C_LINE); doc.setLineWidth(0.3);
    doc.rect(ML, y - trendRows.length * TH - TH - 1, CW, trendRows.length * TH + TH + 1, "S");
  }

  // ── footers on all pages ────────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let pg = 1; pg <= total; pg++) {
    doc.setPage(pg);
    setStroke(...C_LINE); doc.setLineWidth(0.3);
    doc.line(ML, 285, PW - MR, 285);
    setTxt(...C_GRAY); doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
    doc.text("American Bath Group — CRM Comparison Report — Confidential", ML, 290);
    doc.text(`Page ${pg} of ${total}`, PW - MR, 290, { align: "right" });
  }

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

        // ── period context banner ──────────────────────────────────────────
        const periodBanner = (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-muted/20 px-5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-sm bg-[#3B82F6] shrink-0" />
              <span className="text-[11px] text-muted-foreground">
                <span className="font-bold text-foreground">Current period</span>&nbsp; {currLabel}
              </span>
            </div>
            <span className="text-muted-foreground/40 text-xs font-bold">vs</span>
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-sm bg-slate-300 shrink-0" />
              <span className="text-[11px] text-muted-foreground">
                <span className="font-bold text-foreground">Previous period</span>&nbsp; {prevLabel}
              </span>
            </div>
          </div>
        );

        // ── KPI hero cards ─────────────────────────────────────────────────
        const kpiSection = (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {METRICS.map(({ key, label, Icon, color }) => {
              const grandCurr = activeBrands.reduce((s, b) => s + results[b].curr[key], 0);
              const grandPrev = activeBrands.reduce((s, b) => s + results[b].prev[key], 0);
              const d = grandPrev > 0 ? ((grandCurr - grandPrev) / grandPrev) * 100 : null;
              const up = d !== null && d > 0.4;
              const dn = d !== null && d < -0.4;
              // Visual ratio bar: how much of (max of curr/prev) is curr?
              const maxVal = Math.max(grandCurr, grandPrev, 1);
              const currPct = (grandCurr / maxVal) * 100;
              const prevPct = (grandPrev / maxVal) * 100;
              return (
                <div key={key} className="rounded-2xl border border-border bg-card overflow-hidden">
                  {/* colored top accent */}
                  <div className="h-1 w-full" style={{ background: color }} />
                  <div className="p-5 space-y-4">
                    {/* header row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
                          style={{ background: `${color}15` }}>
                          <Icon className="h-4.5 w-4.5" style={{ color }} />
                        </div>
                        <p className="text-sm font-bold text-foreground">{label}</p>
                      </div>
                      {d !== null && (
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
                          up  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" :
                          dn  ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400" :
                                "bg-muted text-muted-foreground",
                        )}>
                          {up ? <TrendingUp className="h-3 w-3" /> : dn ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {up ? "+" : ""}{d.toFixed(1)}%
                        </span>
                      )}
                    </div>

                    {/* big numbers */}
                    <div>
                      <p className="text-5xl font-black tabular-nums text-foreground leading-none">
                        {grandCurr.toLocaleString()}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                        vs&nbsp;
                        <span className="font-semibold text-foreground">{grandPrev.toLocaleString()}</span>
                        &nbsp;previous period
                      </p>
                    </div>

                    {/* visual comparison bars */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-14 text-[10px] font-semibold text-muted-foreground shrink-0">Current</span>
                        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${currPct}%`, background: color }} />
                        </div>
                        <span className="w-10 text-right text-[10px] font-bold tabular-nums text-foreground shrink-0">
                          {grandCurr.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-14 text-[10px] font-semibold text-muted-foreground shrink-0">Previous</span>
                        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-slate-300 dark:bg-slate-600 transition-all duration-700"
                            style={{ width: `${prevPct}%` }} />
                        </div>
                        <span className="w-10 text-right text-[10px] tabular-nums text-muted-foreground shrink-0">
                          {grandPrev.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* per-brand breakdown */}
                    {activeBrands.length > 1 && (
                      <div className="pt-3 border-t border-border space-y-2">
                        {activeBrands.map(brand => {
                          const curr  = results[brand].curr[key];
                          const prev  = results[brand].prev[key];
                          const share = grandCurr > 0 ? (curr / grandCurr) * 100 : 0;
                          const { solid, bg } = BRAND_PALETTE[brand];
                          return (
                            <div key={brand} className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: solid }} />
                              <span className="flex-1 text-[11px] text-muted-foreground truncate min-w-0">{brand}</span>
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
        );

        // ── trend chart ────────────────────────────────────────────────────
        const totalCurr  = trendRows.reduce((s, r) => s + r.curr, 0);
        const totalPrev  = trendRows.reduce((s, r) => s + r.prev, 0);
        const trendDelta = totalPrev > 0 ? ((totalCurr - totalPrev) / totalPrev) * 100 : null;
        const showTrendLabels = trendRows.length <= 20;
        const maxTrendBar = granularity === "month" ? 72 : granularity === "week" ? 40 : 12;

        const trendSection = trendRows.length > 0 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-5 pb-4 border-b border-border">
              <div>
                <h3 className="text-sm font-bold text-foreground">New Contacts Over Time</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  How many contacts were created per {granularity} — current vs previous period
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Totals */}
                <div className="hidden sm:flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Current total</p>
                    <p className="text-lg font-black tabular-nums text-[#3B82F6]">{totalCurr.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Previous total</p>
                    <p className="text-lg font-black tabular-nums text-slate-400">{totalPrev.toLocaleString()}</p>
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
                </div>
                <div className="h-5 w-px bg-border hidden sm:block" />
                {/* Granularity toggle */}
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

            <div className="px-4 pt-6 pb-4">
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
                  {/* Previous period — slate gray */}
                  <Bar dataKey="prev" name="Previous" fill="#CBD5E1" radius={[4, 4, 0, 0]} maxBarSize={maxTrendBar}>
                    {showTrendLabels && (
                      <LabelList dataKey="prev" position="top"
                        style={{ fontSize: 10, fill: "#94A3B8", fontWeight: 600 }}
                        formatter={(v: number) => v > 0 ? v : ""} />
                    )}
                  </Bar>
                  {/* Current period — blue */}
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

            <div className="px-6 pb-5 flex items-center gap-6 text-xs text-muted-foreground border-t border-border pt-3">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-[#3B82F6] shrink-0" />
                <span className="font-semibold text-foreground">Current</span> {currLabel}
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm bg-slate-300 shrink-0" />
                <span className="font-semibold text-foreground">Previous</span> {prevLabel}
              </span>
            </div>
          </div>
        );

        // ── brand scorecards ──────────────────────────────────────────────
        const brandScorecard = activeBrands.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-1">Brand Breakdown</p>
            {activeBrands.map(brand => {
              const { solid, faded, bg } = BRAND_PALETTE[brand];
              return (
                <div key={brand} className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                  {/* brand header */}
                  <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border"
                    style={{ background: bg }}>
                    <span className="h-3.5 w-3.5 rounded-full shrink-0 shadow-sm" style={{ background: solid }} />
                    <span className="text-sm font-bold text-foreground">{brand}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{currLabel}</span>
                  </div>
                  {/* metrics row */}
                  <div className="grid grid-cols-3 divide-x divide-border">
                    {METRICS.map(({ key, label, Icon, color }) => {
                      const curr = results[brand].curr[key];
                      const prev = results[brand].prev[key];
                      const d2   = prev > 0 ? ((curr - prev) / prev) * 100 : null;
                      const up2  = d2 !== null && d2 > 0.4;
                      const dn2  = d2 !== null && d2 < -0.4;
                      const maxV = Math.max(curr, prev, 1);
                      return (
                        <div key={key} className="px-5 py-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                              style={{ background: `${color}15` }}>
                              <Icon className="h-3.5 w-3.5" style={{ color }} />
                            </div>
                            <p className="text-[11px] font-semibold text-muted-foreground leading-none">{label}</p>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black tabular-nums text-foreground leading-none">
                              {curr.toLocaleString()}
                            </span>
                            {d2 !== null && (
                              <span className={cn(
                                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                                up2 ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" :
                                dn2 ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400" :
                                      "bg-muted text-muted-foreground",
                              )}>
                                {up2 ? <TrendingUp className="h-2.5 w-2.5" /> : dn2 ? <TrendingDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                                {up2 ? "+" : ""}{d2.toFixed(1)}%
                              </span>
                            )}
                          </div>
                          {/* mini comparison bars */}
                          <div className="space-y-1">
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${(curr / maxV) * 100}%`, background: color }} />
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-slate-300 dark:bg-slate-600 transition-all duration-700"
                                style={{ width: `${(prev / maxV) * 100}%` }} />
                            </div>
                            <p className="text-[10px] text-muted-foreground tabular-nums">
                              prev&nbsp;<span className="font-semibold">{prev.toLocaleString()}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );

        return (
          <div className="space-y-5">
            {periodBanner}
            {kpiSection}
            {trendSection}
            {brandScorecard}
          </div>
        );
      })()}
    </div>
  );
}
