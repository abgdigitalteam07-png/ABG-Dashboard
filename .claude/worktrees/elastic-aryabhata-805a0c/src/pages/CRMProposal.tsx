/**
 * CRM PROPOSAL PAGE — Dummy data preview
 * Route: /crm-proposal (no auth required)
 *
 * Shows recommended new metrics for HubSpotCRMTab before implementation.
 * All data is hardcoded — nothing is fetched from any API.
 */

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, AreaChart, Area,
} from "recharts";
import {
  ArrowRight, AlertCircle, CheckCircle2, Info, Wifi,
  UserCheck, UserX, Store, MapPin,
} from "lucide-react";
import { ScoreCard } from "@/components/ScoreCard";
import { cn } from "@/lib/utils";

// ─── HubSpot brand colours ─────────────────────────────────────────────────────
// Matches HubSpot's own lifecycle-stage colour palette
const HS_SUBSCRIBER  = "#00BDA5"; // teal
const HS_LEAD        = "#0091AE"; // blue
const HS_MQL         = "#FF7A59"; // coral / orange

// ─── Dummy Data ────────────────────────────────────────────────────────────────

const MARKETING_FUNNEL = [
  { key: "subscriber",             label: "Subscriber", count: 12_840, color: HS_SUBSCRIBER },
  { key: "lead",                   label: "Lead",       count:  6_210, color: HS_LEAD       },
  { key: "marketingqualifiedlead", label: "MQL",        count:  2_430, color: HS_MQL        },
];

const SALES_FUNNEL = [
  { key: "salesqualifiedlead", label: "SQL",         count:  980, color: "hsl(38 92% 50%)"  },
  { key: "opportunity",        label: "Opportunity", count:  412, color: "hsl(24 95% 53%)"  },
  { key: "customer",           label: "Customer",    count:  187, color: "hsl(158 64% 52%)" },
];

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

/** Total new contacts created — all lifecycle stages combined */
const NEW_CONTACTS_SERIES: Record<Period, { date: string; contacts: number }[]> = {
  daily: [
    { date: "3/27", contacts: 31 }, { date: "3/28", contacts: 38 },
    { date: "3/29", contacts: 26 }, { date: "3/30", contacts: 44 },
    { date: "3/31", contacts: 33 }, { date: "4/1",  contacts: 49 },
    { date: "4/2",  contacts: 55 }, { date: "4/3",  contacts: 35 },
    { date: "4/4",  contacts: 30 }, { date: "4/5",  contacts: 40 },
    { date: "4/6",  contacts: 45 }, { date: "4/7",  contacts: 24 },
    { date: "4/8",  contacts: 37 }, { date: "4/9",  contacts: 21 },
  ],
  weekly: [
    { date: "1/5",  contacts: 104 }, { date: "1/12", contacts: 150 },
    { date: "1/19", contacts: 126 }, { date: "1/26", contacts: 114 },
    { date: "2/2",  contacts: 138 }, { date: "2/9",  contacts: 133 },
    { date: "2/16", contacts: 138 }, { date: "2/23", contacts: 157 },
    { date: "3/2",  contacts: 214 }, { date: "3/9",  contacts: 143 },
    { date: "3/16", contacts: 149 }, { date: "3/23", contacts: 144 },
    { date: "3/30", contacts: 150 }, { date: "4/6",  contacts:  75 },
  ],
  monthly: [
    { date: "Oct '25", contacts: 545 }, { date: "Nov '25", contacts: 508 },
    { date: "Dec '25", contacts: 466 }, { date: "Jan '26", contacts: 594 },
    { date: "Feb '26", contacts: 654 }, { date: "Mar '26", contacts: 711 },
  ],
  quarterly: [
    { date: "Q2 '25", contacts: 1_519 }, { date: "Q3 '25", contacts: 1_741 },
    { date: "Q4 '25", contacts: 1_604 }, { date: "Q1 '26", contacts: 1_962 },
  ],
  yearly: [
    { date: "2023",     contacts: 5_461 }, { date: "2024",     contacts: 6_996 },
    { date: "2025",     contacts: 8_191 }, { date: "2026 YTD", contacts: 1_962 },
  ],
};

const CONTACT_SOURCES = [
  { source: "Organic Search",  contacts: 3_420, color: "hsl(158 64% 52%)" },
  { source: "Paid Search",     contacts: 2_180, color: "hsl(217 91% 60%)" },
  { source: "Direct Traffic",  contacts: 1_870, color: "hsl(262 83% 58%)" },
  { source: "Email Marketing", contacts: 1_340, color: "hsl(38 92% 50%)"  },
  { source: "Organic Social",  contacts:   940, color: "hsl(24 95% 53%)"  },
  { source: "Referrals",       contacts:   720, color: "hsl(190 80% 50%)" },
  { source: "Paid Social",     contacts:   610, color: "hsl(355 78% 56%)" },
  { source: "AI Referrals",    contacts:   380, color: "hsl(280 70% 60%)" },
  { source: "Other Campaigns", contacts:   240, color: "hsl(215 16% 65%)" },
];

const CREATION_SOURCE = [
  { month: "Oct '25", hubspot: 220, salesforce:  98 },
  { month: "Nov '25", hubspot: 198, salesforce: 100 },
  { month: "Dec '25", hubspot: 175, salesforce:  89 },
  { month: "Jan '26", hubspot: 245, salesforce: 102 },
  { month: "Feb '26", hubspot: 280, salesforce:  95 },
  { month: "Mar '26", hubspot: 312, salesforce: 108 },
];

const IP_STATES = [
  { state: "California",     contacts: 412 },
  { state: "Texas",          contacts: 287 },
  { state: "Florida",        contacts: 243 },
  { state: "New York",       contacts: 198 },
  { state: "Arizona",        contacts: 176 },
  { state: "Pennsylvania",   contacts: 154 },
  { state: "North Carolina", contacts: 134 },
  { state: "Washington",     contacts: 118 },
  { state: "Virginia",       contacts:  98 },
  { state: "Georgia",        contacts:  87 },
];
const TOTAL_CONTACTS = 6_900;
const WITH_STATE     = 5_420;

const CONTACT_SCORES = [
  { label: "High Score", count: 1_240, pct: 18, color: "hsl(158 64% 52%)" },
  { label: "Mid Score",  count: 2_810, pct: 41, color: "hsl(38 92% 50%)"  },
  { label: "Low Score",  count: 2_160, pct: 31, color: "hsl(217 91% 60%)" },
  { label: "Unscored",   count:   690, pct: 10, color: "hsl(215 16% 65%)" },
];

// ── MAAX Saunas / Vita Spas / American Whirlpool specific ─────────────────────

const DEALER_EMAIL_DATA = [
  { name: "Assigned to Dealer", value: 2_840, fill: "hsl(158 64% 52%)" },
  { name: "No Dealer Assigned", value: 1_580, fill: "hsl(355 78% 56%)" },
];
const DEALER_TOTAL = DEALER_EMAIL_DATA.reduce((s, d) => s + d.value, 0);

const DEALER_GAP = [
  { state: "Nevada",         total:  67, assigned:   0, unassigned:  67 },
  { state: "New York",       total: 198, assigned: 120, unassigned:  78 },
  { state: "Oregon",         total:  45, assigned:   0, unassigned:  45 },
  { state: "Texas",          total: 287, assigned: 241, unassigned:  46 },
  { state: "Florida",        total: 243, assigned: 198, unassigned:  45 },
  { state: "North Carolina", total: 134, assigned:  89, unassigned:  45 },
  { state: "Virginia",       total:  98, assigned:  54, unassigned:  44 },
  { state: "California",     total: 412, assigned: 380, unassigned:  32 },
  { state: "Arizona",        total: 176, assigned: 176, unassigned:   0 },
  { state: "Pennsylvania",   total: 154, assigned: 154, unassigned:   0 },
  { state: "Washington",     total: 118, assigned: 118, unassigned:   0 },
  { state: "Georgia",        total:  87, assigned:  87, unassigned:   0 },
];

const DEALER_FORM_TOTAL = 234;
const DEALER_FORM_BY_STATE = [
  { state: "California",  count: 42 }, { state: "Texas",      count: 31 },
  { state: "Florida",     count: 28 }, { state: "Arizona",    count: 19 },
  { state: "New York",    count: 17 }, { state: "Washington", count: 14 },
  { state: "Nevada",      count: 12 }, { state: "Other",      count: 71 },
];
const DEALER_FORM_BY_CITY = [
  { city: "Las Vegas, NV",   count: 18 }, { city: "Phoenix, AZ",     count: 15 },
  { city: "Los Angeles, CA", count: 14 }, { city: "Houston, TX",     count: 12 },
  { city: "San Diego, CA",   count: 10 }, { city: "Dallas, TX",      count:  9 },
  { city: "Seattle, WA",     count:  8 }, { city: "Miami, FL",       count:  7 },
];
const PRODUCTS_SOLD = [
  { product: "Hot Tubs",           count: 187, color: "hsl(217 91% 60%)" },
  { product: "Swim Spas",          count: 156, color: "hsl(262 83% 58%)" },
  { product: "Above Ground Pools", count: 134, color: "hsl(158 64% 52%)" },
  { product: "In Ground Pools",    count:  98, color: "hsl(38 92% 50%)"  },
  { product: "BBQ Grills",         count:  76, color: "hsl(24 95% 53%)"  },
  { product: "Billiards",          count:  54, color: "hsl(355 78% 56%)" },
  { product: "Patio Furniture",    count:  43, color: "hsl(190 80% 50%)" },
];

const COMPANIES_BY_INDUSTRY = [
  { industry: "Construction",    companies: 412 }, { industry: "Architecture",    companies: 287 },
  { industry: "Interior Design", companies: 243 }, { industry: "Property Mgmt",   companies: 198 },
  { industry: "Hospitality",     companies: 156 }, { industry: "Healthcare",      companies: 134 },
  { industry: "Retail",          companies:  98 }, { industry: "Other",           companies: 210 },
];

const DATA_COMPLETENESS = [
  { field: "Email",     pct: 94, fill: "hsl(158 64% 52%)" },
  { field: "Phone",     pct: 61, fill: "hsl(38 92% 50%)"  },
  { field: "Company",   pct: 78, fill: "hsl(217 91% 60%)" },
  { field: "Job Title", pct: 53, fill: "hsl(262 83% 58%)" },
  { field: "Industry",  pct: 44, fill: "hsl(24 95% 53%)"  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString(); }

type BadgeVariant = "accent" | "green" | "orange";

function SectionBadge({ label, variant = "accent" }: { label: string; variant?: BadgeVariant }) {
  const cls: Record<BadgeVariant, string> = {
    accent: "bg-accent/10 text-accent",
    green:  "bg-brand-green/10 text-brand-green",
    orange: "bg-orange-500/10 text-orange-600",
  };
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls[variant]}`}>
      {label}
    </span>
  );
}

function SectionHeader({ title, description, badge, badgeVariant }: {
  title: string; description?: string; badge?: string; badgeVariant?: BadgeVariant;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {description && <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>}
      </div>
      {badge && <SectionBadge label={badge} variant={badgeVariant} />}
    </div>
  );
}

function ProposalNote({ text }: { text: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-md border border-accent/20 bg-accent/5 p-3">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
      <p className="text-[11px] text-muted-foreground">{text}</p>
    </div>
  );
}

function FunnelCards({ stages }: { stages: { key: string; label: string; count: number; color: string }[] }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0 sm:overflow-x-auto">
      {stages.map((stage, i) => {
        const prev = stages[i - 1];
        const convRate = prev ? ((stage.count / prev.count) * 100).toFixed(1) : null;
        return (
          <div key={stage.key} className="flex items-center">
            {i > 0 && (
              <div className="hidden shrink-0 items-center px-1.5 sm:flex">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-[120px] flex-1 rounded-lg border p-4 shadow-sm"
              style={{ borderColor: stage.color, background: `${stage.color}22` }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: stage.color }}>
                {stage.label}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{fmt(stage.count)}</p>
              {convRate && <p className="mt-0.5 text-[10px] text-muted-foreground">{convRate}% from prev</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "daily",     label: "Day"     },
  { key: "weekly",    label: "Week"    },
  { key: "monthly",   label: "Month"   },
  { key: "quarterly", label: "Quarter" },
  { key: "yearly",    label: "Year"    },
];

function PeriodToggle({ period, setPeriod }: { period: Period; setPeriod: (p: Period) => void }) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
      {PERIODS.map(({ key, label }) => (
        <button key={key} onClick={() => setPeriod(key)}
          className={cn(
            "rounded-md px-3 py-1 text-[11px] font-medium transition-colors",
            period === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Section 1 — Marketing Funnel ─────────────────────────────────────────────

function MarketingFunnelSection() {
  const [period, setPeriod] = useState<Period>("weekly");

  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <SectionHeader
        title="Marketing Funnel"
        badge="Extends existing"
      />

      {/* ── 1a. New contacts over time (all lifecycle stages) ── */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">New Contacts Over Time</p>
            <p className="text-[11px] text-muted-foreground">All lifecycle stages · new contacts created in each period</p>
          </div>
          <PeriodToggle period={period} setPeriod={setPeriod} />
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={NEW_CONTACTS_SERIES[period]}>
            <defs>
              <linearGradient id="contactsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={HS_LEAD} stopOpacity={0.25} />
                <stop offset="95%" stopColor={HS_LEAD} stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [fmt(v), "New Contacts"]} />
            <Area
              type="monotone"
              dataKey="contacts"
              name="New Contacts"
              stroke={HS_LEAD}
              fill="url(#contactsGrad)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: HS_LEAD }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── 1b. Funnel cards — HubSpot colours ── */}
      <div className="mb-1">
        <p className="mb-3 text-[11px] text-muted-foreground">
          Digital Marketing team's contact journey — Subscriber through Marketing Qualified Lead
        </p>
        <FunnelCards stages={MARKETING_FUNNEL} />
      </div>

      {/* ── 1c. Overall horizontal bar (mirrors Sales Funnel style) ── */}
      <div className="mt-6">
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={MARKETING_FUNNEL} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmt} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={80} />
            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => fmt(v)} />
            <Bar dataKey="count" name="Contacts" radius={[0, 4, 4, 0]}>
              {MARKETING_FUNNEL.map((s, i) => <Cell key={i} fill={s.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ProposalNote text="New Contacts Over Time is UI-only — lifecycle data already returned by hubspot-data. Period toggle passes dateGrouping ('day'|'week'|'month'|'quarter'|'year') to the edge function." />
    </section>
  );
}

// ─── Section 2 — Sales Funnel ─────────────────────────────────────────────────

function SalesFunnelSection() {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sales Funnel</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Sales operations stage breakdown — separate from the Digital Marketing funnel above
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-brand-green/30 bg-brand-green/10 px-3 py-1">
          <Wifi className="h-3 w-3 text-brand-green" />
          <span className="whitespace-nowrap text-[10px] font-semibold text-brand-green">
            HubSpot &amp; Salesforce integrated and synced
          </span>
        </div>
      </div>
      <FunnelCards stages={SALES_FUNNEL} />
      <div className="mt-6">
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={SALES_FUNNEL} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmt} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={100} />
            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => fmt(v)} />
            <Bar dataKey="count" name="Contacts" radius={[0, 4, 4, 0]}>
              {SALES_FUNNEL.map((s, i) => <Cell key={i} fill={s.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ProposalNote text="SQL, Opportunity, and Customer stages already exist in lifecycle data from hubspot-data. Presented separately — accuracy reflects sales-side data entry, not a marketing metric." />
    </section>
  );
}

// ─── Section 3 — Contact Source Attribution ───────────────────────────────────

function ContactSourceSection() {
  const total = CONTACT_SOURCES.reduce((s, l) => s + l.contacts, 0);
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <SectionHeader
        title="Contact Source Attribution"
        description="Original Traffic Source (hs_analytics_source) — all 9 HubSpot source values"
        badge="Extends existing"
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={CONTACT_SOURCES} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} width={120} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="contacts" name="Contacts" radius={[0, 4, 4, 0]}>
              {CONTACT_SOURCES.map((s, i) => <Cell key={i} fill={s.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="space-y-2.5">
          {CONTACT_SOURCES.map((s) => (
            <div key={s.source} className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-[130px] text-xs text-foreground">{s.source}</span>
              <div className="flex-1 rounded-full bg-muted" style={{ height: 6 }}>
                <div className="h-full rounded-full" style={{ width: `${(s.contacts / total) * 100}%`, background: s.color }} />
              </div>
              <span className="w-12 text-right text-[11px] tabular-nums text-muted-foreground">
                {((s.contacts / total) * 100).toFixed(1)}%
              </span>
              <span className="w-14 text-right text-[11px] tabular-nums font-semibold text-foreground">
                {fmt(s.contacts)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <ProposalNote text="Maps hs_analytics_source: Organic Search, Paid Search, Email Marketing, Organic Social, Referrals, AI Referrals, Other Campaigns, Direct Traffic, Paid Social. Extend hubspot-contacts — no new edge function needed." />
    </section>
  );
}

// ─── Section 4 — HubSpot vs Salesforce Creation Source ───────────────────────

function CreationSourceSection() {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <SectionHeader
        title="Contact Creation Source — HubSpot vs Salesforce"
        description="How many contacts were created natively in HubSpot vs synced from Salesforce, monthly"
        badge="Extends existing"
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <ScoreCard title="Created in HubSpot"     value="1,430" delta={12.4} />
        <ScoreCard title="Synced from Salesforce" value="592"   delta={3.1}  />
        <ScoreCard title="HubSpot Share"           value="70.7%" delta={5.2}  />
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={CREATION_SOURCE} barCategoryGap="35%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="hubspot"    name="HubSpot"    stackId="a" fill="hsl(24 95% 53%)"  />
          <Bar dataKey="salesforce" name="Salesforce" stackId="a" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex gap-4">
        {[{ label: "HubSpot", color: "hsl(24 95% 53%)" }, { label: "Salesforce", color: "hsl(217 91% 60%)" }].map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            <span className="text-[10px] text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
      <ProposalNote text="Uses hs_analytics_source_data_1. Already in the contacts API — extend hubspot-contacts response. No new edge function needed." />
    </section>
  );
}

// ─── Section 5 — IP State / Region ────────────────────────────────────────────

function IPStateSection() {
  const withoutState = TOTAL_CONTACTS - WITH_STATE;
  const pct = ((WITH_STATE / TOTAL_CONTACTS) * 100).toFixed(1);
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <SectionHeader
        title="Contact Distribution by IP State / Region"
        description="Based on ip_state_code property — only contacts with a known state shown in chart"
        badge="New — extend contacts fetch"
      />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-4" style={{ borderColor: "hsl(158 64% 52% / 0.4)", background: "hsl(158 64% 52% / 0.07)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-green">Has State Data</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{fmt(WITH_STATE)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{pct}% of all contacts</p>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "hsl(355 78% 56% / 0.4)", background: "hsl(355 78% 56% / 0.07)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-red">No State Data</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{fmt(withoutState)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{(100 - parseFloat(pct)).toFixed(1)}% unknown</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Contacts</p>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{fmt(TOTAL_CONTACTS)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">across all records</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={290}>
        <BarChart data={IP_STATES} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="state" tick={{ fontSize: 11 }} width={130} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="contacts" name="Contacts" fill="hsl(217 91% 60%)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ProposalNote text="HubSpot's ip_state_code is available on every contact. Filter out null values before charting. Add to hubspot-contacts function — no new edge function needed." />
    </section>
  );
}

// ─── Section 6 — Contacts Score ───────────────────────────────────────────────

function ContactsScoreSection() {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <SectionHeader
        title="Contacts Score"
        description="HubSpot predictive contact score distribution (hs_predictivescoringtier)"
        badge="New — derived from existing data"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CONTACT_SCORES.map((seg) => (
          <div key={seg.label} className="rounded-lg border p-4 shadow-sm"
            style={{ borderColor: seg.color, background: `${seg.color}15` }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: seg.color }}>{seg.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{fmt(seg.count)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{seg.pct}% of total</p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full">
        {CONTACT_SCORES.map((seg) => (
          <div key={seg.label} style={{ width: `${seg.pct}%`, background: seg.color }} title={`${seg.label}: ${seg.pct}%`} />
        ))}
      </div>
      <div className="mt-2 flex gap-4">
        {CONTACT_SCORES.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ background: seg.color }} />
            <span className="text-[10px] text-muted-foreground">{seg.label}</span>
          </div>
        ))}
      </div>
      <ProposalNote text="hs_predictivescoringtier is available on contacts. Extend hubspot-contacts function to return this field. No new edge function needed." />
    </section>
  );
}

// ─── Brand-Specific Divider ────────────────────────────────────────────────────

function BrandSpecificDivider() {
  return (
    <div className="rounded-xl border-2 border-dashed border-orange-400/40 bg-orange-400/5 px-5 py-4">
      <div className="flex items-center gap-2">
        <Store className="h-4 w-4 text-orange-500" />
        <p className="text-xs font-semibold text-orange-600">
          MAAX Saunas · Vita Spas · American Whirlpool
        </p>
      </div>
      <p className="ml-6 mt-1 text-[11px] text-muted-foreground">
        The sections below appear <strong>only when MAAX Saunas, Vita Spas, or American Whirlpool</strong> is the selected brand.
        These brands use a dealer assignment model — incoming leads are routed to the nearest dealer
        via the <code className="rounded bg-muted px-1 text-[10px]">nearest_dealer_email</code> HubSpot property.
      </p>
    </div>
  );
}

// ─── Section 7 — Nearest Dealer Email ────────────────────────────────────────

function DealerEmailSection() {
  const assigned = DEALER_EMAIL_DATA[0].value;
  const unassigned = DEALER_EMAIL_DATA[1].value;
  const assignedPct = ((assigned / DEALER_TOTAL) * 100).toFixed(1);

  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <SectionHeader
        title="Nearest Dealer Email — Assignment Status"
        description="Whether each lead has been routed to a dealer — core health indicator for the dealer model"
        badge="MAAX Saunas / Vita Spas / American Whirlpool"
        badgeVariant="orange"
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col items-center justify-center">
          <div className="relative">
            <PieChart width={210} height={210}>
              <Pie data={DEALER_EMAIL_DATA} cx={105} cy={105} innerRadius={62} outerRadius={90} paddingAngle={3} dataKey="value">
                {DEALER_EMAIL_DATA.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => fmt(v)} />
            </PieChart>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-bold tabular-nums text-foreground">{assignedPct}%</p>
              <p className="text-[10px] text-muted-foreground">assigned</p>
            </div>
          </div>
          <div className="mt-2 flex gap-5">
            {DEALER_EMAIL_DATA.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: d.fill }} />
                <span className="text-[11px] text-muted-foreground">{d.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 justify-center">
          <div className="flex items-center gap-4 rounded-lg border p-4"
            style={{ borderColor: "hsl(158 64% 52% / 0.4)", background: "hsl(158 64% 52% / 0.07)" }}>
            <UserCheck className="h-8 w-8 shrink-0 text-brand-green" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-green">Assigned to Dealer</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">{fmt(assigned)}</p>
              <p className="text-[11px] text-muted-foreground">leads successfully routed to a dealer</p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-lg border p-4"
            style={{ borderColor: "hsl(355 78% 56% / 0.4)", background: "hsl(355 78% 56% / 0.07)" }}>
            <UserX className="h-8 w-8 shrink-0 text-brand-red" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-red">No Dealer Assigned</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">{fmt(unassigned)}</p>
              <p className="text-[11px] text-muted-foreground">unrouted — pending or no coverage</p>
            </div>
          </div>
        </div>
      </div>
      <ProposalNote text="nearest_dealer_email is a custom HubSpot contact property. Extend hubspot-contacts to return it. Empty = no dealer assigned. No new edge function needed." />
    </section>
  );
}

// ─── Section 8 — Company & Account Overview ───────────────────────────────────

function CompanySection() {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <SectionHeader
        title="Company & Account Overview"
        description="B2B account breakdown by industry — puts contacts in business context"
        badge="New — needs hubspot-companies function"
      />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ScoreCard title="Total Companies"    value="1,738" delta={6.4} />
        <ScoreCard title="Avg Contacts / Co." value="3.9"   delta={1.2} />
        <ScoreCard title="Avg Company Size"   value="142 emp" />
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={COMPANIES_BY_INDUSTRY} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="industry" tick={{ fontSize: 11 }} width={120} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="companies" name="Companies" fill="hsl(217 91% 60%)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ProposalNote text="Requires a new hubspot-companies Supabase Edge Function using HubSpot /crm/v3/objects/companies — industry and numberofemployees, scoped by hubspotBusinessUnitId." />
    </section>
  );
}

// ─── Section 9 — Data Completeness Score ─────────────────────────────────────

function DataCompletenessSection() {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <SectionHeader
        title="Data Completeness Score"
        description="% of contacts with key fields populated — surfaces data quality gaps across brands"
        badge="New — derived from existing data"
      />
      <div className="space-y-4">
        {DATA_COMPLETENESS.map((item) => {
          const good = item.pct >= 80;
          const warn = item.pct >= 50 && item.pct < 80;
          return (
            <div key={item.field} className="flex items-center gap-4">
              <span className="w-20 text-xs font-medium text-foreground">{item.field}</span>
              <div className="flex-1 rounded-full bg-muted" style={{ height: 10 }}>
                <div className="h-full rounded-full" style={{ width: `${item.pct}%`, background: item.fill }} />
              </div>
              <span className="w-10 text-right text-xs tabular-nums font-semibold text-foreground">{item.pct}%</span>
              {good       && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-brand-green" />}
              {warn       && <AlertCircle  className="h-3.5 w-3.5 shrink-0 text-yellow-500" />}
              {!good && !warn && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-brand-red" />}
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap gap-5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-brand-green" /> ≥80% Good</div>
        <div className="flex items-center gap-1.5"><AlertCircle  className="h-3 w-3 text-yellow-500" /> 50–79% Needs work</div>
        <div className="flex items-center gap-1.5"><AlertCircle  className="h-3 w-3 text-brand-red"  /> &lt;50% Critical gap</div>
      </div>
      <ProposalNote text="All fields already returned by the contacts API. Zero-cost addition — count non-null values inside hubspot-contacts function." />
    </section>
  );
}

// ─── Section 10 — Dealer Coverage Gap Analysis ───────────────────────────────

function DealerGapSection() {
  const totalGap      = DEALER_GAP.reduce((s, d) => s + d.unassigned, 0);
  const totalAssigned = DEALER_GAP.reduce((s, d) => s + d.assigned, 0);
  const statesWithGap = DEALER_GAP.filter(d => d.unassigned > 0).length;
  const fullCoverage  = DEALER_GAP.filter(d => d.unassigned === 0).length;

  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <SectionHeader
        title="Dealer Coverage Gap Analysis"
        description="Which states have leads with no dealer assigned — highlights markets that need dealer recruitment"
        badge="MAAX Saunas / Vita Spas / American Whirlpool"
        badgeVariant="orange"
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ScoreCard title="Assigned Leads"    value={fmt(totalAssigned)} delta={8.2}  />
        <ScoreCard title="Unassigned (Gap)"  value={fmt(totalGap)}      delta={-5.4} deltaLabel="fewer than prev" />
        <ScoreCard title="States with Gaps"  value={`${statesWithGap}`} />
        <ScoreCard title="Full Coverage"     value={`${fullCoverage} states`} delta={10.0} />
      </div>
      <ResponsiveContainer width="100%" height={Math.max(300, DEALER_GAP.length * 36)}>
        <BarChart data={DEALER_GAP} layout="vertical" barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="state" tick={{ fontSize: 11 }} width={130} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="assigned"   name="Assigned to Dealer" stackId="a" fill="hsl(158 64% 52%)" />
          <Bar dataKey="unassigned" name="No Dealer (Gap)"    stackId="a" fill="hsl(355 78% 56%)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex gap-5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(158 64% 52%)" }} />
          Assigned to dealer
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(355 78% 56%)" }} />
          No dealer assigned (gap — needs recruitment)
        </div>
      </div>
      <ProposalNote text="Derived from nearest_dealer_email (empty = unassigned) grouped by ip_state_code. Sorted by gap size descending. No new edge function needed." />
    </section>
  );
}

// ─── Section 11 — Become a Dealer Form (end of dashboard) ────────────────────

function DealerFormSection() {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <SectionHeader
        title="Become a Dealer — Form Submissions"
        description="Prospective dealers who submitted the Become a Dealer form — not end customers"
        badge="MAAX Saunas / Vita Spas / American Whirlpool"
        badgeVariant="orange"
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ScoreCard title="Total Submissions" value={fmt(DEALER_FORM_TOTAL)} delta={18.4} />
        <ScoreCard title="With State Data"   value="198"                    delta={12.1} />
        <ScoreCard title="With City Data"    value="176"                    delta={9.8}  />
        <ScoreCard title="Top State"         value="California" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">By State</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={DEALER_FORM_BY_STATE} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="state" tick={{ fontSize: 11 }} width={90} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="count" name="Submissions" fill="hsl(24 95% 53%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">By City</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={DEALER_FORM_BY_CITY} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="city" tick={{ fontSize: 11 }} width={130} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="count" name="Submissions" fill="hsl(262 83% 58%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-6">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Products Currently Sold (Select all that apply)
        </p>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={PRODUCTS_SOLD} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="product" tick={{ fontSize: 11 }} width={150} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="count" name="Dealers" radius={[0, 4, 4, 0]}>
              {PRODUCTS_SOLD.map((p, i) => <Cell key={i} fill={p.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ProposalNote text="Filter contacts where a specific form ID matches the Become a Dealer form. State, city, and product data come from form fields mapped to HubSpot contact properties. Filter in hubspot-contacts — no new edge function needed." />
    </section>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function CRMProposal() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-6 py-5">
        <div className="mx-auto max-w-[1400px]">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-accent-foreground">P</div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">HubSpot CRM — Proposed Enhancements</h1>
              <p className="text-[11px] text-muted-foreground">
                Dummy data preview · All numbers are illustrative · Route: /crm-proposal
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1400px] space-y-6 px-6 py-6">

        {/* ── Core sections (all brands) ── */}
        <MarketingFunnelSection />
        <SalesFunnelSection />
        <ContactSourceSection />
        <CreationSourceSection />
        <IPStateSection />
        <CompanySection />
        <ContactsScoreSection />

        {/* ── Dealer-model brands only ── */}
        <BrandSpecificDivider />
        <DealerEmailSection />

        {/* ── Always-on advanced sections ── */}
        <DataCompletenessSection />

        {/* ── Gap + Form moved to end ── */}
        <DealerGapSection />
        <DealerFormSection />

      </main>
    </div>
  );
}
