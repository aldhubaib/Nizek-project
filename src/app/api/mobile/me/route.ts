import { requireUser } from "@/lib/auth";
import { isCentrifugoConfigured } from "@/lib/centrifugo";
import { mobileRoute } from "@/lib/mobile/route";

export const runtime = "nodejs";

/**
 * Who am I + what the app needs to connect. Also the app's "is my session
 * still valid" probe: a 401 here sends it back to the sign-in screen.
 */
export const GET = mobileRoute(async () => {
  const user = await requireUser();
  return {
    user: {
      id: user.id,
      name: user.name ?? user.email,
      email: user.email,
      imageUrl: user.imageUrl ?? null,
      systemRole: user.systemRole,
    },
    realtime: {
      // The app may override this with EXPO_PUBLIC_CENTRIFUGO_WS when the
      // server's value is a localhost address a phone cannot reach.
      wsUrl: isCentrifugoConfigured()
        ? (process.env.NEXT_PUBLIC_CENTRIFUGO_WS ?? null)
        : null,
    },
  };
});
