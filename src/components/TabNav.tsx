import { cn } from "@/lib/utils";

interface TabNavProps {
  tabs: { id: string; label: string; disabled?: boolean; tooltip?: string }[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function TabNav({ tabs, activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className="sticky top-0 z-30 flex gap-8 border-b border-border bg-card px-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          disabled={tab.disabled}
          title={tab.disabled ? tab.tooltip : undefined}
          onClick={() => !tab.disabled && onTabChange(tab.id)}
          className={cn(
            "relative py-3.5 text-sm font-medium transition-colors",
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
    </nav>
  );
}
