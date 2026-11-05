"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * One react-query client for the new UI (as Social AI's `providers.tsx`). Screens read through
 * `useQuery` over the existing server actions, so a record opened in a side pane shares the
 * list's cache, and the breadcrumb's label never adds a request of its own.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
