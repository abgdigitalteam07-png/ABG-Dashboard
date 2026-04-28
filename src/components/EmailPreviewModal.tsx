import { useState, useEffect, useCallback } from "react";
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
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  useEffect(() => {
    if (!open || !email?.id) {
      setHtml("");
      setPreviewUrl("");
      setError(false);
      setIframeError(false);
      return;
    }

    setLoading(true);
    setError(false);
    setIframeError(false);

    supabase.functions
      .invoke("email-preview", { body: { emailId: email.id } })
      .then(({ data, error: fnErr }) => {
        if (fnErr || data?.error) {
          setError(true);
        } else {
          setHtml(data?.html || "");
          setPreviewUrl(data?.previewUrl || "");
          if (!data?.html && !data?.previewUrl) setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, email?.id]);

  const handleIframeLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const iframeDoc = (e.target as HTMLIFrameElement).contentDocument;
      if (iframeDoc) {
        const title = iframeDoc.title?.toLowerCase() || "";
        const bodyText = iframeDoc.body?.innerText?.toLowerCase() || "";
        if (title.includes("not found") || title.includes("404") ||
            bodyText.includes("page not found") || bodyText.includes("404")) {
          setIframeError(true);
        }
      }
    } catch {
      // Cross-origin — can't check, likely loaded fine
    }
  }, []);

  if (!email) return null;

  const hubspotUrl = email.id
    ? `https://app.hubspot.com/email/24202603/details/${email.id}`
    : null;

  // Wrap raw HTML in a proper document
  const fullHtmlDoc = html
    ? `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: #ffffff; }
    img { max-width: 100%; height: auto; }
    a { color: inherit; }
  </style>
</head>
<body>${html}</body>
</html>`
    : "";

  // Always use srcDoc HTML — never load external URLs in iframe
  const showHtml = !!fullHtmlDoc;
  const showError = error || (!showHtml && !loading);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-[1000px] w-[95vw] max-h-[92vh] flex flex-col gap-0 p-0 rounded-xl overflow-hidden sm:max-w-[1000px]"
      >
        <DialogHeader className="px-6 py-4 space-y-2 border-b border-border">
          <DialogTitle className="text-base font-semibold text-foreground leading-tight">
            Email Name: {email.name}
          </DialogTitle>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-muted-foreground">
            {email.brandName && <span>Brand: {email.brandName}</span>}
            {email.sender && <span>Sender: {email.sender}</span>}
            {email.publishDate && <span>{email.publishDate}</span>}
            {email.sent != null && <span>Sent: {email.sent.toLocaleString()}</span>}
            {email.delivered != null && <span>Delivered: {email.delivered.toLocaleString()}</span>}
            {email.openRate != null && <span>Open Rate: {email.openRate}%</span>}
            {email.clickRate != null && <span>Click Rate: {email.clickRate}%</span>}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-white" style={{ maxHeight: "75vh" }}>
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : showHtml ? (
            <iframe
              srcDoc={fullHtmlDoc}
              sandbox="allow-same-origin"
              className="w-full border-0"
              style={{ minHeight: "600px", height: "70vh", background: "white" }}
              title="Email Preview"
            />
          ) : showError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-muted-foreground">
                Due to this email containing HTML, please review it on HubSpot.
              </p>
              {hubspotUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={hubspotUrl} target="_blank" rel="noopener noreferrer">
                    Open in HubSpot <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {hubspotUrl && !showError && (
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
