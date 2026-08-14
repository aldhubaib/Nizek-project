"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus,
  Quote,
  Code,
  ImageIcon,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFileToR2 } from "@/lib/upload";
import { NoteAnnotation } from "@/components/tiptap/note-annotation-mark";

export interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  borderless?: boolean;
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Type '/' for commands...",
  borderless = false,
}: RichTextEditorProps) {
  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; query: string } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      Image.configure({ inline: false }),
      NoteAnnotation,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      checkSlashCommand(editor);
    },
    editorProps: {
      attributes: {
        class: cn(
          "focus:outline-none prose prose-invert max-w-none",
          borderless
            ? "min-h-[60vh] text-lg leading-relaxed prose-headings:font-bold prose-h1:text-4xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-base prose-img:rounded-lg prose-img:max-w-full"
            : "min-h-[120px] px-3 py-2 text-sm prose-sm"
        ),
      },
      handleKeyDown: (_view, event) => {
        if (slashMenu) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSlashIndex((i) => Math.min(i + 1, getFilteredCommands(slashMenu.query).length - 1));
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSlashIndex((i) => Math.max(i - 1, 0));
            return true;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const cmds = getFilteredCommands(slashMenu.query);
            if (cmds[slashIndex]) {
              executeCommand(cmds[slashIndex].id);
            }
            return true;
          }
          if (event.key === "Escape") {
            setSlashMenu(null);
            return true;
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          event.preventDefault();
          Array.from(files).forEach((file) => {
            if (file.type.startsWith("image/")) {
              insertImageFile(file);
            }
          });
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith("image/")) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) insertImageFile(file);
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  async function insertImageFile(file: File) {
    if (!editor) return;
    try {
      const { url } = await uploadFileToR2(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      console.error("Image upload failed:", err);
    }
  }

  function checkSlashCommand(ed: Editor) {
    const { state } = ed;
    const { from } = state.selection;
    const textBefore = state.doc.textBetween(
      Math.max(0, from - 20),
      from,
      "\0"
    );
    const slashMatch = textBefore.match(/\/([a-zA-Z0-9]*)$/);
    if (slashMatch) {
      const coords = ed.view.coordsAtPos(from);
      const editorRect = ed.view.dom.getBoundingClientRect();
      setSlashMenu({
        x: coords.left - editorRect.left,
        y: coords.bottom - editorRect.top + 4,
        query: slashMatch[1],
      });
      setSlashIndex(0);
    } else {
      setSlashMenu(null);
    }
  }

  const COMMANDS = [
    { id: "h1", label: "Heading 1", description: "Large heading", icon: Heading1 },
    { id: "h2", label: "Heading 2", description: "Medium heading", icon: Heading2 },
    { id: "h3", label: "Heading 3", description: "Small heading", icon: Heading3 },
    { id: "text", label: "Text", description: "Plain text", icon: Type },
    { id: "bullet", label: "Bullet List", description: "Unordered list", icon: List },
    { id: "numbered", label: "Numbered List", description: "Ordered list", icon: ListOrdered },
    { id: "quote", label: "Quote", description: "Block quote", icon: Quote },
    { id: "divider", label: "Divider", description: "Horizontal rule", icon: Minus },
    { id: "code", label: "Code Block", description: "Code snippet", icon: Code },
    { id: "image", label: "Image", description: "Upload from device", icon: ImageIcon },
  ];

  function getFilteredCommands(query: string) {
    if (!query) return COMMANDS;
    const q = query.toLowerCase();
    return COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.id.includes(q)
    );
  }

  function getSlashRange(): { from: number; to: number } | null {
    if (!editor) return null;
    const { from } = editor.state.selection;
    const textBefore = editor.state.doc.textBetween(Math.max(0, from - 20), from, "\0");
    const slashMatch = textBefore.match(/\/([a-zA-Z0-9]*)$/);
    if (slashMatch) {
      return { from: from - slashMatch[0].length, to: from };
    }
    return null;
  }

  const executeCommand = useCallback((id: string) => {
    if (!editor) return;

    const range = getSlashRange();

    if (id === "image") {
      if (range) editor.chain().focus().deleteRange(range).run();
      fileInputRef.current?.click();
      setSlashMenu(null);
      return;
    }

    let chain = editor.chain().focus();
    if (range) {
      chain = chain.deleteRange(range);
    }

    switch (id) {
      case "h1":
        chain.setHeading({ level: 1 }).run();
        break;
      case "h2":
        chain.setHeading({ level: 2 }).run();
        break;
      case "h3":
        chain.setHeading({ level: 3 }).run();
        break;
      case "text":
        chain.setParagraph().run();
        break;
      case "bullet":
        chain.toggleBulletList().run();
        break;
      case "numbered":
        chain.toggleOrderedList().run();
        break;
      case "quote":
        chain.toggleBlockquote().run();
        break;
      case "divider":
        chain.setHorizontalRule().run();
        break;
      case "code":
        chain.toggleCodeBlock().run();
        break;
    }
    setSlashMenu(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      insertImageFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSlashMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!editor) return null;

  const filteredCmds = slashMenu ? getFilteredCommands(slashMenu.query) : [];

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleFileSelect}
    />
  );

  if (borderless) {
    return (
      <div className="relative">
        {hiddenInput}
        <EditorContent editor={editor} />
        {slashMenu && filteredCmds.length > 0 && (
          <SlashCommandMenu
            ref={menuRef}
            commands={filteredCmds}
            activeIndex={slashIndex}
            x={slashMenu.x}
            y={slashMenu.y}
            onSelect={executeCommand}
          />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-input bg-background">
      {hiddenInput}
      <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <div className="relative">
        <EditorContent editor={editor} />
        {slashMenu && filteredCmds.length > 0 && (
          <SlashCommandMenu
            ref={menuRef}
            commands={filteredCmds}
            activeIndex={slashIndex}
            x={slashMenu.x}
            y={slashMenu.y}
            onSelect={executeCommand}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Slash Command Menu ─── */

import { forwardRef } from "react";

interface SlashMenuProps {
  commands: { id: string; label: string; description: string; icon: typeof Bold }[];
  activeIndex: number;
  x: number;
  y: number;
  onSelect: (id: string) => void;
}

const SlashCommandMenu = forwardRef<HTMLDivElement, SlashMenuProps>(
  ({ commands, activeIndex, x, y, onSelect }, ref) => {
    return (
      <div
        ref={ref}
        className="absolute z-50 w-56 rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
        style={{ left: x, top: y }}
      >
        <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Blocks
        </div>
        <div className="max-h-[260px] overflow-y-auto pb-1">
          {commands.map((cmd, i) => {
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.id}
                onClick={() => onSelect(cmd.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-2.5 py-2 text-left transition-colors",
                  i === activeIndex ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <div className="w-8 h-8 rounded-md border border-border bg-background flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-foreground">{cmd.label}</div>
                  <div className="text-[10px] text-muted-foreground">{cmd.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);
SlashCommandMenu.displayName = "SlashCommandMenu";

/* ─── Toolbar Button ─── */

function ToolbarButton({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded p-1.5 transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
