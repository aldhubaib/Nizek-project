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
 */

type Getter = () => ReactNode;

type Entry = { id: string; order: number; getNode: Getter };

type OverflowContextValue = {
  register: (id: string, order: number, getNode: Getter) => void;
  unregister: (id: string) => void;
  entries: Entry[];
};

const OverflowContext = createContext<OverflowContextValue | null>(null);

export function PageOverflowMenuProvider({ children }: { children: ReactNode }) {
  const mapRef = useRef(new Map<string, Omit<Entry, "id">>());
  const [version, setVersion] = useState(0);

  const register = useCallback((id: string, order: number, getNode: Getter) => {
    const prev = mapRef.current.get(id);
    mapRef.current.set(id, { order, getNode });
    if (!prev || prev.order !== order) setVersion((v) => v + 1);
  }, []);

  const unregister = useCallback((id: string) => {
    if (!mapRef.current.has(id)) return;
    mapRef.current.delete(id);
    setVersion((v) => v + 1);
  }, []);

  const entries = useMemo(() => {
    return Array.from(mapRef.current.entries())
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    // version is the signal that the map's keys/order changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const value = useMemo(
    () => ({ register, unregister, entries }),
    [register, unregister, entries],
  );

  return (
    <OverflowContext.Provider value={value}>{children}</OverflowContext.Provider>
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
  const ctx = useContext(OverflowContext);
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const getNode = useCallback(() => childrenRef.current, []);

  useLayoutEffect(() => {
    if (!ctx) return;
    ctx.register(id, order, getNode);
    return () => ctx.unregister(id);
  }, [ctx, id, order, getNode]);

  return null;
}

export function PageOverflowMenu() {
  const ctx = useContext(OverflowContext);
  const [openTick, setOpenTick] = useState(0);

  if (!ctx || ctx.entries.length === 0) return null;

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
        {ctx.entries.map((item, i) => (
          <Fragment key={item.id}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            {item.getNode()}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
