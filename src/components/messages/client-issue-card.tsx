"use client";

import {
  clientIssueTypeLabel,
  type ClientIssuePayload,
} from "@/lib/client-issue-payload";
import { taskCode } from "@/lib/task-label";
import { ActivityCard } from "@/components/messages/activity-card";
import { activityTheme } from "@/components/messages/activity-themes";
import { cn } from "@/lib/utils";

/**
 * An issue a client raised, shown in both the project channel and the client
 * room from the same message body.
 *
 * Only the team gets a way through to the task: the client wrote this, and the
 * task page is not a surface they can open.
 */
export function ClientIssueCard({
  payload,
  createdAt,
  projectName,
  isClientViewer = false,
}: {
  payload: ClientIssuePayload;
  createdAt: string;
  projectName?: string;
  isClientViewer?: boolean;
}) {
  const visual = activityTheme(payload.taskType);
  const code = taskCode(payload.taskType, payload.taskNumber);

  return (
    <ActivityCard
      theme={visual.theme}
      icon={visual.icon}
      category="Reported by client"
      title={payload.title}
      projectName={payload.projectName || projectName}
      status={clientIssueTypeLabel(payload.taskType)}
      href={
        isClientViewer
          ? undefined
          : `/dashboard/projects/${payload.projectId}/tasks/${payload.taskId}`
      }
      actionLabel={`Open ${code}`}
      createdAt={createdAt}
    >
      {payload.excerpt ? (
        <blockquote
          className={cn(
            "border-s-2 ps-3 text-s italic text-muted-foreground",
            visual.theme.quote ?? "border-primary/60",
          )}
        >
          {payload.excerpt}
        </blockquote>
      ) : null}
      {isClientViewer ? (
        <p className="text-s leading-relaxed text-muted-foreground">
          Logged as {code}. The team will pick this up from here.
        </p>
      ) : null}
    </ActivityCard>
  );
}
