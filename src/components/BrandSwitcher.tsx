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
  // Official Meta corporate logo (infinity M shape) — not the Facebook logo
  return (
    <svg viewBox="0 0 24 24" fill={active ? "#0082FB" : "currentColor"} className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973.14.604.375 1.089.72 1.454.344.365.833.574 1.449.574.418 0 .82-.131 1.207-.428.387-.297.62-.646.764-.95.157-.338.291-.698.435-1.102l.074-.207c.25-.748.42-1.394.517-1.96.198-1.155.292-2.373.324-3.36l.02-.595c0-.5-.022-.962-.067-1.382-.045-.42-.125-.83-.256-1.226.388-.093.77-.135 1.134-.135.73 0 1.477.212 2.147.67.67.458 1.26 1.132 1.712 2.01.451.878.72 1.942.72 3.105 0 .948-.143 1.826-.404 2.587-.261.762-.618 1.375-1.032 1.81-.413.435-.838.646-1.266.646-.3 0-.567-.084-.793-.256-.226-.172-.401-.437-.528-.79l-.254-.709c-.057-.158-.115-.319-.168-.47-.22-.626-.423-1.148-.62-1.533-.196-.385-.407-.663-.642-.84-.234-.177-.513-.265-.825-.265-.474 0-.872.203-1.173.613-.3.41-.432.984-.432 1.7v.156c0 .614.116 1.227.35 1.844.233.618.585 1.194 1.045 1.706.46.512 1.018.92 1.668 1.213.65.293 1.368.437 2.145.437 1.048 0 2.017-.28 2.887-.852.87-.572 1.592-1.38 2.139-2.408.547-1.028.821-2.22.821-3.567 0-1.463-.3-2.786-.9-3.942-.6-1.157-1.46-2.07-2.565-2.72C9.19 4.357 8.09 4.03 6.915 4.03zM17.085 4.03c-1.175 0-2.275.327-3.192.925-1.105.65-1.966 1.563-2.566 2.72-.6 1.156-.9 2.479-.9 3.942 0 1.346.274 2.539.822 3.567.547 1.027 1.27 1.836 2.138 2.408.87.572 1.84.852 2.888.852.776 0 1.494-.144 2.144-.437.65-.294 1.208-.701 1.668-1.213.46-.512.812-1.088 1.046-1.706.233-.617.349-1.23.349-1.844v-.156c0-.716-.132-1.29-.432-1.7-.3-.41-.699-.613-1.173-.613-.312 0-.591.088-.825.265-.235.177-.446.455-.642.84-.196.385-.4.907-.62 1.533-.053.151-.111.312-.168.47l-.254.709c-.127.353-.302.618-.528.79-.226.172-.494.256-.793.256-.428 0-.853-.211-1.266-.646-.414-.435-.77-1.048-1.032-1.81-.261-.761-.404-1.639-.404-2.587 0-1.163.269-2.227.72-3.105.452-.878 1.041-1.552 1.712-2.01.67-.458 1.417-.67 2.147-.67.364 0 .746.042 1.134.135-.131.396-.211.806-.256 1.226-.045.42-.067.882-.067 1.382l.02.595c.031.987.126 2.205.324 3.36.097.566.267 1.212.517 1.96l.074.207c.144.404.278.764.435 1.102.144.304.377.653.764.95.387.297.789.428 1.207.428.616 0 1.105-.209 1.45-.574.344-.365.579-.85.719-1.454.14-.604.21-1.267.21-1.973 0-2.566-.704-5.241-2.044-7.306-1.188-1.833-2.903-3.113-4.871-3.113z"/>
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
