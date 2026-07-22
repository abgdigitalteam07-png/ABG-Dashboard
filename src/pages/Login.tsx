import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, MailCheck } from "lucide-react";
import { HelpButton } from "@/components/HelpButton";

const ABG_LOGO_URL =
  "https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-white-horizontal.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const deactivated = (location.state as any)?.deactivated;
  const sessionExpired = (location.state as any)?.sessionExpired;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleLogin = async () => {
    setError("");
    const trimmed = email.trim().toLowerCase();

    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }

    if (trimmed.split("@")[1] === "gmail.com") {
      setError("Personal Gmail addresses are not allowed. Please use your company email.");
      return;
    }

    setSending(true);

    try {
      if (trimmed === "mali@americanbathgroup.com") {
        const { data: res, error: fnError } = await supabase.functions.invoke("shared-login", {
          body: { email: trimmed },
        });

        if (fnError || !res?.session) {
          setSending(false);
          setError(res?.error || fnError?.message || "Login failed. Please try again.");
          return;
        }

        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: res.session.access_token,
          refresh_token: res.session.refresh_token,
        });

        setSending(false);

        if (setSessionError) {
          setError(setSessionError.message || "Sign-in failed. Please try again.");
          return;
        }

        navigate("/", { replace: true });
        return;
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: window.location.origin },
      });

      setSending(false);

      if (otpError) {
        setError(otpError.message || "Failed to send login link. Please try again.");
        return;
      }

      setLinkSent(true);
      setResendCooldown(120);
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
              Sign in with your email
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

          {linkSent ? (
            <div className="flex flex-col items-center gap-3 text-center py-2">
              <MailCheck className="h-10 w-10 text-primary" />
              <p className="text-sm text-foreground font-medium">Check your email</p>
              <p className="text-sm text-muted-foreground">
                We sent a sign-in link to <span className="font-medium">{email.trim()}</span>.
                Click it to access the dashboard.
              </p>

              {error && (
                <div className="flex items-start gap-2 text-destructive text-sm text-left">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {resendCooldown > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Didn't get it? You can resend in {resendCooldown}s.
                </p>
              ) : (
                <Button
                  variant="outline"
                  className="text-sm"
                  disabled={sending}
                  onClick={handleLogin}
                >
                  {sending ? "Resending…" : "Resend link"}
                </Button>
              )}

              <p className="text-xs text-muted-foreground border-t pt-3 mt-1">
                Still nothing after a few minutes? Check your spam folder, or if your
                company uses Mimecast, check your{" "}
                <a
                  href="https://login-us.mimecast.com/m/portal/app/#/advanced/personal-on-hold"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:opacity-80"
                >
                  held messages
                </a>
                {" "}— emails from Supabase Auth are sometimes held there.
              </p>

              <Button
                variant="ghost"
                className="text-sm"
                onClick={() => {
                  setLinkSent(false);
                  setResendCooldown(0);
                  setEmail("");
                }}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                type="email"
                placeholder="you@company.com"
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
                  <span>{error}</span>
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
                    Sending link…
                  </span>
                ) : (
                  "Send Sign-In Link"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <HelpButton variant="login" />
    </main>
  );
}
