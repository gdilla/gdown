/**
 * MathBlock – TipTap node extension for display/block math ($$...$$)
 *
 * Renders LaTeX as a centered block equation using KaTeX. When selected the
 * raw LaTeX source is shown in an editable textarea; otherwise the rendered
 * equation is displayed.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { InputRule } from "@tiptap/core";
import katex from "katex";

/**
 * Input rule: typing `$$` on an empty line creates a math block node.
 * The user then enters the LaTeX in the editing textarea.
 */
function makeMathBlockInputRule() {
  return new InputRule({
    find: /^\$\$\s$/,
    handler: ({ state, range }) => {
      const node = state.schema.nodes.mathBlock!.create({ latex: "" });
      const tr = state.tr.replaceWith(range.from, range.to, node);
      return tr as any;
    },
  });
}

export const MathBlock = Node.create({
  name: "mathBlock",

  group: "block",

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-latex") || element.textContent || "",
        renderHTML: (attributes: Record<string, any>) => ({
          "data-latex": attributes.latex,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="math-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "math-block", class: "math-block" }),
      0,
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      // Outer wrapper
      const dom = document.createElement("div");
      dom.classList.add("math-block");
      dom.setAttribute("data-type", "math-block");
      dom.setAttribute("data-latex", node.attrs.latex);
      dom.contentEditable = "false";

      // Rendered math display
      const rendered = document.createElement("div");
      rendered.classList.add("math-block-render");
      dom.appendChild(rendered);

      // Editable textarea (shown on select/double-click)
      const textarea = document.createElement("textarea");
      textarea.classList.add("math-block-input");
      textarea.value = node.attrs.latex;
      textarea.placeholder = "Enter LaTeX math (e.g. \\int_0^1 x^2 dx)";
      textarea.spellcheck = false;
      textarea.style.display = "none";
      dom.appendChild(textarea);

      function renderMath(latex: string) {
        if (!latex.trim()) {
          rendered.innerHTML =
            '<span class="math-block-placeholder">Click to add math equation</span>';
          rendered.classList.add("math-empty");
          rendered.classList.remove("math-error");
          return;
        }
        try {
          rendered.innerHTML = katex.renderToString(latex, {
            throwOnError: false,
            displayMode: true,
            output: "html",
          });
          rendered.classList.remove("math-error", "math-empty");
        } catch {
          rendered.textContent = latex;
          rendered.classList.add("math-error");
          rendered.classList.remove("math-empty");
        }
      }

      renderMath(node.attrs.latex);

      // Auto-show editing if the math is empty (just created)
      if (!node.attrs.latex.trim()) {
        setTimeout(() => {
          rendered.style.display = "none";
          textarea.style.display = "block";
          textarea.focus();
        }, 0);
      }

      // Double-click to edit
      dom.addEventListener("dblclick", (e) => {
        e.preventDefault();
        e.stopPropagation();
        rendered.style.display = "none";
        textarea.style.display = "block";
        textarea.value = node.attrs.latex;
        textarea.focus();
        // Auto-resize
        autoResize(textarea);
      });

      function autoResize(el: HTMLTextAreaElement) {
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
      }

      textarea.addEventListener("input", () => {
        autoResize(textarea);
        // Live preview: update the rendered math as user types
        const latex = textarea.value.trim();
        // We don't commit to ProseMirror doc on every keystroke,
        // but we do update the visual preview
        if (latex) {
          rendered.style.display = "block";
          renderMath(latex);
        }
      });

      function commitEdit() {
        const newLatex = textarea.value.trim();
        rendered.style.display = "";
        textarea.style.display = "none";

        const pos = typeof getPos === "function" ? getPos() : null;
        if (pos !== null && pos !== undefined) {
          if (!newLatex) {
            // If empty, delete the node
            editor.view.dispatch(
              editor.view.state.tr.delete(pos, pos + node.nodeSize)
            );
            editor.commands.focus();
            return;
          }

          if (newLatex !== node.attrs.latex) {
            editor.view.dispatch(
              editor.view.state.tr.setNodeMarkup(pos, undefined, {
                latex: newLatex,
              })
            );
          }
        }

        renderMath(newLatex || node.attrs.latex);
      }

      textarea.addEventListener("blur", commitEdit);
      textarea.addEventListener("keydown", (e) => {
        // Shift+Enter to insert newline in textarea, Enter to commit
        if (e.key === "Enter" && !e.shiftKey) {
          // Allow multi-line: only commit on Cmd/Ctrl+Enter
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          commitEdit();
          editor.commands.focus();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          rendered.style.display = "";
          textarea.style.display = "none";
          renderMath(node.attrs.latex);
          editor.commands.focus();
        }
        // Stop propagation so editor doesn't handle these keys
        e.stopPropagation();
      });

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== "mathBlock") return false;
          dom.setAttribute("data-latex", updatedNode.attrs.latex);
          if (textarea.style.display === "none") {
            textarea.value = updatedNode.attrs.latex;
          }
          renderMath(updatedNode.attrs.latex);
          return true;
        },
        selectNode() {
          dom.classList.add("ProseMirror-selectednode");
        },
        deselectNode() {
          dom.classList.remove("ProseMirror-selectednode");
          // If editing, commit
          if (textarea.style.display !== "none") {
            commitEdit();
          }
        },
        destroy() {
          // cleanup
        },
        stopEvent(_event: Event) {
          // Let textarea handle its own events
          if (textarea.style.display !== "none") {
            return true;
          }
          return false;
        },
        ignoreMutation() {
          return true;
        },
      };
    };
  },

  addInputRules() {
    return [makeMathBlockInputRule()];
  },

  addKeyboardShortcuts() {
    return {
      // Cmd+Shift+M: Insert math block (Typora shortcut ⌘⇧M)
      "Mod-Shift-m": () => {
        this.editor
          .chain()
          .focus()
          .insertContent({
            type: "mathBlock",
            attrs: { latex: "" },
          })
          .run();
        return true;
      },
    };
  },
});
