// IndexedDB store for in-progress multipart uploads, so a file picked again
// after a reload / tab kill continues from the parts already in R2. Every call
// is best-effort: no IndexedDB (private mode, old WebView) just means no
// resume, never a failed upload.

import type { MultipartResumeRecord } from "@/lib/upload-multipart-core";

const DB_NAME = "nizek-uploads";
const DB_VERSION = 1;
const STORE = "multipart";

/** Records older than this are stale — the daily cron aborted the upload. */
const RECORD_TTL_MS = 24 * 60 * 60 * 1000;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "fingerprint" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onabort = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function loadResumeRecord(
  fingerprint: string,
): Promise<MultipartResumeRecord | null> {
  const rec = await run<MultipartResumeRecord | undefined>("readonly", (s) =>
    s.get(fingerprint),
  );
  if (!rec || typeof rec !== "object") return null;
  if (Date.now() - (rec.updatedAt ?? 0) > RECORD_TTL_MS) {
    void clearResumeRecord(fingerprint);
    return null;
  }
  return rec;
}

export async function saveResumeRecord(record: MultipartResumeRecord): Promise<void> {
  await run("readwrite", (s) => s.put({ ...record, updatedAt: Date.now() }));
}

export async function clearResumeRecord(fingerprint: string): Promise<void> {
  await run("readwrite", (s) => s.delete(fingerprint));
}
