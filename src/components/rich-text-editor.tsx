"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { Node as PMNode } from "@tiptap/pm/model";
import type * as Y from "yjs";
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
  Users,
  Check,
  Loader2,
  ListTodo,
  AlignCenter,
  AlignLeft,
  AlignRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFileToR2 } from "@/lib/upload";
import { NoteAnnotation } from "@/components/tiptap/note-annotation-mark";
import { NoteImage } from "@/components/tiptap/note-image";
import { TextDirection } from "@/components/tiptap/text-direction";
import { ALIGNABLE_TYPES, BlockTextAlign } from "@/components/tiptap/block-align";
import { HeadingBreak } from "@/components/tiptap/heading-break";
import {
  AttendanceBlock,
  type AttendancePerson,
} from "@/components/tiptap/attendance-block";
import { getProjectMembersForMention } from "@/actions/comment";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SprintInfoBlock } from "@/components/tiptap/sprint-info-block";
import { SprintOutcomeBlock } from "@/components/tiptap/sprint-outcome-block";
import { SprintTaskBlock } from "@/components/tiptap/sprint-task-block";
import {
  type SprintPlanningTask,
  type SprintTaskProof,
} from "@/lib/sprint-planning-doc";
import { isClosedSprint, isUnstartedSprint } from "@/lib/sprint-status";
import {
  ADDED_BLURB,
  ADDED_HEADING,
  COMMITTED_BLURB,
  COMMITTED_HEADING,
  COMPLETED_SUBHEADING,
  INCOMPLETE_SUBHEADING,
  OUTCOME_HEADINGS,
  OUTCOME_PROSE_PREFIXES,
  REMOVED_HEADING,
  isAddedTask,
} from "@/lib/sprint-doc";

/**
 * Whether the document has grown its outcome half, which only happens once the
 * sprint has started — and once it has, the task list above is a record rather
 * than a mirror.
 */
function sprintDocHasOutcome(editor: Editor): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "sprintOutcome") found = true;
  });
  return found;
}

/**
 * Take the plan's item list away once the outcome lists the same tasks.
 *
 * The HTML the editor is handed is only a seed for a collaborative document, so
 * folding the saved copy is not enough — the open document has to be folded
 * too, and it is where documents written before the two halves were merged get
 * fixed. What the sprint committed to moves onto the outcome node, because a
 * task dropped from the sprint afterwards is gone from the sprint and those
 * rows were the last record that it had ever been promised.
 */
function foldSprintItemListIntoOutcome(editor: Editor) {
  const blocks: { node: PMNode; from: number; to: number }[] = [];
  let pos = 0;
  editor.state.doc.forEach((node) => {
    blocks.push({ node, from: pos, to: pos + node.nodeSize });
    pos += node.nodeSize;
  });

  const outcomeAt = blocks.findIndex((b) => b.node.type.name === "sprintOutcome");
  if (outcomeAt < 0) return;
  const outcome = blocks[outcomeAt];

  const committed: SprintPlanningTask[] = [];
  const doomed = new Map<number, { from: number; to: number }>();
  blocks.slice(0, outcomeAt).forEach((block, i, plan) => {
    const name = block.node.type.name;
    if (name === "sprintTask") {
      const task = block.node.attrs.task as SprintPlanningTask | null;
      if (task?.id && !committed.some((t) => t.id === task.id)) {
        committed.push({
          ...task,
          decision: String(block.node.attrs.decision ?? ""),
          risk: String(block.node.attrs.risk ?? ""),
        });
      }
      doomed.set(block.from, block);
      return;
    }
    if (name === "heading" && block.node.textContent.trim() === "List of Sprint Items") {
      doomed.set(block.from, block);
      // The blurb under the heading, which has nothing left to introduce.
      const next = plan[i + 1];
      if (next?.node.type.name === "paragraph") doomed.set(next.from, next);
      return;
    }
    if (name === "paragraph" && block.node.textContent.includes("No tasks in this sprint yet.")) {
      doomed.set(block.from, block);
    }
  });

  const needsCommitted = !outcome.node.attrs.committed && committed.length > 0;
  if (doomed.size === 0 && !needsCommitted) return;

  let tr = editor.state.tr;
  if (needsCommitted) {
    tr = tr.setNodeMarkup(outcome.from, undefined, { ...outcome.node.attrs, committed });
  }
  // Back to front, so each deletion leaves the earlier positions untouched.
  for (const range of [...doomed.values()].sort((a, b) => b.from - a.from)) {
    tr = tr.delete(range.from, range.to);
  }
  if (tr.docChanged) editor.view.dispatch(tr);
}

/**
 * Make the open document show exactly the sprint's current tasks.
 *
 * Reconciles in both directions. Adding only, as this used to do, left a row
 * behind for every task dragged out of the sprint, and those rows carry no
 * assignee, estimate, Decision or Risk — which is what disabled Start sprint
 * with a complaint about work the sprint no longer contained.
 */
function syncSprintTasksIntoEditor(editor: Editor, tasks: SprintPlanningTask[]) {
  if (sprintDocHasOutcome(editor)) return;
  const type = editor.schema.nodes.sprintTask;
  if (!type) return;

  const liveIds = new Set(tasks.map((task) => task.id));
  const existing = new Set<string>();
  const departed: { from: number; to: number }[] = [];
  const scan = {
    lastTaskEnd: null as number | null,
    placeholderFrom: null as number | null,
    placeholderTo: null as number | null,
  };
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "sprintTask") {
      const id =
        (node.attrs.id as string | null) ??
        (node.attrs.task as SprintPlanningTask | null)?.id ??
        null;
      if (id && !liveIds.has(id)) {
        departed.push({ from: pos, to: pos + node.nodeSize });
        return;
      }
      if (id) existing.add(id);
      scan.lastTaskEnd = pos + node.nodeSize;
    }
    if (
      node.type.name === "paragraph" &&
      node.textContent.includes("No tasks in this sprint yet.")
    ) {
      scan.placeholderFrom = pos;
      scan.placeholderTo = pos + node.nodeSize;
    }
  });

  const missing = tasks.filter((task) => !existing.has(task.id));
  if (missing.length === 0 && departed.length === 0) return;

  let tr = editor.state.tr;

  // Back to front, so each deletion leaves the earlier positions untouched.
  for (const range of [...departed].reverse()) {
    tr = tr.delete(range.from, range.to);
    const removed = range.to - range.from;
    if (scan.lastTaskEnd != null && scan.lastTaskEnd > range.from) scan.lastTaskEnd -= removed;
    if (scan.placeholderFrom != null && scan.placeholderFrom > range.from) {
      scan.placeholderFrom -= removed;
      if (scan.placeholderTo != null) scan.placeholderTo -= removed;
    }
  }

  if (missing.length > 0 && scan.placeholderFrom != null && scan.placeholderTo != null) {
    const from = scan.placeholderFrom;
    const to = scan.placeholderTo;
    tr = tr.delete(from, to);
    if (scan.lastTaskEnd != null && scan.lastTaskEnd > from) {
      scan.lastTaskEnd -= to - from;
    }
  }

  let insertPos = Math.min(scan.lastTaskEnd ?? tr.doc.content.size, tr.doc.content.size);
  for (const task of missing) {
    const node = type.create({
      id: task.id,
      task,
      showQuestions: true,
      decision: task.decision ?? "",
      risk: task.risk ?? "",
      variant: "planning",
    });
    tr = tr.insert(insertPos, node);
    insertPos += node.nodeSize;
  }
  if (tr.docChanged) editor.view.dispatch(tr);
}

type OutcomeItem =
  | { kind: "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "card"; task: SprintPlanningTask; done: boolean };

/** The card ids and heading texts, in order — enough to tell two shapes apart. */
function outcomeShape(items: OutcomeItem[]): string {
  return items
    .map((item) => (item.kind === "card" ? `card:${item.task.id}` : `${item.kind}:${item.text}`))
    .join("|");
}

/**
 * The outcome the sprint says it should have: work grouped by whether it was
 * promised, then by whether it landed, with empty groups left out entirely.
 */
function desiredOutcome(
  tasks: SprintPlanningTask[],
  committed: SprintPlanningTask[] | null,
): OutcomeItem[] {
  const committedIds = new Set((committed ?? []).map((task) => task.id));
  const items: OutcomeItem[] = [];

  const group = (heading: string, blurb: string, added: boolean) => {
    const mine = tasks.filter((task) => isAddedTask(task, committedIds) === added);
    const done = mine.filter((task) => task.stage === "DONE");
    const open = mine.filter((task) => task.stage !== "DONE");
    if (done.length === 0 && open.length === 0) return;
    items.push({ kind: "h2", text: heading }, { kind: "p", text: blurb });
    if (done.length > 0) {
      items.push({ kind: "h3", text: COMPLETED_SUBHEADING });
      for (const task of done) items.push({ kind: "card", task, done: true });
    }
    if (open.length > 0) {
      items.push({ kind: "h3", text: INCOMPLETE_SUBHEADING });
      for (const task of open) items.push({ kind: "card", task, done: false });
    }
  };

  group(COMMITTED_HEADING, COMMITTED_BLURB, false);
  group(ADDED_HEADING, ADDED_BLURB, true);
  return items;
}

function isOwnedOutcomeBlock(node: PMNode): boolean {
  if (node.type.name === "sprintTask") return true;
  const text = node.textContent.trim();
  if (node.type.name === "heading") return OUTCOME_HEADINGS.includes(text);
  if (node.type.name !== "paragraph") return false;
  if (text === "") return true;
  return OUTCOME_PROSE_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/**
 * Keep the outcome in step with the sprint after it has started.
 *
 * The plan half freezes at start because it is the promise, but the outcome is
 * the report, and it has to answer for the sprint as it actually ran. Work
 * pulled in late belongs in it: left out, an unfinished arrival ends the sprint
 * without anybody being asked why, because the End gate reads the cards in this
 * document and a task with no card is a task with no question. Work dragged out
 * has to go, for the same reason in reverse — ending the sprint discards a
 * reason typed against a task it no longer holds, so keeping the card only
 * blocks the button.
 *
 * Rebuilt rather than patched, and only when the shape has actually drifted.
 * The groups appear and disappear with their contents, so a card changing hands
 * can mean a heading arriving or leaving, and expressing that as a series of
 * splices was where the bugs lived. Everything typed into a card is carried
 * across, and anything written into the outcome that this function did not
 * generate is pushed below the rebuilt sections rather than dropped.
 */
function syncSprintOutcomeTasks(editor: Editor, tasks: SprintPlanningTask[]) {
  const type = editor.schema.nodes.sprintTask;
  // Nothing to reconcile against. Bailing also keeps a document from being
  // emptied by a task list that has not arrived yet.
  if (!type || tasks.length === 0) return;

  const blocks: { node: PMNode; from: number; to: number }[] = [];
  let pos = 0;
  editor.state.doc.forEach((node) => {
    blocks.push({ node, from: pos, to: pos + node.nodeSize });
    pos += node.nodeSize;
  });

  const outcomeAt = blocks.findIndex((b) => b.node.type.name === "sprintOutcome");
  if (outcomeAt < 0) return;
  const outcome = blocks[outcomeAt];
  const committed = (outcome.node.attrs.committed as SprintPlanningTask[] | null) ?? null;
  const below = blocks.slice(outcomeAt + 1);

  // The record of what left is written when the sprint closes, and this stops
  // running then — but a document reopened in between must not lose it.
  if (
    below.some(
      (block) =>
        block.node.type.name === "heading" &&
        block.node.textContent.trim() === REMOVED_HEADING,
    )
  ) {
    return;
  }

  const attrsByTask = new Map<string, Record<string, unknown>>();
  const actual: OutcomeItem[] = [];
  for (const block of below) {
    if (!isOwnedOutcomeBlock(block.node)) continue;
    if (block.node.type.name === "sprintTask") {
      const task = block.node.attrs.task as SprintPlanningTask | null;
      const id = (block.node.attrs.id as string | null) ?? task?.id ?? null;
      if (!id) continue;
      attrsByTask.set(id, block.node.attrs);
      actual.push({
        kind: "card",
        task: task ?? ({ id } as SprintPlanningTask),
        done: block.node.attrs.variant === "completed",
      });
      continue;
    }
    const text = block.node.textContent.trim();
    if (text === "") continue;
    actual.push({
      kind: block.node.type.name === "heading" ? (block.node.attrs.level === 3 ? "h3" : "h2") : "p",
      text,
    });
  }

  const desired = desiredOutcome(tasks, committed);
  if (outcomeShape(actual) === outcomeShape(desired)) return;

  const heading = editor.schema.nodes.heading;
  const paragraph = editor.schema.nodes.paragraph;
  if (!heading || !paragraph) return;

  const built: PMNode[] = desired.map((item) => {
    if (item.kind === "card") {
      const carried = attrsByTask.get(item.task.id);
      return type.create({
        ...carried,
        id: item.task.id,
        task: item.task,
        showQuestions: true,
        decision: String(carried?.decision ?? item.task.decision ?? ""),
        risk: String(carried?.risk ?? item.task.risk ?? ""),
        variant: item.done ? "completed" : "incomplete",
      });
    }
    if (item.kind === "p") return paragraph.create(null, editor.schema.text(item.text));
    return heading.create({ level: item.kind === "h3" ? 3 : 2 }, editor.schema.text(item.text));
  });

  let tr = editor.state.tr;
  // Back to front, so each deletion leaves the earlier positions untouched.
  for (const block of [...below].reverse()) {
    if (isOwnedOutcomeBlock(block.node)) tr = tr.delete(block.from, block.to);
  }
  if (built.length > 0) tr = tr.insert(tr.mapping.map(outcome.to), built);
  if (tr.docChanged) editor.view.dispatch(tr);
}

const CURSOR_COLORS = [
  "#f87171", "#fb923c", "#facc15", "#4ade80", "#22d3ee",
  "#818cf8", "#c084fc", "#f472b6", "#a78bfa", "#34d399",
];

function cursorColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

export interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  borderless?: boolean;
  /**
   * Show the formatting buttons. Defaults to on only for the bordered variant,
   * because the note editors are borderless and teach `/` through their
   * placeholder instead. Turn it on alongside `borderless` for a document that
   * wants both the full-size writing surface and discoverable controls.
   */
  toolbar?: boolean;
  editable?: boolean;
  projectId?: string;
  /** Set on sprint documents so task blocks can persist Decision and Risk. */
  sprintId?: string;
  /** Task-list mirroring stops once this leaves PLANNED / NEXT. */
  sprintStatus?: string;
  isAdmin?: boolean;
  canStartSprint?: boolean;
  canEndSprint?: boolean;
  sprintTasks?: SprintPlanningTask[];
  sprintProof?: Record<string, SprintTaskProof>;
  hideAssignees?: boolean;
  onSprintTaskPatch?: (taskId: string, patch: Partial<SprintPlanningTask>) => void;
  onSprintStatusChange?: (status: string) => void;
  ydoc?: Y.Doc | null;
  collabProvider?: HocuspocusProvider | null;
  collabSynced?: boolean;
  currentUser?: { id: string; name: string | null; imageUrl: string | null } | null;
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Type '/' for commands...",
  borderless = false,
  toolbar = !borderless,
  editable = true,
  projectId,
  sprintId,
  sprintStatus,
  isAdmin = false,
  canStartSprint = false,
  canEndSprint = false,
  sprintTasks = [],
  sprintProof = {},
  hideAssignees = false,
  onSprintTaskPatch,
  onSprintStatusChange,
  ydoc,
  collabProvider,
  collabSynced = false,
  currentUser,
}: RichTextEditorProps) {
  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; query: string } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [attendancePicker, setAttendancePicker] = useState<{ x: number; y: number } | null>(null);
  const [members, setMembers] = useState<AttendancePerson[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [memberQuery, setMemberQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onSprintTaskPatchRef = useRef(onSprintTaskPatch);
  onSprintTaskPatchRef.current = onSprintTaskPatch;
  const onSprintStatusChangeRef = useRef(onSprintStatusChange);
  onSprintStatusChangeRef.current = onSprintStatusChange;
  const isAdminRef = useRef(isAdmin);
  isAdminRef.current = isAdmin;
  const canStartSprintRef = useRef(canStartSprint);
  canStartSprintRef.current = canStartSprint;
  const canEndSprintRef = useRef(canEndSprint);
  canEndSprintRef.current = canEndSprint;

  const isCollaborative = Boolean(ydoc && collabProvider);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        ...(isCollaborative ? { history: false } : {}),
      }),
      Placeholder.configure({ placeholder }),
      NoteImage.configure({ inline: false }),
      TextDirection,
      // Alignment, which is a different thing from TextDirection above: this
      // centres a line, that swaps the whole reading order for Arabic.
      BlockTextAlign.configure({ types: [...ALIGNABLE_TYPES] }),
      HeadingBreak,
      NoteAnnotation,
      AttendanceBlock,
      SprintInfoBlock.configure({
        projectId,
        isAdmin,
        getIsAdmin: () => isAdminRef.current,
        canStartSprint,
        getCanStartSprint: () => canStartSprintRef.current,
        canEndSprint,
        getCanEndSprint: () => canEndSprintRef.current,
        onSprintStatusChange: (status) => onSprintStatusChangeRef.current?.(status),
      }),
      SprintOutcomeBlock,
      SprintTaskBlock.configure({
        projectId,
        sprintId,
        sprintTasks,
        sprintProof,
        hideAssignee: hideAssignees,
        onTasksPatched: (taskId, patch) => onSprintTaskPatchRef.current?.(taskId, patch),
      }),
      ...(isCollaborative && ydoc
        ? [
            Collaboration.configure({ document: ydoc }),
            ...(collabProvider && currentUser
              ? [
                  CollaborationCursor.configure({
                    provider: collabProvider,
                    user: {
                      name: currentUser.name ?? "Anonymous",
                      color: cursorColor(currentUser.id),
                    },
                  }),
                ]
              : []),
          ]
        : []),
    ],
    editable,
    ...(isCollaborative ? {} : { content }),
    onUpdate: ({ editor }) => {
      if (!isCollaborative) {
        onChange(editor.getHTML());
      }
      checkSlashCommand(editor);
    },
    editorProps: {
      attributes: {
        class: cn(
          "focus:outline-none prose prose-invert max-w-none",
          borderless
            ? "min-h-[60vh] text-lg leading-relaxed prose-headings:font-bold prose-h1:text-4xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-m prose-img:rounded-lg prose-img:max-w-full"
            : "min-h-[120px] px-3 py-2 text-s prose-sm"
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

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  async function insertImageFile(file: File) {
    if (!editor?.isEditable) return;
    try {
      const { url } = await uploadFileToR2(file);
      editor.chain().focus().insertContent({
        type: "image",
        attrs: { src: url, align: "center", display: "normal" },
      }).run();
    } catch (err) {
      console.error("Image upload failed:", err);
    }
  }

  function checkSlashCommand(ed: Editor) {
    if (!ed.isEditable) {
      setSlashMenu(null);
      return;
    }
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
    { id: "h1", label: "Heading 1", description: "Large heading", icon: Heading1, aliases: [] as string[] },
    { id: "h2", label: "Heading 2", description: "Medium heading", icon: Heading2, aliases: [] },
    { id: "h3", label: "Heading 3", description: "Small heading", icon: Heading3, aliases: [] },
    { id: "text", label: "Text", description: "Plain text", icon: Type, aliases: [] },
    { id: "bullet", label: "Bullet List", description: "Unordered list", icon: List, aliases: [] },
    { id: "numbered", label: "Numbered List", description: "Ordered list", icon: ListOrdered, aliases: [] },
    { id: "quote", label: "Quote", description: "Block quote", icon: Quote, aliases: [] },
    { id: "divider", label: "Divider", description: "Horizontal rule", icon: Minus, aliases: [] },
    { id: "code", label: "Code Block", description: "Code snippet", icon: Code, aliases: [] },
    { id: "image", label: "Image", description: "Upload from device", icon: ImageIcon, aliases: [] },
    { id: "rtl", label: "Right to left", description: "Arabic and RTL text", icon: AlignRight, aliases: ["arabic", "ar"] },
    { id: "ltr", label: "Left to right", description: "English and LTR text", icon: AlignLeft, aliases: [] },
    ...(projectId
      ? [{
          id: "people",
          label: "People",
          description: "Pick people on this project",
          icon: Users,
          aliases: ["user", "member", "attendance", "attendee", "present"],
        }]
      : []),
    ...sprintTasks.map((task) => ({
      id: `sprint-task:${task.id}`,
      label: task.code,
      description: task.title,
      icon: ListTodo,
      aliases: [task.title.toLowerCase(), task.code.toLowerCase()],
    })),
  ];

  function getFilteredCommands(query: string) {
    const taskCmds = COMMANDS.filter((c) => c.id.startsWith("sprint-task:"));
    const blockCmds = COMMANDS.filter((c) => !c.id.startsWith("sprint-task:"));
    if (!query) return [...taskCmds, ...blockCmds];
    const q = query.toLowerCase();
    const match = (c: (typeof COMMANDS)[number]) =>
      c.label.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.aliases.some((a) => a.includes(q));
    return [...taskCmds.filter(match), ...blockCmds.filter(match)];
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

    if (id.startsWith("sprint-task:")) {
      const taskId = id.slice("sprint-task:".length);
      const task = sprintTasks.find((t) => t.id === taskId);
      if (range) editor.chain().focus().deleteRange(range).run();
      if (task) {
        editor.chain().focus().insertContent({
          type: "sprintTask",
          attrs: { id: task.id, task, showQuestions: false },
        }).run();
      }
      setSlashMenu(null);
      return;
    }

    if (id === "people") {
      const pos = slashMenu;
      if (range) editor.chain().focus().deleteRange(range).run();
      setSlashMenu(null);
      if (pos) {
        setAttendancePicker({ x: pos.x, y: pos.y });
        setMemberQuery("");
        void openAttendancePicker();
      }
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
      case "rtl":
        chain.setTextDirection("rtl").run();
        break;
      case "ltr":
        chain.setTextDirection("ltr").run();
        break;
    }
    setSlashMenu(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, slashMenu, projectId, sprintTasks]);

  async function openAttendancePicker() {
    if (!projectId) return;
    setMembersLoading(true);
    try {
      const res = await getProjectMembersForMention(projectId);
      setMembers(res.members);
      setSelectedIds(new Set(res.currentUserId ? [res.currentUserId] : []));
    } catch (err) {
      console.error(err);
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function insertAttendance() {
    if (!editor) return;
    const people = members.filter((m) => selectedIds.has(m.id));
    if (people.length === 0) return;
    editor.chain().focus().insertContent({ type: "attendance", attrs: { people } }).run();
    setAttendancePicker(null);
    setSelectedIds(new Set());
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      insertImageFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  useEffect(() => {
    if (!editor) return;
    const ext = editor.extensionManager.extensions.find((item) => item.name === "sprintTask");
    if (!ext) return;
    ext.options.sprintTasks = sprintTasks;
    ext.options.sprintProof = sprintProof;
    ext.options.hideAssignee = hideAssignees;
    ext.options.onTasksPatched = (taskId: string, patch: Partial<SprintPlanningTask>) =>
      onSprintTaskPatchRef.current?.(taskId, patch);
    editor.view.dispatch(editor.state.tr.setMeta("sprintTasks", sprintTasks.length));
  }, [editor, sprintTasks, sprintProof, hideAssignees]);

  // Mirroring stops the moment the sprint starts. From then on the document is
  // the record of what was committed to, so it must not follow later changes —
  // not even for an admin, who can still edit it by hand.
  const mirrorsSprint = sprintStatus === undefined || isUnstartedSprint(sprintStatus);

  useEffect(() => {
    if (!editor || !mirrorsSprint) return;
    syncSprintTasksIntoEditor(editor, sprintTasks);
  }, [editor, sprintTasks, collabSynced, mirrorsSprint]);

  // Left to whoever can write: the fold is a change to a shared document, and a
  // read-only viewer has no business making one. Every started sprint is opened
  // by somebody who can, and after that everyone sees the folded document.
  useEffect(() => {
    if (!editor || !editable || mirrorsSprint) return;
    foldSprintItemListIntoOutcome(editor);
  }, [editor, editable, collabSynced, mirrorsSprint]);

  // A closed sprint's outcome is signed off, reasons and all, so it stops
  // following the sprint the way the plan stopped following it at the start.
  const sprintDocClosed = sprintStatus !== undefined && isClosedSprint(sprintStatus);

  // After the fold, which is what moves the plan's rows into the outcome — this
  // would otherwise read a half-built document and add every task twice.
  useEffect(() => {
    if (!editor || !editable || mirrorsSprint || sprintDocClosed) return;
    syncSprintOutcomeTasks(editor, sprintTasks);
  }, [editor, editable, sprintTasks, collabSynced, mirrorsSprint, sprintDocClosed]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSlashMenu(null);
        setAttendancePicker(null);
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

  const filteredMembers = memberQuery
    ? members.filter((m) =>
        (m.name ?? "").toLowerCase().includes(memberQuery.toLowerCase()),
      )
    : members;

  const picker = attendancePicker ? (
    <AttendancePicker
      ref={menuRef}
      x={attendancePicker.x}
      y={attendancePicker.y}
      loading={membersLoading}
      members={filteredMembers}
      selectedIds={selectedIds}
      query={memberQuery}
      onQueryChange={setMemberQuery}
      onToggle={toggleMember}
      onInsert={insertAttendance}
      onClose={() => setAttendancePicker(null)}
    />
  ) : null;

  /*
    The block types the slash menu offers, as buttons, plus alignment. The
    slash menu still works and is the faster route once you know it, but a
    toolbar is the only version of this that can be found without being told
    about it.

    Hidden when the editor is locked, so a read-only document does not offer
    controls that cannot do anything.
  */
  const toolbarBar =
    toolbar && editable ? (
      <div
        className={cn(
          "flex flex-wrap items-center gap-0.5",
          borderless
            ? "mb-6 border-b border-border/60 pb-2"
            : "border-b border-border px-1.5 py-1",
        )}
      >
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-border" aria-hidden />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-border" aria-hidden />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Quote"
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-border" aria-hidden />

        {/*
          Alignment has no `/` equivalent — it is not a block type, so it does
          not belong in a menu that inserts one.
        */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Align left"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Align centre"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Align right"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-border" aria-hidden />

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          active={false}
          title="Divider"
        >
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
    ) : null;

  /*
    The slash menu is placed from the ProseMirror element's rect but positioned
    inside this wrapper, so the two have to start at the same y — which is why
    the toolbar sits outside it rather than above the content within it.
  */
  const surface = (
    <div className="relative">
      {hiddenInput}
      <EditorContent editor={editor} />
      {editable && slashMenu && filteredCmds.length > 0 && (
        <SlashCommandMenu
          ref={menuRef}
          commands={filteredCmds}
          activeIndex={slashIndex}
          x={slashMenu.x}
          y={slashMenu.y}
          onSelect={executeCommand}
        />
      )}
      {picker}
    </div>
  );

  if (borderless) {
    return toolbarBar ? (
      <div>
        {toolbarBar}
        {surface}
      </div>
    ) : (
      surface
    );
  }

  return (
    <div className="rounded-md border border-input bg-background">
      {toolbarBar}
      {surface}
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
        className="absolute z-50 w-72 rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
        style={{ left: x, top: y }}
      >
        <div className="max-h-[320px] overflow-y-auto pb-1">
          {commands.map((cmd, i) => {
            const Icon = cmd.icon;
            const isTask = cmd.id.startsWith("sprint-task:");
            const prevIsTask = i > 0 && commands[i - 1].id.startsWith("sprint-task:");
            const showHeading =
              i === 0 || (isTask && !prevIsTask) || (!isTask && prevIsTask);
            return (
              <div key={cmd.id}>
                {showHeading && (
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {isTask ? "Sprint tasks" : "Blocks"}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onSelect(cmd.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-2.5 py-2 text-start transition-colors",
                    i === activeIndex ? "bg-accent" : "hover:bg-accent/50"
                  )}
                >
                  <div className="w-8 h-8 rounded-md border border-border bg-background flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-s font-medium text-foreground truncate">{cmd.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{cmd.description}</div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
SlashCommandMenu.displayName = "SlashCommandMenu";

interface AttendancePickerProps {
  x: number;
  y: number;
  loading: boolean;
  members: AttendancePerson[];
  selectedIds: Set<string>;
  query: string;
  onQueryChange: (value: string) => void;
  onToggle: (id: string) => void;
  onInsert: () => void;
  onClose: () => void;
}

const AttendancePicker = forwardRef<HTMLDivElement, AttendancePickerProps>(
  (
    { x, y, loading, members, selectedIds, query, onQueryChange, onToggle, onInsert, onClose },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className="absolute z-50 w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
        style={{ left: x, top: y }}
      >
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            People
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
        <div className="px-2 pb-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search people on this project…"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-s outline-none focus:border-primary/40"
          />
        </div>
        <div className="max-h-56 overflow-y-auto pb-1">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-s text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading people…
            </div>
          ) : members.length === 0 ? (
            <p className="px-3 py-4 text-s text-muted-foreground">
              No matching project members.
            </p>
          ) : (
            members.map((m) => {
              const selected = selectedIds.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onToggle(m.id)}
                  className={cn(
                    "flex w-full items-center gap-s px-2.5 py-2 text-start transition-colors",
                    selected ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <Avatar size="sm">
                    <AvatarImage src={m.imageUrl ?? undefined} alt="" />
                    <AvatarFallback>
                      {(m.name ?? "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-s font-medium">
                    {m.name ?? "Someone"}
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-2.5 py-2">
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} selected
          </span>
          <Button size="sm" onClick={onInsert} disabled={selectedIds.size === 0}>
            Insert
          </Button>
        </div>
      </div>
    );
  },
);
AttendancePicker.displayName = "AttendancePicker";

/* ─── Toolbar Button ─── */

function ToolbarButton({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
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
