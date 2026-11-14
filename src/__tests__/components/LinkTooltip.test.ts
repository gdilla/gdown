import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, markRaw, nextTick, onBeforeUnmount } from 'vue'
import { Editor as CoreEditor } from '@tiptap/core'
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import LinkTooltip from '../../components/LinkTooltip.vue'
import { GdownLink } from '../../extensions/GdownLink'
import { GdownImage } from '../../extensions/GdownImage'
import { useEditorSettingsStore } from '../../stores/editorSettings'

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}))

describe('LinkTooltip', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('cleans up after its TipTap editor is destroyed by the parent', async () => {
    const Harness = defineComponent({
      setup() {
        const editor = new Editor({
          extensions: [StarterKit],
          content: '<p>Draft</p>',
        })

        onBeforeUnmount(() => editor.destroy())

        return () => h('div', [h(EditorContent, { editor }), h(LinkTooltip, { editor })])
      },
    })

    const wrapper = mount(Harness)
    await Promise.resolve()

    expect(() => wrapper.unmount()).not.toThrow()
  })
})

describe('LinkTooltip editing link text', () => {
  let editor: CoreEditor
  let wrapper: VueWrapper

  beforeEach(() => {
    setActivePinia(createPinia())
    useEditorSettingsStore().linkMode = 'edit'
    editor = new CoreEditor({
      extensions: [StarterKit.configure({ link: false }), GdownLink, GdownImage],
    })
    // markRaw: Editor.vue passes a shallowRef editor; a deep reactive proxy breaks ProseMirror.
    wrapper = mount(LinkTooltip, { props: { editor: markRaw(editor) } })
  })

  afterEach(() => {
    wrapper.unmount()
    editor.destroy()
  })

  function button(label: string): HTMLButtonElement {
    const found = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.link-popup button'),
    ).find((candidate) => candidate.textContent?.trim() === label)
    if (!found) throw new Error(`no ${label} button`)
    return found
  }

  /** Hover the link, click Edit, set URL + display text, click Save. */
  async function editLink(url: string, text: string): Promise<HTMLInputElement> {
    const anchor = editor.view.dom.querySelector('a')!
    const inside = editor.view.posAtDOM(anchor, 0) + 1
    editor.commands.setTextSelection(inside)
    anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await nextTick()
    button('Edit').click()
    await nextTick()
    const [urlField, textField] = Array.from(
      document.body.querySelectorAll<HTMLInputElement>('.link-edit-input'),
    )
    urlField!.value = url
    urlField!.dispatchEvent(new Event('input'))
    if (!textField!.disabled) {
      textField!.value = text
      textField!.dispatchEvent(new Event('input'))
    }
    await nextTick()
    button('Save').click()
    await nextTick()
    return textField!
  }

  const blocks: Array<[string, (inner: string) => string]> = [
    ['heading', (inner) => `<h2>${inner}</h2>`],
    ['listItem', (inner) => `<ul><li><p>${inner}</p></li></ul>`],
    ['blockquote', (inner) => `<blockquote><p>${inner}</p></blockquote>`],
  ]
  const words = ['Hello', 'big', 'world'] // block start, middle, end

  for (const [blockType, wrap] of blocks) {
    for (const word of words) {
      it(`edits the text of a link on "${word}" in a ${blockType} without changing the block`, async () => {
        const inner = 'Hello big world'.replace(word, `<a href="https://old.example">${word}</a>`)
        editor.commands.setContent(wrap(inner))
        // StarterKit may append a trailing paragraph; compare against the loaded shape.
        const before = editor.getJSON().content?.map((node) => node.type)

        await editLink('https://new.example', 'planet')

        expect(editor.getJSON().content?.map((node) => node.type)).toEqual(before)
        expect(editor.getText().trim()).toBe('Hello big world'.replace(word, 'planet'))
        const link = editor.view.dom.querySelector('a')
        expect(link?.textContent).toBe('planet')
        expect(link?.getAttribute('href')).toBe('https://new.example')
      })
    }
  }

  it('never replaces a link that wraps an inline image; it only updates the URL', async () => {
    editor.commands.setContent(
      '<p>Hello <a href="https://old.example">see <img src="cat.png" alt="cat"> here</a> end</p>',
    )

    const textField = await editLink('https://new.example', 'planet')

    expect(textField.disabled).toBe(true)
    expect(editor.view.dom.querySelector('a img')?.getAttribute('src')).toBe('cat.png')
    expect(editor.view.dom.querySelector('a')?.getAttribute('href')).toBe('https://new.example')
    expect(editor.getText().trim()).toBe('Hello see  here end')
  })
})
