"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.06] text-[11px] font-medium text-white hover:bg-white/[0.12] transition-colors"
    >
      <Printer className="w-3.5 h-3.5" strokeWidth={1.5} />
      Print report
    </button>
  );
}
