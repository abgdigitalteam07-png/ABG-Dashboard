import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shield, LogOut } from "lucide-react";

interface UserProfile {
  email: string;
  full_name: string | null;
  role: string;
}

export function UserMenu() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      // Seed a fallback from the auth session so the avatar always renders
      setProfile({ email: session.user.email || "", full_name: null, role: "user" });
      supabase
        .from("user_profiles")
        .select("email, full_name, role")
        .eq("id", session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setProfile(data);
        });
    });
  }, []);

  const handleSignOut = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("user_activity_log").insert({
        user_id: session.user.id,
        email: session.user.email || "",
        action: "logout",
        metadata: {},
      });
    }
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : profile?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-9 w-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-semibold hover:opacity-90 transition-opacity">
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {profile && (
          <>
            <div className="px-3 py-2">
              <p className="text-sm font-semibold">{profile.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground">{profile.email}</p>
            </div>
            <DropdownMenuSeparator />
            {profile.email === "mali@americanbathgroup.com" && (
              <DropdownMenuItem onClick={() => navigate("/admin")} className="cursor-pointer">
                <Shield className="mr-2 h-4 w-4" /> Admin Panel
              </DropdownMenuItem>
            )}
          </>
        )}
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
