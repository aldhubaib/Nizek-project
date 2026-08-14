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
 * Actions (register/unregister) live on a stable context. The item list is a
 * second context, so adding an item re-renders the menu without tearing down
 * the registrars (that loop was React error #185).
 */

type Getter = () => ReactNode;

type Entry = { id: string; order: number; getNode: Getter };

type OverflowActions = {
  register: (id: string, order: number, getNode: Getter) => void;
  unregister: (id: string) => void;
};

const OverflowActionsContext = createContext<OverflowActions | null>(null);
const EMPTY_ENTRIES: Entry[] = [];
const OverflowEntriesContext = createContext<Entry[]>(EMPTY_ENTRIES);

function snapshotFrom(map: Map<string, Omit<Entry, "id">>): Entry[] {
  const next = Array.from(map.entries())
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return next.length === 0 ? EMPTY_ENTRIES : next;
}

export function PageOverflowMenuProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef(new Map<string, Omit<Entry, "id">>());
  const [entries, setEntries] = useState<Entry[]>(EMPTY_ENTRIES);

  const sync = useCallback(() => {
    setEntries(snapshotFrom(mapRef.current));
  }, []);

  const register = useCallback(
    (id: string, order: number, getNode: Getter) => {
      const prev = mapRef.current.get(id);
      mapRef.current.set(id, { order, getNode });
      if (!prev || prev.order !== order) sync();
    },
    [sync],
  );

  const unregister = useCallback(
    (id: string) => {
      if (!mapRef.current.has(id)) return;
      mapRef.current.delete(id);
      sync();
    },
    [sync],
  );

  const actions = useMemo<OverflowActions>(
    () => ({ register, unregister }),
    [register, unregister],
  );

  return (
    <OverflowActionsContext.Provider value={actions}>
      <OverflowEntriesContext.Provider value={entries}>
        {children}
      </OverflowEntriesContext.Provider>
    </OverflowActionsContext.Provider>
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
  const actions = useContext(OverflowActionsContext);
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const getNode = useCallback(() => childrenRef.current, []);

  const register = actions?.register;
  const unregister = actions?.unregister;

  useLayoutEffect(() => {
    if (!register || !unregister) return;
    register(id, order, getNode);
    return () => unregister(id);
  }, [register, unregister, id, order, getNode]);

  return null;
}

export function PageOverflowMenu() {
  const entries = useContext(OverflowEntriesContext);
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
