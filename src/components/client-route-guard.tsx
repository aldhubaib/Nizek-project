"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const ALLOWED = [
  "/dashboard/messages",
  "/dashboard/settings",
  "/dashboard/account",
];

function isAllowed(pathname: string): boolean {
  return ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Keeps CLIENT users inside the inbox-only shell. */
export function ClientRouteGuard({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    if (!pathname.startsWith("/dashboard")) return;
    if (isAllowed(pathname)) return;
    router.replace("/dashboard/messages");
  }, [enabled, pathname, router]);

  return null;
}
