import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { FileNode, BreadcrumbSegment } from '../types/filetree'
import { useRecentFilesStore } from './recentFiles'

export const useSidebarStore = defineStore('sidebar', () => {
  /** Whether the sidebar is currently visible (hidden by default in single-file mode) */
  const visible = ref(false)

  /** Which panel is active in the sidebar */
  const activePanel = ref<'files' | 'ai'>('files')

  /** The root path of the currently opened folder */
  const rootPath = ref<string | null>(null)

  /** The file tree data loaded from the backend */
  const fileTree = ref<FileNode | null>(null)

  /** Loading state for async operations */
  const loading = ref(false)

  /** Error message if folder loading fails */
  const error = ref<string | null>(null)

  /** Whether a folder is currently open */
  const hasFolderOpen = computed(() => rootPath.value !== null && fileTree.value !== null)

  /** The display name of the root folder */
  const rootFolderName = computed(() => {
    if (!rootPath.value) return ''
    const parts = rootPath.value.split('/')
    return parts[parts.length - 1] || rootPath.value
  })

  /** Detect the home directory prefix (e.g. /Users/username or /home/username) */
  const homeDir = computed(() => {
    if (!rootPath.value) return null
    // Match /Users/<name> (macOS) or /home/<name> (Linux)
    const match = rootPath.value.match(/^(\/(?:Users|home)\/[^/]+)/)
    return match ? match[1] : null
  })

  /** Breadcrumb segments parsed from rootPath, with ~ shorthand for home */
  const breadcrumbSegments = computed<BreadcrumbSegment[]>(() => {
    if (!rootPath.value) return []

    const home = homeDir.value
    let displayPath = rootPath.value
    let basePath = ''

    if (home && rootPath.value.startsWith(home)) {
      // Replace home dir with ~
      displayPath = '~' + rootPath.value.slice(home.length)
      basePath = home
    }

    const parts = displayPath.split('/').filter(Boolean)
    const segments: BreadcrumbSegment[] = []

    if (home && rootPath.value.startsWith(home)) {
      // First segment is "~" pointing to home dir
      segments.push({ name: '~', path: basePath })
      // Remaining segments after ~
      const remaining = rootPath.value.slice(home.length).split('/').filter(Boolean)
      let currentPath = basePath
      for (const part of remaining) {
        currentPath = currentPath + '/' + part
        segments.push({ name: part, path: currentPath })
      }
    } else {
      // Absolute path without home shorthand
      let currentPath = ''
      for (const part of parts) {
        currentPath = currentPath + '/' + part
        segments.push({ name: part, path: currentPath })
      }
    }

    return segments
  })

  /**
   * Set the active sidebar panel
   */
  function setActivePanel(panel: 'files' | 'ai') {
    activePanel.value = panel
  }

  /**
   * Toggle sidebar visibility
   */
  function toggleSidebar() {
    visible.value = !visible.value
  }

  /**
   * Show the sidebar
   */
  function showSidebar() {
    visible.value = true
  }

  /**
   * Hide the sidebar
   */
  function hideSidebar() {
    visible.value = false
  }

  /**
   * Open a folder by path, invoking the Tauri backend to read the directory tree.
   * Automatically shows the sidebar when a folder is opened.
   */
  async function openFolder(path: string): Promise<void> {
    loading.value = true
    error.value = null

    try {
      const tree = await invoke<FileNode>('read_directory_tree', { path })
      fileTree.value = tree
      rootPath.value = path
      // Automatically show sidebar when opening a folder
      visible.value = true
      // Track this folder in recent items
      const recentFiles = useRecentFilesStore()
      recentFiles.addRecentFolder(path)
    } catch (e) {
      error.value = typeof e === 'string' ? e : String(e)
      console.error('Failed to open folder:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * Refresh the current folder tree from disk.
   */
  async function refreshTree(): Promise<void> {
    if (!rootPath.value) return
    await openFolder(rootPath.value)
  }

  /**
   * Close the currently opened folder (clears tree and path but keeps sidebar visible).
   */
  function closeFolder() {
    fileTree.value = null
    rootPath.value = null
    error.value = null
  }

  /**
   * Navigate to a folder by path (used by breadcrumb clicks).
   * Reloads the file tree for the target directory.
   */
  async function navigateToFolder(path: string): Promise<void> {
    await openFolder(path)
  }

  /**
   * Open a folder using a native dialog.
   * Uses the Tauri backend command to open a native folder picker, then loads the tree.
   */
  async function openFolderDialog(): Promise<void> {
    try {
      const path = await invoke<string | null>('open_folder_dialog')
      if (path) {
        await openFolder(path)
      }
    } catch (e) {
      error.value = typeof e === 'string' ? e : String(e)
      console.error('Failed to open folder dialog:', e)
    }
  }

  return {
    // State
    visible,
    rootPath,
    fileTree,
    loading,
    error,
    activePanel,

    // Computed
    hasFolderOpen,
    rootFolderName,
    breadcrumbSegments,

    // Actions
    setActivePanel,
    toggleSidebar,
    showSidebar,
    hideSidebar,
    openFolder,
    refreshTree,
    closeFolder,
    navigateToFolder,
    openFolderDialog,
  }
})
