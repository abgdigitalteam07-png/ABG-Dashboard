import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const TEAMS_URL = "https://teams.microsoft.com/l/chat/0/0?users=mali@americanbathgroup.com";
const EMAIL = "mali@americanbathgroup.com";

interface HelpButtonProps {
  variant?: "header" | "login";
}

export function HelpButton({ variant = "header" }: HelpButtonProps) {
  const isLogin = variant === "login";

  const buttonClass = isLogin
    ? "fixed bottom-6 right-6 z-50 flex items-center justify-center h-10 w-10 rounded-full bg-primary shadow-lg hover:bg-primary/90 transition-colors"
    : "flex items-center justify-center h-8 w-8 rounded-full bg-primary-foreground/15 hover:bg-primary-foreground/25 transition-colors";

  const iconClass = isLogin
    ? "h-5 w-5 text-primary-foreground"
    : "h-5 w-5 text-primary-foreground";

  const message = isLogin
    ? "Having trouble logging in?"
    : "Need help?";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <a
          href={TEAMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass}
          title="Get Help"
          onClick={(e) => e.preventDefault()}
        >
          <HelpCircle className={iconClass} />
        </a>
      </PopoverTrigger>
      <PopoverContent side={isLogin ? "top" : "bottom"} className="text-sm max-w-[280px] p-3">
        <p className="mb-1 font-medium">{message}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Contact Mostafa Ali on{" "}
          <a
            href={TEAMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            Microsoft Teams
          </a>{" "}
          or email{" "}
          <a
            href={`mailto:${EMAIL}`}
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {EMAIL}
          </a>
        </p>
      </PopoverContent>
    </Popover>
  );
}
