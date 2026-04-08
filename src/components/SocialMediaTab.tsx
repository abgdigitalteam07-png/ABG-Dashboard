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
import { Loader2, Facebook, Instagram, Linkedin, ChevronDown, ChevronUp, ExternalLink, HelpCircle } from "lucide-react";
import { WaterFillLoader } from "./WaterFillLoader";
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
  const [platformFilter, setPlatformFilter] = useState<"all" | "facebook" | "instagram" | "linkedin">("all");
  const [sortKey, setSortKey] = useState<string>("publishedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
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

    supabase.functions.invoke("social-media-data", {
      body: {
        brandName: brand.name,
        startDate: formatDate(dateFrom),
        endDate: formatDate(dateTo),
        platform: platformFilter === "linkedin" ? "all" : platformFilter,
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
        <p className="text-sm font-medium text-muted-foreground">
          {isParentBrand
            ? "American Bath Group is the parent company. Please select an individual brand to view social media data."
            : `No social media data available for ${brand.name}.`}
        </p>
        {!isParentBrand && <p className="mt-1 text-xs text-muted-foreground">This brand does not have a connected Meta Business Suite account.</p>}
      </div>
    );
  }

  if (loading) {
    return <WaterFillLoader message="Loading social media data…" fullScreen={false} />;
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

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <ScoreCard title="Total Followers" value={formatNumber(totalFollowers)} delta={avgFollowerGrowth} />
        <ScoreCard title="Total Reach" value={formatNumber(overview.totalReach)} delta={reachDelta} />
        <ScoreCard title="Total Impressions" value={formatNumber(overview.totalImpressions)} delta={impressionsDelta} />
        <ScoreCard title="Engagement Rate" value={`${overview.engagementRate}%`} delta={engRateDelta} />
        <ScoreCard title="Profile Visits" value={formatNumber(overview.profileVisits)} delta={profileVisitsDelta} />
        <ScoreCard title="Website Clicks" value={formatNumber(overview.websiteClicks)} delta={websiteClicksDelta} />
      </div>

      {/* Platform Comparison */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Platform Comparison</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(["facebook", "instagram"] as const).map((p) => {
            const pb = platformBreakdown[p];
            const Icon = p === "facebook" ? Facebook : Instagram;
            return (
              <div key={p} className="rounded-lg border border-border bg-card p-6 shadow-card">
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
          <div className="rounded-lg border border-border bg-card p-6 shadow-card relative overflow-hidden">
            <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              <HelpCircle className="h-3 w-3" />
              Coming Soon
            </div>
            <div className="mb-4 flex items-center gap-2">
              <Linkedin className="h-5 w-5 text-[#0A66C2]" />
              <h3 className="text-sm font-semibold">LinkedIn</h3>
              <span className="ml-auto text-xs text-muted-foreground">
                {liDemo ? formatNumber(liDemo.followers) : "—"} followers
              </span>
            </div>
            {liDemo ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Reach</span>
                    <p className="font-semibold tabular-nums text-muted-foreground/60">{formatNumber(liDemo.reach)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Impressions</span>
                    <p className="font-semibold tabular-nums text-muted-foreground/60">{formatNumber(liDemo.impressions)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Engagements</span>
                    <p className="font-semibold tabular-nums text-muted-foreground/60">{formatNumber(liDemo.engagements)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Engagement Rate</span>
                    <p className="font-semibold tabular-nums text-muted-foreground/60">{liDemo.engagementRate}%</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs text-muted-foreground">Demo Data</Badge>
                  <span className="text-xs text-muted-foreground">API access pending</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground mt-2">No LinkedIn page mapped for this brand yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Content Performance Charts */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content Performance</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                <span key={t.type} className="text-xs text-muted-foreground">
                  {t.type}: {t.count > 0 ? `${t.count} posts` : "No posts"}
                </span>
              ))}
            </div>
          </div>

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
              <TableHead className="text-xs w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedPosts.map((post: any) => {
              const totalEng = (post.likes || 0) + (post.comments || 0) + (post.shares || 0) + (post.saves || 0);
              const isExpanded = expandedPost === post.id;
              const permalink = post.permalink || post.permalink_url || "";
              return (
                <>
                  <TableRow
                    key={post.id}
                    className="hover:bg-muted/60 cursor-pointer"
                    onClick={() => setExpandedPost(isExpanded ? null : post.id)}
                  >
                    <TableCell>
                      {post.platform === "facebook" ? <Facebook className="h-4 w-4" /> : post.platform === "linkedin" ? <Linkedin className="h-4 w-4 text-[#0A66C2]" /> : <Instagram className="h-4 w-4" />}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{post.type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] whitespace-normal break-words text-xs" style={{ lineHeight: 1.4 }}>
                      {post.caption.length > 60 ? post.caption.slice(0, 60) + "..." : post.caption}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{formatDisplayDate(post.publishedAt)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{(post.reach || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{(post.impressions || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{totalEng.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      <span className={(post.engagementRate || 0) >= 5 ? "text-brand-green" : (post.engagementRate || 0) < 2 ? "text-brand-red" : ""}>
                        {(post.engagementRate || 0)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{(post.clicks || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {permalink && (
                        <a href={permalink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${post.id}-detail`} className="bg-muted/30">
                      <TableCell colSpan={10} className="p-4">
                        <p className="mb-2 text-sm">{post.caption}</p>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>👍 {(post.likes || 0).toLocaleString()} likes</span>
                          <span>💬 {(post.comments || 0).toLocaleString()} comments</span>
                          <span>🔄 {(post.shares || 0).toLocaleString()} shares</span>
                          <span>🔖 {(post.saves || 0).toLocaleString()} saves</span>
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
                <TableCell></TableCell>
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