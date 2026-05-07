import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricTooltipProps {
  description: string;
  children: React.ReactNode;
}

export function MetricTooltip({ description, children }: MetricTooltipProps) {
  return (
    <TooltipProvider delayDuration={2000}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default inline-block w-fit">{children}</span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="w-[220px] text-xs leading-relaxed text-left font-normal normal-case tracking-normal"
        >
          {description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ── Metric definitions ─────────────────────────────────────────── */

export const METRIC_DEFINITIONS: Record<string, string> = {
  // GA4 stat cards
  "Sessions":
    "Total visits to your site. A session starts when a user arrives and ends after 30 minutes of inactivity.",
  "Organic Sessions":
    "Visits that came from unpaid search engine results (Google, Bing, etc.). A key indicator of SEO health.",
  "Page Views":
    "Total pages viewed, including repeat views of the same page. Shows overall content consumption.",
  "1-Day Active Users":
    "Unique users who visited your site in the last 24 hours. A real-time pulse on daily engagement.",

  // Traffic Acquisition table columns
  "Channel Group":
    "The marketing channel that drove each visit — e.g. Direct, Organic Search, Paid Search, Email.",
  "Engaged Sessions":
    "Sessions lasting 10+ seconds, with a conversion event, or with 2+ page views. Measures quality traffic — not just visits.",
  "Eng. Rate":
    "Percentage of sessions that were engaged. Higher is better — it means visitors found your content relevant.",
  "Avg. Time":
    "Average time spent per session. Longer durations generally indicate deeper content engagement.",
  "Events / Session":
    "Average number of interactions per session — clicks, scrolls, form submissions, video plays, etc.",
  "Event Count":
    "Total tracked interactions across all sessions from this channel.",
  "New Users":
    "First-time visitors from this channel. Indicates reach and audience growth.",
  "Returning":
    "Users who have visited before from this channel. Shows loyalty and repeat engagement.",

  // GSC stat cards
  "Total Clicks":
    "Number of times users clicked through to your site from Google Search results.",
  "Impressions":
    "How many times your site appeared in search results, whether clicked or not.",
  "Avg CTR":
    "Click-through rate — clicks divided by impressions. Shows how compelling your search listings are to users.",
  "Avg Position":
    "Your average ranking position in search results. Position 1 is the top result. Lower number = better ranking.",
};
