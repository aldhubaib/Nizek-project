"use client";

import {
  MoreVertical,
  Reply,
  Copy,
  Trash2,
  Pencil,
  CheckSquare,
  Star,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { QUICK_EMOJIS } from "./thread-shared";

export type MessageActionHandlers = {
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  /** Absent on the cards the app raises itself — those are a record. */
  onDelete?: () => void;
  onEdit?: () => void;
  onCreateTask?: () => void;
  onToggleImportant?: () => void;
  important?: boolean;
};

export function ActionsMenuContent({
  onReact,
  onReply,
  onCopy,
  onDelete,
  onEdit,
  onCreateTask,
  onToggleImportant,
  important,
}: MessageActionHandlers) {
  return (
    <DropdownMenuContent align="end" className="min-w-56 p-1.5" sideOffset={6}>
      <div className="flex items-center gap-0.5 px-1 py-1.5">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onReact(e)}
            className="grid size-9 place-items-center rounded-full text-lg transition-transform hover:scale-125 hover:bg-surface"
            aria-label={`React ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onReply} className="min-h-10 gap-3 text-s">
        <Reply className="h-4 w-4" />
        <span className="flex-1">Reply</span>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onCopy} className="min-h-10 gap-3 text-s">
        <Copy className="h-4 w-4" />
        <span className="flex-1">Copy</span>
      </DropdownMenuItem>
      {onToggleImportant && (
        <DropdownMenuItem onClick={onToggleImportant} className="min-h-10 gap-3 text-s">
          <Star
            className={cn(
              "h-4 w-4",
              important && "fill-orange text-orange",
            )}
          />
          <span className="flex-1">
            {important ? "Remove from important" : "Mark as important"}
          </span>
        </DropdownMenuItem>
      )}
      {onEdit && (
        <DropdownMenuItem onClick={onEdit} className="min-h-10 gap-3 text-s">
          <Pencil className="h-4 w-4" />
          <span className="flex-1">Edit</span>
        </DropdownMenuItem>
      )}
      {onCreateTask && (
        <DropdownMenuItem onClick={onCreateTask} className="min-h-10 gap-3 text-s">
          <CheckSquare className="h-4 w-4" />
          <span className="flex-1">Create task</span>
        </DropdownMenuItem>
      )}
      {onDelete && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} variant="destructive" className="min-h-10 gap-3 text-s">
            <Trash2 className="h-4 w-4" />
            <span className="flex-1">Delete</span>
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  );
}

export const messageCaretTriggerClass =
  "hidden size-8 place-items-center bg-transparent text-white opacity-0 shadow-none outline-none transition-opacity hover:bg-transparent hover:text-white focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100 lg:grid";

/** Desktop hover ⋮ only — mobile uses the selection header instead. */
export function MessageCaret({
  mine: _mine,
  ...handlers
}: { mine: boolean } & MessageActionHandlers) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Message actions"
        className={cn("absolute top-1 right-1", messageCaretTriggerClass)}
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <ActionsMenuContent {...handlers} />
    </DropdownMenu>
  );
}

export function FileCaretMenu(handlers: MessageActionHandlers) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        aria-label="Message actions"
        className={messageCaretTriggerClass}
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <ActionsMenuContent {...handlers} />
    </DropdownMenu>
  );
}

export function ImageActionsMenu(handlers: MessageActionHandlers) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        aria-label="Message actions"
        className="grid size-9 place-items-center rounded-full bg-overlay text-white backdrop-blur-sm transition-colors hover:bg-black/80"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <ActionsMenuContent {...handlers} />
    </DropdownMenu>
  );
}
