import { Search, Plus, PhoneOff, Store, HelpCircle, Settings, Bell, Sparkles } from "lucide-react";

export function HubSpotTopBar() {
  return (
    <header className="flex h-[52px] items-center gap-3 border-b border-[#CBD6E2] bg-white px-3">
      {/* Search bar */}
      <div className="flex-1 max-w-[520px] relative">
        <div className="flex items-center gap-2 rounded-md border border-[#CBD6E2] bg-white px-3 py-1.5 hover:border-[#7C98B6] transition-colors">
          <Search className="h-4 w-4 text-[#516F90]" />
          <span className="text-sm text-[#516F90] flex-1">Find or Ask</span>
          <kbd className="inline-flex items-center gap-0.5 rounded border border-[#CBD6E2] bg-[#F5F8FA] px-1.5 py-0.5 text-[10px] font-semibold text-[#516F90]">
            ⌘ K
          </kbd>
        </div>
      </div>

      {/* "+" create button */}
      <button className="flex h-8 w-8 items-center justify-center rounded-md border border-[#CBD6E2] bg-white text-[#33475B] hover:bg-[#F5F8FA]">
        <Plus className="h-4 w-4" />
      </button>

      <div className="flex-1" />

      {/* Right cluster */}
      <div className="flex items-center gap-1.5">
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-[#33475B] hover:bg-[#F5F8FA]" title="Calling">
          <PhoneOff className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-[#33475B] hover:bg-[#F5F8FA]" title="Marketplace">
          <Store className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-[#33475B] hover:bg-[#F5F8FA]" title="Help">
          <HelpCircle className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-[#33475B] hover:bg-[#F5F8FA]" title="Settings">
          <Settings className="h-4 w-4" />
        </button>
        <button className="relative flex h-8 w-8 items-center justify-center rounded-md text-[#33475B] hover:bg-[#F5F8FA]" title="Notifications">
          <Bell className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#FF7A59] text-[9px] font-bold text-white">5</span>
        </button>

        {/* Assistant pill */}
        <button className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-[#CBD6E2] bg-white px-2.5 py-1.5 text-sm font-semibold text-[#33475B] hover:bg-[#F5F8FA]">
          <Sparkles className="h-3.5 w-3.5 text-[#7C3AED]" />
          Assistant
        </button>
      </div>
    </header>
  );
}
