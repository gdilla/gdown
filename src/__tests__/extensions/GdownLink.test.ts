import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { GdownLink } from '../../extensions/GdownLink'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

/** Type text one character at a time so input rules and autolink run. */
function type(ed: Editor, text: string): void {
  for (const char of text) {
    const { from, to } = ed.state.selection
    const handled = ed.view.someProp('handleTextInput', (handler) =>
      handler(ed.view, from, to, char, () => ed.state.tr.insertText(char, from, to)),
    )
    if (!handled) ed.view.dispatch(ed.state.tr.insertText(char, from, to))
  }
}

function hrefsAfterTyping(text: string): string[] {
  editor = new Editor({
    extensions: [
      StarterKit.configure({ link: false }),
      GdownLink.configure({ openOnClick: false, linkOnPaste: true, autolink: true }),
    ],
    content: '<p></p>',
  })
  type(editor, text)
  const hrefs: string[] = []
  editor.state.doc.descendants((node) => {
    for (const mark of node.marks) if (mark.type.name === 'link') hrefs.push(mark.attrs.href)
  })
  return hrefs
}

describe('GdownLink autolink while typing', () => {
  it.each(['see CLAUDE.md ', 'see example.com ', 'see www.example.com '])(
    'does not link a bare filename or domain: %s',
    (text) => {
      expect(hrefsAfterTyping(text)).toEqual([])
    },
  )

  it('links text with an explicit scheme', () => {
    expect(hrefsAfterTyping('see https://example.com/a ')).toEqual(['https://example.com/a'])
  })

  it('links an email', () => {
    expect(hrefsAfterTyping('mail me@example.com ')).toEqual(['mailto:me@example.com'])
  })
})
