import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { redirect } from "next/navigation";

import { getCurrentUser, getSession, needsProfilePhoto } from "@/lib/auth";
import { isClientUser } from "@/lib/client-chat";
import { pendingAgreementFor } from "@/lib/client-agreement";
import { canPreviewNextUi } from "@/lib/next-ui-access";
import { PaneShell } from "@/next-ui/panes/pane-shell";
import { NxRoot } from "@/next-ui/shell/nx-root";
import "@/next-ui/theme/next.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-nx-sans",
  display: "swap",
});

export default async function NextUiLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/sign-in");

  const user = await getCurrentUser();
  if (user?.blocked) redirect("/dashboard");
  if (await needsProfilePhoto()) redirect("/setup-photo");
  if (await pendingAgreementFor(user)) redirect("/agreement");
  if (isClientUser(user)) redirect("/dashboard/messages");
  // Preview only: the new frontend opens for the people on the list, nobody else.
  if (!canPreviewNextUi(user)) redirect("/dashboard");

  // tokens + the Inter variable; `NxRoot` mirrors them on <html> for portaled menus
  const rootClass = `nx ${inter.variable}`;

  return (
    <div className={`${rootClass} nx-app`}>
      <NxRoot className={rootClass} />
      <PaneShell
        viewer={{
          id: user?.id ?? "",
          name: user?.name ?? "",
          email: user?.email ?? "",
          imageUrl: user?.imageUrl ?? undefined,
          systemRole: user?.systemRole ?? "",
        }}
      >
        {children}
      </PaneShell>
    </div>
  );
}
