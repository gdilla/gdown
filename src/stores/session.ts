import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useTabsStore } from './tabs'
import { useSidebarStore } from './sidebar'

/**
 * Serializable session tab data — captures the essential info needed
 * to restore a tab on next launch. We intentionally exclude TipTap
 * JSONContent (doc) since we re-read files from disk on restore.
 * Untitled tabs persist their markdown content so unsaved work is preserved.
 */
export interface SessionTab {
  /** File path on disk (null for untitled tabs) */
  filePath: string | null
  /** Display title */
  title: string
  /** Whether the tab was unsaved/untitled */
  isUntitled: boolean
  /** Scroll position in pixels from top */
  scrollTop: number
  /** Cursor selection */
  selection: { from: number; to: number }
  /** Raw markdown content — persisted for untitled tabs to preserve unsaved work */
  markdown: string
}

/**
 * Complete serializable session state
 */
export interface SessionState {
  /** Version for future migration compatibility */
  version: number
  /** Timestamp of when this session was saved */
  savedAt: string
  /** Open tabs with their file paths and scroll positions */
  tabs: SessionTab[]
  /** Index of the active tab (-1 if none) */
  activeTabIndex: number
  /** Sidebar folder path (null if no folder open) */
  sidebarFolderPath: string | null
  /** Whether the sidebar was visible */
  sidebarVisible: boolean
}

const SESSION_VERSION = 1
const AUTO_SAVE_INTERVAL_MS = 30_000 // 30 seconds

export const useSessionStore = defineStore('session', () => {
  /** Whether session restore has completed */
  const restored = ref(false)

  /** Whether a save is currently in progress */
  const saving = ref(false)

  /** Auto-save interval handle */
  let autoSaveTimer: ReturnType<typeof setInterval> | null = null

  /**
   * Capture the current session state from tabs and sidebar stores.
   */
  function captureSessionState(): SessionState {
    const tabsStore = useTabsStore()
    const sidebarStore = useSidebarStore()

    const sessionTabs: SessionTab[] = tabsStore.tabs.map((tab) => ({
      filePath: tab.filePath,
      title: tab.title,
      isUntitled: tab.isUntitled,
      scrollTop: tab.editorState.scrollTop,
      selection: { ...tab.editorState.selection },
      markdown: tab.editorState.markdown,
    }))

    return {
      version: SESSION_VERSION,
      savedAt: new Date().toISOString(),
      tabs: sessionTabs,
      activeTabIndex: tabsStore.activeTabIndex,
      sidebarFolderPath: sidebarStore.rootPath,
      sidebarVisible: sidebarStore.visible,
    }
  }

  /**
   * Save current session state to the Tauri app data directory.
   * Debounced to prevent excessive writes.
   */
  async function saveSession(): Promise<void> {
    if (saving.value) return

    saving.value = true
    try {
      const state = captureSessionState()
      const json = JSON.stringify(state, null, 2)
      await invoke('save_session_state', { state: json })
    } catch (err) {
      console.error('Failed to save session state:', err)
    } finally {
      saving.value = false
    }
  }

  /**
   * Load session state from the Tauri app data directory.
   * Returns null if no session exists or if the data is invalid.
   */
  async function loadSession(): Promise<SessionState | null> {
    try {
      const json = await invoke<string | null>('load_session_state')
      if (!json) return null

      const state = JSON.parse(json) as SessionState

      // Validate version and basic structure
      if (
        typeof state.version !== 'number' ||
        !Array.isArray(state.tabs) ||
        typeof state.activeTabIndex !== 'number'
      ) {
        console.warn('Invalid session state format, ignoring')
        return null
      }

      return state
    } catch (err) {
      console.error('Failed to load session state:', err)
      return null
    }
  }

  /**
   * Restore session: re-open tabs, restore sidebar folder, and set active tab.
   * Restores both file-backed tabs (re-read from disk) and untitled tabs
   * (restored from persisted markdown content).
   * Returns true if a session was successfully restored.
   */
  async function restoreSession(): Promise<boolean> {
    if (restored.value) return false

    const state = await loadSession()
    if (!state || state.tabs.length === 0) {
      restored.value = true
      return false
    }

    const tabsStore = useTabsStore()
    const sidebarStore = useSidebarStore()

    // 1. Restore sidebar folder first (if any)
    if (state.sidebarFolderPath) {
      try {
        await sidebarStore.openFolder(state.sidebarFolderPath)
      } catch (err) {
        console.warn('Failed to restore sidebar folder:', err)
      }
    }

    // Restore sidebar visibility — respect persisted state even if openFolder
    // auto-showed it
    if (state.sidebarVisible && !sidebarStore.visible) {
      sidebarStore.showSidebar()
    } else if (!state.sidebarVisible && sidebarStore.visible) {
      sidebarStore.hideSidebar()
    }

    // 2. Restore tabs in order, building a mapping from session index → tab id
    // so we can correctly restore the active tab
    const indexToTabId: Map<number, string> = new Map()

    for (let i = 0; i < state.tabs.length; i++) {
      const sessionTab = state.tabs[i]
      if (!sessionTab) continue

      if (sessionTab.isUntitled || !sessionTab.filePath) {
        // Untitled tab: restore from persisted markdown content
        const markdown = sessionTab.markdown || ''
        // Only restore untitled tabs that have content (skip empty untitled tabs)
        if (markdown.length > 0) {
          const tab = tabsStore.createTab(null, markdown)
          indexToTabId.set(i, tab.id)
          // Restore scroll position and selection
          tabsStore.saveEditorState(tab.id, {
            scrollTop: sessionTab.scrollTop,
            selection: sessionTab.selection,
          })
        }
      } else {
        // File-backed tab: re-read content from disk for freshness
        try {
          const tab = await tabsStore.openFile(sessionTab.filePath)
          if (tab) {
            indexToTabId.set(i, tab.id)
            // Restore scroll position and selection
            tabsStore.saveEditorState(tab.id, {
              scrollTop: sessionTab.scrollTop,
              selection: sessionTab.selection,
            })
          }
        } catch (err) {
          console.warn(`Failed to restore tab for '${sessionTab.filePath}':`, err)
        }
      }
    }

    // 3. Set the active tab using the original session index
    if (state.activeTabIndex >= 0 && indexToTabId.has(state.activeTabIndex)) {
      tabsStore.setActiveTab(indexToTabId.get(state.activeTabIndex)!)
    } else if (tabsStore.tabs.length > 0) {
      // Fallback: activate the first restored tab
      tabsStore.setActiveTab(tabsStore.tabs[0]!.id)
    }

    restored.value = true
    return indexToTabId.size > 0
  }

  /**
   * Start periodic auto-save of session state.
   */
  function startAutoSave(): void {
    stopAutoSave() // Clear any existing timer
    autoSaveTimer = setInterval(() => {
      saveSession()
    }, AUTO_SAVE_INTERVAL_MS)
  }

  /**
   * Stop periodic auto-save.
   */
  function stopAutoSave(): void {
    if (autoSaveTimer !== null) {
      clearInterval(autoSaveTimer)
      autoSaveTimer = null
    }
  }

  /**
   * Initialize session management: restore session and start auto-save.
   * Should be called once during app startup.
   */
  async function initialize(): Promise<boolean> {
    const wasRestored = await restoreSession()
    startAutoSave()
    return wasRestored
  }

  /**
   * Teardown: save final session state and stop auto-save.
   * Should be called on app close / beforeunload.
   */
  async function teardown(): Promise<void> {
    stopAutoSave()
    await saveSession()
  }

  return {
    // State
    restored,
    saving,

    // Actions
    captureSessionState,
    saveSession,
    loadSession,
    restoreSession,
    startAutoSave,
    stopAutoSave,
    initialize,
    teardown,
  }
})
