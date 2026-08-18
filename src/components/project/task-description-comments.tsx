"use client";

import { useCallback, useEffect, useState } from "react";
import { getTaskHighlightThreads } from "@/actions/task-highlight-comment";
import { TaskAnnotatedContent } from "@/components/project/task-annotated-content-lazy";
import type { TaskHighlightThreadView } from "@/components/project/task-highlight-popover";
import { useKanbanStore } from "@/store/kanban";

export function TaskDescriptionComments({
  description,
  taskId,
  projectId,
  initialThreadId = null,
  onThreadsChange,
}: {
  description: string;
  taskId: string;
  projectId: string;
  initialThreadId?: string | null;
  onThreadsChange?: (threads: TaskHighlightThreadView[]) => void;
}) {
  const [content, setContent] = useState(description);
  const [threads, setThreads] = useState<TaskHighlightThreadView[]>([]);
  const [openThreadId, setOpenThreadId] = useState<string | null>(initialThreadId);

  const loadThreads = useCallback(async () => {
    const data = await getTaskHighlightThreads(taskId);
    const next = data.map((t) => ({
      id: t.id,
      quoteText: t.quoteText,
      conversationId: t.conversationId,
      understood: t.understood,
      comments: t.comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        user: c.user,
      })),
    }));
    setThreads(next);
  }, [taskId]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    onThreadsChange?.(threads);
  }, [threads, onThreadsChange]);

  useEffect(() => {
    setContent(description);
  }, [description]);

  useEffect(() => {
    if (initialThreadId) setOpenThreadId(initialThreadId);
  }, [initialThreadId]);

  if (!content.trim()) return null;

  return (
    <TaskAnnotatedContent
      content={content}
      taskId={taskId}
      projectId={projectId}
      threads={threads}
      openThreadId={openThreadId}
      onOpenThread={setOpenThreadId}
      onChanged={(next) => {
        if (next) {
          setContent(next);
          useKanbanStore.getState().updateTask(taskId, { description: next });
        }
        void loadThreads();
      }}
    />
  );
}
