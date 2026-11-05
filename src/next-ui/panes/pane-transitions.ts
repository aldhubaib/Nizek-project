import { MAX_STACK, entryKey, sameEntry, type PaneEntry, type PaneState } from "./pane-url";

/** Pure transitions of the pane stack, unit-tested in tests/unit/next-ui-panes/pane-store.test.ts. */

export const MAX_RECENTS = 12;

/**
 * Push on top; a repeat only becomes active (turned to the view asked for, when the entry
 * names one). Past eight the oldest *unpinned* entry drops; when every entry is pinned the
 * oldest of them goes.
 */
export function pushEntry(state: PaneState, entry: PaneEntry, pins: readonly string[] = []): PaneState {
  const i = state.stack.findIndex((e) => sameEntry(e, entry));
  if (i >= 0) return { stack: state.stack.map((e, j) => (j === i ? entry : e)), at: i };
  const stack = [entry, ...state.stack];
  if (stack.length > MAX_STACK) {
    let drop = stack.length - 1;
    while (drop > 0 && pins.includes(entryKey(stack[drop]))) drop--;
    stack.splice(drop, 1);
  }
  return { stack, at: 0 };
}

export function replaceAt(state: PaneState, index: number, entry: PaneEntry): PaneState {
  const stack = state.stack.filter((e, i) => i === index || !sameEntry(e, entry));
  const at = stack.indexOf(state.stack[index]);
  stack[at] = entry;
  return { stack, at: state.at === index ? at : Math.min(state.at, stack.length - 1) };
}

export function removeAt(state: PaneState, index: number): PaneState | null {
  const stack = state.stack.filter((_, i) => i !== index);
  if (!stack.length) return null;
  const at = index < state.at ? state.at - 1 : Math.min(state.at, stack.length - 1);
  return { stack, at };
}

export function activateAt(state: PaneState, index: number): PaneState {
  return index >= 0 && index < state.stack.length ? { ...state, at: index } : state;
}

export function togglePin(pins: readonly string[], key: string): string[] {
  return pins.includes(key) ? pins.filter((k) => k !== key) : [...pins, key];
}

/** Newest first, no repeats, at most twelve (the dashboard's "Recents"). */
export function addRecent(recents: readonly PaneEntry[], entry: PaneEntry): PaneEntry[] {
  return [entry, ...recents.filter((e) => !sameEntry(e, entry))].slice(0, MAX_RECENTS);
}
