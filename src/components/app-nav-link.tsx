"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent, PointerEvent, FocusEvent, TouchEvent } from "react";
import { cn } from "@/lib/utils";

function PendingMark() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-foreground/6"
      aria-hidden
    />
  );
}

type AppNavLinkProps = ComponentProps<typeof Link>;

/**
 * Dashboard nav link: viewport + pointer prefetch, and a pending highlight
 * from Next.js useLinkStatus so the tap paints immediately.
 */
export function AppNavLink({
  href,
  className,
  children,
  onPointerEnter,
  onFocus,
  onTouchStart,
  onClick,
  prefetch = true,
  ...props
}: AppNavLinkProps) {
  const router = useRouter();
  const path = typeof href === "string" ? href : href.pathname ?? "";

  function warm() {
    if (path) router.prefetch(path);
  }

  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn("relative", className)}
      onPointerEnter={(e: PointerEvent<HTMLAnchorElement>) => {
        warm();
        onPointerEnter?.(e);
      }}
      onFocus={(e: FocusEvent<HTMLAnchorElement>) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e: TouchEvent<HTMLAnchorElement>) => {
        warm();
        onTouchStart?.(e);
      }}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
      }}
      {...props}
    >
      <PendingMark />
      {children}
    </Link>
  );
}
