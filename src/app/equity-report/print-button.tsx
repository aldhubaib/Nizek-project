"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[12px] font-medium hover:bg-neutral-700 transition-colors"
    >
      <Printer className="w-3.5 h-3.5" strokeWidth={1.5} />
      Print
    </button>
  );
}
