"use client";

import { useEffect, useState } from "react";
import { Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  attachNoteToTask,
  searchProjectTasksForLink,
} from "@/actions/meeting-note";
import { taskCode } from "@/lib/task-label";

type TaskRow = {
  id: string;
  title: string;
  taskNumber: number;
  taskType: string;
  stage: string;
};

export function AttachToTaskDialog({
  open,
  onClose,
  noteId,
  projectId,
  excludeTaskIds,
  onAttached,
}: {
  open: boolean;
  onClose: () => void;
  noteId: string;
  projectId: string;
  excludeTaskIds: string[];
  onAttached: () => void;
}) {
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setError(null);
    setLoading(true);
    searchProjectTasksForLink(projectId, "")
      .then((rows) => setTasks(rows as TaskRow[]))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [open, projectId]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setLoading(true);
      searchProjectTasksForLink(projectId, query)
        .then((rows) => setTasks(rows as TaskRow[]))
        .catch(() => setTasks([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [query, open, projectId]);

  const visible = tasks.filter((t) => !excludeTaskIds.includes(t.id));

  async function attach(taskId: string) {
    setAttaching(taskId);
    setError(null);
    try {
      await attachNoteToTask({ noteId, taskId });
      onAttached();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach");
    } finally {
      setAttaching(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[80dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Link2 className="h-4 w-4 text-primary" />
            Attach to existing task
          </DialogTitle>
        </DialogHeader>
        <div className="p-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="h-9"
            autoFocus
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              No matching tasks
            </p>
          ) : (
            visible.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={attaching !== null}
                onClick={() => void attach(t.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-accent/60"
              >
                <span className="font-mono text-[11px] font-semibold text-primary">
                  {taskCode(t.taskType, t.taskNumber)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{t.title}</span>
                {attaching === t.id && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
              </button>
            ))
          )}
        </div>
        {error && (
          <p className="px-4 pb-3 text-[12px] text-destructive">{error}</p>
        )}
        <div className="border-t border-border px-4 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
