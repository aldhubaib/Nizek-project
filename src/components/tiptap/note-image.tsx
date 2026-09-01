"use client";

import type { ReactNode } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { NoteImageSchema } from "@/lib/tiptap-schema";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Maximize2,
  PictureInPicture2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ImageAlign = "left" | "center" | "right";
export type ImageDisplay = "normal" | "full";

function NoteImageView({ node, updateAttributes, selected, editor }: ReactNodeViewProps) {
  const align = (node.attrs.align as ImageAlign) || "center";
  const display = (node.attrs.display as ImageDisplay) || "normal";
  const showToolbar = Boolean(editor.isEditable && selected);

  function setAlign(next: ImageAlign) {
    updateAttributes({ align: next, display: "normal" });
  }

  return (
    <NodeViewWrapper
      as="div"
      data-type="note-image"
      data-align={align}
      data-display={display}
      className={cn("note-image", selected && "note-image-selected")}
    >
      {showToolbar ? (
        <div
          className="note-image-toolbar"
          contentEditable={false}
          onMouseDown={(e) => e.preventDefault()}
        >
          <ToolbarBtn
            label="Align left"
            active={display === "normal" && align === "left"}
            onClick={() => setAlign("left")}
          >
            <AlignLeft className="size-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            label="Align center"
            active={display === "normal" && align === "center"}
            onClick={() => setAlign("center")}
          >
            <AlignCenter className="size-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            label="Align right"
            active={display === "normal" && align === "right"}
            onClick={() => setAlign("right")}
          >
            <AlignRight className="size-3.5" />
          </ToolbarBtn>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <ToolbarBtn
            label="Normal size"
            active={display === "normal"}
            onClick={() => updateAttributes({ display: "normal" })}
          >
            <PictureInPicture2 className="size-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            label="Full width"
            active={display === "full"}
            onClick={() => updateAttributes({ display: "full" })}
          >
            <Maximize2 className="size-3.5" />
          </ToolbarBtn>
        </div>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={node.attrs.src}
        alt={node.attrs.alt ?? ""}
        title={node.attrs.title ?? undefined}
        draggable={false}
      />
    </NodeViewWrapper>
  );
}

function ToolbarBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export const NoteImage = NoteImageSchema.extend({
  addNodeView() {
    return ReactNodeViewRenderer(NoteImageView);
  },
});
