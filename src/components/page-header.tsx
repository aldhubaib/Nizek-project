import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The bar at the top of a page: title on the left, actions on the right, a rule
 * under it, and it follows you down the page.
 *
 * The right padding is the part worth knowing about. The notification bell and
 * the shared ⋮ sit in that corner (overlaid by the dashboard shell), so a
 * header that ran the full width would put its own controls underneath them.
 * `hasMenu` widens the gap for pages that fill the ⋮ or park a button beside
 * the bell through `PageHeaderActions`.
 */
export function PageHeader({
  hasMenu = false,
  className,
  children,
}: {
  hasMenu?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <header
      className={cn(
        "h-12 sticky top-0 z-10 shrink-0 flex items-center gap-2.5 px-6 border-b border-border bg-background",
        hasMenu ? "pr-24" : "pr-14",
        className,
      )}
    >
      {children}
    </header>
  );
}
