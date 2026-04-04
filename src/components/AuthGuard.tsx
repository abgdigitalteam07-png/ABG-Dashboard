import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const ABG_LOGO_URL =
  "https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-white-horizontal.png";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!session) {
          setAuthenticated(false);
          setLoading(false);
          navigate("/login", { replace: true });
          return;
        }

        // Check if user is active
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("is_active")
          .eq("id", session.user.id)
          .single();

        if (profile && !profile.is_active) {
          await supabase.auth.signOut();
          navigate("/login", { state: { deactivated: true }, replace: true });
          return;
        }

        // Log login on SIGNED_IN event
        if (event === "SIGNED_IN") {
          await supabase.from("user_activity_log").insert({
            user_id: session.user.id,
            email: session.user.email || "",
            action: "login",
            metadata: {},
          });
          // Update last_login_at
          await supabase
            .from("user_profiles")
            .update({ last_login_at: new Date().toISOString() })
            .eq("id", session.user.id);
        }

        setAuthenticated(true);
        setLoading(false);
      }
    );

    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setAuthenticated(false);
        setLoading(false);
        navigate("/login", { replace: true });
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("is_active")
        .eq("id", session.user.id)
        .single();

      if (profile && !profile.is_active) {
        await supabase.auth.signOut();
        navigate("/login", { state: { deactivated: true }, replace: true });
        return;
      }

      setAuthenticated(true);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-primary gap-6">
        <img src={ABG_LOGO_URL} className="w-[280px] h-auto animate-pulse" alt="American Bath Group" />
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          <span className="text-primary-foreground text-sm font-medium">Loading dashboard…</span>
        </div>
      </div>
    );
  }

  if (!authenticated) return null;

  return <>{children}</>;
}
