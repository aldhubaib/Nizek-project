"use client";

import { useRouter } from "next/navigation";
import { REPORT_VARIANT, type ReportVariant } from "./report-variant";

export function ReportVariantPicker({ variant }: { variant: ReportVariant }) {
  const router = useRouter();

  return (
    <select
      value={variant}
      aria-label="Report variant"
      onChange={(e) => {
        // The variant lives in the URL rather than component state so it
        // survives a reload, can be sent to someone as a link, and is still
        // applied when the page is printed.
        router.push(
          e.target.value === "investor"
            ? "/equity-report?view=investor"
            : "/equity-report"
        );
      }}
      className="print:hidden h-[30px] px-2.5 rounded-lg border border-border bg-white/[0.06] text-xs font-medium text-white hover:bg-white/[0.12] transition-colors focus:outline-none focus:ring-1 focus:ring-white/30"
    >
      {Object.entries(REPORT_VARIANT).map(([value, label]) => (
        <option key={value} value={value} className="bg-muted text-white">
          {label}
        </option>
      ))}
    </select>
  );
}
