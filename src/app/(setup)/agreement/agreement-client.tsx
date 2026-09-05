"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, Check, Eye, Loader2 } from "lucide-react";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { acceptClientAgreement } from "@/actions/client-agreement";
import { hasReachedEnd } from "@/lib/client-agreement-gate";
import type { AgreementForClient } from "@/lib/client-agreement";
import { cn } from "@/lib/utils";

export function AgreementClient({
  agreement,
  impersonatingAs,
}: {
  agreement: AgreementForClient;
  /** Set only while an admin is viewing as this client. */
  impersonatingAs: string | null;
}) {
  const preview = agreement.preview;
  const router = useRouter();
  const [read, setRead] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The document is not its own scroller — the page is — so "read to the end"
  // is measured against the window rather than a box.
  const check = useCallback(() => {
    const doc = document.documentElement;
    // Latches on: once they have seen the end, scrolling back up to re-read a
    // clause should not take the button away again.
    if (
      hasReachedEnd({
        scrollTop: window.scrollY,
        clientHeight: doc.clientHeight,
        scrollHeight: doc.scrollHeight,
      })
    ) {
      setRead(true);
    }
  }, []);

  // The editor loads its own chunk and then fills in the content, so the page
  // height at mount is not the final one. Observing the body covers that, the
  // document-shorter-than-the-window case, and resizes in one go — a
  // ResizeObserver fires once on observe(), which is the initial measurement.
  useEffect(() => {
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const observer = new ResizeObserver(check);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      observer.disconnect();
    };
  }, [check]);

  async function accept() {
    setAccepting(true);
    setError(null);
    try {
      await acceptClientAgreement(agreement.id);
      router.replace("/dashboard/messages");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't record that — please try again",
      );
      setAccepting(false);
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col bg-background px-4 pt-16 pb-8 sm:px-6 sm:pt-24",
        // The banner floats over the bottom of the viewport, which is exactly
        // where the accept button lands once the page is scrolled to the end.
        preview && "pb-24",
      )}
    >
      {/*
        The gate stops an impersonating admin here too, so this is the only way
        back out of the page — the dashboard shell that normally carries the
        banner never gets to render. The floating variant overlays rather than
        taking layout, leaving the document centred as the client sees it.
      */}
      {preview && impersonatingAs && (
        <ImpersonationBanner targetName={impersonatingAs} />
      )}

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        {/* No page heading — the document carries its own title. */}
        <div className="text-center">
          <p className="text-s leading-relaxed text-muted-foreground">
            {preview
              ? "This is what the client sees before they can reach their chat."
              : "Please read this through to the end, then accept it to continue."}
          </p>
        </div>

        {/* No frame of its own — the document sits straight on the page. */}
        <div className="mt-6">
          <RichTextEditor
            content={agreement.content}
            onChange={() => {}}
            editable={false}
            borderless
          />
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-s text-destructive">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col items-center gap-3">
          {preview ? (
            <p className="flex items-center gap-2 text-center text-s text-muted-foreground">
              <Eye className="h-4 w-4 shrink-0 text-orange" />
              Accepting here is recorded as you doing it for{" "}
              {impersonatingAs ?? "them"}, not as their own consent
            </p>
          ) : !read ? (
            <p className="flex items-center gap-2 text-s text-muted-foreground">
              <ArrowDown className="h-4 w-4" />
              Scroll to the end to continue
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void accept()}
            // An admin previewing has no reason to read to the end, and the
            // document is the client's to read anyway.
            disabled={(!preview && !read) || accepting}
            className={cn(
              "inline-flex h-11 w-full max-w-sm items-center justify-center rounded-xl px-4 text-s font-medium transition-opacity",
              "bg-primary text-primary-foreground hover:opacity-90",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {accepting ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Check className="me-2 h-4 w-4" />
                {preview
                  ? `Accept for ${impersonatingAs ?? "this client"}`
                  : "I have read and accept"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
