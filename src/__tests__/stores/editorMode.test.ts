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
