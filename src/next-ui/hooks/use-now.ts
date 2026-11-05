"use client";

import * as React from "react";

/** The current time as state: taken once, then refreshed every `everyMs`, so "days left" stays true on a long-open pane. */
export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}
