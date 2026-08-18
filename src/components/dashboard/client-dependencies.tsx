"use client";

import Link from "next/link";
import { Clock, ExternalLink, Sparkles, Zap, Bug, AlertCircle, Palette, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientDepTask {
  task: {
    id: string;
    title: string;
    taskNumber: number;
    taskType: string;
    stage: string;
    priority: number | null;
    projectId: string;
    project: { id: string; name: string };
    assignee: { id: string; name: string | null; imageUrl: string | null } | null;
  };
  note: string;
}

export interface ProjectGroup {
  project: { id: string; name: string };
  tasks: ClientDepTask[];
}

const TASK_TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  FEATURE: { icon: Sparkles, color: "text-primary bg-primary/10 border-primary/20", label: "Business Case" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Enhancement" },
  BUG: { icon: Bug, color: "text-destructive bg-destructive/10 border-destructive/20", label: "Bug" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20", label: "Reported Bug" },
  DESIGN: { icon: Palette, color: "text-purple-400 bg-purple-500/10 border-purple-500/20", label: "Design" },
};

const PREVIEW_COUNT = 5;

function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md bg-popover border border-border text-xs text-popover-foreground whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity z-50 shadow-lg">
        {text}
      </div>
    </div>
  );
}

function CompactRow({ item }: { item: ClientDepTask }) {
  const typeInfo = TASK_TYPE_ICONS[item.task.taskType];
  const TypeIcon = typeInfo?.icon ?? Sparkles;

  return (
    <Link
      href={`/dashboard/projects/${item.task.project.id}/tasks/${item.task.id}`}
      target="_blank"
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors group"
    >
      <Tooltip text={typeInfo?.label ?? item.task.taskType}>
        <div className={cn("w-6 h-6 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
          <TypeIcon className="w-3 h-3" />
        </div>
      </Tooltip>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-s font-medium truncate group-hover:text-primary transition-colors">
              <span className="text-muted-foreground/50 font-mono me-1">#{item.task.taskNumber}</span>
              {item.task.title}
            </p>
            <p className="text-xs text-muted-foreground/50 truncate">{item.task.project.name}</p>
          </div>
          {item.note && (
            <Tooltip text={item.note}>
              <StickyNote className="w-3 h-3 text-orange/60 shrink-0" />
            </Tooltip>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ClientDependencies({ data, tab }: { data: ProjectGroup[]; tab?: string }) {
  const totalTasks = data.reduce((s, g) => s + g.tasks.length, 0);
  const allTasks = data.flatMap((g) => g.tasks);
  const preview = allTasks.slice(0, PREVIEW_COUNT);

  return (
    <div className="app-card rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-s font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            {tab === "product" ? "PM" : tab === "dev" ? "Dev" : ""} Waiting on Client
          </h2>
          {totalTasks > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-orange bg-orange/10 border border-orange/20 rounded-full px-2 py-0.5">
              {totalTasks} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap">
          {data.slice(0, 4).map((g) => (
            <span key={g.project.id} className="text-muted-foreground">
              {g.project.name}: <span className="font-semibold text-foreground">{g.tasks.length}</span>
            </span>
          ))}
          {data.length > 4 && (
            <span className="text-muted-foreground/50">+{data.length - 4} more</span>
          )}
          {data.length === 0 && (
            <span className="text-muted-foreground">No pending items</span>
          )}
        </div>
      </div>

      {totalTasks === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Clock className="w-7 h-7 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
          <p className="text-s text-muted-foreground">Nothing waiting on client</p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {preview.map((item) => (
            <CompactRow key={item.task.id} item={item} />
          ))}
        </div>
      )}

      {allTasks.length > PREVIEW_COUNT && (
        <Link
          href={`/dashboard/waiting-on-client${tab ? `?tab=${tab}` : ""}`}
          className="w-full px-4 py-2.5 border-t border-border text-s font-medium text-primary hover:bg-accent/30 transition-colors flex items-center justify-center gap-xs"
        >
          <ExternalLink className="w-3 h-3" />
          View All ({totalTasks})
        </Link>
      )}
    </div>
  );
}
