import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { WaterFillLoader } from "./WaterFillLoader";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    // Timeout: if loading takes >5s, show fallback
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        setTimedOut(true);
      }
    }, 5000);

    // 1. Check existing session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;

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

      if (!mounted) return;

      if (profile && !profile.is_active) {
        await supabase.auth.signOut();
        navigate("/login", { state: { deactivated: true }, replace: true });
        return;
      }

      setAuthenticated(true);
      setLoading(false);
    });

    // 2. Listen for auth state changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (!session) {
          setAuthenticated(false);
          setLoading(false);
          navigate("/login", { replace: true });
          return;
        }

        if (event === "SIGNED_IN") {
          // Log login
          supabase.from("user_activity_log").insert({
            user_id: session.user.id,
            email: session.user.email || "",
            action: "login",
            metadata: {},
          });
          supabase
            .from("user_profiles")
            .update({ last_login_at: new Date().toISOString() })
            .eq("id", session.user.id);
        }

        if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
          setAuthenticated(true);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="relative">
        <WaterFillLoader message="Loading dashboard…" fullScreen={true} />
        {timedOut && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
            <button
              onClick={() => {
                supabase.auth.signOut();
                navigate("/login", { replace: true });
              }}
              className="text-primary-foreground/80 hover:text-primary-foreground text-sm underline underline-offset-4 transition-colors"
            >
              Taking too long? Click here to sign in again
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!authenticated) return null;

  return <>{children}</>;
}
