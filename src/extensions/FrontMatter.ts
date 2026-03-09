import { Node, mergeAttributes } from "@tiptap/core";
import type { CommandProps, RawCommands } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import FrontMatterNodeView from "../components/FrontMatterNodeView.vue";

/**
 * FrontMatter: Custom TipTap node for rendering YAML front-matter blocks.
 *
 * Features:
 * - Renders as a collapsible panel at the top of the document
 * - Displays parsed YAML fields in a structured key-value format
 * - Supports inline editing of field keys and values
 * - Toggle between structured fields view and raw YAML editing
 * - Preserves raw YAML content for round-trip fidelity
 * - Parses from HTML <div data-type="frontmatter"> elements
 *
 * The node stores the raw YAML as its text content (no delimiters).
 * The Vue component (FrontMatterNodeView) handles parsing and display.
 */
export const FrontMatter = Node.create({
  name: "frontMatter",

  group: "block",

  content: "text*",

  marks: "",

  defining: true,

  isolating: true,

  code: true,

  // Front-matter should appear only once, at the top of the document
  draggable: false,

  addAttributes() {
    return {};
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="frontmatter"]',
        preserveWhitespace: "full" as const,
      },
      {
        tag: "pre.frontmatter",
        preserveWhitespace: "full" as const,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "frontmatter", class: "frontmatter-node" }),
      0,
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(FrontMatterNodeView);
  },

  addCommands() {
    return {
      /**
       * Insert a front-matter block at the very beginning of the document.
       * If one already exists, this is a no-op.
       */
      insertFrontMatter:
        (yaml?: string) =>
        ({ tr, state, dispatch }: CommandProps) => {
          // Check if front-matter already exists (first node)
          const firstNode = state.doc.firstChild;
          if (firstNode?.type.name === "frontMatter") {
            return false; // Already has front-matter
          }

          if (dispatch) {
            const content = yaml
              ? state.schema.text(yaml)
              : null;

            const fmType = state.schema.nodes.frontMatter;
            if (!fmType) return false;

            const fmNode = content
              ? fmType.create(null, content)
              : fmType.create();

            tr.insert(0, fmNode);
          }

          return true;
        },

      /**
       * Remove the front-matter block if it exists.
       */
      removeFrontMatter:
        () =>
        ({ tr, state, dispatch }: CommandProps) => {
          const firstNode = state.doc.firstChild;
          if (firstNode?.type.name !== "frontMatter") {
            return false;
          }

          if (dispatch) {
            tr.delete(0, firstNode.nodeSize);
          }

          return true;
        },
    } as Partial<RawCommands>;
  },
});
