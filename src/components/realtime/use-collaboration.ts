"use client";

import { useEffect, useMemo, useState } from "react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

const COLLAB_WS_URL = process.env.NEXT_PUBLIC_COLLAB_WS ?? "";

async function fetchCollabToken(): Promise<string> {
  const res = await fetch("/api/collab/token");
  if (!res.ok) throw new Error("Failed to fetch collab token");
  const data = await res.json();
  return data.token;
}

/**
 * Hook that creates and manages a Hocuspocus collaborative editing session for
 * a given note document. Returns the Yjs document and provider for use with
 * TipTap collaboration extensions.
 */
export function useCollaboration(noteId: string | null) {
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);

  const ydoc = useMemo(() => (noteId ? new Y.Doc() : null), [noteId]);

  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!noteId || !ydoc || !COLLAB_WS_URL) return;

    const hocus = new HocuspocusProvider({
      url: COLLAB_WS_URL,
      name: `note:${noteId}`,
      document: ydoc,
      token: fetchCollabToken,
      onConnect() {
        setConnected(true);
      },
      onDisconnect() {
        setConnected(false);
      },
      onSynced() {
        setSynced(true);
      },
    });

    setProvider(hocus);

    return () => {
      hocus.destroy();
      setProvider(null);
      setConnected(false);
      setSynced(false);
    };
  }, [noteId, ydoc]);

  return { ydoc, provider, connected, synced, enabled: Boolean(COLLAB_WS_URL) };
}
