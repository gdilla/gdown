import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTabsStore } from '../../stores/tabs'

describe('useTabsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
    it('removes a tab and switches to neighbor', () => {
      const store = useTabsStore()

      const tab1 = store.createTab()
      const tab2 = store.createTab()
      store.setActiveTab(tab1.id)

      store.closeTab(tab1.id)

      expect(store.tabs).toHaveLength(1)
      expect(store.activeTabId).toBe(tab2.id)
    })

    it('sets activeTabId to null when closing last tab', () => {
      const store = useTabsStore()

      const tab = store.createTab()

      store.closeTab(tab.id)

      expect(store.tabs).toHaveLength(0)
      expect(store.activeTabId).toBeNull()
    })

    it('does not change activeTabId when closing a non-active tab', () => {
      const store = useTabsStore()

      const tab1 = store.createTab()
      const tab2 = store.createTab()

      // tab2 is active (most recently created)
      store.closeTab(tab1.id)

      expect(store.tabs).toHaveLength(1)
      expect(store.activeTabId).toBe(tab2.id)
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
    it('keeps only the specified tab', () => {
      const store = useTabsStore()

      store.createTab()
      const tabToKeep = store.createTab()
      store.createTab()

      store.closeOtherTabs(tabToKeep.id)

      expect(store.tabs).toHaveLength(1)
      expect(store.tabs[0]!.id).toBe(tabToKeep.id)
      expect(store.activeTabId).toBe(tabToKeep.id)
    })
  })

  describe('closeTabsToRight', () => {
    it('removes tabs after the specified tab', () => {
      const store = useTabsStore()

      const tab1 = store.createTab('/a.md')
      const tab2 = store.createTab('/b.md')
      store.createTab('/c.md')
      store.createTab('/d.md')

      store.closeTabsToRight(tab2.id)

      expect(store.tabs).toHaveLength(2)
      expect(store.tabs[0]!.id).toBe(tab1.id)
      expect(store.tabs[1]!.id).toBe(tab2.id)
    })

    it('switches active tab if it was among closed tabs', () => {
      const store = useTabsStore()

      const tab1 = store.createTab('/a.md')
      store.createTab('/b.md') // this is active (last created)

      store.closeTabsToRight(tab1.id)

      expect(store.tabs).toHaveLength(1)
      expect(store.activeTabId).toBe(tab1.id)
    })
  })

  describe('closeAllTabs', () => {
    it('empties everything', () => {
      const store = useTabsStore()

      store.createTab()
      store.createTab()
      store.createTab()

      store.closeAllTabs()

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
})
