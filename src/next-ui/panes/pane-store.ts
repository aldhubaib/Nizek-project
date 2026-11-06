import { create } from "zustand";

import { isEntries, isStrings, load, save } from "./pane-storage";
import { activateAt, addRecent, pushEntry, removeAt, replaceAt, togglePin } from "./pane-transitions";
import {
  entryFromHref,
  hrefFromEntry,
  paneParamOf,
  parsePane,
  serializePane,
  withPane,
  type PaneEntry,
  type PaneState,
} from "./pane-url";

export { activateAt, addRecent, pushEntry, removeAt, replaceAt, togglePin } from "./pane-transitions";

/** How the store writes the URL; the layout hands it Next's router. */
export interface PaneNavigator {
  push: (href: string) => void;
  replace: (href: string) => void;
}

const PINS_KEY = "nx:panes:pins";
const RECENTS_KEY = "nx:panes:recents";

interface PaneStore extends PaneState {
  pathname: string;
  search: string;
  /** Tray entries (by `entryKey`) that never drop when the tray is full; per browser. */
  pins: string[];
  /** Side entries opened lately, newest first; feeds "Recents" on the dashboard; per browser. */
  recents: PaneEntry[];
  /** Last scroll position per pane key, for this session only. */
  scroll: Record<string, number>;
  nav: PaneNavigator | null;
  setNavigator: (nav: PaneNavigator | null) => void;
  /** Called by the layout on every URL change: the URL is the source of truth. */
  setLocation: (pathname: string, search: string) => void;
  open: (entry: PaneEntry) => void;
  replaceActive: (entry: PaneEntry) => void;
  close: (index?: number) => void;
  closeAll: () => void;
  activate: (index: number) => void;
  swap: () => void;
  /** Close the main pane: the visible side entry takes its place and leaves the tray. */
  closeMain: () => void;
  openFull: () => void;
  togglePin: (key: string) => void;
  clearRecents: () => void;
  rememberScroll: (key: string, top: number) => void;
}

export const usePaneStore = create<PaneStore>()((set, get) => {
  const state = (): PaneState => ({ stack: get().stack, at: get().at });
  const write = (
    next: PaneState | null,
    mode: "push" | "replace",
    base = `${get().pathname}${get().search}`,
  ) => {
    get().nav?.[mode](withPane(base, serializePane(next)));
  };
  const remember = (entry: PaneEntry) => {
    const recents = addRecent(get().recents, entry);
    set({ recents });
    save(RECENTS_KEY, recents);
  };
  return {
    stack: [],
    at: 0,
    pathname: "/",
    search: "",
    pins: load(PINS_KEY, [], isStrings),
    recents: load(RECENTS_KEY, [], isEntries),
    scroll: {},
    nav: null,
    setNavigator: (nav) => set({ nav }),
    setLocation: (pathname, search) => {
      const parsed = parsePane(paneParamOf(search));
      set({ pathname, search, stack: parsed?.stack ?? [], at: parsed?.at ?? 0 });
    },
    open: (entry) => {
      const before = state();
      const next = pushEntry(before, entry, get().pins);
      remember(entry);
      write(next, next.stack.length === before.stack.length ? "replace" : "push");
    },
    replaceActive: (entry) => {
      const s = state();
      if (!s.stack.length) return;
      write(replaceAt(s, s.at, entry), "replace");
    },
    close: (index) => {
      const s = state();
      if (!s.stack.length) return;
      write(removeAt(s, index ?? s.at), "push");
    },
    closeAll: () => {
      if (state().stack.length) write(null, "push");
    },
    activate: (index) => {
      const s = state();
      if (index !== s.at) write(activateAt(s, index), "replace");
    },
    swap: () => {
      const s = state();
      const side = s.stack[s.at];
      const main = entryFromHref(`${get().pathname}${get().search}`);
      if (!side || !main) return;
      write(replaceAt(s, s.at, main), "push", hrefFromEntry(side));
    },
    closeMain: () => {
      const s = state();
      const side = s.stack[s.at];
      const main = entryFromHref(`${get().pathname}${get().search}`);
      if (!side || !main) return;
      remember(main); // the page that left is a recent, like a closed side pane
      write(removeAt(s, s.at), "push", hrefFromEntry(side));
    },
    openFull: () => {
      const side = state().stack[state().at];
      if (side) get().nav?.push(hrefFromEntry(side));
    },
    togglePin: (key) => {
      const pins = togglePin(get().pins, key);
      set({ pins });
      save(PINS_KEY, pins);
    },
    clearRecents: () => {
      set({ recents: [] });
      save(RECENTS_KEY, []);
    },
    rememberScroll: (key, top) => {
      get().scroll[key] = top; // not reactive on purpose: nothing re-renders on scroll
    },
  };
});

/** The visible side entry, if any. */
export function selectActive(s: PaneState): PaneEntry | undefined {
  return s.stack[s.at];
}
