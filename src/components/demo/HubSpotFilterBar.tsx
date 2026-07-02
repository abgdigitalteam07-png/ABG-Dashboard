import { Pencil, ChevronDown, SlidersHorizontal, RefreshCw } from "lucide-react";

export function HubSpotFilterBar() {
  return (
    <div className="flex items-center gap-5 bg-[#EAF0F6]/40 px-6 py-2.5 text-sm">
      <button className="inline-flex items-center gap-1.5 font-semibold text-[#0091AE] hover:text-[#00637A]">
        <Pencil className="h-3.5 w-3.5" />
        Quick filters
      </button>
      <button className="inline-flex items-center gap-1 text-[#33475B] hover:text-[#0091AE]">
        Activity date <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button className="inline-flex items-center gap-1 text-[#33475B] hover:text-[#0091AE]">
        Team <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <span className="h-5 w-px bg-[#CBD6E2]" />
      <button className="inline-flex items-center gap-1.5 font-semibold text-[#0091AE] hover:text-[#00637A]">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Advanced filters
      </button>

      <div className="flex-1" />

      <button className="text-[#516F90] hover:text-[#33475B]" title="Refresh">
        <RefreshCw className="h-4 w-4" />
      </button>
      <span className="text-[#516F90]">
        Assigned: <span className="font-semibold text-[#0091AE]">Everyone can view</span>
      </span>
    </div>
  );
}
