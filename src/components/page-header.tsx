import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageName({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <h1 className={cn("page-name min-w-0 truncate text-foreground", className)}>
      {children}
    </h1>
  );
}

const BACK_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

/** Arrow that sits to the left of every page title. */
export function PageBackButton({
  href,
  onClick,
  label,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
}) {
  const icon = <ArrowLeft className="h-4 w-4" />;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={BACK_CLASS}
        title={label}
        aria-label={label}
      >
        {icon}
      </button>
    );
  }
  if (!href) return null;
  return (
    <Link href={href} className={BACK_CLASS} title={label} aria-label={label}>
      {icon}
    </Link>
  );
}

/**
 * The bar at the top of a page: title on the left, actions on the right, a rule
 * under it, and it follows you down the page.
 *
 * The right padding is the part worth knowing about. The shared ⋮ sits in
 * that corner (overlaid by the dashboard shell), so a header that ran the
 * full width would put its own controls underneath it. `hasMenu` reserves
 * extra room on pages that park a button beside the ⋮ through
 * `PageHeaderActions`.
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
