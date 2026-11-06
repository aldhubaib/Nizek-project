import * as React from "react";

/**
 * A field's saved value, kept as the draft until it is typed over: the server's echo of what
 * was typed leaves the draft alone, and a change from elsewhere replaces an untouched draft.
 */
export function useDraft<T>(saved: T): [T, (v: T) => void] {
  const [value, setValue] = React.useState(saved);
  const [seen, setSeen] = React.useState(saved);
  if (saved !== seen) {
    setSeen(saved);
    if (value === seen) setValue(saved);
  }
  return [value, setValue];
}
