import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isAllowedDomain } from "@/lib/allowed-domains";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, AlertCircle, Eye, EyeOff } from "lucide-react";

const ABG_LOGO_URL =
  "https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-white-horizontal.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const deactivated = (location.state as any)?.deactivated;

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
      setError("Access restricted to ABG team members only.");
      return;
    }

    if (!password) {
      setError("Please enter the password.");
      return;
    }

    setSending(true);

    try {
      const res = await supabase.functions.invoke("shared-login", {
        body: { email: trimmed, password },
      });

      if (res.error || !res.data?.session) {
        const msg = res.data?.error || res.error?.message || "Login failed. Please try again.";
        setSending(false);
        if (msg.includes("Incorrect password")) {
          setError("Incorrect password. Please contact your admin.");
        } else {
          setError(msg);
        }
        return;
      }

      // Set the session from the edge function response
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: res.data.session.access_token,
        refresh_token: res.data.session.refresh_token,
      });

      if (setSessionError) {
        setSending(false);
        setError("Sign-in failed. Please try again.");
        return;
      }

      setSending(false);
      navigate("/", { replace: true });
    } catch (err: any) {
      setSending(false);
      setError(err.message || "An unexpected error occurred.");
    }
  };

  return (
    <div
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

          <div className="space-y-4">
            <Input
              type="email"
              placeholder="you@americanbathgroup.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 text-base"
              disabled={sending}
            />
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="h-12 text-base pr-10"
                disabled={sending}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

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
                  Signing in…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4" /> Sign In
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
