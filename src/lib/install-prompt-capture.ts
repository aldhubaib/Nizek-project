type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(event: BeforeInstallPromptEvent | null) => void>();

function emit() {
  for (const listener of listeners) listener(deferred);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export type { BeforeInstallPromptEvent };

export function getDeferredInstallPrompt() {
  return deferred;
}

export function consumeDeferredInstallPrompt() {
  const event = deferred;
  deferred = null;
  emit();
  return event;
}

export function subscribeInstallPrompt(
  listener: (event: BeforeInstallPromptEvent | null) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
