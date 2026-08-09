"use client";

// App-wide message outbox. Sent-but-not-delivered chat messages (text +
// attachments being uploaded) live here, in module state, instead of inside the
// chat screen component — so navigating to another thread or page does NOT kill
// an in-flight upload. The chat screen merely subscribes to its own thread's
// entries and renders them; the uploads and the final sendMessage() run to
// completion regardless of what is mounted.
//
// Lifecycle of an entry:
//   enqueue -> "uploading" (files PUT to R2, per-file progress)
//           -> "sending"   (sendMessage server action)
//           -> delivered   (entry removed; open thread notified to append)
//           or "error"     (kept with the reason; user can retry or discard —
//                           retry re-uploads only the files that failed)

import { useMemo, useSyncExternalStore } from "react";
import { sendMessage, type MessageDTO } from "@/actions/messages";
import { uploadFileToR2, type UploadedFile } from "@/lib/upload";

export type OutboxTarget = {
  taskId?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
};

export type OutboxFile = {
  key: string;
  file: File;
  name: string;
  contentType: string | null;
  previewUrl: string | null;
  progress: number;
  status: "uploading" | "done" | "error";
  /** Set once the file is in R2 — retries skip files that already have it. */
  uploaded?: UploadedFile;
};

export type OutboxEntry = {
  tempId: string;
  /** Thread this belongs to (conv-x / project-x / task-x) — for the UI only. */
  threadKey: string;
  target: OutboxTarget;
  body: string;
  replyToId: string | null;
  /** When set, the message is posted as a comment on this task (# reference). */
  taskRefId: string | null;
  createdAt: string;
  files: OutboxFile[];
  status: "uploading" | "sending" | "error";
  /** Why the entry failed, shown next to the Retry button. */
  errorMessage: string | null;
};

type DeliveredListener = (message: MessageDTO, replyToId: string | null) => void;

let entries: OutboxEntry[] = [];
const storeListeners = new Set<() => void>();
const deliveredListeners = new Map<string, Set<DeliveredListener>>();

function setEntries(next: OutboxEntry[]) {
  entries = next;
  for (const l of storeListeners) l();
  syncBeforeUnload();
}

function patchEntry(tempId: string, patch: Partial<OutboxEntry>) {
  setEntries(
    entries.map((o) => (o.tempId === tempId ? { ...o, ...patch } : o)),
  );
}

function patchFile(tempId: string, fileKey: string, patch: Partial<OutboxFile>) {
  setEntries(
    entries.map((o) =>
      o.tempId === tempId
        ? {
            ...o,
            files: o.files.map((f) =>
              f.key === fileKey ? { ...f, ...patch } : f,
            ),
          }
        : o,
    ),
  );
}

// ─── Closing the tab mid-upload ───────────────────────────────────────────────

function onBeforeUnload(e: BeforeUnloadEvent) {
  // Closing the tab is the one navigation an upload cannot survive.
  e.preventDefault();
  e.returnValue = "";
}

let unloadArmed = false;
function syncBeforeUnload() {
  if (typeof window === "undefined") return;
  const busy = entries.some((o) => o.status !== "error");
  if (busy && !unloadArmed) {
    window.addEventListener("beforeunload", onBeforeUnload);
    unloadArmed = true;
  } else if (!busy && unloadArmed) {
    window.removeEventListener("beforeunload", onBeforeUnload);
    unloadArmed = false;
  }
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export function enqueueOutboxMessage(input: {
  threadKey: string;
  target: OutboxTarget;
  body: string;
  replyToId?: string | null;
  taskRefId?: string | null;
  files?: { key: string; file: File; previewUrl: string | null }[];
}): void {
  const files = input.files ?? [];
  const entry: OutboxEntry = {
    tempId: `out-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    threadKey: input.threadKey,
    target: input.target,
    body: input.body,
    replyToId: input.replyToId ?? null,
    taskRefId: input.taskRefId ?? null,
    createdAt: new Date().toISOString(),
    files: files.map((f) => ({
      key: f.key,
      file: f.file,
      name: f.file.name,
      contentType: f.file.type || null,
      previewUrl: f.previewUrl,
      progress: 0,
      status: "uploading" as const,
    })),
    status: files.length > 0 ? "uploading" : "sending",
    errorMessage: null,
  };
  setEntries([...entries, entry]);
  if (files.length > 0) startUploads(entry.tempId);
  else deliver(entry.tempId);
}

function startUploads(tempId: string) {
  const entry = entries.find((o) => o.tempId === tempId);
  if (!entry) return;
  for (const f of entry.files) {
    if (!f.uploaded && f.status === "uploading") {
      void uploadOne(tempId, f.key, f.file);
    }
  }
}

async function uploadOne(tempId: string, fileKey: string, file: File) {
  try {
    const uploaded = await uploadFileToR2(file, (pct) =>
      patchFile(tempId, fileKey, { progress: pct }),
    );
    patchFile(tempId, fileKey, { status: "done", progress: 100, uploaded });
    maybeDeliver(tempId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    // A sibling file may still finish after this and record its `uploaded`
    // meta — retry then only re-uploads what actually failed.
    patchFile(tempId, fileKey, { status: "error" });
    patchEntry(tempId, { status: "error", errorMessage: message });
    reportUploadFailure(file, message);
  }
}

function maybeDeliver(tempId: string) {
  const entry = entries.find((o) => o.tempId === tempId);
  if (!entry || entry.status !== "uploading") return;
  if (entry.files.every((f) => f.uploaded)) deliver(tempId);
}

function deliver(tempId: string) {
  const entry = entries.find((o) => o.tempId === tempId);
  if (!entry) return;
  patchEntry(tempId, { status: "sending", errorMessage: null });
  void (async () => {
    try {
      const res = await sendMessage({
        ...entry.target,
        taskId: entry.taskRefId ?? entry.target.taskId,
        body: entry.body,
        attachments: entry.files
          .map((f) => f.uploaded)
          .filter((u): u is UploadedFile => u != null)
          .map((u) => ({
            filename: u.filename,
            url: u.url,
            fileSize: u.fileSize,
            mimeType: u.mimeType,
          })),
        replyToId: entry.replyToId ?? undefined,
      });
      if (res.ok) {
        for (const f of entry.files) {
          if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        }
        setEntries(entries.filter((o) => o.tempId !== tempId));
        // If the thread is open somewhere, let it append the real message.
        const subs = deliveredListeners.get(entry.threadKey);
        if (subs) for (const cb of subs) cb(res.data, entry.replyToId);
      } else {
        patchEntry(tempId, {
          status: "error",
          errorMessage: res.error || "Failed to send",
        });
      }
    } catch (err) {
      patchEntry(tempId, {
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Failed to send",
      });
    }
  })();
}

export function retryOutboxEntry(tempId: string): void {
  const entry = entries.find((o) => o.tempId === tempId);
  if (!entry || entry.status !== "error") return;
  // Files already in R2 stay done — only the failed ones go again.
  const files: OutboxFile[] = entry.files.map((f) =>
    f.uploaded
      ? { ...f, status: "done", progress: 100 }
      : { ...f, status: "uploading", progress: 0 },
  );
  const needsUpload = files.some((f) => !f.uploaded);
  patchEntry(tempId, {
    files,
    status: needsUpload ? "uploading" : "sending",
    errorMessage: null,
  });
  if (needsUpload) startUploads(tempId);
  else deliver(tempId);
}

export function discardOutboxEntry(tempId: string): void {
  const entry = entries.find((o) => o.tempId === tempId);
  if (!entry) return;
  for (const f of entry.files) {
    if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
  }
  setEntries(entries.filter((o) => o.tempId !== tempId));
}

// ─── React bindings ───────────────────────────────────────────────────────────

const EMPTY: OutboxEntry[] = [];

function subscribe(cb: () => void) {
  storeListeners.add(cb);
  return () => {
    storeListeners.delete(cb);
  };
}

/** This thread's pending/failed sends, live-updating as uploads progress. */
export function useThreadOutbox(threadKey: string | null): OutboxEntry[] {
  const all = useSyncExternalStore(subscribe, () => entries, () => EMPTY);
  return useMemo(
    () => (threadKey ? all.filter((o) => o.threadKey === threadKey) : EMPTY),
    [all, threadKey],
  );
}

/**
 * Notifies while this thread is open that one of its outbox entries was
 * delivered, passing the server-confirmed message so the chat can append it
 * without a refetch. If nothing is subscribed (user navigated away), the
 * message is simply picked up by the next server render of the thread.
 */
export function subscribeDelivered(
  threadKey: string,
  cb: DeliveredListener,
): () => void {
  let set = deliveredListeners.get(threadKey);
  if (!set) {
    set = new Set();
    deliveredListeners.set(threadKey, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) deliveredListeners.delete(threadKey);
  };
}

// ─── Failure telemetry ────────────────────────────────────────────────────────

/**
 * Ships the reason an upload finally failed to the server log, so "files
 * aren't uploading" complaints come with the actual cause (device, size,
 * error). Fire-and-forget; never interferes with the UI.
 */
function reportUploadFailure(file: File, reason: string) {
  try {
    const payload = JSON.stringify({
      filename: file.name,
      size: file.size,
      type: file.type || null,
      reason,
      userAgent: navigator.userAgent,
    });
    navigator.sendBeacon?.(
      "/api/upload/failure",
      new Blob([payload], { type: "application/json" }),
    );
  } catch {
    // Diagnostics only.
  }
}
