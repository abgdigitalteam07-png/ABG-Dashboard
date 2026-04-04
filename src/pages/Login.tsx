import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isAllowedDomain } from "@/lib/allowed-domains";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, CheckCircle, AlertCircle } from "lucide-react";

const ABG_LOGO_URL =
  "https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-white-horizontal.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const deactivated = (location.state as any)?.deactivated;

  // If already logged in, redirect
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
  }, [navigate]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleSend = async () => {
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Please enter your email address."); return; }
    if (!isAllowedDomain(trimmed)) {
      setError("Access is restricted to American Bath Group employees. If you believe this is an error, contact your administrator.");
      return;
    }

    setSending(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin + "/" },
    });

    setSending(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setSent(true);
    setCooldown(60);
  };

  const handleResend = () => {
    setSent(false);
    setCooldown(0);
    handleSend();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, hsl(210 100% 12%) 0%, hsl(217 91% 20%) 50%, hsl(210 100% 12%) 100%)" }}>
      <Card className="w-full max-w-[420px] shadow-2xl border-0">
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="bg-primary rounded-xl p-4 w-full flex justify-center">
              <img src={ABG_LOGO_URL} className="w-[200px] h-auto" alt="American Bath Group" />
            </div>
            <h1 className="text-xl font-bold text-foreground text-center">US Wholesale Digital Dashboard</h1>
            <p className="text-sm text-muted-foreground text-center">Sign in with your company email</p>
          </div>

          {deactivated && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              Your account has been deactivated. Contact your administrator.
            </div>
          )}

          {!sent ? (
            <div className="space-y-4">
              <div>
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  className="h-12 text-base"
                  disabled={sending}
                />
              </div>
              {error && (
                <div className="flex items-start gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <Button onClick={handleSend} disabled={sending} className="w-full h-12 text-base font-semibold">
                {sending ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Sending…
                  </span>
                ) : (
                  <span className="flex items-center gap-2"><Mail className="h-4 w-4" /> Send Magic Link</span>
                )}
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <h2 className="text-lg font-semibold text-foreground">Check your inbox</h2>
              <p className="text-sm text-muted-foreground">
                We sent a sign-in link to <strong className="text-foreground">{email}</strong>
              </p>
              <p className="text-sm text-muted-foreground">Click the link in the email to access the dashboard.</p>
              <p className="text-xs text-muted-foreground mt-4">
                Didn't receive it? Check your spam folder or{" "}
                {cooldown > 0 ? (
                  <span className="text-muted-foreground">resend in {cooldown}s</span>
                ) : (
                  <button onClick={handleResend} className="text-primary underline hover:no-underline font-medium">
                    resend
                  </button>
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
