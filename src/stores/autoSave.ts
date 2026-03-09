import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useTabsStore } from './tabs'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

/** Auto-save debounce delay in milliseconds */
const AUTO_SAVE_DELAY_MS = 1500

/** Interval for checking external file changes (ms) */
const CONFLICT_CHECK_INTERVAL_MS = 1500

/** Conflict info when external changes are detected */
export interface ConflictInfo {
  tabId: string
  filePath: string
  diskContent: string
}

export const useAutoSaveStore = defineStore('autoSave', () => {
  const status = ref<SaveStatus>('saved')
  const lastSavedAt = ref<Date | null>(null)
  const errorMessage = ref<string | null>(null)

  /** Currently displayed conflict dialog info, or null if no conflict */
  const conflictDialog = ref<ConflictInfo | null>(null)

  /** Notification for save events (auto-cleared) */
  const saveNotification = ref<{ message: string; type: 'success' | 'error' | 'warning' } | null>(
    null,
  )

  /** Tracks last known modified times for open files (filePath -> epoch ms) */
  const knownModifiedTimes = ref<Record<string, number>>({})

  /** Debounce timer for auto-save */
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

  /** Conflict check interval handle */
  let conflictCheckInterval: ReturnType<typeof setInterval> | null = null

  /** Promise resolver for conflict dialog resolution */
  let conflictResolver: ((action: 'overwrite' | 'cancel') => void) | null = null

  const statusText = computed(() => {
    switch (status.value) {
      case 'saved':
        return 'Saved'
      case 'unsaved':
        return 'Unsaved changes'
      case 'saving':
        return 'Saving...'
      case 'error':
      default:
        return 'Save failed'
    }
  })

  const statusIcon = computed(() => {
    switch (status.value) {
      case 'saved':
        return '✓'
      case 'unsaved':
        return '●'
      case 'saving':
        return '↻'
      case 'error':
      default:
        return '✕'
    }
  })

  /**
   * Get the current markdown content for a specific tab.
   */
  function getTabMarkdown(tabId: string): string | null {
    const tabsStore = useTabsStore()
    const tab = tabsStore.tabs.find((t) => t.id === tabId)
    if (!tab) return null
    return tab.editorState.markdown ?? null
  }

  /**
   * Format write errors into user-friendly messages.
   */
  function formatWriteError(err: any): string {
    const msg = typeof err === 'string' ? err : err?.message || String(err)

    if (msg.includes('Permission denied') || msg.includes('permission')) {
      return 'Permission denied. The file or directory may be read-only.'
    }
    if (msg.includes('No space left') || msg.includes('disk full')) {
      return 'Disk is full. Free up space and try again.'
    }
    if (msg.includes('No such file or directory') || msg.includes('does not exist')) {
      return 'The file path is invalid or the directory no longer exists.'
    }
    if (msg.includes('Read-only file system')) {
      return 'The file system is read-only.'
    }

    return msg
  }

  /**
   * Show a temporary notification that auto-clears.
   */
  function showNotification(message: string, type: 'success' | 'error' | 'warning') {
    saveNotification.value = { message, type }
    setTimeout(
      () => {
        if (saveNotification.value?.message === message) {
          saveNotification.value = null
        }
      },
      type === 'error' ? 5000 : 3000,
    )
  }

  /**
   * Prompt for save location using native "Save As" dialog.
   * Returns the chosen file path, or null if cancelled.
   */
  async function promptForSaveLocation(defaultName: string): Promise<string | null> {
    try {
      const filePath = await invoke<string | null>('save_file_dialog', {
        defaultName: defaultName || 'Untitled.md',
      })
      return filePath
    } catch (err) {
      console.error('Save dialog error:', err)
      return null
    }
  }

  /**
   * Record the modified time of a file when it's first opened.
   * Called when a file is opened in a tab.
   */
  async function trackFileModifiedTime(filePath: string) {
    try {
      const modTime = await invoke<number>('get_file_modified_time', { path: filePath })
      knownModifiedTimes.value[filePath] = modTime
    } catch {
      // Non-critical — file may not exist yet
    }
  }

  /**
   * Stop tracking a file when its tab is closed.
   */
  function untrackFile(filePath: string) {
    delete knownModifiedTimes.value[filePath]
  }

  /**
   * Check if file was modified externally before saving.
   * If conflict is detected, shows a dialog and waits for user resolution.
   * Returns 'overwrite' to proceed, 'cancel' to abort.
   */
  async function checkConflictBeforeSave(
    filePath: string,
    tabId: string,
  ): Promise<'overwrite' | 'cancel'> {
    try {
      const currentModTime = await invoke<number>('get_file_modified_time', { path: filePath })
      const knownModTime = knownModifiedTimes.value[filePath]

      if (knownModTime && currentModTime > knownModTime) {
        // File was modified externally — show conflict dialog
        const diskContent = await invoke<string>('read_file', { path: filePath })
        conflictDialog.value = { tabId, filePath, diskContent }

        // Wait for user resolution
        return new Promise<'overwrite' | 'cancel'>((resolve) => {
          conflictResolver = resolve
        })
      }
    } catch {
      // If we can't check, proceed with save (file may be new/deleted externally)
    }
    return 'overwrite'
  }

  /**
   * Resolve a file conflict. Called by the UI conflict dialog.
   * @param action - 'overwrite' saves our version, 'reload' loads disk version, 'cancel' aborts save
   */
  function resolveConflict(action: 'overwrite' | 'reload' | 'cancel') {
    if (!conflictDialog.value) return

    const { tabId, filePath, diskContent } = conflictDialog.value
    const tabsStore = useTabsStore()

    if (action === 'reload') {
      // Load the disk version into the tab
      const tab = tabsStore.tabs.find((t) => t.id === tabId)
      if (tab) {
        tab.editorState.markdown = diskContent
        tab.editorState.doc = null
        tab.isModified = false
        // Push new content into the live running editor
        window.dispatchEvent(
          new CustomEvent('gdown:file-reloaded', {
            detail: { tabId, markdown: diskContent },
          }),
        )
      }
      // Update known mod time
      invoke<number>('get_file_modified_time', { path: filePath })
        .then((modTime) => {
          knownModifiedTimes.value[filePath] = modTime
        })
        .catch(() => {})
      conflictDialog.value = null
      if (conflictResolver) {
        conflictResolver('cancel') // Don't save after reload
        conflictResolver = null
      }
      status.value = 'saved'
      showNotification(
        `↻ Reloaded ${tabsStore.tabs.find((t) => t.id === tabId)?.title ?? 'file'} from disk`,
        'warning',
      )
    } else if (action === 'overwrite') {
      conflictDialog.value = null
      if (conflictResolver) {
        conflictResolver('overwrite')
        conflictResolver = null
      }
    } else {
      // cancel
      conflictDialog.value = null
      if (conflictResolver) {
        conflictResolver('cancel')
        conflictResolver = null
      }
      status.value = 'unsaved'
    }
  }

  /**
   * Write content to disk and update tracking state.
   * Core write operation with error handling.
   */
  async function writeFileToDisk(filePath: string, content: string): Promise<void> {
    await invoke('write_file', { path: filePath, content })

    // Update known modified time
    try {
      const modTime = await invoke<number>('get_file_modified_time', { path: filePath })
      knownModifiedTimes.value[filePath] = modTime
    } catch {
      // Non-critical
    }
  }

  /**
   * Save the active tab. If untitled, prompts for save location.
   * This is the main save entry point for Cmd+S and auto-save.
   */
  async function saveActiveTab(): Promise<boolean> {
    const tabsStore = useTabsStore()
    const tab = tabsStore.activeTab
    if (!tab) return false

    // Untitled/new file: prompt for save location
    if (!tab.filePath || tab.isUntitled) {
      return saveActiveTabAs()
    }

    // Don't save if not modified
    if (!tab.isModified) {
      status.value = 'saved'
      return true
    }

    const content = getTabMarkdown(tab.id)
    if (content === null) return false

    status.value = 'saving'
    errorMessage.value = null

    try {
      // Check for external conflict before writing
      const conflictResult = await checkConflictBeforeSave(tab.filePath, tab.id)
      if (conflictResult === 'cancel') {
        status.value = 'unsaved'
        return false
      }

      await writeFileToDisk(tab.filePath, content)

      // Mark tab as clean
      tabsStore.setModified(tab.id, false)
      status.value = 'saved'
      lastSavedAt.value = new Date()
      return true
    } catch (err) {
      console.error('Save failed:', err)
      const friendlyError = formatWriteError(err)
      status.value = 'error'
      errorMessage.value = friendlyError
      showNotification(`Save failed: ${friendlyError}`, 'error')
      return false
    }
  }

  /**
   * Save the active tab with a "Save As" dialog (always prompts for location).
   * Also used for first-time saves of untitled files.
   */
  async function saveActiveTabAs(): Promise<boolean> {
    const tabsStore = useTabsStore()
    const tab = tabsStore.activeTab
    if (!tab) return false

    const content = getTabMarkdown(tab.id)
    if (content === null) return false

    const defaultName = tab.isUntitled ? `${tab.title}.md` : tab.title

    status.value = 'saving'
    errorMessage.value = null

    try {
      const filePath = await promptForSaveLocation(defaultName)
      if (!filePath) {
        // User cancelled the dialog
        status.value = tab.isModified ? 'unsaved' : 'saved'
        return false
      }

      await writeFileToDisk(filePath, content)

      // Update tab: set file path, mark as saved
      tabsStore.setFilePath(tab.id, filePath)
      tabsStore.setModified(tab.id, false)
      status.value = 'saved'
      lastSavedAt.value = new Date()
      return true
    } catch (err) {
      console.error('Save As failed:', err)
      const friendlyError = formatWriteError(err)
      status.value = 'error'
      errorMessage.value = friendlyError
      showNotification(`Save failed: ${friendlyError}`, 'error')
      return false
    }
  }

  /**
   * Save a specific tab by ID. Used for auto-save of non-active tabs.
   */
  async function saveTab(tabId: string): Promise<boolean> {
    const tabsStore = useTabsStore()
    const tab = tabsStore.tabs.find((t) => t.id === tabId)
    if (!tab || !tab.filePath || tab.isUntitled || !tab.isModified) return false

    const content = getTabMarkdown(tabId)
    if (content === null) return false

    try {
      await writeFileToDisk(tab.filePath, content)
      tabsStore.setModified(tabId, false)
      return true
    } catch (err) {
      console.error(`Auto-save failed for ${tab.title}:`, err)
      return false
    }
  }

  /**
   * Trigger a debounced auto-save for the active tab.
   * Resets the timer on each call so rapid edits don't cause excessive saves.
   */
  function scheduleAutoSave(): void {
    const tabsStore = useTabsStore()
    const tab = tabsStore.activeTab

    // Only auto-save files that have a path on disk
    if (!tab || !tab.filePath || tab.isUntitled) {
      if (tab?.isModified) {
        status.value = 'unsaved'
      }
      return
    }

    status.value = 'unsaved'

    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
    }

    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null
      saveActiveTab()
    }, AUTO_SAVE_DELAY_MS)
  }

  /**
   * Immediately save the active tab (e.g., on Cmd+S).
   * For untitled files, prompts for save location.
   */
  async function saveNow(): Promise<boolean> {
    // Cancel any pending auto-save
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }

    return saveActiveTab()
  }

  /**
   * Cancel pending auto-save timer (e.g., when switching tabs).
   */
  function cancelPending(): void {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
    }
  }

  /**
   * Update status based on the active tab's state.
   * Called when switching tabs or after external state changes.
   */
  function syncStatus(): void {
    const tabsStore = useTabsStore()
    const tab = tabsStore.activeTab

    if (!tab) {
      status.value = 'saved'
      return
    }

    if (tab.isModified) {
      status.value = 'unsaved'
    } else {
      status.value = 'saved'
    }
  }

  /**
   * Check all open tabs for external file changes.
   * If a file is modified without local changes, silently reload.
   * If a file is modified with local changes, show conflict dialog.
   */
  async function checkForExternalChanges() {
    const tabsStore = useTabsStore()

    for (const tab of tabsStore.tabs) {
      if (!tab.filePath || tab.isUntitled) continue
      if (conflictDialog.value) break // Don't check while a conflict is being shown

      const knownModTime = knownModifiedTimes.value[tab.filePath]
      if (!knownModTime) continue

      try {
        const currentModTime = await invoke<number>('get_file_modified_time', {
          path: tab.filePath,
        })
        if (currentModTime > knownModTime) {
          if (tab.isModified) {
            // Conflict: local unsaved changes + external modification
            const diskContent = await invoke<string>('read_file', { path: tab.filePath })
            conflictDialog.value = { tabId: tab.id, filePath: tab.filePath, diskContent }
            // Wait for resolution before checking more files
            await new Promise<void>((resolve) => {
              const check = setInterval(() => {
                if (!conflictDialog.value) {
                  clearInterval(check)
                  resolve()
                }
              }, 200)
            })
          } else {
            // No local changes — silently reload from disk and push to live editor
            try {
              const diskContent = await invoke<string>('read_file', { path: tab.filePath })
              tab.editorState.markdown = diskContent
              tab.editorState.doc = null
              knownModifiedTimes.value[tab.filePath] = currentModTime
              // Push new content into the live running editor (if this tab is active)
              window.dispatchEvent(
                new CustomEvent('gdown:file-reloaded', {
                  detail: { tabId: tab.id, markdown: diskContent },
                }),
              )
              showNotification(`↻ ${tab.title} updated`, 'warning')
            } catch {
              // File may have been deleted
            }
          }
        }
      } catch {
        // File may no longer exist — ignore
      }
    }
  }

  /**
   * Start periodic conflict detection.
   */
  function startConflictDetection() {
    if (conflictCheckInterval) return
    conflictCheckInterval = setInterval(checkForExternalChanges, CONFLICT_CHECK_INTERVAL_MS)
  }

  /**
   * Stop periodic conflict detection.
   */
  function stopConflictDetection() {
    if (conflictCheckInterval) {
      clearInterval(conflictCheckInterval)
      conflictCheckInterval = null
    }
  }

  /**
   * Cleanup all timers. Call on app unmount.
   */
  function cleanup() {
    cancelPending()
    stopConflictDetection()
  }

  return {
    status,
    lastSavedAt,
    errorMessage,
    conflictDialog,
    saveNotification,
    knownModifiedTimes,
    statusText,
    statusIcon,
    scheduleAutoSave,
    saveNow,
    saveActiveTabAs,
    saveTab,
    cancelPending,
    syncStatus,
    resolveConflict,
    trackFileModifiedTime,
    untrackFile,
    startConflictDetection,
    stopConflictDetection,
    cleanup,
  }
})
