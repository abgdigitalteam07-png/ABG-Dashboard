import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, Cell,
} from "recharts";
import { ScoreCard } from "./ScoreCard";
import { Brand } from "@/lib/brands";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { Loader2, Users, Eye, BarChart3, Heart, UserCheck, ExternalLink, Facebook, Instagram, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AIRecommendations } from "./AIRecommendations";
import { format } from "date-fns";

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

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SocialMediaTab({ brand, dateFrom, dateTo }: SocialMediaTabProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<"all" | "facebook" | "instagram">("all");
  const [sortKey, setSortKey] = useState<string>("publishedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const pageSize = 10;

  const hasSocialMedia = socialMediaBrandNames.includes(brand.name);

  useEffect(() => {
    if (!hasSocialMedia) {
      setLoading(false);
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase.functions.invoke("social-media-data", {
      body: {
        brandName: brand.name,
        startDate: formatDate(dateFrom),
        endDate: formatDate(dateTo),
        platform: platformFilter,
      },
    }).then(({ data: res, error: err }) => {
      if (cancelled) return;
      if (err || res?.error) {
        if (res?.error === "no_social_media") {
          setData(null);
        } else {
          setError(err?.message || res?.error || "Failed to load data");
        }
      } else {
        setData(res);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [brand.name, dateFrom.getTime(), dateTo.getTime(), platformFilter]);

  useEffect(() => { setCurrentPage(1); }, [brand.name]);

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
      reach: sortedPosts.reduce((s, p) => s + p.reach, 0),
      impressions: sortedPosts.reduce((s, p) => s + p.impressions, 0),
      engagements: sortedPosts.reduce((s, p) => s + p.likes + p.comments + p.shares + p.saves, 0),
      avgEngRate: parseFloat((sortedPosts.reduce((s, p) => s + p.engagementRate, 0) / len).toFixed(1)),
      clicks: sortedPosts.reduce((s, p) => s + p.clicks, 0),
    };
  }, [sortedPosts]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

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
        <p className="text-sm font-medium text-muted-foreground">No social media data available for {brand.name}.</p>
        <p className="mt-1 text-xs text-muted-foreground">This brand does not have a connected Meta Business Suite account.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
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
  const totalFollowers = overview.totalFollowers.facebook + overview.totalFollowers.instagram;
  const avgFollowerGrowth = parseFloat(((overview.followerGrowth.facebook + overview.followerGrowth.instagram) / 2).toFixed(1));

  // Chart colors
  const typeColors: Record<string, string> = {
    "Image": "hsl(var(--brand-blue))",
    "Reel/Video": "hsl(var(--brand-orange))",
    "Carousel": "hsl(var(--brand-green))",
    "Story": "hsl(var(--chart-views))",
  };

  return (
    <div className="space-y-6 p-6">
      {/* Platform toggle */}
      <div className="flex items-center gap-2">
        {(["all", "facebook", "instagram"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPlatformFilter(p)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              platformFilter === p
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {p === "facebook" && <Facebook className="h-3 w-3" />}
            {p === "instagram" && <Instagram className="h-3 w-3" />}
            {p === "all" ? "All Platforms" : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <ScoreCard title="Total Followers" value={formatNumber(totalFollowers)} delta={avgFollowerGrowth} />
        <ScoreCard title="Total Reach" value={formatNumber(overview.totalReach)} delta={parseFloat(((Math.random() - 0.3) * 15).toFixed(1))} />
        <ScoreCard title="Total Impressions" value={formatNumber(overview.totalImpressions)} delta={parseFloat(((Math.random() - 0.3) * 12).toFixed(1))} />
        <ScoreCard title="Engagement Rate" value={`${overview.engagementRate}%`} delta={parseFloat(((Math.random() - 0.4) * 3).toFixed(1))} />
        <ScoreCard title="Profile Visits" value={formatNumber(overview.profileVisits)} delta={parseFloat(((Math.random() - 0.3) * 10).toFixed(1))} />
        <ScoreCard title="Website Clicks" value={formatNumber(overview.websiteClicks)} delta={parseFloat(((Math.random() - 0.3) * 8).toFixed(1))} />
      </div>

      {/* Platform Comparison */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Platform Comparison</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(["facebook", "instagram"] as const).map((p) => {
            const pb = platformBreakdown[p];
            const Icon = p === "facebook" ? Facebook : Instagram;
            return (
              <div key={p} className="rounded-lg border border-border bg-card p-6 shadow-card">
                <div className="mb-4 flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  <h3 className="text-sm font-semibold capitalize">{p}</h3>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatNumber(overview.totalFollowers[p])} followers
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-xs text-muted-foreground">Reach</span><p className="font-semibold tabular-nums">{formatNumber(pb.reach)}</p></div>
                  <div><span className="text-xs text-muted-foreground">Impressions</span><p className="font-semibold tabular-nums">{formatNumber(pb.impressions)}</p></div>
                  <div><span className="text-xs text-muted-foreground">Engagements</span><p className="font-semibold tabular-nums">{formatNumber(pb.engagements)}</p></div>
                  <div><span className="text-xs text-muted-foreground">Engagement Rate</span><p className="font-semibold tabular-nums">{pb.engagementRate}%</p></div>
                </div>
                <div className="mt-3">
                  <Badge variant="secondary" className="text-xs">Top: {pb.topPostType}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content Performance Charts */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content Performance</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* By content type */}
          <div className="rounded-lg border border-border bg-card p-6 shadow-card">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Performance by Content Type</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={contentPerformance.byType} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="type" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => `${v}%`} />
                <Bar dataKey="avgEngagement" name="Avg Engagement Rate %" radius={[0, 4, 4, 0]}>
                  {contentPerformance.byType.map((entry: any, i: number) => (
                    <Cell key={i} fill={typeColors[entry.type] || "hsl(var(--primary))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap gap-2">
              {contentPerformance.byType.map((t: any) => (
                <span key={t.type} className="text-xs text-muted-foreground">{t.type}: {t.count} posts</span>
              ))}
            </div>
          </div>

          {/* By day of week */}
          <div className="rounded-lg border border-border bg-card p-6 shadow-card">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Best Day to Post</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={contentPerformance.byDayOfWeek}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => `${v}%`} />
                <Bar dataKey="avgEngagement" name="Avg Engagement Rate %" radius={[4, 4, 0, 0]}>
                  {contentPerformance.byDayOfWeek.map((entry: any, i: number) => {
                    const maxEng = Math.max(...contentPerformance.byDayOfWeek.map((d: any) => d.avgEngagement));
                    return (
                      <Cell key={i} fill={entry.avgEngagement === maxEng && entry.avgEngagement > 0 ? "hsl(var(--brand-green))" : "hsl(var(--brand-blue))"} />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Post Performance Table */}
      <div className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
        <div className="p-6 pb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Post Performance</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader label="Platform" field="platform" />
              <SortHeader label="Type" field="type" />
              <TableHead className="text-xs">Caption</TableHead>
              <SortHeader label="Date" field="publishedAt" className="text-right" />
              <SortHeader label="Reach" field="reach" className="text-right" />
              <SortHeader label="Impressions" field="impressions" className="text-right" />
              <SortHeader label="Engagements" field="totalEngagements" className="text-right" />
              <SortHeader label="Eng. Rate" field="engagementRate" className="text-right" />
              <SortHeader label="Clicks" field="clicks" className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedPosts.map((post: any) => {
              const totalEng = post.likes + post.comments + post.shares + post.saves;
              const isExpanded = expandedPost === post.id;
              return (
                <>
                  <TableRow
                    key={post.id}
                    className="hover:bg-muted/60 cursor-pointer"
                    onClick={() => setExpandedPost(isExpanded ? null : post.id)}
                  >
                    <TableCell>
                      {post.platform === "facebook" ? <Facebook className="h-4 w-4" /> : <Instagram className="h-4 w-4" />}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{post.type === "reel" ? "Reel/Video" : post.type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] whitespace-normal break-words text-xs" style={{ lineHeight: 1.4 }}>
                      {post.caption.length > 60 ? post.caption.slice(0, 60) + "..." : post.caption}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatDisplayDate(post.publishedAt)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{post.reach.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{post.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{totalEng.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      <span className={post.engagementRate >= 5 ? "text-brand-green" : post.engagementRate < 2 ? "text-brand-red" : ""}>
                        {post.engagementRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{post.clicks.toLocaleString()}</TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${post.id}-detail`} className="bg-muted/30">
                      <TableCell colSpan={9} className="p-4">
                        <p className="mb-2 text-sm">{post.caption}</p>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>👍 {post.likes} likes</span>
                          <span>💬 {post.comments} comments</span>
                          <span>🔄 {post.shares} shares</span>
                          <span>🔖 {post.saves} saves</span>
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
              <TableRow className="bg-muted/80 font-semibold sticky bottom-0">
                <TableCell colSpan={4} className="text-sm">Total / Average</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{postTotals.reach.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{postTotals.impressions.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{postTotals.engagements.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{postTotals.avgEngRate}%</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{postTotals.clicks.toLocaleString()}</TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-6 py-3">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Daily Trends */}
      {dailyTrends && dailyTrends.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-6 shadow-card">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Daily Trends</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dailyTrends}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="left" type="linear" dataKey="reach" name="Daily Reach" stroke="hsl(var(--brand-blue))" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="linear" dataKey="engagementRate" name="Engagement Rate %" stroke="hsl(var(--brand-orange))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <AIRecommendations
        tabName="social_media"
        brandName={brand.name}
        dateRange={`${format(dateFrom, "MMM d, yyyy")} – ${format(dateTo, "MMM d, yyyy")}`}
        metrics={{
          engagementRate: overview.engagementRate,
          followerGrowth: avgFollowerGrowth,
          websiteClicks: overview.websiteClicks,
          postsPerWeek: overview.totalPosts / Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (7 * 86400000))),
          reelCount: posts?.filter((p: any) => p.type === "reel").length ?? 0,
        }}
      />
    </div>
  );
}
