import { cn } from "@/lib/utils";

/** Quiet placeholder bar — matches the existing thread-pane loading style. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded bg-muted/60", className)} />;
}
