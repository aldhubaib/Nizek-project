"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { AtSign, X, ExternalLink, Eye, CheckCheck, Sparkles, Zap, Bug, AlertCircle, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { markMentionRead, markMentionsReadBulk } from "@/actions/dashboard";

interface Mention {
  id: string;
  taskId: string;
  taskTitle: string;
  taskNumber: number;
  taskType: string;
  projectId: string;
  projectName: string;
  comment: string;
  commentedBy: { id: string; name: string | null; imageUrl: string | null };
  commentedAt: string;
}

const TASK_TYPE_ICONS: Record<string, { icon: typeof Sparkles; color: string }> = {
  FEATURE: { icon: Sparkles, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  ENHANCEMENT: { icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  BUG: { icon: Bug, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  REPORTED_BUG: { icon: AlertCircle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  DESIGN: { icon: Palette, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
};

const PREVIEW_COUNT = 5;

function Avatar({ user, size = 16 }: { user: { name: string | null; imageUrl: string | null }; size?: number }) {
  if (user.imageUrl) {
    return <img src={user.imageUrl} alt="" className="rounded-full shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-full bg-muted flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {(user.name ?? "?")[0]}
    </div>
  );
}

function CompactRow({ mention, onMarkRead }: { mention: Mention; onMarkRead: (id: string) => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 hover:bg-accent/20 transition-colors group">
      <div className="mt-0.5 w-2 h-2 rounded-full bg-primary shrink-0" />
      <Link
        href={`/dashboard/projects/${mention.projectId}/tasks/${mention.taskId}`}
        className="flex-1 min-w-0"
      >
        <div className="flex items-center gap-1.5 text-[12px] flex-wrap">
          <Avatar user={mention.commentedBy} />
          <span className="font-medium">{mention.commentedBy.name}</span>
          <span className="text-muted-foreground">in</span>
          <span className="font-medium truncate">
            #{mention.taskNumber} {mention.taskTitle}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{mention.comment}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-muted-foreground/50">{mention.projectName}</span>
          <span className="text-[10px] text-muted-foreground/30">·</span>
          <span className="text-[10px] text-muted-foreground/50">
            {formatDistanceToNow(new Date(mention.commentedAt), { addSuffix: true })}
          </span>
        </div>
      </Link>
      <button
        onClick={() => onMarkRead(mention.id)}
        className="shrink-0 p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
        title="Mark as read"
      >
        <Eye className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function FullRow({ mention, onMarkRead }: { mention: Mention; onMarkRead: (id: string) => void }) {
  const typeInfo = TASK_TYPE_ICONS[mention.taskType];
  const TypeIcon = typeInfo?.icon ?? Sparkles;

  return (
    <div className="flex items-start gap-4 px-5 py-3.5 hover:bg-accent/20 transition-colors group">
      <div className="mt-1 w-2 h-2 rounded-full bg-primary shrink-0" />
      <Avatar user={mention.commentedBy} size={28} />
      <Link
        href={`/dashboard/projects/${mention.projectId}/tasks/${mention.taskId}`}
        className="flex-1 min-w-0"
      >
        <div className="flex items-center gap-1.5 text-[13px]">
          <span className="font-semibold">{mention.commentedBy.name}</span>
          <span className="text-muted-foreground">mentioned you in</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className={cn("w-5 h-5 rounded flex items-center justify-center border shrink-0", typeInfo?.color ?? "text-muted-foreground bg-muted border-border")}>
            <TypeIcon className="w-3 h-3" />
          </div>
          <span className="text-[13px] font-medium group-hover:text-primary transition-colors">
            <span className="text-muted-foreground/50 font-mono mr-1">#{mention.taskNumber}</span>
            {mention.taskTitle}
          </span>
        </div>
        <p className="text-[12px] text-muted-foreground mt-1.5 line-clamp-2">{mention.comment}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground/50">{mention.projectName}</span>
          <span className="text-[10px] text-muted-foreground/30">·</span>
          <span className="text-[10px] text-muted-foreground/50">
            {formatDistanceToNow(new Date(mention.commentedAt), { addSuffix: true })}
          </span>
        </div>
      </Link>
      <button
        onClick={() => onMarkRead(mention.id)}
        className="shrink-0 p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
        title="Mark as read"
      >
        <Eye className="w-4 h-4" />
      </button>
    </div>
  );
}

export function UnreadMentions({ data }: { data: Mention[] }) {
  const [mentions, setMentions] = useState(data);
  const [showAll, setShowAll] = useState(false);
  const [isPending, startTransition] = useTransition();

  const byProject: Record<string, number> = {};
  for (const m of mentions) {
    byProject[m.projectName] = (byProject[m.projectName] ?? 0) + 1;
  }
  const projectBreakdown = Object.entries(byProject).sort((a, b) => b[1] - a[1]);

  const preview = mentions.slice(0, PREVIEW_COUNT);

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markMentionRead(id);
      setMentions((prev) => prev.filter((m) => m.id !== id));
    });
  }

  function handleMarkAllRead() {
    const ids = mentions.map((m) => m.id);
    startTransition(async () => {
      await markMentionsReadBulk(ids);
      setMentions([]);
      setShowAll(false);
    });
  }

  return (
    <>
      <div className={cn("rounded-xl border border-border bg-card overflow-hidden", isPending && "opacity-70 pointer-events-none")}>
        <div className="px-4 py-3.5 border-b border-border">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[14px] font-semibold flex items-center gap-2">
              <AtSign className="w-4 h-4 text-muted-foreground" />
              Unread Mentions
            </h2>
            {mentions.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5">
                {mentions.length} unread
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            {projectBreakdown.slice(0, 4).map(([name, count]) => (
              <span key={name} className="text-muted-foreground">
                {name}: <span className="font-semibold text-foreground">{count}</span>
              </span>
            ))}
            {projectBreakdown.length > 4 && (
              <span className="text-muted-foreground/50">+{projectBreakdown.length - 4} more</span>
            )}
            {mentions.length === 0 && (
              <span className="text-muted-foreground">All caught up</span>
            )}
          </div>
        </div>

        {mentions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AtSign className="w-7 h-7 text-muted-foreground/20 mb-2" strokeWidth={1.5} />
            <p className="text-[12px] text-muted-foreground">No unread mentions</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {preview.map((m) => (
              <CompactRow key={m.id} mention={m} onMarkRead={handleMarkRead} />
            ))}
          </div>
        )}

        {mentions.length > PREVIEW_COUNT && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full px-4 py-2.5 border-t border-border text-[12px] font-medium text-primary hover:bg-accent/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-3 h-3" />
            View All ({mentions.length})
          </button>
        )}
      </div>

      {showAll && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex flex-col">
          <div className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowAll(false)} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-[13px]">
                <X className="w-4 h-4" />
                Close
              </button>
              <span className="text-border">|</span>
              <h2 className="text-[13px] font-semibold flex items-center gap-2">
                <AtSign className="w-4 h-4 text-muted-foreground" />
                Unread Mentions
                <span className="text-[11px] font-normal text-muted-foreground">({mentions.length} unread)</span>
              </h2>
            </div>
            {mentions.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-accent/30 border border-border"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className={cn("max-w-3xl mx-auto py-4", isPending && "opacity-70 pointer-events-none")}>
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {mentions.map((m) => (
                  <FullRow key={m.id} mention={m} onMarkRead={handleMarkRead} />
                ))}
              </div>
              {mentions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AtSign className="w-8 h-8 text-muted-foreground/20 mb-3" strokeWidth={1.5} />
                  <p className="text-[13px] text-muted-foreground">All caught up!</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
