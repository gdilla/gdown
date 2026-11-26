import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEditorModeStore } from '../../stores/editorMode'
import { useTabsStore } from '../../stores/tabs'
import { useAutoSaveStore } from '../../stores/autoSave'

describe('useEditorModeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults to wysiwyg mode', () => {
    const store = useEditorModeStore()

    expect(store.mode).toBe('wysiwyg')
  })

  it('toggleMode switches from wysiwyg to source', () => {
    const store = useEditorModeStore()

    store.toggleMode()

    expect(store.mode).toBe('source')
  })

  it('toggleMode switches from source back to wysiwyg', () => {
    const store = useEditorModeStore()

    store.toggleMode()
    store.toggleMode()

    expect(store.mode).toBe('wysiwyg')
  })

  it('setMode sets a specific mode', () => {
    const store = useEditorModeStore()

    store.setMode('source')

    expect(store.mode).toBe('source')
  })

  it('isWysiwyg is true in wysiwyg mode', () => {
    const store = useEditorModeStore()

    expect(store.isWysiwyg).toBe(true)
    expect(store.isSource).toBe(false)
  })

  it('isSource is true in source mode', () => {
    const store = useEditorModeStore()

    store.setMode('source')

    expect(store.isSource).toBe(true)
    expect(store.isWysiwyg).toBe(false)
  })

  describe('source-only tabs', () => {
    it('is in source mode while a source-only tab is active, whatever the preference', () => {
      const tabs = useTabsStore()
      const note = tabs.createTab('/tmp/note.md', '# Note')
      const csv = tabs.createTab('/tmp/data.csv', 'a,b')
      const store = useEditorModeStore()

      expect(store.mode).toBe('source')
      expect(store.isSource).toBe(true)
      expect(store.isWysiwyg).toBe(false)

      // The preference is untouched: other tabs still open rich.
      tabs.setActiveTab(note.id)
      expect(store.mode).toBe('wysiwyg')

      tabs.setActiveTab(csv.id)
      expect(store.mode).toBe('source')
    })

    it('refuses to switch a source-only tab to rich mode and says why', async () => {
      const tabs = useTabsStore()
      const note = tabs.createTab('/tmp/note.md', '# Note')
      tabs.createTab('/tmp/data.csv', 'a,b')
      const store = useEditorModeStore()
      store.setMode('source')

      store.setMode('wysiwyg')
      store.toggleMode()

      expect(store.mode).toBe('source')
      await vi.waitFor(() =>
        expect(useAutoSaveStore().saveNotification).toEqual({
          message: 'data.csv is a plain-text file, so it stays in source mode.',
          type: 'warning',
        }),
      )
      // The refused requests did not flip the preference for other tabs.
      tabs.setActiveTab(note.id)
      expect(store.mode).toBe('source')
    })

    it('explains the size limit for a large markdown document', async () => {
      useTabsStore().createTab('/tmp/book.md', 'a'.repeat(200 * 1024 + 1))
      const store = useEditorModeStore()

      store.setMode('wysiwyg')

      expect(store.mode).toBe('source')
      await vi.waitFor(() =>
        expect(useAutoSaveStore().saveNotification?.message).toBe(
          'book.md is over 200 KB, so it stays in source mode.',
        ),
      )
    })

    // Text pasted in the source editor can outgrow the limit after the tab was
    // classified, and rich mode can then be turned on from another tab. However
    // the grown tab becomes active again, it must not be handed to the rich editor.
    it.each<[string, (tabs: ReturnType<typeof useTabsStore>, grownId: string) => unknown]>([
      ['selecting it', (tabs, grownId) => tabs.setActiveTab(grownId)],
      ['cycling forward to it', (tabs) => tabs.nextTab()],
      ['cycling back to it', (tabs) => tabs.previousTab()],
      ['closing the active tab beside it', (tabs) => tabs.closeTab(tabs.activeTabId!)],
      ['closing every other tab', (tabs, grownId) => tabs.closeOtherTabs(grownId)],
    ])('keeps a tab that outgrew the limit out of the rich editor on %s', async (_, activate) => {
      const tabs = useTabsStore()
      const grown = tabs.createTab('/tmp/grown.md', '# Small')
      const other = tabs.createTab('/tmp/other.md', '# Other')
      const store = useEditorModeStore()
      store.setMode('source')
      tabs.setActiveTab(grown.id)
      tabs.saveEditorState(grown.id, { markdown: 'a'.repeat(200 * 1024 + 1) })
      tabs.setActiveTab(other.id)
      store.setMode('wysiwyg')
      expect(store.mode).toBe('wysiwyg')

      await activate(tabs, grown.id)

      expect(tabs.activeTabId).toBe(grown.id)
      expect(grown.sourceOnly).toBe('too-large')
      expect(store.mode).toBe('source')
    })

    // A paste in the rich editor can take a document past the limit; the flag is
    // left alone while it is being edited there. Leaving for source mode must
    // settle it before the source editor mounts with the markdown parser on.
    it.each<[string, (store: ReturnType<typeof useEditorModeStore>) => void]>([
      ['setMode', (store) => store.setMode('source')],
      ['toggleMode', (store) => store.toggleMode()],
    ])('re-decides a rich tab that outgrew the limit on %s to source', (_, toSource) => {
      const tabs = useTabsStore()
      const note = tabs.createTab('/tmp/note.md', '# Small')
      const store = useEditorModeStore()
      expect(store.mode).toBe('wysiwyg')
      // What the rich editor's flush writes just before the mode changes.
      tabs.saveEditorState(note.id, { markdown: 'a'.repeat(200 * 1024 + 1) })

      toSource(store)

      expect(store.mode).toBe('source')
      expect(note.sourceOnly).toBe('too-large')
    })

    it('allows rich mode again once a large document has been trimmed under the limit', () => {
      const tabs = useTabsStore()
      const book = tabs.createTab('/tmp/book.md', 'a'.repeat(200 * 1024 + 1))
      const store = useEditorModeStore()
      expect(store.mode).toBe('source')

      tabs.saveEditorState(book.id, { markdown: '# Short now' })
      store.setMode('wysiwyg')

      expect(book.sourceOnly).toBeNull()
      expect(store.mode).toBe('wysiwyg')
    })

    it('refuses rich mode for a document that grew past the limit in the source editor', () => {
      const tabs = useTabsStore()
      const note = tabs.createTab('/tmp/note.md', '# Small')
      const store = useEditorModeStore()
      store.setMode('source')

      tabs.saveEditorState(note.id, { markdown: 'a'.repeat(200 * 1024 + 1) })
      store.setMode('wysiwyg')

      expect(note.sourceOnly).toBe('too-large')
      expect(store.mode).toBe('source')
    })

    it('never re-decides a plain-text file by size', () => {
      const tabs = useTabsStore()
      const csv = tabs.createTab('/tmp/data.csv', 'a,b')
      const store = useEditorModeStore()

      store.setMode('wysiwyg')

      expect(csv.sourceOnly).toBe('plain-text')
      expect(store.mode).toBe('source')
    })

    it('still switches modes freely on an ordinary tab', () => {
      useTabsStore().createTab('/tmp/note.md', '# Note')
      const store = useEditorModeStore()

      store.setMode('source')
      expect(store.mode).toBe('source')
      store.setMode('wysiwyg')
      expect(store.mode).toBe('wysiwyg')
      expect(useAutoSaveStore().saveNotification).toBeNull()
    })
  })
})
