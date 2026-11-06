"use client";

import * as React from "react";
import { File as FileIcon, Paperclip, X } from "lucide-react";

import { formatFileSize, formatMinutes } from "@/next-ui/blocks/format";
import { cn } from "@/next-ui/lib/cn";
import { Button } from "@/next-ui/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/next-ui/ui/dialog";
import { Input } from "@/next-ui/ui/input";
import { Label } from "@/next-ui/ui/label";
import { Textarea } from "@/next-ui/ui/textarea";

/**
 * The small parts every form in the new UI shares: the red note a refused action leaves, a
 * confirmation dialog that can ask for a reason or a typed name, a picker that lists the files
 * about to be sent with their progress, and an estimate field that reads "1h 30m" and gives
 * minutes.
 */

/** The server's refusal, or a check that failed, under the fields it concerns. */
export function ErrorNote({ children, className, onClose }: { children: React.ReactNode; className?: string; onClose?: () => void }) {
  return (
    <p role="alert" className={cn("flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm whitespace-pre-line text-destructive", className)}>
      <span className="min-w-0 flex-1">{children}</span>
      {onClose && (
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Dismiss" className="-me-1.5 -my-0.5 shrink-0 text-destructive hover:text-destructive" onClick={onClose}>
          <X />
        </Button>
      )}
    </p>
  );
}

/** A quieter note: something to know before going on, not a refusal. */
export function InfoNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("rounded-lg border bg-muted/40 px-3 py-2 text-sm whitespace-pre-line text-muted-foreground", className)}>{children}</p>;
}

export function errorText(err: unknown, fallback = "Something went wrong."): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  /** More to read between the description and the fields: a list of what will be lost, say. */
  children?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Ask for words (a reason) and hand them to `onConfirm`; required unless `reasonOptional`. */
  reason?: { label: string; placeholder?: string; optional?: boolean; initial?: string };
  /** Ask the person to type this exact text (a sprint's name) before the button works. */
  typed?: { label: string; expected: string };
  /** Resolves when done; a thrown error is shown under the fields and the dialog stays open. */
  onConfirm: (input: { reason: string }) => Promise<unknown> | unknown;
  busyLabel?: string;
  testId?: string;
}

/** "Are you sure?" and its cousins: one dialog, with an optional reason or a typed name. */
export function ConfirmDialog({ open, onClose, title, description, children, confirmLabel = "Confirm", destructive, reason, typed, onConfirm, busyLabel = "Working…", testId }: ConfirmDialogProps) {
  const [text, setText] = React.useState("");
  const [typedText, setTypedText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [seen, setSeen] = React.useState(false);
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setText(reason?.initial ?? "");
      setTypedText("");
      setError(null);
      setBusy(false);
    }
  }
  const reasonOk = !reason || reason.optional || text.trim() !== "";
  const typedOk = !typed || typedText.trim() === typed.expected;
  const canConfirm = reasonOk && typedOk && !busy;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ reason: text.trim() });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid={testId}>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {(children || reason || typed || error) && (
            <div className="flex flex-col gap-4">
              {children}
              {reason && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm-reason">
                    {reason.label}
                    {reason.optional && <span className="text-muted-foreground"> (optional)</span>}
                  </Label>
                  <Textarea id="confirm-reason" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} autoFocus data-testid="confirm-reason" />
                </div>
              )}
              {typed && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm-typed">{typed.label}</Label>
                  <Input id="confirm-typed" value={typedText} onChange={(e) => setTypedText(e.target.value)} placeholder={typed.expected} autoComplete="off" data-testid="confirm-typed" />
                </div>
              )}
              {error && <ErrorNote>{error}</ErrorNote>}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={!canConfirm} data-testid="confirm-button">
              {busy ? busyLabel : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface PickedFile {
  file: File;
  /** 0–100 while it is being sent; absent before. */
  progress?: number;
}

/**
 * Files chosen from this device, listed with their size (and progress once sending starts),
 * each removable until then. `accept` narrows the picker ("video/*"); `one` allows a single file.
 */
export function FilePicker({
  files,
  onChange,
  accept,
  one,
  label = "Add files",
  disabled,
  className,
  testId,
}: {
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  accept?: string;
  one?: boolean;
  label?: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const picked = Array.from(list).map((file) => ({ file }));
    onChange(one ? picked.slice(0, 1) : [...files, ...picked]);
  };
  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid={testId}>
      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.file.name}-${i}`} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5 text-sm">
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={f.file.name}>
                {f.file.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{f.progress != null ? `${f.progress}%` : formatFileSize(f.file.size)}</span>
              {f.progress == null && !disabled && (
                <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${f.file.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <input ref={inputRef} type="file" className="sr-only" accept={accept} multiple={!one} tabIndex={-1} onChange={(e) => add(e.target.files)} disabled={disabled} />
      <Button type="button" variant="outline" size="sm" className="self-start" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <Paperclip />
        {one && files.length > 0 ? "Choose another" : label}
      </Button>
    </div>
  );
}

/** "1h 30m", "90m", "2h", "1.5h" → 90; nothing or nonsense → null. */
export function parseEstimate(text: string): number | null {
  const s = text.trim().toLowerCase();
  if (s === "") return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 60); // bare number means hours
  let total = 0;
  let matched = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/g)) {
    matched = true;
    const n = Number(m[1]);
    total += m[2].startsWith("h") ? n * 60 : n;
  }
  if (!matched) return null;
  return Math.round(total) || null;
}

/** An estimate in hours and minutes, as text; the field gives minutes to `onChange` (or null when blank). */
export function EstimateField({
  value,
  onChange,
  onBlur,
  id,
  placeholder = "e.g. 2h 30m",
  autoFocus,
  disabled,
  className,
}: {
  value: number | null;
  onChange: (minutes: number | null) => void;
  /** For a field that saves when it is left. */
  onBlur?: () => void;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = React.useState(value ? formatMinutes(value) : "");
  const [shown, setShown] = React.useState(value);
  if (value !== shown) {
    setShown(value);
    if (parseEstimate(text) !== value) setText(value ? formatMinutes(value) : "");
  }
  const bad = text.trim() !== "" && parseEstimate(text) === null;
  return (
    <Input
      id={id}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const mins = parseEstimate(e.target.value);
        if (e.target.value.trim() === "" || mins !== null) onChange(mins);
      }}
      onBlur={onBlur}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      aria-invalid={bad || undefined}
      inputMode="text"
      className={className}
      data-testid="estimate-field"
    />
  );
}
