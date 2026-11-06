// @vitest-environment jsdom
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/next/admin",
  useSearchParams: () => new URLSearchParams(),
}));

async function render(node: React.ReactElement, role = "ADMIN"): Promise<string> {
  const { TooltipProvider } = await import("@/next-ui/ui/tooltip");
  const { ViewerProvider } = await import("@/next-ui/lib/viewer");
  const viewer = { id: "u1", name: "Abdulaziz", email: "a@nizek.com", systemRole: role };
  return renderToString(React.createElement(TooltipProvider, null, React.createElement(ViewerProvider, { viewer }, node)));
}

describe("the Administrator area", () => {
  it("indexes every page of the menu, grouped, with a line on each", async () => {
    const { AdminScreen } = await import("@/next-ui/screens/admin/admin-screen");
    const html = await render(React.createElement(AdminScreen));
    expect(html).toContain('data-testid="admin-index"');
    for (const title of ["Teams", "Members", "Role presets", "Client agreement", "Questions", "Contracts"]) {
      expect(html).toContain(title);
    }
    for (const title of ["Equity access", "Vault access", "App logo", "Login page", "Notification sound", "Member notifications"]) {
      expect(html).toContain(title);
    }
    expect(html).toContain("Invite people to the system and manage members.");
    expect(html).toContain('data-href="/next/admin/teams"');
    expect(html).toContain('data-href="/next/admin/member-notifications"');
    expect(html).not.toContain("/dashboard");
  });

  it("shows a page that is not rebuilt yet by name, and refuses a name it does not have", async () => {
    const { AdminScreen } = await import("@/next-ui/screens/admin/admin-screen");
    const html = await render(React.createElement(AdminScreen, { view: "roles" }));
    expect(html).toContain("Role presets");
    expect(html).toContain("The roles a new project starts with. Each project edits its own copy in its settings.");
    expect(html).toContain("Not built yet");
    expect(html).not.toContain('data-testid="admin-index"');
    const none = await render(React.createElement(AdminScreen, { view: "nothing" }));
    expect(none).toContain("No such page");
  });

  it("is for administrators only", async () => {
    const { AdminScreen } = await import("@/next-ui/screens/admin/admin-screen");
    const html = await render(React.createElement(AdminScreen), "DEVELOPER");
    expect(html).toContain("Administrators only");
    expect(html).not.toContain("Teams");
  });
});
