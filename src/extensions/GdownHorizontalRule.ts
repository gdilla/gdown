import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { InputRule } from "@tiptap/core";
import { NodeSelection, Selection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";

/**
 * GdownHorizontalRule: Custom TipTap HorizontalRule extension with Typora-like behavior.
 *
 * Features:
 * - Markdown input rules: ---, ***, ___ all convert to horizontal rule
 * - Live conversion: typing any of the above patterns at the start of a line
 *   replaces the entire line with a horizontal rule
 * - Non-editable: the rule is a leaf node that can only be deleted
 * - Visual styling matches Typora's thin horizontal line
 */
export const GdownHorizontalRule = HorizontalRule.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: "gdown-hr",
      },
      nextNodeType: "paragraph",
    };
  },

  addInputRules() {
    const hrType = this.type;

    const createHorizontalRule = (
      state: EditorState,
      start: number,
      _end: number
    ) => {
      const { tr, schema } = state;
      const $start = state.doc.resolve(start);

      // Only match at start of block
      if ($start.parentOffset !== 0) {
        return null;
      }

      const hrNode = hrType.create();
      const paragraphType = schema.nodes.paragraph;
      if (!paragraphType) return null;
      const paragraphNode = paragraphType.create();

      // Replace the block containing the --- pattern with HR + empty paragraph
      const blockStart = $start.before($start.depth);

      tr.replaceWith(blockStart, $start.after($start.depth), [hrNode, paragraphNode]);

      // Place cursor in the new paragraph
      tr.setSelection(
        Selection.near(tr.doc.resolve(blockStart + 2))
      );

      return tr;
    };

    return [
      // --- (three or more dashes)
      new InputRule({
        find: /^-{3,}\s?$/,
        handler: ({ state, range }) => {
          createHorizontalRule(state, range.from, range.to);
        },
      }),
      // *** (three or more asterisks)
      new InputRule({
        find: /^\*{3,}\s?$/,
        handler: ({ state, range }) => {
          createHorizontalRule(state, range.from, range.to);
        },
      }),
      // ___ (three or more underscores)
      new InputRule({
        find: /^_{3,}\s?$/,
        handler: ({ state, range }) => {
          createHorizontalRule(state, range.from, range.to);
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Allow deleting horizontal rules with backspace when selected
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;

        // Handle NodeSelection on HR
        if (
          selection instanceof NodeSelection &&
          selection.node.type.name === "horizontalRule"
        ) {
          this.editor
            .chain()
            .focus()
            .deleteSelection()
            .run();
          return true;
        }

        return false;
      },
    };
  },
});
