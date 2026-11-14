import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { markRaw, nextTick } from 'vue'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { GdownLink } from '../../extensions/GdownLink'
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
      extensions: [StarterKit.configure({ link: false }), GdownLink],
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
})
