"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Check, Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NoteAnnotation } from "@/components/tiptap/note-annotation-mark";
import { AttendanceBlock } from "@/components/tiptap/attendance-block";
import { createTaskHighlightComment } from "@/actions/task-highlight-comment";
import { getProjectMembersForMention } from "@/actions/comment";
import { asAnnotatableHtml } from "@/lib/html-annotate";
import {
  TaskHighlightPopover,
  type TaskHighlightThreadView,
} from "@/components/project/task-highlight-popover";

type SelectionState = {
  text: string;
  top: number;
  left: number;
};

type GutterIcon = {
  threadId: string;
  top: number;
  understood: boolean;
  count: number;
};

export function TaskAnnotatedContent({
  content,
  taskId,
  projectId,
  threads,
  openThreadId,
  onOpenThread,
  onChanged,
}: {
  content: string;
  taskId: string;
  projectId: string;
  threads: TaskHighlightThreadView[];
  openThreadId: string | null;
  onOpenThread: (threadId: string | null) => void;
  onChanged: (nextDescription?: string | null) => void;
}) {
  const html = asAnnotatableHtml(content);
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
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const layoutIcons = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const marks = wrap.querySelectorAll<HTMLElement>("mark.note-annotation-comment[data-thread-id]");
    const seen = new Set<string>();
    const next: GutterIcon[] = [];
    for (const el of marks) {
      const threadId = el.getAttribute("data-thread-id");
      if (!threadId || seen.has(threadId)) continue;
      seen.add(threadId);
      const r = el.getBoundingClientRect();
      const thread = threadsRef.current.find((t) => t.id === threadId);
      next.push({
        threadId,
        top: r.top - wrapRect.top + wrap.scrollTop,
        understood: thread?.understood ?? false,
        count: thread?.comments.length ?? 1,
      });
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
    content: html,
    editorProps: {
      attributes: {
        class:
          "focus:outline-none prose prose-invert max-w-none text-s leading-relaxed text-muted-foreground prose-p:my-0",
      },
      handleClick: (view, pos) => {
        const marks = view.state.doc.resolve(pos).marks();
        const ann = marks.find((m) => m.type.name === "noteAnnotation");
        if (!ann) return false;
        if (ann.attrs.threadId) onOpenThread(ann.attrs.threadId);
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
    if (html !== editor.getHTML()) editor.commands.setContent(html);
    requestAnimationFrame(layoutIcons);
  }, [html, editor, layoutIcons]);

  useLayoutEffect(() => {
    layoutIcons();
  }, [layoutIcons, threads, html]);

  useEffect(() => {
    const onResize = () => layoutIcons();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [layoutIcons]);

  useEffect(() => {
    getProjectMembersForMention(projectId)
      .then((res) => setMembers(res.members))
      .catch(() => setMembers([]));
  }, [projectId]);

  useEffect(() => {
    if (!openThreadId) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-note-comment-ui]")) return;
      onOpenThread(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openThreadId, onOpenThread]);

  useEffect(() => {
    if (!openThreadId || !wrapRef.current) return;
    const el = wrapRef.current.querySelector(`[data-thread-id="${openThreadId}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [openThreadId]);

  const closeComposer = useCallback(() => {
    setCommenting(false);
    setDraft("");
    setError(null);
    setSelection(null);
    editor?.commands.setTextSelection(editor.state.selection.to);
  }, [editor]);

  async function submitComment() {
    const quote = quoteRef.current.trim();
    const text = draft.trim();
    if (!quote || !text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createTaskHighlightComment({
        taskId,
        quoteText: quote,
        content: text,
      });
      closeComposer();
      onChanged(result.description);
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

  const openThread = threads.find((t) => t.id === openThreadId) ?? null;
  const openIcon = icons.find((i) => i.threadId === openThreadId);

  return (
    <div ref={wrapRef} className="relative pe-12">
      <EditorContent editor={editor} />

      {icons.map((icon) => (
        <button
          key={icon.threadId}
          type="button"
          data-note-comment-ui
          title={icon.understood ? "Understood" : "Open comment"}
          onClick={() =>
            onOpenThread(openThreadId === icon.threadId ? null : icon.threadId)
          }
          className={cn(
            "absolute right-0 z-10 grid size-8 -translate-y-1 place-items-center rounded-full border shadow-sm transition-colors",
            icon.understood
              ? "border-border bg-popover text-muted-foreground/50 hover:text-muted-foreground"
              : openThreadId === icon.threadId
                ? "border-orange/60 bg-orange/20 text-orange"
                : "border-border bg-popover text-orange hover:border-orange/50 hover:bg-orange/10",
          )}
          style={{ top: icon.top }}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {icon.understood ? (
            <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-muted text-muted-foreground">
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
          ) : icon.count > 0 ? (
            <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-orange px-1 text-xs font-bold leading-4 text-background">
              {icon.count}
            </span>
          ) : null}
        </button>
      ))}

      {openThread && (
        <div
          data-note-comment-ui
          className="absolute right-11 z-30"
          style={{ top: Math.max(0, (openIcon?.top ?? 0) - 8) }}
        >
          <TaskHighlightPopover
            thread={openThread}
            taskId={taskId}
            onClose={() => onOpenThread(null)}
            onChanged={() => onChanged()}
          />
        </div>
      )}

      {selection && !commenting && (
        <div
          className="absolute z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 shadow-lg"
          style={{ top: Math.max(0, selection.top), left: selection.left }}
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setCommenting(true);
              setDraft("");
            }}
            className="inline-flex items-center gap-xs rounded-md px-2.5 py-1.5 text-s font-medium text-foreground hover:bg-accent"
          >
            <MessageSquare className="h-3.5 w-3.5 text-orange" />
            Comment
          </button>
        </div>
      )}

      {commenting && selection && (
        <div
          className="absolute z-30 w-[min(100%,340px)] -translate-x-1/2 rounded-xl border border-border bg-popover p-3 shadow-xl"
          style={{ top: Math.max(0, selection.top), left: selection.left }}
        >
          <p className="mb-2 line-clamp-2 border-s-2 border-orange/70 ps-2 text-xs italic text-muted-foreground">
            {selection.text}
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
                  void submitComment();
                }
                if (e.key === "Escape") closeComposer();
              }}
              placeholder="Comment… use @ to mention"
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-s outline-none focus:border-primary/40"
            />
            {mentionOpen && mentionResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                {mentionResults.slice(0, 8).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="block w-full px-2.5 py-1.5 text-start text-s hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const replaced = draft.replace(
                        /@([^\s@]*)$/,
                        `@${m.name ?? ""} `,
                      );
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
            <Button type="button" size="sm" variant="ghost" onClick={closeComposer}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void submitComment()}
              disabled={submitting || !draft.trim()}
            >
              {submitting ? (
                <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="me-1 h-3.5 w-3.5" />
              )}
              Comment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
