import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div>
      <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold">Dashboard</h1>
      </div>

      <div className="flex flex-col items-center justify-center text-center gap-3 min-h-[calc(100vh-48px)]">
        <p className="text-[13px] text-muted-foreground">
          Welcome back, {user.name || "there"}.
        </p>
      </div>
    </div>
  );
}
