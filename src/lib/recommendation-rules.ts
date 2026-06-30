export type RecommendationStatus = "strong" | "attention" | "action_required" | "trending_up" | "trending_down";

export interface InsightFinding {
  label: string;       // page slug, query, or channel name
  value: string;       // e.g. "4,200 impr · 1.2% CTR · pos 3.2"
  severity?: "high" | "medium" | "low";
}

export interface Recommendation {
  id: string;
  status: RecommendationStatus;
  headline: string;
  detail: string;
  whyItMatters: string;
  findings?: InsightFinding[];   // actual data rows shown inline in the card
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

function facebookRules(m: Record<string, any>): Recommendation[] {
  const recs: Recommendation[] = [];

  const er = m.engagementRate;
  if (er != null) {
    if (er < 0.5) recs.push(r("fb_eng", "action_required", "Facebook engagement is very low — Page content needs rethinking", `Your Facebook engagement rate of ${er}% is well below the B2B Page average of 0.5–1%.`, "Facebook's algorithm deprioritizes Pages with low engagement, reducing your organic reach over time.", ["Share more link posts to industry news and your own blog", "Post Facebook-native video — it gets 3–5× more organic reach than links", "Run a 'tag a friend' or poll post to spark interaction", "Reply to every comment within 2 hours to boost comment thread ranking"], "Engagement Rate", `${er}%`, "B2B Facebook Page average: 0.5–1%"));
    else if (er < 1.5) recs.push(r("fb_eng", "attention", `Facebook engagement of ${er}% is moderate — room to improve`, `You're above the floor but below the ideal range for B2B Facebook Pages.`, "Higher engagement signals Facebook to show your posts to a larger slice of your Page followers.", ["Test native video vs. image posts to find what your audience prefers", "Use Facebook Stories for behind-the-scenes content", "Post at peak times — Tuesday–Thursday 9am–1pm typically performs best for B2B"], "Engagement Rate", `${er}%`, "B2B target: 1.5%+"));
    else recs.push(r("fb_eng", "strong", `Strong Facebook engagement at ${er}%`, `Your Facebook content is performing above the B2B benchmark.`, "High engagement earns you more organic reach and builds community trust.", ["Amplify top-performing organic posts with a small paid boost", "Repurpose high-engagement posts into Reels or Stories", "Use Facebook Insights to double down on best-performing content types"], "Engagement Rate", `${er}%`, "B2B Facebook average: 0.5–1%"));
  }

  const fg = m.followerGrowth;
  if (fg != null) {
    if (fg < 0) recs.push(r("fb_followers", "action_required", "Facebook Page is losing followers — review content relevance", `Your Facebook follower count dropped by ${Math.abs(fg).toFixed(1)}% this period.`, "Declining followers shrinks your organic distribution — every post reaches fewer people.", ["Audit your last 20 posts — are they brand-relevant and valuable?", "Reduce overly promotional posts to no more than 20% of content", "Launch a Facebook 'Page Like' ad campaign with a small budget"], "Follower Growth", `${fg.toFixed(1)}%`));
    else if (fg < 1) recs.push(r("fb_followers", "attention", `Facebook follower growth is slow at ${fg.toFixed(1)}%`, "Facebook organic growth is challenging — you need consistent, shareable content.", "A larger Page audience means more reach for every post, compounding over time.", ["Cross-promote your Facebook Page in HubSpot email signatures", "Add a Facebook 'Like' button on your website and blog", "Invite email contacts to follow your Page via Facebook's invite tool"], "Follower Growth", `${fg.toFixed(1)}%`));
    else recs.push(r("fb_followers", "strong", `Facebook audience growing at ${fg.toFixed(1)}%`, "Your Page is gaining followers at a healthy rate.", "Growing Page likes expands your organic reach without additional ad spend.", ["Keep engaging new followers early — they're most likely to interact", "Use lookalike audiences based on your Page fans for targeted ads", "Pin a welcome post for new visitors to your Page"], "Follower Growth", `${fg.toFixed(1)}%`));
  }

  const reach = m.reach;
  const impressions = m.impressions;
  if (reach != null && impressions != null && reach > 0) {
    const freq = parseFloat((impressions / reach).toFixed(2));
    if (freq > 3) recs.push(r("fb_freq", "attention", `High ad/content frequency of ${freq}× — audience may be fatigued`, `Your content is being shown ${freq} times per unique person on average.`, "High frequency causes 'ad fatigue' — people stop engaging when they see the same content repeatedly.", ["Refresh creative assets — new images, copy, and formats", "Expand your target audience to reduce repetition", "Rotate content types: video one week, carousel the next"], "Impressions / Reach", `${freq}×`));
    else if (freq < 1.2) recs.push(r("fb_freq", "attention", `Low content frequency of ${freq}× — audience isn't seeing enough of you`, `Each person in your audience sees your content only ${freq} times on average.`, "Very low frequency means your brand isn't staying top-of-mind.", ["Increase posting cadence to 1 post per day on Facebook", "Use Stories and Reels in addition to feed posts to fill the frequency gap", "Consider a small retargeting campaign to re-engage Page visitors"], "Impressions / Reach", `${freq}×`));
    else recs.push(r("fb_freq", "strong", `Healthy content frequency of ${freq}× per person`, "Your content is reaching people at a good cadence — enough to build awareness without fatigue.", "The right frequency maximizes brand recall while minimizing unfollow risk.", ["Monitor engagement rate — if it drops, frequency may be creeping up", "Continue rotating content formats to keep things fresh"], "Impressions / Reach", `${freq}×`));
  }

  const topType = m.topPostType;
  if (topType) recs.push(r("fb_top_type", "trending_up", `Your best-performing Facebook format is ${topType}`, `${topType} posts are generating the most engagement on your Facebook Page.`, "Doubling down on your top-performing format is the fastest way to increase overall performance.", [`Create more ${topType} content — aim for at least 3 per week`, `Repurpose your best ${topType} posts into Facebook Ads`, "Study the specific ${topType} posts with highest reach to identify patterns"], "Top Post Type", topType));

  return recs;
}

function instagramRules(m: Record<string, any>): Recommendation[] {
  const recs: Recommendation[] = [];

  const er = m.engagementRate;
  if (er != null) {
    if (er < 1) recs.push(r("ig_eng", "action_required", "Instagram engagement is critically low — content needs a reset", `Your engagement rate of ${er}% is well below the Instagram B2B benchmark of 1–3%.`, "Instagram's algorithm gates reach behind engagement — low engagement creates a visibility spiral.", ["Post Reels exclusively for the next 2 weeks — they get the most algorithmic push", "Write longer, story-driven captions to encourage saves and shares", "Use 3–5 highly targeted hashtags (avoid banned or oversaturated ones)", "Add a clear question at the end of every caption to invite comments"], "Engagement Rate", `${er}%`, "Instagram B2B benchmark: 1–3%"));
    else if (er < 3) recs.push(r("ig_eng", "attention", `Instagram engagement of ${er}% — approaching benchmark but not there yet`, `You're generating engagement but below the ideal range for Instagram B2B accounts.`, "Every percentage point of engagement directly increases how many non-followers Instagram shows your content to.", ["Test carousel posts — they average 3× more engagement than single images", "Use Instagram Collab posts with partner brands for shared reach", "Add interactive elements to Stories: polls, quizzes, question boxes"], "Engagement Rate", `${er}%`, "Instagram B2B target: 3%+"));
    else recs.push(r("ig_eng", "strong", `Excellent Instagram engagement at ${er}%`, "Your content is performing above the Instagram B2B benchmark.", "Strong engagement unlocks the Explore page and Reels distribution — your content reaches beyond followers.", ["Submit your best-performing posts to Instagram's creator marketplace", "Test Instagram Shopping tags if you have direct-to-consumer products", "Maintain posting consistency — algorithms reward regular high-engagement accounts"], "Engagement Rate", `${er}%`, "Instagram B2B benchmark: 1–3%"));
  }

  const fg = m.followerGrowth;
  if (fg != null) {
    if (fg < 0) recs.push(r("ig_followers", "action_required", "Instagram is losing followers — pivot content strategy", `Follower count dropped ${Math.abs(fg).toFixed(1)}% — people are actively choosing to unfollow.`, "Instagram unfollows are a strong signal that content expectations aren't being met.", ["Review your last 30 posts — are they consistent in aesthetic and value?", "Stop posting overly promotional content — shift to educational or inspiring posts", "Check if posting frequency is too high — reduce to 4–5 posts/week if over-posting"], "Follower Growth", `${fg.toFixed(1)}%`));
    else if (fg < 1.5) recs.push(r("ig_followers", "attention", `Instagram follower growth is slow at ${fg.toFixed(1)}%`, "Slow growth on Instagram usually means content isn't reaching new audiences.", "Instagram follower growth is driven by Reels discovery — non-followers find you through Explore and Reels.", ["Post at least 2 Reels per week to trigger Explore-page distribution", "Use location tags on posts for local discovery", "Collaborate with complementary brands on Collab posts for shared audiences"], "Follower Growth", `${fg.toFixed(1)}%`));
    else recs.push(r("ig_followers", "strong", `Instagram growing at ${fg.toFixed(1)}% — great momentum`, "Your Instagram audience is expanding at a healthy rate.", "Sustained follower growth on Instagram compounds — a bigger audience means more reach for every future post.", ["Welcome new followers with an engaging Stories series", "Use new follower data to refine your audience targeting in paid campaigns", "Protect growth by maintaining posting consistency"], "Follower Growth", `${fg.toFixed(1)}%`));
  }

  const rc = m.reelCount;
  if (rc != null) {
    if (rc === 0) recs.push(r("ig_reels", "action_required", "No Reels posted — you're invisible to new Instagram audiences", "Instagram Reels are the primary discovery mechanism for reaching non-followers on Instagram.", "Without Reels, your content only reaches existing followers. Reels can reach 10–100× more people than feed posts.", ["Film a 15–30 second product showcase Reel this week", "Use trending audio — Instagram surfaces Reels with popular sounds to more users", "Repurpose existing product photos into a slideshow Reel with music"], "Reel Count", 0, "Recommended: 3–5 Reels/week"));
    else if (rc < 3) recs.push(r("ig_reels", "attention", `Only ${rc} Reel${rc === 1 ? "" : "s"} posted — increase Reels frequency for more reach`, `With ${rc} Reel${rc === 1 ? "" : "s"} this period, you're underutilizing Instagram's most powerful reach format.`, "Accounts that post 3+ Reels per week see 2–3× higher follower growth than feed-only accounts.", ["Batch-create 3–4 Reels at once using a single product shoot", "Use Instagram's built-in templates to make Reel creation faster", "Repurpose your top Facebook videos as Instagram Reels"], "Reel Count", rc, "Recommended: 3–5 Reels/week"));
    else recs.push(r("ig_reels", "strong", `Good Reels cadence with ${rc} Reels this period`, "You're using Instagram's most powerful discovery format consistently.", "Regular Reels posting keeps you in Instagram's distribution algorithm, reaching new audiences every week.", ["Test different Reel lengths — 7–15 seconds for max completion rate", "Add text overlays to Reels so they work without sound", "A/B test different cover images to improve Reels click-through"], "Reel Count", rc));
  }

  const wc = m.websiteClicks;
  if (wc != null) {
    if (wc < 10) recs.push(r("ig_clicks", "action_required", "Instagram bio link isn't driving website visits", `Only ${wc} website clicks from Instagram this period.`, "Instagram is a top-of-funnel channel — without bio link clicks, it's not converting awareness into website visits.", ["Use a link-in-bio tool (Linktree or Milkshake) to feature multiple landing pages", "Add 'Link in bio' CTA to every caption and Story", "Use Instagram Stories link stickers — they drive direct clicks without needing bio visits"], "Website Clicks", wc));
    else if (wc < 50) recs.push(r("ig_clicks", "attention", `${wc} bio link clicks from Instagram — more is possible`, "You're getting some website traffic from Instagram but there's room to grow.", "Each bio link click is a warm lead — someone interested enough to leave Instagram for your website.", ["Mention your bio link in Reels captions with a specific reason to click", "Update your bio link to point to a relevant campaign or seasonal page", "Post Stories with link stickers more frequently — at least 3×/week"], "Website Clicks", wc));
    else recs.push(r("ig_clicks", "strong", `${wc} website clicks from Instagram — strong conversion from social`, "Instagram is driving meaningful traffic to your website.", "Social traffic from Instagram tends to be high-intent — these visitors explored your profile before clicking.", ["Tag products in feed posts to enable Instagram Shopping", "Ensure the landing page your bio link points to is mobile-optimized", "Track Instagram traffic in Google Analytics with UTM parameters"], "Website Clicks", wc));
  }

  const topType = m.topPostType;
  if (topType) recs.push(r("ig_top_type", "trending_up", `Your top Instagram format is ${topType}`, `${topType} content is generating the most engagement on your Instagram account.`, "Instagram rewards accounts that master a specific format — your audience has shown you what they want.", [`Increase ${topType} posts to 4–5 per week`, `Study your top 5 ${topType} posts for common themes — caption length, time of day, topic`, "Test ${topType} content in Paid ads using your best organic performers as creative"], "Top Post Type", topType));

  return recs;
}

function crmRules(m: Record<string, any>): Recommendation[] {
  const recs: Recommendation[] = [];

  const tc = m.totalContacts;
  const tcAll = m.totalContactsAllTime;

  if (tc != null && tcAll != null && tcAll > 0 && tc <= tcAll) {
    // Only fire when data is consistent (period contacts ≤ all-time total)
    const pct = (tc / tcAll) * 100;
    if (pct > 10) {
      recs.push(r("crm_growth", "strong", `Strong lead acquisition — ${tc.toLocaleString()} new leads this period (${pct.toFixed(1)}% of database)`, `${tc.toLocaleString()} new contacts were created in this period, representing ${pct.toFixed(1)}% of your ${tcAll.toLocaleString()} all-time contacts.`, "High contact acquisition indicates effective inbound and outbound efforts.", ["Ensure new contacts are being nurtured with email sequences", "Review lead sources to double down on top-performing channels", "Segment new contacts by lifecycle stage for targeted outreach"], "New Contacts", tc, `${pct.toFixed(1)}% of database`));
    } else if (pct > 3) {
      recs.push(r("crm_growth", "trending_up", `Steady lead acquisition — ${tc.toLocaleString()} new leads this period`, `${pct.toFixed(1)}% of your ${tcAll.toLocaleString()} total contacts were added during this time frame.`, "Consistent contact acquisition builds your addressable audience over time.", ["Review top-performing lead generation channels", "Optimize landing pages and forms for higher conversion", "Consider content upgrades (guides, tools) to attract more leads"], "New Contacts", tc));
    } else if (tc > 0) {
      recs.push(r("crm_growth", "attention", `Low lead acquisition — only ${tc.toLocaleString()} new contacts this period`, `Only ${pct.toFixed(1)}% of your total database was added recently.`, "Slowing contact growth means your future pipeline may shrink.", ["Audit lead generation forms for friction or drop-off", "Launch new content offers (webinars, guides, product comparisons)", "Review paid campaigns driving form fills", "Ensure website CTAs are visible and compelling"], "New Contacts", tc));
    }
  } else if (tc != null && tc > 0 && (tcAll == null || tcAll === 0 || tc > tcAll)) {
    // All-time count unavailable or inconsistent — just report the raw count meaningfully
    recs.push(r("crm_growth", "trending_up", `${tc.toLocaleString()} new leads created this period`, `${tc.toLocaleString()} new contacts entered the CRM during this date range. All-time baseline data is still syncing.`, "Tracking new contact volume helps measure campaign and inbound effectiveness.", ["Ensure new contacts are enrolled in nurture sequences", "Review lead sources to identify top-performing channels"], "New Contacts", tc));
  } else if (tc != null && tc === 0) {
    recs.push(r("crm_growth", "action_required", "No new contacts this period — lead generation needs attention", "Zero new contacts were created during the selected date range.", "Without new contacts entering your CRM, your sales pipeline will eventually dry up.", ["Check if lead capture forms are working correctly", "Review traffic sources — are visitors reaching your site?", "Launch a lead magnet campaign (downloadable guide, free tool)", "Ensure HubSpot tracking code is installed on all key pages"], "New Contacts", 0));
  }

  return recs;
}



function slug(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/";
}

function num(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function summaryRules(m: Record<string, any>): Recommendation[] {
  const recs: Recommendation[] = [];

  const sc          = m.sessionsDelta as number | null;
  const impDelta    = m.totalImpressionsDelta as number | null;
  const clickDelta  = m.totalClicksDelta as number | null;
  const pos         = m.averagePosition as number | null;
  const ctr         = m.averageCTR as number | null;
  const osd         = m.organicSessionsDelta as number | null;
  const channels: any[]   = m.channels ?? [];
  const topQueries: any[] = m.topQueries ?? [];
  const topPages: any[]   = m.topLandingPages ?? [];
  const totalSessions     = m.totalSessions as number | null;
  const totalImpressions  = m.totalImpressions as number | null;
  const totalClicks       = m.totalClicks as number | null;

  // ── 1. SESSION DROP ───────────────────────────────────────────────────────
  if (sc != null && sc < -5) {
    const sortedCh = [...channels].sort((a, b) => (b.sessions ?? b.users ?? 0) - (a.sessions ?? a.users ?? 0));
    const topCh    = sortedCh[0];
    const organic  = channels.find((c: any) => /organic.search/i.test(c.channel ?? ""));
    const direct   = channels.find((c: any) => /direct/i.test(c.channel ?? ""));
    const paid     = channels.find((c: any) => /paid/i.test(c.channel ?? ""));

    const chFindings: InsightFinding[] = sortedCh.slice(0, 5).map((c: any) => ({
      label: c.channel ?? "Unknown",
      value: `${num(c.sessions ?? c.users ?? 0)} sessions`,
      severity: c === sortedCh[0] ? "high" : "low",
    }));

    const actions: string[] = [];
    if (organic) {
      actions.push(`Organic Search brought ${num(organic.sessions ?? organic.users ?? 0)} sessions — if this dropped vs. prior period, it is your SEO issue. Open Google Search Console → Performance → compare current vs. previous ${Math.round(Math.abs(sc))} days`);
    }
    if (direct) {
      actions.push(`Direct traffic is ${num(direct.sessions ?? direct.users ?? 0)} sessions — a Direct drop means either (a) your GA4 tag stopped firing or (b) branded search volume declined. Check GA4 → Admin → Data Streams → DebugView to confirm the tag is live`);
    }
    if (paid) {
      actions.push(`Paid Search contributed ${num(paid.sessions ?? paid.users ?? 0)} sessions — if budget was cut or ads paused this period, that explains the drop. Check your Google Ads dashboard for campaign status`);
    }
    if (!organic && !direct && !paid && topCh) {
      actions.push(`Your top channel is ${topCh.channel} at ${num(topCh.sessions ?? topCh.users ?? 0)} sessions. Compare this channel against the same period last month to isolate the decline`);
    }
    if (impDelta != null && impDelta < -10) {
      actions.push(`Search impressions also dropped ${Math.abs(impDelta).toFixed(0)}% — this confirms an SEO/indexing issue is part of the session decline, not just a tracking problem`);
    }

    recs.push({
      id: "summary_sessions_drop",
      status: sc < -15 ? "action_required" : "attention",
      headline: `Sessions are down ${Math.abs(sc).toFixed(1)}%${totalSessions ? ` — ${num(totalSessions)} total this period` : ""}`,
      detail: `Traffic fell ${Math.abs(sc).toFixed(1)}% comparing the first and second half of this period.${chFindings.length ? ` Here is the channel breakdown — the channel that declined most is causing the drop.` : ""} Before escalating, rule out a GA4 tracking gap: if the tag stopped firing for even a few days, sessions disappear from the report even though real visitors came.`,
      whyItMatters: "Sessions are the foundation — every other metric flows from traffic.",
      findings: chFindings,
      actions,
      metric: "Sessions Δ", currentValue: `${sc.toFixed(1)}%`,
    });
  } else if (sc != null && sc >= 10) {
    const topCh = [...channels].sort((a, b) => (b.sessions ?? b.users ?? 0) - (a.sessions ?? a.users ?? 0))[0];
    recs.push({
      id: "summary_sessions_up",
      status: "strong",
      headline: `Traffic grew ${sc.toFixed(1)}%${totalSessions ? ` — ${num(totalSessions)} sessions this period` : ""}`,
      detail: `Sessions increased ${sc.toFixed(1)}% in the second half of this period.${topCh ? ` Top channel: ${topCh.channel} with ${num(topCh.sessions ?? topCh.users ?? 0)} sessions.` : ""} Identify what drove this before the conditions change.`,
      whyItMatters: "Growth compounds — double down on whatever is working.",
      findings: channels.slice(0, 4).map((c: any) => ({ label: c.channel, value: `${num(c.sessions ?? c.users ?? 0)} sessions` })),
      actions: [
        topCh ? `${topCh.channel} is your top channel at ${num(topCh.sessions ?? topCh.users ?? 0)} sessions — invest more here` : "Identify your top-growing channel in GA4 → Acquisition",
        "Find the top landing pages driving this growth — those are your best-performing content assets",
        "Replicate the content format or campaign driving the spike for other brands",
      ],
      metric: "Sessions Δ", currentValue: `+${sc.toFixed(1)}%`,
    });
  }

  // ── 2. SEARCH IMPRESSIONS DROP ────────────────────────────────────────────
  if (impDelta != null && impDelta < -10) {
    const highImpLowCTR = [...topPages]
      .filter((p: any) => (p.impressions ?? 0) > 50)
      .sort((a: any, b: any) => a.ctr - b.ctr)
      .slice(0, 5);

    const pageFindings: InsightFinding[] = highImpLowCTR.map((p: any) => ({
      label: slug(p.page),
      value: `${num(p.impressions)} impr · ${p.ctr}% CTR · pos ${p.position}`,
      severity: p.ctr < 1.5 ? "high" : p.ctr < 3 ? "medium" : "low",
    }));

    const actions: string[] = [];
    if (highImpLowCTR.length > 0) {
      const worst = highImpLowCTR[0];
      const expectedClicks = Math.round(worst.impressions * 0.04);
      const actualClicks   = Math.round(worst.impressions * (worst.ctr / 100));
      actions.push(`"${slug(worst.page)}" gets ${num(worst.impressions)} impressions but only ${worst.ctr}% CTR — at a healthy 4% CTR that page should deliver ~${num(expectedClicks)} clicks/period instead of ${num(actualClicks)}. Rewrite its title tag to be more specific and keyword-forward`);
    }
    if (highImpLowCTR.length > 1) {
      actions.push(`The next ${Math.min(highImpLowCTR.length - 1, 3)} pages with the same problem: ${highImpLowCTR.slice(1, 4).map(p => `"${slug(p.page)}" (${p.ctr}% CTR, ${num(p.impressions)} impr)`).join(", ")} — prioritise these title tag rewrites`);
    }
    if (pos != null && pos < 15) {
      actions.push(`Average position is ${pos.toFixed(1)} — rankings are intact. This impressions drop is most likely Google temporarily reducing crawl frequency after site changes (re-indexing). Submit your sitemap in GSC → Sitemaps to speed up re-indexing`);
    } else {
      actions.push(`Check GSC → Coverage → Indexing report to confirm your key pages are still indexed — a de-indexed page disappears from impressions completely`);
    }

    recs.push({
      id: "summary_impressions_drop",
      status: "action_required",
      headline: `Search impressions dropped ${Math.abs(impDelta).toFixed(1)}%${totalImpressions ? ` — ${num(totalImpressions)} total this period` : ""}`,
      detail: `Impressions fell ${Math.abs(impDelta).toFixed(1)}% in the second half of this period — fewer searches are showing your pages.${pageFindings.length ? ` Below are your highest-impression pages sorted by lowest CTR. These pages have the visibility but are not getting the clicks — fixing their title tags recovers traffic without needing better rankings.` : ""} ${pos != null && pos < 15 ? `Average position (${pos.toFixed(1)}) is holding on page 1–2, which means rankings are intact — this is likely a crawl frequency issue, not a ranking loss.` : ""}`,
      whyItMatters: "Impressions are the upstream metric — fixing them unlocks clicks and sessions.",
      findings: pageFindings,
      actions,
      metric: "Impressions Δ", currentValue: `${impDelta.toFixed(1)}%`,
    });
  } else if (impDelta != null && impDelta >= 15) {
    recs.push({
      id: "summary_impressions_up",
      status: "strong",
      headline: `Search impressions up ${impDelta.toFixed(1)}%${totalImpressions ? ` — ${num(totalImpressions)} total` : ""}`,
      detail: `More searches are surfacing your pages. The next step is converting those impressions into clicks by improving CTR on your highest-impression pages.`,
      whyItMatters: "Growing impressions × better CTR = compounding traffic gains.",
      findings: topPages.slice(0, 4).map((p: any) => ({ label: slug(p.page), value: `${num(p.impressions)} impr · ${p.ctr}% CTR · pos ${p.position}`, severity: p.ctr < 3 ? "medium" as const : "low" as const })),
      actions: [
        topPages.length > 0 ? `"${slug(topPages[0].page)}" is your most-visible page at ${num(topPages[0].impressions)} impressions — its CTR is ${topPages[0].ctr}%${topPages[0].ctr < 4 ? `, which means rewriting its title tag could unlock ${num(Math.round(topPages[0].impressions * 0.04) - Math.round(topPages[0].impressions * topPages[0].ctr / 100))} extra clicks per period` : ", which is healthy"}` : "Find your top impression pages in GSC and optimise their CTR",
        "Add FAQ schema to category and product pages — rich snippets lift CTR by 20–30% with no ranking change needed",
      ],
      metric: "Impressions Δ", currentValue: `+${impDelta.toFixed(1)}%`,
    });
  }

  // ── 3. CLICKS DROP (CTR problem when impressions are fine) ────────────────
  if (clickDelta != null && clickDelta < -10 && (impDelta == null || impDelta > -5)) {
    const lowCTR = [...topQueries]
      .filter((q: any) => (q.impressions ?? 0) > 30)
      .sort((a: any, b: any) => a.ctr - b.ctr)
      .slice(0, 5);

    const qFindings: InsightFinding[] = lowCTR.map((q: any) => ({
      label: `"${q.query}"`,
      value: `${num(q.impressions)} impr · ${q.ctr}% CTR · pos ${q.position}`,
      severity: q.ctr < 1.5 ? "high" : q.ctr < 3 ? "medium" : "low",
    }));

    const actions: string[] = [];
    if (lowCTR.length > 0) {
      const worst = lowCTR[0];
      actions.push(`"${worst.query}" gets ${num(worst.impressions)} impressions at pos ${worst.position} but only ${worst.ctr}% CTR — find the page ranking for this query and rewrite its title tag to include "${worst.query}" in the first 55 characters`);
    }
    if (lowCTR.length > 1) {
      actions.push(`Queries also losing clicks: ${lowCTR.slice(1, 4).map((q: any) => `"${q.query}" (${q.ctr}% CTR, pos ${q.position})`).join(", ")} — same fix: stronger title tags and meta descriptions`);
    }
    actions.push(`Add FAQ schema markup to your top-ranked pages — this creates rich snippets in search results which typically lift CTR by 20–40% with zero ranking change needed`);

    recs.push({
      id: "summary_clicks_drop",
      status: "action_required",
      headline: `Clicks dropped ${Math.abs(clickDelta).toFixed(1)}% while impressions held${totalClicks ? ` — ${num(totalClicks)} total clicks` : ""}`,
      detail: `The site is still appearing in searches but fewer people are clicking. Impressions are stable, so rankings are not the issue — the problem is the title tags and meta descriptions are not compelling enough to earn the click. Here are the queries with the most impressions but lowest CTR:`,
      whyItMatters: "Clicks are the conversion from visibility to traffic — a CTR fix is free incremental traffic.",
      findings: qFindings,
      actions,
      metric: "Clicks Δ", currentValue: `${clickDelta.toFixed(1)}%`,
    });
  }

  // ── 4. PAGE 1 RANKINGS WITH LOW CTR — quickest win ────────────────────────
  const quickWins = topPages
    .filter((p: any) => p.position <= 10 && p.ctr < 4 && (p.impressions ?? 0) > 100)
    .sort((a: any, b: any) => b.impressions - a.impressions)
    .slice(0, 4);

  if (quickWins.length > 0) {
    const totalMissedClicks = quickWins.reduce((sum: number, p: any) => {
      return sum + Math.round(p.impressions * 0.04) - Math.round(p.impressions * p.ctr / 100);
    }, 0);

    recs.push({
      id: "summary_page_ctr",
      status: "attention",
      headline: `${quickWins.length} page-1 rankings are leaving ~${num(totalMissedClicks)} clicks on the table`,
      detail: `These pages already rank on page 1 of Google but have low click-through rates — meaning you have the ranking without the traffic. At a healthy 4% CTR they should collectively deliver ${num(totalMissedClicks)} more clicks per period. Fixing title tags on these pages is the highest-ROI action available: no link building, no content creation, just better copy.`,
      whyItMatters: "Page 1 rankings are earned — not converting them to clicks wastes the SEO investment.",
      findings: quickWins.map((p: any) => {
        const missed = Math.round(p.impressions * 0.04) - Math.round(p.impressions * p.ctr / 100);
        return {
          label: slug(p.page),
          value: `pos ${p.position} · ${p.ctr}% CTR · ${num(p.impressions)} impr · missing ~${num(missed)} clicks`,
          severity: p.ctr < 1.5 ? "high" as const : p.ctr < 3 ? "medium" as const : "low" as const,
        };
      }),
      actions: [
        ...quickWins.slice(0, 3).map((p: any) => {
          const missed = Math.round(p.impressions * 0.04) - Math.round(p.impressions * p.ctr / 100);
          return `"${slug(p.page)}" — pos ${p.position}, ${p.ctr}% CTR, ${num(p.impressions)} impressions. Rewrite title tag to be specific and keyword-led. At 4% CTR this page alone recovers ~${num(missed)} extra clicks per period`;
        }),
        "Pattern for every title rewrite: [Primary Keyword] — [Specific Benefit or Use Case] | [Brand Name]. Keep under 60 characters",
      ],
      metric: "Missed clicks", currentValue: `~${num(totalMissedClicks)}`,
    });
  }

  // ── 5. POSITION DIVERGENCE (rankings intact) ──────────────────────────────
  if (pos != null && impDelta != null && impDelta < -10 && pos < 15) {
    recs.push({
      id: "summary_pos_divergence",
      status: "attention",
      headline: `Rankings are holding at pos ${pos.toFixed(1)} — impressions drop is crawl frequency, not ranking loss`,
      detail: `Average position is ${pos.toFixed(1)} (page 1–2) while impressions fell ${Math.abs(impDelta).toFixed(1)}%. When position holds but impressions fall, it means Google temporarily reduced how often it crawls the site — common after a new site launch or structural change. Rankings are not lost. This self-corrects in 4–8 weeks as Googlebot re-crawls and re-indexes the site.`,
      whyItMatters: "Misreading this as a ranking crisis leads to unnecessary pivots. Share the context with leadership before they see the numbers.",
      actions: [
        `Share this context with your team: "Average position is ${pos.toFixed(1)} — rankings are intact. The ${Math.abs(impDelta).toFixed(0)}% impression drop reflects Google reducing crawl frequency after recent site changes, not lost rankings."`,
        `Submit your sitemap in Google Search Console → Sitemaps to accelerate re-indexing and recover impressions faster`,
        `Monitor weekly — if position rises above 20 while impressions stay low, then investigate specific page rankings`,
      ],
      metric: "Position vs Impressions", currentValue: `Pos ${pos.toFixed(1)} / Impr ${impDelta.toFixed(1)}%`,
    });
  }

  // ── 6. CTR ────────────────────────────────────────────────────────────────
  if (ctr != null && ctr < 2.5 && quickWins.length === 0) {
    const worstPages = [...topPages].sort((a: any, b: any) => a.ctr - b.ctr).slice(0, 3);
    recs.push({
      id: "summary_ctr",
      status: "action_required",
      headline: `Average CTR is ${ctr}% — roughly half what it should be`,
      detail: `At ${ctr}% CTR, the site appears in searches but is not getting the clicks the rankings deserve. B2B benchmark is 3–5%. The fastest fix is rewriting title tags on your highest-impression pages — no ranking improvement needed.`,
      whyItMatters: "Every 1% of CTR improvement on a page with 1,000 impressions = 10 extra free clicks per period.",
      findings: worstPages.map((p: any) => ({
        label: slug(p.page),
        value: `${num(p.impressions)} impr · ${p.ctr}% CTR · pos ${p.position}`,
        severity: p.ctr < 1.5 ? "high" as const : "medium" as const,
      })),
      actions: [
        worstPages.length > 0 ? `Start with "${slug(worstPages[0].page)}" — ${num(worstPages[0].impressions)} impressions at ${worstPages[0].ctr}% CTR. Rewrite title tag to: [Main Keyword] — [Specific Benefit] | [Brand]` : "Rewrite title tags on your 5 highest-impression pages first",
        "Add meta descriptions to every indexed page — Google uses these in snippets, and a good description adds 0.5–1% CTR",
        "Add FAQ schema to product and category pages — this creates rich snippets which typically lift CTR 20–40%",
      ],
      benchmark: "B2B target: 3–5%",
      metric: "Avg CTR", currentValue: `${ctr}%`,
    });
  }

  // ── 7. ORGANIC GROWTH ─────────────────────────────────────────────────────
  if (osd != null && osd >= 10) {
    const organicCh = channels.find((c: any) => /organic.search/i.test(c.channel ?? ""));
    recs.push({
      id: "summary_organic_up",
      status: "strong",
      headline: `Organic traffic up ${osd.toFixed(1)}%${organicCh ? ` — ${num(organicCh.sessions ?? organicCh.users ?? 0)} organic sessions` : ""}`,
      detail: `Organic sessions grew ${osd.toFixed(1)}% in the second half of this period. Rankings are holding and Google's confidence in the site is increasing. This is the compounding effect of SEO — earlier work is now paying off.`,
      whyItMatters: "Organic traffic is the only channel that grows without proportional cost — compound it.",
      findings: topPages.slice(0, 4).map((p: any) => ({ label: slug(p.page), value: `${num(p.clicks)} clicks · pos ${p.position}` })),
      actions: [
        topPages.length > 0 ? `"${slug(topPages[0].page)}" is your top organic page at ${num(topPages[0].clicks)} clicks — expand its content to target related search queries and capture more of that ranking` : "Identify your top organic pages and expand their content",
        "Build internal links from new pages to your top organic pages — this passes ranking authority and lifts all boats",
        "Create content in the same topic cluster as your growing pages to compound the gains",
      ],
      metric: "Organic Δ", currentValue: `+${osd.toFixed(1)}%`,
    });
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
  } else if (tabName === "summary") {
    recs = summaryRules(metrics);
  } else if (tabName === "crm_email") {
    recs = emailRules(metrics);
  } else if (tabName === "social_facebook") {
    recs = facebookRules(metrics);
  } else if (tabName === "social_instagram") {
    recs = instagramRules(metrics);
  } else if (tabName === "hubspot_crm") {
    recs = crmRules(metrics);
  }

  recs.sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
  return recs.slice(0, 6);
}
