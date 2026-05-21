"use client";

import { useState, useMemo, useId } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, MessageCircleQuestion, List, Type, Sparkles, Wrench, Bug, Paperclip, GripVertical, Link, UserRound, AlertCircle, Palette } from "lucide-react";
import { addDefaultQuestion, deleteDefaultQuestion, updateDefaultQuestion, reorderDefaultQuestions } from "@/actions/default-question";
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
  mandatory: boolean;
  required: boolean;
  order: number;
  taskType: string;
}

interface Props {
  questions: Question[];
}

const TABS: { id: TaskType; label: string; icon: typeof Sparkles; color: string; activeColor: string }[] = [
  { id: "FEATURE", label: "Feature", icon: Sparkles, color: "text-muted-foreground", activeColor: "bg-primary/15 border-primary/40 text-primary" },
  { id: "ENHANCEMENT", label: "Enhancement", icon: Wrench, color: "text-muted-foreground", activeColor: "bg-violet-500/15 border-violet-500/40 text-violet-400" },
  { id: "BUG", label: "Internal Bug", icon: Bug, color: "text-muted-foreground", activeColor: "bg-amber-500/15 border-amber-500/40 text-amber-400" },
  { id: "REPORTED_BUG", label: "Reported Bug", icon: AlertCircle, color: "text-muted-foreground", activeColor: "bg-destructive/15 border-destructive/40 text-destructive" },
  { id: "DESIGN", label: "Design", icon: Palette, color: "text-muted-foreground", activeColor: "bg-cyan-500/15 border-cyan-500/40 text-cyan-400" },
];

function SortableQuestionItem({
  q,
  index,
  editingId,
  editValue,
  editOptions,
  editMandatory,
  editRequired,
  setEditingId,
  setEditValue,
  setEditOptions,
  setEditMandatory,
  setEditRequired,
  onUpdate,
  onDelete,
  onToggleField,
  getOptionsList,
}: {
  q: Question;
  index: number;
  editingId: string | null;
  editValue: string;
  editOptions: string;
  editMandatory: boolean;
  editRequired: boolean;
  setEditingId: (id: string | null) => void;
  setEditValue: (v: string) => void;
  setEditOptions: (v: string) => void;
  setEditMandatory: (v: boolean) => void;
  setEditRequired: (v: boolean) => void;
  onUpdate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleField: (id: string, field: "mandatory" | "required", value: boolean) => void;
  getOptionsList: (q: Question) => string[];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: q.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 group hover:border-muted-foreground/20 transition-colors",
        isDragging && "opacity-50 shadow-lg border-primary/30 z-50"
      )}
    >
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0 touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
      <span className="text-[11px] text-muted-foreground font-mono w-5 shrink-0">
        {index + 1}.
      </span>
      {editingId === q.id ? (
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="h-7 text-[13px] flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.type !== "select") onUpdate(q.id);
                if (e.key === "Escape") setEditingId(null);
              }}
              autoFocus
            />
            <Button size="sm" onClick={() => onUpdate(q.id)}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
          </div>
          {q.type === "select" && (
            <Input
              value={editOptions}
              onChange={(e) => setEditOptions(e.target.value)}
              placeholder="Options (comma-separated): iOS, Android, Web..."
              className="h-7 text-[12px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") onUpdate(q.id);
                if (e.key === "Escape") setEditingId(null);
              }}
            />
          )}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={editMandatory ?? false}
                onChange={(e) => setEditMandatory(e.target.checked)}
                className="rounded border-border accent-destructive w-3.5 h-3.5"
              />
              <span className="text-[11px] text-muted-foreground">Mandatory</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={editRequired ?? false}
                onChange={(e) => setEditRequired(e.target.checked)}
                className="rounded border-border accent-amber-500 w-3.5 h-3.5"
              />
              <span className="text-[11px] text-muted-foreground">Required before transition</span>
            </label>
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={() => {
              setEditingId(q.id);
              setEditValue(q.question);
              setEditOptions(getOptionsList(q).join(", "));
              setEditMandatory(q.mandatory);
              setEditRequired(q.required);
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
                    {q.type === "select" ? "dropdown" : q.type === "file" ? "file" : q.type === "link" ? "link" : q.type === "client" ? "client" : "text"}
          </span>
          <button
            onClick={() => onToggleField(q.id, "mandatory", !q.mandatory)}
            className={cn(
              "text-[10px] font-medium rounded px-1.5 py-0.5 border transition-colors shrink-0",
              q.mandatory
                ? "bg-destructive/10 border-destructive/30 text-destructive"
                : "bg-muted border-border text-muted-foreground/50 hover:border-muted-foreground/40 hover:text-muted-foreground"
            )}
            title={q.mandatory ? "Mandatory — click to remove" : "Click to make mandatory on creation"}
          >
            {q.mandatory ? "Mandatory" : "Optional"}
          </button>
          <button
            onClick={() => onToggleField(q.id, "required", !q.required)}
            className={cn(
              "text-[10px] font-medium rounded px-1.5 py-0.5 border transition-colors shrink-0",
              q.required
                ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                : "bg-muted border-border text-muted-foreground/50 hover:border-muted-foreground/40 hover:text-muted-foreground"
            )}
            title={q.required ? "Required before transition — click to remove" : "Click to require before stage transition"}
          >
            {q.required ? "Before transition" : ""}
          </button>
          <button
            onClick={() => onDelete(q.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80 p-1"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </>
      )}
    </div>
  );
}

export function DefaultQuestionsManager({ questions }: Props) {
  const dndId = useId();
  const [activeType, setActiveType] = useState<TaskType>("FEATURE");
  const [newQuestion, setNewQuestion] = useState("");
  const [newType, setNewType] = useState<"text" | "select" | "file" | "link" | "client">("text");
  const [newOptions, setNewOptions] = useState("");
  const [adding, setAdding] = useState(false);
  const [newMandatory, setNewMandatory] = useState(false);
  const [newRequired, setNewRequired] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editOptions, setEditOptions] = useState("");
  const [editMandatory, setEditMandatory] = useState(false);
  const [editRequired, setEditRequired] = useState(false);

  const filteredQuestions = useMemo(
    () => questions.filter((q) => q.taskType === activeType),
    [questions, activeType]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredQuestions.findIndex((q) => q.id === active.id);
    const newIndex = filteredQuestions.findIndex((q) => q.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(filteredQuestions, oldIndex, newIndex);
    try {
      await reorderDefaultQuestions(reordered.map((q) => q.id));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    setAdding(true);
    try {
      const options =
        newType === "select"
          ? newOptions.split(",").map((o) => o.trim()).filter(Boolean)
          : undefined;

      await addDefaultQuestion({
        question: newQuestion.trim(),
        type: newType,
        options,
        mandatory: newMandatory,
        required: newRequired,
        taskType: activeType,
      });
      setNewQuestion("");
      setNewOptions("");
      setNewType("text");
      setNewMandatory(false);
      setNewRequired(false);
    } catch (err) {
      console.error(err);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(questionId: string) {
    try {
      await deleteDefaultQuestion(questionId);
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
      await updateDefaultQuestion({ questionId, question: editValue.trim(), options, mandatory: editMandatory, required: editRequired });
      setEditingId(null);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleToggleField(questionId: string, field: "mandatory" | "required", value: boolean) {
    try {
      await updateDefaultQuestion({ questionId, [field]: value });
    } catch (err) {
      console.error(err);
    }
  }

  function getOptionsList(q: Question): string[] {
    if (!q.options) return [];
    try { return JSON.parse(q.options); } catch { return []; }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">
            Task Questions
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            These questions apply to all projects. Changes here affect every project immediately.
          </p>
        </div>
      </div>

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
            Add questions below — they apply to all projects.
          </p>
        </div>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredQuestions.map((q) => q.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1.5 mb-4">
              {filteredQuestions.map((q, i) => (
                <SortableQuestionItem
                  key={q.id}
                  q={q}
                  index={i}
                  editingId={editingId}
                  editValue={editValue}
                  editOptions={editOptions}
                  editMandatory={editMandatory}
                  editRequired={editRequired}
                  setEditingId={setEditingId}
                  setEditValue={setEditValue}
                  setEditOptions={setEditOptions}
                  setEditMandatory={setEditMandatory}
                  setEditRequired={setEditRequired}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onToggleField={handleToggleField}
                  getOptionsList={getOptionsList}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <form onSubmit={handleAdd} className="space-y-2 mt-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Input
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder={`Add a question for ${TABS.find((t) => t.id === activeType)?.label} tasks...`}
            className="h-8 text-[13px] flex-1"
          />
          <Select value={newType} onValueChange={(val) => val && setNewType(val as "text" | "select" | "file" | "link" | "client")}>
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
              <SelectItem value="link">
                <Link className="w-3.5 h-3.5 mr-1" />
                Link
              </SelectItem>
              <SelectItem value="client">
                <UserRound className="w-3.5 h-3.5 mr-1" />
                Client
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

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newMandatory}
                onChange={(e) => setNewMandatory(e.target.checked)}
                className="rounded border-border accent-destructive w-3.5 h-3.5"
              />
              <span className="text-[12px] text-muted-foreground">Mandatory</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
                className="rounded border-border accent-amber-500 w-3.5 h-3.5"
              />
              <span className="text-[12px] text-muted-foreground">Required before transition</span>
            </label>
          </div>
          <Button type="submit" size="sm" disabled={adding || !newQuestion.trim()}>
            <Plus className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} />
            {adding ? "Adding..." : "Add Question"}
          </Button>
        </div>
      </form>
    </div>
  );
}
