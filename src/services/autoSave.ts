/**
 * Debounced auto-save service for gdown.
 *
 * Watches for document changes in the active tab and writes to disk
 * after a configurable delay of inactivity (default: 2 seconds).
 *
 * Features:
 * - Configurable debounce delay
 * - Only saves tabs that have a file path on disk (skips untitled tabs)
 * - Only saves tabs marked as modified
 * - Converts TipTap JSON/HTML → Markdown before writing
 * - Emits events for status bar feedback
 * - Can be enabled/disabled at runtime
 * - Handles concurrent tab switches gracefully
 */

import { invoke } from '@tauri-apps/api/core'
import { watch, ref, type Ref } from 'vue'
import { useTabsStore } from '../stores/tabs'
import { htmlToMarkdown } from '../utils/markdownConverter'
import { assembleFrontMatter } from '../utils/frontmatter'
import type { Tab } from '../types/tab'

export interface AutoSaveConfig {
  /** Debounce delay in milliseconds (default: 2000) */
  delay: number
  /** Whether auto-save is enabled (default: true) */
  enabled: boolean
}

export interface AutoSaveService {
  /** Whether auto-save is currently enabled */
  enabled: Ref<boolean>
  /** Current debounce delay in ms */
  delay: Ref<number>
  /** Whether a save is currently in progress */
  isSaving: Ref<boolean>
  /** Last auto-save error message (null if none) */
  lastError: Ref<string | null>
  /** Timestamp of last successful auto-save */
  lastSavedAt: Ref<number | null>
  /** Enable auto-save */
  enable: () => void
  /** Disable auto-save */
  disable: () => void
  /** Update debounce delay */
  setDelay: (ms: number) => void
  /** Trigger an immediate save of the active tab (bypasses debounce) */
  saveNow: () => Promise<void>
  /** Schedule a debounced save for a specific tab */
  scheduleSave: (tabId: string) => void
  /** Cancel any pending debounced save */
  cancelPending: () => void
  /** Clean up watchers and timers */
  dispose: () => void
}

/**
 * Serialize a tab's editor content to the full file content string.
 *
 * Produces body markdown from the editor, then reassembles with any
 * stored YAML front-matter so the saved file is complete.
 *
 * Tries TipTap JSON → HTML → Markdown first, falls back to raw markdown field.
 */
function serializeTabToMarkdown(tab: Tab, editorInstance?: { getHTML: () => string } | null): string {
  let body = ''

  // If we have a live editor instance, use its HTML output for best fidelity
  if (editorInstance) {
    try {
      const html = editorInstance.getHTML()
      if (html && html !== '<p></p>') {
        body = htmlToMarkdown(html)
      }
    } catch {
      // Fall through to other methods
    }
  }

  // Fall back to the stored markdown in editor state
  if (!body && tab.editorState.markdown) {
    body = tab.editorState.markdown
  }

  // Reassemble with front-matter if present
  return assembleFrontMatter(tab.editorState.frontmatter, body)
}

/**
 * Create and initialize the auto-save service.
 * Call this in a Vue component's setup() or in the app initialization.
 *
 * @param getEditor - Optional getter function that returns the current TipTap editor instance
 * @param config - Optional configuration overrides
 */
export function useAutoSave(
  getEditor?: () => { getHTML: () => string } | null | undefined,
  config?: Partial<AutoSaveConfig>
): AutoSaveService {
  const tabsStore = useTabsStore()

  // Reactive config
  const enabled = ref(config?.enabled ?? true)
  const delay = ref(config?.delay ?? 2000)

  // State
  const isSaving = ref(false)
  const lastError = ref<string | null>(null)
  const lastSavedAt = ref<number | null>(null)

  // Debounce timer handle
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  // Track which tab the pending save is for
  let pendingTabId: string | null = null

  // Watcher stop handles for cleanup
  const stopHandles: Array<() => void> = []

  /**
   * Cancel any pending debounced save.
   */
  function cancelPending(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    pendingTabId = null
  }

  /**
   * Perform the actual save operation for a given tab.
   */
  async function performSave(tab: Tab): Promise<void> {
    if (!tab.filePath || tab.isUntitled) {
      // Can't auto-save a file that has no path on disk
      return
    }

    if (!tab.isModified) {
      // No changes to save
      return
    }

    isSaving.value = true
    lastError.value = null

    try {
      const editorInstance = getEditor?.() ?? null
      // Only use the live editor if this tab is currently active
      const isActiveTab = tabsStore.activeTabId === tab.id
      const content = serializeTabToMarkdown(tab, isActiveTab ? editorInstance : null)

      await invoke('write_file', {
        path: tab.filePath,
        content,
      })

      // Mark the tab as clean after successful save
      tabsStore.setModified(tab.id, false)

      // Update the stored markdown to match what's on disk
      tabsStore.saveEditorState(tab.id, { markdown: content })

      lastSavedAt.value = Date.now()

      // Emit a custom event for status bar or other UI to pick up
      window.dispatchEvent(
        new CustomEvent('gdown:auto-saved', {
          detail: { tabId: tab.id, filePath: tab.filePath, timestamp: lastSavedAt.value },
        })
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      lastError.value = message
      console.error(`[auto-save] Failed to save '${tab.filePath}':`, message)

      window.dispatchEvent(
        new CustomEvent('gdown:auto-save-error', {
          detail: { tabId: tab.id, filePath: tab.filePath, error: message },
        })
      )
    } finally {
      isSaving.value = false
    }
  }

  /**
   * Schedule a debounced save for a specific tab.
   * Resets the timer if called again before the delay expires.
   */
  function scheduleSave(tabId: string): void {
    if (!enabled.value) return

    // Cancel any existing pending save
    cancelPending()

    pendingTabId = tabId

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      const tid = pendingTabId
      pendingTabId = null

      if (!tid) return

      const tab = tabsStore.tabs.find(t => t.id === tid)
      if (tab) {
        performSave(tab)
      }
    }, delay.value)
  }

  /**
   * Immediately save the active tab (bypasses debounce).
   * Useful for Cmd+S or before-close scenarios.
   */
  async function saveNow(): Promise<void> {
    cancelPending()

    const tab = tabsStore.activeTab
    if (tab) {
      await performSave(tab)
    }
  }

  function enable(): void {
    enabled.value = true
  }

  function disable(): void {
    enabled.value = false
    cancelPending()
  }

  function setDelay(ms: number): void {
    delay.value = Math.max(500, ms) // Minimum 500ms to avoid excessive writes
  }

  // ── Watchers ──────────────────────────────────────────

  // Watch for tab modifications — when a tab becomes modified, schedule auto-save
  const stopTabsWatcher = watch(
    () => {
      const tab = tabsStore.activeTab
      if (!tab) return null
      // Return a composite key that changes when the tab's content is modified
      return { tabId: tab.id, isModified: tab.isModified, doc: tab.editorState.doc }
    },
    (newVal, _oldVal) => {
      if (!newVal || !enabled.value) return

      // Only schedule if the tab is modified and has a file path
      if (newVal.isModified) {
        const tab = tabsStore.activeTab
        if (tab && tab.filePath && !tab.isUntitled) {
          scheduleSave(newVal.tabId)
        }
      }
    },
    { deep: true }
  )
  stopHandles.push(stopTabsWatcher)

  // Cancel pending saves when switching tabs (the outgoing tab state is captured by Editor.vue)
  const stopActiveTabWatcher = watch(
    () => tabsStore.activeTabId,
    (newId, oldId) => {
      if (newId !== oldId) {
        // If there was a pending save for the old tab, execute it immediately
        if (pendingTabId && pendingTabId === oldId) {
          cancelPending()
          const oldTab = tabsStore.tabs.find(t => t.id === oldId)
          if (oldTab && oldTab.filePath && !oldTab.isUntitled && oldTab.isModified) {
            performSave(oldTab)
          }
        }
      }
    }
  )
  stopHandles.push(stopActiveTabWatcher)

  /**
   * Clean up all watchers and timers.
   */
  function dispose(): void {
    cancelPending()
    stopHandles.forEach(stop => stop())
    stopHandles.length = 0
  }

  return {
    enabled,
    delay,
    isSaving,
    lastError,
    lastSavedAt,
    enable,
    disable,
    setDelay,
    saveNow,
    scheduleSave,
    cancelPending,
    dispose,
  }
}
