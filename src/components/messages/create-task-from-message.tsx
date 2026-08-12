"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Wrench,
  Bug,
  Palette,
  Loader2,
  CheckSquare,
} from "lucide-react";
import { createTask } from "@/actions/task";
import { getTaskQuestions } from "@/actions/task-question";
import { QuestionField, type TaskQuestion } from "@/components/kanban/question-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type TaskType = "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";

type QuestionWithType = TaskQuestion & { taskType: string };

const TASK_TYPES: {
  id: TaskType;
  label: string;
  icon: typeof Sparkles;
  activeColor: string;
}[] = [
  {
    id: "FEATURE",
    label: "Business Case",
    icon: Sparkles,
    activeColor: "bg-primary/15 border-primary/40 text-primary",
  },
  {
    id: "ENHANCEMENT",
    label: "Enhancement",
    icon: Wrench,
    activeColor: "bg-violet-500/15 border-violet-500/40 text-violet-400",
  },
  {
    id: "BUG",
    label: "Internal Bug",
    icon: Bug,
    activeColor: "bg-amber-500/15 border-amber-500/40 text-amber-400",
  },
  {
    id: "DESIGN",
    label: "Design",
    icon: Palette,
    activeColor: "bg-cyan-500/15 border-cyan-500/40 text-cyan-400",
  },
];

export type CreateTaskFromMessagePayload = {
  projectId: string;
  projectName: string;
  allowedTaskTypes: string[];
  activeContractType: string;
  /** Prefill title (selection or first line). */
  title: string;
  /** Quoted source for description. */
  description: string;
  sourceAuthor: string;
  threadPath: string;
};

export function CreateTaskFromMessageDialog({
  open,
  onClose,
  payload,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  payload: CreateTaskFromMessagePayload | null;
  onCreated?: (task: { id: string; taskNumber: number; title: string }) => void;
}) {
  const [questions, setQuestions] = useState<QuestionWithType[]>([]);
  const [loadingQs, setLoadingQs] = useState(false);
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("FEATURE");
  const [priority, setPriority] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mandatoryErrors, setMandatoryErrors] = useState<string[]>([]);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const visibleTypes = useMemo(
    () =>
      TASK_TYPES.filter((t) =>
        (payload?.allowedTaskTypes ?? []).includes(t.id),
      ),
    [payload?.allowedTaskTypes],
  );

  useEffect(() => {
    if (!open || !payload) return;
    setTitle(payload.title.slice(0, 200));
    setPriority(null);
    setAnswers({});
    setError(null);
    setMandatoryErrors([]);
    setCreatedLink(null);
    const first = TASK_TYPES.find((t) =>
      payload.allowedTaskTypes.includes(t.id),
    );
    setTaskType(first?.id ?? "FEATURE");
    setLoadingQs(true);
    getTaskQuestions()
      .then((qs) => setQuestions(qs as QuestionWithType[]))
      .catch(() => setQuestions([]))
      .finally(() => setLoadingQs(false));
  }, [open, payload]);

  const filteredQuestions = useMemo(
    () => questions.filter((q) => q.taskType === taskType),
    [questions, taskType],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!payload || !title.trim()) return;

    const unanswered = filteredQuestions
      .filter((q) => q.mandatory && (!answers[q.id] || !answers[q.id].trim()))
      .map((q) => q.question);
    if (unanswered.length > 0) {
      setMandatoryErrors(unanswered);
      return;
    }
    setMandatoryErrors([]);
    setSaving(true);
    setError(null);
    try {
      const answersList = filteredQuestions
        .map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" }))
        .filter((a) => a.answer.trim());

      const description = [
        payload.description,
        "",
        `— From chat (@${payload.sourceAuthor})`,
        payload.threadPath,
      ]
        .filter(Boolean)
        .join("\n");

      const task = await createTask({
        projectId: payload.projectId,
        title: title.trim(),
        description,
        priority: priority ?? undefined,
        taskType,
        answers: answersList.length > 0 ? answersList : undefined,
      });

      const href = `/dashboard/projects/${payload.projectId}/tasks/${task.id}`;
      setCreatedLink(href);
      onCreated?.({
        id: task.id,
        taskNumber: task.taskNumber,
        title: task.title,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create task";
      if (msg.startsWith("MANDATORY_QUESTIONS:")) {
        try {
          setMandatoryErrors(JSON.parse(msg.slice("MANDATORY_QUESTIONS:".length)));
        } catch {
          setError(msg);
        }
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!payload) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <CheckSquare className="h-4 w-4 text-primary" />
            Create task from message
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            {payload.projectName} · New Request
          </p>
        </DialogHeader>

        {createdLink ? (
          <div className="space-y-4 p-4">
            <p className="text-sm text-foreground">Task created.</p>
            <Link
              href={createdLink}
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
              onClick={onClose}
            >
              Open task →
            </Link>
            <div className="pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
              <div className="rounded-lg border border-border/60 bg-surface/40 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  @{payload.sourceAuthor}
                </span>
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap">
                  {payload.description || "(attachment)"}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-semibold">Type</label>
                {payload.activeContractType === "MAINTENANCE" && (
                  <span className="ml-2 text-[10px] text-amber-400">
                    Maintenance — bugs only
                  </span>
                )}
                <div className="flex flex-wrap gap-2">
                  {visibleTypes.map((t) => {
                    const Icon = t.icon;
                    const isActive = taskType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setTaskType(t.id);
                          setAnswers({});
                        }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                          isActive
                            ? t.activeColor
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-semibold">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10 text-sm"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-semibold">Priority</label>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPriority(priority === n ? null : n)}
                      className={cn(
                        "h-9 w-9 rounded-md border text-[13px] font-medium",
                        priority === n
                          ? "border-primary/40 bg-primary/20 text-primary"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {loadingQs ? (
                <div className="flex justify-center py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : (
                filteredQuestions.length > 0 && (
                  <div className="space-y-4 border-t border-border pt-4">
                    {filteredQuestions.map((q, i) => (
                      <QuestionField
                        key={q.id}
                        question={q}
                        index={i}
                        value={answers[q.id] ?? ""}
                        onChange={(val) =>
                          setAnswers((prev) => ({ ...prev, [q.id]: val }))
                        }
                        showRequiredAs="mandatory"
                      />
                    ))}
                  </div>
                )
              )}

              {mandatoryErrors.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                  Please fill mandatory fields:
                  <ul className="mt-1 space-y-0.5">
                    {mandatoryErrors.map((q) => (
                      <li key={q}>• {q}</li>
                    ))}
                  </ul>
                </div>
              )}
              {error && (
                <p className="text-[12px] text-destructive">{error}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
              <Button type="submit" disabled={saving || !title.trim()}>
                {saving && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {saving ? "Creating…" : "Create Task"}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
