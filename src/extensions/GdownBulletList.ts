import BulletList from "@tiptap/extension-bullet-list";
import ListItem from "@tiptap/extension-list-item";
import { wrappingInputRule } from "@tiptap/core";

/**
 * GdownListItem: Custom list item with Typora-like indentation behavior.
 *
 * Features:
 * - Tab to indent (nest) list items
 * - Shift+Tab to outdent (un-nest) list items
 * - Enter on empty list item exits the list
 * - Backspace at start of list item un-nests or exits list
 */
export const GdownListItem = ListItem.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: "gdown-list-item",
      },
      bulletListTypeName: "bulletList",
      orderedListTypeName: "orderedList",
    };
  },

  addKeyboardShortcuts() {
    return {
      // Tab indents (sinks) the list item
      Tab: () => {
        if (this.editor.isActive("listItem")) {
          return this.editor.chain().focus().sinkListItem("listItem").run();
        }
        return false;
      },

      // Shift+Tab outdents (lifts) the list item
      "Shift-Tab": () => {
        if (this.editor.isActive("listItem")) {
          return this.editor.chain().focus().liftListItem("listItem").run();
        }
        return false;
      },

      // Enter on empty list item: exit the list
      Enter: () => {
        const { state } = this.editor;
        const { selection } = state;
        const { $from } = selection;

        if (!selection.empty) return false;

        // Check if inside a listItem
        if (!this.editor.isActive("listItem")) return false;

        // Only handle empty paragraphs inside list items
        if ($from.parent.content.size !== 0) return false;

        // Check nesting depth - if nested, lift first
        let listDepth = 0;
        for (let d = $from.depth; d > 0; d--) {
          const nodeType = $from.node(d).type.name;
          if (
            nodeType === "bulletList" ||
            nodeType === "orderedList"
          ) {
            listDepth++;
          }
        }

        if (listDepth > 1) {
          // Nested: lift out one level
          return this.editor
            .chain()
            .focus()
            .liftListItem("listItem")
            .run();
        }

        // Top level: exit the list entirely
        return this.editor.chain().focus().liftListItem("listItem").run();
      },

      // Backspace at start of list item
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;
        const { $from } = selection;

        if (!selection.empty || $from.parentOffset !== 0) return false;
        if (!this.editor.isActive("listItem")) return false;

        // Try to lift the list item
        return this.editor.chain().focus().liftListItem("listItem").run();
      },
    };
  },
});

/**
 * GdownBulletList: Custom TipTap Bullet List extension with Typora-like behavior.
 *
 * Features:
 * - Markdown input rules: -, *, + at start of line followed by space
 * - Proper nesting via Tab/Shift+Tab
 * - Keyboard shortcut: Cmd+Shift+U (Typora shortcut for unordered list)
 */
export const GdownBulletList = BulletList.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: "gdown-bullet-list",
      },
      itemTypeName: "listItem",
      keepMarks: true,
      keepAttributes: false,
    };
  },

  addInputRules() {
    return [
      // - at start of line followed by space
      wrappingInputRule({
        find: /^\s*([-])\s$/,
        type: this.type,
      }),
      // * at start of line followed by space
      wrappingInputRule({
        find: /^\s*([*])\s$/,
        type: this.type,
      }),
      // + at start of line followed by space
      wrappingInputRule({
        find: /^\s*([+])\s$/,
        type: this.type,
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Typora shortcut: Cmd+Shift+U for unordered list
      "Mod-Shift-u": () => {
        return this.editor.chain().focus().toggleBulletList().run();
      },
    };
  },
});
