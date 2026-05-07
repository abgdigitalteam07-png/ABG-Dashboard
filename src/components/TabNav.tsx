import { cn } from "@/lib/utils";

interface TabNavProps {
  tabs: { id: string; label: string; disabled?: boolean; tooltip?: string }[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function TabNav({ tabs, activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className="border-b border-border bg-card">
      <div className="flex overflow-x-auto scroll-smooth px-3 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            disabled={tab.disabled}
            title={tab.disabled ? tab.tooltip : undefined}
            onClick={() => !tab.disabled && onTabChange(tab.id)}
            className={cn(
              "relative shrink-0 whitespace-nowrap py-3 text-xs font-medium transition-colors md:py-3.5 md:text-sm",
              "px-3 md:px-0 md:mr-8 first:pl-0",
              tab.disabled
                ? "cursor-not-allowed text-muted-foreground/50"
                : activeTab === tab.id
                ? "text-accent after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-accent"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
