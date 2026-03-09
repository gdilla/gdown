/**
 * MathInline – TipTap node extension for inline math ($...$)
 *
 * Renders LaTeX as inline math using KaTeX. When the node is selected the raw
 * LaTeX is shown in an editable text input; otherwise the rendered output is
 * displayed.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { InputRule } from '@tiptap/core'
import katex from 'katex'

/**
 * Input rule: typing `$<latex>$` (with a trailing `$`) converts the text
 * into an inline math node.  The regex captures everything between two `$`
 * delimiters typed in sequence.
 */
function makeInlineMathInputRule() {
  // Match: non-escaped $, followed by non-empty content (no newlines), followed by $
  // The lookbehind (?<=\s|^) ensures the opening $ follows whitespace or line start
  const rule = new InputRule({
    find: /(?:^|\s)\$([^$\n]+)\$$/,
    handler: ({ state, range, match }) => {
      const latex = match[1]
      if (!latex || !latex.trim()) return null

      const node = state.schema.nodes.mathInline!.create({ latex: latex.trim() })

      // Adjust start to keep any leading whitespace
      const fullMatch = match[0]
      const leadingSpace = fullMatch.length - fullMatch.trimStart().length
      const start = range.from + leadingSpace

      const tr = state.tr.replaceWith(start, range.to, node)
      return tr as any
    },
  })
  return rule
}

export const MathInline = Node.create({
  name: 'mathInline',

  group: 'inline',

  inline: true,

  atom: true,

  selectable: true,

  draggable: false,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-latex') || element.textContent || '',
        renderHTML: (attributes: Record<string, any>) => ({
          'data-latex': attributes.latex,
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="math-inline"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-type': 'math-inline', class: 'math-inline' }),
      0,
    ]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      // Outer wrapper
      const dom = document.createElement('span')
      dom.classList.add('math-inline')
      dom.setAttribute('data-type', 'math-inline')
      dom.setAttribute('data-latex', node.attrs.latex)
      dom.contentEditable = 'false'

      // Rendered math display
      const rendered = document.createElement('span')
      rendered.classList.add('math-inline-render')
      dom.appendChild(rendered)

      // Hidden input for editing (shown on select)
      const input = document.createElement('input')
      input.type = 'text'
      input.classList.add('math-inline-input')
      input.value = node.attrs.latex
      input.style.display = 'none'
      dom.appendChild(input)

      function renderMath(latex: string) {
        try {
          rendered.innerHTML = katex.renderToString(latex, {
            throwOnError: false,
            displayMode: false,
            output: 'html',
          })
          rendered.classList.remove('math-error')
        } catch {
          rendered.textContent = latex
          rendered.classList.add('math-error')
        }
      }

      renderMath(node.attrs.latex)

      // Double-click to edit
      dom.addEventListener('dblclick', (e) => {
        e.preventDefault()
        e.stopPropagation()
        rendered.style.display = 'none'
        input.style.display = 'inline-block'
        input.value = node.attrs.latex
        input.focus()
        input.select()
      })

      // Commit edit on blur or Enter
      function commitEdit() {
        const newLatex = input.value.trim()
        rendered.style.display = ''
        input.style.display = 'none'

        if (newLatex && newLatex !== node.attrs.latex) {
          const pos = typeof getPos === 'function' ? getPos() : null
          if (pos !== null && pos !== undefined) {
            editor.view.dispatch(
              editor.view.state.tr.setNodeMarkup(pos, undefined, {
                latex: newLatex,
              }),
            )
          }
        }

        renderMath(newLatex || node.attrs.latex)
      }

      input.addEventListener('blur', commitEdit)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commitEdit()
          // Re-focus editor
          editor.commands.focus()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          rendered.style.display = ''
          input.style.display = 'none'
          editor.commands.focus()
        }
        // Stop propagation so editor doesn't handle these keys
        e.stopPropagation()
      })

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== 'mathInline') return false
          dom.setAttribute('data-latex', updatedNode.attrs.latex)
          input.value = updatedNode.attrs.latex
          renderMath(updatedNode.attrs.latex)
          return true
        },
        selectNode() {
          dom.classList.add('ProseMirror-selectednode')
        },
        deselectNode() {
          dom.classList.remove('ProseMirror-selectednode')
          // Hide input if open
          rendered.style.display = ''
          input.style.display = 'none'
        },
        destroy() {
          // cleanup
        },
        stopEvent(_event: Event) {
          // Let input handle its own events
          if (input.style.display !== 'none') {
            return true
          }
          return false
        },
        ignoreMutation() {
          return true
        },
      }
    }
  },

  addInputRules() {
    return [makeInlineMathInputRule()]
  },

  addKeyboardShortcuts() {
    return {
      // Cmd+Shift+E: Insert inline math at cursor
      // (⌘⇧M is reserved for math block per Typora convention)
      'Mod-Shift-e': () => {
        this.editor
          .chain()
          .focus()
          .insertContent({
            type: 'mathInline',
            attrs: { latex: 'E = mc^2' },
          })
          .run()
        return true
      },
    }
  },
})
