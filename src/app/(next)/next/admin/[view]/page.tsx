import { notFound } from "next/navigation";

import { isView } from "@/next-ui/panes/pane-kinds";
import { AdminScreen } from "@/next-ui/screens/admin/admin-screen";

/** One of the Administrator menu's pages in the main pane (`/next/admin/teams`, …); an unknown name is not a page. */
export default async function NextAdminViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!isView("admin", view)) notFound();
  return <AdminScreen view={view} />;
}
