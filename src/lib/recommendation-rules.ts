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

function summaryRules(m: Record<string, any>): Recommendation[] {
  const recs: Recommendation[] = [];

  // ── Traffic context ───────────────────────────────────────────────────────
  const sc = m.sessionsDelta;
  if (sc != null && sc < -10) {
    recs.push(r(
      "summary_sessions_drop", "attention",
      `Traffic is down ${Math.abs(sc).toFixed(1)}% — verify context before sharing`,
      `Sessions dropped ${Math.abs(sc).toFixed(1)}% vs. the prior period. Before escalating, rule out known factors: a tracking code gap (e.g. GA4 tag missing for several days) can fully explain this in the data without any real traffic loss. A recent site migration or redesign also typically causes Google to temporarily re-crawl and re-index — impressions and sessions may lag 2–4 weeks during that process.`,
      "Presenting red metrics without context can alarm stakeholders unfamiliar with how new site launches and tracking interruptions affect data. Annotate the report with any known gaps before sharing with leadership.",
      [
        "Check GA4 → Admin → Data Streams → confirm tag was firing continuously during the period",
        "Cross-reference with server logs or Cloudflare analytics — if raw visits are healthy but GA4 is low, the tag was the issue",
        "If the site recently launched or migrated, note 'Post-launch re-indexing period — Google typically stabilises in 3–6 weeks'",
        "Add a written annotation to this report before sending to Brad or leadership",
      ],
      "Sessions Δ", `${sc.toFixed(1)}%`
    ));
  }

  // ── Impressions / re-indexing context ────────────────────────────────────
  const impDelta = m.totalImpressionsDelta;
  if (impDelta != null && impDelta < -15) {
    recs.push(r(
      "summary_impressions_drop", "attention",
      `Search impressions down ${Math.abs(impDelta).toFixed(1)}% — likely re-indexing, not a ranking crisis`,
      `Impressions fell ${Math.abs(impDelta).toFixed(1)}%. When average position is simultaneously trending up (or holding), falling impressions usually means Google has temporarily reduced crawl frequency while re-evaluating the site — common after a new site launch. This is not the same as losing rankings; it typically self-corrects within 4–8 weeks as Googlebot re-crawls and re-indexes the new URL structure.`,
      "Conflating re-indexing dips with real ranking losses leads to unnecessary panic and premature SEO pivots. The right action is to monitor, not to make sweeping content changes.",
      [
        "Check Google Search Console → Pages → Indexing to confirm how many pages are indexed vs. prior period",
        "Submit updated sitemap in GSC if not already done after site launch",
        "Monitor week-over-week for stabilisation — look for impressions recovering while position holds",
        "Note this context clearly in the report: 'GSC impressions dip consistent with post-launch re-indexing. Monitoring weekly.'",
      ],
      "Impressions Δ", `${impDelta.toFixed(1)}%`
    ));
  }

  // ── Position vs impressions divergence — flag it ─────────────────────────
  const pos = m.averagePosition;
  if (pos != null && impDelta != null && impDelta < -10 && pos < 15) {
    recs.push(r(
      "summary_pos_divergence", "attention",
      "Position holding while impressions fall — a re-indexing pattern, not a ranking loss",
      `Average position is ${pos.toFixed(1)} (page 1–2) while impressions are declining. These two signals normally move together — when you lose rankings, both drop. When only impressions drop while position holds, it almost always means Google reduced crawl volume temporarily (re-indexing) or there was a tracking gap. The rankings themselves are intact.`,
      "This divergence is actually reassuring — it means the underlying SEO work is holding. The report should present this as a data collection / indexing story, not an SEO failure.",
      [
        "Surface this divergence explicitly in the report with a one-line explanation for Brad",
        "Continue monitoring: if position begins to rise significantly (18+) alongside low impressions, then investigate rankings",
        "Ask Chris to confirm re-indexing hypothesis with any crawl data or Search Console coverage reports",
      ],
      "Position vs Impressions", `Pos. ${pos.toFixed(1)} / Impr. ${impDelta.toFixed(1)}%`
    ));
  }

  // ── CTR context ──────────────────────────────────────────────────────────
  const ctr = m.averageCTR;
  if (ctr != null) {
    if (ctr < 2) {
      recs.push(r(
        "summary_ctr", "action_required",
        "Search CTR is very low — meta titles need improvement",
        `Average CTR of ${ctr}% means searchers see the brand in results but rarely click. For a post-launch site, this is often because new page titles haven't been crawled and updated in Google's index yet — allow 2–4 weeks. If CTR remains low after that, titles and meta descriptions need reworking.`,
        "Low CTR wastes every impression earned through SEO. Even small CTR improvements multiply across all ranking keywords.",
        [
          "Rewrite page titles to lead with the primary keyword and a clear value proposition",
          "Add unique meta descriptions to the top 20 pages — GSC → Performance → Pages to find them",
          "Check if new page titles have been indexed: search 'site:domain.com' in Google and spot-check titles",
        ],
        "Average CTR", `${ctr}%`, "Target: 3–5%"
      ));
    } else {
      recs.push(r(
        "summary_ctr", "strong",
        `Search CTR of ${ctr}% is healthy`,
        `Click-through rate is in a good range. Even during an indexing transition, searchers are choosing to click when the site appears.`,
        "Maintaining strong CTR during a post-launch period protects traffic from not falling further than necessary.",
        ["Maintain current title and description quality", "Focus effort on recovering impression volume"],
        "Average CTR", `${ctr}%`
      ));
    }
  }

  // ── Report annotation reminder ────────────────────────────────────────────
  const hasRedMetrics = (sc != null && sc < -10) || (impDelta != null && impDelta < -10);
  if (hasRedMetrics) {
    recs.push(r(
      "summary_annotate", "action_required",
      "Add context annotations before sharing this report with stakeholders",
      "This report currently shows several red metrics. Per the team discussion, data alone is not enough — each significant drop needs a plain-English explanation attached. Stakeholders unfamiliar with post-launch behaviour will interpret red as 'something is broken' without context. The recommended annotation: 'Metrics reflect a combination of: (1) tracking code gap [dates], (2) post-launch Google re-indexing period. Both are expected and being monitored.'",
      "Presenting uncommented red metrics to leadership creates unnecessary alarm and undermines trust in the data function. One sentence of context per metric changes the entire conversation.",
      [
        "Draft a 2–3 sentence context note at the top of the report email",
        "Confirm exact tracking gap dates with Chris and include them explicitly",
        "Set a 4-week monitoring window — report back once indexing stabilises",
        "Consider adding an 'Annotations' section to the Summary Report tab for recurring context notes",
      ],
      "Report readiness", "Action needed"
    ));
  }

  // ── Organic growth — positive signal ─────────────────────────────────────
  const osd = m.organicSessionsDelta;
  if (osd != null && osd >= 10) {
    recs.push(r(
      "summary_organic_up", "strong",
      `Organic traffic growing at +${osd.toFixed(1)}% — SEO is compounding`,
      `Organic sessions are up ${osd.toFixed(1)}% despite the broader indexing transition. This is a strong positive signal — rankings are intact and traffic is recovering. Double down on content that is working.`,
      "Organic growth is the most durable form of traffic — compounding rankings mean future content gets more reach at no additional cost.",
      [
        "Identify which pages are driving organic growth and expand their content",
        "Build internal links from those pages to underperforming ones",
        "Consider creating supporting blog or resource content for top-performing keyword clusters",
      ],
      "Organic Sessions Δ", `+${osd.toFixed(1)}%`
    ));
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
