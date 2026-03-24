import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface EmailPreviewModalProps {
  open: boolean;
  onClose: () => void;
  email: {
    id?: string | number;
    name: string;
    brandName?: string;
    sender?: string;
    publishDate?: string;
    sent?: number;
    delivered?: number;
    openRate?: number;
    clickRate?: number;
  } | null;
}

export function EmailPreviewModal({ open, onClose, email }: EmailPreviewModalProps) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !email?.id) {
      setHtml("");
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);

    supabase.functions
      .invoke("email-preview", { body: { emailId: email.id } })
      .then(({ data, error: fnErr }) => {
        if (fnErr || data?.error || !data?.html) {
          setError(true);
        } else {
          setHtml(data.html);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, email?.id]);

  if (!email) return null;

  const hubspotUrl = email.id
    ? `https://app.hubspot.com/email/24202603/details/${email.id}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[800px] max-h-[85vh] flex flex-col gap-0 p-0 rounded-xl overflow-hidden sm:max-w-[800px]">
        <DialogHeader className="p-6 pb-4 space-y-3 border-b border-border">
          <DialogTitle className="text-base font-semibold text-foreground">
            Email Name: {email.name}
          </DialogTitle>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {email.brandName && <span>Brand: {email.brandName}</span>}
            {email.sender && <span>Sender: {email.sender}</span>}
            {email.publishDate && <span>{email.publishDate}</span>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {email.sent != null && <span>Sent: {email.sent.toLocaleString()}</span>}
            {email.delivered != null && <span>Delivered: {email.delivered.toLocaleString()}</span>}
            {email.openRate != null && <span>Open Rate: {email.openRate}%</span>}
            {email.clickRate != null && <span>Click Rate: {email.clickRate}%</span>}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-white" style={{ maxHeight: "60vh" }}>
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Email preview unavailable
            </div>
          ) : html ? (
            <iframe
              srcDoc={html}
              sandbox="allow-same-origin"
              className="w-full border-0"
              style={{ minHeight: "400px", height: "60vh" }}
              title="Email Preview"
            />
          ) : (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              No preview content available
            </div>
          )}
        </div>

        {hubspotUrl && (
          <div className="flex justify-end p-4 border-t border-border">
            <Button variant="outline" size="sm" asChild>
              <a href={hubspotUrl} target="_blank" rel="noopener noreferrer">
                Open in HubSpot <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
