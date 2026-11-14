/**
 * Positions captured when the link tooltip / dialog opens must not be used
 * against a different document: a document change dismisses them, and a stale
 * value that slips through (a state swap without a transaction event) is
 * ignored rather than throwing or editing the wrong place.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { markRaw, nextTick } from 'vue'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { GdownLink } from '../../extensions/GdownLink'
import LinkTooltip from '../../components/LinkTooltip.vue'
import InsertLinkDialog from '../../components/InsertLinkDialog.vue'
import { useEditorSettingsStore } from '../../stores/editorSettings'

const HTML = '<p>Some long introduction text before <a href="https://old.example/">docs</a> end</p>'

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
}

/** Shorten the document without a Tiptap transaction event (stale-value path). */
function swapToShortDocument(editor: Editor): void {
  const tr = editor.state.tr.delete(1, editor.state.doc.content.size - 1)
  editor.view.updateState(editor.state.apply(tr))
}

describe('stale positions', () => {
  let editor: Editor
  let wrapper: VueWrapper
  let errors: unknown[]

  beforeEach(() => {
    setActivePinia(createPinia())
    useEditorSettingsStore().linkMode = 'edit'
    errors = []
    editor = new Editor({
      extensions: [StarterKit.configure({ link: false, trailingNode: false }), GdownLink],
      content: HTML,
    })
  })

  afterEach(() => {
    wrapper.unmount()
    editor.destroy()
  })

  function mountWith(component: typeof LinkTooltip | typeof InsertLinkDialog): void {
    // markRaw: Editor.vue passes a shallowRef editor; a deep reactive proxy breaks ProseMirror.
    wrapper = mount(component, {
      props: { editor: markRaw(editor) },
      global: { config: { errorHandler: (error) => void errors.push(error) } },
    })
  }

  async function hoverLink(): Promise<void> {
    editor.view.dom
      .querySelector('a')!
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await nextTick()
  }

  describe('LinkTooltip', () => {
    it('is dismissed when the document changes while it is open', async () => {
      mountWith(LinkTooltip)
      await hoverLink()
      expect(button('Edit')).toBeDefined()

      editor.commands.insertContentAt(1, 'Z')
      await nextTick()

      expect(button('Edit')).toBeUndefined()
    })

    it('stays open on a selection-only transaction', async () => {
      mountWith(LinkTooltip)
      await hoverLink()

      editor.commands.setTextSelection(3)
      await nextTick()

      expect(button('Edit')).toBeDefined()
    })

    it('ignores a cached position that is no longer in the document (Edit, Unlink)', async () => {
      mountWith(LinkTooltip)
      await hoverLink()
      swapToShortDocument(editor)
      const before = editor.getJSON()

      button('Unlink')!.click()
      await nextTick()
      button('Edit')?.click()
      await nextTick()

      expect(errors).toEqual([])
      expect(editor.getJSON()).toEqual(before)
      expect(document.body.querySelector('.link-edit-input')).toBeNull()
    })
  })

  describe('InsertLinkDialog', () => {
    async function openDialog(): Promise<void> {
      editor.commands.setTextSelection({ from: 40, to: 44 })
      editor.commands.keyboardShortcut('Mod-k')
      await nextTick()
      const url = document.body.querySelector<HTMLInputElement>('#link-url')!
      url.value = 'https://new.example/'
      url.dispatchEvent(new Event('input'))
      await nextTick()
    }

    it('closes without linking when the document changes while it is open', async () => {
      mountWith(InsertLinkDialog)
      await openDialog()

      editor.commands.insertContentAt(1, 'Z')
      await nextTick()

      expect(document.body.querySelector('#link-url')).toBeNull()
      expect(editor.getHTML()).not.toContain('new.example')
    })

    it('ignores a saved selection that is no longer in the document', async () => {
      mountWith(InsertLinkDialog)
      await openDialog()
      swapToShortDocument(editor)
      const before = editor.getJSON()

      button('Insert')!.click()
      await nextTick()

      expect(errors).toEqual([])
      expect(editor.getJSON()).toEqual(before)
    })
  })
})
