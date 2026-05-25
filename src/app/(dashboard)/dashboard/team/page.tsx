import { redirect } from "next/navigation";

export default function TeamPage() {
  redirect("/dashboard/admin?tab=members");
}
