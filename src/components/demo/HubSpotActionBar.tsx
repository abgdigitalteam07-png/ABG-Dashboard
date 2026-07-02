import { Star, ChevronDown } from "lucide-react";

interface HubSpotActionBarProps {
  title: string;
}

export function HubSpotActionBar({ title }: HubSpotActionBarProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#CBD6E2] bg-white px-6 py-3.5">
      <div className="flex items-center gap-2">
        <button className="text-[#516F90] hover:text-[#FF7A59]" title="Favorite">
          <Star className="h-4 w-4" />
        </button>
        <h1 className="flex items-center gap-1 text-[20px] font-bold text-[#007A8C]">
          {title}
          <ChevronDown className="h-4 w-4 text-[#007A8C]" />
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <a className="text-sm font-semibold text-[#0091AE] hover:text-[#00637A]" href="#">
          Manage dashboards
        </a>
        <button className="rounded border border-[#FF7A59] bg-white px-3 py-1.5 text-sm font-semibold text-[#FF7A59] hover:bg-[#FFF1EE]">
          Create dashboard
        </button>
        <button className="inline-flex items-center gap-1 rounded border border-[#FF7A59] bg-white px-3 py-1.5 text-sm font-semibold text-[#FF7A59] hover:bg-[#FFF1EE]">
          Actions
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button className="inline-flex items-center gap-1 rounded border border-[#FF7A59] bg-white px-3 py-1.5 text-sm font-semibold text-[#FF7A59] hover:bg-[#FFF1EE]">
          Share
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button className="inline-flex items-center gap-1 rounded bg-[#FF7A59] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#FF8F73]">
          Add content
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
