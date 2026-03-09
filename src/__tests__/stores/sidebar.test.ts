import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSidebarStore } from '../../stores/sidebar'

describe('useSidebarStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults to not visible with no root path', () => {
    const store = useSidebarStore()

    expect(store.visible).toBe(false)
    expect(store.rootPath).toBeNull()
    expect(store.fileTree).toBeNull()
  })

  describe('visibility', () => {
    it('toggleSidebar flips visibility', () => {
      const store = useSidebarStore()

      store.toggleSidebar()
      expect(store.visible).toBe(true)

      store.toggleSidebar()
      expect(store.visible).toBe(false)
    })

    it('showSidebar sets visible to true', () => {
      const store = useSidebarStore()

      store.showSidebar()

      expect(store.visible).toBe(true)
    })

    it('hideSidebar sets visible to false', () => {
      const store = useSidebarStore()

      store.showSidebar()
      store.hideSidebar()

      expect(store.visible).toBe(false)
    })
  })

  describe('hasFolderOpen', () => {
    it('returns false when no folder is open', () => {
      const store = useSidebarStore()

      expect(store.hasFolderOpen).toBe(false)
    })

    it('returns false when rootPath is set but fileTree is null', () => {
      const store = useSidebarStore()

      // Directly set rootPath without fileTree (simulating partial state)
      store.rootPath = '/some/path'

      expect(store.hasFolderOpen).toBe(false)
    })
  })

  describe('rootFolderName', () => {
    it('returns empty string when no root path', () => {
      const store = useSidebarStore()

      expect(store.rootFolderName).toBe('')
    })

    it('extracts folder name from path', () => {
      const store = useSidebarStore()

      store.rootPath = '/Users/test/projects/my-project'

      expect(store.rootFolderName).toBe('my-project')
    })

    it('handles root path', () => {
      const store = useSidebarStore()

      store.rootPath = '/singlefolder'

      expect(store.rootFolderName).toBe('singlefolder')
    })
  })

  describe('closeFolder', () => {
    it('resets state and hides sidebar', () => {
      const store = useSidebarStore()

      // Simulate an open folder state
      store.rootPath = '/some/path'
      store.visible = true
      store.error = 'some previous error'

      store.closeFolder()

      expect(store.fileTree).toBeNull()
      expect(store.rootPath).toBeNull()
      expect(store.error).toBeNull()
      expect(store.visible).toBe(false)
    })
  })
})
