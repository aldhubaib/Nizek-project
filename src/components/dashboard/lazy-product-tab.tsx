"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { getLongestInPipeline, getLongestInStageByAssignee, getClientDependencies } from "@/actions/dashboard";
import { LongestInPipeline } from "./longest-in-pipeline";
import { LongestInStageByAssignee } from "./longest-in-stage-by-assignee";
import { ClientDependencies } from "./client-dependencies";

type ProductData = {
  pipelineTasks: Awaited<ReturnType<typeof getLongestInPipeline>>;
  assigneeData: Awaited<ReturnType<typeof getLongestInStageByAssignee>>;
  clientDeps: Awaited<ReturnType<typeof getClientDependencies>>;
};

export function LazyProductTab() {
  const [data, setData] = useState<ProductData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const [pipelineTasks, assigneeData, clientDeps] = await Promise.all([
                getLongestInPipeline(["INTERNAL_REVIEW"]),
                getLongestInStageByAssignee(["INTERNAL_REVIEW"]),
                getClientDependencies(),
               ]);
               setData({ pipelineTasks, assigneeData, clientDeps });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load product data");
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
      <LongestInPipeline data={data.pipelineTasks} tab="product" />
      <LongestInStageByAssignee data={data.assigneeData} tab="product" />
      <ClientDependencies data={data.clientDeps} tab="product" />
    </>
  );
}
