"use client";

import { useEffect, useRef, useState } from "react";
import type { ECharts, EChartsOption } from "echarts";
import { cn } from "@/lib/utils";

/**
 * One ECharts canvas, wired to React.
 *
 * The library is loaded on first paint rather than imported at the top of the
 * module: it reads the DOM as it starts up, so it can't run while the page is
 * being rendered on the server, and keeping it behind an `import()` means a
 * page with no charts on it never downloads a charting library.
 *
 * The instance outlives its options — a new option object redraws the chart
 * rather than rebuilding it, which is what keeps hovering and animating smooth
 * while the data behind it changes.
 */
export function EChart({
  option,
  height = 240,
  className,
  onReady,
}: {
  option: EChartsOption;
  height?: number;
  className?: string;
  /** The live instance, handed over once, for highlighting from outside. */
  onReady?: (chart: ECharts) => void;
}) {
  const [holder, setHolder] = useState<HTMLDivElement | null>(null);
  const [chart, setChart] = useState<ECharts | null>(null);

  // Held in a ref so a caller passing an inline function doesn't re-run setup.
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!holder) return;

    let instance: ECharts | undefined;
    let observer: ResizeObserver | undefined;
    let cancelled = false;

    import("@/lib/echarts").then(({ echarts }) => {
      if (cancelled) return;
      instance = echarts.init(holder, null, { renderer: "canvas" });
      // A chart inside a section that was collapsed starts at zero width, so
      // it's measured again whenever its box changes rather than only on load.
      observer = new ResizeObserver(() => instance?.resize());
      observer.observe(holder);
      setChart(instance);
      ready.current?.(instance);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      instance?.dispose();
      setChart(null);
    };
  }, [holder]);

  useEffect(() => {
    // Replacing rather than merging, so a series that has gone leaves with it.
    chart?.setOption(option, true);
  }, [chart, option]);

  return (
    <div ref={setHolder} style={{ height }} className={cn("w-full", className)} />
  );
}
