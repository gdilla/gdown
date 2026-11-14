import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { markRaw, nextTick } from 'vue'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { GdownLink } from '../../extensions/GdownLink'
import { GdownImage } from '../../extensions/GdownImage'
import InsertLinkDialog from '../../components/InsertLinkDialog.vue'

function field(id: string): HTMLInputElement {
  return document.body.querySelector<HTMLInputElement>(`#${id}`)!
}

async function type(id: string, value: string): Promise<void> {
  const input = field(id)
  input.value = value
  input.dispatchEvent(new Event('input'))
  await nextTick()
}

async function insert(): Promise<void> {
  document.body.querySelector<HTMLButtonElement>('.btn-confirm')!.click()
  await nextTick()
}

describe('InsertLinkDialog', () => {
  let editor: Editor
  let wrapper: VueWrapper

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit.configure({ link: false }), GdownLink, GdownImage],
      content: '<p>Hello world</p>',
    })
    // markRaw: Editor.vue passes a shallowRef editor; a deep reactive proxy breaks ProseMirror.
    wrapper = mount(InsertLinkDialog, { props: { editor: markRaw(editor) } })
  })

  afterEach(() => {
    wrapper.unmount()
    editor.destroy()
  })

  async function openFor(from: number, to: number): Promise<void> {
    const text = from === to ? undefined : editor.state.doc.textBetween(from, to)
    window.dispatchEvent(new CustomEvent('gdown:insert-link', { detail: { from, to, text } }))
    await nextTick()
  }

  it('applies an edited link text and the title to a selection', async () => {
    await openFor(7, 12) // "world"
    await type('link-text', 'planet')
    await type('link-url', 'https://example.com')
    await type('link-title', 'Example')
    await insert()

    const link = editor.view.dom.querySelector('a')!
    expect(link.textContent).toBe('planet')
    expect(link.getAttribute('href')).toBe('https://example.com')
    expect(link.getAttribute('title')).toBe('Example')
    expect(editor.getText()).toBe('Hello planet')
  })

  it('stores the title when the selected text is unchanged', async () => {
    await openFor(7, 12)
    await type('link-url', 'https://example.com')
    await type('link-title', 'Example')
    await insert()

    const link = editor.view.dom.querySelector('a')!
    expect(link.textContent).toBe('world')
    expect(link.getAttribute('title')).toBe('Example')
  })

  it('inserts the URL as link text when no text is given', async () => {
    await openFor(6, 6) // cursor after "Hello"
    await type('link-url', 'https://example.com')
    await insert()

    const link = editor.view.dom.querySelector('a')
    expect(link?.textContent).toBe('https://example.com')
    expect(link?.getAttribute('href')).toBe('https://example.com')
  })

  it('links a selected image in place instead of replacing it with the URL', async () => {
    editor.commands.setContent('<p>Hello <img src="cat.png" alt="cat"> world</p>')
    await openFor(7, 8) // the image node; no text in the selection
    await type('link-url', 'https://example.com')
    await insert()

    const link = editor.view.dom.querySelector('a')
    expect(link?.querySelector('img')?.getAttribute('src')).toBe('cat.png')
    expect(link?.getAttribute('href')).toBe('https://example.com')
    expect(editor.getText()).not.toContain('https://example.com')
  })

  /** Range of `word` inside the first textblock of the given node type. */
  function rangeOf(blockType: string, word: string): { from: number; to: number } {
    let found: { from: number; to: number } | null = null
    editor.state.doc.descendants((node, pos, parent) => {
      if (found || !node.isTextblock) return
      const owner = parent && parent.type.name !== 'doc' ? parent : node
      const typeName = owner.type.name === 'listItem' ? 'listItem' : owner.type.name
      if (typeName !== blockType) return
      const offset = node.textContent.indexOf(word)
      if (offset >= 0) found = { from: pos + 1 + offset, to: pos + 1 + offset + word.length }
    })
    if (!found) throw new Error(`${word} not found in ${blockType}`)
    return found
  }

  const blocks: Array<[string, string]> = [
    ['heading', '<h2>Hello big world</h2>'],
    ['listItem', '<ul><li><p>Hello big world</p></li></ul>'],
    ['blockquote', '<blockquote><p>Hello big world</p></blockquote>'],
  ]
  const words = ['Hello', 'big', 'world'] // block start, middle, end

  for (const [blockType, html] of blocks) {
    for (const word of words) {
      it(`replaces "${word}" in a ${blockType} without changing the block`, async () => {
        editor.commands.setContent(html)
        // StarterKit may append a trailing paragraph; compare against the loaded shape.
        const before = editor.getJSON().content?.map((node) => node.type)
        const { from, to } = rangeOf(blockType, word)
        await openFor(from, to)
        await type('link-text', 'planet')
        await type('link-url', 'https://example.com')
        await insert()

        expect(editor.getJSON().content?.map((node) => node.type)).toEqual(before)
        expect(editor.getText().trim()).toBe('Hello big world'.replace(word, 'planet'))
        expect(editor.view.dom.querySelector('a')?.textContent).toBe('planet')
      })
    }
  }

  it('links a mixed text + image selection in place and does not offer to edit its text', async () => {
    editor.commands.setContent('<p>Hello <img src="cat.png" alt="cat"> world</p>')
    await openFor(1, 13) // "Hello ", the image, " world"
    expect(field('link-text').disabled).toBe(true)
    await type('link-text', 'planet')
    await type('link-url', 'https://example.com')
    await insert()

    expect(editor.view.dom.querySelector('img')?.getAttribute('src')).toBe('cat.png')
    expect(editor.getText()).toBe('Hello  world')
    expect(editor.view.dom.querySelector('a img')).not.toBeNull()
  })
})
