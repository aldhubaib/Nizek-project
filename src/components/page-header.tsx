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
        "app-top-bar sticky top-0 z-10 shrink-0 flex items-center gap-s pb-5 border-b border-border",
        hasMenu && "app-top-bar-menu",
        className,
      )}
    >
      {children}
    </header>
  );
}
