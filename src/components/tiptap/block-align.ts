import type { CommandProps } from "@tiptap/core";
import { TextAlign } from "@tiptap/extension-text-align";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";

/** The blocks that can carry an alignment. */
export const ALIGNABLE_TYPES = ["heading", "paragraph"] as const;

/**
 * Positions of the alignable blocks a selection genuinely covers.
 *
 * The stock extension hands `from..to` to `updateAttributes`, which counts any
 * block the range touches — including one it only reaches the very start of.
 * Dragging past the end of a line extends the selection to the start of the
 * block below without selecting a character of it, so aligning one heading
 * aligned the heading under it too.
 *
 * A block counts here when the selection overlaps its *content*, not merely
 * its edges. An empty selection counts the single block the cursor sits in.
 * Select one character of the next block and it counts again, which is where
 * the intent becomes real.
 */
export function alignTargets(
  doc: PMNode,
  selection: Selection,
  types: readonly string[] = ALIGNABLE_TYPES,
): number[] {
  const { from, to, empty } = selection;
  const wanted = new Set(types);
  const targets: number[] = [];

  // Widened by one each way so a cursor resting against a boundary still finds
  // its own block. The overlap test below discards anything merely touched.
  const scanFrom = Math.max(0, from - 1);
  const scanTo = Math.min(doc.content.size, to + 1);

  doc.nodesBetween(scanFrom, scanTo, (node, pos) => {
    if (!node.isTextblock || !wanted.has(node.type.name)) return true;
    const start = pos + 1;
    const end = pos + node.nodeSize - 1;
    const covered = empty
      ? from >= start && from <= end
      : from < end && to > start;
    if (covered) targets.push(pos);
    return true;
  });

  return targets;
}

function applyAlign(
  textAlign: string | null,
  types: readonly string[],
): (props: CommandProps) => boolean {
  return ({ state, tr, dispatch }) => {
    const targets = alignTargets(state.doc, state.selection, types);
    if (targets.length === 0) return false;

    if (dispatch) {
      // Setting node markup never changes a node's size, so earlier edits
      // cannot shift the positions collected above.
      for (const pos of targets) {
        const node = tr.doc.nodeAt(pos);
        if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, textAlign });
      }
    }
    return true;
  };
}

/**
 * TextAlign with the commands rewritten to respect the selection's real
 * extent. Everything else — the `textAlign` attribute, its HTML round-trip,
 * and the Mod-Shift keyboard shortcuts — is inherited, and the shortcuts pick
 * up these commands too because they dispatch through `commands.setTextAlign`.
 */
export const BlockTextAlign = TextAlign.extend({
  addCommands() {
    const { types, alignments } = this.options;

    return {
      setTextAlign:
        (alignment: string) =>
        (props: CommandProps) =>
          alignments.includes(alignment)
            ? applyAlign(alignment, types)(props)
            : false,

      unsetTextAlign: () => (props: CommandProps) => applyAlign(null, types)(props),

      toggleTextAlign:
        (alignment: string) =>
        ({ editor, commands }: CommandProps) => {
          if (!alignments.includes(alignment)) return false;
          return editor.isActive({ textAlign: alignment })
            ? commands.unsetTextAlign()
            : commands.setTextAlign(alignment);
        },
    };
  },
});
