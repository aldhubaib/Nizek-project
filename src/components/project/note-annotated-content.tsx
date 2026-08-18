"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { ArrowLeft, Check, CheckSquare, Copy, Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NoteAnnotation } from "@/components/tiptap/note-annotation-mark";
import { AttendanceBlock } from "@/components/tiptap/attendance-block";
import { createNoteComment, getNoteCommentThread } from "@/actions/note-comment";
import { getProjectMembersForMention } from "@/actions/comment";
import {
  NoteCommentPopover,
  type NoteCommentThreadView,
} from "@/components/project/note-comment-panel";
import {
  TaskPreviewPopover,
  type TaskPreviewSeed,
} from "@/components/project/task-preview-popover";

type SelectionState = {
  text: string;
  top: number;
  left: number;
};

type GutterIcon =
  | {
      kind: "comment";
      threadId: string;
      top: number;
      understood: boolean;
      count: number;
    }
  | {
      kind: "task";
      taskId: string;
      top: number;
      done: boolean;
    };

export function NoteAnnotatedContent({
  content,
  noteId,
  projectId,
  canCreateTask,
  threads,
  openThreadId,
  onOpenThread,
  taskUrl,
  linkedTasks = [],
  onCreateTask,
  onChanged,
}: {
  content: string;
  noteId: string;
  projectId: string;
  canCreateTask: boolean;
  threads: NoteCommentThreadView[];
  openThreadId: string | null;
  onOpenThread: (threadId: string | null) => void;
  taskUrl: (taskId: string) => string;
  linkedTasks?: TaskPreviewSeed[];
  onCreateTask: (quote: string) => void;
  onChanged: () => void;
}) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [fetchedThread, setFetchedThread] = useState<NoteCommentThreadView | null>(null);
  const [popoverTick, setPopoverTick] = useState(0);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; name: string | null }[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [icons, setIcons] = useState<GutterIcon[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const quoteRef = useRef("");
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  const [sheetOffset, setSheetOffset] = useState(0);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const linkedTasksRef = useRef(linkedTasks);
  linkedTasksRef.current = linkedTasks;

  const layoutIcons = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const next: GutterIcon[] = [];
    const seenThread = new Set<string>();
    const seenTask = new Set<string>();

    for (const el of wrap.querySelectorAll<HTMLElement>(
      "mark.note-annotation-comment[data-thread-id], mark[data-kind='comment'][data-thread-id]",
    )) {
      const threadId = el.getAttribute("data-thread-id");
      if (!threadId || seenThread.has(threadId)) continue;
      seenThread.add(threadId);
      const r = el.getBoundingClientRect();
      const thread = threadsRef.current.find((t) => t.id === threadId);
      next.push({
        kind: "comment",
        threadId,
        top: r.top - wrapRect.top + wrap.scrollTop,
        understood: thread?.understood ?? false,
        count: thread?.comments.length ?? 1,
      });
    }

    for (const el of wrap.querySelectorAll<HTMLElement>(
      "mark.note-annotation-task[data-task-id], mark[data-kind='task'][data-task-id]",
    )) {
      const taskId = el.getAttribute("data-task-id");
      if (!taskId || seenTask.has(taskId)) continue;
      seenTask.add(taskId);
      const r = el.getBoundingClientRect();
      next.push({
        kind: "task",
        taskId,
        top: r.top - wrapRect.top + wrap.scrollTop,
        done: linkedTasksRef.current.find((t) => t.id === taskId)?.stage === "DONE",
      });
    }

    next.sort((a, b) => a.top - b.top);
    for (let i = 1; i < next.length; i++) {
      const prev = next[i - 1];
      if (next[i].top - prev.top < 32) next[i].top = prev.top + 36;
    }
    setIcons(next);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ inline: false }),
      NoteAnnotation,
      AttendanceBlock,
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "focus:outline-none prose prose-invert max-w-none text-base leading-relaxed prose-headings:font-bold prose-h1:text-4xl prose-h2:text-2xl prose-h3:text-xl prose-img:rounded-lg prose-img:max-w-full",
      },
      handleClick: (view, pos) => {
        const marks = view.state.doc.resolve(pos).marks();
        const ann = marks.find((m) => m.type.name === "noteAnnotation");
        if (!ann) return false;
        if (ann.attrs.threadId) {
          setOpenTaskId(null);
          onOpenThread(ann.attrs.threadId);
        }
        if (ann.attrs.taskId) {
          onOpenThread(null);
          setOpenTaskId((current) =>
            current === ann.attrs.taskId ? null : ann.attrs.taskId,
          );
        }
        return true;
      },
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to, empty } = ed.state.selection;
      if (empty || from === to) {
        if (!commenting) setSelection(null);
        return;
      }
      const text = ed.state.doc.textBetween(from, to, " ").trim();
      if (!text) {
        if (!commenting) setSelection(null);
        return;
      }
      const start = ed.view.coordsAtPos(from);
      const end = ed.view.coordsAtPos(to);
      const wrap = wrapRef.current?.getBoundingClientRect();
      setSelection({
        text,
        top: Math.min(start.top, end.top) - (wrap?.top ?? 0) - 44,
        left: (start.left + end.left) / 2 - (wrap?.left ?? 0),
      });
      quoteRef.current = text;
    },
    onCreate: () => {
      requestAnimationFrame(layoutIcons);
    },
    onUpdate: () => {
      requestAnimationFrame(layoutIcons);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (content !== editor.getHTML()) editor.commands.setContent(content);
    requestAnimationFrame(layoutIcons);
  }, [content, editor, layoutIcons]);

  useLayoutEffect(() => {
    layoutIcons();
  }, [layoutIcons, threads, linkedTasks, content]);

  useEffect(() => {
    const onResize = () => layoutIcons();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [layoutIcons]);

  useEffect(() => {
    setPortalTarget(document.body);
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    getProjectMembersForMention(projectId)
      .then((res) => setMembers(res.members))
      .catch(() => setMembers([]));
  }, [projectId]);

  useEffect(() => {
    if (!commenting || isDesktop) {
      setSheetOffset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      setSheetOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [commenting, isDesktop]);

  useEffect(() => {
    if (!openThreadId) {
      setFetchedThread(null);
      return;
    }
    const existing = threads.find((t) => t.id === openThreadId);
    if (existing) {
      setFetchedThread(existing);
      return;
    }
    let cancelled = false;
    void getNoteCommentThread(openThreadId)
      .then((data) => {
        if (cancelled) return;
        setFetchedThread({
          id: data.id,
          quoteText: data.quoteText,
          conversationId: data.conversationId,
          comments: data.comments,
          understood: data.understood,
        });
      })
      .catch(() => {
        if (!cancelled) setFetchedThread(null);
      });
    return () => {
      cancelled = true;
    };
  }, [openThreadId, threads]);

  useEffect(() => {
    if (!openThreadId && !openTaskId) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-note-comment-ui]")) return;
      onOpenThread(null);
      setOpenTaskId(null);
    }
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openThreadId, openTaskId, onOpenThread]);

  useEffect(() => {
    if (!openThreadId || !wrapRef.current) return;
    const el = wrapRef.current.querySelector(`[data-thread-id="${openThreadId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [openThreadId]);

  useEffect(() => {
    if (!openThreadId) return;
    const scrollParent = wrapRef.current?.closest(".overflow-y-auto, .overflow-auto");
    const sync = () => setPopoverTick((n) => n + 1);
    scrollParent?.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      scrollParent?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [openThreadId]);

  const closeComposer = useCallback(() => {
    setCommenting(false);
    setDraft("");
    setError(null);
    setSelection(null);
    editor?.commands.setTextSelection(editor.state.selection.to);
  }, [editor]);

  function keepHighlight(e: { preventDefault: () => void }) {
    e.preventDefault();
  }

  async function copyHighlight() {
    const text = quoteRef.current.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  async function submitComment() {
    const quote = quoteRef.current.trim();
    const text = draft.trim();
    if (!quote || !text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createNoteComment({
        noteId,
        quoteText: quote,
        content: text,
      });
      closeComposer();
      onChanged();
      onOpenThread(result.threadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  }

  const mentionResults = mentionQuery
    ? members.filter((m) =>
        (m.name ?? "").toLowerCase().includes(mentionQuery.toLowerCase()),
      )
    : members;

  function previewTask(taskId: string) {
    onOpenThread(null);
    setOpenTaskId((current) => (current === taskId ? null : taskId));
  }

  const openThread =
    threads.find((t) => t.id === openThreadId) ??
    (fetchedThread?.id === openThreadId ? fetchedThread : null);
  const openTaskIcon = icons.find(
    (i) => i.kind === "task" && i.taskId === openTaskId,
  );
  const openTaskSeed = linkedTasks.find((t) => t.id === openTaskId) ?? null;

  void popoverTick;
  const commentIconRect =
    openThreadId && typeof document !== "undefined"
      ? wrapRef.current
          ?.querySelector(`[data-comment-icon="${openThreadId}"]`)
          ?.getBoundingClientRect()
      : undefined;
  const commentPopoverStyle: CSSProperties | undefined = !openThread
    ? undefined
    : !isDesktop
      ? {
          left: 12,
          right: 12,
          bottom: `max(0.75rem, env(safe-area-inset-bottom, 0px))`,
        }
      : commentIconRect
        ? {
            top: Math.max(
              12,
              Math.min(commentIconRect.top - 8, window.innerHeight - 24),
            ),
            left: Math.max(12, commentIconRect.left - 328),
            width: 320,
          }
        : { top: 72, right: 24, width: 320 };

  return (
    <div ref={wrapRef} className="relative pe-10 sm:pe-12">
      <EditorContent editor={editor} />

      {icons.map((icon) =>
        icon.kind === "task" ? (
          <button
            key={`task-${icon.taskId}`}
            type="button"
            data-note-comment-ui
            title={icon.done ? "Task done" : "Preview task"}
            onClick={() => previewTask(icon.taskId)}
            className={cn(
              "absolute right-0 z-10 grid size-7 -translate-y-1 place-items-center rounded-full border shadow-sm transition-colors sm:size-8",
              icon.done
                ? "border-border bg-popover text-muted-foreground/50 hover:text-muted-foreground"
                : openTaskId === icon.taskId
                  ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                  : "border-border bg-popover text-emerald-400 hover:border-emerald-400/50 hover:bg-emerald-500/10",
            )}
            style={{ top: icon.top }}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {icon.done ? (
              <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-muted text-muted-foreground">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
            ) : null}
          </button>
        ) : (
          <button
            key={`comment-${icon.threadId}`}
            type="button"
            data-note-comment-ui
            data-comment-icon={icon.threadId}
            title={icon.understood ? "Understood" : "Open comment"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setOpenTaskId(null);
              onOpenThread(openThreadId === icon.threadId ? null : icon.threadId);
            }}
            className={cn(
              "absolute right-0 z-10 grid size-7 -translate-y-1 place-items-center rounded-full border shadow-sm transition-colors sm:size-8",
              icon.understood
                ? "border-border bg-popover text-muted-foreground/50 hover:text-muted-foreground"
                : openThreadId === icon.threadId
                  ? "border-amber-400/60 bg-amber-500/20 text-amber-300"
                  : "border-border bg-popover text-amber-400 hover:border-amber-400/50 hover:bg-amber-500/10",
            )}
            style={{ top: icon.top }}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {icon.understood ? (
              <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-muted text-muted-foreground">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
            ) : icon.count > 0 ? (
              <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-xs font-bold leading-4 text-background">
                {icon.count}
              </span>
            ) : null}
          </button>
        ),
      )}

      {openThread && portalTarget
        ? createPortal(
            <div
              data-note-comment-ui
              className="fixed z-[400]"
              style={commentPopoverStyle}
            >
              <NoteCommentPopover
                thread={openThread}
                noteId={noteId}
                className="w-full max-w-none"
                onClose={() => onOpenThread(null)}
                onChanged={onChanged}
              />
            </div>,
            portalTarget,
          )
        : null}

      {openTaskId && (
        <div
          data-note-comment-ui
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[300] lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-11 lg:z-30 lg:top-[var(--gutter-top)]"
          style={{ ["--gutter-top" as string]: `${Math.max(0, (openTaskIcon?.top ?? 0) - 8)}px` }}
        >
          <TaskPreviewPopover
            key={openTaskId}
            taskId={openTaskId}
            href={taskUrl(openTaskId)}
            seed={openTaskSeed}
            onClose={() => setOpenTaskId(null)}
          />
        </div>
      )}

      {selection && !commenting && isDesktop && (
        <div
          className="absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 shadow-lg"
          style={{ top: Math.max(0, selection.top), left: selection.left }}
        >
          <button
            type="button"
            onMouseDown={keepHighlight}
            onClick={() => {
              setCommenting(true);
              setDraft("");
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-s font-medium text-foreground hover:bg-accent"
          >
            <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
            Comment
          </button>
          {canCreateTask && (
            <button
              type="button"
              onMouseDown={keepHighlight}
              onClick={() => {
                const quote = quoteRef.current;
                setSelection(null);
                onCreateTask(quote);
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-s font-medium text-foreground hover:bg-accent"
            >
              <CheckSquare className="h-3.5 w-3.5 text-primary" />
              Create task
            </button>
          )}
        </div>
      )}

      {selection && portalTarget && !isDesktop
        ? createPortal(
            <div
              data-note-comment-ui
              className="fixed inset-x-0 top-0 z-[300] flex app-top-bar items-center gap-0.5 border-b border-border px-1"
            >
              <button
                type="button"
                aria-label="Cancel"
                onMouseDown={keepHighlight}
                onPointerDown={keepHighlight}
                onClick={closeComposer}
                className="grid size-11 shrink-0 place-items-center rounded-full text-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <span className="min-w-0 flex-1 truncate px-1 text-s font-semibold">
                {commenting ? "Comment" : selection.text}
              </span>
              {!commenting && (
                <div className="ms-auto flex items-center">
                  <button
                    type="button"
                    aria-label="Comment"
                    onMouseDown={keepHighlight}
                    onPointerDown={keepHighlight}
                    onClick={() => {
                      setCommenting(true);
                      setDraft("");
                    }}
                    className="grid size-11 place-items-center rounded-full text-foreground hover:bg-muted"
                  >
                    <MessageSquare className="h-5 w-5 text-amber-400" />
                  </button>
                  {canCreateTask && (
                    <button
                      type="button"
                      aria-label="Create task"
                      onMouseDown={keepHighlight}
                      onPointerDown={keepHighlight}
                      onClick={() => {
                        const quote = quoteRef.current;
                        setSelection(null);
                        onCreateTask(quote);
                      }}
                      className="grid size-11 place-items-center rounded-full text-foreground hover:bg-muted"
                    >
                      <CheckSquare className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Copy"
                    onMouseDown={keepHighlight}
                    onPointerDown={keepHighlight}
                    onClick={() => void copyHighlight()}
                    className="grid size-11 place-items-center rounded-full text-foreground hover:bg-muted"
                  >
                    <Copy className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>,
            portalTarget,
          )
        : null}

      {commenting && selection && isDesktop && (
        <div
          data-note-comment-ui
          className="absolute z-30 w-[min(100%,340px)] -translate-x-1/2 rounded-xl border border-border bg-popover p-3 shadow-xl"
          style={{ top: Math.max(0, selection.top), left: selection.left }}
        >
          <CommentComposer
            quote={selection.text}
            draft={draft}
            setDraft={setDraft}
            mentionOpen={mentionOpen}
            setMentionOpen={setMentionOpen}
            setMentionQuery={setMentionQuery}
            mentionResults={mentionResults}
            error={error}
            submitting={submitting}
            showCancel
            compact
            onCancel={closeComposer}
            onSubmit={() => void submitComment()}
          />
        </div>
      )}

      {commenting && selection && !isDesktop && portalTarget
        ? createPortal(
            <div
              data-note-comment-ui
              className="fixed inset-x-0 z-[300] rounded-t-xl border-t border-border bg-popover p-3 shadow-2xl"
              style={{ bottom: sheetOffset }}
            >
              <CommentComposer
                quote={selection.text}
                draft={draft}
                setDraft={setDraft}
                mentionOpen={mentionOpen}
                setMentionOpen={setMentionOpen}
                setMentionQuery={setMentionQuery}
                mentionResults={mentionResults}
                error={error}
                submitting={submitting}
                showCancel={false}
                compact={false}
                onCancel={closeComposer}
                onSubmit={() => void submitComment()}
              />
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}

function CommentComposer({
  quote,
  draft,
  setDraft,
  mentionOpen,
  setMentionOpen,
  setMentionQuery,
  mentionResults,
  error,
  submitting,
  showCancel,
  compact,
  onCancel,
  onSubmit,
}: {
  quote: string;
  draft: string;
  setDraft: (v: string) => void;
  mentionOpen: boolean;
  setMentionOpen: (v: boolean) => void;
  setMentionQuery: (v: string) => void;
  mentionResults: { id: string; name: string | null }[];
  error: string | null;
  submitting: boolean;
  showCancel: boolean;
  compact: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <p className="mb-2 line-clamp-2 border-s-2 border-amber-400/70 ps-2 text-xs italic text-muted-foreground">
        {quote}
      </p>
      <div className="relative">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            const at = v.slice(0, e.target.selectionStart).match(/@([^\s@]*)$/);
            if (at) {
              setMentionOpen(true);
              setMentionQuery(at[1]);
            } else {
              setMentionOpen(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Comment… use @ to mention"
          rows={compact ? 3 : 4}
          className={cn(
            "w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 outline-none focus:border-primary/40",
            compact ? "text-s" : "text-m",
          )}
        />
        {mentionOpen && mentionResults.length > 0 && (
          <div
            className={cn(
              "absolute left-0 right-0 z-40 max-h-40 overflow-y-auto rounded-md border border-border bg-popover shadow-lg",
              compact ? "top-full mt-1" : "bottom-full mb-1",
            )}
          >
            {mentionResults.slice(0, 8).map((m) => (
              <button
                key={m.id}
                type="button"
                className={cn(
                  "block w-full px-2.5 text-start hover:bg-accent",
                  compact ? "py-1.5 text-s" : "py-2.5 text-s",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const replaced = draft.replace(/@([^\s@]*)$/, `@${m.name ?? ""} `);
                  setDraft(replaced);
                  setMentionOpen(false);
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        {showCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="button" size="sm" onClick={onSubmit} disabled={submitting || !draft.trim()}>
          {submitting ? (
            <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="me-1 h-3.5 w-3.5" />
          )}
          Comment
        </Button>
      </div>
    </>
  );
}

