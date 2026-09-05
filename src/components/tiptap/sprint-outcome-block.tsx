"use client";

import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { SprintOutcomeBlockSchema } from "@/lib/tiptap-schema";

/**
 * Where the plan stops being a promise and starts being a result.
 *
 * The node exists to mark the split so the outcome half can be rebuilt without
 * touching the frozen plan above it. Since it has to be in the document anyway,
 * it may as well say so on screen.
 */
function SprintOutcomeNodeView() {
  return (
    <NodeViewWrapper
      as="div"
      data-type="sprint-outcome"
      contentEditable={false}
      className="not-prose my-12 flex items-center gap-4 select-none"
    >
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Sprint outcome
      </span>
      <span className="h-px flex-1 bg-border" />
    </NodeViewWrapper>
  );
}

export const SprintOutcomeBlock = SprintOutcomeBlockSchema.extend({
  addNodeView() {
    return ReactNodeViewRenderer(SprintOutcomeNodeView);
  },
});
