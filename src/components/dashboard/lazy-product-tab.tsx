"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { getLongestInPipeline, getLongestInStageByAssignee, getClientInputByAssignee } from "@/actions/dashboard";
import { LongestInPipeline } from "./longest-in-pipeline";
import { LongestInStageByAssignee } from "./longest-in-stage-by-assignee";
import { ClientInputByAssignee } from "./client-input-by-assignee";

type ProductData = {
  pipelineTasks: Awaited<ReturnType<typeof getLongestInPipeline>>;
  assigneeData: Awaited<ReturnType<typeof getLongestInStageByAssignee>>;
  clientInputAssignees: Awaited<ReturnType<typeof getClientInputByAssignee>>;
};

export function LazyProductTab() {
  const [data, setData] = useState<ProductData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const [pipelineTasks, assigneeData, clientInputAssignees] = await Promise.all([
                getLongestInPipeline(["INTERNAL_REVIEW", "CLIENT_REVIEW"]),
                getLongestInStageByAssignee(["INTERNAL_REVIEW", "CLIENT_REVIEW"]),
                getClientInputByAssignee(),
               ]);
               setData({ pipelineTasks, assigneeData, clientInputAssignees });
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
      <ClientInputByAssignee data={data.clientInputAssignees} tab="product" />
    </>
  );
}
