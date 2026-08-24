"use client";

import { useRef, type RefObject } from "react";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";

interface UseVirtualListOptions {
  count: number;
  estimateSize: (index: number) => number;
  overscan?: number;
}

interface VirtualListResult {
  parentRef: RefObject<HTMLDivElement | null>;
  virtualItems: VirtualItem[];
  totalSize: number;
  measureElement: (el: HTMLElement | null) => void;
}

export function useVirtualList({
  count,
  estimateSize,
  overscan = 5,
}: UseVirtualListOptions): VirtualListResult {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan,
  });

  return {
    parentRef,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
    measureElement: virtualizer.measureElement,
  };
}
