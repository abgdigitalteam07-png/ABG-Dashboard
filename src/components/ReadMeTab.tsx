import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Check, Minus, Search, BookOpen, BarChart3, Mail } from "lucide-react";
import { brands } from "@/lib/brands";

/* ── colour helpers (semantic tokens only) ── */
const checkCls = "text-brand-green";
const dashCls  = "text-muted-foreground/40";

function ConnIcon({ ok }: { ok: boolean }) {
  return ok
    ? <Check className={`h-4 w-4 mx-auto ${checkCls}`} />
    : <Minus className={`h-4 w-4 mx-auto ${dashCls}`} />;
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
  ["Lifecycle Stage Breakdown", "Bar chart showing contact distribution across HubSpot lifecycle stages (Subscriber, Lead, MQL, SQL, Opportunity, Customer)"],
];

/* ── Brand matrix (static, matches spec exactly — 27 brands) ── */
const brandMatrix: { name: string; hubspot: boolean; ga4: boolean; gsc: boolean }[] = [
  { name: "A2Bath", hubspot: false, ga4: true, gsc: false },
  { name: "ABG Home Services", hubspot: false, ga4: true, gsc: false },
  { name: "ABG Hospitality", hubspot: true, ga4: true, gsc: true },
  { name: "Accessible Home Store", hubspot: true, ga4: false, gsc: false },
  { name: "Aker", hubspot: true, ga4: false, gsc: true },
  { name: "Amazing Shower Door", hubspot: false, ga4: true, gsc: false },
  { name: "American Bath Group", hubspot: false, ga4: false, gsc: true },
  { name: "American Whirlpool", hubspot: false, ga4: true, gsc: true },
  { name: "Aquarius", hubspot: true, ga4: true, gsc: true },
  { name: "Aquatic", hubspot: true, ga4: true, gsc: true },
  { name: "Bootz", hubspot: true, ga4: true, gsc: true },
  { name: "Briggs Bath", hubspot: false, ga4: true, gsc: false },
  { name: "Clarion", hubspot: true, ga4: false, gsc: true },
  { name: "Coastal Shower Doors", hubspot: false, ga4: true, gsc: true },
  { name: "Comfort Designs", hubspot: true, ga4: true, gsc: true },
  { name: "DreamLine", hubspot: true, ga4: false, gsc: true },
  { name: "Florestone", hubspot: true, ga4: true, gsc: true },
  { name: "Hamilton", hubspot: true, ga4: true, gsc: true },
  { name: "IMI", hubspot: true, ga4: true, gsc: false },
  { name: "Laurel Mountain", hubspot: true, ga4: true, gsc: true },
  { name: "MAAX", hubspot: true, ga4: true, gsc: true },
  { name: "Maidstone", hubspot: true, ga4: true, gsc: true },
  { name: "Neptune", hubspot: true, ga4: true, gsc: true },
  { name: "RBS", hubspot: true, ga4: false, gsc: true },
  { name: "Swan", hubspot: true, ga4: true, gsc: true },
  { name: "Vintage.ca", hubspot: true, ga4: false, gsc: false },
  { name: "Vita Spa", hubspot: false, ga4: true, gsc: true },
];

const totals = {
  hubspot: brandMatrix.filter((b) => b.hubspot).length,
  ga4: brandMatrix.filter((b) => b.ga4).length,
  gsc: brandMatrix.filter((b) => b.gsc).length,
};

/* ── Component ── */
export function ReadMeTab() {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      brandMatrix.filter((b) =>
        b.name.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  return (
    <div className="space-y-8 p-6">
      {/* ─── Section 1: Overview ─── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent" />
            <CardTitle className="text-xl">About This Dashboard</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This dashboard provides a unified view of digital marketing performance across all
            American Bath Group (ABG) brands. It pulls data from three core platforms —{" "}
            <span className="font-medium text-foreground">Google Analytics 4 (GA4)</span>,{" "}
            <span className="font-medium text-foreground">Google Search Console (GSC)</span>, and{" "}
            <span className="font-medium text-foreground">HubSpot CRM</span> — to give stakeholders
            a single source of truth for website traffic, organic search visibility, and email
            marketing performance.
          </p>
        </CardContent>
      </Card>

      {/* ─── Section 2: Metrics Reference ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Metrics Reference</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* GA & GSC */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-brand-blue" />
              <h3 className="text-sm font-semibold text-foreground">
                Google Analytics &amp; Search Console Tab
              </h3>
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

          {/* CRM & Email */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4 text-brand-orange" />
              <h3 className="text-sm font-semibold text-foreground">CRM &amp; Email Tab</h3>
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
        </CardContent>
      </Card>

      {/* ─── Section 3: Brand Connection Matrix ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Brand Data Connections</CardTitle>
          <CardDescription>
            Each brand connects to different data platforms. The table below shows which platforms
            are currently integrated for each brand. Brands marked "HubSpot only" will only show
            data in the CRM &amp; Email tab. Brands without GA4 or GSC will show empty states in
            the Google Analytics &amp; Search Console tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search */}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => (
                  <TableRow key={b.name}>
                    <TableCell className="font-medium text-foreground">{b.name}</TableCell>
                    <TableCell className="text-center"><ConnIcon ok={b.hubspot} /></TableCell>
                    <TableCell className="text-center"><ConnIcon ok={b.ga4} /></TableCell>
                    <TableCell className="text-center"><ConnIcon ok={b.gsc} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Total: {brandMatrix.length} brands</TableCell>
                  <TableCell className="text-center font-semibold">{totals.hubspot}</TableCell>
                  <TableCell className="text-center font-semibold">{totals.ga4}</TableCell>
                  <TableCell className="text-center font-semibold">{totals.gsc}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
