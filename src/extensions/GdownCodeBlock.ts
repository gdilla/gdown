import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { InputRule } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import { common, createLowlight } from "lowlight";
import CodeBlockNodeView from "../components/CodeBlockNodeView.vue";

// Create a lowlight instance with common languages pre-registered
// "common" includes: bash, c, cpp, csharp, css, diff, go, graphql, ini,
// java, javascript, json, kotlin, less, lua, makefile, markdown, objectivec,
// perl, php, php-template, plaintext, python, python-repl, r, ruby, rust,
// scss, shell, sql, swift, typescript, vbnet, wasm, xml, yaml
const lowlight = createLowlight(common);

/**
 * GdownCodeBlock: Custom TipTap CodeBlock extension with syntax highlighting.
 *
 * Features:
 * - Markdown input rule: ``` or ```language converts to code block
 * - Syntax highlighting via lowlight (highlight.js compatible)
 * - Common languages pre-loaded (js, ts, python, rust, go, c, cpp, java, etc.)
 * - Language selector shown in top-right corner of code block (Vue NodeView)
 * - Copy button appears on hover
 * - Typora-like behavior: typing ``` at start of line creates a code block
 * - Keyboard shortcuts:
 *   - Cmd+Shift+K: Toggle code block (Typora shortcut)
 *   - Tab/Shift+Tab: Indent/dedent inside code blocks
 *   - Enter: Preserve indentation inside code blocks
 *   - Cmd+Enter: Exit code block and create paragraph below
 *   - Backspace at start of empty code block: convert to paragraph
 */
export const GdownCodeBlock = CodeBlockLowlight.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      lowlight,
      defaultLanguage: null,
      languageClassPrefix: "language-",
      exitOnTripleEnter: true,
      exitOnArrowDown: true,
      enableTabIndentation: false,
      tabSize: 4,
      HTMLAttributes: {
        class: "gdown-code-block",
        spellcheck: "false",
      },
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      language: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const classAttr = element.firstElementChild?.getAttribute("class");
          if (!classAttr) return null;
          const match = classAttr.match(/language-(\w+)/);
          return match ? match[1] : null;
        },
        rendered: false,
      },
    };
  },

  addNodeView() {
    return VueNodeViewRenderer(CodeBlockNodeView);
  },

  addInputRules() {
    return [
      // ``` or ```language at start of line creates a code block
      new InputRule({
        find: /^```([a-zA-Z0-9_+-]*)[\s\n]$/,
        handler: ({ state, range, match }) => {
          const { tr, schema } = state;
          const $start = state.doc.resolve(range.from);

          // Only match at start of block
          if ($start.parentOffset !== 0) {
            return null;
          }

          const language = match[1] || null;

          // Replace the current block with a code block
          const blockStart = $start.before($start.depth);
          const blockEnd = $start.after($start.depth);

          const codeBlockNode = this.type.create(
            { language },
            schema.text("\n") // Start with a newline so cursor has a place
          );

          tr.replaceWith(blockStart, blockEnd, codeBlockNode);

          // Place cursor inside the code block (at start)
          tr.setSelection(
            TextSelection.create(tr.doc, blockStart + 1)
          );
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Typora shortcut: Cmd+Shift+K for code block
      "Mod-Shift-k": () => {
        if (this.editor.isActive("codeBlock")) {
          // Exit code block, convert to paragraph
          return this.editor.chain().focus().toggleCodeBlock().run();
        }
        return this.editor.chain().focus().toggleCodeBlock().run();
      },

      // Tab inside code block: insert tab/spaces (indent)
      Tab: () => {
        if (!this.editor.isActive("codeBlock")) {
          return false;
        }
        return this.editor
          .chain()
          .focus()
          .command(({ tr }) => {
            // Insert 2 spaces for indentation (Typora-like)
            tr.insertText("  ");
            return true;
          })
          .run();
      },

      // Shift+Tab inside code block: dedent
      "Shift-Tab": () => {
        if (!this.editor.isActive("codeBlock")) {
          return false;
        }
        return this.editor
          .chain()
          .focus()
          .command(({ tr, state }) => {
            const { $from } = state.selection;
            const lineStart = $from.pos - $from.parentOffset;
            const textBefore = state.doc.textBetween(
              lineStart,
              $from.pos,
              "\0",
              "\0"
            );

            // Find start of current line
            const lastNewline = textBefore.lastIndexOf("\n");
            const lineContentStart =
              lastNewline >= 0 ? lineStart + lastNewline + 1 : lineStart;

            // Check if line starts with spaces
            const lineText = state.doc.textBetween(
              lineContentStart,
              Math.min(lineContentStart + 2, $from.after($from.depth) - 1)
            );

            if (lineText.startsWith("  ")) {
              tr.delete(lineContentStart, lineContentStart + 2);
              return true;
            } else if (lineText.startsWith("\t")) {
              tr.delete(lineContentStart, lineContentStart + 1);
              return true;
            }
            return false;
          })
          .run();
      },

      // Cmd+Enter: Exit code block and create paragraph below
      "Mod-Enter": () => {
        if (!this.editor.isActive("codeBlock")) {
          return false;
        }
        return this.editor
          .chain()
          .focus()
          .command(({ tr, state }) => {
            const { $from } = state.selection;
            const after = $from.after($from.depth);
            const paragraphType = state.schema.nodes.paragraph;
            if (!paragraphType) return false;
            const paragraphNode = paragraphType.create();
            tr.insert(after, paragraphNode);
            tr.setSelection(TextSelection.create(tr.doc, after + 1));
            return true;
          })
          .run();
      },

      // Enter inside code block: preserve indentation
      Enter: () => {
        if (!this.editor.isActive("codeBlock")) {
          return false;
        }
        return this.editor
          .chain()
          .focus()
          .command(({ tr, state }) => {
            const { $from } = state.selection;

            // Find the current line's indentation
            const lineStart = $from.pos - $from.parentOffset;
            const textBefore = state.doc.textBetween(
              lineStart,
              $from.pos,
              "\0",
              "\0"
            );

            // Find the beginning of the current line
            const lastNewline = textBefore.lastIndexOf("\n");
            const lineContentStart =
              lastNewline >= 0 ? lineStart + lastNewline + 1 : lineStart;

            // Get current line text
            const currentLineText = state.doc.textBetween(
              lineContentStart,
              $from.pos
            );

            // Extract leading whitespace
            const indentMatch = currentLineText.match(/^(\s+)/);
            const indent = indentMatch ? indentMatch[1] : "";

            // Insert newline + matching indentation
            tr.insertText("\n" + indent);
            return true;
          })
          .run();
      },

      // Backspace at start of empty code block: convert to paragraph
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;
        const { $from } = selection;

        if (!this.editor.isActive("codeBlock")) {
          return false;
        }

        // Only at the very start of the code block
        if (!selection.empty || $from.parentOffset !== 0) {
          return false;
        }

        // Only if the code block is empty or has just a newline
        const content = $from.parent.textContent;
        if (content.length > 1) {
          return false;
        }

        return this.editor.chain().focus().toggleCodeBlock().run();
      },
    };
  },
});

/**
 * Get the list of supported languages for the language picker.
 */
export function getSupportedLanguages(): string[] {
  return lowlight.listLanguages();
}
