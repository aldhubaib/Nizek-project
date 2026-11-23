"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCentrifugo } from "./centrifugo-provider";
import { userChannel, TYPING_EVENT } from "@/lib/channels";
import { publishTypingEvent } from "@/actions/messages";

// Subscribe to a channel and invoke `onMessage` for each publication.
// `onStale` (optional) fires when the channel reconnected but missed events
// could NOT be replayed from history — the subscriber should refetch.
// `onReconnect` (optional) fires on every resubscribe after a gap, replayed or
// not — for subscribers that can ask the server "what changed since X".
export function useChannel(
  channel: string | null,
  onMessage: (data: unknown) => void,
  onStale?: () => void,
  onReconnect?: (ctx: { recovered: boolean }) => void,
) {
  const cent = useCentrifugo();
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;
  const staleRef = useRef(onStale);
  staleRef.current = onStale;
  const reconnectRef = useRef(onReconnect);
  reconnectRef.current = onReconnect;

  useEffect(() => {
    if (!cent || !channel) return;
    return cent.subscribe(
      channel,
      (data) => handlerRef.current(data),
      () => staleRef.current?.(),
      (ctx) => reconnectRef.current?.(ctx),
    );
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

    // No periodic poll: presence is kept live by join/leave. We only seed once
    // from the initial snapshot above, and re-seed on (re)subscribe.
    const onSubscribed = () => void refresh();
    sub?.on("subscribed", onSubscribed);

    return () => {
      cancelled = true;
      sub?.off("join", onJoin);
      sub?.off("leave", onLeave);
      sub?.off("subscribed", onSubscribed);
      off();
    };
  }, [cent, channel]);

  return online;
}

const TYPING_TTL = 4000;

/** `conv:abc` → `conv-abc`, `project:x` → `project-x`. */
function threadIdFromChannel(channel: string): string | null {
  const idx = channel.indexOf(":");
  if (idx === -1) return null;
  const ns = channel.slice(0, idx);
  const rest = channel.slice(idx + 1);
  if (ns === "conv" || ns === "project") return `${ns}-${rest}`;
  return null;
}

function typingListLabel(names: string[]): string | null {
  const short = names.map((name) => {
    const clean = name.includes("@") ? name.split("@")[0] : name;
    return clean.trim().split(/\s+/)[0] || clean;
  });
  if (short.length === 0) return null;
  if (short.length === 1) return `${short[0]} is typing…`;
  if (short.length === 2) return `${short[0]} and ${short[1]} are typing…`;
  return `${short[0]} and ${short.length - 1} others are typing…`;
}

/** "Name is typing…" for each inbox row, from the signed-in user's own channel. */
export function useInboxTyping(memberId: string): Record<string, string> {
  const [map, setMap] = useState<Record<string, Record<string, { name: string; at: number }>>>({});

  useChannel(memberId ? userChannel(memberId) : null, (data) => {
    const d = data as { type?: string; memberId?: string; name?: string; channel?: string } | null;
    if (!d || d.type !== TYPING_EVENT || !d.channel || !d.memberId) return;
    if (d.memberId === memberId) return;
    const id = threadIdFromChannel(d.channel);
    if (!id) return;
    const name = d.name?.trim() || "Someone";
    setMap((prev) => ({
      ...prev,
      [id]: { ...prev[id], [d.memberId!]: { name, at: Date.now() } },
    }));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - TYPING_TTL;
      setMap((prev) => {
        let changed = false;
        const next: Record<string, Record<string, { name: string; at: number }>> = {};
        for (const [threadId, typers] of Object.entries(prev)) {
          const live: Record<string, { name: string; at: number }> = {};
          for (const [id, typer] of Object.entries(typers)) {
            if (typer.at >= cutoff) live[id] = typer;
            else changed = true;
          }
          if (Object.keys(live).length > 0) next[threadId] = live;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const labels: Record<string, string> = {};
  for (const [threadId, typers] of Object.entries(map)) {
    const names = Object.values(typers)
      .sort((a, b) => b.at - a.at)
      .map((typer) => typer.name);
    const label = typingListLabel(names);
    if (label) labels[threadId] = label;
  }
  return labels;
}


// Typing indicator over a channel. Returns the set of member ids currently
// typing (excluding self) and a `notifyTyping()` to broadcast that you're typing.
export function useTyping(
  channel: string | null,
): { typing: string[]; notifyTyping: () => void } {
  const cent = useCentrifugo();
  const [typingMap, setTypingMap] = useState<Record<string, number>>({});
  const lastSentRef = useRef(0);
  const personal = cent ? userChannel(cent.memberId) : null;

  const onEvent = useCallback(
    (data: unknown) => {
      const d = data as { type?: string; memberId?: string; channel?: string } | null;
      if (!cent || !d || d.type !== TYPING_EVENT || !d.memberId) return;
      if (d.memberId === cent.memberId) return;
      if (d.channel && channel && d.channel !== channel) return;
      setTypingMap((prev) => ({ ...prev, [d.memberId!]: Date.now() }));
    },
    [cent, channel],
  );

  useChannel(channel, onEvent);
  useChannel(personal, onEvent);

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
    if (!channel) return;
    const now = Date.now();
    if (now - lastSentRef.current < 1500) return;
    lastSentRef.current = now;
    void publishTypingEvent(channel);
  }, [channel]);

  return { typing: Object.keys(typingMap), notifyTyping };
}
