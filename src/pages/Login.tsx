import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isAllowedDomain } from "@/lib/allowed-domains";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { HelpButton } from "@/components/HelpButton";

const ABG_LOGO_URL =
  "https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-white-horizontal.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const deactivated = (location.state as any)?.deactivated;
  const sessionExpired = (location.state as any)?.sessionExpired;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
  }, [navigate]);

  const handleLogin = async () => {
    setError("");
    const trimmed = email.trim().toLowerCase();

    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }

    if (!isAllowedDomain(trimmed)) {
      setError("ACCESS_RESTRICTED");
      return;
    }

    setSending(true);

    try {
      const { data: res, error: fnError } = await supabase.functions.invoke("shared-login", {
        body: { email: trimmed },
      });

      if (fnError || !res?.session) {
        const msg = res?.error || fnError?.message || "Login failed. Please try again.";
        setSending(false);
        setError(msg);
        return;
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: res.session.access_token,
        refresh_token: res.session.refresh_token,
      });

      if (setSessionError) {
        setSending(false);
        setError(setSessionError.message || "Sign-in failed. Please try again.");
        return;
      }

      const { data: { session: activeSession } } = await supabase.auth.getSession();
      if (activeSession) {
        const now = new Date().toISOString();
        await Promise.all([
          supabase.from("user_activity_log").insert({
            user_id: activeSession.user.id,
            email: activeSession.user.email || trimmed,
            action: "login",
            metadata: {},
          }),
          supabase.from("user_profiles").update({ last_login_at: now }).eq("id", activeSession.user.id),
        ]);
      }

      setSending(false);
      navigate("/", { replace: true });
    } catch (err: any) {
      setSending(false);
      setError(err.message || "An unexpected error occurred.");
    }
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          "linear-gradient(135deg, hsl(210 100% 12%) 0%, hsl(217 91% 20%) 50%, hsl(210 100% 12%) 100%)",
      }}
    >
      <Card className="w-full max-w-[420px] shadow-2xl border-0">
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="bg-primary rounded-xl p-4 w-full flex justify-center">
              <img
                src={ABG_LOGO_URL}
                className="w-[200px] h-auto"
                alt="American Bath Group"
              />
            </div>
            <h1 className="text-xl font-bold text-foreground text-center">
              US Wholesale Digital Dashboard
            </h1>
            <p className="text-sm text-muted-foreground text-center">
              Sign in with your company email
            </p>
          </div>

          {deactivated && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              Your account has been deactivated. Contact your administrator.
            </div>
          )}

          {sessionExpired && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-200">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              Your session expired — please sign in again.
            </div>
          )}

          <div className="space-y-4">
            <Input
              type="email"
              placeholder="you@americanbathgroup.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="h-12 text-base"
              disabled={sending}
              autoFocus
            />

            {error && (
              <div className="flex items-start gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {error === "ACCESS_RESTRICTED" ? (
                  <span>
                    Access restricted to ABG team members only. Need access?{" "}
                    <a
                      href="https://teams.microsoft.com/l/chat/0/0?users=mali@americanbathgroup.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:opacity-80"
                    >
                      Contact us on Microsoft Teams
                    </a>
                  </span>
                ) : (
                  <span>{error}</span>
                )}
              </div>
            )}

            <Button
              onClick={handleLogin}
              disabled={sending}
              className="w-full h-12 text-base font-semibold"
            >
              {sending ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Signing in…
                </span>
              ) : (
                "Access Dashboard"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
      <HelpButton variant="login" />
    </main>
  );
}
