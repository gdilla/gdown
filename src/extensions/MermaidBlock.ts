import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import { TextSelection } from "@tiptap/pm/state";
import MermaidNodeView from "../components/MermaidNodeView.vue";

/**
 * MermaidBlock: Custom TipTap node for rendering Mermaid diagrams.
 *
 * Features:
 * - Typing ```mermaid at start of line creates a mermaid diagram block
 * - Renders the mermaid code as an SVG diagram in preview mode
 * - Double-click or Edit button to switch to source editing
 * - Cmd+Enter or Escape to switch back to preview
 * - Supports undo/redo of diagram content
 * - Error messages shown inline when mermaid syntax is invalid
 */
export const MermaidBlock = Node.create({
  name: "mermaidBlock",

  group: "block",

  content: "text*",

  marks: "",

  defining: true,

  isolating: true,

  code: true,

  addAttributes() {
    return {
      language: {
        default: "mermaid",
        parseHTML: () => "mermaid",
        renderHTML: () => ({ "data-language": "mermaid" }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "pre",
        preserveWhitespace: "full" as const,
        getAttrs: (node: HTMLElement) => {
          const codeEl = node.querySelector("code");
          if (!codeEl) return false;
          const classAttr = codeEl.getAttribute("class") || "";
          if (
            classAttr.includes("language-mermaid") ||
            classAttr.includes("mermaid")
          ) {
            return {};
          }
          return false;
        },
      },
      {
        tag: "div.mermaid",
        preserveWhitespace: "full" as const,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { class: "mermaid-block" }),
      ["code", { class: "language-mermaid" }, 0],
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(MermaidNodeView);
  },

  addInputRules() {
    return [
      // ```mermaid at start of line creates a mermaid block
      new InputRule({
        find: /^```mermaid[\s\n]$/,
        handler: ({ state, range }) => {
          const { tr } = state;
          const $start = state.doc.resolve(range.from);

          // Only match at start of block
          if ($start.parentOffset !== 0) {
            return null;
          }

          const blockStart = $start.before($start.depth);
          const blockEnd = $start.after($start.depth);

          const mermaidNode = this.type.create(
            { language: "mermaid" },
            // Start empty so user can type diagram code
          );

          tr.replaceWith(blockStart, blockEnd, mermaidNode);

          // Place cursor inside the mermaid block
          tr.setSelection(
            TextSelection.create(tr.doc, blockStart + 1)
          );
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at start of empty mermaid block: convert to paragraph
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;
        const { $from } = selection;

        if (!this.editor.isActive("mermaidBlock")) {
          return false;
        }

        // Only at the very start of the block
        if (!selection.empty || $from.parentOffset !== 0) {
          return false;
        }

        // Only if block is empty
        const content = $from.parent.textContent;
        if (content.length > 0) {
          return false;
        }

        // Replace with empty paragraph
        const pos = $from.before($from.depth);
        const endPos = $from.after($from.depth);
        const paragraphType = state.schema.nodes.paragraph;
        if (!paragraphType) return false;
        const paragraph = paragraphType.create();
        const tr = state.tr.replaceWith(pos, endPos, paragraph);
        tr.setSelection(TextSelection.create(tr.doc, pos + 1));
        this.editor.view.dispatch(tr);
        return true;
      },
    };
  },
});
