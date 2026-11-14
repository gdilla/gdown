import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { MathInline } from '../../extensions/MathInline'
import { MathBlock } from '../../extensions/MathBlock'
import { htmlToMarkdown, markdownToHtml } from '../../utils/markdownConverter'

let editor: Editor | undefined

function createEditor(content = ''): Editor {
  editor = new Editor({ extensions: [StarterKit, MathInline, MathBlock], content })
  return editor
}

/** Simulate typing one character so input rules run, like a real keystroke. */
function type(ed: Editor, text: string): void {
  for (const char of text) {
    const { from, to } = ed.state.selection
    const handled = ed.view.someProp('handleTextInput', (handler) =>
      handler(ed.view, from, to, char, () => ed.state.tr.insertText(char, from, to)),
    )
    if (!handled) ed.view.dispatch(ed.state.tr.insertText(char, from, to))
  }
}

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

describe('math nodes', () => {
  it('getHTML() does not throw once inline and block math exist', () => {
    const ed = createEditor()
    ed.commands.insertContent({ type: 'mathInline', attrs: { latex: 'x^2' } })
    ed.commands.insertContent({ type: 'mathBlock', attrs: { latex: '\\int_0^1 x' } })
    expect(() => ed.getHTML()).not.toThrow()
  })

  it('round-trips markdown math through the editor byte-for-byte', () => {
    const source = 'Inline $\\frac{a_1}{b_2}$ here.\n\n$$\n\\int_0^1 x^2 \\, dx\n$$\n'
    const ed = createEditor(markdownToHtml(source))
    expect(htmlToMarkdown(ed.getHTML())).toBe(source)
  })

  it('input rule turns $x^2$ into inline math', () => {
    const ed = createEditor('<p></p>')
    type(ed, 'see $x^2$')
    expect(ed.getJSON().content?.[0]?.content).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'mathInline', attrs: { latex: 'x^2' } },
    ])
  })

  it('input rule leaves currency like "costs $5 and $" as text', () => {
    const ed = createEditor('<p></p>')
    type(ed, 'costs $5 and $10')
    expect(ed.getText()).toBe('costs $5 and $10')
    expect(ed.getHTML()).not.toContain('math-inline')
  })
})
