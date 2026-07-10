"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { getIncompleteDeadlines } from "@/actions/deadline-reminder";
import { IncompleteDeadlines } from "./incomplete-deadlines";

export function LazyIncompleteDeadlines() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getIncompleteDeadlines>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        setData(await getIncompleteDeadlines());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load deadlines");
      }
    });
  }, []);

  if (isPending || !data) {
    if (error) {
      return (
        <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-border bg-card p-6 text-[13px] text-destructive">
          {error}
        </div>
      );
    }
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <IncompleteDeadlines data={data} />;
}
