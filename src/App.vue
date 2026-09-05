<template>
  <div class="app">
    <TabBar />
    <div class="main-container" :class="{ 'single-file-mode': !sidebarStore.visible }">
      <Sidebar />
      <main class="editor-area">
        <div v-if="tabsStore.activeTab" class="editor-content">
          <ImageViewer v-if="tabsStore.activeTab.isImage" />
          <Editor v-else-if="editorModeStore.mode === 'wysiwyg'" ref="editorRef" />
          <SourceEditor v-else />
        </div>
        <div v-else class="no-tab-placeholder">
          <div class="empty-state">
            <h2 class="empty-state-title">gdown</h2>
            <p class="empty-state-subtitle">Open a file or create a new document</p>
            <div class="empty-state-actions">
              <button class="empty-state-button" @click="tabsStore.createTab()">
                New Document
              </button>
              <button class="empty-state-button" @click="sidebarStore.openFolderDialog()">
                Open Folder
              </button>
            </div>
            <RecentFiles v-if="recentFilesStore.hasRecent" class="empty-state-recent" />
          </div>
        </div>
      </main>
      <!-- Outline panel (right side, like Typora) -->
      <aside v-if="outlineStore.visible" class="outline-aside">
        <OutlinePanel @navigate="handleOutlineNavigate" />
      </aside>
    </div>
    <StatusBar />
    <ConflictDialog />
    <SaveNotification />
    <PreferencesWindow />
    <ExportDialog />
    <ExportToast />
    <QuickOpenDialog />
    <div
      v-if="closePrompt"
      class="close-prompt-backdrop"
      role="presentation"
      @click.self="resolveClosePrompt('cancel')"
    >
      <div
        ref="closePromptElement"
        class="close-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-prompt-title"
        tabindex="-1"
        @keydown="handleClosePromptKeydown"
      >
        <h2 id="close-prompt-title">Save changes to {{ closePrompt.tab.title }}?</h2>
        <p>This document has unsaved changes.</p>
        <div class="close-prompt-actions">
          <button type="button" @click="resolveClosePrompt('cancel')">Cancel</button>
          <button type="button" @click="resolveClosePrompt('discard')">Don't Save</button>
          <button type="button" class="close-prompt-save" @click="resolveClosePrompt('save')">
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import TabBar from './components/tabs/TabBar.vue'
import Editor from './components/Editor.vue'
import SourceEditor from './components/source/SourceEditor.vue'
import ImageViewer from './components/ImageViewer.vue'
import Sidebar from './components/sidebar/Sidebar.vue'
import OutlinePanel from './components/sidebar/OutlinePanel.vue'
import StatusBar from './components/StatusBar.vue'
import RecentFiles from './components/RecentFiles.vue'
import ConflictDialog from './components/ConflictDialog.vue'
import SaveNotification from './components/SaveNotification.vue'
import PreferencesWindow from './components/preferences/PreferencesWindow.vue'
import ExportDialog from './components/ExportDialog.vue'
import ExportToast from './components/ExportToast.vue'
import QuickOpenDialog from './components/QuickOpenDialog.vue'
import { useTabsStore } from './stores/tabs'
import { useSidebarStore } from './stores/sidebar'
import { useRecentFilesStore } from './stores/recentFiles'
import { useEditorModeStore } from './stores/editorMode'
import { useAutoSaveStore } from './stores/autoSave'
import { useOutlineStore, type OutlineHeading } from './stores/outline'
import { useSessionStore } from './stores/session'
import { useFocusModeStore } from './stores/focusMode'
import { useTypewriterModeStore } from './stores/typewriterMode'
import { useFindReplaceStore } from './stores/findReplace'
import { usePreferencesStore } from './stores/preferences'
import { useEditorSettingsStore } from './stores/editorSettings'
import { useExportStore } from './stores/export'
import { usePublishStore } from './stores/publish'
import type { CloseDecision } from './stores/tabs'
import type { Tab } from './types/tab'

const tabsStore = useTabsStore()
const sidebarStore = useSidebarStore()
const recentFilesStore = useRecentFilesStore()
const editorModeStore = useEditorModeStore()
const autoSaveStore = useAutoSaveStore()
const outlineStore = useOutlineStore()
const sessionStore = useSessionStore()
const focusModeStore = useFocusModeStore()
const typewriterModeStore = useTypewriterModeStore()
const findReplaceStore = useFindReplaceStore()
const preferencesStore = usePreferencesStore()
const editorSettings = useEditorSettingsStore()
const exportStore = useExportStore()
const publishStore = usePublishStore()
const editorRef = ref<InstanceType<typeof Editor> | null>(null)

interface ClosePrompt {
  tab: Tab
  resolve: (decision: CloseDecision) => void
}

const closePrompt = ref<ClosePrompt | null>(null)
const closePromptElement = ref<HTMLElement | null>(null)
let exitInProgress = false
let exitApproved = false

function requestCloseDecision(tab: Tab): Promise<CloseDecision> {
  if (closePrompt.value) return Promise.resolve('cancel')
  return new Promise((resolve) => {
    closePrompt.value = { tab, resolve }
  })
}

function resolveClosePrompt(decision: CloseDecision): void {
  const prompt = closePrompt.value
  if (!prompt) return
  closePrompt.value = null
  prompt.resolve(decision)
}

watch(closePrompt, (prompt) => {
  if (!prompt) return
  void nextTick(() => closePromptElement.value?.querySelector<HTMLButtonElement>('button')?.focus())
})

function handleClosePromptKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    resolveClosePrompt('cancel')
    return
  }
  if (event.key !== 'Tab') return

  const buttons = Array.from(
    closePromptElement.value?.querySelectorAll<HTMLButtonElement>('button') ?? [],
  )
  if (buttons.length === 0) return
  const first = buttons[0]!
  const last = buttons[buttons.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function appActionsBlocked(): boolean {
  return closePrompt.value !== null || exitInProgress || preferencesStore.visible
}

/** Resolve dirty tabs before Rust completes a native quit or window close. */
async function handleExitRequested(): Promise<void> {
  if (exitInProgress) return
  exitInProgress = true

  try {
    // Snapshot live editor state before any discard decision can clear a
    // recovery tab. The tab list remains open for the final session save.
    window.dispatchEvent(new Event('gdown:capture-state'))
    if (!(await tabsStore.prepareCloseAll())) {
      await invoke('cancel_exit')
      return
    }

    await autoSaveStore.waitForAllSaves()
    await sessionStore.teardown()
    // Keep the guard active while Rust tears down the window. This also stops
    // onUnmounted/beforeunload from recapturing discarded recovery text.
    exitApproved = true
    await invoke('allow_exit')
  } catch (err) {
    console.error('Failed to prepare app exit:', err)
    try {
      await invoke('cancel_exit')
    } catch {
      // Tauri is unavailable in browser development mode.
    }
  } finally {
    if (!exitApproved) exitInProgress = false
  }
}

/** Handle outline heading navigation */
function handleOutlineNavigate(heading: OutlineHeading) {
  if (editorModeStore.mode === 'wysiwyg' && editorRef.value) {
    editorRef.value.navigateToHeading(heading.pos)
  }
}

// Store unlisten functions for cleanup
let unlistenNewFile: UnlistenFn | null = null
let unlistenOpenFile: UnlistenFn | null = null
let unlistenOpenFolder: UnlistenFn | null = null
let unlistenSaveFile: UnlistenFn | null = null
let unlistenToggleSidebar: UnlistenFn | null = null
let unlistenClearRecent: UnlistenFn | null = null
let unlistenFileOpenRequest: UnlistenFn | null = null
let unlistenOpenFiles: UnlistenFn | null = null
let unlistenToggleSourceMode: UnlistenFn | null = null
let unlistenSaveAs: UnlistenFn | null = null
let unlistenToggleOutline: UnlistenFn | null = null
let unlistenToggleFocusMode: UnlistenFn | null = null
let unlistenOpenPreferences: UnlistenFn | null = null
let unlistenExport: UnlistenFn | null = null
let unlistenCloseTab: UnlistenFn | null = null
let unlistenNextTab: UnlistenFn | null = null
let unlistenPrevTab: UnlistenFn | null = null
let unlistenExportHtml: UnlistenFn | null = null
let unlistenCopyRichText: UnlistenFn | null = null
let unlistenPrintPdf: UnlistenFn | null = null
let unlistenOpenByPath: UnlistenFn | null = null
let unlistenExitRequested: UnlistenFn | null = null

/** Handle keyboard shortcuts */
function handleKeydown(e: KeyboardEvent) {
  if (closePrompt.value) {
    if (e.key === 'Escape') {
      e.preventDefault()
      resolveClosePrompt('cancel')
    }
    return
  }
  if (exitInProgress) return

  // Cmd+,: Open Preferences (macOS standard shortcut)
  if (e.metaKey && !e.shiftKey && e.key === ',') {
    e.preventDefault()
    preferencesStore.open()
    return
  }

  // Let preference controls own keyboard input while their window is open.
  if (preferencesStore.visible) return

  // Cmd+N: New file (Typora shortcut)
  if (e.metaKey && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault()
    tabsStore.createTab()
    return
  }

  // Cmd+O: Open file dialog (Typora shortcut)
  if (e.metaKey && !e.shiftKey && (e.key === 'o' || e.key === 'O')) {
    e.preventDefault()
    tabsStore.openFileDialog()
    return
  }

  // Cmd+Shift+O: Open folder dialog
  if (e.metaKey && e.shiftKey && (e.key === 'o' || e.key === 'O')) {
    e.preventDefault()
    sidebarStore.openFolderDialog()
    return
  }

  // Cmd+Shift+G: Open by path (macOS Finder "Go to Folder" shortcut)
  if (e.metaKey && e.shiftKey && (e.key === 'g' || e.key === 'G')) {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    return
  }

  // Cmd+\: Toggle sidebar visibility (Typora shortcut)
  if (e.metaKey && e.key === '\\') {
    e.preventDefault()
    sidebarStore.toggleSidebar()
    return
  }

  // Cmd+Shift+L: Toggle sidebar (alternative Typora shortcut)
  if (e.metaKey && e.shiftKey && (e.key === 'l' || e.key === 'L')) {
    e.preventDefault()
    sidebarStore.toggleSidebar()
    return
  }

  // Cmd+Shift+E: Export (Typora shortcut)
  if (e.metaKey && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
    e.preventDefault()
    exportStore.openDialog()
    return
  }

  // Cmd+Shift+S: Save As (Typora shortcut)
  if (e.metaKey && e.shiftKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault()
    autoSaveStore.saveActiveTabAs()
    return
  }

  // Cmd+S: Save active tab (Typora shortcut)
  if (e.metaKey && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault()
    autoSaveStore.saveNow()
    return
  }

  // Cmd+/: Toggle source mode — only handled here from the native menu (listen()).
  // Keyboard Cmd+/ is handled by Editor.vue (wysiwyg→source) and
  // source/SourceEditor.vue (source→wysiwyg) to avoid double-fire content loss.

  // F8: Toggle focus mode (Typora shortcut)
  if (e.key === 'F8' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    e.preventDefault()
    focusModeStore.toggle()
    return
  }

  // F9: Toggle typewriter mode (Typora shortcut)
  if (e.key === 'F9' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    e.preventDefault()
    typewriterModeStore.toggle()
    return
  }

  // Cmd+Shift+1: Toggle outline panel (Typora shortcut)
  if (e.metaKey && e.shiftKey && e.key === '1') {
    e.preventDefault()
    outlineStore.toggleOutline()
    return
  }

  // Cmd+W: Close active tab (Typora shortcut — overrides default close window)
  if (e.metaKey && !e.shiftKey && (e.key === 'w' || e.key === 'W')) {
    e.preventDefault()
    if (tabsStore.activeTab) {
      void tabsStore.closeTab(tabsStore.activeTab.id)
    }
    return
  }

  // Cmd+Shift+]: Next tab (Typora/macOS standard)
  if (e.metaKey && e.shiftKey && e.key === ']') {
    e.preventDefault()
    tabsStore.nextTab()
    return
  }

  // Cmd+Shift+[: Previous tab (Typora/macOS standard)
  if (e.metaKey && e.shiftKey && e.key === '[') {
    e.preventDefault()
    tabsStore.previousTab()
    return
  }

  // Ctrl+Tab: Next tab (alternative)
  if (e.ctrlKey && !e.shiftKey && e.key === 'Tab') {
    e.preventDefault()
    tabsStore.nextTab()
    return
  }

  // Ctrl+Shift+Tab: Previous tab (alternative)
  if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
    e.preventDefault()
    tabsStore.previousTab()
    return
  }

  // Cmd+1..9: Switch to tab by index
  if (e.metaKey && !e.shiftKey && !e.ctrlKey && !e.altKey && e.key >= '1' && e.key <= '9') {
    const index = parseInt(e.key) - 1
    if (index < tabsStore.tabs.length) {
      e.preventDefault()
      tabsStore.setActiveTab(tabsStore.tabs[index]!.id)
    }
    return
  }

  // Cmd+F: Find (Typora shortcut)
  if (e.metaKey && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault()
    findReplaceStore.open(false)
    return
  }

  // Cmd+H: Find and Replace (Typora shortcut)
  if (e.metaKey && !e.shiftKey && (e.key === 'h' || e.key === 'H')) {
    e.preventDefault()
    findReplaceStore.open(true)
    return
  }
}

/** Save session state on page unload (app close, refresh) */
function handleBeforeUnload() {
  if (exitApproved || exitInProgress) return
  // Capture the live editor's body, front-matter, cursor, and scroll first.
  window.dispatchEvent(new Event('gdown:capture-state'))
  void sessionStore.saveSession()
}

onMounted(async () => {
  // Initialize preferences (apply theme, font size, etc.)
  preferencesStore.initialize()
  editorModeStore.setMode(editorSettings.defaultMode)
  tabsStore.setCloseDecisionHandler(requestCloseDecision)

  // Register global keyboard shortcuts
  window.addEventListener('keydown', handleKeydown)
  // Register beforeunload handler to save session on app close
  window.addEventListener('beforeunload', handleBeforeUnload)

  // Listen for menu events from Tauri backend
  try {
    // File > New (Cmd+N)
    unlistenNewFile = await listen('menu-new-file', () => {
      if (appActionsBlocked()) return
      tabsStore.createTab()
    })

    // File > Open (Cmd+O) — show native file picker dialog
    unlistenOpenFile = await listen('menu-open-file', () => {
      if (appActionsBlocked()) return
      tabsStore.openFileDialog()
    })

    // File > Open Folder (Cmd+Shift+O)
    unlistenOpenFolder = await listen('menu-open-folder', () => {
      if (appActionsBlocked()) return
      sidebarStore.openFolderDialog()
    })

    // File > Open by Path (Cmd+Shift+G)
    unlistenOpenByPath = await listen('menu-open-by-path', () => {
      if (appActionsBlocked()) return
      window.dispatchEvent(new CustomEvent('gdown:quick-open'))
    })

    // File > Save (Cmd+S) — save active tab to disk
    unlistenSaveFile = await listen('menu-save-file', () => {
      if (appActionsBlocked()) return
      autoSaveStore.saveNow()
    })

    // File > Save As (Cmd+Shift+S) — always prompt for location
    unlistenSaveAs = await listen('menu-save-as', () => {
      if (appActionsBlocked()) return
      autoSaveStore.saveActiveTabAs()
    })

    // View > Toggle Sidebar
    unlistenToggleSidebar = await listen('menu-toggle-sidebar', () => {
      if (appActionsBlocked()) return
      sidebarStore.toggleSidebar()
    })

    // View > Toggle Source Mode (Cmd+/)
    unlistenToggleSourceMode = await listen('menu-toggle-source-mode', () => {
      if (appActionsBlocked()) return
      if (editorModeStore.isWysiwyg) {
        window.dispatchEvent(new CustomEvent('gdown:toggle-mode'))
      } else {
        editorModeStore.setMode('wysiwyg')
      }
    })

    // View > Toggle Outline Panel (Cmd+Shift+1)
    unlistenToggleOutline = await listen('menu-toggle-outline', () => {
      if (appActionsBlocked()) return
      outlineStore.toggleOutline()
    })

    // View > Focus Mode (F8) — dim all blocks except active
    unlistenToggleFocusMode = await listen('menu-toggle-focus-mode', () => {
      if (appActionsBlocked()) return
      focusModeStore.toggle()
    })

    // View > Typewriter Mode (F9) — keep cursor vertically centered
    await listen('menu-toggle-typewriter-mode', () => {
      if (appActionsBlocked()) return
      typewriterModeStore.toggle()
    })

    // App > Preferences (Cmd+,)
    unlistenOpenPreferences = await listen('menu-open-preferences', () => {
      if (appActionsBlocked()) return
      preferencesStore.open()
    })

    // File > Export (Cmd+Shift+E) — open export dialog
    unlistenExport = await listen('menu-export', () => {
      if (appActionsBlocked()) return
      exportStore.openDialog()
    })

    // File > Close Tab (Cmd+W)
    unlistenCloseTab = await listen('menu-close-tab', () => {
      if (appActionsBlocked()) return
      if (tabsStore.activeTab) {
        void tabsStore.closeTab(tabsStore.activeTab.id)
      }
    })

    // View > Next Tab (Cmd+Shift+])
    unlistenNextTab = await listen('menu-next-tab', () => {
      if (appActionsBlocked()) return
      tabsStore.nextTab()
    })

    // View > Previous Tab (Cmd+Shift+[)
    unlistenPrevTab = await listen('menu-prev-tab', () => {
      if (appActionsBlocked()) return
      tabsStore.previousTab()
    })

    // File > Export as HTML (Cmd+Shift+H)
    unlistenExportHtml = await listen('menu-export-html', () => {
      if (appActionsBlocked()) return
      const editor = editorRef.value?.getEditor()
      if (!editor) return
      const tab = tabsStore.activeTab
      const title = tab?.title?.replace(/\.[^.]+$/, '') ?? 'Untitled'
      const fileName = `${title}.html`
      publishStore.exportHtml(() => editor.getHTML(), title, fileName)
    })

    // Edit > Copy as Rich Text (Cmd+Shift+C)
    unlistenCopyRichText = await listen('menu-copy-rich-text', () => {
      if (appActionsBlocked()) return
      const editor = editorRef.value?.getEditor()
      if (!editor) return
      const tab = tabsStore.activeTab
      const title = tab?.title?.replace(/\.[^.]+$/, '') ?? 'Untitled'
      publishStore.copyRichText(() => editor.getHTML(), title)
    })

    // File > Print / Export PDF (Cmd+P)
    unlistenPrintPdf = await listen('menu-print-pdf', () => {
      if (appActionsBlocked()) return
      publishStore.printToPdf()
    })

    // Clear recent files
    unlistenClearRecent = await listen('menu-clear-recent', () => {
      if (appActionsBlocked()) return
      recentFilesStore.clearAll()
    })

    // Themes menu
    await listen<string>('menu-set-theme', (event) => {
      if (appActionsBlocked()) return
      preferencesStore.theme = event.payload as import('./stores/preferences').ThemeMode
    })

    // Listen for file-open requests from the Rust backend (single file)
    // This handles: macOS file associations, drag-drop onto dock icon,
    // "open with" context menu, or any other backend-initiated file open.
    unlistenFileOpenRequest = await listen<string>('open-file', (event) => {
      if (appActionsBlocked()) return
      const filePath = event.payload
      if (filePath) {
        tabsStore.openFile(filePath)
      }
    })

    // Native window close and application quit are held by Rust until the
    // frontend resolves every dirty tab.
    unlistenExitRequested = await listen('app-exit-requested', () => {
      void handleExitRequested()
    })

    // Listen for batch file-open events from Rust backend (multiple files)
    // Fired by RunEvent::Opened when files are opened via macOS Open With,
    // double-click, or dock drag.
    unlistenOpenFiles = await listen<string[]>('open-files', (event) => {
      if (appActionsBlocked()) return
      const paths = event.payload
      if (paths && Array.isArray(paths)) {
        for (const filePath of paths) {
          tabsStore.openFile(filePath)
        }
      }
    })

    // Check for pending files from CLI args or early macOS open events
    // that arrived before the frontend was ready.
    try {
      const pendingFiles = await invoke<string[]>('get_pending_open_files')
      if (pendingFiles && pendingFiles.length > 0) {
        for (const filePath of pendingFiles) {
          await tabsStore.openFile(filePath)
        }
      }
    } catch (err) {
      console.warn('Failed to get pending open files:', err)
    }
  } catch (e) {
    // Tauri events may not be available in dev mode without Tauri
    console.warn('Failed to register Tauri event listeners:', e)
  }

  // Sync theme checkmark in native menu
  const themeMenuId =
    preferencesStore.theme === 'auto' ? 'theme-system' : `theme-${preferencesStore.theme}`
  emit('sync-theme-menu', themeMenuId).catch(() => {})

  // Start periodic conflict detection for external file changes
  autoSaveStore.startConflictDetection()

  // Restore previous session (open tabs, sidebar, scroll positions) when enabled.
  // This runs after pending files are processed so CLI-opened files take precedence.
  await sessionStore.initialize(preferencesStore.restoreSessionOnLaunch)

  // Open a default untitled tab on startup if no files were opened
  // (from CLI args, pending open events, session restore, or other sources)
  if (tabsStore.tabs.length === 0) {
    tabsStore.createTab()
  }
})

// Sync native theme menu checkmark when theme changes (e.g. from Preferences UI)
watch(
  () => preferencesStore.theme,
  (newTheme) => {
    const menuId = newTheme === 'auto' ? 'theme-system' : `theme-${newTheme}`
    emit('sync-theme-menu', menuId).catch(() => {})
  },
)

// Watch for active tab changes — sync auto-save status and cancel pending saves
watch(
  () => tabsStore.activeTabId,
  () => {
    autoSaveStore.syncStatus()
  },
)

onUnmounted(() => {
  if (!exitApproved) window.dispatchEvent(new Event('gdown:capture-state'))
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  tabsStore.setCloseDecisionHandler(null)
  autoSaveStore.cleanup()
  if (!exitApproved) void sessionStore.teardown()

  // Clean up Tauri event listeners
  if (unlistenNewFile) unlistenNewFile()
  if (unlistenOpenFile) unlistenOpenFile()
  if (unlistenOpenFolder) unlistenOpenFolder()
  if (unlistenSaveFile) unlistenSaveFile()
  if (unlistenToggleSidebar) unlistenToggleSidebar()
  if (unlistenClearRecent) unlistenClearRecent()
  if (unlistenFileOpenRequest) unlistenFileOpenRequest()
  if (unlistenOpenFiles) unlistenOpenFiles()
  if (unlistenToggleSourceMode) unlistenToggleSourceMode()
  if (unlistenSaveAs) unlistenSaveAs()
  if (unlistenToggleOutline) unlistenToggleOutline()
  if (unlistenToggleFocusMode) unlistenToggleFocusMode()
  if (unlistenOpenPreferences) unlistenOpenPreferences()
  if (unlistenExport) unlistenExport()
  if (unlistenCloseTab) unlistenCloseTab()
  if (unlistenNextTab) unlistenNextTab()
  if (unlistenPrevTab) unlistenPrevTab()
  if (unlistenExportHtml) unlistenExportHtml()
  if (unlistenCopyRichText) unlistenCopyRichText()
  if (unlistenPrintPdf) unlistenPrintPdf()
  unlistenOpenByPath?.()
  unlistenExitRequested?.()
})
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}

.main-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-area {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* Single-file mode: editor takes full width with no sidebar artifacts */
.single-file-mode .editor-area {
  flex: 1;
  width: 100%;
}

.editor-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.no-tab-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 14px;
}

.empty-state {
  text-align: center;
}

.empty-state-title {
  font-size: 28px;
  font-weight: 300;
  color: #666;
  margin-bottom: 8px;
}

.empty-state-subtitle {
  font-size: 14px;
  color: #999;
  margin-bottom: 20px;
}

.empty-state-button {
  padding: 8px 20px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  background: #f5f5f5;
  color: #333;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.empty-state-button:hover {
  background: #e8e8e8;
  border-color: #bbb;
}

.empty-state-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-bottom: 24px;
}

.empty-state-recent {
  margin-top: 8px;
  border-top: 1px solid #e8e8e8;
  padding-top: 8px;
}

/* Outline panel (right sidebar) */
.outline-aside {
  width: 240px;
  min-width: 180px;
  max-width: 360px;
  height: 100%;
  background-color: var(--sidebar-bg, #f5f5f5);
  border-left: 1px solid var(--sidebar-border, #e0e0e0);
  overflow: hidden;
  flex-shrink: 0;
}

.close-prompt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dialog-backdrop, rgba(0, 0, 0, 0.35));
}

.close-prompt {
  width: min(420px, calc(100vw - 32px));
  padding: 20px;
  border: 1px solid var(--dialog-border, #d0d0d0);
  border-radius: 8px;
  background: var(--dialog-bg, #fff);
  color: var(--text-primary, #333);
  box-shadow: var(--dialog-shadow, 0 12px 32px rgba(0, 0, 0, 0.2));
}

.close-prompt h2 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
}

.close-prompt p {
  margin: 0 0 20px;
  color: var(--text-secondary, #666);
  font-size: 13px;
}

.close-prompt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.close-prompt-actions button {
  padding: 6px 12px;
  border: 1px solid var(--dialog-button-border, #c8c8c8);
  border-radius: 5px;
  background: var(--dialog-button-bg, #f5f5f5);
  color: var(--text-primary, #333);
  cursor: pointer;
}

.close-prompt-actions .close-prompt-save {
  border-color: var(--accent-color, #4a9eff);
  background: var(--accent-color, #4a9eff);
  color: var(--accent-text, #fff);
}
</style>
