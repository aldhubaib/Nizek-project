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
import { useRouter } from "next/navigation";
import { Centrifuge, Subscription } from "centrifuge";
import { globalPresenceChannel } from "@/lib/channels";

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
  const res = await fetch("/api/centrifugo/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(channel ? { channel } : {}),
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
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<Centrifuge | null>(null);
  // True after a disconnect so the next "connected" event can resync data the
  // client missed while the socket was down (server refetch of the open view).
  const wasDisconnectedRef = useRef(false);
  const routerRef = useRef(router);
  routerRef.current = router;
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

  useEffect(() => {
    if (!WS_URL) {
      // Realtime disabled — components use their fallbacks. Log once so a
      // missing NEXT_PUBLIC_CENTRIFUGO_WS in a deploy is visible, not silent.
      console.warn("[realtime] disabled: NEXT_PUBLIC_CENTRIFUGO_WS is not set");
      return;
    }

    const client = new Centrifuge(WS_URL, {
      getToken: () => fetchToken(),
    });
    clientRef.current = client;

    client.on("connected", () => {
      setConnected(true);
      // Join the global presence channel so this user counts as online for the
      // whole session (independent of which page/thread is open).
      const presenceChannel = globalPresenceChannel();
      pinnedRef.current.add(presenceChannel);
      ensureSubRef.current?.(presenceChannel);
      // Back online after an outage: refetch the open view so anything missed
      // while disconnected (messages, inbox rows, presence) appears without a
      // manual refresh. Channel history recovery covers short gaps; this is
      // the belt-and-braces catch-all for long ones.
      if (wasDisconnectedRef.current) {
        wasDisconnectedRef.current = false;
        routerRef.current.refresh();
      }
    });
    client.on("disconnected", () => {
      wasDisconnectedRef.current = true;
      setConnected(false);
    });
    client.on("error", (ctx) => {
      console.warn("[realtime] client error:", ctx.error?.message ?? ctx);
    });
    client.connect();

    return () => {
      subsRef.current.forEach(({ sub }) => {
        try {
          sub.unsubscribe();
          client.removeSubscription(sub);
        } catch {}
      });
      subsRef.current.clear();
      client.disconnect();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Missed publications within the channel's history window are replayed as
    // regular publications on resubscribe (force_recovery in centrifugo
    // config). If the gap was too large to recover, refetch from the server.
    sub.on("subscribed", (ctx) => {
      if (ctx.wasRecovering && !ctx.recovered) {
        routerRef.current.refresh();
      }
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
