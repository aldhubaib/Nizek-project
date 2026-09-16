"use client";

import { ShieldAlert } from "lucide-react";
import type { PushGuidance } from "@/lib/push/state";

/**
 * Renders the recovery guidance for a push view: title, optional intro, and
 * either one ordered list of steps or several named paths (iOS "denied" has
 * two). Shared by the gate and the account card so the copy is identical.
 */
export function PushGuidancePanel({
  guidance,
  detail,
  tone = "muted",
}: {
  guidance: PushGuidance;
  detail?: string | null;
  tone?: "muted" | "warn";
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-s font-semibold">
        {tone === "warn" && <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />}
        {guidance.title}
      </div>
      {guidance.intro && (
        <p className="mt-1 text-s text-muted-foreground">{guidance.intro}</p>
      )}
      {guidance.steps.length > 0 && <Steps steps={guidance.steps} />}
      {guidance.paths?.map((path) => (
        <div key={path.title} className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {path.title}
          </div>
          <Steps steps={path.steps} />
        </div>
      ))}
      {detail && <p className="mt-2 text-xs text-muted-foreground/70">{detail}</p>}
    </div>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol
      className={`mt-2 space-y-1 text-s text-muted-foreground ${
        steps.length > 1 ? "list-decimal ps-4" : ""
      }`}
    >
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}
