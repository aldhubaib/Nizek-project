import { memo } from "react";
import { Bug, Sparkles, Zap, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, typeof Bug> = {
  BUG: Bug,
  FEATURE: Sparkles,
  ENHANCEMENT: Zap,
};

const TYPE_COLOR: Record<string, string> = {
  BUG: "text-destructive",
  FEATURE: "text-violet-400",
  ENHANCEMENT: "text-cyan-400",
};

export const StatCard = memo(function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="app-card rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className={cn("opacity-70", color)}>{icon}</span>
      </div>
      <p className="text-l font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
});

export const Widget = memo(function Widget({
  title,
  icon,
  badge,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: number;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="app-card rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h3 className="text-s font-semibold">{title}</h3>
          {badge !== undefined && badge > 0 && (
            <span className="ms-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {badge}
            </span>
          )}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            className="text-xs text-primary hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
      <div className="p-4 max-h-[320px] overflow-y-auto">{children}</div>
    </div>
  );
});

export const TaskRow = memo(function TaskRow({
  task,
  onClick,
}: {
  task: { id: string; title: string; taskNumber: number; taskType: string; priority: number | null };
  onClick?: () => void;
}) {
  const Icon = TYPE_ICON[task.taskType] ?? Circle;
  return (
    <div className="flex items-center gap-2 py-1 text-s cursor-pointer rounded-md px-1 -mx-1 hover:bg-muted/50 transition-colors" onClick={onClick}>
      <Icon className={cn("w-3.5 h-3.5 shrink-0", TYPE_COLOR[task.taskType] ?? "text-muted-foreground")} />
      <span className="text-muted-foreground font-mono">#{task.taskNumber}</span>
      <span className="truncate flex-1">{task.title}</span>
      {task.priority !== null && (
        <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded bg-muted text-xs font-bold">
          P{task.priority}
        </span>
      )}
    </div>
  );
});

export function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      {icon}
      <p className="text-s mt-2">{message}</p>
    </div>
  );
}
