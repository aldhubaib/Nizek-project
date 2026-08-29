"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "./thread-shared";

/**
 * WhatsApp-style in-thread find: filters the loaded messages, keeps a cursor on
 * the current match, and scrolls each match into view as the cursor moves.
 *
 * The cursor starts on the newest match and `goMatch(-1)` walks backwards
 * through history, matching the direction of the up/down chevrons in the header.
 */
export function useThreadSearch({
  messages,
  scrollToMessage,
  pendingFocusRef,
}: {
  messages: ChatMessage[];
  scrollToMessage: (id: string, opts?: { flash?: boolean }) => boolean;
  pendingFocusRef: React.RefObject<string | null>;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCursorId, setSearchCursorId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sq = searchQuery.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (!sq) return [];
    return messages.filter((m) => m.body.toLowerCase().includes(sq));
  }, [messages, sq]);
  const searchMatchIndex = searchCursorId
    ? searchMatches.findIndex((m) => m.id === searchCursorId)
    : -1;
  const canGoOlder = searchMatchIndex > 0;
  const canGoNewer =
    searchMatchIndex >= 0 && searchMatchIndex < searchMatches.length - 1;

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchCursorId(null);
  }, []);

  const openSearch = useCallback(() => {
    searchInputRef.current?.focus();
    setSearchOpen(true);
  }, []);

  const goSearchMatch = useCallback(
    (direction: -1 | 1) => {
      if (searchMatches.length === 0) return;
      const idx =
        searchMatchIndex >= 0 ? searchMatchIndex : searchMatches.length - 1;
      const next = idx + direction;
      if (next < 0 || next >= searchMatches.length) return;
      setSearchCursorId(searchMatches[next].id);
    },
    [searchMatches, searchMatchIndex],
  );

  useEffect(() => {
    if (!searchOpen || !sq) {
      setSearchCursorId(null);
      return;
    }
    setSearchCursorId((prev) => {
      if (prev && searchMatches.some((m) => m.id === prev)) return prev;
      return searchMatches[searchMatches.length - 1]?.id ?? null;
    });
  }, [searchOpen, sq, searchMatches]);

  useEffect(() => {
    if (!searchOpen || !searchCursorId) return;
    const t = window.setTimeout(() => {
      if (!scrollToMessage(searchCursorId, { flash: false })) {
        pendingFocusRef.current = searchCursorId;
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [searchOpen, searchCursorId, scrollToMessage, pendingFocusRef]);

  // Darken the browser chrome to match the search bar while it is open.
  useEffect(() => {
    if (!searchOpen) return;
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    const prev = Array.from(metas).map((m) => m.getAttribute("content"));
    metas.forEach((m) => m.setAttribute("content", "#1c1c1e"));
    return () => {
      metas.forEach((m, i) => {
        if (prev[i] != null) m.setAttribute("content", prev[i]!);
      });
    };
  }, [searchOpen]);

  return {
    searchOpen,
    searchQuery,
    setSearchQuery,
    searchCursorId,
    searchInputRef,
    sq,
    searchMatches,
    searchMatchIndex,
    canGoOlder,
    canGoNewer,
    goSearchMatch,
    openSearch,
    closeSearch,
  };
}
