"use client";

import { useCentrifugo } from "@/components/realtime/centrifugo-provider";
import { useChannel } from "@/components/realtime/hooks";
import { useBranding } from "@/components/branding-provider";
import { BRANDING_PUSHED_EVENT, globalPresenceChannel } from "@/lib/channels";

/**
 * Applies an admin's logo push the moment it happens. Without this the swap
 * still lands, but only on the next /api/version poll — up to a minute later,
 * and not at all on a tab nobody touches.
 */
export function BrandingLiveListener() {
  const cent = useCentrifugo();
  const branding = useBranding();

  useChannel(cent ? globalPresenceChannel() : null, (data) => {
    const payload = data as { type?: string } | null;
    if (!payload || payload.type !== BRANDING_PUSHED_EVENT) return;
    branding?.applyPayload(payload);
  });

  return null;
}
