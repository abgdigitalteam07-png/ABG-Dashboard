// Mock data for development - will be replaced by Supabase Edge Function calls

export function generateTimeSeriesData(days: number, baseValue: number, variance: number) {
  const data = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const value = Math.round(baseValue + (Math.random() - 0.5) * variance * 2);
    data.push({
      date: date.toISOString().split("T")[0],
      value: Math.max(0, value),
    });
  }
  return data;
}

export function generateGA4Data() {
  return {
    sessions: 12847,
    sessionsDelta: 8.3,
    organicSessions: 7291,
    organicSessionsDelta: 12.1,
    pageViews: 34219,
    pageViewsDelta: -2.4,
    activeUsers1Day: 1893,
    activeUsers1DayDelta: 5.7,
    sessionsOverTime: generateTimeSeriesData(30, 420, 80),
    activeUsersOverTime: generateTimeSeriesData(30, 200, 40).map((d, i) => ({
      ...d,
      activeUsers: d.value,
      views: Math.round(d.value * 2.5 + (Math.random() - 0.5) * 100),
    })),
    topPages: [
      { page: "/", sessions: 4231, views: 8921, avgDuration: "2m 14s" },
      { page: "/products", sessions: 2104, views: 5432, avgDuration: "1m 48s" },
      { page: "/contact", sessions: 1543, views: 2876, avgDuration: "3m 02s" },
      { page: "/about", sessions: 987, views: 1654, avgDuration: "1m 22s" },
      { page: "/blog", sessions: 876, views: 2341, avgDuration: "4m 11s" },
      { page: "/products/bathtubs", sessions: 654, views: 1432, avgDuration: "2m 33s" },
      { page: "/support", sessions: 543, views: 987, avgDuration: "1m 56s" },
      { page: "/dealers", sessions: 432, views: 765, avgDuration: "2m 07s" },
    ],
  };
}

export function generateGSCData() {
  return {
    totalClicks: 8432,
    totalClicksDelta: 15.2,
    totalImpressions: 234567,
    totalImpressionsDelta: 7.8,
    averageCTR: 3.6,
    averageCTRDelta: 0.4,
    averagePosition: 18.3,
    averagePositionDelta: -2.1,
    clicksImpressionsOverTime: generateTimeSeriesData(30, 280, 60).map((d, i) => ({
      date: d.date,
      clicks: d.value,
      impressions: Math.round(d.value * 28 + (Math.random() - 0.5) * 1000),
    })),
    topQueries: [
      { query: "bathtub replacement", clicks: 1243, impressions: 34521, ctr: 3.6, position: 8.2 },
      { query: "shower enclosure", clicks: 987, impressions: 28765, ctr: 3.4, position: 12.1 },
      { query: "bath remodel", clicks: 876, impressions: 21432, ctr: 4.1, position: 6.7 },
      { query: "walk in tub", clicks: 654, impressions: 19876, ctr: 3.3, position: 15.4 },
      { query: "bathroom vanity", clicks: 543, impressions: 16543, ctr: 3.3, position: 11.8 },
      { query: "freestanding bathtub", clicks: 432, impressions: 14321, ctr: 3.0, position: 14.2 },
      { query: "shower door", clicks: 398, impressions: 12987, ctr: 3.1, position: 9.5 },
      { query: "bath accessories", clicks: 321, impressions: 10654, ctr: 3.0, position: 17.6 },
    ],
  };
}

export function generateHubSpotData() {
  return {
    totalContacts: 4521,
    totalContactsDelta: 3.2,
    lifecycleStages: [
      { stage: "Subscriber", count: 1876 },
      { stage: "Lead", count: 1243 },
      { stage: "MQL", count: 654 },
      { stage: "SQL", count: 321 },
      { stage: "Opportunity", count: 198 },
      { stage: "Customer", count: 229 },
    ],
    emailPerformance: {
      openRate: 24.3,
      openRateDelta: 1.2,
      clickRate: 3.8,
      clickRateDelta: 0.3,
      bounceRate: 1.2,
      bounceRateDelta: -0.1,
      unsubscribeRate: 0.4,
      unsubscribeRateDelta: -0.05,
      deliveredRate: 98.2,
      deliveredRateDelta: 0.1,
    },
    openRateOverTime: generateTimeSeriesData(30, 24, 4),
    unsubscribeRateOverTime: generateTimeSeriesData(30, 0.4, 0.15).map(d => ({
      ...d,
      value: Math.max(0, parseFloat((d.value / 100).toFixed(2))),
    })),
    emails: [
      { name: "March Newsletter", subject: "Spring Collection 2026", sent: 4521, delivered: 4432, opens: 1087, clicks: 176, bounce: 54, unsubscribe: 12 },
      { name: "Product Launch", subject: "Introducing the Nova Series", sent: 3876, delivered: 3801, opens: 1021, clicks: 198, bounce: 43, unsubscribe: 8 },
      { name: "Trade Show Invite", subject: "Visit Us at KBIS 2026", sent: 2987, delivered: 2932, opens: 876, clicks: 231, bounce: 32, unsubscribe: 5 },
      { name: "Feb Newsletter", subject: "Winter Clearance Event", sent: 4432, delivered: 4365, opens: 987, clicks: 143, bounce: 41, unsubscribe: 15 },
      { name: "Dealer Update", subject: "New Dealer Resources Available", sent: 1876, delivered: 1843, opens: 654, clicks: 198, bounce: 21, unsubscribe: 3 },
      { name: "Webinar Invite", subject: "Bathroom Design Trends 2026", sent: 3210, delivered: 3156, opens: 943, clicks: 287, bounce: 34, unsubscribe: 7 },
    ],
  };
}
