"use client";

import * as React from "react";
import { CheckCircle2, Clock, Video } from "lucide-react";

import { getActiveContract, getAllowedTaskTypes } from "@/lib/contract-rules";
import { canHandOverVideo, nameList, type ProofVideoMode } from "@/lib/proof-video-mode";
import { DEFAULT_TASK_PRIORITY, priorityLabel, TASK_PRIORITIES, taskTypeLabel, type TaskPriorityId } from "@/lib/task-label";
import { stageLabel } from "@/lib/task-label";
import type { ProjectDetail } from "@/next-ui/data/projects";
import {
  taskErrorText,
  uploadAttachments,
  useCreateTask,
  useDeclineTask,
  useProofBypassStatus,
  useProofVideoSettings,
  useRequestProofBypass,
  useSubmitProof,
  type TaskRow,
} from "@/next-ui/data/tasks";
import { ConfirmDialog, ErrorNote, EstimateField, FilePicker, InfoNote, type PickedFile } from "@/next-ui/patterns/form-bits";
import { RichTextEditor } from "@/next-ui/patterns/rich-text-editor";
import { Button } from "@/next-ui/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/next-ui/ui/dialog";
import { Input } from "@/next-ui/ui/input";
import { Label } from "@/next-ui/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/next-ui/ui/select";
import { Textarea } from "@/next-ui/ui/textarea";

import type { ViewerRights } from "./project-screen";
import { PriorityMark, TaskTypeIcon } from "./task-marks";

/**
 * The dialogs a task move can open, the live board's checkpoints: an estimate on the way into
 * In development, the proof video on the way into Internal review (as the project's video rule
 * says), a word of approval on the way to Done, and a reason with files when a task is sent
 * back from review. Plus the one that makes a task. Each calls the same server action the
 * live panel calls and closes when it succeeds; a refusal stays on screen in its words.
 */

export type TaskType = "FEATURE" | "ENHANCEMENT" | "BUG" | "REPORTED_BUG" | "DESIGN";
const ALL_TYPES: TaskType[] = ["FEATURE", "ENHANCEMENT", "BUG", "REPORTED_BUG", "DESIGN"];

/** The kinds of task the project's contract allows (every kind for a system admin). */
export function allowedTaskTypes(p: Pick<ProjectDetail, "contracts">, isSystemAdmin: boolean): TaskType[] {
  const active = getActiveContract(p.contracts as Parameters<typeof getActiveContract>[0]);
  if (!active) return isSystemAdmin ? ALL_TYPES : [];
  return getAllowedTaskTypes(active.contractType, isSystemAdmin) as TaskType[];
}

export function NewTaskDialog({ project: p, rights, open, onClose }: { project: ProjectDetail; rights: ViewerRights; open: boolean; onClose: () => void }) {
  const create = useCreateTask(p.id);
  const types = allowedTaskTypes(p, rights.isSystemAdmin);
  const [draft, setDraft] = React.useState({ title: "", taskType: types[0] ?? "FEATURE", priority: DEFAULT_TASK_PRIORITY as TaskPriorityId, description: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [seen, setSeen] = React.useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setDraft({ title: "", taskType: types[0] ?? "FEATURE", priority: DEFAULT_TASK_PRIORITY, description: "" });
      setError(null);
    }
  }
  const title = draft.title.trim();
  const canSave = title !== "" && !create.isPending && types.length > 0;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    create.mutate(
      { title, taskType: draft.taskType, priority: draft.priority, description: draft.description || undefined },
      { onSuccess: onClose, onError: (err) => setError(taskErrorText(err)) },
    );
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="new-task-dialog">
        <form onSubmit={save} className="contents">
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>It starts in the backlog; its details can be filled in on the task itself.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-task-title">Title</Label>
              <Input id="new-task-title" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} required maxLength={200} autoFocus data-testid="new-task-title" />
            </div>
            <div className="grid gap-4 @sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-task-type">Kind</Label>
                <Select value={draft.taskType} onValueChange={(v) => setDraft((d) => ({ ...d, taskType: v as TaskType }))}>
                  <SelectTrigger id="new-task-type" className="w-full" data-testid="new-task-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t} value={t}>
                        <TaskTypeIcon taskType={t} className="size-3.5" />
                        {taskTypeLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-task-priority">Priority</Label>
                <Select value={draft.priority} onValueChange={(v) => setDraft((d) => ({ ...d, priority: v as TaskPriorityId }))}>
                  <SelectTrigger id="new-task-priority" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((pr) => (
                      <SelectItem key={pr} value={pr}>
                        <PriorityMark priority={pr} className="size-3.5" />
                        {priorityLabel(pr)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-task-description">Description</Label>
              <RichTextEditor id="new-task-description" value={draft.description} onChange={(html) => setDraft((d) => ({ ...d, description: html }))} placeholder="What is it, and why? (optional)" minHeight="6rem" />
            </div>
            {types.length === 0 && <InfoNote>This project has no active contract, so no tasks can be added.</InfoNote>}
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSave} data-testid="new-task-save">
              {create.isPending ? "Adding…" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Entering In development without an estimate: the move waits for one. */
export function EstimateDialog({ open, task, onClose, onConfirm }: { open: boolean; task: TaskRow | null; onClose: () => void; onConfirm: (minutes: number) => Promise<unknown> | unknown }) {
  const [minutes, setMinutes] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [seen, setSeen] = React.useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setMinutes(task?.estimatedMinutes ?? null);
      setError(null);
      setBusy(false);
    }
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!minutes || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(minutes);
      onClose();
    } catch (err) {
      setError(taskErrorText(err));
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm" data-testid="estimate-dialog">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Estimate</DialogTitle>
            <DialogDescription>{task ? `How long should "${task.title}" take? Development starts once it has an estimate.` : ""}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="estimate">Estimate</Label>
              <div className="relative">
                <Clock className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <EstimateField id="estimate" value={minutes} onChange={setMinutes} autoFocus className="ps-8" />
              </div>
              <p className="text-xs text-muted-foreground">Hours and minutes: “2h”, “45m”, “1h 30m”.</p>
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!minutes || busy} data-testid="estimate-save">
              {busy ? "Starting…" : "Start development"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Internal review → Done: a word of approval, as on the live board. */
export function ApproveDialog({ open, task, onClose, onConfirm }: { open: boolean; task: TaskRow | null; onClose: () => void; onConfirm: () => Promise<unknown> | unknown }) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Move to Done"
      description={task ? `By moving "${task.title}" to Done you confirm you have reviewed the work and it is ready to ship with the sprint.` : ""}
      confirmLabel="Approve"
      busyLabel="Approving…"
      onConfirm={onConfirm}
      testId="approve-dialog"
    />
  );
}

/** Internal review → In development: why, with any files that show it. */
export function DeclineDialog({ open, task, projectId, onClose, onDone }: { open: boolean; task: TaskRow | null; projectId: string; onClose: () => void; onDone?: () => void }) {
  const decline = useDeclineTask(projectId);
  const [comment, setComment] = React.useState("");
  const [files, setFiles] = React.useState<PickedFile[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [seen, setSeen] = React.useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setComment("");
      setFiles([]);
      setError(null);
      setBusy(false);
    }
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || comment.trim() === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const attachments = await uploadAttachments(
        files.map((f) => f.file),
        (i, pct) => setFiles((prev) => prev.map((f, j) => (j === i ? { ...f, progress: pct } : f))),
      );
      await decline.mutateAsync({ taskId: task.id, comment: comment.trim(), attachments });
      onDone?.();
      onClose();
    } catch (err) {
      setError(taskErrorText(err));
      setBusy(false);
      setFiles((prev) => prev.map((f) => ({ file: f.file })));
    }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="decline-dialog">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Send back to development</DialogTitle>
            <DialogDescription>{task ? `"${task.title}" goes back to In development with your note; the developer is told.` : ""}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="decline-comment">What needs to change</Label>
              <Textarea id="decline-comment" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} required autoFocus data-testid="decline-comment" />
            </div>
            <FilePicker files={files} onChange={setFiles} label="Attach files" disabled={busy} />
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={comment.trim() === "" || busy} data-testid="decline-save">
              {busy ? "Sending…" : "Send back"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The proof video on the way into Internal review. "Default": the person uploads it.
 * "Assign": they may upload it, or ask the project's uploaders to do it for them and wait.
 * ("No video" never opens this: the board moves the task straight away.)
 */
export function ProofDialog({ open, task, projectId, order, mode, onClose, onDone }: { open: boolean; task: TaskRow | null; projectId: string; order: number; mode: ProofVideoMode; onClose: () => void; onDone?: () => void }) {
  const submit = useSubmitProof(projectId);
  const settings = useProofVideoSettings(projectId, open && canHandOverVideo(mode));
  const status = useProofBypassStatus(task?.id ?? "", open && canHandOverVideo(mode));
  const ask = useRequestProofBypass(task?.id ?? "");
  const [files, setFiles] = React.useState<PickedFile[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [seen, setSeen] = React.useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setFiles([]);
      setError(null);
      setBusy(false);
    }
  }
  const uploaders = settings.data?.uploaders ?? [];
  const uploaderNames = nameList(uploaders.map((u) => u.name ?? "someone"));
  const pending = status.data?.status === "PENDING" ? status.data : null;
  const approved = status.data?.status === "APPROVED" ? status.data : null;

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || files.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const videos = await uploadAttachments(
        files.map((f) => f.file),
        (i, pct) => setFiles((prev) => prev.map((f, j) => (j === i ? { ...f, progress: pct } : f))),
      );
      await submit.mutateAsync({ taskId: task.id, order, videos });
      onDone?.();
      onClose();
    } catch (err) {
      setError(taskErrorText(err));
      setBusy(false);
      setFiles((prev) => prev.map((f) => ({ file: f.file })));
    }
  };
  const useApproved = async () => {
    if (!task || busy) return;
    setBusy(true);
    setError(null);
    try {
      await submit.mutateAsync({ taskId: task.id, order, videos: [], useBypass: true });
      onDone?.();
      onClose();
    } catch (err) {
      setError(taskErrorText(err));
      setBusy(false);
    }
  };
  const request = () => {
    setError(null);
    ask.mutate(undefined, { onError: (err) => setError(taskErrorText(err)) });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="proof-dialog">
        <form onSubmit={upload} className="contents">
          <DialogHeader>
            <DialogTitle>Proof of work</DialogTitle>
            <DialogDescription>{task ? `A video of "${task.title}" working, before it goes to Internal review.` : ""}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <FilePicker files={files} onChange={setFiles} accept="video/*" label="Choose videos" disabled={busy || Boolean(pending)} testId="proof-files" />
            {canHandOverVideo(mode) && (
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm" data-testid="proof-handover">
                {pending ? (
                  <span className="text-muted-foreground">{`Waiting for ${uploaderNames || "an uploader"} to upload the video. The task moves on when they do.`}</span>
                ) : approved ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-success">
                      <CheckCircle2 className="size-4" />
                      {`${approved.approvedByName ?? "A manager"} waived the video for this task.`}
                    </span>
                    <Button type="button" variant="outline" size="sm" className="self-start" disabled={busy} onClick={useApproved}>
                      Move without a video
                    </Button>
                  </>
                ) : uploaders.length > 0 ? (
                  <>
                    <span className="text-muted-foreground">Can’t record it yourself?</span>
                    <Button type="button" variant="outline" size="sm" className="self-start" disabled={busy || ask.isPending} onClick={request} data-testid="proof-ask">
                      <Video />
                      {ask.isPending ? "Asking…" : `Ask ${uploaderNames} to upload it`}
                    </Button>
                  </>
                ) : (
                  <span className="text-muted-foreground">Nobody is assigned to upload videos for others yet; a project admin can assign people in Settings.</span>
                )}
              </div>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                {pending ? "Close" : "Cancel"}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={files.length === 0 || busy || Boolean(pending)} data-testid="proof-save">
              {busy ? "Uploading…" : "Upload and move to review"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The one line a refused move leaves on the board, with the stages named. */
export function moveRefusedText(from: string, to: string, err: unknown): string {
  const text = taskErrorText(err);
  if (/permission|your role/i.test(text)) return text;
  return `${stageLabel(from)} → ${stageLabel(to)}: ${text}`;
}
