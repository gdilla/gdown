import Blockquote from "@tiptap/extension-blockquote";
import { InputRule } from "@tiptap/core";

/**
 * GdownBlockquote: Custom TipTap Blockquote extension with Typora-like behavior.
 *
 * Features:
 * - Markdown input rule: > at start of line converts to blockquote
 * - Nested blockquotes supported via >> etc
 * - Keyboard shortcut: Cmd+Shift+. (Typora shortcut for quote)
 * - Backspace at the start of empty blockquote unwraps it
 * - Enter on empty line exits blockquote (handled by default)
 */
export const GdownBlockquote = Blockquote.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: "gdown-blockquote",
      },
    };
  },

  addInputRules() {
    return [
      // Standard > at start of line wraps in blockquote
      new InputRule({
        find: /^>\s$/,
        handler: ({ state, range }) => {
          const { tr } = state;
          const $start = state.doc.resolve(range.from);

          // Only match at start of block
          if ($start.parentOffset !== 0) {
            return null;
          }

          // Delete the > and space
          tr.delete(range.from, range.to);

          // Wrap in blockquote
          const blockStart = $start.before($start.depth);
          const blockEnd = $start.after($start.depth);
          const mappedStart = tr.mapping.mapResult(blockStart).pos;
          const mappedEnd = tr.mapping.mapResult(blockEnd).pos;
          const $mappedFrom = tr.doc.resolve(mappedStart);
          const $mappedTo = tr.doc.resolve(mappedEnd);
          const nodeRange = $mappedFrom.blockRange($mappedTo);
          if (!nodeRange) return null;
          tr.wrap(nodeRange, [{ type: this.type }]);
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Typora shortcut: Cmd+Shift+. for blockquote
      // Note: some Typora versions use Cmd+Shift+Q
      "Mod-Shift-.": () => {
        return this.editor.chain().focus().toggleBlockquote().run();
      },

      // Also support Cmd+Shift+Q (alternative Typora binding)
      "Mod-Shift-q": () => {
        return this.editor.chain().focus().toggleBlockquote().run();
      },

      // Backspace at start of blockquote content lifts it out
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;
        const { $from } = selection;

        // Only handle if cursor is at the very start
        if (!selection.empty || $from.parentOffset !== 0) {
          return false;
        }

        // Only handle if inside a blockquote
        let depth = $from.depth;
        let inBlockquote = false;
        while (depth > 0) {
          if ($from.node(depth).type.name === "blockquote") {
            inBlockquote = true;
            break;
          }
          depth--;
        }

        if (!inBlockquote) {
          return false;
        }

        // If the block content is empty, lift it out of the blockquote
        if ($from.parent.content.size === 0) {
          return this.editor.chain().focus().liftEmptyBlock().run();
        }

        // If content exists but cursor at start, lift out of blockquote
        return this.editor.chain().focus().lift("blockquote").run();
      },

      // Enter on empty blockquote paragraph: exit blockquote
      Enter: () => {
        const { state } = this.editor;
        const { selection } = state;
        const { $from } = selection;

        // Only handle empty paragraphs inside blockquotes
        if (!selection.empty || $from.parent.content.size !== 0) {
          return false;
        }

        let inBlockquote = false;
        let depth = $from.depth;
        while (depth > 0) {
          if ($from.node(depth).type.name === "blockquote") {
            inBlockquote = true;
            break;
          }
          depth--;
        }

        if (!inBlockquote) {
          return false;
        }

        return this.editor.chain().focus().liftEmptyBlock().run();
      },
    };
  },
});
