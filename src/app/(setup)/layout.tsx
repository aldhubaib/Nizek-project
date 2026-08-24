import { redirect } from "next/navigation";
import { getCurrentUser, getSession } from "@/lib/auth";

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/sign-in");

  const user = await getCurrentUser();
  if (user?.blocked) redirect("/dashboard");

  return children;
}
