"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageCircleQuestion, History } from "lucide-react";
import { saveTaskAnswers } from "@/actions/task-question";
import { QuestionField, type TaskQuestion } from "@/components/kanban/question-field";
import { ActivityTimeline } from "@/components/kanban/activity-timeline";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: number;
  taskType: string;
  stage: string;
  assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  createdBy: { id: string; name: string | null };
  createdAt: Date;
}

interface QuestionWithType extends TaskQuestion {
  taskType: string;
}

interface Props {
  task: Task;
  projectId: string;
  projectName: string;
  questions: QuestionWithType[];
  initialAnswers: Record<string, string>;
}

export function TaskDetailView({ task, projectId, projectName, questions: allQuestions, initialAnswers }: Props) {
  const questions = allQuestions.filter((q) => q.taskType === task.taskType);
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activityKey, setActivityKey] = useState(0);

  async function handleSave() {
    setSaving(true);
    try {
      await saveTaskAnswers({
        taskId: task.id,
        answers: questions.map((q) => ({
          questionId: q.id,
          answer: answers[q.id] ?? "",
        })),
      });
      setDirty(false);
      setActivityKey((k) => k + 1);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="h-12 flex items-center gap-3 px-6 border-b border-border shrink-0">
        <button
          onClick={() => router.push(`/dashboard/projects/${projectId}`)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-muted-foreground font-mono truncate">
            {projectName}
          </span>
          <span className="text-[11px] text-muted-foreground/40">/</span>
          <h1 className="text-sm font-semibold truncate">{task.title}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Task meta */}
        <div className="flex flex-wrap items-center gap-2.5 mb-6">
          <span className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
            task.taskType === "BUG" ? "bg-destructive/15 border-destructive/20 text-destructive"
              : task.taskType === "ENHANCEMENT" ? "bg-violet-500/15 border-violet-500/20 text-violet-400"
              : "bg-primary/15 border-primary/20 text-primary"
          )}>
            {task.taskType === "BUG" ? "Bug" : task.taskType === "ENHANCEMENT" ? "Enhancement" : "Feature"}
          </span>
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold bg-muted text-muted-foreground border-border tabular-nums">
            P{task.priority}
          </span>
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold bg-muted text-muted-foreground border-border">
            {task.stage.replaceAll("_", " ")}
          </span>
          {task.assignee && (
            <span className="text-[11px] text-muted-foreground">
              Assigned to {task.assignee.name ?? "Unknown"}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground/50 ml-auto">
            Created by {task.createdBy.name ?? "Unknown"}
          </span>
        </div>

        {task.description && (
          <p className="text-[13px] text-muted-foreground mb-6 leading-relaxed">
            {task.description}
          </p>
        )}

        {/* Questions */}
        {questions.length > 0 && (
          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-2 mb-5">
              <MessageCircleQuestion className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
              <h2 className="text-[13px] font-semibold">
                {task.taskType === "BUG" ? "Bug" : task.taskType === "ENHANCEMENT" ? "Enhancement" : "Feature"} Questions
              </h2>
            </div>

            <div className="space-y-5">
              {questions.map((q, i) => (
                <QuestionField
                  key={q.id}
                  question={q}
                  index={i}
                  value={answers[q.id] ?? ""}
                  onChange={(val) => {
                    setAnswers((prev) => ({ ...prev, [q.id]: val }));
                    setDirty(true);
                  }}
                />
              ))}
            </div>

            {dirty && (
              <div className="flex justify-end mt-6">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save Answers"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Activity */}
        <div className="border-t border-border pt-6 mt-6">
          <div className="flex items-center gap-2 mb-5">
            <History className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <h2 className="text-[13px] font-semibold">Activity</h2>
          </div>
          <ActivityTimeline taskId={task.id} refreshKey={activityKey} />
        </div>
      </div>
    </div>
  );
}
