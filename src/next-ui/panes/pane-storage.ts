import type { PaneEntry } from "./pane-url";

/** localStorage with a type guard; anything missing or broken falls back to the default. */
export function load<T>(key: string, fallback: T, ok: (v: unknown) => v is T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return ok(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
}

export const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

export const isEntries = (v: unknown): v is PaneEntry[] =>
  Array.isArray(v) && v.every((x) => !!x && typeof (x as PaneEntry).kind === "string");
