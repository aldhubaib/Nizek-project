"use client";

import * as React from "react";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Code, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo2, Strikethrough, Undo2 } from "lucide-react";

import { noteSchemaExtensions } from "@/lib/tiptap-schema";
import { cn } from "@/next-ui/lib/cn";
import { Toggle } from "@/next-ui/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/next-ui/ui/tooltip";

/**
 * The new UI's text editor: a note's body, a task's description, a comment. It speaks the same
 * document schema as the live panel's editor (`noteSchemaExtensions`: headings, lists, images,
 * the annotation marks a comment anchors to, the sprint blocks), so a body written on one
 * panel opens unchanged on the other — anything this editor does not draw (a sprint block) is
 * kept as it is and saved back as it was. The toolbar holds the formatting people reach for;
 * the keyboard shortcuts are TipTap's (⌘B, ⌘I, ⌘Z…).
 */

/** The live schema without its StarterKit (that one has no undo/redo; the collaboration server supplies it there). */
const SCHEMA_EXTRAS = noteSchemaExtensions.filter((e) => e.name !== "starterKit");

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write here…",
  autoFocus,
  readOnly,
  minHeight = "8rem",
  className,
  id,
  "data-testid": testId,
}: {
  /** The body as HTML. Read when the editor mounts; later changes to it reset the editor. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  minHeight?: string;
  className?: string;
  id?: string;
  "data-testid"?: string;
}) {
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), ...SCHEMA_EXTRAS, Placeholder.configure({ placeholder })],
    content: value,
    autofocus: autoFocus ? "end" : false,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm prose-invert max-w-none break-words outline-none [&_a]:underline-offset-2 [&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-muted-foreground [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
        ...(id ? { id } : {}),
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.isEmpty ? "" : editor.getHTML()),
  });

  // a value set from outside (another record opened in the same dialog) replaces the text
  const last = React.useRef(value);
  React.useEffect(() => {
    if (!editor || value === last.current) return;
    last.current = value;
    if (editor.getHTML() !== value) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  React.useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        readOnly && "opacity-70",
        className,
      )}
      data-testid={testId}
    >
      {!readOnly && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="px-3 py-2 text-sm [&_.tiptap]:min-h-(--min-h)" style={{ "--min-h": minHeight } as React.CSSProperties} dir="auto" />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bullets: e.isActive("bulletList"),
            numbers: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            code: e.isActive("codeBlock"),
            link: e.isActive("link"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });
  if (!editor || !state) return <div className="h-9 border-b" aria-hidden />;
  const run = (fn: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => () => fn(editor.chain().focus()).run();
  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link address", previous ?? "https://");
    if (url === null) return;
    const trimmed = url.trim();
    if (trimmed === "" || trimmed === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
  };
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1" role="toolbar" aria-label="Formatting" onMouseDown={(e) => e.preventDefault()}>
      <Tool label="Bold" pressed={state.bold} onClick={run((c) => c.toggleBold())}>
        <Bold />
      </Tool>
      <Tool label="Italic" pressed={state.italic} onClick={run((c) => c.toggleItalic())}>
        <Italic />
      </Tool>
      <Tool label="Strikethrough" pressed={state.strike} onClick={run((c) => c.toggleStrike())}>
        <Strikethrough />
      </Tool>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <Tool label="Heading" pressed={state.h2} onClick={run((c) => c.toggleHeading({ level: 2 }))}>
        <Heading2 />
      </Tool>
      <Tool label="Subheading" pressed={state.h3} onClick={run((c) => c.toggleHeading({ level: 3 }))}>
        <Heading3 />
      </Tool>
      <Tool label="Bullet list" pressed={state.bullets} onClick={run((c) => c.toggleBulletList())}>
        <List />
      </Tool>
      <Tool label="Numbered list" pressed={state.numbers} onClick={run((c) => c.toggleOrderedList())}>
        <ListOrdered />
      </Tool>
      <Tool label="Quote" pressed={state.quote} onClick={run((c) => c.toggleBlockquote())}>
        <Quote />
      </Tool>
      <Tool label="Code block" pressed={state.code} onClick={run((c) => c.toggleCodeBlock())}>
        <Code />
      </Tool>
      <Tool label="Link" pressed={state.link} onClick={setLink}>
        <Link2 />
      </Tool>
      <span className="ms-auto flex items-center gap-0.5">
        <Tool label="Undo" pressed={false} disabled={!state.canUndo} onClick={run((c) => c.undo())}>
          <Undo2 />
        </Tool>
        <Tool label="Redo" pressed={false} disabled={!state.canRedo} onClick={run((c) => c.redo())}>
          <Redo2 />
        </Tool>
      </span>
    </div>
  );
}

function Tool({ label, pressed, disabled, onClick, children }: { label: string; pressed: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle size="sm" aria-label={label} pressed={pressed} disabled={disabled} onPressedChange={onClick} className="size-7 min-w-7 p-0 [&_svg]:size-3.5" tabIndex={-1}>
          {children}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
