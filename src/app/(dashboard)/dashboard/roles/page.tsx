import { redirect } from "next/navigation";

export default function RolesPage() {
  redirect("/dashboard/admin?tab=roles");
}
