// Static, screenshot-safe fake data for the /demo route.
// All chart colors use the Tableau 10 palette.

export const DEMO_BRAND_NAME = "Mostafa";

export const demoDateRange = {
  from: new Date(2026, 2, 26),
  to: new Date(2026, 4, 25),
  label: "Mar 26 – May 25, 2026",
};

export interface KpiCard {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  prev: number;
  delta: number;
  gauge: number;
  spark: number[];
  format?: "compact" | "money" | "number";
}

/* ── Tableau 10 palette ── */
export const TABLEAU = {
  blue:   "#4E79A7",
  orange: "#F28E2B",
  red:    "#E15759",
  cyan:   "#76B7B2",
  green:  "#59A14F",
  yellow: "#EDC948",
  purple: "#B07AA1",
  pink:   "#FF9DA7",
  brown:  "#9C755F",
  gray:   "#BAB0AC",
} as const;

export const TABLEAU_SEQ = [
  TABLEAU.blue, TABLEAU.orange, TABLEAU.red, TABLEAU.cyan, TABLEAU.green,
  TABLEAU.yellow, TABLEAU.purple, TABLEAU.pink, TABLEAU.brown, TABLEAU.gray,
];

/* ── RWFD-style accent palette (deep navy + coral pink for highlights) ── */
export const RWFD = {
  navy:    "#1F2A44",
  navy90:  "#2C3E5F",
  coral:   "#E04E68",
  coralBg: "#FDEAEF",
  blue:    "#5B7CFA",
  blueBg:  "#E8EEFD",
  ink:     "#0F172A",
  muted:   "#94A3B8",
} as const;

/* ── Random-ish sparkline generator (deterministic) ── */
function spark(n: number, base: number, variance: number, seed = 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const wave = Math.sin((i + seed) / 2.4) * variance;
    const noise = (Math.sin((i + seed) * 3.7) + Math.cos((i + seed) * 1.8)) * variance * 0.6;
    out.push(Math.max(1, Math.round(base + wave + noise + i * (base * 0.005))));
  }
  return out;
}

/* ── Performance (GA4 + GSC) ── */
export const demoPerformance = {
  kpis: {
    sessions: { value: 184_320, delta: 12.4 },
    users: { value: 142_890, delta: 9.1 },
    pageviews: { value: 612_405, delta: 7.8 },
    conversions: { value: 4_320, delta: 24.6 },
    avgSession: { value: "2m 41s", delta: 3.2 },
    bounce: { value: "38.4%", delta: -4.1 },
  },
  channelMix: [
    { channel: "Organic Search", sessions: 78_910, conversions: 1_920, color: TABLEAU.blue },
    { channel: "Direct",         sessions: 42_220, conversions: 980,   color: TABLEAU.orange },
    { channel: "Paid Search",    sessions: 28_640, conversions: 720,   color: TABLEAU.green },
    { channel: "Referral",       sessions: 16_180, conversions: 410,   color: TABLEAU.cyan },
    { channel: "Email",          sessions: 11_920, conversions: 220,   color: TABLEAU.purple },
    { channel: "Social",         sessions:  6_450, conversions:  70,   color: TABLEAU.red },
  ],
  trafficTrend: makeTrend(60, 2_400, 0.18),
  gscKpis: {
    clicks: { value: 64_120, delta: 18.2 },
    impressions: { value: 2_148_300, delta: 14.5 },
    ctr: { value: "2.98%", delta: 0.4 },
    position: { value: "14.2", delta: -1.8 },
  },
  topQueries: [
    { query: "modern bathtub installation", clicks: 4_120, impr: 82_400, ctr: 5.0, pos: 6.2 },
    { query: "freestanding tub small bathroom", clicks: 3_810, impr: 71_300, ctr: 5.3, pos: 5.8 },
    { query: "soaking tub vs whirlpool", clicks: 2_980, impr: 64_220, ctr: 4.6, pos: 7.4 },
    { query: "best acrylic shower base", clicks: 2_640, impr: 58_910, ctr: 4.5, pos: 8.1 },
    { query: "shower door replacement cost", clicks: 2_120, impr: 51_240, ctr: 4.1, pos: 9.0 },
    { query: "walk in shower remodel ideas", clicks: 1_980, impr: 47_320, ctr: 4.2, pos: 8.7 },
    { query: "jetted tub maintenance", clicks: 1_640, impr: 39_440, ctr: 4.2, pos: 10.1 },
    { query: "alcove tub dimensions standard", clicks: 1_420, impr: 35_220, ctr: 4.0, pos: 11.3 },
  ],
};

/* ── Emails (HubSpot marketing) ── */
export const demoEmails = {
  kpis: {
    sent: { value: 184_500, delta: 6.8 },
    opens: { value: 78_320, delta: 11.4 },
    clicks: { value: 14_220, delta: 18.6 },
    openRate: { value: "42.4%", delta: 4.2 },
    clickRate: { value: "7.7%", delta: 2.1 },
    unsubscribes: { value: 612, delta: -3.4 },
  },
  campaigns: [
    { name: "Spring Bath Refresh — Newsletter", sent: 42_180, openRate: 48.2, clickRate: 9.4, sentDate: "May 18, 2026" },
    { name: "New Freestanding Tub Collection", sent: 38_420, openRate: 51.6, clickRate: 11.2, sentDate: "May 11, 2026" },
    { name: "Memorial Day Dealer Promo", sent: 36_900, openRate: 44.1, clickRate: 8.1, sentDate: "May 5, 2026" },
    { name: "Shower Door Buyer's Guide", sent: 28_640, openRate: 39.8, clickRate: 6.4, sentDate: "Apr 27, 2026" },
    { name: "Trade Pro Tips — April Edition", sent: 22_180, openRate: 46.2, clickRate: 9.8, sentDate: "Apr 18, 2026" },
    { name: "Welcome Series — Step 1", sent: 16_180, openRate: 58.4, clickRate: 14.2, sentDate: "Apr 1, 2026" },
  ],
  openTrend: makeTrend(60, 1_280, 0.15),
};

/* ── Social (Meta) ── */
export const demoSocial = {
  kpis: {
    reach: { value: 412_300, delta: 22.4 },
    impressions: { value: 1_280_400, delta: 18.1 },
    engagement: { value: 38_240, delta: 31.2 },
    followers: { value: 28_910, delta: 4.6 },
  },
  followerGrowth: makeTrend(60, 480, 0.08),
  topPosts: [
    { caption: "Inside our new freestanding tub line — designer pick.", reach: 48_220, eng: 4_120, type: "Reel" },
    { caption: "Before/after: a 1980s bathroom gets a soaking tub.", reach: 42_180, eng: 3_640, type: "Carousel" },
    { caption: "Pro tip Tuesday: caulk vs. silicone in wet zones.", reach: 36_220, eng: 2_910, type: "Image" },
    { caption: "Customer story — California cooperage redwood tub.", reach: 28_640, eng: 2_380, type: "Reel" },
  ],
};

/* ── HubSpot CRM — Mostafa brand ── */
export const demoCRM = {
  kpis: {
    totalContacts: { label: "Total Contacts",    value: 18_420, suffix: "",  prev: 17_180, delta: 7.2, gauge: 100, spark: spark(30, 600, 80, 1) },
    newContacts:   { label: "New Contacts",       value: 2_840,  suffix: "",  prev: 2_486,  delta: 14.2, gauge: 78, spark: spark(30, 95, 22, 2) },
    assigned:      { label: "Assigned",           value: 1_980,  suffix: "",  prev: 1_823,  delta: 8.6, gauge: 70, spark: spark(30, 66, 14, 3) },
    unassigned:    { label: "Unassigned",         value: 860,    suffix: "",  prev: 982,    delta: -12.4, gauge: 30, spark: spark(30, 29, 9, 4) },
    customers:     { label: "Customers",          value: 412,    suffix: "",  prev: 337,    delta: 22.1, gauge: 22, spark: spark(30, 14, 4, 5) },
    pipelineValue: { label: "Pipeline Value",     value: 3_420_000, prefix: "$", suffix: "", prev: 2_889_000, delta: 18.4, gauge: 92, spark: spark(30, 113000, 24000, 6) },
  } as Record<string, KpiCard>,
  funnel: [
    { stage: "Subscriber",  count: 8_420, color: TABLEAU.blue },
    { stage: "Lead",        count: 5_240, color: TABLEAU.orange },
    { stage: "MQL",         count: 2_180, color: TABLEAU.cyan },
    { stage: "SQL",         count: 1_120, color: TABLEAU.purple },
    { stage: "Opportunity", count:   640, color: TABLEAU.yellow },
    { stage: "Customer",    count:   412, color: TABLEAU.green },
  ],
  leadSource: [
    { source: "Organic Search", value: 4_820, color: TABLEAU.blue },
    { source: "Paid Search",    value: 3_140, color: TABLEAU.orange },
    { source: "Direct",         value: 2_620, color: TABLEAU.green },
    { source: "Email",          value: 1_980, color: TABLEAU.red },
    { source: "Social",         value: 1_420, color: TABLEAU.cyan },
    { source: "Referral",       value: 1_220, color: TABLEAU.purple },
    { source: "Trade Show",     value:   640, color: TABLEAU.brown },
  ],
  lifecycleTrend: makeLifecycleTrend(12),
  industries: [
    { industry: "Construction & Remodel", contacts: 4_820 },
    { industry: "Architecture & Design", contacts: 3_240 },
    { industry: "Property Management", contacts: 2_410 },
    { industry: "Hospitality", contacts: 1_820 },
    { industry: "Real Estate", contacts: 1_640 },
    { industry: "Plumbing & Trades", contacts: 1_280 },
    { industry: "Retail Showroom", contacts: 920 },
  ],
  topAccounts: [
    { name: "Westside Bath Pros", contacts: 142, deals: 18, arr: "$84,200" },
    { name: "Pacific Plumb Supply", contacts: 118, deals: 14, arr: "$71,400" },
    { name: "Mountain View Remodel Co.", contacts: 96, deals: 11, arr: "$62,800" },
    { name: "Coastline Hospitality Group", contacts: 84, deals: 9, arr: "$58,100" },
    { name: "Atlas Property Services", contacts: 72, deals: 8, arr: "$44,600" },
    { name: "Sunbelt Renovations", contacts: 64, deals: 7, arr: "$38,900" },
  ],
  dealVelocity: [
    { stage: "Lead → MQL",    days:  4.2 },
    { stage: "MQL → SQL",     days:  7.8 },
    { stage: "SQL → Opp",     days: 12.4 },
    { stage: "Opp → Customer", days: 18.6 },
  ],
  // Single-brand state distribution for Mostafa
  geoStates: [
    { state: "CA", count: 1_240 }, { state: "TX", count: 980 }, { state: "FL", count: 820 },
    { state: "NY", count: 640 }, { state: "AZ", count: 540 }, { state: "WA", count: 420 },
    { state: "CO", count: 380 }, { state: "GA", count: 360 }, { state: "NC", count: 340 },
    { state: "IL", count: 320 }, { state: "PA", count: 280 }, { state: "OH", count: 260 },
    { state: "MA", count: 240 }, { state: "VA", count: 220 }, { state: "NJ", count: 200 },
    { state: "MI", count: 180 }, { state: "MD", count: 160 }, { state: "OR", count: 150 },
    { state: "MN", count: 140 }, { state: "TN", count: 130 }, { state: "WI", count: 120 },
    { state: "MO", count: 110 }, { state: "IN", count: 100 }, { state: "SC", count: 90 },
    { state: "NV", count: 80 }, { state: "UT", count: 70 }, { state: "OK", count: 60 },
    { state: "KY", count: 55 }, { state: "AL", count: 50 }, { state: "LA", count: 45 },
    { state: "CT", count: 40 }, { state: "NM", count: 35 }, { state: "KS", count: 30 },
    { state: "AR", count: 28 }, { state: "MS", count: 25 }, { state: "IA", count: 22 },
    { state: "NE", count: 20 }, { state: "ID", count: 18 }, { state: "WV", count: 16 },
    { state: "NH", count: 14 }, { state: "ME", count: 12 }, { state: "RI", count: 10 },
    { state: "MT", count: 9 }, { state: "DE", count: 8 }, { state: "SD", count: 7 },
    { state: "ND", count: 6 }, { state: "AK", count: 5 }, { state: "VT", count: 5 },
    { state: "WY", count: 4 }, { state: "HI", count: 4 },
  ],
  geoTotal: 8_420,
};

/* ── Helpers ── */
function makeTrend(days: number, base: number, variance: number) {
  const out: { date: string; value: number }[] = [];
  const start = new Date(2026, 2, 26);
  let v = base;
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const wave = Math.sin(i / 7) * variance * base;
    const drift = i * (base * 0.004);
    const noise = (Math.sin(i * 2.7) + Math.cos(i * 1.3)) * variance * base * 0.4;
    v = base + wave + drift + noise;
    out.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      value: Math.max(0, Math.round(v)),
    });
  }
  return out;
}

function makeLifecycleTrend(weeks: number) {
  const out: any[] = [];
  for (let i = 0; i < weeks; i++) {
    const grow = 1 + i * 0.06;
    out.push({
      week: `W${i + 1}`,
      Subscriber: Math.round(640 * grow + Math.sin(i) * 60),
      Lead: Math.round(420 * grow + Math.sin(i + 1) * 40),
      MQL: Math.round(180 * grow + Math.sin(i + 2) * 18),
      SQL: Math.round(90 * grow + Math.sin(i + 3) * 10),
      Customer: Math.round(34 * grow + Math.sin(i + 4) * 4),
    });
  }
  return out;
}
