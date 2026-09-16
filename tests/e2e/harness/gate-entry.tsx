// Entry for /gate.js: mounts the production NotificationGate around a stand-in
// app so Playwright can assert gating behaviour against the real component,
// the real store and the real service worker, with only the API mocked.

import { createRoot } from "react-dom/client";
import { NotificationGate } from "@/components/notification-gate";
import { PushBootstrap } from "@/components/push-bootstrap";
import { getPushSnapshot } from "@/lib/push/store";

declare global {
  interface Window {
    pushSnapshot: () => unknown;
  }
}

window.pushSnapshot = () => getPushSnapshot();

createRoot(document.getElementById("root")!).render(
  <NotificationGate>
    <main data-testid="app">
      <h1>App content</h1>
      <p>Visible only when the gate is not blocking.</p>
    </main>
    <PushBootstrap />
  </NotificationGate>,
);
