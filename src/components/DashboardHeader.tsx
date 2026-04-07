import { Brand } from "@/lib/brands";
import { BrandSwitcher } from "./BrandSwitcher";
import { DateRangePicker } from "./DateRangePicker";
import { UserMenu } from "./UserMenu";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ABG_LOGO_URL =
  "https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-white-horizontal.png";

interface DashboardHeaderProps {
  selectedBrand: Brand;
  onBrandChange: (brand: Brand) => void;
  dateFrom: Date;
  dateTo: Date;
  onDateChange: (from: Date, to: Date) => void;
  onLogoClick?: () => void;
}

export function DashboardHeader({
  selectedBrand,
  onBrandChange,
  dateFrom,
  dateTo,
  onDateChange,
  onLogoClick,
}: DashboardHeaderProps) {
  return (
    <header
      className="sticky top-0 z-50 bg-primary px-6 relative"
      style={{ padding: "24px 24px 20px 24px", minHeight: "120px" }}
    >
      <div className="flex items-center justify-between h-full">
        <div className="flex items-center gap-6">
          <button
            onClick={onLogoClick}
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
            title="Go to Read Me"
          >
            <span className="text-sm font-semibold text-primary-foreground hidden sm:inline">
              Read Me
            </span>
          </button>
          <div className="h-6 w-px bg-primary-foreground/20" />
          <BrandSwitcher selectedBrand={selectedBrand} onSelect={onBrandChange} />
        </div>

        {/* Center logo + title */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
          <img
            src={ABG_LOGO_URL}
            className="w-[200px] sm:w-[280px] md:w-[350px] h-auto"
            alt="American Bath Group"
          />
          <h1 className="text-sm font-bold tracking-wide text-primary-foreground lg:text-lg whitespace-nowrap">
            US WHOLESALE DIGITAL DASHBOARD
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <DateRangePicker from={dateFrom} to={dateTo} onChange={onDateChange} />

          {/* Help / Inquiry Button */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href="mailto:mali@americanbathgroup.com?subject=Dashboard%20Inquiry&body=Hi%20Mostafa%2C%0A%0AI%20have%20a%20question%20or%20issue%20regarding%20the%20ABG%20Digital%20Dashboard%3A%0A%0A"
                  className="flex items-center justify-center h-8 w-8 rounded-full bg-primary-foreground/15 hover:bg-primary-foreground/25 transition-colors"
                  title="Get Help"
                >
                  <HelpCircle className="h-5 w-5 text-primary-foreground" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs max-w-[200px] text-center">
                Questions, data issues, or feedback? Click to email the dashboard team.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <UserMenu />
        </div>
      </div>
    </header>
  );
}