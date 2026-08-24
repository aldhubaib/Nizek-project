"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { createMeetingNote } from "@/actions/meeting-note";

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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim() || saving) return;
    setSaveError(null);
    setSaving(true);
    try {
      await createMeetingNote({
        projectId,
        title: title.trim(),
        content,
        date: new Date().toISOString().split("T")[0],
        noteType: "ROADMAP",
        roadmapStatus: "PLANNED",
        taskId: task.id,
      });
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col">
      <div className="flex app-top-bar items-center justify-between border-b border-border px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-2 text-s text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="text-xs text-muted-foreground/50">|</span>
          <span className={`text-s font-medium ${taskTypeMeta.color}`}>
            {taskTypeMeta.prefix}-{String(task.taskNumber).padStart(3, "0")}
          </span>
          <span className="text-s text-muted-foreground truncate max-w-[200px]">{task.title}</span>
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
            <span className={`inline-flex items-center gap-xs rounded-full border px-3 py-1 text-xs font-semibold ${taskTypeMeta.color} bg-muted/50 border-border`}>
              {taskTypeMeta.label} Roadmap
            </span>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Roadmap item title..."
            className="w-full text-m font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 mb-6"
            autoFocus
          />
          <div className="mb-8 pb-6 border-b border-border/50">
            {saveError ? (
              <p className="text-xs text-destructive">{saveError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                New items start in Planned. Drag on the board to change status.
              </p>
            )}
          </div>
          <RichTextEditor content={content} onChange={setContent} placeholder="Notes about this item... (type / for commands)" borderless projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
