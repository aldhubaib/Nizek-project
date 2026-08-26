"use client";

import { useSyncExternalStore } from "react";
import { submitProofAndMove, type ProofVideoInput } from "@/actions/proof-of-work";
import { uploadFileToR2 } from "@/lib/upload";
import { useKanbanStore } from "@/store/kanban";

export type ProofOutboxFile = {
  key: string;
  file: File;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  url?: string;
  fileSize?: number;
  mimeType?: string;
};

export type ProofOutboxEntry = {
  id: string;
  taskId: string;
  taskTitle: string;
  order: number;
  files: ProofOutboxFile[];
  useBypass?: boolean;
  status: "uploading" | "submitting" | "done" | "error";
  errorMessage: string | null;
};

let entries: ProofOutboxEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  entries = [...entries];
  for (const l of listeners) l();
  syncBeforeUnload();
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = "";
}

let unloadArmed = false;
function syncBeforeUnload() {
  if (typeof window === "undefined") return;
  const busy = entries.some((e) => e.status === "uploading" || e.status === "submitting");
  if (busy && !unloadArmed) {
    window.addEventListener("beforeunload", onBeforeUnload);
    unloadArmed = true;
  } else if (!busy && unloadArmed) {
    window.removeEventListener("beforeunload", onBeforeUnload);
    unloadArmed = false;
  }
}

export function enqueueProofUpload(input: {
  taskId: string;
  taskTitle: string;
  order: number;
  files: File[];
  useBypass?: boolean;
}) {
  const id = `proof-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const entry: ProofOutboxEntry = {
    id,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    order: input.order,
    useBypass: input.useBypass,
    files: input.files.map((file, i) => ({
      key: `${id}-${i}`,
      file,
      name: file.name,
      progress: 0,
      status: "uploading",
    })),
    status: input.files.length > 0 ? "uploading" : "submitting",
    errorMessage: null,
  };
  entries = [...entries, entry];
  emit();
  if (input.files.length > 0) startUploads(id);
  else void finish(id);
}

async function startUploads(id: string) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  await Promise.all(
    entry.files.map(async (f) => {
      try {
        const up = await uploadFileToR2(f.file, (pct) => {
          patchFile(id, f.key, { progress: pct });
        });
        patchFile(id, f.key, {
          status: "done",
          progress: 100,
          url: up.url,
          fileSize: up.fileSize,
          mimeType: up.mimeType ?? f.file.type,
        });
      } catch (err) {
        patchFile(id, f.key, { status: "error" });
        patchEntry(id, {
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Upload failed",
        });
        window.dispatchEvent(new CustomEvent("proof-upload-failed", { detail: { taskId: entry.taskId } }));
      }
    }),
  );
  const latest = entries.find((e) => e.id === id);
  if (latest && latest.status !== "error" && latest.files.every((f) => f.status === "done")) {
    await finish(id);
  }
}

function patchEntry(id: string, patch: Partial<ProofOutboxEntry>) {
  entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
  emit();
}

function patchFile(id: string, key: string, patch: Partial<ProofOutboxFile>) {
  entries = entries.map((e) =>
    e.id === id
      ? { ...e, files: e.files.map((f) => (f.key === key ? { ...f, ...patch } : f)) }
      : e,
  );
  emit();
}

async function finish(id: string) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  patchEntry(id, { status: "submitting", errorMessage: null });
  const videos: ProofVideoInput[] = entry.files
    .filter((f) => f.url)
    .map((f) => ({
      filename: f.name,
      url: f.url!,
      fileSize: f.fileSize ?? f.file.size,
      mimeType: f.mimeType ?? f.file.type,
    }));
  const result = await submitProofAndMove({
    taskId: entry.taskId,
    stage: "INTERNAL_REVIEW",
    order: entry.order,
    videos,
    useBypass: entry.useBypass,
  });
  if (!result.success) {
    patchEntry(id, { status: "error", errorMessage: result.error });
    window.dispatchEvent(new CustomEvent("proof-upload-failed", { detail: { taskId: entry.taskId } }));
    return;
  }
  useKanbanStore.getState().moveTask(entry.taskId, "INTERNAL_REVIEW", entry.order);
  patchEntry(id, { status: "done" });
  window.dispatchEvent(
    new CustomEvent("proof-upload-complete", {
      detail: { taskId: entry.taskId, stage: "INTERNAL_REVIEW", order: entry.order },
    }),
  );
  window.setTimeout(() => {
    entries = entries.filter((e) => e.id !== id);
    emit();
  }, 4000);
}

export function retryProofUpload(id: string) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  patchEntry(id, { status: "uploading", errorMessage: null });
  const failed = entry.files.filter((f) => f.status === "error");
  if (failed.length === 0) {
    void finish(id);
    return;
  }
  for (const f of failed) patchFile(id, f.key, { status: "uploading", progress: 0 });
  void startUploads(id);
}

export function dismissProofUpload(id: string) {
  entries = entries.filter((e) => e.id !== id);
  emit();
}

export function useProofOutbox() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => entries,
    () => entries,
  );
}
