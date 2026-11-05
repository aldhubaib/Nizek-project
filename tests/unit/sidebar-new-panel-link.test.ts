// @vitest-environment jsdom
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The live panel's sidebar rendered to HTML: the "New panel" entry shows only
 * when the viewer may preview the new frontend, and it is a full-load link.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
}));
vi.mock("@/components/user-menu", () => ({ UserMenu: () => null }));
vi.mock("@/components/branding-provider", () => ({ useAppLogo: () => null }));
vi.mock("@/store/unread", () => ({
  useUnreadStore: (pick: (s: { inboxUnread: number }) => unknown) => pick({ inboxUnread: 0 }),
}));

async function render(props: { canNextUi?: boolean; collapsed?: boolean; isClient?: boolean }) {
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { Sidebar } = await import("@/components/sidebar");
  return renderToString(
    React.createElement(TooltipProvider, null, React.createElement(Sidebar, props)),
  );
}

describe("Sidebar: New panel entry", () => {
  it("is absent by default", async () => {
    const html = await render({});
    expect(html).not.toContain("New panel");
    expect(html).not.toContain('href="/next"');
  });

  it("shows for a previewer as a plain link to /next", async () => {
    const html = await render({ canNextUi: true });
    expect(html).toContain("New panel");
    expect(html).toContain('href="/next"');
  });

  it("keeps the link when collapsed, behind a tooltip", async () => {
    const html = await render({ canNextUi: true, collapsed: true });
    expect(html).toContain('href="/next"');
  });

  it("never shows for a client, whatever the flag says", async () => {
    const html = await render({ canNextUi: true, isClient: true });
    expect(html).not.toContain('href="/next"');
  });
});
