"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCentrifugo } from "./centrifugo-provider";

// Subscribe to a channel and invoke `onMessage` for each publication.
export function useChannel(
  channel: string | null,
  onMessage: (data: unknown) => void,
) {
  const cent = useCentrifugo();
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!cent || !channel) return;
    return cent.subscribe(channel, (data) => handlerRef.current(data));
  }, [cent, channel]);
}

// Online member ids for a presence-enabled channel. Tracks join/leave live and
// seeds from the initial presence snapshot.
export function usePresence(channel: string | null): Set<string> {
  const cent = useCentrifugo();
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!cent || !channel) return;
    let cancelled = false;

    // Keep one subscription alive for the presence channel.
    const off = cent.subscribe(channel, () => {});

    const refresh = async () => {
      const users = await cent.presence(channel);
      if (!cancelled) setOnline(new Set(users));
    };
    void refresh();

    const sub = cent.getSubscription(channel);
    const onJoin = (ctx: { info: { user: string } }) =>
      setOnline((prev) => new Set(prev).add(ctx.info.user));
    const onLeave = (ctx: { info: { user: string } }) =>
      setOnline((prev) => {
        const next = new Set(prev);
        next.delete(ctx.info.user);
        return next;
      });
    sub?.on("join", onJoin);
    sub?.on("leave", onLeave);

    const interval = setInterval(refresh, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub?.off("join", onJoin);
      sub?.off("leave", onLeave);
      off();
    };
  }, [cent, channel]);

  return online;
}

const TYPING_EVENT = "typing";
const TYPING_TTL = 4000;

// Typing indicator over a channel. Returns the set of member ids currently
// typing (excluding self) and a `notifyTyping()` to broadcast that you're typing.
export function useTyping(
  channel: string | null,
): { typing: string[]; notifyTyping: () => void } {
  const cent = useCentrifugo();
  const [typingMap, setTypingMap] = useState<Record<string, number>>({});
  const lastSentRef = useRef(0);

  useChannel(channel, (data) => {
    const d = data as { type?: string; memberId?: string } | null;
    if (!cent || !d || d.type !== TYPING_EVENT || !d.memberId) return;
    if (d.memberId === cent.memberId) return;
    setTypingMap((prev) => ({ ...prev, [d.memberId!]: Date.now() }));
  });

  // Expire stale typing entries.
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - TYPING_TTL;
      setTypingMap((prev) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const [id, ts] of Object.entries(prev)) {
          if (ts >= cutoff) next[id] = ts;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const notifyTyping = useCallback(() => {
    if (!cent || !channel) return;
    const now = Date.now();
    if (now - lastSentRef.current < 1500) return; // throttle
    lastSentRef.current = now;
    cent.publish(channel, { type: TYPING_EVENT, memberId: cent.memberId });
  }, [cent, channel]);

  return { typing: Object.keys(typingMap), notifyTyping };
}
