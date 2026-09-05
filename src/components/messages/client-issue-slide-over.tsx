"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { NoteSlideOver } from "@/components/project/note-slide-over";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QuestionField } from "@/components/kanban/question-field";
import {
  getClientIssueForm,
  reportClientIssue,
  type ClientIssueType,
} from "@/actions/client-issue";
import { activityTheme } from "@/components/messages/activity-themes";
import { cn } from "@/lib/utils";

/**
 * The client's New Issue form.
 *
 * Which types appear is the admin's call in the Questions tab, and the
 * questions under each type are the same rows the team's own task forms use —
 * so whatever an admin curates there is exactly what the client is asked here.
 */
export function ClientIssueSlideOver({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [types, setTypes] = useState<ClientIssueType[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getClientIssueForm(projectId)
      .then((form) => {
        if (!live) return;
        setTypes(form.types);
        setSelected(form.types[0]?.taskType ?? null);
      })
      .catch(() => live && setTypes([]));
    return () => {
      live = false;
    };
  }, [projectId]);

  const active = types?.find((t) => t.taskType === selected) ?? null;

  // Answers are keyed by question id, and ids never collide across types, so
  // switching type keeps anything already typed if they switch back.
  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit() {
    if (!active || !title.trim()) return;
    const missing = active.questions.filter(
      (q) => q.mandatory && !answers[q.id]?.trim(),
    );
    if (missing.length > 0) {
      setError(`Please answer: ${missing.map((q) => q.question).join(", ")}`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await reportClientIssue({
        projectId,
        taskType: active.taskType,
        title: title.trim(),
        answers: active.questions
          .map((q) => ({ questionId: q.id, answer: answers[q.id] ?? "" }))
          .filter((a) => a.answer.trim()),
      });
      onClose();
    } catch (err) {
      setError(readableError(err));
      setSubmitting(false);
    }
  }

  return (
    <NoteSlideOver title="New issue" onClose={onClose}>
      <div className="mx-auto w-full max-w-2xl space-y-6 p-4 lg:p-6">
        {types === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : types.length === 0 ? (
          <p className="py-10 text-center text-s text-muted-foreground">
            Reporting isn&apos;t open on this project yet. Send your team a message
            here instead and they&apos;ll pick it up.
          </p>
        ) : (
          <>
            {types.length > 1 ? (
              <div>
                <p className="mb-2 text-s font-medium text-foreground">
                  What are you reporting?
                </p>
                <div className="flex flex-wrap gap-2">
                  {types.map((t) => {
                    const visual = activityTheme(t.taskType);
                    const Icon = visual.icon;
                    const on = t.taskType === selected;
                    return (
                      <button
                        key={t.taskType}
                        type="button"
                        onClick={() => setSelected(t.taskType)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3.5 py-2 text-s font-medium transition-colors",
                          on
                            ? cn(visual.theme.border, visual.theme.button)
                            : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
                        )}
                      >
                        <Icon className="size-3.5" strokeWidth={1.5} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div>
              <label
                htmlFor="client-issue-title"
                className="mb-1.5 block text-s font-medium text-foreground"
              >
                Summary <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="client-issue-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="One line on what went wrong or what you need"
                rows={2}
                autoFocus
              />
            </div>

            {active?.questions.map((q, i) => (
              <QuestionField
                key={q.id}
                question={q}
                index={i}
                value={answers[q.id] ?? ""}
                onChange={(value) => setAnswer(q.id, value)}
              />
            ))}

            {error ? <p className="text-s text-destructive">{error}</p> : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleSubmit()}
                disabled={submitting || !title.trim()}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending
                  </>
                ) : (
                  "Report issue"
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </NoteSlideOver>
  );
}

/** Unwrap the shape createTaskRecord throws when questions are unanswered. */
function readableError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Could not send that";
  if (!message.startsWith("MANDATORY_QUESTIONS:")) return message;
  try {
    const questions = JSON.parse(
      message.slice("MANDATORY_QUESTIONS:".length),
    ) as string[];
    return `Please answer: ${questions.join(", ")}`;
  } catch {
    return "Some required answers are missing";
  }
}
