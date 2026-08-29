"use client";

import { useState } from "react";
import { Eye, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { stopImpersonation } from "@/actions/impersonation";

// Shown while an admin is viewing the app as another user.
// `bar` sits in document flow (client shell header). `float` is the
// staff overlay that doesn't steal layout from the dashboard.
export function ImpersonationBanner({
  targetName,
  variant = "float",
}: {
  targetName: string;
  variant?: "float" | "bar";
}) {
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

  const inner = (
    <>
      <Eye className="w-4 h-4 text-orange shrink-0" />
      <span className="text-s text-foreground truncate">
        Viewing as <strong className="font-semibold">{targetName}</strong>
      </span>
      <button
        type="button"
        onClick={handleExit}
        disabled={leaving}
        className="ms-auto flex items-center gap-1 rounded-full bg-orange/25 hover:bg-orange/40 px-2.5 py-1 text-xs font-semibold text-foreground transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        <LogOut className="w-3 h-3" />
        {leaving ? "Exiting…" : "Exit"}
      </button>
    </>
  );

  if (variant === "bar") {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-orange/30 bg-orange/15 px-4 py-2",
          "pt-[max(0.5rem,env(safe-area-inset-top))]",
        )}
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 z-[10000] flex -translate-x-1/2 items-center gap-3 rounded-full border border-orange/40 bg-orange/15 px-4 py-2 shadow-xl backdrop-blur-md",
      )}
    >
      {inner}
    </div>
  );
}
