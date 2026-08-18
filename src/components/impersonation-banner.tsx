"use client";

import { useState } from "react";
import { Eye, LogOut } from "lucide-react";
import { stopImpersonation } from "@/actions/impersonation";

// Fixed banner shown while an admin is viewing the app as another user.
export function ImpersonationBanner({ targetName }: { targetName: string }) {
  const [leaving, setLeaving] = useState(false);

  async function handleExit() {
    setLeaving(true);
    try {
      await stopImpersonation();
      // Full reload: client caches (kanban store, notifications, realtime
      // subscriptions) all belong to the impersonated user.
      window.location.href = "/dashboard/admin?tab=members";
    } catch {
      setLeaving(false);
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-3 rounded-full border border-amber-500/40 bg-amber-500/15 px-4 py-2 shadow-xl backdrop-blur-md">
      <Eye className="w-4 h-4 text-amber-400 shrink-0" />
      <span className="text-s text-amber-100 whitespace-nowrap">
        Viewing as <strong className="font-semibold">{targetName}</strong>
      </span>
      <button
        type="button"
        onClick={handleExit}
        disabled={leaving}
        className="flex items-center gap-1 rounded-full bg-amber-500/25 hover:bg-amber-500/40 px-2.5 py-1 text-xs font-semibold text-amber-100 transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        <LogOut className="w-3 h-3" />
        {leaving ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}
