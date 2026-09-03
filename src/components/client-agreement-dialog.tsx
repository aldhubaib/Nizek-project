"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { getMyAgreement, type MyAgreementDTO } from "@/actions/client-agreement";

/**
 * Read-back of the agreement a client accepted, opened from the chat menu.
 *
 * The document is fetched when the dialog opens rather than shipped with the
 * thread page: it can run to several pages and is opened rarely.
 */
export function ClientAgreementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [agreement, setAgreement] = useState<MyAgreementDTO>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getMyAgreement()
      .then((res) => {
        if (!cancelled) setAgreement(res);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the agreement — please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{agreement?.title ?? "User agreement"}</DialogTitle>
          <DialogDescription>
            {agreement?.acceptedAt
              ? `Version ${agreement.version} — you accepted this on ${format(
                  new Date(agreement.acceptedAt),
                  "d MMMM yyyy",
                )}.`
              : agreement
                ? `Version ${agreement.version}.`
                : "The agreement you accepted."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-s text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <p className="py-6 text-s text-destructive">{error}</p>
          ) : agreement ? (
            <RichTextEditor
              content={agreement.content}
              onChange={() => {}}
              editable={false}
              borderless
            />
          ) : (
            <p className="py-6 text-s text-muted-foreground">
              There is no agreement to show.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
