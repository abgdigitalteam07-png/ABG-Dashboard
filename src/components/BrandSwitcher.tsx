import { useState, useMemo } from "react";
import { Search, ChevronDown, BarChart3, Globe, Mail } from "lucide-react";
import { brands, Brand } from "@/lib/brands";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface BrandSwitcherProps {
  selectedBrand: Brand;
  onSelect: (brand: Brand) => void;
}

function IntegrationIcons({ brand }: { brand: Brand }) {
  return (
    <div className="flex items-center gap-1">
      {brand.hasGA4 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">GA4</TooltipContent>
        </Tooltip>
      )}
      {brand.hasGSC && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Globe className="h-3.5 w-3.5 text-green-500" />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">GSC</TooltipContent>
        </Tooltip>
      )}
      {brand.hasHubSpot && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Mail className="h-3.5 w-3.5 text-orange-500" />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">HubSpot</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function BrandSwitcher({ selectedBrand, onSelect }: BrandSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      brands.filter((b) =>
        b.name.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-2 rounded-md bg-primary-foreground/10 px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-foreground/20 transition-colors">
            <span>{selectedBrand.name}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search brands..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.map((brand) => (
              <button
                key={brand.id}
                className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-muted ${
                  brand.id === selectedBrand.id
                    ? "bg-muted font-medium"
                    : ""
                }`}
                onClick={() => {
                  onSelect(brand);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <span>{brand.name}</span>
                <IntegrationIcons brand={brand} />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
