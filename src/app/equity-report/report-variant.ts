// Deliberately not a "use client" module. The page is a server component and
// needs to call parseReportVariant and read the labels; anything exported from
// a client file is a client reference the server can only render, not call.

export const REPORT_VARIANT = {
  nizek: "Nizek report",
  investor: "Investor report",
} as const;

export type ReportVariant = keyof typeof REPORT_VARIANT;

/** Anything other than an exact "investor" falls back to the internal report. */
export function parseReportVariant(raw: string | undefined): ReportVariant {
  return raw === "investor" ? "investor" : "nizek";
}
