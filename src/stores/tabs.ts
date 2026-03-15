import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { Tab, EditorState } from '../types/tab'
import { createDefaultEditorState } from '../types/tab'
import { parseFrontMatter } from '../utils/frontmatter'

let nextUntitledNumber = 1

function generateId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function fileNameFromPath(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<Tab[]>([])
  const activeTabId = ref<string | null>(null)

  const activeTab = computed<Tab | null>(
    () => tabs.value.find((t) => t.id === activeTabId.value) ?? null,
  )

  const activeTabIndex = computed<number>(() =>
    tabs.value.findIndex((t) => t.id === activeTabId.value),
  )

  /**
   * Create a new tab and make it active.
   * If a file is already open, switches to that tab instead.
   */
  function createTab(filePath: string | null = null, content: string = ''): Tab {
    // Avoid opening duplicate tabs for same file
    if (filePath) {
      const existing = tabs.value.find((t) => t.filePath === filePath)
      if (existing) {
        activeTabId.value = existing.id
        return existing
      }
    }

    const isUntitled = filePath === null
    const title = isUntitled ? `Untitled-${nextUntitledNumber++}` : fileNameFromPath(filePath!)

    const tab: Tab = {
      id: generateId(),
      title,
      filePath,
      isModified: false,
      isUntitled,
      isImage: false,
      editorState: createDefaultEditorState(content),
    }

    tabs.value.push(tab)
    activeTabId.value = tab.id
    return tab
  }

  /**
   * Close a tab. If active, switch to the nearest neighbour.
   */
  function closeTab(tabId: string): void {
    const index = tabs.value.findIndex((t) => t.id === tabId)
    if (index === -1) return

    // Untrack file modified time for conflict detection
    const closingTab = tabs.value[index]!
    if (closingTab.filePath) {
      import('./autoSave')
        .then(({ useAutoSaveStore }) => {
          const autoSaveStore = useAutoSaveStore()
          autoSaveStore.untrackFile(closingTab.filePath!)
        })
        .catch(() => {})
    }

    const wasActive = activeTabId.value === tabId
    tabs.value.splice(index, 1)

    if (wasActive) {
      if (tabs.value.length === 0) {
        activeTabId.value = null
      } else {
        const newIndex = Math.min(index, tabs.value.length - 1)
        activeTabId.value = tabs.value[newIndex]!.id
      }
    }
  }

  /**
   * Switch to a tab by id.
   */
  function setActiveTab(tabId: string): void {
    if (tabs.value.some((t) => t.id === tabId)) {
      activeTabId.value = tabId
    }
  }

  /**
   * Save editor state for a specific tab.
   * Called before switching away from a tab to preserve cursor/scroll/content.
   */
  function saveEditorState(tabId: string, state: Partial<EditorState>): void {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (tab) {
      tab.editorState = { ...tab.editorState, ...state }
    }
  }

  /**
   * Mark a tab as modified or clean.
   */
  function setModified(tabId: string, modified: boolean): void {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (tab) {
      tab.isModified = modified
    }
  }

  /**
   * Update tab title.
   */
  function updateTabTitle(tabId: string, title: string): void {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (tab) {
      tab.title = title
    }
  }

  /**
   * Update file path and title after save-as.
   */
  function setFilePath(tabId: string, filePath: string): void {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (tab) {
      tab.filePath = filePath
      tab.title = fileNameFromPath(filePath)
      tab.isUntitled = false
      tab.isModified = false
    }
  }

  /**
   * Find a tab by its file path (to prevent duplicates).
   */
  function findTabByPath(filePath: string): Tab | undefined {
    return tabs.value.find((t) => t.filePath === filePath)
  }

  /**
   * Reorder a tab by moving it from one index to another.
   * Used for drag-and-drop tab reordering.
   */
  function reorderTab(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= tabs.value.length ||
      toIndex < 0 ||
      toIndex >= tabs.value.length ||
      fromIndex === toIndex
    ) {
      return
    }
    const [movedTab] = tabs.value.splice(fromIndex, 1)
    tabs.value.splice(toIndex, 0, movedTab!)
  }

  /**
   * Move a tab by its id to a specific index.
   */
  function moveTab(tabId: string, toIndex: number): void {
    const fromIndex = tabs.value.findIndex((t) => t.id === tabId)
    if (fromIndex === -1) return
    reorderTab(fromIndex, toIndex)
  }

  /**
   * Close all tabs except the specified one.
   */
  function closeOtherTabs(tabId: string): void {
    tabs.value = tabs.value.filter((t) => t.id === tabId)
    activeTabId.value = tabId
  }

  /**
   * Close all tabs to the right of the specified tab.
   */
  function closeTabsToRight(tabId: string): void {
    const index = tabs.value.findIndex((t) => t.id === tabId)
    if (index === -1) return
    tabs.value = tabs.value.slice(0, index + 1)
    // If active tab was among the closed ones, switch to this tab
    if (!tabs.value.some((t) => t.id === activeTabId.value)) {
      activeTabId.value = tabId
    }
  }

  /**
   * Close all tabs.
   */
  function closeAllTabs(): void {
    tabs.value = []
    activeTabId.value = null
  }

  /**
   * Navigate to the next tab (wraps around).
   */
  function nextTab(): void {
    if (tabs.value.length <= 1) return
    const currentIndex = activeTabIndex.value
    const nextIndex = (currentIndex + 1) % tabs.value.length
    activeTabId.value = tabs.value[nextIndex]!.id
  }

  /**
   * Navigate to the previous tab (wraps around).
   */
  function previousTab(): void {
    if (tabs.value.length <= 1) return
    const currentIndex = activeTabIndex.value
    const prevIndex = (currentIndex - 1 + tabs.value.length) % tabs.value.length
    activeTabId.value = tabs.value[prevIndex]!.id
  }

  /**
   * Open a file by path: reads its content from disk and opens it in
   * a new tab (or switches to existing tab if already open).
   */
  async function openFile(filePath: string): Promise<Tab | null> {
    // Check for existing tab first
    const existing = tabs.value.find((t) => t.filePath === filePath)
    if (existing) {
      activeTabId.value = existing.id
      return existing
    }

    try {
      const content = await invoke<string>('read_file', { path: filePath })

      // Parse YAML front-matter: separate metadata from body content
      const { rawYaml, attributes, body, hasFrontMatter } = parseFrontMatter(content)

      // Create tab with body-only markdown (front-matter is stored separately)
      const tab = createTab(filePath, body)

      // Store front-matter in the tab's editor state
      if (hasFrontMatter) {
        tab.editorState.frontmatter = rawYaml
        tab.editorState.frontmatterAttributes = attributes
      }

      // Track the file's modified time for conflict detection (lazy import to avoid circular deps)
      import('./autoSave')
        .then(({ useAutoSaveStore }) => {
          const autoSaveStore = useAutoSaveStore()
          autoSaveStore.trackFileModifiedTime(filePath)
        })
        .catch(() => {})

      return tab
    } catch (err) {
      console.error(`Failed to open file '${filePath}':`, err)
      return null
    }
  }

  /**
   * Open an image file in a preview tab (no text content loaded).
   */
  function openImageFile(filePath: string): Tab {
    // Check for existing tab
    const existing = tabs.value.find((t) => t.filePath === filePath)
    if (existing) {
      activeTabId.value = existing.id
      return existing
    }

    const tab: Tab = {
      id: generateId(),
      title: fileNameFromPath(filePath),
      filePath,
      isModified: false,
      isUntitled: false,
      isImage: true,
      editorState: createDefaultEditorState(),
    }

    tabs.value.push(tab)
    activeTabId.value = tab.id
    return tab
  }

  /**
   * Show a native file picker dialog and open the selected file.
   */
  async function openFileDialog(): Promise<Tab | null> {
    try {
      const filePath = await invoke<string | null>('open_file_dialog')
      if (filePath) {
        return openFile(filePath)
      }
      return null
    } catch (err) {
      console.error('Failed to open file dialog:', err)
      return null
    }
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    activeTabIndex,
    createTab,
    closeTab,
    setActiveTab,
    saveEditorState,
    setModified,
    updateTabTitle,
    setFilePath,
    findTabByPath,
    reorderTab,
    moveTab,
    closeOtherTabs,
    closeTabsToRight,
    closeAllTabs,
    nextTab,
    previousTab,
    openFile,
    openImageFile,
    openFileDialog,
  }
})
