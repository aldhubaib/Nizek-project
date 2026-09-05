"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckSquare } from "lucide-react";
import { taskTypeStyle } from "@/lib/task-type-style";
import { createTaskFromNoteHighlight } from "@/actions/meeting-note";
import { getTaskQuestions } from "@/actions/task-question";
import { QuestionField, type TaskQuestion } from "@/components/kanban/question-field";
import { PriorityPicker } from "@/components/task/priority-picker";
import { DEFAULT_TASK_PRIORITY, type TaskPriorityId } from "@/lib/task-label";
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

// A client's own reported bug is not on offer here; the team is raising this.
const TASK_TYPES = (["FEATURE", "ENHANCEMENT", "BUG", "DESIGN"] as const).map((id) => {
  const style = taskTypeStyle(id);
  return { id, label: style.label, icon: style.icon, activeColor: style.active };
});

export function CreateTaskFromNoteDialog({
  open,
  onClose,
  noteId,
  projectId,
  quote,
  allowedTaskTypes,
  activeContractType,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  noteId: string;
  projectId: string;
  quote: string;
  allowedTaskTypes: string[];
  activeContractType?: string | null;
  onCreated: () => void;
}) {
  const [questions, setQuestions] = useState<QuestionWithType[]>([]);
  const [loadingQs, setLoadingQs] = useState(false);
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("FEATURE");
  const [priority, setPriority] = useState<TaskPriorityId>(DEFAULT_TASK_PRIORITY);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mandatoryErrors, setMandatoryErrors] = useState<string[]>([]);

  const visibleTypes = useMemo(
    () => TASK_TYPES.filter((t) => allowedTaskTypes.includes(t.id)),
    [allowedTaskTypes],
  );

  useEffect(() => {
    if (!open) return;
    setTitle(quote.slice(0, 200));
    setPriority(DEFAULT_TASK_PRIORITY);
    setAnswers({});
    setError(null);
    setMandatoryErrors([]);
    const first = TASK_TYPES.find((t) => allowedTaskTypes.includes(t.id));
    setTaskType(first?.id ?? "FEATURE");
    setLoadingQs(true);
    getTaskQuestions()
      .then((qs) => setQuestions(qs as QuestionWithType[]))
      .catch(() => setQuestions([]))
      .finally(() => setLoadingQs(false));
    // Only reset when the dialog opens — a refresh while it's open was
    // wiping the success state and showing the form again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filteredQuestions = useMemo(
    () => questions.filter((q) => q.taskType === taskType),
    [questions, taskType],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
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
      await createTaskFromNoteHighlight({
        noteId,
        quoteText: quote,
        title: title.trim(),
        taskType,
        priority,
        answers: answersList.length > 0 ? answersList : undefined,
      });
      onCreated();
      onClose();
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-s">
            <CheckSquare className="h-4 w-4 text-primary" />
            Create task from note
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
              <div className="rounded-lg border border-border/60 bg-surface/40 px-3 py-2 text-s text-muted-foreground">
                <p className="line-clamp-4 whitespace-pre-wrap">{quote || "(empty)"}</p>
              </div>

              <div className="space-y-2">
                <label className="text-s font-semibold">Type</label>
                {activeContractType === "MAINTENANCE" && (
                  <span className="ms-2 text-xs text-orange">
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
                          "flex items-center gap-xs rounded-lg border px-3 py-2 text-s font-medium transition-colors",
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
                <label className="text-s font-semibold">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10 text-s"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-s font-semibold">Priority</label>
                <PriorityPicker value={priority} onChange={setPriority} />
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
                      />
                    ))}
                  </div>
                )
              )}

              {mandatoryErrors.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-s text-destructive">
                  Please fill mandatory fields:
                  <ul className="mt-1 space-y-0.5">
                    {mandatoryErrors.map((q) => (
                      <li key={q}>• {q}</li>
                    ))}
                  </ul>
                </div>
              )}
              {error && <p className="text-s text-destructive">{error}</p>}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
              <Button type="submit" disabled={saving || !title.trim()}>
                {saving && <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />}
                {saving ? "Creating…" : "Create Task"}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
      </DialogContent>
    </Dialog>
  );
}
