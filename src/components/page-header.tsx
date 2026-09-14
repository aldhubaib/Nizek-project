"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePageOverflowPresence } from "@/components/page-overflow-menu";
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
 * The right padding is the part worth knowing about. The shared ⋮ sits in that
 * corner, overlaid by the dashboard shell on top of this header, so a header
 * that ran the full width would put its own controls underneath it. That room
 * is reserved automatically whenever a page has registered anything into the ⋮,
 * because a page that puts a button on its right edge — the module boards do —
 * had no way to know the shell was about to park the menu on top of it.
 *
 * `hasMenu` forces the same room without a ⋮, for a page that parks a labelled
 * button up there through `PageHeaderActions` instead.
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
  const overflowMenuShowing = usePageOverflowPresence();

  return (
    <header
      className={cn(
        "app-top-bar sticky top-0 z-10 shrink-0 flex items-center gap-s pb-5 border-b border-border",
        (hasMenu || overflowMenuShowing) && "app-top-bar-menu",
        className,
      )}
    >
      {children}
    </header>
  );
}
