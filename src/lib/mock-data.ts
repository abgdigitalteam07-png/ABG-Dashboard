// Mock data for development - will be replaced by Supabase Edge Function calls
// Uses brand ID and date range as seeds for deterministic-looking but varied data

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

export function generateTimeSeriesData(
  dateFrom: Date,
  dateTo: Date,
  baseValue: number,
  variance: number,
  seed: number = 42
) {
  const data = [];
  const rand = seededRandom(seed);
  const days = Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)));
  for (let i = 0; i < days; i++) {
    const date = new Date(dateFrom);
    date.setDate(date.getDate() + i);
    const value = Math.round(baseValue + (rand() - 0.5) * variance * 2);
    data.push({
      date: date.toISOString().split("T")[0],
      value: Math.max(0, value),
    });
  }
  return data;
}

export function generateGA4Data(brandId: string, dateFrom: Date, dateTo: Date) {
  const seed = hashString(brandId + "ga4");
  const rand = seededRandom(seed);
  const days = Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)));
  const scale = days / 30;

  const sessions = Math.round((8000 + rand() * 10000) * scale);
  const organicSessions = Math.round(sessions * (0.4 + rand() * 0.3));
  const pageViews = Math.round(sessions * (2 + rand() * 1.5));
  const activeUsers = Math.round(sessions * (0.1 + rand() * 0.1));

  return {
    sessions,
    sessionsDelta: parseFloat(((rand() - 0.3) * 20).toFixed(1)),
    organicSessions,
    organicSessionsDelta: parseFloat(((rand() - 0.3) * 25).toFixed(1)),
    pageViews,
    pageViewsDelta: parseFloat(((rand() - 0.5) * 15).toFixed(1)),
    activeUsers1Day: activeUsers,
    activeUsers1DayDelta: parseFloat(((rand() - 0.3) * 18).toFixed(1)),
    sessionsOverTime: generateTimeSeriesData(dateFrom, dateTo, sessions / days, sessions / days * 0.3, seed + 1),
    activeUsersOverTime: generateTimeSeriesData(dateFrom, dateTo, activeUsers / days, activeUsers / days * 0.3, seed + 2).map((d) => {
      const r2 = seededRandom(hashString(d.date + brandId));
      return {
        ...d,
        activeUsers: d.value,
        views: Math.round(d.value * 2.5 + (r2() - 0.5) * 100),
      };
    }),
    topPages: [
      { page: "/", sessions: Math.round(sessions * 0.33), views: Math.round(pageViews * 0.26), avgDuration: "2m 14s" },
      { page: "/products", sessions: Math.round(sessions * 0.16), views: Math.round(pageViews * 0.16), avgDuration: "1m 48s" },
      { page: "/contact", sessions: Math.round(sessions * 0.12), views: Math.round(pageViews * 0.08), avgDuration: "3m 02s" },
      { page: "/about", sessions: Math.round(sessions * 0.08), views: Math.round(pageViews * 0.05), avgDuration: "1m 22s" },
      { page: "/blog", sessions: Math.round(sessions * 0.07), views: Math.round(pageViews * 0.07), avgDuration: "4m 11s" },
      { page: "/products/bathtubs", sessions: Math.round(sessions * 0.05), views: Math.round(pageViews * 0.04), avgDuration: "2m 33s" },
      { page: "/support", sessions: Math.round(sessions * 0.04), views: Math.round(pageViews * 0.03), avgDuration: "1m 56s" },
      { page: "/dealers", sessions: Math.round(sessions * 0.03), views: Math.round(pageViews * 0.02), avgDuration: "2m 07s" },
    ],
  };
}

export function generateGSCData(brandId: string, dateFrom: Date, dateTo: Date) {
  const seed = hashString(brandId + "gsc");
  const rand = seededRandom(seed);
  const days = Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)));
  const scale = days / 30;

  const totalClicks = Math.round((5000 + rand() * 8000) * scale);
  const totalImpressions = Math.round(totalClicks * (20 + rand() * 15));
  const averageCTR = parseFloat((totalClicks / totalImpressions * 100).toFixed(1));
  const averagePosition = parseFloat((8 + rand() * 20).toFixed(1));

  return {
    totalClicks,
    totalClicksDelta: parseFloat(((rand() - 0.3) * 25).toFixed(1)),
    totalImpressions,
    totalImpressionsDelta: parseFloat(((rand() - 0.3) * 15).toFixed(1)),
    averageCTR,
    averageCTRDelta: parseFloat(((rand() - 0.5) * 2).toFixed(1)),
    averagePosition,
    averagePositionDelta: parseFloat(((rand() - 0.5) * 5).toFixed(1)),
    clicksImpressionsOverTime: generateTimeSeriesData(dateFrom, dateTo, totalClicks / days, totalClicks / days * 0.3, seed + 3).map((d) => {
      const r2 = seededRandom(hashString(d.date + brandId + "gsc"));
      return {
        date: d.date,
        clicks: d.value,
        impressions: Math.round(d.value * (20 + r2() * 15)),
      };
    }),
    topQueries: [
      { query: "bathtub replacement", clicks: Math.round(totalClicks * 0.15), impressions: Math.round(totalImpressions * 0.15), ctr: 3.6, position: 8.2 },
      { query: "shower enclosure", clicks: Math.round(totalClicks * 0.12), impressions: Math.round(totalImpressions * 0.12), ctr: 3.4, position: 12.1 },
      { query: "bath remodel", clicks: Math.round(totalClicks * 0.10), impressions: Math.round(totalImpressions * 0.09), ctr: 4.1, position: 6.7 },
      { query: "walk in tub", clicks: Math.round(totalClicks * 0.08), impressions: Math.round(totalImpressions * 0.08), ctr: 3.3, position: 15.4 },
      { query: "bathroom vanity", clicks: Math.round(totalClicks * 0.06), impressions: Math.round(totalImpressions * 0.07), ctr: 3.3, position: 11.8 },
      { query: "freestanding bathtub", clicks: Math.round(totalClicks * 0.05), impressions: Math.round(totalImpressions * 0.06), ctr: 3.0, position: 14.2 },
      { query: "shower door", clicks: Math.round(totalClicks * 0.05), impressions: Math.round(totalImpressions * 0.06), ctr: 3.1, position: 9.5 },
      { query: "bath accessories", clicks: Math.round(totalClicks * 0.04), impressions: Math.round(totalImpressions * 0.05), ctr: 3.0, position: 17.6 },
    ],
  };
}

export function generateHubSpotData(brandId: string, dateFrom: Date, dateTo: Date) {
  const seed = hashString(brandId + "hubspot");
  const rand = seededRandom(seed);

  const totalContacts = Math.round(2000 + rand() * 6000);
  const openRate = parseFloat((18 + rand() * 15).toFixed(1));
  const clickRate = parseFloat((2 + rand() * 5).toFixed(1));
  const bounceRate = parseFloat((0.5 + rand() * 2).toFixed(1));
  const unsubscribeRate = parseFloat((0.1 + rand() * 0.8).toFixed(2));
  const deliveredRate = parseFloat((96 + rand() * 3.5).toFixed(1));
  const spamReports = Math.round(rand() * 15);
  const totalEmailsSent = Math.round(8000 + rand() * 20000);

  // Health score: weighted composite
  const healthScore = Math.min(10, Math.max(1, parseFloat(
    (openRate / 5 + clickRate / 2 - bounceRate * 2 - unsubscribeRate * 5 + 2).toFixed(1)
  )));

  function getBenchmarkLabel(metric: string, value: number): string {
    if (metric === "openRate") return value >= 25 ? "Excellent" : value >= 18 ? "Good" : "Needs work";
    if (metric === "clickRate") return value >= 4 ? "Excellent" : value >= 2.5 ? "Good" : "Needs work";
    if (metric === "bounceRate") return value <= 0.5 ? "Excellent" : value <= 1.5 ? "Good" : "Needs work";
    if (metric === "unsubscribeRate") return value <= 0.2 ? "Excellent" : value <= 0.5 ? "Good" : "Needs work";
    return "Good";
  }

  const emailNames = [
    "March Newsletter", "Product Launch", "Trade Show Invite", "Feb Newsletter",
    "Dealer Update", "Webinar Invite", "Spring Promo", "Holiday Sale",
    "Customer Survey", "Year in Review"
  ];
  const emailSubjects = [
    "Spring Collection 2026", "Introducing the Nova Series", "Visit Us at KBIS 2026",
    "Winter Clearance Event", "New Dealer Resources Available", "Bathroom Design Trends 2026",
    "Exclusive Spring Savings", "Holiday Special Offers", "Share Your Feedback",
    "Our Best Year Yet"
  ];
  const senders = [
    "Marketing Team", "Product Team", "Events", "Marketing Team",
    "Channel Partners", "Education", "Promotions", "Sales",
    "Customer Success", "Marketing Team"
  ];

  const emails = emailNames.map((name, i) => {
    const r = seededRandom(seed + i + 100);
    const sent = Math.round(2000 + r() * 4000);
    const delivered = Math.round(sent * (0.96 + r() * 0.03));
    const opens = Math.round(delivered * (0.15 + r() * 0.2));
    const clicks = Math.round(opens * (0.08 + r() * 0.15));
    const bounce = Math.round(sent * (0.005 + r() * 0.02));
    const unsubscribe = Math.round(sent * (0.001 + r() * 0.005));
    const spam = Math.round(r() * 3);
    const publishDate = new Date(dateFrom);
    publishDate.setDate(publishDate.getDate() + Math.round(r() * Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)))));

    return {
      name,
      subject: emailSubjects[i],
      sender: senders[i],
      publishDate: publishDate.toISOString().split("T")[0],
      sent,
      delivered,
      opens,
      clicks,
      bounce,
      unsubscribe,
      spam,
      openRate: parseFloat((opens / delivered * 100).toFixed(1)),
      clickRate: parseFloat((clicks / delivered * 100).toFixed(1)),
      deliveredRate: parseFloat((delivered / sent * 100).toFixed(1)),
      unsubscribeRate: parseFloat((unsubscribe / sent * 100).toFixed(2)),
      bounceRate: parseFloat((bounce / sent * 100).toFixed(2)),
      spamRate: parseFloat((spam / sent * 100).toFixed(3)),
    };
  });

  // Sort for high/low performing
  const sortedByPerf = [...emails].sort((a, b) => (b.openRate + b.clickRate) - (a.openRate + a.clickRate));
  const highPerforming = sortedByPerf.slice(0, 3);
  const lowPerforming = sortedByPerf.slice(-3).reverse();
  const contactsOverTime = generateTimeSeriesData(dateFrom, dateTo, totalContacts / Math.max(1, 30), 35, seed + 12).map((d) => {
    const total = Math.max(0, Math.round(d.value));
    const salesforce = Math.round(total * (0.15 + rand() * 0.2));
    return {
      date: d.date,
      total,
      hubspot: Math.max(0, total - salesforce),
      salesforce,
    };
  });
  const jobTitles = [
    { title: "Sales Manager", count: Math.round(totalContacts * 0.08) },
    { title: "Owner", count: Math.round(totalContacts * 0.07) },
    { title: "Operations Manager", count: Math.round(totalContacts * 0.06) },
    { title: "Purchasing Manager", count: Math.round(totalContacts * 0.05) },
    { title: "Project Manager", count: Math.round(totalContacts * 0.04) },
    { title: "Not specified", count: Math.round(totalContacts * 0.1) },
  ];
  const contactStateDistribution = [
    { state: "TX", count: Math.round(totalContacts * 0.14) },
    { state: "FL", count: Math.round(totalContacts * 0.12) },
    { state: "CA", count: Math.round(totalContacts * 0.1) },
    { state: "GA", count: Math.round(totalContacts * 0.07) },
    { state: "NC", count: Math.round(totalContacts * 0.06) },
  ];

  return {
    totalContacts,
    totalContactsDelta: parseFloat(((rand() - 0.3) * 10).toFixed(1)),
    healthScore,
    openRate,
    openRateLabel: getBenchmarkLabel("openRate", openRate),
    clickRate,
    clickRateLabel: getBenchmarkLabel("clickRate", clickRate),
    bounceRate,
    bounceRateLabel: getBenchmarkLabel("bounceRate", bounceRate),
    unsubscribeRate,
    unsubscribeRateLabel: getBenchmarkLabel("unsubscribeRate", unsubscribeRate),
    spamReports,
    totalEmailsSent,
    deliveredRate,
    deliveredRateDelta: parseFloat(((rand() - 0.5) * 2).toFixed(1)),
    lifecycleStages: [
      { stage: "Subscriber", count: Math.round(totalContacts * 0.42), key: "subscriber" },
      { stage: "Lead", count: Math.round(totalContacts * 0.28), key: "lead" },
      { stage: "MQL", count: Math.round(totalContacts * 0.14), key: "marketingqualifiedlead" },
      { stage: "SQL", count: Math.round(totalContacts * 0.07), key: "salesqualifiedlead" },
      { stage: "Opportunity", count: Math.round(totalContacts * 0.04), key: "opportunity" },
      { stage: "Customer", count: Math.round(totalContacts * 0.05), key: "customer" },
    ],
    contactsOverTime,
    jobTitles,
    contactStateDistribution,
    contactUnknownStateCount: Math.max(
      0,
      totalContacts - contactStateDistribution.reduce((sum, item) => sum + item.count, 0),
    ),
    emailPerformance: {
      openRate,
      openRateDelta: parseFloat(((rand() - 0.5) * 4).toFixed(1)),
      clickRate,
      clickRateDelta: parseFloat(((rand() - 0.5) * 2).toFixed(1)),
      bounceRate,
      bounceRateDelta: parseFloat(((rand() - 0.5) * 1).toFixed(1)),
      unsubscribeRate,
      unsubscribeRateDelta: parseFloat(((rand() - 0.5) * 0.3).toFixed(2)),
      deliveredRate,
      deliveredRateDelta: parseFloat(((rand() - 0.5) * 2).toFixed(1)),
    },
    openRateOverTime: generateTimeSeriesData(dateFrom, dateTo, openRate, 4, seed + 10),
    unsubscribeRateOverTime: generateTimeSeriesData(dateFrom, dateTo, unsubscribeRate * 100, 15, seed + 11).map(d => ({
      ...d,
      value: Math.max(0, parseFloat((d.value / 100).toFixed(2))),
    })),
    emails,
    highPerforming,
    lowPerforming,
  };
}
