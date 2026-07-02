import { HelpCircle } from "lucide-react";

const TEAMS_URL = "https://teams.microsoft.com/l/chat/0/0?users=mali@americanbathgroup.com";

interface HelpButtonProps {
  variant?: "header" | "login";
}

export function HelpButton({ variant = "header" }: HelpButtonProps) {
  const isLogin = variant === "login";

  const buttonClass = isLogin
    ? "fixed bottom-6 right-6 z-50 flex items-center justify-center h-10 w-10 rounded-full bg-primary shadow-lg hover:bg-primary/90 transition-colors"
    : "flex items-center justify-center h-8 w-8 rounded-full bg-primary-foreground/15 hover:bg-primary-foreground/25 transition-colors";

  return (
    <a
      href={TEAMS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClass}
      title="Chat with Mostafa Ali on Microsoft Teams"
    >
      <HelpCircle className="h-5 w-5 text-primary-foreground" />
    </a>
  );
}
