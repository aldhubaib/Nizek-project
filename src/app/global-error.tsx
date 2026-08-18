"use client";

import { useState } from "react";
import { AlertTriangle, Copy, Check, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

function formatReport(error: Error & { digest?: string }) {
  const timestamp = new Date().toISOString();
  const url = typeof window !== "undefined" ? window.location.href : "unknown";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  return [
    "=== Critical Error Report ===",
    `Timestamp: ${timestamp}`,
    `URL: ${url}`,
    `Context: Global (layout crash)`,
    error.digest ? `Digest: ${error.digest}` : null,
    "",
    `Error: ${error.name}: ${error.message}`,
    "",
    error.stack ? `Stack Trace:\n${error.stack}` : null,
    "",
    `User Agent: ${ua}`,
    "=== End Report ===",
  ].filter(Boolean).join("\n");
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const report = formatReport(error);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      const t = document.createElement("textarea");
      t.value = report;
      t.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <html lang="en" className="dark h-full antialiased">
      <body style={{ minHeight: "100%", background: "#0e0e10", color: "#ededed", fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "1rem" }}>
          <div style={{ width: "100%", maxWidth: "32rem" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AlertTriangle style={{ width: 28, height: 28, color: "#ef4444" }} strokeWidth={1.5} />
              </div>
            </div>

            <h1 style={{ textAlign: "center", fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
              Critical Error
            </h1>
            <p style={{ textAlign: "center", fontSize: 13, color: "#737373", marginBottom: 24, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
              The application failed to load. Copy the error details and share them to get help.
            </p>

            <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", overflow: "hidden", marginBottom: 16 }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#ef4444", background: "rgba(239,68,68,0.1)", padding: "2px 8px", borderRadius: 99 }}>
                    Critical
                  </span>
                  {error.digest && (
                    <code style={{ fontSize: 11, color: "#737373", fontFamily: "monospace" }}>#{error.digest}</code>
                  )}
                </div>
                <button onClick={handleCopy} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 500, color: "#3b82f6", background: "none", border: "none", cursor: "pointer" }}>
                  {copied ? <><Check style={{ width: 14, height: 14 }} /> Copied</> : <><Copy style={{ width: 14, height: 14 }} /> Copy Error</>}
                </button>
              </div>

              <div style={{ padding: "12px 16px" }}>
                <p style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.6, wordBreak: "break-word" }}>
                  {error.message || "An unknown error occurred"}
                </p>
              </div>

              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  style={{ width: "100%", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: "#737373", background: "none", border: "none", cursor: "pointer" }}
                >
                  <span>Technical Details</span>
                  {showDetails ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                </button>
                {showDetails && (
                  <div style={{ padding: "0 16px 12px" }}>
                    <pre style={{ fontSize: 10, color: "#737373", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6, background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 12, maxHeight: 200, overflow: "auto", border: "1px solid rgba(255,255,255,0.04)" }}>
                      {report}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <button
                onClick={reset}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, background: "#3b82f6", color: "#fff", fontSize: 12, fontWeight: 500, padding: "8px 16px", border: "none", cursor: "pointer" }}
              >
                <RotateCcw style={{ width: 14, height: 14 }} /> Try Again
              </button>
              <button
                onClick={handleCopy}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, background: "rgba(255,255,255,0.04)", color: "#ededed", fontSize: 12, fontWeight: 500, padding: "8px 16px", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer" }}
              >
                <Copy style={{ width: 14, height: 14 }} /> {copied ? "Copied!" : "Copy Full Report"}
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
