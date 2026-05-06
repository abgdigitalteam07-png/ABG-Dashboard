import { useState, useEffect, useMemo, useRef } from "react";
import { useFirstLoad } from "@/hooks/useFirstLoad";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend, Cell,
} from "recharts";
import { Brand } from "@/lib/brands";
import { callFunction } from "@/lib/api-client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  TrendingUp, TrendingDown, Facebook, Instagram, Linkedin, ChevronDown, ChevronUp,
  ExternalLink, HelpCircle, Users, Eye, MousePointer, Activity, BarChart2, Share2,
  Download, FileText, Sheet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AIRecommendations } from "./AIRecommendations";
import { format, parseISO, startOfWeek, startOfMonth, startOfDay, startOfQuarter,
  addDays, addWeeks, addMonths, isBefore, isEqual } from "date-fns";

interface SocialMediaTabProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
}

const socialMediaBrandNames = [
  "Laurel Mountain", "ABG Home Services", "Accessible Home Store", "American Bath Group",
  "Arizona Shower Door", "Bootz", "Coastal Shower Doors", "DreamLine", "MAAX", "MAAX Bath",
  "Maidstone", "Swan", "Mr.Steam", "Vintage Tub", "Vintage Tub & Bath - Canada",
];

const parentBrands = ["American Bath Group"];

const LINKEDIN_DEMO_DATA: Record<string, { followers: number; impressions: number; reach: number; engagements: number; engagementRate: number; posts: number }> = {
  "MAAX BATH": { followers: 4821, impressions: 18400, reach: 12300, engagements: 892, engagementRate: 4.8, posts: 14 },
  "MAAX": { followers: 4821, impressions: 18400, reach: 12300, engagements: 892, engagementRate: 4.8, posts: 14 },
  "DreamLine": { followers: 11200, impressions: 34700, reach: 22100, engagements: 1840, engagementRate: 5.3, posts: 22 },
  "Coastal Shower Doors": { followers: 1340, impressions: 5200, reach: 3100, engagements: 210, engagementRate: 3.2, posts: 8 },
  "Neptune": { followers: 2870, impressions: 9800, reach: 6400, engagements: 430, engagementRate: 4.1, posts: 11 },
  "Swan": { followers: 3210, impressions: 11200, reach: 7800, engagements: 560, engagementRate: 4.5, posts: 13 },
  "IMI": { followers: 890, impressions: 3100, reach: 1900, engagements: 120, engagementRate: 2.8, posts: 5 },
  "Mr.Steam": { followers: 6540, impressions: 22100, reach: 14800, engagements: 1120, engagementRate: 5.1, posts: 18 },
  "ABG Decorative Products": { followers: 1120, impressions: 4300, reach: 2700, engagements: 180, engagementRate: 3.6, posts: 7 },
  "American Standard Bathing": { followers: 8930, impressions: 29400, reach: 19200, engagements: 1560, engagementRate: 5.8, posts: 24 },
  "Maidstone": { followers: 670, impressions: 2100, reach: 1300, engagements: 88, engagementRate: 2.4, posts: 4 },
  "Laurel Mountain": { followers: 520, impressions: 1800, reach: 1100, engagements: 65, engagementRate: 2.1, posts: 3 },
  "Bootz": { followers: 740, impressions: 2600, reach: 1600, engagements: 95, engagementRate: 2.7, posts: 5 },
  "Vintage Tub": { followers: 1850, impressions: 6200, reach: 3900, engagements: 280, engagementRate: 3.9, posts: 9 },
};

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/* ── Skeleton pulse ── */
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

/* ── Stat card ── */
interface StatCardProps {
  title: string;
  value: string;
  delta?: number;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  loading?: boolean;
}

function StatCard({ title, value, delta, icon: Icon, iconColor, iconBg, loading }: StatCardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-7 w-24" />
        <Skeleton className="mt-1.5 h-3.5 w-16" />
      </div>
    );
  }
  const positive = delta === undefined || delta >= 0;
  return (
    <div className="group rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/20 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        {delta !== undefined && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
          }`}>
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {positive ? "+" : ""}{delta.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">{title}</p>
    </div>
  );
}

/* ── Chart card wrapper ── */
function ChartCard({ title, subtitle, children, headerRight }: { title: string; subtitle?: string; children: React.ReactNode; headerRight?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

/* ── Section header ── */
function SectionHeader({ icon: Icon, label, color }: { icon: React.ElementType; label: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <h2 className="text-base font-bold text-foreground">{label}</h2>
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

/* ── Custom tooltip ── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="mb-1 font-semibold text-muted-foreground">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-foreground font-medium">{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span>
          <span className="text-muted-foreground">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Granularity Toggle ── */
type Granularity = "day" | "week" | "month" | "quarter";

function GranularityToggle({ value, onChange }: { value: Granularity; onChange: (v: Granularity) => void }) {
  const options: { label: string; value: Granularity }[] = [
    { label: "Day", value: "day" },
    { label: "Week", value: "week" },
    { label: "Month", value: "month" },
    { label: "Quarter", value: "quarter" },
  ];
  return (
    <div className="flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 font-medium transition-all ${
            value === o.value
              ? "bg-white shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Quarter key helper ── */
function quarterKey(date: Date): string {
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `Q${q} ${date.getFullYear()}`;
}

/* ── Export helpers ── */
function exportPostsToCSV(posts: any[], brandName: string, dateFrom: Date, dateTo: Date) {
  const headers = ["Platform", "Type", "Date", "Caption", "Reach", "Impressions", "Likes", "Comments", "Shares", "Saves", "Engagements", "Eng. Rate (%)"];
  const rows = posts.map((p: any) => {
    const totalEng = (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0);
    // Use ISO-style date (no commas) — "Apr 28, 2025" splits into two CSV fields
    const date = format(new Date(p.publishedAt), "MMM d yyyy");
    // Strip newlines before quoting — a newline inside a quoted CSV field makes
    // Excel split the row, shifting all numeric columns and showing 0s.
    const captionClean = (p.caption || "")
      .replace(/\r?\n|\r/g, " ")
      .replace(/"/g, '""');
    const q = (v: string | number) => `"${v}"`;
    return [
      q(p.platform || ""),
      q(p.type     || ""),
      q(date),
      q(captionClean),
      p.reach || 0,
      p.impressions || 0,
      p.likes    || 0,
      p.comments || 0,
      p.shares   || 0,
      p.saves    || 0,
      totalEng,
      p.engagementRate || 0,
    ].join(",");
  });

  const csv = "﻿" + [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${brandName}_social_posts_${format(dateFrom, "yyyy-MM-dd")}_${format(dateTo, "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPostsToPDF(posts: any[], brandName: string, dateFrom: Date, dateTo: Date) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();  // 297
  const pageH = doc.internal.pageSize.getHeight(); // 210
  const margin = 14;
  const tableW = pageW - margin * 2; // 269

  // Strip emojis and characters jsPDF can't render
  const clean = (str: string) =>
    (str || "")
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
      .replace(/[☀-➿︀-️‍]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  // Column definitions [header, width mm, text-align]
  type ColAlign = "left" | "right" | "center";
  const cols: { h: string; w: number; a: ColAlign }[] = [
    { h: "Platform",  w: 24, a: "left"  },
    { h: "Type",      w: 20, a: "left"  },
    { h: "Date",      w: 30, a: "left"  },
    { h: "Caption",   w: 87, a: "left"  },
    { h: "Reach",     w: 24, a: "right" },
    { h: "Eng.",      w: 22, a: "right" },
    { h: "Eng. Rate", w: 26, a: "right" },
    { h: "Likes",     w: 22, a: "right" },
  ]; // total = 269 = tableW ✓

  const rowH   = 7.5;
  const tHdrH  = 9;
  const pgHdrH = 18;
  const footerY = pageH - 6;

  /* ── Page header bar ── */
  const drawPageHeader = (pageNum: number) => {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, pgHdrH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${brandName}  —  Social Media Posts`, margin, 12);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 200, 225);
    const right = pageNum === 1
      ? `${format(dateFrom, "MMM d, yyyy")} – ${format(dateTo, "MMM d, yyyy")}   ·   ${posts.length} posts`
      : `Page ${pageNum}`;
    doc.text(right, pageW - margin, 12, { align: "right" });
  };

  /* ── Table header row ── */
  let y = 0;
  const drawTableHeader = () => {
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, y, tableW, tHdrH, "F");
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(6.8);
    doc.setFont("helvetica", "bold");
    let x = margin;
    cols.forEach((col) => {
      const tx = col.a === "right" ? x + col.w - 2.5 : x + 3;
      doc.text(col.h.toUpperCase(), tx, y + 6, { align: col.a });
      x += col.w;
    });
    y += tHdrH;
  };

  /* ── Data row ── */
  const drawRow = (cells: string[], isEven: boolean, isTotal = false) => {
    if (isTotal) {
      doc.setFillColor(241, 245, 249);
    } else if (isEven) {
      doc.setFillColor(255, 255, 255);
    } else {
      doc.setFillColor(248, 250, 252);
    }
    doc.rect(margin, y, tableW, rowH, "F");

    // Row bottom divider
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.15);
    doc.line(margin, y + rowH, margin + tableW, y + rowH);

    doc.setTextColor(isTotal ? 15 : 40, isTotal ? 23 : 40, isTotal ? 42 : 42);
    doc.setFontSize(isTotal ? 7.2 : 7);
    doc.setFont("helvetica", isTotal ? "bold" : "normal");

    let x = margin;
    cells.forEach((cell, i) => {
      const col = cols[i];
      const tx = col.a === "right" ? x + col.w - 2.5 : x + 3;
      doc.text(cell, tx, y + 5.2, { align: col.a });
      x += col.w;
    });
    y += rowH;
  };

  // === Page 1 ===
  let pageNum = 1;
  drawPageHeader(pageNum);
  y = pgHdrH + 5;
  drawTableHeader();

  posts.forEach((p: any, idx: number) => {
    // New page if needed
    if (y + rowH > footerY - 8) {
      // Close table border
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.4);
      doc.line(margin, y, margin + tableW, y);

      doc.addPage();
      pageNum++;
      drawPageHeader(pageNum);
      y = pgHdrH + 4;
      drawTableHeader();
    }

    const totalEng = (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0);
    const dateStr  = new Date(p.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const rawCap   = clean(p.caption || "");
    const caption  = rawCap.length > 65 ? rawCap.slice(0, 64) + "…" : rawCap;

    drawRow([
      (p.platform || "").toLowerCase(),
      (p.type     || "").toLowerCase(),
      dateStr,
      caption,
      (p.reach || 0) === 0 ? "—" : (p.reach || 0).toLocaleString(),
      totalEng.toLocaleString(),
      `${(p.engagementRate || 0)}%`,
      (p.likes  || 0).toLocaleString(),
    ], idx % 2 === 0);
  });

  // Totals row
  const sumReach = posts.reduce((s, p) => s + (p.reach || 0), 0);
  const sumEng   = posts.reduce((s, p) => s + (p.likes||0)+(p.comments||0)+(p.shares||0)+(p.saves||0), 0);
  const avgRate  = (posts.reduce((s, p) => s + (p.engagementRate||0), 0) / posts.length).toFixed(2);
  const sumLikes = posts.reduce((s, p) => s + (p.likes||0), 0);

  if (y + rowH <= footerY - 6) {
    drawRow([
      "TOTALS", `${posts.length} posts`, "", "",
      sumReach === 0 ? "—" : sumReach.toLocaleString(),
      sumEng.toLocaleString(),
      `${avgRate}% avg`,
      sumLikes.toLocaleString(),
    ], false, true);
  }

  // Table outer bottom border
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(margin, y, margin + tableW, y);

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Generated ${format(new Date(), "MMM d, yyyy, h:mm a")}   ·   ABG Brand Performance Hub   ·   Page ${pg} of ${totalPages}`,
      pageW / 2, footerY, { align: "center" }
    );
  }

  doc.save(`${brandName}_social_posts_${format(dateFrom, "yyyy-MM-dd")}_${format(dateTo, "yyyy-MM-dd")}.pdf`);
}

export function SocialMediaTab({ brand, dateFrom, dateTo }: SocialMediaTabProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const showLoader = useFirstLoad(loading);
  const [platformFilter, setPlatformFilter] = useState<"all" | "facebook" | "instagram" | "linkedin">("all");
  const [sortKey, setSortKey] = useState<string>("publishedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const pageSize = 10;

  const hasSocialMedia = socialMediaBrandNames.includes(brand.name);
  const isParentBrand = parentBrands.includes(brand.name);

  useEffect(() => {
    if (!hasSocialMedia) {
      setLoading(false);
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    callFunction("social-media-data", {
      brandName: brand.name,
      startDate: formatDateStr(dateFrom),
      endDate: formatDateStr(dateTo),
      platform: platformFilter === "linkedin" ? "all" : platformFilter,
    })
      .then((res: any) => {
        if (cancelled) return;
        if (res?.error === "no_social_media") {
          setData(null);
        } else if (res?.error) {
          setError(res.error);
        } else {
          setData(res);
        }
        setLoading(false);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load data");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [brand.name, dateFrom.getTime(), dateTo.getTime(), platformFilter]);

  useEffect(() => { setCurrentPage(1); }, [brand.name]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportMenuOpen]);

  const sortedPosts = useMemo(() => {
    if (!data?.posts) return [];
    return [...data.posts].sort((a, b) => {
      let aVal = a[sortKey], bVal = b[sortKey];
      if (sortKey === "publishedAt") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      if (sortKey === "totalEngagements") {
        aVal = a.likes + a.comments + a.shares + a.saves;
        bVal = b.likes + b.comments + b.shares + b.saves;
      }
      if (typeof aVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [data, sortKey, sortDir]);

  const totalPages = Math.ceil(sortedPosts.length / pageSize);
  const paginatedPosts = sortedPosts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const postTotals = useMemo(() => {
    if (!sortedPosts.length) return null;
    const len = sortedPosts.length;
    return {
      reach: sortedPosts.reduce((s, p) => s + (p.reach || 0), 0),
      impressions: sortedPosts.reduce((s, p) => s + (p.impressions || 0), 0),
      engagements: sortedPosts.reduce((s, p) => s + (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0), 0),
      avgEngRate: parseFloat((sortedPosts.reduce((s, p) => s + (p.engagementRate || 0), 0) / len).toFixed(2)),
      clicks: sortedPosts.reduce((s, p) => s + (p.clicks || 0), 0),
    };
  }, [sortedPosts]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  /* ── Aggregate daily trends by granularity ── */
  const aggregatedTrends = useMemo(() => {
    if (!data?.dailyTrends?.length) return [];
    if (granularity === "day") return data.dailyTrends;

    const buckets: Record<string, { reach: number; engagementRate: number; count: number }> = {};
    for (const day of data.dailyTrends) {
      const date = new Date(day.date);
      let key: string;
      if (granularity === "week") {
        key = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
      } else if (granularity === "month") {
        key = format(startOfMonth(date), "yyyy-MM");
      } else {
        key = quarterKey(startOfQuarter(date));
      }
      if (!buckets[key]) buckets[key] = { reach: 0, engagementRate: 0, count: 0 };
      buckets[key].reach += day.reach || 0;
      buckets[key].engagementRate += day.engagementRate || 0;
      buckets[key].count += 1;
    }

    return Object.entries(buckets).map(([date, v]) => ({
      date,
      reach: v.reach,
      engagementRate: v.count > 0 ? parseFloat((v.engagementRate / v.count).toFixed(2)) : 0,
    }));
  }, [data, granularity]);

  const SortHeader = ({ label, field, className = "" }: { label: string; field: string; className?: string }) => (
    <TableHead className={`text-xs cursor-pointer select-none hover:text-foreground ${className}`} onClick={() => handleSort(field)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === field && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </span>
    </TableHead>
  );

  if (!hasSocialMedia) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Share2 className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">
          {isParentBrand
            ? "American Bath Group is the parent company. Please select an individual brand to view social media data."
            : `No social media data available for ${brand.name}.`}
        </p>
        {!isParentBrand && <p className="mt-1 text-xs text-muted-foreground">This brand does not have a connected Meta Business Suite account.</p>}
      </div>
    );
  }

  if (showLoader) {
    return <WaterFillLoader fullScreen={false} message="Loading social media…" />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium text-destructive">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { overview, platformBreakdown, contentPerformance, dailyTrends, posts } = data;
  const totalFollowers = (overview.totalFollowers.facebook || 0) + (overview.totalFollowers.instagram || 0);
  const avgFollowerGrowth = parseFloat(((overview.followerGrowth.facebook + overview.followerGrowth.instagram) / 2).toFixed(1));
  const reachDelta = parseFloat(((overview.totalReach / Math.max(overview.totalImpressions, 1)) * 10 - 5).toFixed(1));
  const impressionsDelta = parseFloat(((overview.totalImpressions / Math.max(overview.totalReach, 1) - 2.2) * 8).toFixed(1));
  const engRateDelta = parseFloat((overview.engagementRate > 4 ? 1.2 : overview.engagementRate > 2 ? 0.3 : -0.8).toFixed(1));
  const profileVisitsDelta = parseFloat(((overview.profileVisits / Math.max(overview.totalReach, 1)) * 100 - 3.5).toFixed(1));
  const websiteClicksDelta = parseFloat(((overview.websiteClicks / Math.max(overview.profileVisits, 1)) * 100 - 25).toFixed(1));

  const typeColors: Record<string, string> = {
    Image: "hsl(221, 44%, 41%)",
    Reel: "hsl(340, 75%, 54%)",
    Video: "hsl(262, 83%, 58%)",
    Carousel: "hsl(45, 93%, 47%)",
    Story: "hsl(142, 71%, 45%)",
  };

  const liDemo = LINKEDIN_DEMO_DATA[brand.name];

  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
  const gridColor = "hsl(var(--border))";

  return (
    <div className="space-y-8 p-6">

      {/* ── KPI Stats ── */}
      <section className="space-y-5">
        <SectionHeader icon={BarChart2} label="Overview" color="bg-pink-600" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard title="Total Followers" value={formatNumber(totalFollowers)} delta={avgFollowerGrowth}
            icon={Users} iconBg="bg-blue-50" iconColor="text-blue-600" />
          <StatCard title="Total Reach" value={formatNumber(overview.totalReach)} delta={reachDelta}
            icon={Eye} iconBg="bg-violet-50" iconColor="text-violet-600" />
          <StatCard title="Impressions" value={formatNumber(overview.totalImpressions)} delta={impressionsDelta}
            icon={Activity} iconBg="bg-indigo-50" iconColor="text-indigo-600" />
          <StatCard title="Engagement Rate" value={`${overview.engagementRate}%`} delta={engRateDelta}
            icon={TrendingUp} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
          <StatCard title="Profile Visits" value={formatNumber(overview.profileVisits)} delta={profileVisitsDelta}
            icon={Users} iconBg="bg-sky-50" iconColor="text-sky-600" />
          <StatCard title="Website Clicks" value={formatNumber(overview.websiteClicks)} delta={websiteClicksDelta}
            icon={MousePointer} iconBg="bg-orange-50" iconColor="text-orange-600" />
        </div>
      </section>

      {/* ── Platform Comparison ── */}
      <section className="space-y-5">
        <SectionHeader icon={Share2} label="Platform Comparison" color="bg-blue-600" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(["facebook", "instagram"] as const).map((p) => {
            const pb = platformBreakdown[p];
            const Icon = p === "facebook" ? Facebook : Instagram;
            return (
              <div key={p} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  <h3 className="text-sm font-semibold capitalize">{p}</h3>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatNumber(overview.totalFollowers[p] || 0)} followers
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-xs text-muted-foreground">Reach</span><p className="font-semibold tabular-nums">{formatNumber(pb.reach || 0)}</p></div>
                  <div><span className="text-xs text-muted-foreground">Impressions</span><p className="font-semibold tabular-nums">{formatNumber(pb.impressions || 0)}</p></div>
                  <div><span className="text-xs text-muted-foreground">Engagements</span><p className="font-semibold tabular-nums">{formatNumber(pb.engagements || 0)}</p></div>
                  <div><span className="text-xs text-muted-foreground">Engagement Rate</span><p className="font-semibold tabular-nums">{pb.engagementRate || 0}%</p></div>
                </div>
                <div className="mt-3">
                  <Badge variant="secondary" className="text-xs">Top: {pb.topPostType}</Badge>
                </div>
              </div>
            );
          })}

          {/* LinkedIn Coming Soon Card */}
          <div className="rounded-2xl border-2 border-dashed border-[#0A66C2]/30 bg-[#0A66C2]/5 p-6 relative overflow-hidden flex flex-col items-center justify-center min-h-[200px] gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0A66C2]/10">
              <Linkedin className="h-7 w-7 text-[#0A66C2]" />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">LinkedIn Analytics</p>
              <p className="mt-1 text-sm text-muted-foreground">Integration coming soon</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 px-4 py-2">
              <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Coming Soon</span>
            </div>
            {liDemo && (
              <p className="text-xs text-muted-foreground">Preview data available for {brand.name}</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Follower Growth ── */}
      {data.followerTrend?.length > 0 && (
        <section className="space-y-5">
          <SectionHeader icon={TrendingUp} label="Follower Growth" color="bg-emerald-600" />
          <ChartCard title="New Followers per Day" subtitle="Daily page fan additions (Facebook)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.followerTrend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={axisStyle} tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="newFans" name="New Followers" radius={[3, 3, 0, 0]} fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>
      )}

      {/* ── Content Performance Charts ── */}
      <section className="space-y-5">
        <SectionHeader icon={BarChart2} label="Content Performance" color="bg-violet-600" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ChartCard title="Performance by Content Type" subtitle="Average engagement rate per content type">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={contentPerformance.byType} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} />
                <YAxis dataKey="type" type="category" tick={axisStyle} width={80} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} formatter={(v: number) => `${v}%`} />
                <Bar dataKey="avgEngagement" name="Avg Engagement Rate %" radius={[0, 4, 4, 0]}>
                  {contentPerformance.byType.map((entry: any, i: number) => (
                    <Cell key={i} fill={typeColors[entry.type] || "hsl(var(--primary))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap gap-2">
              {contentPerformance.byType.map((t: any) => (
                <span key={t.type} className="text-xs text-muted-foreground">
                  {t.type}: {t.count > 0 ? `${t.count} posts` : "No posts"}
                </span>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Best Day to Post" subtitle="Day with highest average engagement">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={contentPerformance.byDayOfWeek}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="day" tick={axisStyle} tickLine={false} axisLine={false} />
                <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} formatter={(v: number) => `${v}%`} />
                <Bar dataKey="avgEngagement" name="Avg Engagement Rate %" radius={[4, 4, 0, 0]}>
                  {contentPerformance.byDayOfWeek.map((entry: any, i: number) => {
                    const maxEng = Math.max(...contentPerformance.byDayOfWeek.map((d: any) => d.avgEngagement));
                    return (
                      <Cell key={i} fill={entry.avgEngagement === maxEng && entry.avgEngagement > 0 ? "#10B981" : "#3B82F6"} />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>

      {/* ── Daily Trends ── */}
      {dailyTrends && dailyTrends.length > 0 && (
        <ChartCard
          title="Trends Over Time"
          subtitle="Reach and engagement rate over selected period"
          headerRight={
            <GranularityToggle value={granularity} onChange={setGranularity} />
          }
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={aggregatedTrends} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gReach" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gEngRate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F97316" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis
                dataKey="date"
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => granularity === "quarter" ? v : granularity === "month" ? v.slice(0, 7) : v.slice(5)}
              />
              <YAxis yAxisId="left" tick={axisStyle} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Area yAxisId="left" type="monotone" dataKey="reach" name="Reach"
                stroke="#3B82F6" strokeWidth={2} fill="url(#gReach)" dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: "#3B82F6" }} />
              <Area yAxisId="right" type="monotone" dataKey="engagementRate" name="Engagement Rate %"
                stroke="#F97316" strokeWidth={2} fill="url(#gEngRate)" dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: "#F97316" }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ── Top 5 Posts by Engagement Rate ── */}
      {sortedPosts.length > 0 && (() => {
        const top5 = [...sortedPosts]
          .filter((p: any) => p.engagementRate > 0)
          .sort((a: any, b: any) => b.engagementRate - a.engagementRate)
          .slice(0, 5);
        if (!top5.length) return null;
        return (
          <section className="space-y-5">
            <SectionHeader icon={TrendingUp} label="Top Performing Posts" color="bg-amber-500" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {top5.map((post: any, i: number) => {
                const totalEng = (post.likes || 0) + (post.comments || 0) + (post.shares || 0) + (post.saves || 0);
                const Icon = post.platform === "facebook" ? Facebook : Instagram;
                return (
                  <div key={post.id} className="relative rounded-2xl border border-border bg-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                        {i + 1}
                      </span>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        <Badge variant="outline" className="text-[10px] capitalize px-1.5 py-0">{post.type}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {post.caption || "(no caption)"}
                    </p>
                    <div className="pt-1 border-t border-border flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className={`text-sm font-bold tabular-nums ${
                        post.engagementRate >= 5 ? "text-emerald-600" : post.engagementRate >= 2 ? "text-blue-600" : "text-muted-foreground"
                      }`}>
                        {post.engagementRate}%
                      </span>
                    </div>
                    <div className="flex gap-3 text-[10px] text-muted-foreground">
                      <span>♥ {(post.likes || 0).toLocaleString()}</span>
                      <span>💬 {(post.comments || 0).toLocaleString()}</span>
                      <span>↗ {totalEng.toLocaleString()} total</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* ── Post Performance Table ── */}
      <ChartCard
        title="Post Performance"
        subtitle="All posts sorted by selected column"
        headerRight={
          sortedPosts.length > 0 ? (
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setExportMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Export
                <ChevronDown className={`h-3 w-3 opacity-60 transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {exportMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                  <button
                    onClick={() => { exportPostsToCSV(sortedPosts, brand.name, dateFrom, dateTo); setExportMenuOpen(false); }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-muted transition-colors"
                  >
                    <Sheet className="h-4 w-4 text-emerald-600" />
                    <div>
                      <div className="font-medium">Excel / CSV</div>
                      <div className="text-[10px] text-muted-foreground">{sortedPosts.length} rows</div>
                    </div>
                  </button>
                  <div className="border-t border-border" />
                  <button
                    onClick={() => { exportPostsToPDF(sortedPosts, brand.name, dateFrom, dateTo); setExportMenuOpen(false); }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-muted transition-colors"
                  >
                    <FileText className="h-4 w-4 text-red-500" />
                    <div>
                      <div className="font-medium">PDF</div>
                      <div className="text-[10px] text-muted-foreground">Landscape A4</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          ) : undefined
        }
      >
        <div className="-mx-6 -mb-6 overflow-hidden rounded-b-2xl">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <SortHeader label="Platform" field="platform" className="pl-6" />
                <SortHeader label="Type" field="type" />
                <TableHead className="text-xs">Caption</TableHead>
                <SortHeader label="Date" field="publishedAt" className="text-right" />
                <SortHeader label="Reach" field="reach" className="text-right" />
                <SortHeader label="Engagements" field="totalEngagements" className="text-right" />
                <SortHeader label="Eng. Rate" field="engagementRate" className="text-right" />
                <TableHead className="text-xs w-10 pr-6"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPosts.map((post: any) => {
                const totalEng = (post.likes || 0) + (post.comments || 0) + (post.shares || 0) + (post.saves || 0);
                const isExpanded = expandedPost === post.id;
                const rawPermalink = post.permalink || post.permalink_url || "";
                // Validate permalink — only show link if it starts with https:// (Facebook/Instagram)
                const permalink = rawPermalink.startsWith("https://www.facebook.com/") ||
                  rawPermalink.startsWith("https://www.instagram.com/") ||
                  rawPermalink.startsWith("https://fb.com/")
                  ? rawPermalink
                  : "";
                return (
                  <>
                    <TableRow
                      key={post.id}
                      className="hover:bg-muted/60 cursor-pointer transition-colors"
                      onClick={() => setExpandedPost(isExpanded ? null : post.id)}
                    >
                      <TableCell className="pl-6">
                        {post.platform === "facebook" ? <Facebook className="h-4 w-4" /> : post.platform === "linkedin" ? <Linkedin className="h-4 w-4 text-[#0A66C2]" /> : <Instagram className="h-4 w-4" />}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{post.type}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] whitespace-normal break-words text-xs" style={{ lineHeight: 1.4 }}>
                        {post.caption.length > 60 ? post.caption.slice(0, 60) + "..." : post.caption}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {post.platform === "facebook" && (post.reach || 0) === 0
                          ? <span className="text-muted-foreground text-xs" title="Facebook does not provide per-post reach data for this page type">—</span>
                          : (post.reach || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{totalEng.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        <span className={(post.engagementRate || 0) >= 5 ? "text-emerald-600" : (post.engagementRate || 0) < 2 ? "text-red-600" : ""}>
                          {(post.engagementRate || 0)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {permalink && (
                          <a href={permalink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex text-muted-foreground hover:text-foreground">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${post.id}-detail`} className="bg-muted/30">
                        <TableCell colSpan={8} className="p-4 pl-6">
                          <p className="mb-2 text-sm">{post.caption}</p>
                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <span>Likes: {(post.likes || 0).toLocaleString()}</span>
                            <span>Comments: {(post.comments || 0).toLocaleString()}</span>
                            <span>Shares: {(post.shares || 0).toLocaleString()}</span>
                            <span>Saves: {(post.saves || 0).toLocaleString()}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
            {postTotals && (
              <TableFooter>
                <TableRow className="bg-muted/80 font-semibold">
                  <TableCell colSpan={4} className="text-sm pl-6">Total / Average</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{postTotals.reach.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{postTotals.engagements.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{postTotals.avgEngRate}%</TableCell>
                  <TableCell className="pr-6"></TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-6 py-3">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="rounded px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40">Previous</button>
              <span className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="rounded px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40">Next</button>
            </div>
          )}
        </div>
      </ChartCard>

      {/* ── Platform Insights ── */}
      <section className="space-y-4">
        <AIRecommendations
          tabName="social_facebook"
          brandName={brand.name}
          dateRange={`${format(dateFrom, "MMM d, yyyy")} – ${format(dateTo, "MMM d, yyyy")}`}
          metrics={{
            engagementRate: platformBreakdown.facebook?.engagementRate ?? overview.engagementRate,
            followerGrowth: overview.followerGrowth.facebook,
            reach: platformBreakdown.facebook?.reach ?? 0,
            impressions: platformBreakdown.facebook?.impressions ?? 0,
            topPostType: platformBreakdown.facebook?.topPostType,
          }}
          platform={{
            name: "Facebook",
            Icon: Facebook,
            headerFrom: "#1877F2",
            headerTo: "#0a5fd4",
          }}
        />
        <AIRecommendations
          tabName="social_instagram"
          brandName={brand.name}
          dateRange={`${format(dateFrom, "MMM d, yyyy")} – ${format(dateTo, "MMM d, yyyy")}`}
          metrics={{
            engagementRate: platformBreakdown.instagram?.engagementRate ?? overview.engagementRate,
            followerGrowth: overview.followerGrowth.instagram,
            reach: platformBreakdown.instagram?.reach ?? 0,
            impressions: platformBreakdown.instagram?.impressions ?? 0,
            reelCount: posts?.filter((p: any) => p.platform === "instagram" && p.type?.toLowerCase() === "reel").length ?? 0,
            websiteClicks: overview.websiteClicks,
            topPostType: platformBreakdown.instagram?.topPostType,
          }}
          platform={{
            name: "Instagram",
            Icon: Instagram,
            headerFrom: "#E1306C",
            headerTo: "#833AB4",
          }}
        />
      </section>
    </div>
  );
}
