"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Centrifuge, Subscription } from "centrifuge";
import { globalPresenceChannel } from "@/lib/channels";
import { getDeviceId } from "@/lib/device-id";

// How long the app can be backgrounded before we drop the WebSocket to save
// battery/data on installed PWAs. History + recovery replay missed events on
// resume, so this is transparent to the user.
const BACKGROUND_GRACE_MS = 30_000;

// Single shared WebSocket connection to Centrifugo. Components subscribe to
// channels through this context; the provider dedupes subscriptions by channel
// so many components can watch the same channel over one Subscription.

type MessageHandler = (data: unknown) => void;

type CentrifugoContextValue = {
  connected: boolean;
  /** True when a Centrifugo WS URL is configured (realtime is available). */
  enabled: boolean;
  memberId: string;
  /** Subscribe to a channel. Returns an unsubscribe cleanup. */
  subscribe: (channel: string, onMessage: MessageHandler) => () => void;
  /** Publish an ephemeral event (e.g. typing) to a channel. */
  publish: (channel: string, data: unknown) => void;
  /** Fetch current presence (online members) for a channel. */
  presence: (channel: string) => Promise<string[]>;
  /** Get the Subscription instance for a channel (for join/leave listeners). */
  getSubscription: (channel: string) => Subscription | null;
};

const CentrifugoContext = createContext<CentrifugoContextValue | null>(null);

const WS_URL = process.env.NEXT_PUBLIC_CENTRIFUGO_WS ?? "";

async function fetchToken(channel?: string): Promise<string> {
  // For the connection token (no channel) we send this device's stable id so
  // server-side presence can tell which device is connected (presence-aware push).
  const body = channel ? { channel } : { deviceId: getDeviceId() };
  const res = await fetch("/api/centrifugo/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = (await res.json()) as { token: string };
  return data.token;
}

export function CentrifugoProvider({
  memberId,
  children,
}: {
  memberId: string;
  children: ReactNode;
}) {
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<Centrifuge | null>(null);
  // channel -> { sub, handlers } so multiple listeners share one Subscription.
  const subsRef = useRef<
    Map<string, { sub: Subscription; handlers: Set<MessageHandler> }>
  >(new Map());
  // Channels that must stay subscribed for the whole session (the global
  // presence channel). Without pinning, a page that watches the same channel
  // would tear it down on unmount and the user would drop out of presence —
  // showing as "Offline" to everyone while still using the app.
  const pinnedRef = useRef<Set<string>>(new Set());
  const ensureSubRef = useRef<((channel: string) => unknown) | null>(null);
  // Mirrors `connected` for use inside event listeners without stale closures.
  const connectedRef = useRef(false);
  // True while intentionally paused (backgrounded PWA) so the disconnect handler
  // doesn't fight the visibility resume logic.
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!WS_URL) {
      // Realtime disabled — components use their fallbacks. Log once so a
      // missing NEXT_PUBLIC_CENTRIFUGO_WS in a deploy is visible, not silent.
      console.warn("[realtime] disabled: NEXT_PUBLIC_CENTRIFUGO_WS is not set");
      return;
    }

    let cancelled = false;
    let client: Centrifuge | null = null;

    // Lazy-init: defer the WS handshake + token fetch until the browser is idle
    // so it doesn't compete with initial dashboard hydration / LCP. Presence and
    // notifications come online a beat after first paint instead of blocking it.
    const start = () => {
      if (cancelled) return;
      client = new Centrifuge(WS_URL, {
        getToken: () => fetchToken(),
      });
      clientRef.current = client;

      client.on("connected", () => {
        setConnected(true);
        connectedRef.current = true;
        pausedRef.current = false;
        // Join the global presence channel so this user counts as online for the
        // whole session (independent of which page/thread is open).
        const presenceChannel = globalPresenceChannel();
        pinnedRef.current.add(presenceChannel);
        ensureSubRef.current?.(presenceChannel);
        // No blanket router.refresh() on reconnect. Missed publications inside the
        // channel history window are replayed on resubscribe (force_recovery) and
        // applied by each view's delta handlers; navigation reloads cover the rest.
      });
      client.on("disconnected", () => {
        setConnected(false);
        connectedRef.current = false;
      });
      client.on("error", (ctx) => {
        console.warn("[realtime] client error:", ctx.error?.message ?? ctx);
      });
      client.connect();
    };

    const ric = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void })
      .cancelIdleCallback;
    const handle: number = ric
      ? ric(start, { timeout: 2000 })
      : (setTimeout(start, 200) as unknown as number);

    return () => {
      cancelled = true;
      if (ric && cic) cic(handle);
      else clearTimeout(handle);
      const c = client;
      if (c) {
        subsRef.current.forEach(({ sub }) => {
          try {
            sub.unsubscribe();
            c.removeSubscription(sub);
          } catch {}
        });
        subsRef.current.clear();
        c.disconnect();
      }
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PWA/mobile power saving: drop the WebSocket after the app is backgrounded
  // for a grace period, and reconnect the instant it returns to the foreground.
  // Recovery (force_recovery on channels) replays anything missed while paused,
  // so open views stay correct without a full refresh.
  useEffect(() => {
    if (!WS_URL) return;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const clearHideTimer = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };

    const handleVisibility = () => {
      const client = clientRef.current;
      if (document.hidden) {
        clearHideTimer();
        hideTimer = setTimeout(() => {
          if (document.hidden && clientRef.current && connectedRef.current) {
            pausedRef.current = true;
            try {
              clientRef.current.disconnect();
            } catch {}
          }
        }, BACKGROUND_GRACE_MS);
      } else {
        clearHideTimer();
        // Reconnect on resume if we paused (or dropped) while hidden.
        if (client && !connectedRef.current) {
          try {
            client.connect();
          } catch {}
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearHideTimer();
    };
  }, []);

  const ensureSub = useCallback((channel: string) => {
    const client = clientRef.current;
    if (!client) return null;
    let entry = subsRef.current.get(channel);
    if (entry) return entry;

    let sub = client.getSubscription(channel);
    if (!sub) {
      sub = client.newSubscription(channel, {
        getToken: () => fetchToken(channel),
      });
    }
    const handlers = new Set<MessageHandler>();
    sub.on("publication", (ctx) => {
      handlers.forEach((h) => {
        try {
          h(ctx.data);
        } catch {}
      });
    });
    sub.on("error", (ctx) => {
      console.warn(`[realtime] subscription error (${channel}):`, ctx.error?.message ?? ctx);
    });
    entry = { sub, handlers };
    subsRef.current.set(channel, entry);
    sub.subscribe();
    return entry;
  }, []);
  ensureSubRef.current = ensureSub;

  const subscribe = useCallback(
    (channel: string, onMessage: MessageHandler) => {
      const entry = ensureSub(channel);
      if (!entry) return () => {};
      entry.handlers.add(onMessage);
      return () => {
        entry.handlers.delete(onMessage);
        if (entry.handlers.size === 0 && !pinnedRef.current.has(channel)) {
          try {
            entry.sub.unsubscribe();
            clientRef.current?.removeSubscription(entry.sub);
          } catch {}
          subsRef.current.delete(channel);
        }
      };
    },
    [ensureSub],
  );

  const publish = useCallback((channel: string, data: unknown) => {
    const client = clientRef.current;
    if (!client) return;
    client.publish(channel, data).catch(() => {});
  }, []);

  const presence = useCallback(
    async (channel: string): Promise<string[]> => {
      const entry = ensureSub(channel);
      if (!entry) return [];
      try {
        const result = await entry.sub.presence();
        const users = new Set<string>();
        Object.values(result.clients).forEach((c) => users.add(c.user));
        return [...users];
      } catch {
        return [];
      }
    },
    [ensureSub],
  );

  const getSubscription = useCallback((channel: string) => {
    return subsRef.current.get(channel)?.sub ?? null;
  }, []);

  const value = useMemo<CentrifugoContextValue>(
    () => ({
      connected,
      enabled: Boolean(WS_URL),
      memberId,
      subscribe,
      publish,
      presence,
      getSubscription,
    }),
    [connected, memberId, subscribe, publish, presence, getSubscription],
  );

  return (
    <CentrifugoContext.Provider value={value}>
      {children}
    </CentrifugoContext.Provider>
  );
}

export function useCentrifugo(): CentrifugoContextValue | null {
  return useContext(CentrifugoContext);
}
