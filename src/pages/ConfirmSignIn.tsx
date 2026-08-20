import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { SUPABASE_URL } from "@/integrations/supabase/client";

const ABG_LOGO_URL =
  "https://24202603.fs1.hubspotusercontent-na1.net/hubfs/24202603/Swan/website/common/abg-logo-white-horizontal.png";

// Only follow the confirmation link if it actually points at our own Supabase
// project — otherwise this page would be an open redirect.
function getValidatedConfirmationUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.origin === new URL(SUPABASE_URL).origin ? raw : null;
  } catch {
    return null;
  }
}

export default function ConfirmSignIn() {
  const [searchParams] = useSearchParams();
  const [confirming, setConfirming] = useState(false);
  const confirmationUrl = getValidatedConfirmationUrl(searchParams.get("confirmation_url"));

  const handleConfirm = () => {
    if (!confirmationUrl) return;
    setConfirming(true);
    window.location.href = confirmationUrl;
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
              <img src={ABG_LOGO_URL} className="w-[200px] h-auto" alt="American Bath Group" />
            </div>
            <h1 className="text-xl font-bold text-foreground text-center">Confirm sign-in</h1>
          </div>

          {confirmationUrl ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-sm text-muted-foreground">
                Click below to finish signing in to the US Wholesale Digital Dashboard.
              </p>
              <Button
                onClick={handleConfirm}
                disabled={confirming}
                className="w-full h-12 text-base font-semibold"
              >
                {confirming ? "Signing you in…" : "Confirm sign-in"}
              </Button>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              This link is invalid or has expired. Please request a new sign-in link.
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
