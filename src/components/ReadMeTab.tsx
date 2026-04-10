import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Check, Minus, Search, BookOpen, BarChart3, Mail, Share2, TrendingUp, Users, MousePointer, Eye, Send, Instagram, Facebook } from "lucide-react";
import { brands, Brand } from "@/lib/brands";
import { supabase } from "@/integrations/supabase/client";
import { WaterFillLoader } from "./WaterFillLoader";
import { format } from "date-fns";

/* ── colour helpers ── */
const checkCls = "text-brand-green";
const dashCls  = "text-muted-foreground/40";

function ConnIcon({ ok }: { ok: boolean }) {
  return ok
    ? <Check className={`h-4 w-4 mx-auto ${checkCls}`} />
    : <Minus className={`h-4 w-4 mx-auto ${dashCls}`} />;
}

function formatNum(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${color}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

/* ── Metrics data ── */
const gaMetrics = [
  ["Sessions", "Total number of visits to the website during the selected period"],
  ["Organic Sessions", "Sessions originating from organic (non-paid) search results"],
  ["Page Views", "Total number of pages viewed across all sessions"],
  ["1-Day Active Users", "Unique users who engaged with the site within a single day"],
  ["Sessions Over Time", "Trend chart showing daily session volume"],
  ["Active Users & Views Over Time", "Dual-line chart comparing daily active users vs page views"],
  ["Top Pages", "Table ranking pages by sessions, views, and avg session duration"],
  ["Total Clicks (GSC)", "Number of times users clicked through from Google search results"],
  ["Total Impressions (GSC)", "Number of times pages appeared in Google search results"],
  ["Average CTR (GSC)", "Click-through rate = Clicks ÷ Impressions"],
  ["Average Position (GSC)", "Average ranking position in Google search results (lower is better)"],
  ["Top Queries (GSC)", "Table of search queries driving the most clicks and impressions"],
];

const crmMetrics = [
  ["Sent", "Total emails sent during the selected period"],
  ["Delivered", "Emails successfully delivered to recipients' inboxes"],
  ["Opens", "Number of email opens recorded"],
  ["Clicks", "Number of link clicks within emails"],
  ["Avg Emails Per Week", "Average sending frequency over the last 4 weeks"],
  ["Delivered Ratio", "Percentage of sent emails that were successfully delivered"],
  ["Open Ratio", "Percentage of delivered emails that were opened"],
  ["Click Ratio", "Percentage of delivered emails that received at least one click"],
  ["Bounce", "Total bounced emails (hard + soft)"],
  ["Unsubscribed", "Recipients who opted out during the period"],
  ["Hard Bounce", "Permanent delivery failures (invalid addresses)"],
  ["Soft Bounce", "Temporary delivery failures (full inbox, server issues)"],
  ["Spam Report", "Recipients who marked the email as spam"],
  ["Lifecycle Stage Breakdown", "Bar chart showing contact distribution across HubSpot lifecycle stages"],
];

const socialMetrics = [
  ["Impressions", "Total times content was displayed, whether clicked or not"],
  ["Reach", "Number of unique accounts that saw the content"],
  ["Engagement Rate", "(Likes + Comments + Shares + Saves) ÷ Reach × 100"],
  ["Engagements", "Total interactions: likes, comments, shares, saves"],
  ["Clicks", "Number of times a post or link was clicked"],
  ["Followers", "Total page followers at end of selected period"],
  ["Post Reach", "Unique accounts that saw a specific post"],
  ["Post Impressions", "Total times a specific post was displayed"],
  ["Saves", "Times a post was saved (Instagram only)"],
  ["Shares", "Times a post was shared or forwarded"],
];

/* ── Brand matrix ── */
const brandMatrix = brands.map(b => ({
  name: b.name,
  hubspot: b.hasHubSpot,
  ga4: b.hasGA4,
  gsc: b.hasGSC,
  meta: ["Laurel Mountain","ABG Home Services","Accessible Home Store","American Bath Group","Arizona Shower Door","Bootz","Coastal Shower Doors","DreamLine","MAAX","MAAX Spas","Maidstone","Swan","Mr.Steam","Vintage Tub","Vintage Tub & Bath - Canada"].includes(b.name),
})).sort((a, b) => a.name.localeCompare(b.name));

const totals = {
  hubspot: brandMatrix.filter(b => b.hubspot).length,
  ga4: brandMatrix.filter(b => b.ga4).length,
  gsc: brandMatrix.filter(b => b.gsc).length,
  meta: brandMatrix.filter(b => b.meta).length,
};

const SOCIAL_BRANDS = ["Laurel Mountain","ABG Home Services","Accessible Home Store","American Bath Group","Arizona Shower Door","Bootz","Coastal Shower Doors","DreamLine","MAAX","MAAX Spas","Maidstone","Swan","Mr.Steam","Vintage Tub","Vintage Tub & Bath - Canada"];

/* ── Props ── */
interface ReadMeTabProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
}

/* ── Component ── */
export function ReadMeTab({ brand, dateFrom, dateTo }: ReadMeTabProps) {
  const [search, setSearch] = useState("");

  /* Live data states */
  const [ga4Data, setGa4Data] = useState<any>(null);
  const [gscData, setGscData] = useState<any>(null);
  const [socialData, setSocialData] = useState<any>(null);
  const [emailData, setEmailData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const hasSocial = SOCIAL_BRANDS.includes(brand.name);
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");

  useEffect(() => {
    setGa4Data(null);
    setGscData(null);
    setSocialData(null);
    setEmailData(null);
    setLoading(true);

    const calls: Promise<any>[] = [];

    if (brand.hasGA4) {
      calls.push(
        supabase.functions.invoke("ga4-data", {
          body: { brandId: brand.id, dateFrom: fmt(dateFrom), dateTo: fmt(dateTo) },
        }).then(({ data }) => { setGa4Data(data); })
      );
    }

    if (brand.hasGSC) {
      calls.push(
        supabase.functions.invoke("gsc-data", {
          body: { brandId: brand.id, dateFrom: fmt(dateFrom), dateTo: fmt(dateTo) },
        }).then(({ data }) => { setGscData(data); })
      );
    }

    if (hasSocial) {
      calls.push(
        supabase.functions.invoke("social-media-data", {
          body: { brandName: brand.name, startDate: fmt(dateFrom), endDate: fmt(dateTo), platform: "all" },
        }).then(({ data }) => { setSocialData(data); })
      );
    }

    if (brand.hasHubSpot && brand.hubspotBusinessUnitId) {
      calls.push(
        supabase.functions.invoke("hubspot-data", {
          body: { hubspotBusinessUnitId: brand.hubspotBusinessUnitId, dateFrom: fmt(dateFrom), dateTo: fmt(dateTo) },
        }).then(({ data }) => { setEmailData(data); })
      );
    }

    Promise.allSettled(calls).finally(() => setLoading(false));
  }, [brand.id, dateFrom, dateTo]);

  const filtered = useMemo(
    () => brandMatrix.filter(b => b.name.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  const hasAnyData = brand.hasGA4 || brand.hasGSC || hasSocial || brand.hasHubSpot;

  return (
    <div className="space-y-6 p-6">

      {/* ── Brand Snapshot ── */}
      <div>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Brand Snapshot — {brand.name}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {format(dateFrom, "MMM d, yyyy")} – {format(dateTo, "MMM d, yyyy")}
        </p>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <WaterFillLoader />
          </div>
        )}

        {!loading && !hasAnyData && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No data sources connected for {brand.name} yet.
            </CardContent>
          </Card>
        )}

        {!loading && (brand.hasGA4 || brand.hasGSC) && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-brand-blue" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Analytics & Search</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Sessions" value={formatNum(ga4Data?.summary?.sessions)} icon={Users} color="bg-blue-600" />
              <KpiCard label="Page Views" value={formatNum(ga4Data?.summary?.screenPageViews)} icon={Eye} color="bg-blue-500" />
              <KpiCard label="Organic Sessions" value={formatNum(ga4Data?.summary?.organicSessions)} icon={TrendingUp} color="bg-indigo-500" />
              <KpiCard label="GSC Clicks" value={formatNum(gscData?.totals?.clicks)} icon={MousePointer} color="bg-violet-500" />
              <KpiCard label="GSC Impressions" value={formatNum(gscData?.totals?.impressions)} icon={Eye} color="bg-purple-500" />
              <KpiCard label="Avg Position" value={gscData?.totals?.position ? gscData.totals.position.toFixed(1) : "—"} icon={TrendingUp} color="bg-fuchsia-500" />
            </div>
          </div>
        )}

        {!loading && hasSocial && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <Share2 className="h-4 w-4 text-brand-green" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Social Media</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard label="FB Followers" value={formatNum(socialData?.overview?.totalFollowers?.facebook)} icon={Facebook} color="bg-[#1877F2]" />
              <KpiCard label="IG Followers" value={formatNum(socialData?.overview?.totalFollowers?.instagram)} icon={Instagram} color="bg-pink-500" />
              <KpiCard label="Total Reach" value={formatNum(socialData?.overview?.totalReach)} icon={Users} color="bg-emerald-500" />
              <KpiCard label="Engagements" value={formatNum(socialData?.overview?.totalEngagements)} icon={TrendingUp} color="bg-teal-500" />
              <KpiCard label="Eng. Rate" value={socialData?.overview?.engagementRate ? socialData.overview.engagementRate.toFixed(1) + "%" : "—"} icon={TrendingUp} color="bg-green-500" />
            </div>
          </div>
        )}

        {!loading && brand.hasHubSpot && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <Mail className="h-4 w-4 text-brand-orange" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Marketing</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <KpiCard label="Emails Sent" value={formatNum(emailData?.summary?.sent)} icon={Send} color="bg-orange-500" />
              <KpiCard label="Open Rate" value={emailData?.summary?.openRate ? (emailData.summary.openRate * 100).toFixed(1) + "%" : "—"} icon={Eye} color="bg-amber-500" />
              <KpiCard label="Click Rate" value={emailData?.summary?.clickRate ? (emailData.summary.clickRate * 100).toFixed(1) + "%" : "—"} icon={MousePointer} color="bg-yellow-500" />
              <KpiCard label="Delivered" value={formatNum(emailData?.summary?.delivered)} icon={Check} color="bg-lime-600" />
            </div>
          </div>
        )}
      </div>

      {/* ── Brand Connection Matrix ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Brand Data Connections</CardTitle>
          <CardDescription>
            Which platforms are connected for each brand across the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search brands…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-[hsl(var(--table-header))]">
                  <TableHead className="text-primary-foreground font-medium">Brand Name</TableHead>
                  <TableHead className="text-primary-foreground font-medium text-center w-[100px]">HubSpot</TableHead>
                  <TableHead className="text-primary-foreground font-medium text-center w-[100px]">GA4</TableHead>
                  <TableHead className="text-primary-foreground font-medium text-center w-[100px]">GSC</TableHead>
                  <TableHead className="text-primary-foreground font-medium text-center w-[100px]">Meta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => (
                  <TableRow key={b.name} className={b.name === brand.name ? "bg-accent/10" : ""}>
                    <TableCell className="font-medium text-foreground">
                      <span className="flex items-center gap-2">
                        {b.name}
                        {b.name === brand.name && (
                          <span className="inline-flex items-center rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">selected</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-center"><ConnIcon ok={b.hubspot} /></TableCell>
                    <TableCell className="text-center"><ConnIcon ok={b.ga4} /></TableCell>
                    <TableCell className="text-center"><ConnIcon ok={b.gsc} /></TableCell>
                    <TableCell className="text-center"><ConnIcon ok={b.meta} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Total: {brandMatrix.length} brands</TableCell>
                  <TableCell className="text-center font-semibold">{totals.hubspot}</TableCell>
                  <TableCell className="text-center font-semibold">{totals.ga4}</TableCell>
                  <TableCell className="text-center font-semibold">{totals.gsc}</TableCell>
                  <TableCell className="text-center font-semibold">{totals.meta}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Metrics Reference ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent" />
            <CardTitle className="text-xl">Metrics Reference</CardTitle>
          </div>
          <CardDescription>Definitions for every metric shown across all dashboard tabs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-brand-blue" />
              <h3 className="text-sm font-semibold">Google Analytics &amp; Search Console</h3>
            </div>
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[hsl(var(--table-header))]">
                    <TableHead className="text-primary-foreground font-medium w-[220px]">Metric</TableHead>
                    <TableHead className="text-primary-foreground font-medium">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gaMetrics.map(([metric, desc]) => (
                    <TableRow key={metric}>
                      <TableCell className="font-medium text-foreground">{metric}</TableCell>
                      <TableCell className="text-muted-foreground">{desc}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4 text-brand-orange" />
              <h3 className="text-sm font-semibold">CRM &amp; Email</h3>
            </div>
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[hsl(var(--table-header))]">
                    <TableHead className="text-primary-foreground font-medium w-[220px]">Metric</TableHead>
                    <TableHead className="text-primary-foreground font-medium">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crmMetrics.map(([metric, desc]) => (
                    <TableRow key={metric}>
                      <TableCell className="font-medium text-foreground">{metric}</TableCell>
                      <TableCell className="text-muted-foreground">{desc}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Share2 className="h-4 w-4 text-brand-green" />
              <h3 className="text-sm font-semibold">Social Media</h3>
            </div>
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[hsl(var(--table-header))]">
                    <TableHead className="text-primary-foreground font-medium w-[220px]">Metric</TableHead>
                    <TableHead className="text-primary-foreground font-medium">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {socialMetrics.map(([metric, desc]) => (
                    <TableRow key={metric}>
                      <TableCell className="font-medium text-foreground">{metric}</TableCell>
                      <TableCell className="text-muted-foreground">{desc}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
