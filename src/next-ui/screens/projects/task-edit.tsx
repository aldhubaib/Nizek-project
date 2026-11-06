"use client";

import * as React from "react";
import { format } from "date-fns";
import { Check, Loader2, Paperclip, Send, Trash2, X } from "lucide-react";

import { formatFileSize } from "@/next-ui/blocks/format";
import { taskErrorText, uploadAttachments, useAddComment, useDeleteComment, useTaskComments, type TaskComment, type TaskPanel } from "@/next-ui/data/tasks";
import { cn } from "@/next-ui/lib/cn";
import { ErrorNote, FilePicker, type PickedFile } from "@/next-ui/patterns/form-bits";
import { Avatar, AvatarFallback, AvatarImage } from "@/next-ui/ui/avatar";
import { Button } from "@/next-ui/ui/button";
import { Checkbox } from "@/next-ui/ui/checkbox";
import { Input } from "@/next-ui/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/next-ui/ui/select";
import { Textarea } from "@/next-ui/ui/textarea";

import { parseAnswer, type Answer } from "./task-answers";

/**
 * The pieces of the task form: a field saved on its own as it is changed (with a small mark
 * that says when), each question's input the way the live panel stores its answer, and the
 * comments under the task, with files. Everything goes through the task actions the live
 * panel calls.
 */

type Question = TaskPanel["questions"][number];

/* ------------------------------------------------------------------------------------------ */
/* Saving field by field                                                                       */
/* ------------------------------------------------------------------------------------------ */

export type SaveState = "saving" | "saved" | "error";

/**
 * Fields that save themselves: `schedule(key, save)` runs `save` after a short pause (typing
 * gathers into one write), `now(key, save)` runs it at once (a choice made), `flush(key)` runs
 * what is pending (a field left). `state[key]` says what is happening for the field's mark. On
 * unmount, what is pending is sent.
 */
export function useAutosave(delay = 800) {
  const [state, setState] = React.useState<Record<string, SaveState>>({});
  const timers = React.useRef<Record<string, number>>({});
  const pending = React.useRef<Record<string, () => Promise<unknown>>>({});
  const clears = React.useRef<Record<string, number>>({});

  const mark = React.useCallback((key: string, s: SaveState | null) => {
    setState((prev) => {
      const next = { ...prev };
      if (s) next[key] = s;
      else delete next[key];
      return next;
    });
  }, []);

  const now = React.useCallback(
    async (key: string, save: () => Promise<unknown>) => {
      if (timers.current[key]) window.clearTimeout(timers.current[key]);
      delete timers.current[key];
      delete pending.current[key];
      if (clears.current[key]) window.clearTimeout(clears.current[key]);
      mark(key, "saving");
      try {
        await save();
        mark(key, "saved");
        clears.current[key] = window.setTimeout(() => mark(key, null), 1500);
      } catch {
        mark(key, "error");
      }
    },
    [mark],
  );

  const flush = React.useCallback(
    (key: string) => {
      const save = pending.current[key];
      if (save) void now(key, save);
    },
    [now],
  );

  const schedule = React.useCallback(
    (key: string, save: () => Promise<unknown>) => {
      pending.current[key] = save;
      if (timers.current[key]) window.clearTimeout(timers.current[key]);
      timers.current[key] = window.setTimeout(() => flush(key), delay);
    },
    [delay, flush],
  );

  React.useEffect(() => {
    const timerMap = timers.current;
    const pendingMap = pending.current;
    const clearMap = clears.current;
    return () => {
      for (const id of Object.values(timerMap)) window.clearTimeout(id);
      for (const id of Object.values(clearMap)) window.clearTimeout(id);
      for (const save of Object.values(pendingMap)) void save();
    };
  }, []);

  return { state, schedule, now, flush };
}

/** The small word beside a field's label: "Saving…", "Saved", or "Not saved" when the server refused. */
export function SaveMark({ state }: { state: SaveState | undefined }) {
  if (!state) return null;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 text-xs", state === "saving" && "text-muted-foreground", state === "saved" && "text-success", state === "error" && "text-destructive")}
      role="status"
      data-testid="save-mark"
      data-state={state}
    >
      {state === "saving" ? <Loader2 className="size-3 animate-spin" /> : state === "saved" ? <Check className="size-3" strokeWidth={3} /> : null}
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Not saved"}
    </span>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Answers                                                                                     */
/* ------------------------------------------------------------------------------------------ */

function optionsOf(q: Question): string[] {
  if (!q.options) return [];
  try {
    const parsed = JSON.parse(q.options);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return q.options.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

/**
 * One question's input, by its type: a line for a link, a list or checkboxes for a choice,
 * files that upload as they are chosen, the client question's two answers, and a box of text
 * for the rest. `missing` marks a required answer that is still empty.
 */
export function QuestionInput({
  id,
  question: q,
  value,
  missing,
  onChange,
  onBlur,
  onUploading,
  onError,
}: {
  id: string;
  question: Question;
  value: string;
  missing?: boolean;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onUploading: (on: boolean) => void;
  onError: (text: string | null) => void;
}) {
  const a = parseAnswer(q, value);
  const invalid = missing ? true : undefined;
  switch (q.type) {
    case "link":
      return <Input id={id} type="url" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder="https://" aria-invalid={invalid} dir="ltr" />;
    case "select": {
      const options = optionsOf(q);
      if (q.multiple) {
        const chosen = a.kind === "choices" ? a.values : [];
        const toggle = (opt: string, on: boolean) => {
          const next = on ? [...chosen, opt] : chosen.filter((v) => v !== opt);
          onChange(next.length ? JSON.stringify(next) : "");
        };
        return (
          <div className={cn("flex flex-col gap-2 rounded-lg border px-3 py-2.5", missing ? "border-destructive/50" : "border-input")} role="group" aria-labelledby={`${id}-label`} id={id}>
            {options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm">
                <Checkbox checked={chosen.includes(opt)} onCheckedChange={(v) => toggle(opt, v === true)} />
                {opt}
              </label>
            ))}
          </div>
        );
      }
      return (
        <Select value={value || "__none"} onValueChange={(v) => onChange(v === "__none" ? "" : v)}>
          <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "file":
      return <FileAnswer id={id} answer={a} onChange={onChange} onUploading={onUploading} onError={onError} />;
    case "client":
      return <ClientAnswer id={id} answer={a} onChange={onChange} onBlur={onBlur} />;
    default:
      return <Textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder="Type the answer…" aria-invalid={invalid} dir="auto" />;
  }
}

/** Files already attached, and new ones which upload as soon as they are chosen. */
function FileAnswer({ id, answer, onChange, onUploading, onError }: { id: string; answer: Answer; onChange: (v: string) => void; onUploading: (on: boolean) => void; onError: (text: string | null) => void }) {
  const files = answer.kind === "files" ? answer.files : [];
  const [picked, setPicked] = React.useState<PickedFile[]>([]);
  const serialize = (list: { name: string; url: string }[]) => list.map((f) => `${f.name}::${f.url}`).join("|||");
  const add = async (next: PickedFile[]) => {
    const fresh = next.filter((f) => !picked.includes(f));
    setPicked(next);
    if (fresh.length === 0) return;
    onUploading(true);
    try {
      const uploaded = await uploadAttachments(
        fresh.map((f) => f.file),
        (i, pct) => setPicked((prev) => prev.map((f) => (f.file === fresh[i].file ? { ...f, progress: pct } : f))),
      );
      onChange(serialize([...files, ...uploaded.map((u) => ({ name: u.filename, url: u.url }))]));
      setPicked((prev) => prev.filter((f) => !fresh.includes(f)));
    } catch (err) {
      onError(taskErrorText(err));
      setPicked((prev) => prev.filter((f) => !fresh.includes(f)));
    } finally {
      onUploading(false);
    }
  };
  return (
    <div className="flex flex-col gap-2" id={id}>
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5 text-sm">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <a href={f.url || undefined} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                {f.name}
              </a>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${f.name}`} onClick={() => onChange(serialize(files.filter((_, j) => j !== i)))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <FilePicker files={picked} onChange={(next) => void add(next)} label="Add files" />
    </div>
  );
}

/** Whether the client owes something, what, and whether it has come. Nothing is pressed until someone chooses. */
function ClientAnswer({ id, answer, onChange, onBlur }: { id: string; answer: Answer; onChange: (v: string) => void; onBlur?: () => void }) {
  const cv = answer.kind === "client" ? answer : { needed: null as boolean | null, note: "", completed: false, completedAt: null as string | null };
  const write = (patch: Partial<{ needed: boolean | null; note: string; completed: boolean; completedAt: string | null }>) => onChange(JSON.stringify({ needed: cv.needed, note: cv.note, completed: cv.completed, completedAt: cv.completedAt, ...patch }));
  const pill = (active: boolean) =>
    cn(
      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      active ? "border-foreground/60 bg-foreground/10 text-foreground" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
    );
  return (
    <div className="flex flex-col gap-2.5" id={id}>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={`${id}-label`}>
        <button type="button" role="radio" aria-checked={cv.needed === false} className={pill(cv.needed === false)} onClick={() => write({ needed: false, note: "", completed: false, completedAt: null })} data-testid="client-nothing">
          Nothing needed
        </button>
        <button type="button" role="radio" aria-checked={cv.needed === true} className={pill(cv.needed === true)} onClick={() => write({ needed: true })} data-testid="client-needed">
          Needs the client
        </button>
      </div>
      {cv.needed === true && (
        <>
          <Textarea rows={2} value={cv.note} onChange={(e) => write({ note: e.target.value })} onBlur={onBlur} placeholder="What do you need from the client?" autoFocus={cv.note === ""} dir="auto" />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={cv.completed} onCheckedChange={(v) => write(v === true ? { completed: true, completedAt: new Date().toISOString() } : { completed: false, completedAt: null })} />
            {cv.completed ? `Received from the client${cv.completedAt ? ` on ${format(new Date(cv.completedAt), "d MMM yyyy")}` : ""}` : "Waiting on the client"}
          </label>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Comments                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/** The conversation under a task: who said what and when, with files. Staff add comments; each person removes their own. */
export function TaskComments({ taskId, viewerId, canWrite }: { taskId: string; viewerId: string | null; canWrite: boolean }) {
  const comments = useTaskComments(taskId);
  const add = useAddComment(taskId);
  const del = useDeleteComment(taskId);
  const [text, setText] = React.useState("");
  const [files, setFiles] = React.useState<PickedFile[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const list = comments.data ?? [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if ((content === "" && files.length === 0) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const attachments = await uploadAttachments(
        files.map((f) => f.file),
        (i, pct) => setFiles((prev) => prev.map((f, j) => (j === i ? { ...f, progress: pct } : f))),
      );
      await add.mutateAsync({ content: content || (attachments.length ? "Attached files" : ""), attachments });
      setText("");
      setFiles([]);
    } catch (err) {
      setError(taskErrorText(err));
      setFiles((prev) => prev.map((f) => ({ file: f.file })));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="task-comments">
      {comments.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : comments.error ? (
        <ErrorNote>{taskErrorText(comments.error)}</ErrorNote>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((c) => (
            <CommentItem key={c.id} comment={c} canDelete={c.user.id === viewerId} onDelete={() => del.mutate(c.id, { onError: (err) => setError(taskErrorText(err)) })} />
          ))}
        </ul>
      )}
      {canWrite && (
        <form onSubmit={submit} className="flex flex-col gap-2" data-testid="comment-form">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a comment…"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            data-testid="comment-input"
          />
          <div className="flex items-start gap-2">
            <FilePicker files={files} onChange={setFiles} label="Attach" disabled={busy} className="min-w-0 flex-1" />
            <Button type="submit" size="sm" disabled={busy || (text.trim() === "" && files.length === 0)} data-testid="comment-send">
              <Send />
              {busy ? "Sending…" : "Send"}
            </Button>
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
        </form>
      )}
    </div>
  );
}

function CommentItem({ comment: c, canDelete, onDelete }: { comment: TaskComment; canDelete: boolean; onDelete: () => void }) {
  const [confirm, setConfirm] = React.useState(false);
  return (
    <li className="group/comment flex gap-3" data-testid="comment">
      <Avatar className="mt-0.5 size-7">
        {c.user.imageUrl && <AvatarImage src={c.user.imageUrl} alt="" />}
        <AvatarFallback className="text-[10px]">{(c.user.name ?? "?").charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{c.user.name ?? "Someone"}</span>
          <span>{format(new Date(c.createdAt), "d MMM yyyy, HH:mm")}</span>
          {canDelete && (
            <span className="ms-auto flex items-center gap-1 opacity-0 transition-opacity group-hover/comment:opacity-100 group-focus-within/comment:opacity-100">
              {confirm ? (
                <>
                  <Button type="button" variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={onDelete}>
                    Delete
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setConfirm(false)}>
                    Keep
                  </Button>
                </>
              ) : (
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={() => setConfirm(true)}>
                  <Trash2 />
                </Button>
              )}
            </span>
          )}
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">{c.content}</p>
        {c.attachments && c.attachments.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {c.attachments.map((f) => (
              <li key={f.id}>
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs hover:bg-muted">
                  <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f.filename}</span>
                  <span className="text-muted-foreground">{formatFileSize(f.fileSize)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
