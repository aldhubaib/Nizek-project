"use client";

import { useEffect, useState } from "react";
import { getTaskActivities } from "@/actions/activity";
import { Loader2, History } from "lucide-react";

interface Activity {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; imageUrl: string | null };
}

const STAGE_LABEL: Record<string, string> = {
  NEW_REQUEST: "New Request",
  CLARIFICATION: "Clarification",
  READY_FOR_DEV: "Ready for Dev",
  IN_DEVELOPMENT: "In Development",
  INTERNAL_REVIEW: "Internal Review",
  CLIENT_REVIEW: "Client Review",
  READY_FOR_RELEASE: "Ready for Release",
  DONE: "Done",
};

function formatLabel(val: string | null): string {
  if (!val) return "—";
  return STAGE_LABEL[val] ?? val;
}

function describeActivity(a: Activity): string {
  const name = a.user.name ?? "Someone";

  switch (a.action) {
    case "created":
      return `${name} created this task`;
    case "moved":
      return `${name} moved from ${formatLabel(a.oldValue)} → ${formatLabel(a.newValue)}`;
    case "assigned":
      return `${name} assigned to ${formatLabel(a.newValue)}`;
    case "unassigned":
      return `${name} unassigned ${formatLabel(a.oldValue)}`;
    case "updated":
      if (a.field === "priority") {
        return `${name} changed priority from ${formatLabel(a.oldValue)} to ${formatLabel(a.newValue)}`;
      }
      if (a.field === "title") {
        return `${name} renamed task`;
      }
      return `${name} updated ${a.field ?? "task"}`;
    case "answered":
      return `${name} updated an answer`;
    case "note_created":
      return `${name} added a note${a.newValue ? `: ${a.newValue}` : ""}`;
    case "transferred":
      return `${name} removed ${a.oldValue ?? "a member"} → assigned ${a.newValue ?? "another member"}`;
    default:
      return `${name} ${a.action}`;
  }
}

function timeAgo(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Props {
  taskId: string;
  refreshKey?: number;
}

export function ActivityTimeline({ taskId, refreshKey }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getTaskActivities(taskId)
      .then((data) => setActivities(data as Activity[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [taskId, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-6 gap-2">
        <History className="w-6 h-6 text-muted-foreground opacity-40" strokeWidth={1.5} />
        <p className="text-[11px] text-muted-foreground/60">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />

      <div className="space-y-0">
        {activities.map((a) => (
          <div key={a.id} className="relative flex gap-3 py-2">
            {/* Dot */}
            <div className="relative z-10 mt-1 shrink-0">
              {a.user.imageUrl ? (
                <img
                  src={a.user.imageUrl}
                  alt=""
                  className="w-[18px] h-[18px] rounded-full ring-2 ring-background"
                />
              ) : (
                <div className="w-[18px] h-[18px] rounded-full bg-muted border-2 border-background flex items-center justify-center">
                  <span className="text-[7px] font-bold text-muted-foreground">
                    {a.user.name?.charAt(0)?.toUpperCase() ?? "?"}
                  </span>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-foreground/80 leading-snug">
                {describeActivity(a)}
              </p>
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                {timeAgo(a.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
