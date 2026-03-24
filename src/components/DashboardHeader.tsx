import abgLogo from "@/assets/abg-logo-white.png";
import { Brand } from "@/lib/brands";
import { BrandSwitcher } from "./BrandSwitcher";
import { DateRangePicker } from "./DateRangePicker";

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
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between bg-primary px-6 relative">
      <div className="flex items-center gap-6">
        <button onClick={onLogoClick} className="flex items-center gap-3 transition-opacity hover:opacity-80" title="Go to Read Me">
          <img src={abgLogo} className="h-8 w-auto" alt="American Bath Group" />
          <span className="text-sm font-semibold text-primary-foreground hidden sm:inline">Read Me</span>
        </button>
        <div className="h-6 w-px bg-primary-foreground/20" />
        <BrandSwitcher selectedBrand={selectedBrand} onSelect={onBrandChange} />
      </div>
      <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-bold tracking-wide text-primary-foreground lg:text-lg">
        US WHOLESALE DIGITAL DASHBOARD
      </h1>
      <DateRangePicker from={dateFrom} to={dateTo} onChange={onDateChange} />
    </header>
  );
}
