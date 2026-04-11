import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import {
  Check, Minus, Search, BookOpen, BarChart3, Mail, Share2,
  TrendingUp, Users, MousePointer, Eye, Send, Instagram, Facebook,
  Globe, Percent, ArrowUpDown, FileText, Clock, UserCheck, AlertCircle,
  ThumbsUp, RefreshCw, Star, Zap,
} from "lucide-react";
import { brands, Brand } from "@/lib/brands";

/* ── helpers ── */
const checkCls = "text-emerald-500";
const dashCls  = "text-muted-foreground/30";

function ConnIcon({ ok }: { ok: boolean }) {
  return ok
    ? <Check className={`h-4 w-4 mx-auto ${checkCls}`} />
    : <Minus className={`h-4 w-4 mx-auto ${dashCls}`} />;
}

/* ── Metric card ── */
interface MetricDef {
  name: string;
  description: string;
  icon: any;
  iconBg: string;
}

function MetricCard({ metric }: { metric: MetricDef }) {
  return (
    <div className="group flex gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm">
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${metric.iconBg}`}>
        <metric.icon className="h-4 w-4 text-white" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground leading-snug">{metric.name}</p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{metric.description}</p>
      </div>
    </div>
  );
}

/* ── Section ── */
function Section({ icon: Icon, iconCls, label, color, metrics }: {
  icon: any; iconCls: string; label: string; color: string; metrics: MetricDef[];
}) {
  return (
    <div>
      <div className={`mb-4 flex items-center gap-2 border-b pb-3`}>
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${color}`}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <h3 className="text-sm font-bold tracking-wide uppercase text-foreground">{label}</h3>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(m => <MetricCard key={m.name} metric={m} />)}
      </div>
    </div>
  );
}

/* ── Metric definitions ── */
const analyticsMetrics: MetricDef[] = [
  { name: "Sessions", description: "Total number of visits to the website. A session starts when a user arrives and ends after 30 minutes of inactivity.", icon: Users, iconBg: "bg-blue-600" },
  { name: "Organic Sessions", description: "Sessions where the visitor came from an unpaid search result on Google, Bing, or similar engines.", icon: TrendingUp, iconBg: "bg-indigo-500" },
  { name: "Page Views", description: "Total number of pages viewed across all sessions, including repeated views of the same page.", icon: Eye, iconBg: "bg-blue-500" },
  { name: "1-Day Active Users", description: "Unique visitors who engaged with the site on any single day within the selected period.", icon: UserCheck, iconBg: "bg-sky-500" },
  { name: "Sessions Over Time", description: "Trend chart showing daily session volume — useful for spotting spikes, drops, or seasonality.", icon: BarChart3, iconBg: "bg-blue-700" },
  { name: "Active Users & Views Over Time", description: "Dual-line chart comparing daily active users vs page views to see engagement depth.", icon: ArrowUpDown, iconBg: "bg-violet-500" },
  { name: "Top Pages", description: "Pages ranked by sessions, views, and average time on page — shows what content drives the most traffic.", icon: FileText, iconBg: "bg-slate-600" },
  { name: "Avg Session Duration", description: "Average time users spend per session. Longer duration generally indicates higher content engagement.", icon: Clock, iconBg: "bg-cyan-600" },
];

const gscMetrics: MetricDef[] = [
  { name: "GSC Clicks", description: "Number of times users clicked a search result linking to the site from Google's search results page.", icon: MousePointer, iconBg: "bg-violet-500" },
  { name: "GSC Impressions", description: "How many times any page from the site appeared in Google search results, whether or not it was clicked.", icon: Globe, iconBg: "bg-purple-500" },
  { name: "Average CTR", description: "Click-Through Rate = Clicks ÷ Impressions × 100. Shows how compelling search result titles/descriptions are.", icon: Percent, iconBg: "bg-fuchsia-500" },
  { name: "Average Position", description: "Average ranking position in Google search results. Position 1 is top — lower number means better visibility.", icon: Star, iconBg: "bg-pink-500" },
  { name: "Top Queries", description: "Search terms that drive the most clicks and impressions — essential for understanding what users are searching for.", icon: Search, iconBg: "bg-rose-500" },
];

const emailMetrics: MetricDef[] = [
  { name: "Emails Sent", description: "Total number of emails sent to contacts during the selected period.", icon: Send, iconBg: "bg-orange-500" },
  { name: "Delivered", description: "Emails that successfully reached recipients' inboxes without bouncing.", icon: Check, iconBg: "bg-lime-600" },
  { name: "Open Rate", description: "Percentage of delivered emails that were opened. Industry average is typically 20–30%.", icon: Eye, iconBg: "bg-amber-500" },
  { name: "Click Rate", description: "Percentage of delivered emails where a recipient clicked at least one link. Typical benchmark is 2–5%.", icon: MousePointer, iconBg: "bg-yellow-600" },
  { name: "Bounce Rate", description: "Percentage of emails that failed to deliver. Hard bounces = invalid addresses. Soft bounces = temporary failures.", icon: AlertCircle, iconBg: "bg-red-500" },
  { name: "Unsubscribes", description: "Recipients who opted out of future emails. A rising unsubscribe rate signals content or frequency issues.", icon: Minus, iconBg: "bg-rose-600" },
  { name: "Spam Reports", description: "Recipients who marked the email as spam. High spam rates damage sender reputation and deliverability.", icon: AlertCircle, iconBg: "bg-red-700" },
  { name: "Avg Emails Per Week", description: "Average sending frequency over the selected period — shows cadence consistency.", icon: RefreshCw, iconBg: "bg-orange-400" },
  { name: "Lifecycle Stage Breakdown", description: "Contact distribution across HubSpot stages: Subscriber → Lead → MQL → SQL → Opportunity → Customer.", icon: ArrowUpDown, iconBg: "bg-amber-600" },
];

const socialMetrics: MetricDef[] = [
  { name: "Followers", description: "Total number of accounts following the brand page at the end of the selected period.", icon: Users, iconBg: "bg-pink-500" },
  { name: "Impressions", description: "Total times content was displayed in a feed or search — includes repeated views by the same person.", icon: Eye, iconBg: "bg-purple-500" },
  { name: "Reach", description: "Number of unique accounts that saw at least one piece of content. Unlike impressions, each person counts once.", icon: Globe, iconBg: "bg-emerald-500" },
  { name: "Engagements", description: "Total interactions: likes, comments, shares, saves, and reactions combined.", icon: ThumbsUp, iconBg: "bg-teal-500" },
  { name: "Engagement Rate", description: "(Engagements ÷ Reach) × 100. The single best indicator of content quality — 1–5% is considered healthy.", icon: Percent, iconBg: "bg-green-500" },
  { name: "Clicks", description: "Number of times a post's link, profile, or CTA button was clicked.", icon: MousePointer, iconBg: "bg-cyan-500" },
  { name: "Saves", description: "Times a user bookmarked a post for later — a strong signal of high-value content (Instagram only).", icon: Star, iconBg: "bg-violet-500" },
  { name: "Shares", description: "Times content was forwarded or reposted. Shares extend organic reach beyond followers.", icon: Share2, iconBg: "bg-blue-500" },
  { name: "Post Reach", description: "Unique accounts that saw a specific individual post — useful for comparing post-level performance.", icon: Zap, iconBg: "bg-amber-500" },
];

/* ── Brand matrix ── */
const SOCIAL_BRANDS = new Set([
  "Laurel Mountain","ABG Home Services","Accessible Home Store","American Bath Group",
  "Arizona Shower Door","Bootz","Coastal Shower Doors","DreamLine","MAAX","MAAX Spas",
  "Maidstone","Swan","Mr.Steam","Vintage Tub","Vintage Tub & Bath - Canada",
]);

const brandMatrix = brands.map(b => ({
  name: b.name,
  hubspot: b.hasHubSpot,
  ga4: b.hasGA4,
  gsc: b.hasGSC,
  meta: SOCIAL_BRANDS.has(b.name),
})).sort((a, b) => a.name.localeCompare(b.name));

const totals = {
  hubspot: brandMatrix.filter(b => b.hubspot).length,
  ga4: brandMatrix.filter(b => b.ga4).length,
  gsc: brandMatrix.filter(b => b.gsc).length,
  meta: brandMatrix.filter(b => b.meta).length,
};

/* ── Props ── */
interface ReadMeTabProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
}

/* ── Component ── */
export function ReadMeTab({ brand }: ReadMeTabProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => brandMatrix.filter(b => b.name.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  return (
    <div className="space-y-10 p-6 max-w-7xl mx-auto">

      {/* ── Hero ── */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-card to-accent/5 px-8 py-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard Guide</h1>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl leading-relaxed">
              This page explains every metric shown across the dashboard — what it means, why it matters, and how to read it.
              Use the tabs above to explore live data for <strong className="text-foreground">{brand.name}</strong>.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {[
                { label: "Analytics & Search", color: "bg-blue-100 text-blue-700", icon: BarChart3 },
                { label: "Email Marketing", color: "bg-orange-100 text-orange-700", icon: Mail },
                { label: "Social Media", color: "bg-emerald-100 text-emerald-700", icon: Share2 },
              ].map(({ label, color, icon: Icon }) => (
                <span key={label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${color}`}>
                  <Icon className="h-3 w-3" /> {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Analytics & Search ── */}
      <Section
        icon={BarChart3} iconCls="text-blue-600" color="bg-blue-600"
        label="Google Analytics"
        metrics={analyticsMetrics}
      />

      <Section
        icon={Globe} iconCls="text-violet-600" color="bg-violet-600"
        label="Google Search Console"
        metrics={gscMetrics}
      />

      {/* ── Email ── */}
      <Section
        icon={Mail} iconCls="text-orange-500" color="bg-orange-500"
        label="Email Marketing (HubSpot)"
        metrics={emailMetrics}
      />

      {/* ── Social ── */}
      <Section
        icon={Share2} iconCls="text-emerald-600" color="bg-emerald-600"
        label="Social Media (Meta — Facebook & Instagram)"
        metrics={socialMetrics}
      />

      {/* ── Brand Connection Matrix ── */}
      <div>
        <div className="mb-4 flex items-center gap-2 border-b pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-600">
            <Check className="h-3.5 w-3.5 text-white" />
          </div>
          <h3 className="text-sm font-bold tracking-wide uppercase text-foreground">Brand Data Connections</h3>
          <span className="ml-1 text-xs text-muted-foreground">— which platforms are live for each brand</span>
        </div>

        <div className="relative mb-4 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search brands…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-[hsl(var(--table-header))]">
                <TableHead className="text-primary-foreground font-semibold">Brand Name</TableHead>
                {[
                  { label: "HubSpot", icon: Mail },
                  { label: "GA4", icon: BarChart3 },
                  { label: "GSC", icon: Globe },
                  { label: "Meta", icon: Facebook },
                ].map(({ label, icon: Icon }) => (
                  <TableHead key={label} className="text-primary-foreground font-semibold text-center w-[100px]">
                    <span className="flex items-center justify-center gap-1">
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => (
                <TableRow key={b.name} className={b.name === brand.name ? "bg-primary/5" : ""}>
                  <TableCell className="font-medium text-foreground">
                    <span className="flex items-center gap-2">
                      {b.name}
                      {b.name === brand.name && (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          viewing
                        </span>
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
                <TableCell className="font-semibold text-foreground">{brandMatrix.length} brands total</TableCell>
                <TableCell className="text-center font-bold text-foreground">{totals.hubspot}</TableCell>
                <TableCell className="text-center font-bold text-foreground">{totals.ga4}</TableCell>
                <TableCell className="text-center font-bold text-foreground">{totals.gsc}</TableCell>
                <TableCell className="text-center font-bold text-foreground">{totals.meta}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </div>

    </div>
  );
}
