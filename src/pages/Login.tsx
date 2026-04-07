import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isAllowedDomain } from "@/lib/allowed-domains";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, CheckCircle, AlertCircle, Lock, Eye, EyeOff } from "lucide-react";

const ABG_LOGO_URL =
  "https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-white-horizontal.png";

type LoginMode = "magic-link" | "password" | "forgot-password";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [mode, setMode] = useState<LoginMode>("magic-link");
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const deactivated = (location.state as any)?.deactivated;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const validateDomain = (emailVal: string) => {
    const trimmed = emailVal.trim().toLowerCase();
    if (!trimmed) { setError("Please enter your email address."); return null; }
    if (!isAllowedDomain(trimmed)) {
      setError("Access is restricted to American Bath Group employees. If you believe this is an error, contact your administrator.");
      return null;
    }
    return trimmed;
  };

  const handleMagicLink = async () => {
    setError("");
    const trimmed = validateDomain(email);
    if (!trimmed) return;

    setSending(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin + "/" },
    });
    setSending(false);
    if (otpError) { setError(otpError.message); return; }
    setSent(true);
    setCooldown(60);
  };

  const handlePasswordLogin = async () => {
    setError("");
    const trimmed = validateDomain(email);
    if (!trimmed) return;
    if (!password) { setError("Please enter your password."); return; }

    if (isSignUp) {
      if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (password !== confirmPassword) { setError("Passwords do not match."); return; }
      setSending(true);
      const { error: signUpError } = await supabase.auth.signUp({
        email: trimmed,
        password,
        options: { emailRedirectTo: window.location.origin + "/" },
      });
      setSending(false);
      if (signUpError) { setError(signUpError.message); return; }
      setSent(true);
      return;
    }

    setSending(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    setSending(false);
    if (signInError) {
      if (signInError.message.includes("Invalid login credentials")) {
        setError("Invalid email or password. If you haven't set a password yet, use Magic Link or create an account.");
      } else {
        setError(signInError.message);
      }
      return;
    }
    navigate("/", { replace: true });
  };

  const handleForgotPassword = async () => {
    setError("");
    const trimmed = validateDomain(email);
    if (!trimmed) return;

    setSending(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: window.location.origin + "/reset-password",
    });
    setSending(false);
    if (resetError) { setError(resetError.message); return; }
    setSent(true);
    setCooldown(60);
  };

  const handleResend = () => {
    setSent(false);
    setCooldown(0);
    if (mode === "magic-link") handleMagicLink();
    else if (mode === "forgot-password") handleForgotPassword();
  };

  const switchMode = (newMode: LoginMode) => {
    setMode(newMode);
    setError("");
    setSent(false);
    setIsSignUp(false);
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, hsl(210 100% 12%) 0%, hsl(217 91% 20%) 50%, hsl(210 100% 12%) 100%)" }}>
      <Card className="w-full max-w-[420px] shadow-2xl border-0">
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="bg-primary rounded-xl p-4 w-full flex justify-center">
              <img src={ABG_LOGO_URL} className="w-[200px] h-auto" alt="American Bath Group" />
            </div>
            <h1 className="text-xl font-bold text-foreground text-center">US Wholesale Digital Dashboard</h1>
            <p className="text-sm text-muted-foreground text-center">Sign in with your company email</p>
          </div>

          {/* Mode Tabs */}
          <div className="flex rounded-lg bg-muted p-1 mb-6">
            <button
              onClick={() => switchMode("magic-link")}
              className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${mode === "magic-link" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Magic Link
            </button>
            <button
              onClick={() => switchMode("password")}
              className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${mode === "password" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Password
            </button>
          </div>

          {deactivated && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              Your account has been deactivated. Contact your administrator.
            </div>
          )}

          {/* Success / Check inbox state */}
          {sent ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <h2 className="text-lg font-semibold text-foreground">Check your inbox</h2>
              <p className="text-sm text-muted-foreground">
                {mode === "magic-link" && <>We sent a sign-in link to <strong className="text-foreground">{email}</strong></>}
                {mode === "password" && isSignUp && <>We sent a confirmation email to <strong className="text-foreground">{email}</strong>. Please verify your email to sign in.</>}
                {mode === "forgot-password" && <>We sent a password reset link to <strong className="text-foreground">{email}</strong></>}
              </p>
              <p className="text-sm text-muted-foreground">Click the link in the email to continue.</p>
              {(mode === "magic-link" || mode === "forgot-password") && (
                <p className="text-xs text-muted-foreground mt-4">
                  Didn't receive it? Check your spam folder or{" "}
                  {cooldown > 0 ? (
                    <span className="text-muted-foreground">resend in {cooldown}s</span>
                  ) : (
                    <button onClick={handleResend} className="text-primary underline hover:no-underline font-medium">resend</button>
                  )}
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Magic Link Form */}
              {mode === "magic-link" && (
                <div className="space-y-4">
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleMagicLink()}
                    className="h-12 text-base"
                    disabled={sending}
                  />
                  {error && (
                    <div className="flex items-start gap-2 text-destructive text-sm">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  <Button onClick={handleMagicLink} disabled={sending} className="w-full h-12 text-base font-semibold">
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
              )}

              {/* Password Form */}
              {mode === "password" && (
                <div className="space-y-4">
                  <Input
                    type="email"
                    placeholder="you@company.com"
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
                      onKeyDown={(e) => e.key === "Enter" && !isSignUp && handlePasswordLogin()}
                      className="h-12 text-base pr-10"
                      disabled={sending}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {isSignUp && (
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handlePasswordLogin()}
                      className="h-12 text-base"
                      disabled={sending}
                    />
                  )}
                  {error && (
                    <div className="flex items-start gap-2 text-destructive text-sm">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  <Button onClick={handlePasswordLogin} disabled={sending} className="w-full h-12 text-base font-semibold">
                    {sending ? (
                      <span className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        {isSignUp ? "Creating account…" : "Signing in…"}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2"><Lock className="h-4 w-4" /> {isSignUp ? "Create Account" : "Sign In"}</span>
                    )}
                  </Button>
                  <div className="flex items-center justify-between text-sm">
                    <button
                      onClick={() => { setIsSignUp(!isSignUp); setError(""); setConfirmPassword(""); }}
                      className="text-primary hover:underline font-medium"
                    >
                      {isSignUp ? "Already have an account? Sign in" : "New here? Create account"}
                    </button>
                    {!isSignUp && (
                      <button
                        onClick={() => switchMode("forgot-password")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Forgot Password Form */}
              {mode === "forgot-password" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Enter your email and we'll send you a password reset link.</p>
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
                    className="h-12 text-base"
                    disabled={sending}
                  />
                  {error && (
                    <div className="flex items-start gap-2 text-destructive text-sm">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  <Button onClick={handleForgotPassword} disabled={sending} className="w-full h-12 text-base font-semibold">
                    {sending ? (
                      <span className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        Sending…
                      </span>
                    ) : (
                      "Send Reset Link"
                    )}
                  </Button>
                  <button
                    onClick={() => switchMode("password")}
                    className="text-sm text-primary hover:underline font-medium w-full text-center"
                  >
                    ← Back to sign in
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
