"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { createMeetingNote } from "@/actions/meeting-note";
import { ROADMAP_COLUMNS, roadmapScheduleError, type RoadmapStatus } from "@/lib/roadmap-status";
import { parseWorkingDays } from "@/lib/working-days";
import { cn } from "@/lib/utils";

export function TaskRoadmapEditor({
  task,
  projectId,
  taskTypeMeta,
  onClose,
  onSaved,
}: {
  task: { id: string; title: string; taskNumber: number };
  projectId: string;
  taskTypeMeta: { prefix: string; label: string; color: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [content, setContent] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [workingDays, setWorkingDays] = useState("");
  const [workingDaysError, setWorkingDaysError] = useState<string | null>(null);
  const [roadmapStatus, setRoadmapStatus] = useState<RoadmapStatus>("PLANNED");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim() || saving) return;
    let days: number | null = null;
    try {
      days = parseWorkingDays(workingDays);
      setWorkingDaysError(null);
    } catch (e) {
      setWorkingDaysError(e instanceof Error ? e.message : "Invalid working days");
      return;
    }
    const blocked = roadmapScheduleError(roadmapStatus, dueDate || null, days);
    if (blocked) {
      setWorkingDaysError(blocked);
      return;
    }
    setSaving(true);
    try {
      await createMeetingNote({
        projectId,
        title: title.trim(),
        content,
        date: new Date().toISOString().split("T")[0],
        noteType: "DEADLINE",
        ...(dueDate ? { dueDate } : {}),
        workingDays: days,
        roadmapStatus,
        taskId: task.id,
      });
      onSaved();
    } catch (err) {
      setWorkingDaysError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col">
      <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="text-[11px] text-muted-foreground/50">|</span>
          <span className={`text-[12px] font-medium ${taskTypeMeta.color}`}>
            {taskTypeMeta.prefix}-{String(task.taskNumber).padStart(3, "0")}
          </span>
          <span className="text-[12px] text-muted-foreground truncate max-w-[200px]">{task.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 sm:px-16 py-10">
          <div className="mb-6">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${taskTypeMeta.color} bg-muted/50 border-border`}>
              {taskTypeMeta.label} Roadmap
            </span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Roadmap item title..."
            className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-6"
            autoFocus
          />
          <div className="flex items-center gap-3 mb-8 pb-6 border-b border-border/50">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Due Date</label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-auto text-[13px] h-8"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">Required before Next</p>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Working Days</label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="e.g. 5"
                  value={workingDays}
                  onChange={(e) => {
                    setWorkingDays(e.target.value);
                    setWorkingDaysError(null);
                  }}
                  className="w-28 text-[13px] h-8"
                />
                {workingDaysError ? (
                  <p className="text-[10px] text-destructive mt-0.5">{workingDaysError}</p>
                ) : (
                  <p className="text-[10px] text-muted-foreground mt-0.5">Required before Next</p>
                )}
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Status</label>
                <div className="flex flex-wrap gap-1">
                  {ROADMAP_COLUMNS.map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => setRoadmapStatus(col.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                        roadmapStatus === col.id
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {col.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <RichTextEditor content={content} onChange={setContent} placeholder="Notes about this item... (type / for commands)" borderless projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
