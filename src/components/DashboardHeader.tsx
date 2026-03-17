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
}

export function DashboardHeader({
  selectedBrand,
  onBrandChange,
  dateFrom,
  dateTo,
  onDateChange,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between bg-primary px-6">
      <div className="flex items-center gap-6">
        <img src={abgLogo} className="h-8 w-auto" alt="American Bath Group" />
        <div className="h-6 w-px bg-primary-foreground/20" />
        <BrandSwitcher selectedBrand={selectedBrand} onSelect={onBrandChange} />
      </div>
      <DateRangePicker from={dateFrom} to={dateTo} onChange={onDateChange} />
    </header>
  );
}
