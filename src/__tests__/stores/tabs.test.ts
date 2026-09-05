import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTabsStore, type CloseDecision } from '../../stores/tabs'
import { invoke } from '@tauri-apps/api/core'
import { useAutoSaveStore } from '../../stores/autoSave'
import { usePreferencesStore } from '../../stores/preferences'

const mockedInvoke = vi.mocked(invoke)

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('useTabsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedInvoke.mockReset()
  })

  describe('createTab', () => {
    it('creates a new tab and makes it active', () => {
      const store = useTabsStore()

      const tab = store.createTab()

      expect(store.tabs).toHaveLength(1)
      expect(store.activeTabId).toBe(tab.id)
      expect(tab.isUntitled).toBe(true)
      expect(tab.title).toMatch(/^Untitled-\d+$/)
    })

    it('creates a tab with a file path', () => {
      const store = useTabsStore()

      const tab = store.createTab('/path/to/file.md', '# Hello')

      expect(tab.filePath).toBe('/path/to/file.md')
      expect(tab.title).toBe('file.md')
      expect(tab.isUntitled).toBe(false)
      expect(tab.editorState.markdown).toBe('# Hello')
    })

    it('deduplicates by filePath and returns existing tab', () => {
      const store = useTabsStore()

      const tab1 = store.createTab('/path/to/file.md')
      const tab2 = store.createTab('/path/to/file.md')

      expect(store.tabs).toHaveLength(1)
      expect(tab2.id).toBe(tab1.id)
      expect(store.activeTabId).toBe(tab1.id)
    })

    it('does not deduplicate untitled tabs', () => {
      const store = useTabsStore()

      store.createTab()
      store.createTab()

      expect(store.tabs).toHaveLength(2)
    })
  })

  describe('closeTab', () => {
    it('removes a tab and switches to neighbor', async () => {
      const store = useTabsStore()

      const tab1 = store.createTab()
      const tab2 = store.createTab()
      store.setActiveTab(tab1.id)

      await store.closeTab(tab1.id)

      expect(store.tabs).toHaveLength(1)
      expect(store.activeTabId).toBe(tab2.id)
    })

    it('sets activeTabId to null when closing last tab', async () => {
      const store = useTabsStore()

      const tab = store.createTab()

      await store.closeTab(tab.id)

      expect(store.tabs).toHaveLength(0)
      expect(store.activeTabId).toBeNull()
    })

    it('does not change activeTabId when closing a non-active tab', async () => {
      const store = useTabsStore()

      const tab1 = store.createTab()
      const tab2 = store.createTab()

      // tab2 is active (most recently created)
      await store.closeTab(tab1.id)

      expect(store.tabs).toHaveLength(1)
      expect(store.activeTabId).toBe(tab2.id)
    })

    it('keeps a dirty tab when the close decision is cancelled', async () => {
      const store = useTabsStore()
      const tab = store.createTab('/tmp/note.md', '# Draft')
      store.setModified(tab.id, true)
      store.setCloseDecisionHandler(async () => 'cancel')

      await expect(store.closeTab(tab.id)).resolves.toBe(false)
      expect(store.tabs).toHaveLength(1)
      expect(store.tabs[0]?.isModified).toBe(true)
    })

    it('pauses a pending autosave during the close prompt and resumes after Cancel', async () => {
      vi.useFakeTimers()
      try {
        const store = useTabsStore()
        const autoSaveStore = useAutoSaveStore()
        const preferences = usePreferencesStore()
        preferences.autoSaveEnabled = true
        preferences.autoSaveIntervalMs = 500
        const tab = store.createTab('/tmp/note.md', '# Draft')
        store.setModified(tab.id, true)
        autoSaveStore.scheduleAutoSave(tab.id)

        const decision = deferred<CloseDecision>()
        let promptOpen = false
        store.setCloseDecisionHandler(async () => {
          promptOpen = true
          return decision.promise
        })
        mockedInvoke.mockImplementation(async (command) => {
          if (command === 'get_file_modified_time') return 100
          return undefined
        })

        const closing = store.closeTab(tab.id)
        await vi.waitFor(() => expect(promptOpen).toBe(true))

        await vi.advanceTimersByTimeAsync(1000)
        expect(mockedInvoke.mock.calls.some(([command]) => command === 'write_file')).toBe(false)

        decision.resolve('cancel')
        await expect(closing).resolves.toBe(false)
        await vi.advanceTimersByTimeAsync(500)
        for (let i = 0; i < 10; i += 1) await Promise.resolve()

        expect(mockedInvoke.mock.calls.some(([command]) => command === 'write_file')).toBe(true)
        expect(store.tabs[0]?.isModified).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('resumes autosave when the requested close save fails', async () => {
      vi.useFakeTimers()
      try {
        const store = useTabsStore()
        const autoSaveStore = useAutoSaveStore()
        const preferences = usePreferencesStore()
        preferences.autoSaveEnabled = true
        preferences.autoSaveIntervalMs = 500
        const tab = store.createTab('/tmp/note.md', '# Draft')
        store.setModified(tab.id, true)
        const writes: string[] = []
        mockedInvoke.mockImplementation(async (command) => {
          if (command === 'get_file_modified_time') return 100
          if (command === 'write_file') {
            writes.push(command)
            throw new Error('disk full')
          }
          return undefined
        })
        store.setCloseDecisionHandler(async () => 'save')

        await expect(store.closeTab(tab.id)).resolves.toBe(false)
        expect(writes).toHaveLength(1)

        await vi.advanceTimersByTimeAsync(500)
        for (let i = 0; i < 10; i += 1) await Promise.resolve()

        expect(writes.length).toBeGreaterThanOrEqual(2)
        expect(tab.isModified).toBe(true)
        autoSaveStore.cancelPending(tab.id)
      } finally {
        vi.useRealTimers()
      }
    })

    it('saves a dirty tab before closing it', async () => {
      const store = useTabsStore()
      const tab = store.createTab('/tmp/note.md', '# Draft')
      store.setModified(tab.id, true)
      store.setCloseDecisionHandler(async () => 'save')
      mockedInvoke
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(101)

      await expect(store.closeTab(tab.id)).resolves.toBe(true)
      expect(store.tabs).toHaveLength(0)
      expect(mockedInvoke).toHaveBeenCalledWith('write_file', {
        path: '/tmp/note.md',
        content: '# Draft',
      })
    })

    it('flushes the live editor before saving a dirty tab for close', async () => {
      const store = useTabsStore()
      const tab = store.createTab('/tmp/note.md', '# Before')
      store.setModified(tab.id, true)
      store.setCloseDecisionHandler(async () => 'save')
      const capture = () => {
        store.saveEditorState(tab.id, { markdown: '# Latest' })
        store.setModified(tab.id, true)
      }
      window.addEventListener('gdown:capture-state', capture)
      mockedInvoke
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(101)

      try {
        await expect(store.closeTab(tab.id)).resolves.toBe(true)
      } finally {
        window.removeEventListener('gdown:capture-state', capture)
      }

      expect(mockedInvoke).toHaveBeenCalledWith('write_file', {
        path: '/tmp/note.md',
        content: '# Latest',
      })
    })

    it('keeps the tab when a newer edit arrives during the close save', async () => {
      const store = useTabsStore()
      usePreferencesStore().autoSaveEnabled = false
      const tab = store.createTab('/tmp/note.md', '# Before')
      store.setModified(tab.id, true)
      store.setCloseDecisionHandler(async () => 'save')
      const write = deferred<void>()
      mockedInvoke
        .mockResolvedValueOnce(100)
        .mockReturnValueOnce(write.promise)
        .mockResolvedValueOnce(101)

      const closing = store.closeTab(tab.id)
      await vi.waitFor(() => {
        expect(mockedInvoke.mock.calls.some(([command]) => command === 'write_file')).toBe(true)
      })
      store.saveEditorState(tab.id, { markdown: '# After' })
      store.setModified(tab.id, true)
      write.resolve()

      await expect(closing).resolves.toBe(false)
      expect(store.tabs).toHaveLength(1)
      expect(store.tabs[0]?.editorState.markdown).toBe('# After')
      expect(store.tabs[0]?.isModified).toBe(true)
    })
  })

  describe('setActiveTab', () => {
    it('switches active tab', () => {
      const store = useTabsStore()

      const tab1 = store.createTab()
      store.createTab()

      store.setActiveTab(tab1.id)

      expect(store.activeTabId).toBe(tab1.id)
    })

    it('ignores invalid tab id', () => {
      const store = useTabsStore()

      const tab = store.createTab()

      store.setActiveTab('nonexistent-id')

      expect(store.activeTabId).toBe(tab.id)
    })
  })

  describe('saveEditorState', () => {
    it('merges partial state into tab editorState', () => {
      const store = useTabsStore()

      const tab = store.createTab()

      store.saveEditorState(tab.id, { markdown: '# Updated', scrollTop: 100 })

      const updated = store.tabs.find((t) => t.id === tab.id)!
      expect(updated.editorState.markdown).toBe('# Updated')
      expect(updated.editorState.scrollTop).toBe(100)
      // Other fields should remain at defaults
      expect(updated.editorState.doc).toBeNull()
    })
  })

  describe('markContentChanged', () => {
    it('advances the save revision before a rich snapshot is serialized', () => {
      const store = useTabsStore()
      const tab = store.createTab('/tmp/note.md', '# Draft')

      expect(tab.contentRevision).toBe(0)
      store.markContentChanged(tab.id)

      expect(store.tabs[0]?.contentRevision).toBe(1)
    })
  })

  describe('setModified', () => {
    it('updates the modified flag', () => {
      const store = useTabsStore()

      const tab = store.createTab()
      expect(tab.isModified).toBe(false)

      store.setModified(tab.id, true)

      expect(store.tabs.find((t) => t.id === tab.id)!.isModified).toBe(true)
    })
  })

  describe('setFilePath', () => {
    it('updates path, title, and flags', () => {
      const store = useTabsStore()

      const tab = store.createTab() // untitled tab

      store.setFilePath(tab.id, '/new/path/document.md')

      const updated = store.tabs.find((t) => t.id === tab.id)!
      expect(updated.filePath).toBe('/new/path/document.md')
      expect(updated.title).toBe('document.md')
      expect(updated.isUntitled).toBe(false)
      expect(updated.isModified).toBe(false)
    })
  })

  describe('reorderTab', () => {
    it('moves a tab from one index to another', () => {
      const store = useTabsStore()

      const tab1 = store.createTab('/a.md')
      const tab2 = store.createTab('/b.md')
      const tab3 = store.createTab('/c.md')

      store.reorderTab(0, 2)

      expect(store.tabs[0]!.id).toBe(tab2.id)
      expect(store.tabs[1]!.id).toBe(tab3.id)
      expect(store.tabs[2]!.id).toBe(tab1.id)
    })

    it('does nothing for invalid indices', () => {
      const store = useTabsStore()

      store.createTab()
      store.createTab()

      const tabsBefore = [...store.tabs]

      store.reorderTab(-1, 0)
      store.reorderTab(0, 5)
      store.reorderTab(0, 0)

      expect(store.tabs.map((t) => t.id)).toEqual(tabsBefore.map((t) => t.id))
    })
  })

  describe('closeOtherTabs', () => {
    it('keeps only the specified tab', async () => {
      const store = useTabsStore()

      store.createTab()
      const tabToKeep = store.createTab()
      store.createTab()

      await store.closeOtherTabs(tabToKeep.id)

      expect(store.tabs).toHaveLength(1)
      expect(store.tabs[0]!.id).toBe(tabToKeep.id)
      expect(store.activeTabId).toBe(tabToKeep.id)
    })
  })

  describe('closeTabsToRight', () => {
    it('removes tabs after the specified tab', async () => {
      const store = useTabsStore()

      const tab1 = store.createTab('/a.md')
      const tab2 = store.createTab('/b.md')
      store.createTab('/c.md')
      store.createTab('/d.md')

      await store.closeTabsToRight(tab2.id)

      expect(store.tabs).toHaveLength(2)
      expect(store.tabs[0]!.id).toBe(tab1.id)
      expect(store.tabs[1]!.id).toBe(tab2.id)
    })

    it('switches active tab if it was among closed tabs', async () => {
      const store = useTabsStore()

      const tab1 = store.createTab('/a.md')
      store.createTab('/b.md') // this is active (last created)

      await store.closeTabsToRight(tab1.id)

      expect(store.tabs).toHaveLength(1)
      expect(store.activeTabId).toBe(tab1.id)
    })
  })

  describe('closeAllTabs', () => {
    it('empties everything', async () => {
      const store = useTabsStore()

      store.createTab()
      store.createTab()
      store.createTab()

      await store.closeAllTabs()

      expect(store.tabs).toHaveLength(0)
      expect(store.activeTabId).toBeNull()
    })
  })

  describe('nextTab / previousTab', () => {
    it('nextTab wraps around', () => {
      const store = useTabsStore()

      const tab1 = store.createTab('/a.md')
      const tab2 = store.createTab('/b.md')
      const tab3 = store.createTab('/c.md')

      // Active is tab3 (last created)
      store.nextTab()
      expect(store.activeTabId).toBe(tab1.id)

      store.nextTab()
      expect(store.activeTabId).toBe(tab2.id)

      store.nextTab()
      expect(store.activeTabId).toBe(tab3.id)
    })

    it('previousTab wraps around', () => {
      const store = useTabsStore()

      const tab1 = store.createTab('/a.md')
      const tab2 = store.createTab('/b.md')
      const tab3 = store.createTab('/c.md')

      // Active is tab3 (last created)
      store.previousTab()
      expect(store.activeTabId).toBe(tab2.id)

      store.previousTab()
      expect(store.activeTabId).toBe(tab1.id)

      store.previousTab()
      expect(store.activeTabId).toBe(tab3.id)
    })

    it('does nothing with only one tab', () => {
      const store = useTabsStore()

      const tab = store.createTab()

      store.nextTab()
      expect(store.activeTabId).toBe(tab.id)

      store.previousTab()
      expect(store.activeTabId).toBe(tab.id)
    })
  })

  describe('findTabByPath', () => {
    it('returns the correct tab', () => {
      const store = useTabsStore()

      store.createTab('/a.md')
      const tab2 = store.createTab('/b.md')

      expect(store.findTabByPath('/b.md')?.id).toBe(tab2.id)
    })

    it('returns undefined for nonexistent path', () => {
      const store = useTabsStore()

      store.createTab('/a.md')

      expect(store.findTabByPath('/nonexistent.md')).toBeUndefined()
    })
  })

  describe('openFile', () => {
    it('reads recent file content before creating its tab', async () => {
      const store = useTabsStore()
      mockedInvoke.mockResolvedValueOnce(`---
title: Recent
---
# From disk`)

      const tab = await store.openFile('/tmp/recent.md')

      expect(tab?.editorState.markdown).toBe('# From disk')
      expect(tab?.editorState.frontmatter).toBe('title: Recent')
      expect(mockedInvoke).toHaveBeenCalledWith('read_file', { path: '/tmp/recent.md' })
    })

    it('does not create a tab when the recent file cannot be read', async () => {
      const store = useTabsStore()
      mockedInvoke.mockRejectedValueOnce(new Error('missing'))

      await expect(store.openFile('/tmp/missing.md')).resolves.toBeNull()
      expect(store.tabs).toHaveLength(0)
    })
  })

  describe('prepareCloseAll', () => {
    it('keeps earlier discarded drafts intact when a later quit decision cancels', async () => {
      const store = useTabsStore()
      const first = store.createTab(null, '# First draft')
      const second = store.createTab('/tmp/second.md', '# Second draft')
      store.setModified(first.id, true)
      store.setModified(second.id, true)
      store.setCloseDecisionHandler(async (tab) => (tab.id === first.id ? 'discard' : 'cancel'))

      await expect(store.prepareCloseAll()).resolves.toBe(false)

      expect(store.tabs).toHaveLength(2)
      expect(store.tabs[0]?.isModified).toBe(true)
      expect(store.tabs[0]?.editorState.markdown).toBe('# First draft')
      expect(store.tabs[1]?.isModified).toBe(true)
      expect(store.tabs[1]?.editorState.markdown).toBe('# Second draft')
    })
  })
})
