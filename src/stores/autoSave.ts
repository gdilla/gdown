import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { usePreferencesStore } from './preferences'
import { useTabsStore } from './tabs'
import { parseFrontMatter, assembleFrontMatter } from '../utils/frontmatter'
import { flushLiveEditorState } from '../utils/flushEditorState'
import type { Tab } from '../types/tab'

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

const DEFAULT_AUTO_SAVE_DELAY_MS = 1500
const CONFLICT_CHECK_INTERVAL_MS = 1500

export interface ConflictInfo {
  tabId: string
  filePath: string
  diskContent: string
  modifiedTime: number
}

/** The one full-file serialization contract used by every disk write. */
export function serializeTabToFile(tab: Tab): string {
  return assembleFrontMatter(tab.editorState.frontmatter, tab.editorState.markdown ?? '')
}

function parseDiskContent(content: string) {
  const { rawYaml, attributes, body, hasFrontMatter } = parseFrontMatter(content)
  return {
    markdown: body,
    frontmatter: hasFrontMatter ? rawYaml : null,
    frontmatterAttributes: hasFrontMatter ? attributes : {},
  }
}

export const useAutoSaveStore = defineStore('autoSave', () => {
  const tabsStore = useTabsStore()
  const preferencesStore = usePreferencesStore()

  const status = ref<SaveStatus>('saved')
  const lastSavedAt = ref<Date | null>(null)
  const errorMessage = ref<string | null>(null)
  const conflictDialog = ref<ConflictInfo | null>(null)
  const saveNotification = ref<{ message: string; type: 'success' | 'error' | 'warning' } | null>(
    null,
  )
  const knownModifiedTimes = ref<Record<string, number>>({})

  const autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const inFlightSaves = new Map<string, Promise<boolean>>()
  const queuedSaves = new Set<string>()
  const recoveryTabsNeedingConflict = new Set<string>()
  const externalConflictTabs = new Set<string>()
  let saveLane: Promise<void> = Promise.resolve()
  let conflictCheckInterval: ReturnType<typeof setInterval> | null = null
  let conflictCheckPromise: Promise<void> | null = null
  let conflictResolver: ((action: 'overwrite' | 'cancel') => void) | null = null

  const statusText = computed(() => {
    switch (status.value) {
      case 'saved':
        return 'Saved'
      case 'unsaved':
        return 'Unsaved changes'
      case 'saving':
        return 'Saving...'
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
      default:
        return '✕'
    }
  })

  function setActiveStatus(next: SaveStatus, tabId: string): void {
    if (tabsStore.activeTabId === tabId) status.value = next
  }

  /** Serialize writes so the single conflict dialog always has one owner. */
  function enqueueSave<T>(operation: () => Promise<T>): Promise<T> {
    const queued = saveLane.then(operation, operation)
    saveLane = queued.then(
      () => undefined,
      () => undefined,
    )
    return queued
  }

  function getTabMarkdown(tabId: string): string | null {
    const tab = tabsStore.tabs.find((candidate) => candidate.id === tabId)
    return tab?.editorState.markdown ?? null
  }

  function formatWriteError(err: unknown): string {
    const message = typeof err === 'string' ? err : err instanceof Error ? err.message : String(err)

    if (/permission denied|permission/i.test(message)) {
      return 'Permission denied. The file or directory may be read-only.'
    }
    if (/no space left|disk full/i.test(message)) {
      return 'Disk is full. Free up space and try again.'
    }
    if (/no such file or directory|does not exist/i.test(message)) {
      return 'The file path is invalid or the directory no longer exists.'
    }
    if (/read-only file system/i.test(message)) return 'The file system is read-only.'
    return message
  }

  function showNotification(message: string, type: 'success' | 'error' | 'warning'): void {
    saveNotification.value = { message, type }
    setTimeout(
      () => {
        if (saveNotification.value?.message === message) saveNotification.value = null
      },
      type === 'error' ? 5000 : 3000,
    )
  }

  async function promptForSaveLocation(defaultName: string): Promise<string | null> {
    try {
      return await invoke<string | null>('save_file_dialog', {
        defaultName: defaultName || 'Untitled.md',
      })
    } catch (err) {
      console.error('Save dialog error:', err)
      return null
    }
  }

  async function trackFileModifiedTime(filePath: string): Promise<void> {
    try {
      knownModifiedTimes.value[filePath] = await invoke<number>('get_file_modified_time', {
        path: filePath,
      })
    } catch {
      // New or temporarily unavailable files have no conflict baseline yet.
    }
  }

  function untrackFile(filePath: string): void {
    delete knownModifiedTimes.value[filePath]
  }

  /** Mark a recovered dirty file for an explicit disk conflict decision. */
  function markRecoveryTab(tabId: string): void {
    recoveryTabsNeedingConflict.add(tabId)
  }

  function applyDiskContent(tabId: string, content: string): void {
    const tab = tabsStore.tabs.find((candidate) => candidate.id === tabId)
    if (!tab) return
    tabsStore.saveEditorState(tabId, { ...parseDiskContent(content), doc: null })
    tabsStore.setModified(tabId, false)
  }

  async function checkConflictBeforeSave(
    filePath: string,
    tabId: string,
  ): Promise<'overwrite' | 'cancel'> {
    const needsRecoveryConflict = recoveryTabsNeedingConflict.has(tabId)
    const knownModTime = knownModifiedTimes.value[filePath]
    try {
      const currentModTime = await invoke<number>('get_file_modified_time', { path: filePath })
      if (
        !needsRecoveryConflict &&
        (knownModTime === undefined || currentModTime <= knownModTime)
      ) {
        return 'overwrite'
      }

      const diskContent = await invoke<string>('read_file', { path: filePath })
      conflictDialog.value = { tabId, filePath, diskContent, modifiedTime: currentModTime }
      return await new Promise<'overwrite' | 'cancel'>((resolve) => {
        conflictResolver = resolve
      })
    } catch {
      // A recovered document has no trusted baseline. Refuse a blind write if
      // metadata or disk content cannot be read; the user can use Save As.
      if (needsRecoveryConflict || knownModTime !== undefined) {
        showNotification(
          `Could not verify ${filePath}; use Save As to choose a destination.`,
          'warning',
        )
        return 'cancel'
      }
      // A never-tracked file may be newly created, so a normal write can
      // recreate it intentionally.
      return 'overwrite'
    }
  }

  function resolveConflict(action: 'overwrite' | 'reload' | 'cancel'): void {
    const conflict = conflictDialog.value
    if (!conflict) return

    if (action === 'reload') {
      applyDiskContent(conflict.tabId, conflict.diskContent)
      knownModifiedTimes.value[conflict.filePath] = conflict.modifiedTime
      externalConflictTabs.delete(conflict.tabId)
      recoveryTabsNeedingConflict.delete(conflict.tabId)
      conflictDialog.value = null
      conflictResolver?.('cancel')
      conflictResolver = null
      setActiveStatus('saved', conflict.tabId)
      showNotification(
        `↻ Reloaded ${tabsStore.tabs.find((tab) => tab.id === conflict.tabId)?.title ?? 'file'} from disk`,
        'warning',
      )
      window.dispatchEvent(
        new CustomEvent('gdown:file-reloaded', {
          detail: {
            tabId: conflict.tabId,
            markdown: parseDiskContent(conflict.diskContent).markdown,
          },
        }),
      )
      return
    }

    const wasExternalConflict = externalConflictTabs.delete(conflict.tabId)
    if (action === 'overwrite' && wasExternalConflict) {
      // The scan has already shown this exact disk revision to the user. Use
      // it as the new baseline, then the scan lane writes the local snapshot.
      knownModifiedTimes.value[conflict.filePath] = conflict.modifiedTime
    }
    conflictDialog.value = null
    conflictResolver?.(action === 'overwrite' ? 'overwrite' : 'cancel')
    conflictResolver = null
    if (action === 'cancel') setActiveStatus('unsaved', conflict.tabId)
  }

  async function writeFileToDisk(filePath: string, content: string): Promise<void> {
    await invoke('write_file', { path: filePath, content })
    await trackFileModifiedTime(filePath)
  }

  async function performSave(tabId: string): Promise<boolean> {
    // The save may have waited behind another file's conflict dialog. Flush
    // again at the actual write boundary so its revision and markdown agree.
    flushLiveEditorState()
    const tab = tabsStore.tabs.find((candidate) => candidate.id === tabId)
    if (!tab || !tab.filePath || tab.isUntitled) return false
    const filePath = tab.filePath
    if (!tab.isModified) {
      setActiveStatus('saved', tabId)
      return true
    }

    const revision = tab.contentRevision
    const content = serializeTabToFile(tab)
    setActiveStatus('saving', tabId)
    if (tabsStore.activeTabId === tabId) errorMessage.value = null

    try {
      if ((await checkConflictBeforeSave(filePath, tabId)) === 'cancel') {
        const current = tabsStore.tabs.find((candidate) => candidate.id === tabId)
        setActiveStatus(current?.isModified ? 'unsaved' : 'saved', tabId)
        return false
      }

      await writeFileToDisk(filePath, content)
      const current = tabsStore.tabs.find((candidate) => candidate.id === tabId)
      const unchanged =
        current !== undefined &&
        current.contentRevision === revision &&
        serializeTabToFile(current) === content

      if (unchanged) {
        tabsStore.setModified(tabId, false)
        recoveryTabsNeedingConflict.delete(tabId)
        lastSavedAt.value = new Date()
        setActiveStatus('saved', tabId)
        window.dispatchEvent(
          new CustomEvent('gdown:auto-saved', {
            detail: { tabId, filePath, timestamp: lastSavedAt.value.getTime() },
          }),
        )
        return true
      }

      // The write is valid for its captured revision; a newer edit remains dirty.
      setActiveStatus('unsaved', tabId)
      if (preferencesStore.autoSaveEnabled) scheduleAutoSave(tabId)
      return false
    } catch (err) {
      const message = formatWriteError(err)
      errorMessage.value = message
      setActiveStatus('error', tabId)
      console.error(`Save failed for '${filePath}':`, message)
      showNotification(`Save failed: ${message}`, 'error')
      window.dispatchEvent(
        new CustomEvent('gdown:auto-save-error', {
          detail: { tabId, filePath, error: message },
        }),
      )
      return false
    }
  }

  async function saveTabAs(tabId: string): Promise<boolean> {
    const existing = inFlightSaves.get(tabId)
    // Save As owns a native dialog. A second request while it is open waits
    // for the same operation instead of opening a competing dialog.
    if (existing) return existing

    const operation = enqueueSave(async (): Promise<boolean> => {
      cancelPending(tabId)
      const tab = tabsStore.tabs.find((candidate) => candidate.id === tabId)
      if (!tab) return false

      const defaultName = tab.isUntitled ? `${tab.title}.md` : tab.title
      setActiveStatus('saving', tabId)
      if (tabsStore.activeTabId === tabId) errorMessage.value = null

      const filePath = await promptForSaveLocation(defaultName)
      if (!filePath) {
        setActiveStatus(tab.isModified ? 'unsaved' : 'saved', tabId)
        return false
      }

      // Capture after the dialog: edits made while choosing a path must be saved.
      flushLiveEditorState()
      const currentBeforeWrite = tabsStore.tabs.find((candidate) => candidate.id === tabId)
      if (!currentBeforeWrite) return false
      const revision = currentBeforeWrite.contentRevision
      const content = serializeTabToFile(currentBeforeWrite)
      try {
        await writeFileToDisk(filePath, content)
        const current = tabsStore.tabs.find((candidate) => candidate.id === tabId)
        const unchanged =
          current !== undefined &&
          current.contentRevision === revision &&
          serializeTabToFile(current) === content
        tabsStore.setFilePath(tabId, filePath)
        tabsStore.setModified(tabId, !unchanged)
        if (unchanged) {
          recoveryTabsNeedingConflict.delete(tabId)
          lastSavedAt.value = new Date()
          setActiveStatus('saved', tabId)
          return true
        }
        setActiveStatus('unsaved', tabId)
        if (preferencesStore.autoSaveEnabled) scheduleAutoSave(tabId)
        return false
      } catch (err) {
        const message = formatWriteError(err)
        errorMessage.value = message
        setActiveStatus('error', tabId)
        showNotification(`Save failed: ${message}`, 'error')
        return false
      }
    })

    inFlightSaves.set(tabId, operation)
    try {
      return await operation
    } finally {
      if (inFlightSaves.get(tabId) === operation) inFlightSaves.delete(tabId)
    }
  }

  async function saveTab(tabId: string): Promise<boolean> {
    flushLiveEditorState()
    const existing = inFlightSaves.get(tabId)
    if (existing) {
      queuedSaves.add(tabId)
      const result = await existing
      if (queuedSaves.delete(tabId)) return saveTab(tabId)
      return result
    }

    const tab = tabsStore.tabs.find((candidate) => candidate.id === tabId)
    if (!tab) return false
    if (!tab.filePath || tab.isUntitled) return saveTabAs(tabId)
    if (!tab.isModified) {
      setActiveStatus('saved', tabId)
      return true
    }

    cancelPending(tabId)
    const operation = enqueueSave(() => performSave(tabId))
    inFlightSaves.set(tabId, operation)
    try {
      return await operation
    } finally {
      if (inFlightSaves.get(tabId) === operation) inFlightSaves.delete(tabId)
    }
  }

  async function saveActiveTab(): Promise<boolean> {
    const tab = tabsStore.activeTab
    return tab ? saveTab(tab.id) : false
  }

  async function saveActiveTabAs(): Promise<boolean> {
    const tab = tabsStore.activeTab
    return tab ? saveTabAs(tab.id) : false
  }

  function scheduleAutoSave(tabId = tabsStore.activeTabId ?? ''): void {
    if (!tabId || !preferencesStore.autoSaveEnabled) return
    const tab = tabsStore.tabs.find((candidate) => candidate.id === tabId)
    if (!tab) return
    setActiveStatus('unsaved', tabId)
    cancelPending(tabId)
    if (!tab.filePath || tab.isUntitled || !tab.isModified) return

    const delay = Math.max(500, preferencesStore.autoSaveIntervalMs || DEFAULT_AUTO_SAVE_DELAY_MS)
    autoSaveTimers.set(
      tabId,
      setTimeout(() => {
        autoSaveTimers.delete(tabId)
        void saveTab(tabId)
      }, delay),
    )
  }

  async function saveNow(): Promise<boolean> {
    const tabId = tabsStore.activeTabId
    if (!tabId) return false
    cancelPending(tabId)
    return saveActiveTab()
  }

  function cancelPending(tabId?: string): void {
    if (tabId) {
      const timer = autoSaveTimers.get(tabId)
      if (timer) clearTimeout(timer)
      autoSaveTimers.delete(tabId)
      return
    }
    for (const timer of autoSaveTimers.values()) clearTimeout(timer)
    autoSaveTimers.clear()
  }

  function cancelTab(tabId: string): void {
    cancelPending(tabId)
    queuedSaves.delete(tabId)
    recoveryTabsNeedingConflict.delete(tabId)
  }

  async function waitForTabSave(tabId: string): Promise<boolean> {
    while (true) {
      const operation = inFlightSaves.get(tabId)
      if (!operation) return true
      try {
        await operation
      } catch {
        return false
      }
    }
  }

  async function waitForAllSaves(): Promise<void> {
    while (inFlightSaves.size > 0) {
      await Promise.all(
        [...inFlightSaves.values()].map((operation) => operation.then(() => undefined)),
      )
    }
  }

  function syncStatus(): void {
    const tab = tabsStore.activeTab
    status.value = tab?.isModified ? 'unsaved' : 'saved'
  }

  async function scanExternalChanges(): Promise<void> {
    for (const tab of [...tabsStore.tabs]) {
      if (!tab.filePath || tab.isUntitled) continue
      const filePath = tab.filePath
      const knownModTime = knownModifiedTimes.value[filePath]
      if (!knownModTime) continue
      if (conflictDialog.value) break
      // Do not mistake our own in-flight write for an external edit.
      if (inFlightSaves.has(tab.id)) continue

      const observedRevision = tab.contentRevision

      try {
        const currentModTime = await invoke<number>('get_file_modified_time', {
          path: filePath,
        })
        if (currentModTime <= knownModTime) continue

        const diskContent = await invoke<string>('read_file', { path: filePath })
        const currentTab = tabsStore.tabs.find((candidate) => candidate.id === tab.id)
        if (!currentTab || currentTab.filePath !== filePath || inFlightSaves.has(tab.id)) continue

        if (currentTab.isModified || currentTab.contentRevision !== observedRevision) {
          externalConflictTabs.add(currentTab.id)
          conflictDialog.value = {
            tabId: currentTab.id,
            filePath,
            diskContent,
            modifiedTime: currentModTime,
          }
          const decision = await new Promise<'overwrite' | 'cancel'>((resolve) => {
            conflictResolver = resolve
          })
          if (decision === 'overwrite') {
            const latest = tabsStore.tabs.find((candidate) => candidate.id === currentTab.id)
            if (latest?.filePath === filePath && latest.isModified) {
              // Register the write before this scan lane returns so close
              // waits cannot remove the tab while the approved write runs.
              void saveTab(latest.id)
            }
          }
        } else {
          applyDiskContent(currentTab.id, diskContent)
          knownModifiedTimes.value[filePath] = currentModTime
          const markdown = parseDiskContent(diskContent).markdown
          window.dispatchEvent(
            new CustomEvent('gdown:file-reloaded', {
              detail: { tabId: currentTab.id, markdown },
            }),
          )
          showNotification(`↻ ${tab.title} updated`, 'warning')
        }
      } catch {
        // The file may have been deleted or temporarily inaccessible.
      }
    }
  }

  /** Serialize external polling with writes so one conflict dialog owns the lane. */
  async function checkForExternalChanges(): Promise<void> {
    if (conflictCheckPromise) return conflictCheckPromise
    const operation = enqueueSave(scanExternalChanges)
    conflictCheckPromise = operation
    try {
      await operation
    } finally {
      if (conflictCheckPromise === operation) conflictCheckPromise = null
    }
  }

  function startConflictDetection(): void {
    if (conflictCheckInterval) return
    conflictCheckInterval = setInterval(
      () => void checkForExternalChanges(),
      CONFLICT_CHECK_INTERVAL_MS,
    )
  }

  function stopConflictDetection(): void {
    if (conflictCheckInterval) clearInterval(conflictCheckInterval)
    conflictCheckInterval = null
  }

  const stopContentWatch = watch(
    () => {
      const tab = tabsStore.activeTab
      return tab ? `${tab.id}:${tab.contentRevision}:${tab.isModified}` : null
    },
    (key) => {
      if (!key) return
      const tab = tabsStore.activeTab
      if (tab?.isModified) scheduleAutoSave(tab.id)
    },
  )

  const stopActiveTabWatch = watch(
    () => tabsStore.activeTabId,
    (newTabId, oldTabId) => {
      if (newTabId === oldTabId) return
      if (oldTabId) {
        const hadPending = autoSaveTimers.has(oldTabId)
        cancelPending(oldTabId)
        if (hadPending && preferencesStore.autoSaveEnabled) void saveTab(oldTabId)
      }
      syncStatus()
    },
  )

  const stopPreferenceWatch = watch(
    () => [preferencesStore.autoSaveEnabled, preferencesStore.autoSaveIntervalMs] as const,
    ([enabled]) => {
      if (!enabled) cancelPending()
    },
  )

  function cleanup(): void {
    cancelPending()
    stopConflictDetection()
    stopContentWatch()
    stopActiveTabWatch()
    stopPreferenceWatch()
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
    getTabMarkdown,
    serializeTabToFile,
    scheduleAutoSave,
    saveNow,
    saveActiveTab,
    saveActiveTabAs,
    saveTab,
    saveTabAs,
    cancelPending,
    cancelTab,
    waitForTabSave,
    waitForAllSaves,
    syncStatus,
    resolveConflict,
    checkConflictBeforeSave,
    trackFileModifiedTime,
    untrackFile,
    markRecoveryTab,
    startConflictDetection,
    stopConflictDetection,
    checkForExternalChanges,
    cleanup,
  }
})
