import { requireUser } from "@/lib/auth";
import { listTrash } from "@/actions/trash";
import { TrashClient } from "./trash-client";

export default async function TrashPage() {
  const user = await requireUser();
  const items = await listTrash();

  return <TrashClient items={items} isAdmin={user.systemRole === "ADMIN"} />;
}
