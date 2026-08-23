"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles, Wrench, Bug, AlertCircle, Palette, Loader2 } from "lucide-react";
import { createTask } from "@/actions/task";
import { QuestionField, type TaskQuestion } from "@/components/kanban/question-field";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageBreadcrumb } from "@/components/page-breadcrumb";

type TaskType = "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";

interface QuestionWithType extends TaskQuestion {
  taskType: string;
}

const TASK_TYPES: { id: TaskType; label: string; icon: typeof Sparkles; color: string; activeColor: string }[] = [
  { id: "FEATURE", label: "Business Case", icon: Sparkles, color: "text-muted-foreground", activeColor: "bg-primary/15 border-primary/40 text-primary" },
  { id: "ENHANCEMENT", label: "Enhancement", icon: Wrench, color: "text-muted-foreground", activeColor: "bg-violet/15 border-violet/40 text-violet" },
  { id: "BUG", label: "Internal Bug", icon: Bug, color: "text-muted-foreground", activeColor: "bg-orange/15 border-orange/40 text-orange" },
  { id: "DESIGN", label: "Design", icon: Palette, color: "text-muted-foreground", activeColor: "bg-cyan/15 border-cyan/40 text-cyan" },
];

interface Props {
  projectId: string;
  projectName: string;
  questions: QuestionWithType[];
  allowedTaskTypes: string[];
  activeContractType: string;
}

export function NewTaskForm({ projectId, projectName, questions, allowedTaskTypes, activeContractType }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");

  const visibleTypes = TASK_TYPES.filter((t) => allowedTaskTypes.includes(t.id));
  const [taskType, setTaskType] = useState<TaskType>(visibleTypes[0]?.id ?? "FEATURE");
  const [priority, setPriority] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const filteredQuestions = useMemo(
    () => questions.filter((q) => q.taskType === taskType),
    [questions, taskType]
  );

  function handleTypeChange(newType: TaskType) {
    setTaskType(newType);
    setAnswers({});
  }

  const [mandatoryErrors, setMandatoryErrors] = useState<string[]>([]);

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
    try {
      const answersList = filteredQuestions
        .map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" }))
        .filter((a) => a.answer.trim());

      await createTask({
        projectId,
        title: title.trim(),
        priority: priority ?? undefined,
        taskType,
        answers: answersList.length > 0 ? answersList : undefined,
      });

      router.push(`/dashboard/projects/${projectId}?tab=board`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader>
        <button
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <PageBreadcrumb
          items={[
            {
              label: projectName,
              onClick: () => router.push(`/dashboard/projects/${projectId}`),
            },
            { label: "New Task" },
          ]}
        />
      </PageHeader>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-app py-8">
        <div className="space-y-6">
          {/* Task Type */}
          <div className="space-y-2">
            <label className="text-s font-semibold text-foreground">
              Type
              {activeContractType === "MAINTENANCE" && (
                <span className="ms-2 text-xs font-normal text-orange bg-orange/10 rounded-full px-2 py-0.5">
                  Maintenance contract — bugs only
                </span>
              )}
            </label>
            <div className="flex gap-2">
              {visibleTypes.map((t) => {
                const Icon = t.icon;
                const isActive = taskType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleTypeChange(t.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-s font-medium transition-colors",
                      isActive ? t.activeColor : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                    )}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.5} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Task title */}
          <div className="space-y-2">
            <label className="text-s font-semibold text-foreground">
              {TASK_TYPES.find((t) => t.id === taskType)?.label} Name
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                taskType === "BUG" ? "What's the internal bug?"
                  : taskType === "REPORTED_BUG" ? "What did the client report?"
                  : taskType === "ENHANCEMENT" ? "What needs improving?"
                  : taskType === "DESIGN" ? "What needs to be designed?"
                  : "What needs to be done?"
              }
              className="h-10 text-s"
              autoFocus
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <label className="text-s font-semibold text-foreground">
              Priority
            </label>
            <div className="flex gap-xs">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPriority(priority === n ? null : n)}
                  className={cn(
                    "h-9 w-9 rounded-md border text-s font-medium transition-colors",
                    priority === n
                      ? n >= 9
                        ? "bg-destructive/20 border-destructive/40 text-destructive"
                        : n >= 7
                          ? "bg-orange/20 border-orange/40 text-orange"
                          : "bg-primary/20 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {priority === null ? "No priority selected" : `1 = lowest, 10 = highest`}
            </p>
          </div>

          {/* Questions (filtered by type) — always shown so spec fields aren't silent */}
          <div className="border-t border-border pt-6">
            <h2 className="text-s font-semibold text-foreground mb-1">
              {TASK_TYPES.find((t) => t.id === taskType)?.label} Questions
            </h2>
            <p className="text-xs text-muted-foreground mb-5">
              These decide whether a task is ready for the Backlog or stays in Missing Data. Add or edit them in Admin → Task Questions.
            </p>
          </div>

          {filteredQuestions.length > 0 ? (
            <div className="space-y-5">
              {filteredQuestions.map((q, i) => (
                <QuestionField
                  key={q.id}
                  question={q}
                  index={i}
                  value={answers[q.id] ?? ""}
                  onChange={(val) =>
                    setAnswers((prev) => ({ ...prev, [q.id]: val }))
                  }
                  showRequiredAs="all"
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center">
              <p className="text-s text-muted-foreground">
                No questions configured for this type yet.
              </p>
              <a
                href="/dashboard/admin?tab=questions"
                className="mt-2 inline-block text-s font-medium text-primary hover:underline"
              >
                Add fields in Task Questions
              </a>
            </div>
          )}

          {mandatoryErrors.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-s font-medium text-destructive mb-1">
                Please fill in these mandatory fields:
              </p>
              <ul className="space-y-0.5">
                {mandatoryErrors.map((q, i) => (
                  <li key={i} className="text-xs text-destructive/80">• {q}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" />}
              {saving ? "Creating..." : "Create Task"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
