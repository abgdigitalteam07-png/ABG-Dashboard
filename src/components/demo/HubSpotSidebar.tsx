import {
  Bookmark, Users, Megaphone, FileText, ShoppingCart, Wallet, Hourglass,
  Database, Network, BarChart3, Sparkles, Code2, MessageCircle, Mail,
} from "lucide-react";

const TOP_GROUPS: { icon: React.ElementType; label: string; tabId?: string }[][] = [
  [{ icon: Bookmark, label: "Workspaces" }],
  [
    { icon: Users, label: "CRM", tabId: "hubspot-crm" },
    { icon: Megaphone, label: "Marketing" },
    { icon: FileText, label: "Content" },
    { icon: ShoppingCart, label: "Commerce" },
    { icon: Wallet, label: "Sales" },
    { icon: Hourglass, label: "Service" },
  ],
  [
    { icon: Database, label: "Data Management" },
    { icon: Network, label: "Automation" },
    { icon: BarChart3, label: "Reporting", tabId: "performance" },
  ],
  [
    { icon: MessageCircle, label: "Social Media", tabId: "social" },
    { icon: Mail, label: "Emails", tabId: "hubspot" },
  ],
  [
    { icon: Sparkles, label: "AI Tools" },
    { icon: Code2, label: "Developer" },
  ],
];

interface HubSpotSidebarProps {
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function HubSpotSidebar({ activeTab, onTabChange }: HubSpotSidebarProps) {
  return (
    <aside className="flex w-[60px] shrink-0 flex-col items-center gap-1 border-r border-[#CBD6E2] bg-white py-3">
      {TOP_GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col items-center gap-1">
          {group.map(({ icon: Icon, label, tabId }) => {
            const isActive = tabId && tabId === activeTab;
            return (
              <button
                key={label}
                title={label}
                onClick={() => tabId && onTabChange(tabId)}
                className={`relative flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                  isActive
                    ? "bg-[#33475B] text-white"
                    : "text-[#516F90] hover:bg-[#F5F8FA] hover:text-[#33475B]"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.4 : 2} />
              </button>
            );
          })}
          {gi < TOP_GROUPS.length - 1 && (
            <div className="my-1 h-px w-7 bg-[#CBD6E2]" />
          )}
        </div>
      ))}
    </aside>
  );
}
