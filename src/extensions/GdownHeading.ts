import Heading from "@tiptap/extension-heading";
import type { Level } from "@tiptap/extension-heading";
import { InputRule } from "@tiptap/core";

/**
 * GdownHeading: Custom TipTap Heading extension with Typora-like behavior.
 *
 * Features:
 * - Markdown input rules: # through ###### at start of line converts to H1-H6
 * - Live conversion: typing "# " at line start converts the paragraph to a heading
 * - Typing backspace at the start of a heading converts it back to paragraph
 * - Keyboard shortcuts: Cmd+1 through Cmd+6 for heading levels (Typora-exact)
 * - Cmd+0 to reset to paragraph
 */
export const GdownHeading = Heading.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      levels: [1, 2, 3, 4, 5, 6] as const,
      HTMLAttributes: {},
    };
  },

  addInputRules() {
    return this.options.levels.map((level) => {
      return new InputRule({
        find: new RegExp(`^(#{${level}})\\s$`),
        handler: ({ state, range }) => {
          const { tr } = state;
          const $start = state.doc.resolve(range.from);
          const blockStart = $start.before($start.depth) + 1;

          // Only convert if we're at the start of the block
          if (range.from !== blockStart) {
            return null;
          }

          // Delete the # characters and the space
          tr.delete(range.from, range.to);

          // Set the block type to heading
          tr.setBlockType(
            tr.mapping.map(range.from),
            tr.mapping.map(range.from),
            this.type,
            { level }
          );
        },
      });
    });
  },

  addKeyboardShortcuts() {
    const shortcuts: Record<string, () => boolean> = {};

    // Cmd+1 through Cmd+6 for heading levels (Typora shortcuts)
    this.options.levels.forEach((level) => {
      shortcuts[`Mod-${level}`] = () => {
        // Toggle: if already this heading level, convert to paragraph
        if (this.editor.isActive("heading", { level })) {
          return this.editor.chain().focus().setParagraph().run();
        }
        return this.editor.chain().focus().toggleHeading({ level: level as Level }).run();
      };
    });

    // Cmd+0 to convert to paragraph (Typora shortcut)
    shortcuts["Mod-0"] = () => {
      return this.editor.chain().focus().setParagraph().run();
    };

    // Backspace at the beginning of a heading converts it to paragraph
    shortcuts["Backspace"] = () => {
      const { state } = this.editor;
      const { selection } = state;
      const { $from } = selection;

      // Only handle if cursor is at the very start of the heading
      if (!selection.empty || $from.parentOffset !== 0) {
        return false;
      }

      // Only handle if current block is a heading
      if ($from.parent.type.name !== "heading") {
        return false;
      }

      return this.editor.chain().focus().setParagraph().run();
    };

    return shortcuts;
  },
});
