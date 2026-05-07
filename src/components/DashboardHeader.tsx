import { Brand } from "@/lib/brands";
import { BrandSwitcher } from "./BrandSwitcher";
import { DateRangePicker } from "./DateRangePicker";
import { UserMenu } from "./UserMenu";
import { HelpButton } from "./HelpButton";

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
    <header className="bg-primary px-4 md:px-6 py-3 md:py-0 md:relative" style={{ minHeight: undefined }}>
      {/* ── Mobile layout (< md): two rows ── */}
      <div className="flex flex-col gap-2 md:hidden">
        {/* Row 1: logo + title centred */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <img
            src={ABG_LOGO_URL}
            className="h-auto w-[160px]"
            alt="American Bath Group"
          />
          <p className="text-[10px] font-bold tracking-widest text-primary-foreground/80 uppercase">
            US Wholesale Digital Dashboard
          </p>
        </div>
        {/* Row 2: brand switcher | date + icons */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <button
              onClick={onLogoClick}
              className="text-[11px] font-semibold text-primary-foreground/70 hover:text-primary-foreground transition-colors"
              title="Go to Read Me"
            >
              Read Me
            </button>
            <span className="h-4 w-px bg-primary-foreground/20" />
            <BrandSwitcher selectedBrand={selectedBrand} onSelect={onBrandChange} />
          </div>
          <div className="flex items-center gap-2">
            <DateRangePicker from={dateFrom} to={dateTo} onChange={onDateChange} />
            <HelpButton variant="header" />
            <UserMenu />
          </div>
        </div>
      </div>

      {/* ── Desktop layout (≥ md): original single row ── */}
      <div className="hidden md:flex items-center justify-between" style={{ padding: "24px 0 20px", minHeight: "120px" }}>
        <div className="flex items-center gap-6">
          <button
            onClick={onLogoClick}
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
            title="Go to Read Me"
          >
            <span className="text-sm font-semibold text-primary-foreground">
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
            className="w-[280px] md:w-[350px] h-auto"
            alt="American Bath Group"
          />
          <h1 className="text-sm font-bold tracking-wide text-primary-foreground lg:text-lg whitespace-nowrap">
            US WHOLESALE DIGITAL DASHBOARD
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <DateRangePicker from={dateFrom} to={dateTo} onChange={onDateChange} />
          <HelpButton variant="header" />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}