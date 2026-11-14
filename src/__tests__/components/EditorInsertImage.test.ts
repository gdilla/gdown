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

  async function mountEditorFor(
    filePath: string | null,
    { reuseActiveTab = false } = {},
  ): Promise<string> {
    const tabsStore = useTabsStore()
    const tab = reuseActiveTab ? tabsStore.activeTab! : tabsStore.createTab(filePath, 'Intro')
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

  /** Reload saved markdown into a fresh editor beside `filePath`; return its image attrs. */
  async function reload(markdown: string, filePath: string) {
    wrapper?.unmount()
    const tabsStore = useTabsStore()
    tabsStore.createTab(filePath, markdown)
    await mountEditorFor(null, { reuseActiveTab: true })
    const editor = (wrapper!.vm as unknown as { getEditor(): TiptapEditor }).getEditor()
    let attrs: Record<string, unknown> | null = null
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') attrs = node.attrs
    })
    return attrs as { src: string; originalSrc: string; alt: string } | null
  }

  it.each([
    ['a:b.png', 'a%3Ab.png'],
    ['a).png', 'a%29.png'],
    ['x (1).png', 'x%20%281%29.png'],
    ['#1?.png', '%231%3F.png'],
  ])('encodes reserved characters in %s so the saved path reloads', async (name, encoded) => {
    const tabId = await mountEditorFor('/docs/notes/doc.md')
    const { displaySrc, markdown } = await insert(tabId, `/docs/notes/sub/${name}`)
    expect(displaySrc).toBe(asset(`/docs/notes/sub/${name}`))
    expect(markdown).toContain(`(sub/${encoded})`)

    const image = await reload(markdown!, '/docs/notes/reloaded.md')
    expect(image?.originalSrc).toBe(`sub/${encoded}`)
    expect(image?.src).toBe(asset(`/docs/notes/sub/${name}`))
  })

  // Skipped until this branch is rebased onto the markdownConverter fix that
  // escapes ] in image alt text (owned by the fix/markdown-roundtrip agent).
  it.skip('keeps a filename-derived alt text with ] through save and reload', async () => {
    const tabId = await mountEditorFor('/docs/notes/doc.md')
    const { markdown } = await insert(tabId, '/docs/notes/scan].png')

    const image = await reload(markdown!, '/docs/notes/reloaded.md')
    expect(image?.alt).toBe('scan]')
    expect(image?.src).toBe(asset('/docs/notes/scan].png'))
  })

  it('discards the picked image if another tab became active while the picker was open', async () => {
    const tabsStore = useTabsStore()
    const firstId = await mountEditorFor('/docs/notes/doc.md')
    let pick: (path: string) => void = () => {}
    mockedOpen.mockReturnValue(
      new Promise((resolve) => {
        pick = (path) => resolve(path)
      }),
    )
    window.dispatchEvent(new CustomEvent('gdown:insert-image'))
    await flushPromises()

    const second = tabsStore.createTab('/docs/other/next.md', 'Other')
    await flushPromises()
    expect(tabsStore.activeTabId).toBe(second.id)
    pick('/docs/notes/photo.png')
    await flushPromises()
    window.dispatchEvent(new Event('gdown:capture-state'))

    const markdownOf = (id: string) => tabsStore.tabs.find((tab) => tab.id === id)?.editorState
    expect(markdownOf(second.id)?.markdown).not.toContain('![')
    expect(markdownOf(firstId)?.markdown ?? '').not.toContain('![')
    expect(JSON.stringify(markdownOf(firstId)?.doc ?? null)).not.toContain('photo')
  })
})
