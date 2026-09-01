"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, History, Clock, Loader2, Lock } from "lucide-react";
import { getComments } from "@/actions/comment";
import { getTaskHistory, type TaskHistory } from "@/actions/task-history";
import { StatusBadge } from "@/components/ui/status-badge";
import { outlineBadge } from "@/lib/task-label";
import { formatDuration } from "@/lib/task-history-format";
import {
  TaskLifecycleTimeline,
  type TimelineComment,
} from "@/components/task/task-lifecycle-timeline";

interface Props {
  taskId: string;
  refreshKey?: number;
  onClose: () => void;
}

export function TaskHistoryDialog({ taskId, refreshKey, onClose }: Props) {
  const [history, setHistory] = useState<TaskHistory | null>(null);
  const [comments, setComments] = useState<TimelineComment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    Promise.all([getTaskHistory(taskId), getComments(taskId)])
      .then(([hist, commentRes]) => {
        setHistory(hist);
        if (commentRes && (commentRes as { success: boolean }).success) {
          setComments((commentRes as unknown as { comments: TimelineComment[] }).comments);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [taskId, refreshKey]);

  const allowed = history?.allowed === true ? history : null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="relative mx-4 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-4">
          <History className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <h3 className="text-s font-semibold">Task History</h3>
          <div className="ms-auto flex items-center gap-2">
            {allowed && (
              <StatusBadge
                config={outlineBadge(`Total ${formatDuration(allowed.summary.totalMs)}`, "text-foreground/80", "border-border")}
                icon={Clock}
              />
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden px-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : allowed ? (
            <TaskLifecycleTimeline
              visits={allowed.visits}
              activities={allowed.activities}
              summary={allowed.summary}
              comments={comments}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Lock className="h-6 w-6 text-muted-foreground opacity-40" strokeWidth={1.5} />
              <p className="text-s text-muted-foreground">
                Your role cannot view this task&apos;s history.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
