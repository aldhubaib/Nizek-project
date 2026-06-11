"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { getLongestInPipeline } from "@/actions/dashboard";
import { LongestInPipeline } from "./longest-in-pipeline";

type DevData = {
  pipelineTasks: Awaited<ReturnType<typeof getLongestInPipeline>>;
};

export function LazyDevTab() {
  const [data, setData] = useState<DevData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const [pipelineTasks] = await Promise.all([
          getLongestInPipeline(["READY_FOR_DEV", "IN_DEVELOPMENT"]),
        ]);
        setData({ pipelineTasks });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dev data");
      }
    });
  }, []);

  if (isPending || !data) {
    if (error) {
      return (
        <div className="col-span-full flex items-center justify-center py-12 text-[13px] text-destructive">
          {error}
        </div>
      );
    }
    return (
      <div className="col-span-full flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <LongestInPipeline data={data.pipelineTasks} tab="dev" />
    </>
  );
}
