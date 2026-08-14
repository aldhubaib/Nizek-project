"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The shell owns a single ⋮ next to the notification bell. Pages register
 * items into it instead of drawing their own menu trigger — so project
 * settings, note actions, and equity actions all land in the same place.
 *
 * Register/unregister live on a stable context object. The menu reads entries
 * through an external store, so adding an item cannot rebuild the context that
 * the registrars subscribe to (that loop is React error #185).
 */

type Getter = () => ReactNode;

type Entry = { id: string; order: number; getNode: Getter };

type OverflowRegistry = {
  register: (id: string, order: number, getNode: Getter) => void;
  unregister: (id: string) => void;
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => Entry[];
};

const OverflowContext = createContext<OverflowRegistry | null>(null);
const EMPTY_ENTRIES: Entry[] = [];

function subscribeNoop() {
  return () => {};
}
function getEmptySnapshot(): Entry[] {
  return EMPTY_ENTRIES;
}

function snapshotFrom(map: Map<string, Omit<Entry, "id">>): Entry[] {
  return Array.from(map.entries())
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function PageOverflowMenuProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef(new Map<string, Omit<Entry, "id">>());
  const snapshotRef = useRef<Entry[]>(EMPTY_ENTRIES);
  const listenersRef = useRef(new Set<() => void>());

  const emit = useCallback(() => {
    const next = snapshotFrom(mapRef.current);
    snapshotRef.current = next.length === 0 ? EMPTY_ENTRIES : next;
    listenersRef.current.forEach((listener) => listener());
  }, []);

  const register = useCallback(
    (id: string, order: number, getNode: Getter) => {
      const prev = mapRef.current.get(id);
      mapRef.current.set(id, { order, getNode });
      if (!prev || prev.order !== order) emit();
    },
    [emit],
  );

  const unregister = useCallback(
    (id: string) => {
      if (!mapRef.current.has(id)) return;
      mapRef.current.delete(id);
      emit();
    },
    [emit],
  );

  const subscribe = useCallback((onStoreChange: () => void) => {
    listenersRef.current.add(onStoreChange);
    return () => {
      listenersRef.current.delete(onStoreChange);
    };
  }, []);

  const getSnapshot = useCallback(() => snapshotRef.current, []);

  const registry = useMemo<OverflowRegistry>(
    () => ({ register, unregister, subscribe, getSnapshot }),
    [register, unregister, subscribe, getSnapshot],
  );

  return (
    <OverflowContext.Provider value={registry}>{children}</OverflowContext.Provider>
  );
}

export function PageOverflowItems({
  id,
  order = 0,
  children,
}: {
  id: string;
  order?: number;
  children: ReactNode;
}) {
  const registry = useContext(OverflowContext);
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const getNode = useCallback(() => childrenRef.current, []);

  const register = registry?.register;
  const unregister = registry?.unregister;

  useLayoutEffect(() => {
    if (!register || !unregister) return;
    register(id, order, getNode);
    return () => unregister(id);
  }, [register, unregister, id, order, getNode]);

  return null;
}

function useOverflowEntries(): Entry[] {
  const registry = useContext(OverflowContext);
  return useSyncExternalStore(
    registry?.subscribe ?? subscribeNoop,
    registry?.getSnapshot ?? getEmptySnapshot,
    getEmptySnapshot,
  );
}

export function PageOverflowMenu() {
  const entries = useOverflowEntries();
  const [openTick, setOpenTick] = useState(0);

  if (entries.length === 0) return null;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setOpenTick((t) => t + 1);
      }}
    >
      <DropdownMenuTrigger
        aria-label="More actions"
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <span className="sr-only">{openTick}</span>
        {entries.map((item, i) => (
          <Fragment key={item.id}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            {item.getNode()}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
