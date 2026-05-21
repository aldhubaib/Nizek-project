"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, MessageCircleQuestion, List, Type, Sparkles, Wrench, Bug, Paperclip, AlertCircle, Palette } from "lucide-react";
import { addTaskQuestion, deleteTaskQuestion, updateTaskQuestion } from "@/actions/task-question";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type TaskType = "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";

interface Question {
  id: string;
  question: string;
  type: string;
  options: string | null;
  order: number;
  taskType: string;
}

interface Props {
  questions: Question[];
  projectId: string;
}

const TABS: { id: TaskType; label: string; icon: typeof Sparkles; color: string; activeColor: string }[] = [
  { id: "FEATURE", label: "Feature", icon: Sparkles, color: "text-muted-foreground", activeColor: "bg-primary/15 border-primary/40 text-primary" },
  { id: "ENHANCEMENT", label: "Enhancement", icon: Wrench, color: "text-muted-foreground", activeColor: "bg-violet-500/15 border-violet-500/40 text-violet-400" },
  { id: "BUG", label: "Internal Bug", icon: Bug, color: "text-muted-foreground", activeColor: "bg-amber-500/15 border-amber-500/40 text-amber-400" },
  { id: "REPORTED_BUG", label: "Reported Bug", icon: AlertCircle, color: "text-muted-foreground", activeColor: "bg-destructive/15 border-destructive/40 text-destructive" },
  { id: "DESIGN", label: "Design", icon: Palette, color: "text-muted-foreground", activeColor: "bg-cyan-500/15 border-cyan-500/40 text-cyan-400" },
];

export function TaskQuestionsManager({ questions, projectId }: Props) {
  const [activeType, setActiveType] = useState<TaskType>("FEATURE");
  const [newQuestion, setNewQuestion] = useState("");
  const [newType, setNewType] = useState<"text" | "select" | "file">("text");
  const [newOptions, setNewOptions] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editOptions, setEditOptions] = useState("");

  const filteredQuestions = useMemo(
    () => questions.filter((q) => q.taskType === activeType),
    [questions, activeType]
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    setAdding(true);
    try {
      const options =
        newType === "select"
          ? newOptions
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean)
          : undefined;

      await addTaskQuestion({
        projectId,
        question: newQuestion.trim(),
        type: newType,
        options,
        taskType: activeType,
      });
      setNewQuestion("");
      setNewOptions("");
      setNewType("text");
    } catch (err) {
      console.error(err);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(questionId: string) {
    try {
      await deleteTaskQuestion(questionId);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleUpdate(questionId: string) {
    if (!editValue.trim()) return;
    const q = questions.find((q) => q.id === questionId);
    try {
      const options = q?.type === "select"
        ? editOptions.split(",").map((o) => o.trim()).filter(Boolean)
        : undefined;
      await updateTaskQuestion({ questionId, question: editValue.trim(), options });
      setEditingId(null);
    } catch (err) {
      console.error(err);
    }
  }

  function getOptionsList(q: Question): string[] {
    if (!q.options) return [];
    try {
      return JSON.parse(q.options);
    } catch {
      return [];
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">
            Task Questions
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Questions shown when creating a task, organized by task type.
          </p>
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-2 mb-5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeType === tab.id;
          const count = questions.filter((q) => q.taskType === tab.id).length;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveType(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[12px] font-medium transition-colors",
                isActive ? tab.activeColor : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
              )}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              {tab.label}
              <span className="text-[10px] opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {filteredQuestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-8 rounded-lg border border-border bg-card">
          <MessageCircleQuestion className="w-8 h-8 text-muted-foreground opacity-50" strokeWidth={1.5} />
          <p className="text-[13px] text-muted-foreground">
            No questions for {TABS.find((t) => t.id === activeType)?.label} tasks yet.
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            Add questions below that must be answered when creating this type of task.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 mb-4">
          {filteredQuestions.map((q, i) => (
            <div
              key={q.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 group hover:border-muted-foreground/20 transition-colors"
            >
              <span className="text-[11px] text-muted-foreground font-mono w-5 shrink-0">
                {i + 1}.
              </span>
              {editingId === q.id ? (
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-7 text-[13px] flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && q.type !== "select") handleUpdate(q.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                    <Button size="sm" onClick={() => handleUpdate(q.id)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                  {q.type === "select" && (
                    <Input
                      value={editOptions}
                      onChange={(e) => setEditOptions(e.target.value)}
                      placeholder="Options (comma-separated): iOS, Android, Web..."
                      className="h-7 text-[12px]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdate(q.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                  )}
                </div>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditingId(q.id);
                      setEditValue(q.question);
                      setEditOptions(getOptionsList(q).join(", "));
                    }}
                    className="flex-1 text-left min-w-0"
                  >
                    <span className="text-[13px] text-foreground hover:text-primary transition-colors block truncate">
                      {q.question}
                    </span>
                    {q.type === "select" && (
                      <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mt-0.5">
                        <List className="w-3 h-3" />
                        {getOptionsList(q).join(", ")}
                      </span>
                    )}
                  </button>

                  <span className="text-[10px] text-muted-foreground/50 font-mono shrink-0">
                    {q.type === "select" ? "dropdown" : q.type === "file" ? "file" : "text"}
                  </span>

                  <button
                    onClick={() => handleDelete(q.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="space-y-2 mt-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Input
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder={`Add a question for ${TABS.find((t) => t.id === activeType)?.label} tasks...`}
            className="h-8 text-[13px] flex-1"
          />
          <Select value={newType} onValueChange={(val) => val && setNewType(val as "text" | "select" | "file")}>
            <SelectTrigger className="w-[110px] h-8 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">
                <Type className="w-3.5 h-3.5 mr-1" />
                Text
              </SelectItem>
              <SelectItem value="select">
                <List className="w-3.5 h-3.5 mr-1" />
                Dropdown
              </SelectItem>
              <SelectItem value="file">
                <Paperclip className="w-3.5 h-3.5 mr-1" />
                File
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {newType === "select" && (
          <Input
            value={newOptions}
            onChange={(e) => setNewOptions(e.target.value)}
            placeholder="Options (comma-separated): Client, Admin, Vendor..."
            className="h-8 text-[12px]"
          />
        )}

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={adding || !newQuestion.trim()}>
            <Plus className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
            {adding ? "Adding..." : "Add Question"}
          </Button>
        </div>
      </form>
    </div>
  );
}
