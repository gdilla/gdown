import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { Tab, EditorState } from '../types/tab'
import { createDefaultEditorState } from '../types/tab'
import { parseFrontMatter } from '../utils/frontmatter'

export type CloseDecision = 'save' | 'discard' | 'cancel'
export type CloseDecisionHandler = (tab: Tab) => Promise<CloseDecision>

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
  let closeDecisionHandler: CloseDecisionHandler | null = null
  const pendingCloseOperations = new Map<string, Promise<boolean>>()

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
      contentRevision: 0,
      editorState: createDefaultEditorState(content),
    }

    tabs.value.push(tab)
    activeTabId.value = tab.id
    return tab
  }

  /**
   * Close a tab. If active, switch to the nearest neighbour.
   */
  function closeTab(tabId: string): Promise<boolean> {
    const pending = pendingCloseOperations.get(tabId)
    if (pending) return pending

    const operation = closeTabInternal(tabId)
    pendingCloseOperations.set(tabId, operation)
    void operation.then(
      () => {
        if (pendingCloseOperations.get(tabId) === operation) pendingCloseOperations.delete(tabId)
      },
      () => {
        if (pendingCloseOperations.get(tabId) === operation) pendingCloseOperations.delete(tabId)
      },
    )
    return operation
  }

  async function closeTabInternal(tabId: string): Promise<boolean> {
    const index = tabs.value.findIndex((t) => t.id === tabId)
    if (index === -1) return false

    if (!(await resolveDirtyTab(tabId))) return false

    removeTab(tabId)
    return true
  }

  /** Resolve one dirty tab without removing it, for native app quit. */
  async function resolveDirtyTab(
    tabId: string,
    clearDiscardedUntitled = false,
    deferredDiscards?: Set<string>,
  ): Promise<boolean> {
    const { useAutoSaveStore } = await import('./autoSave')
    const autoSaveStore = useAutoSaveStore()
    // Native Save As and regular writes can both be waiting on IPC or a
    // dialog. Never remove a tab while either operation can still mutate it.
    await autoSaveStore.waitForTabSave(tabId)

    const tab = tabs.value.find((candidate) => candidate.id === tabId)
    if (!tab || !tab.isModified) return true

    const decision = closeDecisionHandler ? await closeDecisionHandler(tab) : 'cancel'
    if (decision === 'cancel') return false

    if (decision === 'save') {
      if (!(await autoSaveStore.saveTab(tabId))) return false
      const savedTab = tabs.value.find((candidate) => candidate.id === tabId)
      return savedTab !== undefined && !savedTab.isModified
    }

    // A timer may have fired while the prompt was open. Wait again before
    // applying or deferring discard so no write can finish after the decision.
    await autoSaveStore.waitForTabSave(tabId)

    if (deferredDiscards) {
      // Keep the live recovery snapshot intact until every quit decision has
      // succeeded. Cancel only its pending timer; a later cancel can restore
      // the timer without losing the user's draft.
      autoSaveStore.cancelPending(tabId)
      deferredDiscards.add(tabId)
      return true
    }

    discardTab(tabId, clearDiscardedUntitled, autoSaveStore)
    return true
  }

  function discardTab(
    tabId: string,
    clearDiscardedUntitled: boolean,
    autoSaveStore: { cancelTab: (tabId: string) => void },
  ): void {
    const tab = tabs.value.find((candidate) => candidate.id === tabId)
    if (!tab) return
    // A write already in flight cannot be cancelled at the IPC boundary.
    // resolveDirtyTab waits for it before reaching this helper.
    autoSaveStore.cancelTab(tabId)
    if (clearDiscardedUntitled && tab.isUntitled) {
      saveEditorState(tabId, {
        markdown: '',
        doc: null,
        frontmatter: null,
        frontmatterAttributes: {},
      })
    }
    setModified(tabId, false)
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
      const contentChanged =
        (state.markdown !== undefined && state.markdown !== tab.editorState.markdown) ||
        (state.frontmatter !== undefined && state.frontmatter !== tab.editorState.frontmatter) ||
        (state.frontmatterAttributes !== undefined &&
          JSON.stringify(state.frontmatterAttributes) !==
            JSON.stringify(tab.editorState.frontmatterAttributes))
      tab.editorState = { ...tab.editorState, ...state }
      if (contentChanged) tab.contentRevision += 1
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
    }
  }

  /** Register the UI's Save / Don't Save / Cancel prompt for dirty closes. */
  function setCloseDecisionHandler(handler: CloseDecisionHandler | null): void {
    closeDecisionHandler = handler
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
  function closeOtherTabs(tabId: string): Promise<boolean> {
    const ids = tabs.value.filter((tab) => tab.id !== tabId).map((tab) => tab.id)
    return closeTabsInOrder(ids).then((closed) => {
      if (closed && tabs.value.some((tab) => tab.id === tabId)) activeTabId.value = tabId
      return closed
    })
  }

  /**
   * Close all tabs to the right of the specified tab.
   */
  function closeTabsToRight(tabId: string): Promise<boolean> {
    const index = tabs.value.findIndex((t) => t.id === tabId)
    if (index === -1) return Promise.resolve(false)
    const ids = tabs.value.slice(index + 1).map((tab) => tab.id)
    return closeTabsInOrder(ids).then((closed) => {
      // If active tab was among the closed ones, switch to this tab.
      if (closed && !tabs.value.some((t) => t.id === activeTabId.value)) {
        activeTabId.value = tabId
      }
      return closed
    })
  }

  /**
   * Close all tabs.
   */
  function closeAllTabs(): Promise<boolean> {
    return closeTabsInOrder(tabs.value.map((tab) => tab.id)).then((closed) => {
      if (closed) activeTabId.value = null
      return closed
    })
  }

  /** Resolve dirty tabs before app quit while keeping the session tabs intact. */
  async function prepareCloseAll(): Promise<boolean> {
    const deferredDiscards = new Set<string>()
    const { useAutoSaveStore } = await import('./autoSave')
    const autoSaveStore = useAutoSaveStore()
    const restoreDeferredTimers = () => {
      // Restore autosave timers when a later decision cancels quit. The
      // draft itself was never mutated, so the tab remains editable.
      for (const deferredTabId of deferredDiscards) {
        const deferredTab = tabs.value.find((candidate) => candidate.id === deferredTabId)
        if (deferredTab?.isModified) autoSaveStore.scheduleAutoSave(deferredTabId)
      }
    }

    try {
      for (const tab of [...tabs.value]) {
        if (!(await resolveDirtyTab(tab.id, true, deferredDiscards))) {
          restoreDeferredTimers()
          return false
        }
      }

      for (const tabId of deferredDiscards) {
        discardTab(tabId, true, autoSaveStore)
      }
      return true
    } catch (error) {
      restoreDeferredTimers()
      throw error
    }
  }

  /** Run close decisions in order so bulk closes can stop at the first cancel. */
  function closeTabsInOrder(tabIds: string[], index = 0): Promise<boolean> {
    if (index >= tabIds.length) return Promise.resolve(true)
    const tabId = tabIds[index]!
    const tab = tabs.value.find((candidate) => candidate.id === tabId)
    if (!tab) return closeTabsInOrder(tabIds, index + 1)
    return closeTab(tabId).then((closed) =>
      closed ? closeTabsInOrder(tabIds, index + 1) : Promise.resolve(false),
    )
  }

  /** Remove a tab after all save/discard work has completed. */
  function removeTab(tabId: string): void {
    const index = tabs.value.findIndex((t) => t.id === tabId)
    if (index === -1) return

    const closingTab = tabs.value[index]!
    if (closingTab.filePath) {
      import('./autoSave')
        .then(({ useAutoSaveStore }) => {
          useAutoSaveStore().untrackFile(closingTab.filePath!)
        })
        .catch(() => {})
    }

    const wasActive = activeTabId.value === tabId
    tabs.value.splice(index, 1)
    if (wasActive) {
      activeTabId.value = tabs.value.length
        ? tabs.value[Math.min(index, tabs.value.length - 1)]!.id
        : null
    }
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

      // Another open request may have completed while the disk read was in
      // flight. Never replace that tab's current state with the older read.
      const existingAfterRead = tabs.value.find((t) => t.filePath === filePath)
      if (existingAfterRead) {
        activeTabId.value = existingAfterRead.id
        return existingAfterRead
      }

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
      contentRevision: 0,
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
    setCloseDecisionHandler,
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
    prepareCloseAll,
    nextTab,
    previousTab,
    openFile,
    openImageFile,
    openFileDialog,
  }
})
