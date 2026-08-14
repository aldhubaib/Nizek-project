"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { CheckSquare, Loader2, MessageSquareText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoteAnnotation } from "@/components/tiptap/note-annotation-mark";
import { createNoteComment } from "@/actions/note-comment";
import { getProjectMembersForMention } from "@/actions/comment";

type SelectionState = {
  text: string;
  top: number;
  left: number;
};

export function NoteAnnotatedContent({
  content,
  noteId,
  projectId,
  canCreateTask,
  onOpenThread,
  onOpenTask,
  onCreateTask,
  onChanged,
}: {
  content: string;
  noteId: string;
  projectId: string;
  canCreateTask: boolean;
  onOpenThread: (threadId: string) => void;
  onOpenTask: (taskId: string) => void;
  onCreateTask: (quote: string) => void;
  onChanged: () => void;
}) {
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; name: string | null }[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const quoteRef = useRef("");

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ inline: false }),
      NoteAnnotation,
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
        if (ann.attrs.threadId) onOpenThread(ann.attrs.threadId);
        if (ann.attrs.taskId) onOpenTask(ann.attrs.taskId);
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
  });

  useEffect(() => {
    if (!editor) return;
    if (content !== editor.getHTML()) editor.commands.setContent(content);
  }, [content, editor]);

  useEffect(() => {
    getProjectMembersForMention(projectId)
      .then((res) => setMembers(res.members))
      .catch(() => setMembers([]));
  }, [projectId]);

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

  return (
    <div ref={wrapRef} className="relative">
      <EditorContent editor={editor} />

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
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-accent"
          >
            <MessageSquareText className="h-3.5 w-3.5 text-amber-400" />
            Comment
          </button>
          {canCreateTask && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const quote = quoteRef.current;
                setSelection(null);
                onCreateTask(quote);
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-accent"
            >
              <CheckSquare className="h-3.5 w-3.5 text-primary" />
              Create task
            </button>
          )}
        </div>
      )}

      {commenting && selection && (
        <div
          className="absolute z-30 w-[min(100%,340px)] -translate-x-1/2 rounded-xl border border-border bg-popover p-3 shadow-xl"
          style={{ top: Math.max(0, selection.top), left: selection.left }}
        >
          <p className="mb-2 line-clamp-2 border-l-2 border-amber-400/70 pl-2 text-[11px] italic text-muted-foreground">
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
              className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-[13px] outline-none focus:border-primary/40"
            />
            {mentionOpen && mentionResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                {mentionResults.slice(0, 8).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="block w-full px-2.5 py-1.5 text-left text-[12px] hover:bg-accent"
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
          {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
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
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 h-3.5 w-3.5" />
              )}
              Comment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}