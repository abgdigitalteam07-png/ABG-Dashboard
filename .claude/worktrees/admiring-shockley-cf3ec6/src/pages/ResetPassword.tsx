import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";

const ABG_LOGO_URL =
  "https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-white-horizontal.png";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setValidSession(true);
        setChecking(false);
      }
    });

    // Also check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setValidSession(true);
      }
      setChecking(false);
    });
  }, []);

  const handleReset = async () => {
    setError("");
    if (!password) { setError("Please enter a new password."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) { setError(updateError.message); return; }
    setSuccess(true);
    setTimeout(() => navigate("/", { replace: true }), 2000);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, hsl(210 100% 12%) 0%, hsl(217 91% 20%) 50%, hsl(210 100% 12%) 100%)" }}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  if (!validSession) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "linear-gradient(135deg, hsl(210 100% 12%) 0%, hsl(217 91% 20%) 50%, hsl(210 100% 12%) 100%)" }}>
        <Card className="w-full max-w-[420px] shadow-2xl border-0">
          <CardContent className="p-8 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Invalid or Expired Link</h2>
            <p className="text-sm text-muted-foreground">This password reset link is invalid or has expired.</p>
            <Button onClick={() => navigate("/login")} className="w-full">Back to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, hsl(210 100% 12%) 0%, hsl(217 91% 20%) 50%, hsl(210 100% 12%) 100%)" }}>
      <Card className="w-full max-w-[420px] shadow-2xl border-0">
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="bg-primary rounded-xl p-4 w-full flex justify-center">
              <img src={ABG_LOGO_URL} className="w-[200px] h-auto" alt="American Bath Group" />
            </div>
            <h1 className="text-xl font-bold text-foreground text-center">Set New Password</h1>
          </div>

          {success ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <h2 className="text-lg font-semibold text-foreground">Password Updated</h2>
              <p className="text-sm text-muted-foreground">Redirecting to dashboard…</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 text-base pr-10"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleReset()}
                className="h-12 text-base"
                disabled={loading}
              />
              {error && (
                <div className="flex items-start gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <Button onClick={handleReset} disabled={loading} className="w-full h-12 text-base font-semibold">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Updating…
                  </span>
                ) : (
                  "Update Password"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
