import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSidebarStore } from '../../stores/sidebar'
import { invoke } from '@tauri-apps/api/core'

const mockedInvoke = vi.mocked(invoke)

describe('useSidebarStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
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

  describe('breadcrumbSegments', () => {
    it('returns empty array when no root path', () => {
      const store = useSidebarStore()

      expect(store.breadcrumbSegments).toEqual([])
    })

    it('parses absolute path into segments', () => {
      const store = useSidebarStore()

      store.rootPath = '/Users/gautambanerjee/projects/Leaf'

      expect(store.breadcrumbSegments).toEqual([
        { name: '~', path: '/Users/gautambanerjee' },
        { name: 'projects', path: '/Users/gautambanerjee/projects' },
        { name: 'Leaf', path: '/Users/gautambanerjee/projects/Leaf' },
      ])
    })

    it('uses ~ shorthand for home directory on macOS', () => {
      const store = useSidebarStore()

      store.rootPath = '/Users/testuser/Documents'

      expect(store.breadcrumbSegments[0]).toEqual({
        name: '~',
        path: '/Users/testuser',
      })
      expect(store.breadcrumbSegments[1]).toEqual({
        name: 'Documents',
        path: '/Users/testuser/Documents',
      })
    })

    it('uses ~ shorthand for home directory on Linux', () => {
      const store = useSidebarStore()

      store.rootPath = '/home/user/code/project'

      expect(store.breadcrumbSegments).toEqual([
        { name: '~', path: '/home/user' },
        { name: 'code', path: '/home/user/code' },
        { name: 'project', path: '/home/user/code/project' },
      ])
    })

    it('handles path without home directory prefix', () => {
      const store = useSidebarStore()

      store.rootPath = '/opt/data/myfiles'

      expect(store.breadcrumbSegments).toEqual([
        { name: 'opt', path: '/opt' },
        { name: 'data', path: '/opt/data' },
        { name: 'myfiles', path: '/opt/data/myfiles' },
      ])
    })

    it('handles home directory root itself', () => {
      const store = useSidebarStore()

      store.rootPath = '/Users/testuser'

      expect(store.breadcrumbSegments).toEqual([{ name: '~', path: '/Users/testuser' }])
    })
  })

  describe('closeFolder', () => {
    it('resets folder state but does not hide sidebar', () => {
      const store = useSidebarStore()

      // Simulate an open folder state
      store.rootPath = '/some/path'
      store.visible = true
      store.error = 'some previous error'

      store.closeFolder()

      expect(store.fileTree).toBeNull()
      expect(store.rootPath).toBeNull()
      expect(store.error).toBeNull()
      // Sidebar stays visible — user can open another folder
      expect(store.visible).toBe(true)
    })
  })

  describe('navigateToFolder', () => {
    it('calls openFolder with the given path', async () => {
      const store = useSidebarStore()

      const mockTree = {
        name: 'projects',
        path: '/Users/test/projects',
        is_dir: true,
        children: [],
      }
      mockedInvoke.mockResolvedValueOnce(mockTree)

      await store.navigateToFolder('/Users/test/projects')

      expect(mockedInvoke).toHaveBeenCalledWith('read_directory_tree', {
        path: '/Users/test/projects',
      })
      expect(store.rootPath).toBe('/Users/test/projects')
      expect(store.fileTree).toEqual(mockTree)
      expect(store.visible).toBe(true)
    })
  })
})
