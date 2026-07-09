"use client";

import { useEffect, useState } from "react";
import { Link2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LinkPreview } from "@/lib/link-preview";

// Module-level cache so a URL is only fetched once per session, shared between
// the composer preview and the delivered message bubbles.
const cache = new Map<string, LinkPreview>();
const inflight = new Map<string, Promise<LinkPreview>>();

function load(url: string): Promise<LinkPreview> {
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(url);
  if (existing) return existing;

  const promise = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
    .then((r) => (r.ok ? r.json() : { url, unavailable: true }))
    .then((d: LinkPreview) => {
      const value: LinkPreview =
        d && typeof d === "object" && !("error" in d) ? d : { url, unavailable: true };
      cache.set(url, value);
      return value;
    })
    .catch(() => {
      const value: LinkPreview = { url, unavailable: true };
      cache.set(url, value);
      return value;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, promise);
  return promise;
}

export function useLinkPreview(url: string | null) {
  const [data, setData] = useState<LinkPreview | null>(() =>
    url ? cache.get(url) ?? null : null,
  );

  useEffect(() => {
    if (!url) {
      setData(null);
      return;
    }
    const cached = cache.get(url);
    if (cached) {
      setData(cached);
      return;
    }
    let active = true;
    load(url).then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, [url]);

  return data;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function LinkPreviewCard({
  url,
  variant = "message",
  mine = false,
  onDismiss,
}: {
  url: string;
  variant?: "message" | "composer";
  mine?: boolean;
  onDismiss?: () => void;
}) {
  const data = useLinkPreview(url);

  const title = data?.siteName || data?.title || hostOf(url);
  const favicon = data?.favicon ?? null;
  const [imgError, setImgError] = useState(false);

  const inner = (
    <>
      <div
        className={cn(
          "grid size-9 shrink-0 place-items-center overflow-hidden rounded-md",
          mine ? "bg-primary-foreground/15" : "bg-muted",
        )}
      >
        {favicon && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={favicon}
            alt=""
            className="size-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <Link2
            className={cn(
              "h-4 w-4",
              mine ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-xs font-semibold",
            mine ? "text-primary-foreground" : "text-foreground",
          )}
        >
          {title}
        </div>
        <div
          className={cn(
            "truncate text-[11px]",
            mine ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {url}
        </div>
      </div>
    </>
  );

  if (variant === "composer") {
    return (
      <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-border/60 bg-surface/60 px-2.5 py-2">
        {inner}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Remove link preview"
            className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex w-full max-w-xs items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors",
        mine
          ? "border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/15"
          : "border-border/60 bg-background/60 hover:bg-background",
      )}
    >
      {inner}
    </a>
  );
}
