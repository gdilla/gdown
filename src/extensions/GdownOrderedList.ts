import OrderedList from "@tiptap/extension-ordered-list";
import { wrappingInputRule } from "@tiptap/core";

/**
 * GdownOrderedList: Custom TipTap Ordered List extension with Typora-like behavior.
 *
 * Features:
 * - Markdown input rules: "1. ", "2. ", etc. at start of line converts to ordered list
 * - Supports starting from any number (e.g., "3. " starts the list at 3)
 * - Proper nesting via Tab/Shift+Tab (handled by GdownListItem)
 * - Keyboard shortcut: Cmd+Shift+O (Typora shortcut for ordered list)
 * - Auto-incrementing numbers in rendered view
 */
export const GdownOrderedList = OrderedList.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: "gdown-ordered-list",
      },
      itemTypeName: "listItem",
      keepMarks: true,
      keepAttributes: false,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      start: {
        default: 1,
        parseHTML: (element) => {
          return element.hasAttribute("start")
            ? parseInt(element.getAttribute("start") ?? "1", 10)
            : 1;
        },
        renderHTML: (attributes) => {
          if (attributes.start === 1) {
            return {};
          }
          return { start: attributes.start };
        },
      },
    };
  },

  addInputRules() {
    return [
      // Match "1. ", "2. ", "10. " etc. at start of line
      wrappingInputRule({
        find: /^\s*(\d+)\.\s$/,
        type: this.type,
        getAttributes: (match) => ({
          start: parseInt(match[1] ?? "1", 10),
        }),
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Typora shortcut: Cmd+Shift+O for ordered list
      "Mod-Shift-o": () => {
        return this.editor.chain().focus().toggleOrderedList().run();
      },
    };
  },
});
