import { useState, useMemo } from "react";
import { Search, ChevronDown, BarChart3, Globe } from "lucide-react";
import { brands, Brand } from "@/lib/brands";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface BrandSwitcherProps {
  selectedBrand: Brand;
  onSelect: (brand: Brand) => void;
}

const SOCIAL_MEDIA_BRANDS = new Set([
  "Laurel Mountain",
  "ABG Home Services",
  "Accessible Home Store",
  "American Bath Group",
  "Arizona Shower Door",
  "Bootz",
  "Coastal Shower Doors",
  "DreamLine",
  "MAAX",
  "MAAX Spas",
  "Maidstone",
  "Swan",
  "Mr.Steam",
  "Vintage Tub",
  "Vintage Tub & Bath - Canada",
]);

function MetaIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? "#1877F2" : "currentColor"} className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.883v2.271h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
    </svg>
  );
}

function HubSpotIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? "#FF7A59" : "currentColor"} className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M16.74 8.56V6.12a1.81 1.81 0 001.05-1.63v-.06A1.81 1.81 0 0016 2.63h-.06a1.81 1.81 0 00-1.81 1.81v.06a1.81 1.81 0 001.05 1.62v2.44a5.27 5.27 0 00-2.31 1L6.4 4.53a2 2 0 00.05-.38 2.05 2.05 0 10-2 2.05 2 2 0 001-.27l6.36 4.94a5.29 5.29 0 00-.9 2.94 5.22 5.22 0 00.79 2.77L9.9 18.22a1.71 1.71 0 00-.51-.08 1.76 1.76 0 101.76 1.76 1.73 1.73 0 00-.18-.77l1.68-1.67a5.28 5.28 0 103.09-9.9zm-.64 7.79a2.81 2.81 0 110-5.62 2.81 2.81 0 010 5.62z"/>
    </svg>
  );
}

function IntegrationIcons({ brand }: { brand: Brand }) {
  const hasMeta = SOCIAL_MEDIA_BRANDS.has(brand.name);
  const off = "text-muted-foreground/25";
  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <BarChart3 className={`h-3.5 w-3.5 ${brand.hasGA4 ? "text-blue-500" : off}`} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{brand.hasGA4 ? "GA4 connected" : "GA4 not connected"}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Globe className={`h-3.5 w-3.5 ${brand.hasGSC ? "text-green-500" : off}`} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{brand.hasGSC ? "GSC connected" : "GSC not connected"}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <HubSpotIcon className={`h-3.5 w-3.5 ${!brand.hasHubSpot ? off : ""}`} active={brand.hasHubSpot} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{brand.hasHubSpot ? "HubSpot connected" : "HubSpot not connected"}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <MetaIcon className={`h-3.5 w-3.5 ${!hasMeta ? off : ""}`} active={hasMeta} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">{hasMeta ? "Meta connected" : "Meta not connected"}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function BrandSwitcher({ selectedBrand, onSelect }: BrandSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => brands.filter((b) => b.name.toLowerCase().includes(search.toLowerCase())), [search]);

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
          {/* Icon legend */}
          <div className="flex items-center gap-3 border-b px-3 py-1.5 bg-muted/40 flex-wrap">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Legend:</span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <BarChart3 className="h-3 w-3 text-blue-500" /> GA4
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Globe className="h-3 w-3 text-green-500" /> GSC
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <HubSpotIcon className="h-3 w-3" active /> HubSpot
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MetaIcon className="h-3 w-3" /> Meta
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.map((brand) => (
              <button
                key={brand.id}
                className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-muted ${
                  brand.id === selectedBrand.id ? "bg-muted font-medium" : ""
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
