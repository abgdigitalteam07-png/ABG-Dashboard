import { useState, useRef, useMemo, useEffect } from "react";
import { subDays, format, addDays, parseISO, startOfWeek, startOfMonth } from "date-fns";
import { callFunction } from "@/lib/api-client";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import { TrendingUp, TrendingDown, Minus, RefreshCw, Check, Users, UserCheck, UserX, Download, CalendarX2, X } from "lucide-react";
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

type BrandSeriesMap = Partial<Record<SecondaryBrand, TimeSeries>>;

interface DealerRow { email: string; name: string; state: string; zip: string; count: number; }
type BrandDealerMap = Partial<Record<SecondaryBrand, DealerRow[]>>;

/** Zero-out excluded dates in a TimeSeries so they don't count in KPIs or trends */
function filterSeries(series: TimeSeries, excluded: string[]): TimeSeries {
  if (!excluded.length) return series;
  const out: TimeSeries = {};
  for (const [date, count] of Object.entries(series)) {
    out[date] = excluded.includes(date) ? 0 : count;
  }
  return out;
}

async function fetchAllBrandsForPeriod(
  brands: SecondaryBrand[], from: Date, to: Date,
): Promise<{
  periodData:  Record<SecondaryBrand, PeriodData>;
  timeSeries:  TimeSeries;
  brandSeries: BrandSeriesMap;
  brandDealerBreakdown: BrandDealerMap;
}> {
  const data = await callFunction("hubspot-contacts", {
    brandNames: brands,
    startDate: dateStr(from),
    endDate: dateStr(to),
  });
  if (data?.error) throw new Error(data.error);

  const periodData  = {} as Record<SecondaryBrand, PeriodData>;
  const timeSeries: TimeSeries    = {};
  const brandSeries: BrandSeriesMap = {};
  const brandDealerBreakdown: BrandDealerMap = {};

  for (const brand of brands) {
    const s = data?.brandData?.[brand];
    periodData[brand] = {
      totalContacts:    s?.totalContacts        ?? 0,
      dealerAssigned:   s?.dealerAssignedTotal   ?? 0,
      dealerUnassigned: s?.dealerUnassignedTotal ?? 0,
    };
    const ts: TimeSeries = data?.brandTimeSeries?.[brand] ?? {};
    brandSeries[brand] = ts;
    for (const [date, count] of Object.entries(ts)) {
      timeSeries[date] = (timeSeries[date] || 0) + (count as number);
    }
    brandDealerBreakdown[brand] = data?.brandDealerBreakdown?.[brand] ?? [];
  }
  return { periodData, timeSeries, brandSeries, brandDealerBreakdown };
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
  currBrandSeries: BrandSeriesMap; prevBrandSeries: BrandSeriesMap;
  excludedDates: string[];
  currBrandDealerBreakdown: BrandDealerMap;
}) {
  const { currLabel, prevLabel, activeBrands, results,
          currSeries, prevSeries, currStart, prevStart,
          currBrandSeries, prevBrandSeries, currBrandDealerBreakdown } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210;
  const ML = 13;
  const MR = 13;

  // ── Enterprise color palette (Tesla/analytics dashboard inspired) ───────────
  const NAVY   = "#0B1E3D";   // deep navy  — header bg, table headers, footer
  const ACCENT = "#0052CC";   // corp blue  — accent strips, section markers
  const DARK   = "#172B4D";   // charcoal   — primary body text
  const GRAY   = "#5E7291";   // steel-gray — secondary / muted text
  const LGRAY  = "#F4F5F7";   // near-white — card fills, alternating rows
  const BORDER = "#DDE3ED";   // line color — table borders, separators
  const GREEN  = "#006644";   // teal-green — positive delta
  const RED    = "#BF2600";   // brick-red  — negative delta
  const WHITE  = "#FFFFFF";
  const CW     = PW - ML - MR;  // 182mm usable width

  // Per-metric left-strip colors for KPI cards
  const MCOL: Record<string, string> = {
    totalContacts:    "#0052CC",   // deep corporate blue
    dealerAssigned:   "#006644",   // deep teal-green
    dealerUnassigned: "#974F0C",   // deep amber
  };

  const rgb    = (hex: string) => HEX2RGB(hex);
  // jsPDF helvetica does not support unicode arrows — use plain ASCII signs only
  const dSign  = (d: number)   => d > 0.4 ? "+" : "";
  const dLabel = (d: number)   => `${dSign(d)}${d.toFixed(1)}%`;   // e.g. "+13.5%"  "-33.9%"
  const dColor = (d: number): [number,number,number] =>
    d > 0.4 ? rgb(GREEN) : d < -0.4 ? rgb(RED) : rgb(GRAY);

  // smart PDF granularity
  const pdfGran: Granularity = opts.selectedDays > 90 ? "month" : "week";
  const pdfTrendRows = buildTrendRows(
    currSeries, prevSeries, currStart, prevStart, opts.selectedDays, pdfGran,
  );

  // base autoTable config — clean enterprise style
  const AT = {
    margin: { left: ML, right: MR },
    tableLineColor: rgb(BORDER) as [number,number,number],
    tableLineWidth: 0.25,
    styles: {
      font: "helvetica" as const,
      fontSize: 7.5,
      cellPadding: { top: 3.2, bottom: 3.2, left: 4, right: 4 },
      textColor: rgb(DARK),
      lineColor: rgb(BORDER) as [number,number,number],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: rgb(NAVY) as [number,number,number],
      textColor: [255, 255, 255] as [number,number,number],
      fontStyle: "bold" as const,
      fontSize: 7.5,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
    },
    alternateRowStyles: { fillColor: rgb(LGRAY) as [number,number,number] },
  };

  // section heading — LGRAY band + ACCENT left strip + NAVY uppercase label
  const section = (title: string, y: number) => {
    doc.setFillColor(...rgb(LGRAY));
    doc.rect(ML, y, CW, 7, "F");
    doc.setDrawColor(...rgb(BORDER));
    doc.setLineWidth(0.25);
    doc.rect(ML, y, CW, 7, "S");
    doc.setFillColor(...rgb(ACCENT));
    doc.rect(ML, y, 3, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...rgb(NAVY));
    doc.text(title.toUpperCase(), ML + 7, y + 5);
    return y + 10;  // band 7mm + 3mm gap
  };

  // ══════════════════════════════════════════════════════════════════════════
  // LAYOUT  (A4 portrait 210×297mm, margins 14mm)
  // ══════════════════════════════════════════════════════════════════════════

  // ── 1. HEADER (0–24mm) ─────────────────────────────────────────────────────
  doc.setFillColor(...rgb(NAVY));
  doc.rect(0, 0, PW, 22, "F");
  doc.setFillColor(...rgb(ACCENT));
  doc.rect(0, 0, 5, 22, "F");
  doc.setFillColor(255, 196, 0);        // gold accent line
  doc.rect(0, 21.4, PW, 0.6, "F");

  // company name (small, muted)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(148, 173, 209);
  doc.text("AMERICAN BATH GROUP  |  BRAND PERFORMANCE HUB", ML + 2, 6);

  // report title (large, white)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text("CRM Lead Comparison Report", ML + 2, 15.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(148, 173, 209);
  doc.text("GENERATED", PW - MR, 6.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(format(new Date(), "MMM d, yyyy  |  h:mm a"), PW - MR, 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 173, 209);
  doc.text(`${opts.selectedDays}-day comparison`, PW - MR, 17.5, { align: "right" });

  let y = 26;

  // ── 2. PERIOD & BRANDS STRIP (12mm) ──────────────────────────────────────
  doc.setFillColor(...rgb(WHITE));
  doc.rect(ML, y, CW, 12, "F");
  doc.setDrawColor(...rgb(BORDER));
  doc.setLineWidth(0.3);
  doc.rect(ML, y, CW, 12, "S");

  const col1 = ML + 5;
  const col2 = ML + 66;
  const col3 = ML + 128;

  doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...rgb(GRAY));
  doc.text("CURRENT PERIOD", col1, y + 4.5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...rgb(DARK));
  doc.text(currLabel, col1, y + 9.5);

  doc.setDrawColor(...rgb(BORDER)); doc.setLineWidth(0.35);
  doc.line(col2 - 3, y + 2, col2 - 3, y + 10);

  doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...rgb(GRAY));
  doc.text("PREVIOUS PERIOD", col2, y + 4.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...rgb(DARK));
  doc.text(prevLabel, col2, y + 9.5);

  doc.line(col3 - 3, y + 2, col3 - 3, y + 10);

  doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...rgb(GRAY));
  doc.text("BRAND(S)", col3, y + 4.5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...rgb(ACCENT));
  doc.text(activeBrands.join("  |  "), col3, y + 9.5);

  y += 16;

  // ── Excluded dates note (renders only when exclusions are active) ────────────
  if (opts.excludedDates.length > 0) {
    doc.setFillColor(...rgb("#FFF7ED"));
    doc.rect(ML, y, CW, 7, "F");
    doc.setDrawColor(...rgb("#FB923C"));
    doc.setLineWidth(0.25);
    doc.rect(ML, y, CW, 7, "S");
    doc.setFillColor(...rgb("#EA580C"));
    doc.rect(ML, y, 3, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...rgb("#7C2D12"));
    const excNote = `Excluded from totals: ${opts.excludedDates.join("  |  ")}`;
    doc.text(excNote, ML + 7, y + 5);
    y += 11;
  }

  // ── 3. KEY METRICS CARDS (32mm) ─────────────────────────────────────────────
  y = section("Key Metrics", y);

  const cardH = 27;
  const cardGap = 4;
  const cardW = (CW - cardGap * 2) / 3;

  METRICS.forEach(({ key, label }, i) => {
    const gc = activeBrands.reduce((s, b) => s + results[b].curr[key], 0);
    const gp = activeBrands.reduce((s, b) => s + results[b].prev[key], 0);
    const d  = gp > 0 ? ((gc - gp) / gp) * 100 : null;
    const bx = ML + i * (cardW + cardGap);
    const mc = MCOL[key] ?? ACCENT;

    // white card with border
    doc.setFillColor(...rgb(WHITE));
    doc.rect(bx, y, cardW, cardH, "F");
    doc.setDrawColor(...rgb(BORDER));
    doc.setLineWidth(0.3);
    doc.rect(bx, y, cardW, cardH, "S");
    // colored left accent strip
    doc.setFillColor(...rgb(mc));
    doc.rect(bx, y, 3.5, cardH, "F");

    // metric label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...rgb(GRAY));
    doc.text(label.toUpperCase(), bx + 7, y + 7);

    // big current number
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...rgb(DARK));
    doc.text(gc.toLocaleString(), bx + 7, y + 18);

    // delta — plain +/-% only (no unicode arrows; they corrupt in helvetica)
    if (d !== null) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...dColor(d));
      doc.text(dLabel(d), bx + cardW - 5, y + 18, { align: "right" });
    }

    // compare value
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...rgb(GRAY));
    doc.text(`Compare: ${gp.toLocaleString()}`, bx + 7, y + 23.5);
  });

  y += cardH + 8;

  // ── 4. BRAND BREAKDOWN TABLE ─────────────────────────────────────────────────
  y = section("Brand Breakdown", y);

  const brandHead = ["Metric", ...activeBrands.map(b => BRAND_SHORT[b])];
  const brandBody = METRICS.map(({ key, label }) => [
    label,
    ...activeBrands.map(b => {
      const curr = results[b].curr[key];
      const prev = results[b].prev[key];
      const d    = prev > 0 ? ((curr - prev) / prev) * 100 : null;
      return d !== null
        ? `${curr.toLocaleString()}  (${dLabel(d)})`
        : curr.toLocaleString();
    }),
  ]);

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
        return [i + 1, {
          cellWidth: brandColW,
          halign: "center" as const,
          textColor: [br, bg2, bb] as [number,number,number],
          fontStyle: "bold" as const,
        }];
      })),
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index > 0) {
        const brand = activeBrands[data.column.index - 1];
        if (brand) data.cell.styles.fillColor = HEX2RGB(BRAND_PALETTE[brand].solid) as [number,number,number];
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── 5. LEAD TREND TABLE ──────────────────────────────────────────────────────
  if (pdfTrendRows.length > 0) {
    y = section(`Lead Trend  |  By ${pdfGran.charAt(0).toUpperCase() + pdfGran.slice(1)}`, y);

    const trendBody = pdfTrendRows.map(({ label, prevLabel: pLbl, curr, prev }) => {
      const d = prev > 0 ? ((curr - prev) / prev) * 100 : null;
      return [
        label,
        curr.toLocaleString(),
        prev.toLocaleString(),
        d !== null ? dLabel(d) : "--",   // plain +/-% only — no unicode
        pLbl,
      ];
    });

    autoTable(doc, {
      ...AT,
      startY: y,
      // 42+26+26+28+60 = 182 = CW
      head: [["Period (Current)", "Leads", "Leads (Prev)", "Change", "Period (Prev)"]],
      body: trendBody,
      // tight rows so 13 weekly rows + header fit before footer
      styles: { ...AT.styles, fontSize: 7, cellPadding: { top: 2.2, bottom: 2.2, left: 4, right: 4 } },
      headStyles: { ...AT.headStyles, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: "bold" },
        1: { cellWidth: 26, halign: "center" as const, fontStyle: "bold" as const,
             textColor: rgb(ACCENT) as [number,number,number] },
        2: { cellWidth: 26, halign: "center" as const,
             textColor: rgb(GRAY) as [number,number,number] },
        3: { cellWidth: 28, halign: "center" as const, fontStyle: "bold" as const },
        4: { cellWidth: 60, textColor: rgb(GRAY) as [number,number,number] },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const v = String(data.cell.raw ?? "");
          if (v.startsWith("+"))
            data.cell.styles.textColor = rgb(GREEN) as [number,number,number];
          else if (v.startsWith("-"))
            data.cell.styles.textColor = rgb(RED) as [number,number,number];
        }
      },
    });
  }

  // ── 6. FOOTER BAR ─────────────────────────────────────────────────────────
  const FY = 287;
  doc.setFillColor(...rgb(NAVY));
  doc.rect(0, FY, PW, 10, "F");
  doc.setFillColor(...rgb(ACCENT));
  doc.rect(0, FY, 5, 10, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(148, 173, 209);
  doc.text(
    "American Bath Group  |  CRM Lead Comparison Report  |  Confidential",
    ML + 2, FY + 6.5,
  );
  // Total pages: page 1 (totals) + one page per brand (only when >1 brand selected)
  const totalPages = activeBrands.length > 1 ? activeBrands.length + 1 : 1;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(`Page 1 of ${totalPages}`, PW - MR, FY + 6.5, { align: "right" });

  // ══ PER-BRAND PAGES (page 2, 3, … — only when multiple brands selected) ═════
  if (activeBrands.length > 1) {

    // Helpers reused across brand pages
    const drawBrandHeader = (brand: SecondaryBrand) => {
      doc.setFillColor(...rgb(NAVY));
      doc.rect(0, 0, PW, 22, "F");
      // Brand-colored left sidebar instead of generic blue
      const bColor = BRAND_PALETTE[brand].solid;
      doc.setFillColor(...rgb(bColor));
      doc.rect(0, 0, 5, 22, "F");
      doc.setFillColor(255, 196, 0);
      doc.rect(0, 21.4, PW, 0.6, "F");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(148, 173, 209);
      doc.text("AMERICAN BATH GROUP  |  BRAND PERFORMANCE HUB", ML + 2, 6);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text("CRM Lead Comparison Report", ML + 2, 15.5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(148, 173, 209);
      doc.text("GENERATED", PW - MR, 6.5, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text(format(new Date(), "MMM d, yyyy  |  h:mm a"), PW - MR, 12, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(148, 173, 209);
      doc.text(`${opts.selectedDays}-day comparison`, PW - MR, 17.5, { align: "right" });
    };

    const drawBrandPeriodStrip = (brand: SecondaryBrand, y: number) => {
      const bColor = BRAND_PALETTE[brand].solid;
      doc.setFillColor(...rgb(WHITE));
      doc.rect(ML, y, CW, 12, "F");
      doc.setDrawColor(...rgb(BORDER));
      doc.setLineWidth(0.3);
      doc.rect(ML, y, CW, 12, "S");

      const c1 = ML + 5; const c2 = ML + 66; const c3 = ML + 128;

      doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...rgb(GRAY));
      doc.text("CURRENT PERIOD", c1, y + 4.5);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...rgb(DARK));
      doc.text(currLabel, c1, y + 9.5);

      doc.setDrawColor(...rgb(BORDER)); doc.setLineWidth(0.35);
      doc.line(c2 - 3, y + 2, c2 - 3, y + 10);

      doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...rgb(GRAY));
      doc.text("PREVIOUS PERIOD", c2, y + 4.5);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...rgb(DARK));
      doc.text(prevLabel, c2, y + 9.5);

      doc.line(c3 - 3, y + 2, c3 - 3, y + 10);

      doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...rgb(GRAY));
      doc.text("BRAND", c3, y + 4.5);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...rgb(bColor));
      doc.text(brand, c3, y + 9.5);

      return y + 16;
    };

    const drawBrandFooter = (brand: SecondaryBrand, pageNum: number) => {
      const bColor = BRAND_PALETTE[brand].solid;
      doc.setFillColor(...rgb(NAVY));
      doc.rect(0, FY, PW, 10, "F");
      doc.setFillColor(...rgb(bColor));
      doc.rect(0, FY, 5, 10, "F");
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(148, 173, 209);
      doc.text(`American Bath Group  |  ${brand}  |  Confidential`, ML + 2, FY + 6.5);
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(255, 255, 255);
      doc.text(`Page ${pageNum} of ${totalPages}`, PW - MR, FY + 6.5, { align: "right" });
    };

    activeBrands.forEach((brand, idx) => {
      doc.addPage();
      const pageNum = idx + 2;

      // ── Header
      drawBrandHeader(brand);
      let by = drawBrandPeriodStrip(brand, 26);

      // ── Key Metrics for this brand
      by = section("Key Metrics", by);

      METRICS.forEach(({ key, label }, i) => {
        const gc = results[brand].curr[key];
        const gp = results[brand].prev[key];
        const d  = gp > 0 ? ((gc - gp) / gp) * 100 : null;
        const bx = ML + i * (cardW + cardGap);
        const mc = MCOL[key] ?? ACCENT;

        doc.setFillColor(...rgb(WHITE));
        doc.rect(bx, by, cardW, cardH, "F");
        doc.setDrawColor(...rgb(BORDER)); doc.setLineWidth(0.3);
        doc.rect(bx, by, cardW, cardH, "S");
        doc.setFillColor(...rgb(mc));
        doc.rect(bx, by, 3.5, cardH, "F");

        doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...rgb(GRAY));
        doc.text(label.toUpperCase(), bx + 7, by + 6.5);

        doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...rgb(DARK));
        doc.text(gc.toLocaleString(), bx + 7, by + 18);

        if (d !== null) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...dColor(d));
          doc.text(dLabel(d), bx + cardW - 5, by + 18, { align: "right" });
        }

        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...rgb(GRAY));
        doc.text(`Compare: ${gp.toLocaleString()}`, bx + 7, by + 23.5);
      });

      by += cardH + 8;

      // ── Lead Trend for this brand
      const bCurr = currBrandSeries[brand] ?? {};
      const bPrev = prevBrandSeries[brand] ?? {};
      const brandTrendRows = buildTrendRows(bCurr, bPrev, currStart, prevStart, opts.selectedDays, pdfGran);

      if (brandTrendRows.length > 0) {
        by = section(`Lead Trend  |  By ${pdfGran.charAt(0).toUpperCase() + pdfGran.slice(1)}`, by);

        const brandTrendBody = brandTrendRows.map(({ label, prevLabel: pLbl, curr, prev }) => {
          const d = prev > 0 ? ((curr - prev) / prev) * 100 : null;
          return [label, curr.toLocaleString(), prev.toLocaleString(),
                  d !== null ? dLabel(d) : "--", pLbl];
        });

        autoTable(doc, {
          ...AT,
          startY: by,
          head: [["Period (Current)", "Leads", "Leads (Prev)", "Change", "Period (Prev)"]],
          body: brandTrendBody,
          styles: { ...AT.styles, fontSize: 7, cellPadding: { top: 2.2, bottom: 2.2, left: 4, right: 4 } },
          headStyles: { ...AT.headStyles, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
          columnStyles: {
            0: { cellWidth: 42, fontStyle: "bold" },
            1: { cellWidth: 26, halign: "center" as const, fontStyle: "bold" as const,
                 textColor: rgb(BRAND_PALETTE[brand].solid) as [number,number,number] },
            2: { cellWidth: 26, halign: "center" as const, textColor: rgb(GRAY) as [number,number,number] },
            3: { cellWidth: 28, halign: "center" as const, fontStyle: "bold" as const },
            4: { cellWidth: 60, textColor: rgb(GRAY) as [number,number,number] },
          },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 3) {
              const v = String(data.cell.raw ?? "");
              if (v.startsWith("+")) data.cell.styles.textColor = rgb(GREEN) as [number,number,number];
              else if (v.startsWith("-")) data.cell.styles.textColor = rgb(RED) as [number,number,number];
            }
            // Brand-colored header row
            if (data.section === "head") {
              data.cell.styles.fillColor = HEX2RGB(BRAND_PALETTE[brand].solid) as [number,number,number];
            }
          },
        });
      }

      // ── Footer
      drawBrandFooter(brand, pageNum);
    });
  }

  // ══ ALL DEALERS PAGE(S) ══════════════════════════════════════════════════════
  const combinedDealer: Record<string, DealerRow & { brands: SecondaryBrand[] }> = {};
  for (const brand of activeBrands) {
    for (const row of (currBrandDealerBreakdown[brand] ?? [])) {
      if (!combinedDealer[row.email]) {
        combinedDealer[row.email] = { ...row, brands: [brand], count: row.count };
      } else {
        combinedDealer[row.email].count += row.count;
        if (!combinedDealer[row.email].brands.includes(brand))
          combinedDealer[row.email].brands.push(brand);
      }
    }
  }
  const allDealerRows = Object.values(combinedDealer).sort((a, b) => b.count - a.count);

  if (allDealerRows.length > 0) {
    doc.addPage();

    // ── Dealer page header
    doc.setFillColor(...rgb(NAVY));
    doc.rect(0, 0, PW, 22, "F");
    doc.setFillColor(...rgb(ACCENT));
    doc.rect(0, 0, 5, 22, "F");
    doc.setFillColor(255, 196, 0);
    doc.rect(0, 21.4, PW, 0.6, "F");

    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(148, 173, 209);
    doc.text("AMERICAN BATH GROUP  |  BRAND PERFORMANCE HUB", ML + 2, 6);

    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(255, 255, 255);
    doc.text("Top Dealers by Lead Volume", ML + 2, 15.5);

    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(148, 173, 209);
    doc.text("GENERATED", PW - MR, 6.5, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
    doc.text(format(new Date(), "MMM d, yyyy  |  h:mm a"), PW - MR, 12, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(148, 173, 209);
    doc.text(`${opts.selectedDays}-day window  |  ${allDealerRows.length} dealers  |  ${allDealerRows.reduce((s, d) => s + d.count, 0).toLocaleString()} leads assigned`, PW - MR, 17.5, { align: "right" });

    // ── Subtitle strip
    let dy = 26;
    doc.setFillColor(...rgb(LGRAY));
    doc.rect(ML, dy, CW, 8, "F");
    doc.setDrawColor(...rgb(BORDER)); doc.setLineWidth(0.25);
    doc.rect(ML, dy, CW, 8, "S");
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...rgb(GRAY));
    doc.text(`Dealers who received at least one lead during ${opts.currLabel}. All ${allDealerRows.length} dealers shown, sorted by lead volume.`, ML + 4, dy + 5.5);
    dy += 12;

    const dealerBody = allDealerRows.map((d, i) => [
      String(i + 1),
      d.name || "",
      d.email,
      d.state || "",
      activeBrands.length > 1 ? d.brands.join(", ") : "",
      d.count.toLocaleString(),
    ]);

    const dealerCols = activeBrands.length > 1
      ? ["#", "Name", "Email", "State", "Brand(s)", "Leads"]
      : ["#", "Name", "Email", "State", "Leads"];

    const dealerBody2 = activeBrands.length > 1
      ? dealerBody
      : dealerBody.map(r => [r[0], r[1], r[2], r[3], r[5]]);

    // single-brand: 5 cols = 182mm; multi-brand: 6 cols = 182mm
    // # col is 16mm so 3-digit numbers (100+) never wrap
    const dealerColStyles = activeBrands.length > 1 ? {
      0: { cellWidth: 16, halign: "center" as const, textColor: rgb(GRAY) as [number,number,number] },
      1: { cellWidth: 34, fontStyle: "bold" as const },
      2: { cellWidth: 52, textColor: rgb(GRAY) as [number,number,number] },
      3: { cellWidth: 14, halign: "center" as const },
      4: { cellWidth: 42, textColor: rgb(GRAY) as [number,number,number], fontSize: 6.5 },
      5: { cellWidth: 24, halign: "center" as const, fontStyle: "bold" as const,
           textColor: rgb(ACCENT) as [number,number,number] },
    } : {
      0: { cellWidth: 16, halign: "center" as const, textColor: rgb(GRAY) as [number,number,number] },
      1: { cellWidth: 44, fontStyle: "bold" as const },
      2: { cellWidth: 78, textColor: rgb(GRAY) as [number,number,number] },
      3: { cellWidth: 16, halign: "center" as const },
      4: { cellWidth: 28, halign: "center" as const, fontStyle: "bold" as const,
           textColor: rgb(ACCENT) as [number,number,number] },
    };

    autoTable(doc, {
      ...AT,
      startY: dy,
      margin: { left: ML, right: MR, bottom: 18 },  // 18mm bottom leaves room for footer
      showHead: "everyPage",
      head: [dealerCols],
      body: dealerBody2,
      styles: { ...AT.styles, fontSize: 7, cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 } },
      headStyles: { ...AT.headStyles, cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 } },
      columnStyles: dealerColStyles,
      didDrawPage: () => {
        // Repeat footer bar on every dealer page (including overflow pages)
        doc.setFillColor(...rgb(NAVY));
        doc.rect(0, FY, PW, 10, "F");
        doc.setFillColor(...rgb(ACCENT));
        doc.rect(0, FY, 5, 10, "F");
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(148, 173, 209);
        doc.text("American Bath Group  |  Dealer Lead Report  |  Confidential", ML + 2, FY + 6.5);
      },
    });
  }

  doc.save(`ABG-CRM-Lead-Report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
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
  const [granularity,      setGranularity]      = useState<Granularity>("week");
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState<string | null>(null);
  const [currBrandSeries,        setCurrBrandSeries]        = useState<BrandSeriesMap>({});
  const [prevBrandSeries,        setPrevBrandSeries]        = useState<BrandSeriesMap>({});
  const [currBrandDealerBreakdown, setCurrBrandDealerBreakdown] = useState<BrandDealerMap>({});
  const [excludedDates,    setExcludedDates]    = useState<string[]>([]);
  const [showExclPanel,    setShowExclPanel]    = useState(false);
  const [exclInput,        setExclInput]        = useState("");
  const [showAllDealers,   setShowAllDealers]   = useState(false);
  const reqRef = useRef(0);

  // Auto-exclude Nov 19, 2025 whenever the selected period window includes it
  const NOV19 = "2025-11-19";
  useEffect(() => {
    if (!selectedDays) return;
    const { currStart, currEnd, prevStart, prevEnd } = getPeriods(selectedDays);
    const d = new Date(NOV19 + "T12:00:00");
    const inRange =
      (d >= currStart && d <= currEnd) ||
      (d >= prevStart && d <= prevEnd);
    setExcludedDates(prev =>
      inRange && !prev.includes(NOV19)
        ? [...prev, NOV19].sort()
        : !inRange && prev.includes(NOV19)
          ? prev.filter(x => x !== NOV19)
          : prev,
    );
  }, [selectedDays]);

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
      setCurrBrandSeries(cRes.brandSeries);
      setPrevBrandSeries(pRes.brandSeries);
      setCurrBrandDealerBreakdown(cRes.brandDealerBreakdown);
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

  // ── Filtered series (zeros out excluded dates) ─────────────────────────────
  const filtCurrSeries = useMemo(
    () => currSeries ? filterSeries(currSeries, excludedDates) : null,
    [currSeries, excludedDates],
  );
  const filtPrevSeries = useMemo(
    () => prevSeries ? filterSeries(prevSeries, excludedDates) : null,
    [prevSeries, excludedDates],
  );
  const filtCurrBrandSeries = useMemo((): BrandSeriesMap => {
    if (!excludedDates.length) return currBrandSeries;
    const out: BrandSeriesMap = {};
    for (const [brand, series] of Object.entries(currBrandSeries) as [SecondaryBrand, TimeSeries][]) {
      out[brand] = filterSeries(series, excludedDates);
    }
    return out;
  }, [currBrandSeries, excludedDates]);

  // Filter previous brand series too — excluded dates apply to both periods
  const filtPrevBrandSeries = useMemo((): BrandSeriesMap => {
    if (!excludedDates.length) return prevBrandSeries;
    const out: BrandSeriesMap = {};
    for (const [brand, series] of Object.entries(prevBrandSeries) as [SecondaryBrand, TimeSeries][]) {
      out[brand] = filterSeries(series, excludedDates);
    }
    return out;
  }, [prevBrandSeries, excludedDates]);

  // Adjusted results — recalculate totalContacts from filtered series for BOTH periods
  const adjustedResults = useMemo((): BrandResults | null => {
    if (!results) return null;
    if (!excludedDates.length) return results;
    const out = {} as BrandResults;
    for (const brand of SECONDARY_BRANDS) {
      if (!results[brand]) continue;
      const fCurr = filtCurrBrandSeries[brand];
      const fPrev = filtPrevBrandSeries[brand];
      const adjCurrTotal = fCurr
        ? Object.values(fCurr).reduce((s, v) => s + (v as number), 0)
        : results[brand].curr.totalContacts;
      const adjPrevTotal = fPrev
        ? Object.values(fPrev).reduce((s, v) => s + (v as number), 0)
        : results[brand].prev.totalContacts;
      out[brand] = {
        curr: { ...results[brand].curr, totalContacts: adjCurrTotal },
        prev: { ...results[brand].prev, totalContacts: adjPrevTotal },
      };
    }
    return out;
  }, [results, excludedDates, filtCurrBrandSeries, filtPrevBrandSeries]);

  // Build trend rows using filtered series
  const trendRows = (filtCurrSeries && filtPrevSeries && selectedDays && periods)
    ? buildTrendRows(filtCurrSeries, filtPrevSeries, periods.currStart, periods.prevStart, selectedDays, granularity)
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

        {/* Exclude Dates toggle */}
        <button
          onClick={() => setShowExclPanel(p => !p)}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold cursor-pointer transition-all duration-150",
            showExclPanel
              ? "bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400"
              : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
          )}>
          <CalendarX2 className="h-3.5 w-3.5" />
          Exclude Dates
          {excludedDates.length > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold px-1">
              {excludedDates.length}
            </span>
          )}
        </button>

        {/* Download PDF — visible only when results are loaded */}
        {results && !loading && (
          <button
            onClick={() => {
              const activeBrands = selectedBrands.filter(b => results[b]);
              downloadPDF({
                currLabel, prevLabel,
                selectedDays: selectedDays!,
                activeBrands,
                results: adjustedResults ?? results,
                trendRows,
                granularity,
                currSeries: filtCurrSeries ?? currSeries!,
                prevSeries: filtPrevSeries ?? prevSeries!,
                currStart: periods!.currStart,
                prevStart: periods!.prevStart,
                currBrandSeries: filtCurrBrandSeries,
                prevBrandSeries: filtPrevBrandSeries,
                excludedDates,
                currBrandDealerBreakdown,
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

      {/* ══ EXCLUDE DATES PANEL ═════════════════════════════════════════════ */}
      {showExclPanel && (
        <div className="rounded-2xl border border-orange-200 dark:border-orange-800 bg-orange-50/60 dark:bg-orange-950/20 px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <CalendarX2 className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
            <p className="text-xs font-bold text-orange-800 dark:text-orange-300">Exclude Dates from Report</p>
            <p className="text-[11px] text-orange-600/70 dark:text-orange-400/60">
              Excluded dates are zeroed out in Total Created KPI and the trend chart. Dealer assignment metrics are unaffected (no per-day data available).
            </p>
          </div>
          {/* Input row */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={exclInput}
              onChange={e => setExclInput(e.target.value)}
              className="rounded-lg border border-orange-300 dark:border-orange-700 bg-white dark:bg-background px-3 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
            />
            <button
              onClick={() => {
                if (!exclInput || excludedDates.includes(exclInput)) return;
                setExcludedDates(p => [...p, exclInput].sort());
                setExclInput("");
              }}
              disabled={!exclInput || excludedDates.includes(exclInput)}
              className="rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed px-3.5 py-1.5 text-xs font-bold text-white cursor-pointer transition-all duration-150">
              Add Date
            </button>
            {excludedDates.length > 0 && (
              <button
                onClick={() => setExcludedDates([])}
                className="rounded-lg border border-orange-300 dark:border-orange-700 bg-white dark:bg-background px-3.5 py-1.5 text-xs font-semibold text-orange-700 dark:text-orange-400 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-all duration-150">
                Clear all
              </button>
            )}
          </div>
          {/* Date chips */}
          {excludedDates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {excludedDates.map(d => (
                <span key={d}
                  className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 dark:bg-orange-900/40 border border-orange-200 dark:border-orange-700 px-3 py-1 text-xs font-semibold text-orange-800 dark:text-orange-300">
                  {format(parseISO(d), "MMM d, yyyy")}
                  <button
                    onClick={() => setExcludedDates(p => p.filter(x => x !== d))}
                    className="ml-0.5 rounded-full hover:bg-orange-200 dark:hover:bg-orange-800 p-0.5 cursor-pointer transition-colors">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

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
        const displayResults = adjustedResults ?? results;
        const activeBrands = selectedBrands.filter(b => displayResults[b]);

        // Aggregate totals per metric
        const grandTotals = METRICS.map(({ key, label, Icon, color }) => {
          const grandCurr = activeBrands.reduce((s, b) => s + displayResults[b].curr[key], 0);
          const grandPrev = activeBrands.reduce((s, b) => s + displayResults[b].prev[key], 0);
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
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#3B82F6]">CRM Lead Comparison Report</p>
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
                            const curr = displayResults[brand].curr[key];
                            const prev = displayResults[brand].prev[key];
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
                    <h3 className="text-sm font-bold text-foreground">New Leads Over Time</h3>
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
                            const curr = displayResults[brand].curr[key];
                            const prev = displayResults[brand].prev[key];
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

            {/* ── Report Summary ───────────────────────────────────────── */}
            {(() => {
              const leadsM  = grandTotals.find(m => m.key === "totalContacts")!;
              const assignM = grandTotals.find(m => m.key === "dealerAssigned")!;
              const unassM  = grandTotals.find(m => m.key === "dealerUnassigned")!;

              // Line 1 — overall lead volume
              const overallDir = leadsM.d !== null
                ? leadsM.d > 0.4 ? "up" : leadsM.d < -0.4 ? "down" : "flat"
                : "flat";
              const line1 = leadsM.d !== null
                ? `Total new leads ${overallDir === "up" ? "increased" : overallDir === "down" ? "decreased" : "held steady"} by ${Math.abs(leadsM.d).toFixed(1)}% — from ${leadsM.grandPrev.toLocaleString()} to ${leadsM.grandCurr.toLocaleString()} across ${activeBrands.length} brand${activeBrands.length > 1 ? "s" : ""}.`
                : `${leadsM.grandCurr.toLocaleString()} total new leads recorded across ${activeBrands.length} brand${activeBrands.length > 1 ? "s" : ""} in this period.`;

              // Line 2 — best / worst brand by totalContacts delta (only when >1 brand)
              const brandDeltas = activeBrands.map(b => {
                const c = displayResults[b].curr.totalContacts;
                const p = displayResults[b].prev.totalContacts;
                return { brand: b, d: p > 0 ? ((c - p) / p) * 100 : null };
              }).filter(x => x.d !== null) as { brand: SecondaryBrand; d: number }[];

              const bestBrand  = brandDeltas.length ? [...brandDeltas].sort((a, b) => b.d - a.d)[0]  : null;
              const worstBrand = brandDeltas.length ? [...brandDeltas].sort((a, b) => a.d - b.d)[0]  : null;

              let line2 = "";
              if (activeBrands.length > 1 && bestBrand && worstBrand && bestBrand.brand !== worstBrand.brand) {
                line2 = `${BRAND_SHORT[bestBrand.brand]} led with ${bestBrand.d > 0 ? "+" : ""}${bestBrand.d.toFixed(1)}% new leads; ${BRAND_SHORT[worstBrand.brand]} lagged at ${worstBrand.d > 0 ? "+" : ""}${worstBrand.d.toFixed(1)}%.`;
              } else if (activeBrands.length === 1 && assignM.d !== null) {
                const aDir = assignM.d > 0.4 ? "up" : assignM.d < -0.4 ? "down" : "flat";
                line2 = `Dealer-assigned leads ${aDir === "up" ? "grew" : aDir === "down" ? "dropped" : "held"} ${assignM.d > 0 ? "+" : ""}${assignM.d.toFixed(1)}%, with ${assignM.grandCurr.toLocaleString()} assigned out of ${leadsM.grandCurr.toLocaleString()} total.`;
              }

              // Line 3 — unassigned leads alert or dealer coverage rate
              const coverageRate = leadsM.grandCurr > 0
                ? Math.round((assignM.grandCurr / leadsM.grandCurr) * 100)
                : null;
              let line3 = "";
              if (unassM.d !== null && unassM.d > 5) {
                line3 = `Watch: unassigned leads rose ${unassM.d > 0 ? "+" : ""}${unassM.d.toFixed(1)}% (${unassM.grandCurr.toLocaleString()} leads) — follow-up coverage may need attention.`;
              } else if (coverageRate !== null) {
                line3 = `Dealer coverage rate: ${coverageRate}% of leads assigned this period${unassM.d !== null ? ` (unassigned ${unassM.d > 0 ? "+" : ""}${unassM.d.toFixed(1)}% vs previous)` : ""}.`;
              }

              const lines = [line1, line2, line3].filter(Boolean);
              const accent = overallDir === "up" ? "#10B981" : overallDir === "down" ? "#EF4444" : "#6B7280";

              return (
                <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                  <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-muted/20">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                      style={{ background: `${accent}18` }}>
                      {overallDir === "up"
                        ? <TrendingUp className="h-4 w-4" style={{ color: accent }} />
                        : overallDir === "down"
                        ? <TrendingDown className="h-4 w-4" style={{ color: accent }} />
                        : <Minus className="h-4 w-4" style={{ color: accent }} />}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Report Summary</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{currLabel} vs {prevLabel}</p>
                    </div>
                    {excludedDates.length > 0 && (
                      <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 px-2.5 py-1 text-[10px] font-semibold text-orange-700 dark:text-orange-400">
                        <CalendarX2 className="h-3 w-3" />
                        {excludedDates.length} date{excludedDates.length > 1 ? "s" : ""} excluded
                      </span>
                    )}
                  </div>
                  <div className="px-6 py-5 space-y-3">
                    {lines.map((line, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ background: i === 0 ? accent : "hsl(var(--muted-foreground)/0.4)" }} />
                        <p className={cn(
                          "text-sm leading-relaxed",
                          i === 0 ? "font-semibold text-foreground" : "text-muted-foreground",
                        )}>
                          {line}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Top Dealers ──────────────────────────────────────────── */}
            {(() => {
              // Merge all active brands' dealer breakdown into one combined list
              // (deduplicated by email, summing counts across brands)
              const combined: Record<string, DealerRow & { brands: SecondaryBrand[] }> = {};
              for (const brand of activeBrands) {
                const rows = currBrandDealerBreakdown[brand] ?? [];
                for (const row of rows) {
                  if (!combined[row.email]) {
                    combined[row.email] = { ...row, brands: [brand], count: row.count };
                  } else {
                    combined[row.email].count += row.count;
                    if (!combined[row.email].brands.includes(brand))
                      combined[row.email].brands.push(brand);
                  }
                }
              }
              const allDealers = Object.values(combined).sort((a, b) => b.count - a.count);
              if (!allDealers.length) return null;

              const displayedDealers = showAllDealers ? allDealers : allDealers.slice(0, 10);
              const maxCount = allDealers[0]?.count || 1;

              return (
                <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-border bg-muted/20">
                    <div>
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Users className="h-4 w-4 text-[#3B82F6]" />
                        {showAllDealers ? "All Dealers by Lead Volume" : "Top Dealers by Lead Volume"}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Dealers who received leads — current period · {currLabel}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="rounded-xl bg-[#3B82F6]/10 px-3 py-1.5 text-center">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#3B82F6]">Dealers</p>
                        <p className="text-lg font-black tabular-nums text-[#3B82F6]">{allDealers.length}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-500/10 px-3 py-1.5 text-center">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Leads Assigned</p>
                        <p className="text-lg font-black tabular-nums text-emerald-600">
                          {allDealers.reduce((s, d) => s + d.count, 0).toLocaleString()}
                        </p>
                      </div>
                      {allDealers.length > 10 && (
                        <button
                          onClick={() => setShowAllDealers(v => !v)}
                          className="rounded-xl border border-[#3B82F6]/40 bg-[#3B82F6]/5 px-3 py-1.5 text-[11px] font-semibold text-[#3B82F6] hover:bg-[#3B82F6]/10 transition-colors cursor-pointer">
                          {showAllDealers ? `Show Top 10` : `See All ${allDealers.length}`}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col lg:flex-row gap-0">
                    {/* Table */}
                    <div className="flex-1 min-w-0">
                      <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground w-8">#</th>
                            <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Dealer Name / Email</th>
                            <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground hidden md:table-cell">State</th>
                            {activeBrands.length > 1 && (
                              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Brand(s)</th>
                            )}
                            <th className="px-4 py-3 text-right font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Leads</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedDealers.map((dealer, idx) => (
                            <tr key={dealer.email}
                              className={cn("border-b border-border/50 hover:bg-muted/20 transition-colors cursor-default",
                                idx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                              <td className="px-4 py-3">
                                {idx < 3 ? (
                                  <span className={cn(
                                    "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white",
                                    idx === 0 ? "bg-amber-400" : idx === 1 ? "bg-slate-400" : "bg-orange-400",
                                  )}>{idx + 1}</span>
                                ) : (
                                  <span className="text-[10px] font-mono text-muted-foreground/50">{idx + 1}</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-0.5">
                                  {dealer.name ? (
                                    <>
                                      <span className="font-semibold text-foreground text-[11px]">{dealer.name}</span>
                                      <span className="font-mono text-[10px] text-muted-foreground">{dealer.email}</span>
                                    </>
                                  ) : (
                                    <span className="font-mono text-[11px] text-foreground">{dealer.email || "—"}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 hidden md:table-cell">
                                {dealer.state ? (
                                  <span className="inline-flex items-center rounded-md bg-[#3B82F6]/10 px-2 py-0.5 text-[10px] font-bold text-[#3B82F6]">
                                    {dealer.state}
                                  </span>
                                ) : <span className="text-muted-foreground/40 text-[10px]">—</span>}
                              </td>
                              {activeBrands.length > 1 && (
                                <td className="px-4 py-3 hidden sm:table-cell">
                                  <div className="flex flex-wrap gap-1">
                                    {dealer.brands.map(b => (
                                      <span key={b} className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
                                        style={{ background: BRAND_PALETTE[b].solid }}>
                                        {BRAND_SHORT[b]}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              )}
                              <td className="px-4 py-3 text-right">
                                <div className="flex flex-col items-end gap-1">
                                  <span className="font-black tabular-nums text-foreground text-sm">{dealer.count.toLocaleString()}</span>
                                  <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full bg-[#3B82F6]"
                                      style={{ width: `${Math.round((dealer.count / maxCount) * 100)}%` }} />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>{/* end overflow-x-auto */}
                      {/* Footer — outside scroll wrapper so always visible */}
                      <div className="px-4 py-2.5 flex items-center justify-between border-t border-border bg-muted/10">
                        <p className="text-[11px] text-muted-foreground">
                          Showing {displayedDealers.length} of {allDealers.length} dealers
                        </p>
                        {allDealers.length > 10 && (
                          <button
                            onClick={() => setShowAllDealers(v => !v)}
                            className="rounded-lg border border-[#3B82F6]/30 bg-[#3B82F6]/5 px-3 py-1 text-[11px] font-semibold text-[#3B82F6] hover:bg-[#3B82F6]/15 transition-colors cursor-pointer">
                            {showAllDealers ? "↑ Show top 10" : `↓ See all ${allDealers.length} dealers`}
                          </button>
                        )}
                      </div>
                    </div>{/* end flex-1 min-w-0 */}

                    {/* Bar chart — always shows top 10 for readability */}
                    {allDealers.length >= 3 && (
                      <div className="lg:w-[320px] shrink-0 border-t lg:border-t-0 lg:border-l border-border p-4 flex flex-col gap-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">
                          Lead Volume{showAllDealers ? " · Top 10" : ""}
                        </p>
                        <ResponsiveContainer width="100%" height={Math.min(allDealers.slice(0, 10).length * 36, 360)}>
                          <BarChart
                            data={allDealers.slice(0, 10).map(d => ({ name: d.name || d.email.split("@")[0], count: d.count }))}
                            layout="vertical"
                            margin={{ left: 4, right: 36, top: 4, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                            <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                            <YAxis
                              type="category" dataKey="name"
                              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                              width={110} tickLine={false} axisLine={false}
                              tickFormatter={v => v.length > 16 ? v.slice(0, 15) + "…" : v}
                            />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                              {allDealers.slice(0, 10).map((_, i) => (
                                <Cell key={i} fill={i === 0 ? "#3B82F6" : i === 1 ? "#60A5FA" : i === 2 ? "#93C5FD" : "hsl(var(--muted-foreground)/0.25)"} />
                              ))}
                              <LabelList dataKey="count" position="right"
                                style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontVariantNumeric: "tabular-nums" }}
                                formatter={(v: number) => v.toLocaleString()} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          </div>
        );
      })()}
    </div>
  );
}

// ─── COMPARISON SECTION — embedded in Overview for secondary brands ───────────
export function CRMComparisonSection({ dateFrom, dateTo, userEmail }: {
  dateFrom: Date;
  dateTo: Date;
  userEmail: string;
}) {
  if (!ALLOWED_EMAILS.has(userEmail)) return null;
  return <ComparisonSectionContent dateFrom={dateFrom} dateTo={dateTo} />;
}

function ComparisonSectionContent({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const [comparisonMode, setComparisonMode] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<SecondaryBrand[]>([...SECONDARY_BRANDS]);
  const [results,        setResults]        = useState<BrandResults | null>(null);
  const [currSeries,     setCurrSeries]     = useState<TimeSeries | null>(null);
  const [prevSeries,     setPrevSeries]     = useState<TimeSeries | null>(null);
  const [granularity,    setGranularity]    = useState<Granularity>("week");
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [currBrandSeries,          setCurrBrandSeries]          = useState<BrandSeriesMap>({});
  const [prevBrandSeries,          setPrevBrandSeries]          = useState<BrandSeriesMap>({});
  const [currBrandDealerBreakdown, setCurrBrandDealerBreakdown] = useState<BrandDealerMap>({});
  const [excludedDates,  setExcludedDates]  = useState<string[]>([]);
  const [showExclPanel,  setShowExclPanel]  = useState(false);
  const [exclInput,      setExclInput]      = useState("");
  const [showAllDealers, setShowAllDealers] = useState(false);
  const reqRef = useRef(0);

  const durationDays = Math.round((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const prevEnd   = subDays(dateFrom, 1);
  const prevStart = subDays(prevEnd, durationDays - 1);

  const currLabel = `${format(dateFrom, "MMM d")} – ${format(dateTo, "MMM d, yyyy")}`;
  const prevLabel = `${format(prevStart, "MMM d")} – ${format(prevEnd, "MMM d, yyyy")}`;
  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

  const NOV19 = "2025-11-19";
  useEffect(() => {
    const d = new Date(NOV19 + "T12:00:00");
    const inRange = (d >= dateFrom && d <= dateTo) || (d >= prevStart && d <= prevEnd);
    setExcludedDates(prev =>
      inRange && !prev.includes(NOV19) ? [...prev, NOV19].sort() :
      !inRange && prev.includes(NOV19) ? prev.filter(x => x !== NOV19) : prev,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom.getTime(), dateTo.getTime()]);

  function toggleBrand(b: SecondaryBrand) {
    setSelectedBrands(p => p.includes(b) ? p.filter(x => x !== b) : [...p, b]);
  }

  useEffect(() => {
    if (!selectedBrands.length) { setResults(null); return; }
    const id = ++reqRef.current;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchAllBrandsForPeriod(selectedBrands, dateFrom, dateTo),
      fetchAllBrandsForPeriod(selectedBrands, prevStart, prevEnd),
    ]).then(([cRes, pRes]) => {
      if (reqRef.current !== id) return;
      const map = {} as BrandResults;
      for (const b of selectedBrands) map[b] = { curr: cRes.periodData[b], prev: pRes.periodData[b] };
      setResults(map);
      setCurrSeries(cRes.timeSeries);
      setPrevSeries(pRes.timeSeries);
      setCurrBrandSeries(cRes.brandSeries);
      setPrevBrandSeries(pRes.brandSeries);
      setCurrBrandDealerBreakdown(cRes.brandDealerBreakdown);
      setLoading(false);
    }).catch(e => {
      if (reqRef.current !== id) return;
      setError(e instanceof Error ? e.message : "Failed to load");
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom.getTime(), dateTo.getTime(), selectedBrands.join(",")]);

  const filtCurrSeries = useMemo(
    () => currSeries ? filterSeries(currSeries, excludedDates) : null,
    [currSeries, excludedDates],
  );
  const filtPrevSeries = useMemo(
    () => prevSeries ? filterSeries(prevSeries, excludedDates) : null,
    [prevSeries, excludedDates],
  );
  const filtCurrBrandSeries = useMemo((): BrandSeriesMap => {
    if (!excludedDates.length) return currBrandSeries;
    const out: BrandSeriesMap = {};
    for (const [brand, series] of Object.entries(currBrandSeries) as [SecondaryBrand, TimeSeries][])
      out[brand] = filterSeries(series, excludedDates);
    return out;
  }, [currBrandSeries, excludedDates]);

  const filtPrevBrandSeries = useMemo((): BrandSeriesMap => {
    if (!excludedDates.length) return prevBrandSeries;
    const out: BrandSeriesMap = {};
    for (const [brand, series] of Object.entries(prevBrandSeries) as [SecondaryBrand, TimeSeries][])
      out[brand] = filterSeries(series, excludedDates);
    return out;
  }, [prevBrandSeries, excludedDates]);

  const adjustedResults = useMemo((): BrandResults | null => {
    if (!results) return null;
    if (!excludedDates.length) return results;
    const out = {} as BrandResults;
    for (const brand of SECONDARY_BRANDS) {
      if (!results[brand]) continue;
      const fCurr = filtCurrBrandSeries[brand];
      const fPrev = filtPrevBrandSeries[brand];
      out[brand] = {
        curr: { ...results[brand].curr, totalContacts: fCurr ? Object.values(fCurr).reduce((s, v) => s + (v as number), 0) : results[brand].curr.totalContacts },
        prev: { ...results[brand].prev, totalContacts: fPrev ? Object.values(fPrev).reduce((s, v) => s + (v as number), 0) : results[brand].prev.totalContacts },
      };
    }
    return out;
  }, [results, excludedDates, filtCurrBrandSeries, filtPrevBrandSeries]);

  const trendRows = (filtCurrSeries && filtPrevSeries)
    ? buildTrendRows(filtCurrSeries, filtPrevSeries, dateFrom, prevStart, durationDays, granularity)
    : [];

  const tickInterval = trendRows.length > 60 ? 13 : trendRows.length > 30 ? 6 : trendRows.length > 14 ? 3 : 0;

  return (
    <div className="space-y-5 p-6 border-t border-border">

      {/* ── Section Header with Comparison Mode toggle ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#3B82F6]/10">
            <Users className="h-4 w-4 text-[#3B82F6]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Comparison Report</h2>
            <p className="text-[11px] text-muted-foreground">
              {comparisonMode ? `${currLabel} vs ${prevLabel}` : currLabel}
            </p>
          </div>
        </div>

        <button
          onClick={() => setComparisonMode(v => !v)}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all duration-150 cursor-pointer",
            comparisonMode
              ? "bg-[#3B82F6] border-[#3B82F6] text-white shadow-sm"
              : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
          )}>
          <TrendingUp className="h-3.5 w-3.5" />
          {comparisonMode ? "Comparison Mode: On" : "Comparison Mode: Off"}
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-card px-5 py-3.5 shadow-sm">
        {/* Brand toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          {SECONDARY_BRANDS.map((brand) => {
            const active = selectedBrands.includes(brand);
            const { solid } = BRAND_PALETTE[brand];
            return (
              <button key={brand} onClick={() => toggleBrand(brand)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all duration-200",
                  active ? "border-transparent text-white shadow-sm" : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
                )}
                style={active ? { background: solid } : {}}>
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: active ? "rgba(255,255,255,0.7)" : solid }} />
                {brand}
                {active && <Check className="h-3 w-3 ml-0.5" />}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Exclude Dates */}
        <button
          onClick={() => setShowExclPanel(p => !p)}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold cursor-pointer transition-all duration-150",
            showExclPanel
              ? "bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400"
              : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-muted-foreground/40",
          )}>
          <CalendarX2 className="h-3.5 w-3.5" />
          Exclude Dates
          {excludedDates.length > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold px-1">
              {excludedDates.length}
            </span>
          )}
        </button>

        {/* Download PDF */}
        {results && !loading && (
          <button
            onClick={() => {
              const activeBrands = selectedBrands.filter(b => results[b]);
              downloadPDF({
                currLabel, prevLabel,
                selectedDays: durationDays,
                activeBrands,
                results: adjustedResults ?? results,
                trendRows,
                granularity,
                currSeries: filtCurrSeries ?? currSeries!,
                prevSeries: filtPrevSeries ?? prevSeries!,
                currStart: dateFrom,
                prevStart,
                currBrandSeries: filtCurrBrandSeries,
                prevBrandSeries: filtPrevBrandSeries,
                excludedDates,
                currBrandDealerBreakdown,
              });
            }}
            className="flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground cursor-pointer hover:bg-muted transition-all duration-150 shadow-sm">
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </button>
        )}
      </div>

      {/* ── Exclude Dates Panel ── */}
      {showExclPanel && (
        <div className="rounded-2xl border border-orange-200 dark:border-orange-800 bg-orange-50/60 dark:bg-orange-950/20 px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <CalendarX2 className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
            <p className="text-xs font-bold text-orange-800 dark:text-orange-300">Exclude Dates from Report</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={exclInput} onChange={e => setExclInput(e.target.value)}
              className="rounded-lg border border-orange-300 dark:border-orange-700 bg-white dark:bg-background px-3 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer" />
            <button
              onClick={() => { if (!exclInput || excludedDates.includes(exclInput)) return; setExcludedDates(p => [...p, exclInput].sort()); setExclInput(""); }}
              disabled={!exclInput || excludedDates.includes(exclInput)}
              className="rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed px-3.5 py-1.5 text-xs font-bold text-white cursor-pointer transition-all duration-150">
              Add Date
            </button>
            {excludedDates.length > 0 && (
              <button onClick={() => setExcludedDates([])}
                className="rounded-lg border border-orange-300 dark:border-orange-700 bg-white dark:bg-background px-3.5 py-1.5 text-xs font-semibold text-orange-700 dark:text-orange-400 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-all duration-150">
                Clear all
              </button>
            )}
          </div>
          {excludedDates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {excludedDates.map(d => (
                <span key={d} className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 dark:bg-orange-900/40 border border-orange-200 dark:border-orange-700 px-3 py-1 text-xs font-semibold text-orange-800 dark:text-orange-300">
                  {format(parseISO(d), "MMM d, yyyy")}
                  <button onClick={() => setExcludedDates(p => p.filter(x => x !== d))}
                    className="ml-0.5 rounded-full hover:bg-orange-200 dark:hover:bg-orange-800 p-0.5 cursor-pointer transition-colors">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && <WaterFillLoader fullScreen={false} message="Fetching comparison data…" />}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}
      {!loading && !results && !error && !selectedBrands.length && (
        <p className="py-8 text-center text-sm text-muted-foreground">Select at least one brand to load data.</p>
      )}

      {/* ── Results ── */}
      {!loading && results && (() => {
        const displayResults = adjustedResults ?? results;
        const activeBrands = selectedBrands.filter(b => displayResults[b]);

        const grandTotals = METRICS.map(({ key, label, Icon, color }) => {
          const grandCurr = activeBrands.reduce((s, b) => s + displayResults[b].curr[key], 0);
          const grandPrev = activeBrands.reduce((s, b) => s + displayResults[b].prev[key], 0);
          const d = grandPrev > 0 ? ((grandCurr - grandPrev) / grandPrev) * 100 : null;
          return { key, label, Icon, color, grandCurr, grandPrev, d };
        });

        const totalCurr = trendRows.reduce((s, r) => s + r.curr, 0);
        const totalPrev = trendRows.reduce((s, r) => s + r.prev, 0);
        const trendDelta = totalPrev > 0 ? ((totalCurr - totalPrev) / totalPrev) * 100 : null;
        const showTrendLabels = trendRows.length <= 20;
        const maxTrendBar = granularity === "month" ? 72 : granularity === "week" ? 40 : 12;

        return (
          <div className="space-y-4">

            {/* KPI Row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {grandTotals.map(({ key, label, Icon, color, grandCurr, grandPrev, d }) => {
                const up = d !== null && d > 0.4;
                const dn = d !== null && d < -0.4;
                return (
                  <div key={key} className="relative rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: color }} />
                    <div className="pl-6 pr-5 pt-5 pb-5 space-y-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl shrink-0" style={{ background: `${color}15` }}>
                            <Icon className="h-4 w-4" style={{ color }} />
                          </div>
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
                        </div>
                        {comparisonMode && d !== null && (
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
                      <div>
                        <p className="text-5xl font-black tabular-nums text-foreground leading-none">
                          {grandCurr.toLocaleString()}
                        </p>
                        {comparisonMode && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            vs <span className="font-semibold text-foreground/80 tabular-nums">{grandPrev.toLocaleString()}</span> previous period
                          </p>
                        )}
                      </div>
                      {activeBrands.length > 1 && (
                        <div className="pt-3 border-t border-border/60 space-y-2.5">
                          {activeBrands.map(brand => {
                            const curr = displayResults[brand].curr[key];
                            const prev = displayResults[brand].prev[key];
                            return (
                              <div key={brand} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: BRAND_PALETTE[brand].solid }} />
                                  <span className="text-[11px] text-muted-foreground truncate">{BRAND_SHORT[brand]}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[11px] font-bold tabular-nums text-foreground">{curr.toLocaleString()}</span>
                                  {comparisonMode && <Delta curr={curr} prev={prev} size="sm" />}
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

            {/* Trend Chart */}
            {trendRows.length > 0 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-5 pb-4 border-b border-border bg-gradient-to-r from-muted/20 to-transparent">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">New Leads Over Time</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Per {granularity}{comparisonMode ? " — current vs previous period" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {comparisonMode && (
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
                    )}
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
                      {comparisonMode && (
                        <Bar dataKey="prev" name="Previous" fill="#CBD5E1" radius={[4, 4, 0, 0]} maxBarSize={maxTrendBar}>
                          {showTrendLabels && (
                            <LabelList dataKey="prev" position="top"
                              style={{ fontSize: 10, fill: "#94A3B8", fontWeight: 600 }}
                              formatter={(v: number) => v > 0 ? v : ""} />
                          )}
                        </Bar>
                      )}
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
                {comparisonMode && (
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
                )}
              </div>
            )}

            {/* Brand Comparison Matrix */}
            {activeBrands.length >= 1 && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Brand Breakdown</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">All metrics by brand</p>
                  </div>
                  {comparisonMode && (
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-semibold">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> up vs prev</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> down vs prev</span>
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Metric</th>
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
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: `${color}12` }}>
                                <Icon className="h-3.5 w-3.5" style={{ color }} />
                              </div>
                              <span className="text-xs font-semibold text-foreground">{label}</span>
                            </div>
                          </td>
                          {activeBrands.map(brand => {
                            const curr = displayResults[brand].curr[key];
                            const prev = displayResults[brand].prev[key];
                            const d = prev > 0 ? ((curr - prev) / prev) * 100 : null;
                            const up = d !== null && d > 0.4;
                            const dn = d !== null && d < -0.4;
                            return (
                              <td key={brand} className="px-6 py-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-2xl font-black tabular-nums text-foreground leading-none">
                                    {curr.toLocaleString()}
                                  </span>
                                  {comparisonMode && d !== null && (
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
                                  {comparisonMode && (
                                    <span className="text-[10px] text-muted-foreground tabular-nums">prev {prev.toLocaleString()}</span>
                                  )}
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

            {/* Dealers */}
            {(() => {
              const combined: Record<string, DealerRow & { brands: SecondaryBrand[] }> = {};
              for (const brand of activeBrands) {
                for (const row of (currBrandDealerBreakdown[brand] ?? [])) {
                  if (!combined[row.email]) combined[row.email] = { ...row, brands: [brand], count: row.count };
                  else {
                    combined[row.email].count += row.count;
                    if (!combined[row.email].brands.includes(brand)) combined[row.email].brands.push(brand);
                  }
                }
              }
              const allDealers = Object.values(combined).sort((a, b) => b.count - a.count);
              if (!allDealers.length) return null;
              const displayedDealers = showAllDealers ? allDealers : allDealers.slice(0, 10);
              const maxCount = allDealers[0]?.count || 1;
              return (
                <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-border bg-muted/20">
                    <div>
                      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Users className="h-4 w-4 text-[#3B82F6]" />
                        {showAllDealers ? "All Dealers by Lead Volume" : "Top Dealers by Lead Volume"}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Current period · {currLabel}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="rounded-xl bg-[#3B82F6]/10 px-3 py-1.5 text-center">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#3B82F6]">Dealers</p>
                        <p className="text-lg font-black tabular-nums text-[#3B82F6]">{allDealers.length}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-500/10 px-3 py-1.5 text-center">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Leads Assigned</p>
                        <p className="text-lg font-black tabular-nums text-emerald-600">{allDealers.reduce((s, d) => s + d.count, 0).toLocaleString()}</p>
                      </div>
                      {allDealers.length > 10 && (
                        <button onClick={() => setShowAllDealers(v => !v)}
                          className="rounded-xl border border-[#3B82F6]/40 bg-[#3B82F6]/5 px-3 py-1.5 text-[11px] font-semibold text-[#3B82F6] hover:bg-[#3B82F6]/10 transition-colors cursor-pointer">
                          {showAllDealers ? "Show Top 10" : `See All ${allDealers.length}`}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col lg:flex-row gap-0">
                    <div className="flex-1 min-w-0 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground w-8">#</th>
                            <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Dealer Name / Email</th>
                            <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground hidden md:table-cell">State</th>
                            {activeBrands.length > 1 && (
                              <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Brand(s)</th>
                            )}
                            <th className="px-4 py-3 text-right font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Leads</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedDealers.map((dealer, idx) => (
                            <tr key={dealer.email}
                              className={cn("border-b border-border/50 hover:bg-muted/20 transition-colors cursor-default",
                                idx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                              <td className="px-4 py-3">
                                {idx < 3 ? (
                                  <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white",
                                    idx === 0 ? "bg-amber-400" : idx === 1 ? "bg-slate-400" : "bg-orange-400")}>{idx + 1}</span>
                                ) : (
                                  <span className="text-[10px] font-mono text-muted-foreground/50">{idx + 1}</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-0.5">
                                  {dealer.name ? (
                                    <><span className="font-semibold text-foreground text-[11px]">{dealer.name}</span><span className="font-mono text-[10px] text-muted-foreground">{dealer.email}</span></>
                                  ) : (
                                    <span className="font-mono text-[11px] text-foreground">{dealer.email || "—"}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 hidden md:table-cell">
                                {dealer.state ? (
                                  <span className="inline-flex items-center rounded-md bg-[#3B82F6]/10 px-2 py-0.5 text-[10px] font-bold text-[#3B82F6]">{dealer.state}</span>
                                ) : <span className="text-muted-foreground/40 text-[10px]">—</span>}
                              </td>
                              {activeBrands.length > 1 && (
                                <td className="px-4 py-3 hidden sm:table-cell">
                                  <div className="flex flex-wrap gap-1">
                                    {dealer.brands.map(b => (
                                      <span key={b} className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
                                        style={{ background: BRAND_PALETTE[b].solid }}>{BRAND_SHORT[b]}</span>
                                    ))}
                                  </div>
                                </td>
                              )}
                              <td className="px-4 py-3 text-right">
                                <div className="flex flex-col items-end gap-1">
                                  <span className="font-black tabular-nums text-foreground text-sm">{dealer.count.toLocaleString()}</span>
                                  <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full bg-[#3B82F6]" style={{ width: `${Math.round((dealer.count / maxCount) * 100)}%` }} />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="px-4 py-2.5 flex items-center justify-between border-t border-border bg-muted/10">
                        <p className="text-[11px] text-muted-foreground">Showing {displayedDealers.length} of {allDealers.length} dealers</p>
                        {allDealers.length > 10 && (
                          <button onClick={() => setShowAllDealers(v => !v)}
                            className="rounded-lg border border-[#3B82F6]/30 bg-[#3B82F6]/5 px-3 py-1 text-[11px] font-semibold text-[#3B82F6] hover:bg-[#3B82F6]/15 transition-colors cursor-pointer">
                            {showAllDealers ? "↑ Show top 10" : `↓ See all ${allDealers.length} dealers`}
                          </button>
                        )}
                      </div>
                    </div>
                    {allDealers.length >= 3 && (
                      <div className="lg:w-[320px] shrink-0 border-t lg:border-t-0 lg:border-l border-border p-4 flex flex-col gap-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">Lead Volume{showAllDealers ? " · Top 10" : ""}</p>
                        <ResponsiveContainer width="100%" height={Math.min(allDealers.slice(0, 10).length * 36, 360)}>
                          <BarChart
                            data={allDealers.slice(0, 10).map(d => ({ name: d.name || d.email.split("@")[0], count: d.count }))}
                            layout="vertical"
                            margin={{ left: 4, right: 36, top: 4, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                            <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                              width={110} tickLine={false} axisLine={false}
                              tickFormatter={v => v.length > 16 ? v.slice(0, 15) + "…" : v} />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                              {allDealers.slice(0, 10).map((_, i) => (
                                <Cell key={i} fill={i === 0 ? "#3B82F6" : i === 1 ? "#60A5FA" : i === 2 ? "#93C5FD" : "hsl(var(--muted-foreground)/0.25)"} />
                              ))}
                              <LabelList dataKey="count" position="right"
                                style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontVariantNumeric: "tabular-nums" }}
                                formatter={(v: number) => v.toLocaleString()} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          </div>
        );
      })()}
    </div>
  );
}
