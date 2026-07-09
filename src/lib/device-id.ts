// A stable per-device/browser id persisted in localStorage. Used to correlate a
// device's push subscription with its live Centrifugo connection so we can skip
// OS push to devices the user is actively using (presence-aware push).

const KEY = "nizek-device-id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (private mode / SSR) — fall back to a volatile id.
    return "";
  }
}
