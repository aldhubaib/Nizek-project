"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isClientAllowedPath } from "@/lib/client-routes";

/** Keeps CLIENT users inside the inbox-only shell. */
export function ClientRouteGuard({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    if (!pathname.startsWith("/dashboard")) return;
    if (isClientAllowedPath(pathname)) return;
    router.replace("/dashboard/messages");
  }, [enabled, pathname, router]);

  return null;
}
