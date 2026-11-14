import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { GdownCodeBlock } from '../../extensions/GdownCodeBlock'
import { htmlToMarkdown, markdownToHtml } from '../../utils/markdownConverter'

// The Vue node view needs a Vue-backed editor; the lowlight decorations and
// schema under test live in the ProseMirror plugin, so a plain DOM render is enough.
const CodeBlock = GdownCodeBlock.extend({ addNodeView: () => null })

describe('GdownCodeBlock', () => {
  let editor: Editor | undefined

  afterEach(() => {
    editor?.destroy()
    editor = undefined
  })

  function render(markdown: string): Editor {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [Document, Paragraph, Text, CodeBlock],
      content: markdownToHtml(markdown),
    })
    return editor
  }

  it('does not auto-detect a language for an unlabelled block', () => {
    const view = render('```\nconst x = 1\nfunction f() { return "s" }\n```').view
    expect(view.dom.querySelector('pre')?.textContent).toContain('const x = 1')
    expect(view.dom.querySelectorAll('[class*="hljs-"]')).toHaveLength(0)
  })

  it('still highlights a block with an explicit language', () => {
    const view = render('```js\nconst x = 1\n```').view
    expect(view.dom.querySelectorAll('[class*="hljs-"]').length).toBeGreaterThan(0)
  })

  it('round-trips an unlabelled fence without adding a language', () => {
    const markdown = '```\nconst x = 1\n```'
    const result = render(markdown)
    expect(result.state.doc.firstChild?.attrs.language).toBeNull()
    expect(htmlToMarkdown(result.getHTML()).trim()).toBe(markdown)
  })
})
