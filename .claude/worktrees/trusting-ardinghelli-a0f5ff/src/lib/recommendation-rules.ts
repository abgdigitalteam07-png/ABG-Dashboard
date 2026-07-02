export type RecommendationStatus = "strong" | "attention" | "action_required" | "trending_up" | "trending_down";

export interface Recommendation {
  id: string;
  status: RecommendationStatus;
  headline: string;
  detail: string;
  whyItMatters: string;
  actions: string[];
  benchmark?: string;
  metric: string;
  currentValue: string | number;
}

function r(
  id: string, status: RecommendationStatus, headline: string, detail: string,
  whyItMatters: string, actions: string[], metric: string, currentValue: string | number, benchmark?: string
): Recommendation {
  return { id, status, headline, detail, whyItMatters, actions, benchmark, metric, currentValue };
}

function ga4Rules(m: Record<string, any>): Recommendation[] {
  const recs: Recommendation[] = [];

  // Sessions change
  const sc = m.sessionsDelta;
  if (sc != null) {
    if (sc < -15) recs.push(r("sessions", "action_required", `Significant traffic drop of ${sc.toFixed(1)}% — investigate immediately`, `Sessions decreased by ${Math.abs(sc).toFixed(1)}% compared to the previous period. This could indicate SEO ranking drops, broken pages, or seasonal changes.`, "Traffic is the foundation of all conversions. A sustained drop compounds into lost leads and revenue.", ["Check Google Search Console for crawl errors or manual actions", "Review if any key pages were removed or redirected", "Compare organic vs paid vs direct traffic to isolate the source"], "Sessions", `${sc.toFixed(1)}%`));
    else if (sc < 0) recs.push(r("sessions", "attention", `Slight traffic decline of ${sc.toFixed(1)}% — monitor closely`, `Sessions dipped by ${Math.abs(sc).toFixed(1)}%. Small declines can be seasonal but should be watched.`, "Catching small declines early prevents larger problems.", ["Check if the decline is isolated to specific channels", "Review recent content changes or technical updates", "Monitor for another period before taking major action"], "Sessions", `${sc.toFixed(1)}%`));
    else if (sc < 15) recs.push(r("sessions", "trending_up", `Traffic is growing at ${sc.toFixed(1)}% — keep the momentum`, `Sessions increased by ${sc.toFixed(1)}% vs the previous period.`, "Sustained growth compounds over time into significant audience gains.", ["Double down on what's working — identify top-performing channels", "Create more content similar to top landing pages", "Consider increasing paid spend while organic momentum builds"], "Sessions", `${sc.toFixed(1)}%`));
    else recs.push(r("sessions", "strong", `Strong traffic growth of ${sc.toFixed(1)}%`, `Sessions surged by ${sc.toFixed(1)}% compared to the previous period.`, "Strong growth indicates effective marketing efforts and good content-market fit.", ["Capitalize on momentum with conversion optimization", "Ensure site infrastructure can handle growing traffic", "Document what's driving growth to replicate across brands"], "Sessions", `${sc.toFixed(1)}%`));
  }

  // Organic sessions delta
  const osd = m.organicSessionsDelta;
  if (osd != null) {
    if (osd < -10) recs.push(r("organic", "action_required", "Organic traffic declining — SEO attention needed", `Organic sessions dropped by ${Math.abs(osd).toFixed(1)}%. This often signals ranking losses or algorithm changes.`, "Organic traffic is your most cost-effective channel. Losing it means paying more for the same visitors.", ["Audit top landing pages for content freshness and relevance", "Check for technical SEO issues (Core Web Vitals, mobile usability)", "Review competitor content that may be outranking you"], "Organic Sessions", `${osd.toFixed(1)}%`));
    else if (osd >= 10) recs.push(r("organic", "strong", `Organic traffic up ${osd.toFixed(1)}% — SEO is working`, `Organic sessions grew by ${osd.toFixed(1)}%, indicating strong search visibility.`, "Growing organic traffic reduces reliance on paid channels.", ["Maintain content quality and publishing frequency", "Expand keyword targeting to adjacent topics", "Convert organic visitors with targeted CTAs"], "Organic Sessions", `${osd.toFixed(1)}%`));
  }

  return recs;
}

function gscRules(m: Record<string, any>): Recommendation[] {
  const recs: Recommendation[] = [];

  const ctr = m.averageCTR;
  if (ctr != null) {
    if (ctr < 2) recs.push(r("gsc_ctr", "action_required", "Search CTR is very low — meta titles need improvement", `Your average CTR of ${ctr}% means very few searchers are clicking your results.`, "Low CTR means wasted impressions — you're visible but not compelling.", ["Rewrite page titles to include compelling value propositions", "Add structured data (FAQ schema, product schema) for rich snippets", "Ensure meta descriptions are unique and include a clear call-to-action"], "Average CTR", `${ctr}%`, "B2B average: 3-5%"));
    else if (ctr < 4) recs.push(r("gsc_ctr", "attention", `Search CTR of ${ctr}% has room for improvement`, `At ${ctr}%, you're getting clicks but could capture more with better titles and descriptions.`, "Every percentage point of CTR improvement means more free traffic.", ["Test more compelling title formats (numbers, questions, brackets)", "Add year or freshness indicators to titles", "Review and update meta descriptions for top-impression pages"], "Average CTR", `${ctr}%`, "B2B target: 4%+"));
    else recs.push(r("gsc_ctr", "strong", "Strong search CTR — titles and descriptions are compelling", `At ${ctr}%, your search results are attracting clicks well above average.`, "High CTR maximizes the traffic value of every ranking you earn.", ["Maintain current title and description quality", "Focus on improving rankings for high-CTR pages", "Test rich snippet opportunities for even higher CTR"], "Average CTR", `${ctr}%`, "B2B average: 3-5%"));
  }

  const pos = m.averagePosition;
  if (pos != null) {
    if (pos > 20) recs.push(r("gsc_pos", "action_required", "Most keywords are on page 2+ — SEO effort needed", `Average position of ${pos.toFixed(1)} means most of your content isn't visible on page 1.`, "95% of searchers never go past page 1. Page 2+ rankings generate almost no traffic.", ["Identify keywords ranking positions 11-20 (striking distance)", "Create comprehensive content targeting those keywords", "Build internal links from high-authority pages to underperforming ones"], "Average Position", pos.toFixed(1), "Target: under 10"));
    else if (pos > 10) recs.push(r("gsc_pos", "attention", "Average position is on page 2 — close to visibility", `At position ${pos.toFixed(1)}, many keywords are just outside page 1.`, "Keywords in positions 8-15 are your biggest quick-win opportunity.", ["Focus link building on pages ranking positions 8-15", "Update and expand existing content for target keywords", "Improve page experience signals (Core Web Vitals)"], "Average Position", pos.toFixed(1), "Target: under 10"));
    else recs.push(r("gsc_pos", "strong", "Strong search positioning — average rank is on page 1", `At position ${pos.toFixed(1)}, your content is well-positioned in search results.`, "Page 1 rankings drive the vast majority of organic clicks.", ["Maintain content freshness for top-ranking pages", "Target featured snippets for top keywords", "Expand to related keyword clusters"], "Average Position", pos.toFixed(1)));
  }

  const impDelta = m.totalImpressionsDelta;
  if (impDelta != null) {
    if (impDelta < -20) recs.push(r("gsc_imp", "action_required", "Search visibility dropped significantly", `Impressions decreased by ${Math.abs(impDelta).toFixed(1)}%, meaning your content is appearing in fewer searches.`, "Declining impressions indicate ranking losses or reduced search demand.", ["Check for manual actions or algorithm updates", "Review indexing status of key pages", "Analyze which queries lost the most impressions"], "Impressions Change", `${impDelta.toFixed(1)}%`));
    else if (impDelta < 0) recs.push(r("gsc_imp", "attention", `Search impressions down ${Math.abs(impDelta).toFixed(1)}%`, `A moderate decline in search visibility that should be monitored.`, "Small impression drops can signal early ranking changes.", ["Monitor weekly for continued decline", "Review content freshness of top pages", "Check for new competitors entering the space"], "Impressions Change", `${impDelta.toFixed(1)}%`));
    else if (impDelta >= 10) recs.push(r("gsc_imp", "strong", `Search visibility growing — impressions up ${impDelta.toFixed(1)}%`, `Your content is appearing in more searches, indicating growing SEO authority.`, "Growing impressions means expanding reach and potential traffic.", ["Focus on improving CTR to capitalize on visibility", "Create content for related queries appearing in impressions", "Build on successful content formats"], "Impressions Change", `${impDelta.toFixed(1)}%`));
  }

  return recs;
}

function emailRules(m: Record<string, any>): Recommendation[] {
  const recs: Recommendation[] = [];

  const or = m.openRate;
  if (or != null) {
    if (or < 15) recs.push(r("email_open", "action_required", "Low open rate — subject lines need reworking", `Your open rate of ${or}% is significantly below the B2B manufacturing average.`, "If emails aren't opened, all the content effort inside is wasted.", ["A/B test subject lines — try questions, numbers, or personalization", "Check sender name — use a recognizable brand or person name", "Review send times — test different days/hours for your audience", "Clean your email list — remove inactive contacts (no opens in 6+ months)"], "Open Rate", `${or}%`, "B2B manufacturing average: 20-25%"));
    else if (or < 22) recs.push(r("email_open", "attention", `Open rate of ${or}% is slightly below industry average`, `At ${or}%, there's room to improve subject line performance.`, "Small improvements in open rate multiply across your entire list.", ["Test emoji in subject lines for appropriate campaigns", "Personalize subject lines with company or contact name", "Send at optimal times based on past open data"], "Open Rate", `${or}%`, "B2B average: 20-25%"));
    else recs.push(r("email_open", "strong", `Strong open rate of ${or}% — your subject lines are working`, `At ${or}%, you're at or above the B2B manufacturing benchmark.`, "High open rates indicate strong brand recognition and relevant messaging.", ["Maintain current subject line strategies", "Focus on improving click rates inside opened emails", "Test new content formats to keep engagement growing"], "Open Rate", `${or}%`, "B2B average: 20-25%"));
  }

  const cr = m.clickRate;
  if (cr != null) {
    if (cr < 1.5) recs.push(r("email_click", "action_required", "Very low click rate — email content isn't driving action", `Your click rate of ${cr}% means most recipients aren't engaging with email content.`, "Clicks are the bridge between email awareness and website conversions.", ["Make CTAs more prominent — use buttons instead of text links", "Reduce email length — get to the value proposition faster", "Ensure CTA text is action-oriented (e.g., 'View Product' not 'Click Here')", "Add only ONE primary CTA per email to avoid decision paralysis"], "Click Rate", `${cr}%`, "B2B average: 2.5-3.5%"));
    else if (cr < 2.5) recs.push(r("email_click", "attention", `Click rate of ${cr}% has room for improvement`, `You're generating some clicks but below the B2B benchmark.`, "Improving click rate directly increases website traffic from email.", ["Test different CTA button colors and placements", "Add preview text that complements the subject line", "Include social proof or urgency elements"], "Click Rate", `${cr}%`, "B2B average: 2.5-3.5%"));
    else recs.push(r("email_click", "strong", `Strong click rate of ${cr}%`, `Your click rate is at or above the B2B average.`, "High click rates indicate compelling content and effective CTAs.", ["Optimize landing pages for email traffic", "Test deeper segmentation for even higher relevance", "A/B test CTA variations to push rates higher"], "Click Rate", `${cr}%`, "B2B average: 2.5-3.5%"));
  }

  const br = m.bounceRate;
  if (br != null) {
    if (br > 5) recs.push(r("email_bounce", "action_required", `High email bounce rate of ${br}% — list hygiene is critical`, `A ${br}% bounce rate can damage sender reputation and deliverability.`, "High bounces signal to email providers that you're not maintaining your list, leading to more emails going to spam.", ["Remove hard bounced addresses immediately", "Implement double opt-in for new subscribers", "Run a re-engagement campaign, then remove non-responders", "Verify email addresses before importing new lists"], "Bounce Rate", `${br}%`, "Healthy bounce rate: under 2%"));
    else if (br > 2) recs.push(r("email_bounce", "attention", `Bounce rate of ${br}% is above ideal`, `While not critical, keeping bounces under 2% protects your sender reputation.`, "Even moderate bounce rates erode deliverability over time.", ["Regularly clean inactive contacts", "Use email verification on form submissions", "Monitor for patterns in bounced domains"], "Bounce Rate", `${br}%`, "Healthy bounce rate: under 2%"));
    else recs.push(r("email_bounce", "strong", `Healthy bounce rate of ${br}%`, `Your bounce rate is well within acceptable limits.`, "Low bounces indicate a clean, well-maintained contact list.", ["Continue current list hygiene practices", "Monitor for any sudden spikes after imports", "Maintain verification on sign-up forms"], "Bounce Rate", `${br}%`, "Healthy: under 2%"));
  }

  const ur = m.unsubscribeRate;
  if (ur != null) {
    if (ur > 0.5) recs.push(r("email_unsub", "action_required", `High unsubscribe rate of ${ur}% — review content relevance`, `At ${ur}%, you're losing subscribers faster than typical for B2B.`, "High unsubscribes shrink your reachable audience and signal content-audience mismatch.", ["Survey unsubscribers to understand why they're leaving", "Segment your list and send more targeted content", "Reduce email frequency if sending more than 2x per week", "Ensure emails deliver value, not just promotions"], "Unsubscribe Rate", `${ur}%`, "Healthy: under 0.2%"));
    else if (ur > 0.2) recs.push(r("email_unsub", "attention", `Unsubscribe rate of ${ur}% is slightly elevated`, `Some list churn is normal, but you're above the ideal threshold.`, "Controlling unsubscribes preserves your audience size.", ["Review email frequency — are you sending too often?", "Ensure content matches subscriber expectations from sign-up", "Add preference centers so subscribers can choose topics"], "Unsubscribe Rate", `${ur}%`, "Healthy: under 0.2%"));
    else recs.push(r("email_unsub", "strong", `Low unsubscribe rate of ${ur}%`, `Your unsubscribe rate is well below industry norms.`, "Low unsubscribes indicate your content is relevant and valued.", ["Maintain content quality and sending frequency", "Use this audience loyalty to test new content formats", "Consider upsell or cross-sell campaigns for engaged contacts"], "Unsubscribe Rate", `${ur}%`));
  }

  return recs;
}

function socialRules(m: Record<string, any>): Recommendation[] {
  const recs: Recommendation[] = [];

  const er = m.engagementRate;
  if (er != null) {
    if (er < 1) recs.push(r("social_eng", "action_required", "Very low engagement — content strategy needs a refresh", `Your engagement rate of ${er}% is below the B2B social media average.`, "Low engagement tells algorithms to show your content to fewer people, creating a downward spiral.", ["Post more Reels/video content — they get 2-3x more reach", "Ask questions in captions to encourage comments", "Use relevant industry hashtags (5-10 targeted, not generic)", "Engage with your audience — reply to every comment within 24hrs"], "Engagement Rate", `${er}%`, "B2B social media average: 1-3%"));
    else if (er < 3) recs.push(r("social_eng", "attention", `Engagement rate of ${er}% has room for growth`, `You're getting some engagement but below the optimal range.`, "Higher engagement drives algorithmic reach, creating a positive feedback loop.", ["Test different content formats to find what resonates", "Post at peak engagement times", "Use polls and questions to drive interaction"], "Engagement Rate", `${er}%`, "B2B target: 3%+"));
    else recs.push(r("social_eng", "strong", `Strong engagement rate of ${er}%`, `Your content is resonating well with your audience.`, "High engagement signals to algorithms to show your content to more people.", ["Maintain content quality and posting consistency", "Analyze top-performing posts to replicate success", "Consider paid amplification of high-engagement organic posts"], "Engagement Rate", `${er}%`, "B2B average: 1-3%"));
  }

  const fg = m.followerGrowth;
  if (fg != null) {
    if (fg < 0) recs.push(r("social_followers", "action_required", `Losing followers — content may need repositioning`, `Follower count decreased by ${Math.abs(fg).toFixed(1)}%.`, "Losing followers shrinks your organic reach potential.", ["Review recent content for relevance to your target audience", "Increase posting frequency with valuable content", "Run follower growth campaigns with targeted content"], "Follower Growth", `${fg.toFixed(1)}%`));
    else if (fg < 2) recs.push(r("social_followers", "attention", `Slow follower growth of ${fg.toFixed(1)}%`, `Growth is positive but below the pace needed for meaningful audience building.`, "Consistent follower growth compounds into significant brand reach.", ["Cross-promote social channels in emails and website", "Collaborate with industry partners for exposure", "Create shareable content that attracts new followers"], "Follower Growth", `${fg.toFixed(1)}%`));
    else recs.push(r("social_followers", "strong", `Healthy follower growth of ${fg.toFixed(1)}%`, `Your audience is growing at a solid pace.`, "Growing followers means expanding organic reach without additional spend.", ["Nurture new followers with engaging content", "Leverage growing audience for product launches", "Test community-building features like groups or close friends"], "Follower Growth", `${fg.toFixed(1)}%`));
  }

  const wc = m.websiteClicks;
  if (wc != null) {
    if (wc < 10) recs.push(r("social_clicks", "action_required", "Social media isn't driving website traffic", `Only ${wc} website clicks from social media this period.`, "Social should be a meaningful traffic driver — low clicks mean missed conversion opportunities.", ["Add clear 'Link in Bio' calls-to-action in posts", "Use Instagram Stories with 'link' stickers for direct traffic", "Create social-exclusive offers that require visiting your website", "Update bio links to point to relevant landing pages, not just homepage"], "Website Clicks", wc));
    else if (wc < 50) recs.push(r("social_clicks", "attention", `${wc} website clicks from social — room to grow`, `Social is driving some traffic but has more potential.`, "Increasing social-to-web traffic creates a new conversion channel.", ["Test different CTA styles in posts", "Use link stickers in Stories more frequently", "Create content that teases website-only information"], "Website Clicks", wc));
    else recs.push(r("social_clicks", "strong", `${wc} website clicks from social — good traffic driver`, `Social media is effectively driving traffic to your website.`, "Strong social-to-web traffic diversifies your traffic sources.", ["Optimize landing pages for social traffic", "Track social traffic conversions", "Scale what's working with paid amplification"], "Website Clicks", wc));
  }

  const ppw = m.postsPerWeek;
  if (ppw != null) {
    if (ppw < 2) recs.push(r("social_frequency", "attention", "Low posting frequency — consistency drives growth", `At ${ppw.toFixed(1)} posts per week, you're posting less than recommended.`, "Algorithms reward consistent posting with more reach.", ["Aim for at least 3-5 posts per week across platforms", "Batch-create content weekly using a content calendar", "Repurpose existing content — turn blog posts into carousels, product photos into Reels"], "Posts/Week", ppw.toFixed(1), "Recommended: 3-5x per week"));
    else if (ppw < 4) recs.push(r("social_frequency", "attention", `Posting frequency of ${ppw.toFixed(1)}/week is okay — but more consistency would help`, `You're posting regularly but below the optimal range.`, "Increasing from 2-3x to 4-5x per week typically increases reach by 30-50%.", ["Add 1-2 more posts per week focusing on Stories or quick updates", "Use content batching to stay ahead of schedule", "Mix content types to keep the feed diverse"], "Posts/Week", ppw.toFixed(1), "Optimal: 4-5x per week"));
    else recs.push(r("social_frequency", "strong", `Good posting consistency at ${ppw.toFixed(1)}/week`, `You're posting at or above the recommended frequency.`, "Consistent posting builds audience expectations and algorithmic favor.", ["Maintain current cadence", "Focus on quality over further increasing quantity", "Analyze which posts perform best at different times"], "Posts/Week", ppw.toFixed(1)));
  }

  const rc = m.reelCount;
  if (rc != null && rc === 0) {
    recs.push(r("social_reels", "attention", "No Reels or video content — you're missing the highest-reach format", "Reels consistently get 2-3x more reach than static image posts on Instagram and Facebook.", "Video content is prioritized by both Instagram and Facebook algorithms, meaning you're leaving reach on the table.", ["Start with simple product showcase Reels (15-30 seconds)", "Repurpose existing product photos into slideshow-style Reels", "Film behind-the-scenes or manufacturing process clips"], "Reel Count", 0));
  }

  return recs;
}

function crmRules(m: Record<string, any>): Recommendation[] {
  const recs: Recommendation[] = [];

  const tc = m.totalContacts;
  const tcAll = m.totalContactsAllTime;

  if (tc != null && tcAll != null && tcAll > 0) {
    const pct = (tc / tcAll) * 100;
    if (pct > 10) {
      recs.push(r("crm_growth", "strong", `Strong contact growth — ${pct.toFixed(1)}% of all-time contacts added this period`, `${tc.toLocaleString()} new contacts were created during this period out of ${tcAll.toLocaleString()} total.`, "High contact acquisition indicates effective inbound and outbound efforts.", ["Ensure new contacts are being nurtured with email sequences", "Review lead sources to double down on top-performing channels", "Segment new contacts by lifecycle stage for targeted outreach"], "New Contacts", tc, `${pct.toFixed(1)}% of all-time`));
    } else if (pct > 3) {
      recs.push(r("crm_growth", "trending_up", `Steady contact growth — ${tc.toLocaleString()} new contacts this period`, `${pct.toFixed(1)}% of your total contact base was added during this time frame.`, "Consistent contact acquisition builds your addressable audience over time.", ["Review top-performing lead generation channels", "Optimize landing pages and forms for higher conversion", "Consider content upgrades (guides, tools) to attract more leads"], "New Contacts", tc));
    } else if (tc > 0) {
      recs.push(r("crm_growth", "attention", `Low contact acquisition — only ${tc.toLocaleString()} new contacts this period`, `Only ${pct.toFixed(1)}% of your total database was added recently.`, "Slowing contact growth means your future pipeline may shrink.", ["Audit lead generation forms for friction or drop-off", "Launch new content offers (webinars, guides, product comparisons)", "Review paid campaigns driving form fills", "Ensure website CTAs are visible and compelling"], "New Contacts", tc));
    }
  } else if (tc != null && tc === 0) {
    recs.push(r("crm_growth", "action_required", "No new contacts this period — lead generation needs attention", "Zero new contacts were created during the selected date range.", "Without new contacts entering your CRM, your sales pipeline will eventually dry up.", ["Check if lead capture forms are working correctly", "Review traffic sources — are visitors reaching your site?", "Launch a lead magnet campaign (downloadable guide, free tool)", "Ensure HubSpot tracking code is installed on all key pages"], "New Contacts", 0));
  }

  return recs;
}

const STATUS_PRIORITY: Record<RecommendationStatus, number> = {
  action_required: 0,
  attention: 1,
  trending_down: 2,
  trending_up: 3,
  strong: 4,
};

export function generateRecommendations(
  tabName: string,
  metrics: Record<string, any>
): Recommendation[] {
  let recs: Recommendation[] = [];

  if (tabName === "ga4_gsc") {
    recs = [...ga4Rules(metrics), ...gscRules(metrics)];
  } else if (tabName === "crm_email") {
    recs = emailRules(metrics);
  } else if (tabName === "social_media") {
    recs = socialRules(metrics);
  } else if (tabName === "hubspot_crm") {
    recs = crmRules(metrics);
  }

  recs.sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
  return recs.slice(0, 6);
}
