"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  getLongestInStageByAssignee,
  getClientInputByAssignee,
} from "@/actions/dashboard";
import { LongestInStageByAssignee } from "./longest-in-stage-by-assignee";
import { ClientInputByAssignee } from "./client-input-by-assignee";
import { LazyIncompleteDeadlines } from "./lazy-incomplete-deadlines";

type ProductData = {
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
        const [assigneeData, clientInputAssignees] = await Promise.all([
          getLongestInStageByAssignee(["INTERNAL_REVIEW", "CLIENT_REVIEW"], 1),
          getClientInputByAssignee(),
        ]);
        setData({ assigneeData, clientInputAssignees });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load product data");
      }
    });
  }, []);

  if (isPending || !data) {
    if (error) {
      return (
        <div className="col-span-full flex items-center justify-center py-12 text-s text-destructive">
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
      <LongestInStageByAssignee data={data.assigneeData} tab="product" thresholdDays={1} />
      <LazyIncompleteDeadlines />
      <ClientInputByAssignee data={data.clientInputAssignees} tab="product" />
    </>
  );
}
