import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { open } from '@tauri-apps/plugin-dialog'
import Editor from '../../components/Editor.vue'
import { useTabsStore } from '../../stores/tabs'

const mockedOpen = vi.mocked(open)
const asset = (path: string) => `asset://localhost/${encodeURIComponent(path)}`

/**
 * Real Editor round trip: load markdown → Cmd+Shift+I (gdown:insert-image) →
 * capture-state serialisation, asserting the markdown that would be saved.
 */
describe('Editor insert image', () => {
  let wrapper: VueWrapper | undefined
  const promptSpy = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    mockedOpen.mockReset()
    vi.stubGlobal('prompt', promptSpy)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.unstubAllGlobals()
  })

  async function mountEditorFor(filePath: string | null): Promise<string> {
    const tab = useTabsStore().createTab(filePath, 'Intro')
    wrapper = mount(Editor, {
      global: {
        stubs: {
          EditorContent: { template: '<div />' },
          LinkTooltip: true,
          InsertLinkDialog: true,
          FindReplace: true,
        },
      },
    })
    await nextTick()
    return tab.id
  }

  /** Pick `picked`, then return the displayed img src and the serialised markdown. */
  async function insert(tabId: string, picked: string | null) {
    mockedOpen.mockResolvedValue(picked)
    window.dispatchEvent(new CustomEvent('gdown:insert-image'))
    await flushPromises()
    const editor = (wrapper!.vm as unknown as { getEditor(): TiptapEditor }).getEditor()
    const img = editor.view.dom.querySelector('img')
    window.dispatchEvent(new Event('gdown:capture-state'))
    const tab = useTabsStore().tabs.find((candidate) => candidate.id === tabId)
    return { displaySrc: img?.getAttribute('src') ?? null, markdown: tab?.editorState.markdown }
  }

  it('picks the image with the native dialog instead of window.prompt', async () => {
    const tabId = await mountEditorFor('/docs/notes/doc.md')
    await insert(tabId, '/docs/notes/images/photo.png')

    expect(promptSpy).not.toHaveBeenCalled()
    expect(mockedOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: false,
        directory: false,
        filters: [expect.objectContaining({ extensions: expect.arrayContaining(['png', 'jpg']) })],
      }),
    )
  })

  it('saves a relative path for an image inside a saved document folder', async () => {
    const tabId = await mountEditorFor('/docs/notes/doc.md')
    const { displaySrc, markdown } = await insert(tabId, '/docs/notes/images/photo.png')

    expect(displaySrc).toBe(asset('/docs/notes/images/photo.png'))
    expect(markdown).toContain('![photo](images/photo.png)')
  })

  it('saves ../ for an image outside the folder but displays a normalised asset path', async () => {
    const tabId = await mountEditorFor('/docs/notes/doc.md')
    const { displaySrc, markdown } = await insert(tabId, '/docs/shared/logo.svg')

    expect(displaySrc).toBe(asset('/docs/shared/logo.svg'))
    expect(markdown).toContain('![logo](../shared/logo.svg)')
  })

  it('URL-encodes spaces so the saved image still parses as markdown', async () => {
    const tabId = await mountEditorFor('/docs/notes/doc.md')
    const { displaySrc, markdown } = await insert(tabId, '/docs/notes/My Shot.png')

    expect(displaySrc).toBe(asset('/docs/notes/My Shot.png'))
    expect(markdown).toContain('![My Shot](My%20Shot.png)')
  })

  it('displays an untitled document image through the asset URL and saves its absolute path', async () => {
    const tabId = await mountEditorFor(null)
    const { displaySrc, markdown } = await insert(tabId, '/Users/me/Pictures/cat.jpg')

    expect(displaySrc).toBe(asset('/Users/me/Pictures/cat.jpg'))
    expect(markdown).toContain('![cat](/Users/me/Pictures/cat.jpg)')
  })

  it('inserts nothing when the picker is cancelled', async () => {
    const tabId = await mountEditorFor('/docs/notes/doc.md')
    const { displaySrc, markdown } = await insert(tabId, null)

    expect(displaySrc).toBeNull()
    expect(markdown).not.toContain('![')
  })
})
