"use client";

import { useState } from "react";
import { AlertTriangle, Copy, Check, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

interface ErrorDisplayProps {
  error: Error & { digest?: string };
  reset?: () => void;
  context?: string;
}

function formatErrorReport(error: Error & { digest?: string }, context?: string) {
  const timestamp = new Date().toISOString();
  const url = typeof window !== "undefined" ? window.location.href : "unknown";
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";

  return [
    "=== Error Report ===",
    `Timestamp: ${timestamp}`,
    `URL: ${url}`,
    `Context: ${context ?? "Unknown"}`,
    error.digest ? `Digest: ${error.digest}` : null,
    "",
    `Error: ${error.name}: ${error.message}`,
    "",
    error.stack ? `Stack Trace:\n${error.stack}` : null,
    "",
    `User Agent: ${userAgent}`,
    "=== End Report ===",
  ]
    .filter(Boolean)
    .join("\n");
}

export function ErrorDisplay({ error, reset, context }: ErrorDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const report = formatErrorReport(error, context);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = report;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-lg">
        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-destructive" strokeWidth={1.5} />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-center text-lg font-semibold text-foreground mb-1.5">
          Something went wrong
        </h1>
        <p className="text-center text-[13px] text-muted-foreground mb-6 max-w-sm mx-auto">
          An unexpected error occurred. Copy the error details below and share them so we can fix it.
        </p>

        {/* Error summary card */}
        <div className="rounded-xl border border-border bg-card/50 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive bg-destructive/10 px-2 py-0.5 rounded-full shrink-0">
                Error
              </span>
              {error.digest && (
                <code className="text-[11px] text-muted-foreground font-mono truncate">
                  #{error.digest}
                </code>
              )}
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Error
                </>
              )}
            </button>
          </div>

          <div className="px-4 py-3">
            <p className="text-[12px] text-foreground font-medium leading-relaxed break-words">
              {error.message || "An unknown error occurred"}
            </p>
            {context && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Page: {context}
              </p>
            )}
          </div>

          {/* Expandable details */}
          <div className="border-t border-border">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Technical Details</span>
              {showDetails ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            {showDetails && (
              <div className="px-4 pb-3">
                <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap break-all leading-relaxed bg-background/50 rounded-lg p-3 max-h-[200px] overflow-auto border border-border/50">
                  {report}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-2">
          {reset && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium px-4 py-2 hover:opacity-90 transition-opacity"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Try Again
            </button>
          )}
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card text-[12px] font-medium text-foreground px-4 py-2 hover:bg-card/80 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Copied!" : "Copy Full Report"}
          </button>
        </div>
      </div>
    </div>
  );
}
