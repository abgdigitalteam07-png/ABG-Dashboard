import { Calendar, FlaskConical } from "lucide-react";
import { DEMO_BRAND_NAME, demoDateRange, TABLEAU } from "@/lib/demoData";

const ABG_LOGO_URL =
  "https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-white-horizontal.png";

export function DemoHeader() {
  return (
    <header
      className="bg-primary px-6 relative"
      style={{ padding: "24px 24px 20px 24px", minHeight: "120px" }}
    >
      <div className="flex items-center justify-between h-full">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-primary-foreground/15 bg-primary-foreground/5 px-3 py-2">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white"
              style={{ background: TABLEAU.blue }}
            >
              M
            </span>
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-wider text-primary-foreground/60">Brand</p>
              <p className="text-sm font-bold text-primary-foreground">{DEMO_BRAND_NAME}</p>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow"
            style={{ background: TABLEAU.orange }}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Demo
          </span>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
          <img src={ABG_LOGO_URL} className="w-[350px] h-auto" alt="American Bath Group" />
          <h1 className="text-lg font-bold tracking-wide text-primary-foreground whitespace-nowrap">
            US WHOLESALE DIGITAL DASHBOARD
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <p className="text-[10px] uppercase tracking-wider text-primary-foreground/60">Last Updated</p>
            <p className="text-xs font-bold text-primary-foreground">May 25, 2026</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-primary-foreground/15 bg-primary-foreground/5 px-3 py-2 text-primary-foreground">
            <Calendar className="h-4 w-4 opacity-70" />
            <span className="text-xs font-semibold">{demoDateRange.label}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
