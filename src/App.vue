<template>
  <div class="app">
    <TabBar />
    <div class="main-container" :class="{ 'single-file-mode': !sidebarStore.visible }">
      <Sidebar />
      <main class="editor-area">
        <div v-if="tabsStore.activeTab" class="editor-content">
          <Editor v-if="editorModeStore.mode === 'wysiwyg'" ref="editorRef" />
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import TabBar from './components/tabs/TabBar.vue'
import Editor from './components/Editor.vue'
import SourceEditor from './components/source/SourceEditor.vue'
import Sidebar from './components/sidebar/Sidebar.vue'
import OutlinePanel from './components/sidebar/OutlinePanel.vue'
import StatusBar from './components/StatusBar.vue'
import RecentFiles from './components/RecentFiles.vue'
import ConflictDialog from './components/ConflictDialog.vue'
import SaveNotification from './components/SaveNotification.vue'
import PreferencesWindow from './components/preferences/PreferencesWindow.vue'
import ExportDialog from './components/ExportDialog.vue'
import ExportToast from './components/ExportToast.vue'
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
import { useExportStore } from './stores/export'
import { usePublishStore } from './stores/publish'

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
const exportStore = useExportStore()
const publishStore = usePublishStore()
const editorRef = ref<InstanceType<typeof Editor> | null>(null)

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

/** Handle keyboard shortcuts */
function handleKeydown(e: KeyboardEvent) {
  // Cmd+,: Open Preferences (macOS standard shortcut)
  if (e.metaKey && !e.shiftKey && e.key === ',') {
    e.preventDefault()
    preferencesStore.open()
    return
  }

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
      tabsStore.closeTab(tabsStore.activeTab.id)
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
  // Use synchronous-friendly approach: fire and forget
  sessionStore.saveSession()
}

onMounted(async () => {
  // Initialize preferences (apply theme, font size, etc.)
  preferencesStore.initialize()

  // Register global keyboard shortcuts
  window.addEventListener('keydown', handleKeydown)
  // Register beforeunload handler to save session on app close
  window.addEventListener('beforeunload', handleBeforeUnload)

  // Listen for menu events from Tauri backend
  try {
    // File > New (Cmd+N)
    unlistenNewFile = await listen('menu-new-file', () => {
      tabsStore.createTab()
    })

    // File > Open (Cmd+O) — show native file picker dialog
    unlistenOpenFile = await listen('menu-open-file', () => {
      tabsStore.openFileDialog()
    })

    // File > Open Folder (Cmd+Shift+O)
    unlistenOpenFolder = await listen('menu-open-folder', () => {
      sidebarStore.openFolderDialog()
    })

    // File > Save (Cmd+S) — save active tab to disk
    unlistenSaveFile = await listen('menu-save-file', () => {
      autoSaveStore.saveNow()
    })

    // File > Save As (Cmd+Shift+S) — always prompt for location
    unlistenSaveAs = await listen('menu-save-as', () => {
      autoSaveStore.saveActiveTabAs()
    })

    // View > Toggle Sidebar
    unlistenToggleSidebar = await listen('menu-toggle-sidebar', () => {
      sidebarStore.toggleSidebar()
    })

    // View > Toggle Source Mode (Cmd+/)
    unlistenToggleSourceMode = await listen('menu-toggle-source-mode', () => {
      editorModeStore.toggleMode()
    })

    // View > Toggle Outline Panel (Cmd+Shift+1)
    unlistenToggleOutline = await listen('menu-toggle-outline', () => {
      outlineStore.toggleOutline()
    })

    // View > Focus Mode (F8) — dim all blocks except active
    unlistenToggleFocusMode = await listen('menu-toggle-focus-mode', () => {
      focusModeStore.toggle()
    })

    // View > Typewriter Mode (F9) — keep cursor vertically centered
    await listen('menu-toggle-typewriter-mode', () => {
      typewriterModeStore.toggle()
    })

    // App > Preferences (Cmd+,)
    unlistenOpenPreferences = await listen('menu-open-preferences', () => {
      preferencesStore.open()
    })

    // File > Export (Cmd+Shift+E) — open export dialog
    unlistenExport = await listen('menu-export', () => {
      exportStore.openDialog()
    })

    // File > Close Tab (Cmd+W)
    unlistenCloseTab = await listen('menu-close-tab', () => {
      if (tabsStore.activeTab) {
        tabsStore.closeTab(tabsStore.activeTab.id)
      }
    })

    // View > Next Tab (Cmd+Shift+])
    unlistenNextTab = await listen('menu-next-tab', () => {
      tabsStore.nextTab()
    })

    // View > Previous Tab (Cmd+Shift+[)
    unlistenPrevTab = await listen('menu-prev-tab', () => {
      tabsStore.previousTab()
    })

    // File > Export as HTML (Cmd+Shift+H)
    unlistenExportHtml = await listen('menu-export-html', () => {
      const editor = editorRef.value?.getEditor()
      if (!editor) return
      const tab = tabsStore.activeTab
      const title = tab?.title?.replace(/\.[^.]+$/, '') ?? 'Untitled'
      const fileName = `${title}.html`
      publishStore.exportHtml(() => editor.getHTML(), title, fileName)
    })

    // Edit > Copy as Rich Text (Cmd+Shift+C)
    unlistenCopyRichText = await listen('menu-copy-rich-text', () => {
      const editor = editorRef.value?.getEditor()
      if (!editor) return
      const tab = tabsStore.activeTab
      const title = tab?.title?.replace(/\.[^.]+$/, '') ?? 'Untitled'
      publishStore.copyRichText(() => editor.getHTML(), title)
    })

    // File > Print / Export PDF (Cmd+P)
    unlistenPrintPdf = await listen('menu-print-pdf', () => {
      publishStore.printToPdf()
    })

    // Clear recent files
    unlistenClearRecent = await listen('menu-clear-recent', () => {
      recentFilesStore.clearAll()
    })

    // Themes menu
    await listen<string>('menu-set-theme', (event) => {
      preferencesStore.theme = event.payload as import('./stores/preferences').ThemeMode
    })

    // Listen for file-open requests from the Rust backend (single file)
    // This handles: macOS file associations, drag-drop onto dock icon,
    // "open with" context menu, or any other backend-initiated file open.
    unlistenFileOpenRequest = await listen<string>('open-file', (event) => {
      const filePath = event.payload
      if (filePath) {
        tabsStore.openFile(filePath)
      }
    })

    // Listen for batch file-open events from Rust backend (multiple files)
    // Fired by RunEvent::Opened when files are opened via macOS Open With,
    // double-click, or dock drag.
    unlistenOpenFiles = await listen<string[]>('open-files', (event) => {
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

  // Initialize preferences (apply theme, editor styles)
  preferencesStore.initialize()

  // Start periodic conflict detection for external file changes
  autoSaveStore.startConflictDetection()

  // Restore previous session (open tabs, sidebar, scroll positions)
  // This runs after pending files are processed so CLI-opened files take precedence
  await sessionStore.initialize()

  // Open a default untitled tab on startup if no files were opened
  // (from CLI args, pending open events, session restore, or other sources)
  if (tabsStore.tabs.length === 0) {
    tabsStore.createTab()
  }
})

// Watch for active tab changes — sync auto-save status and cancel pending saves
watch(
  () => tabsStore.activeTabId,
  () => {
    autoSaveStore.cancelPending()
    autoSaveStore.syncStatus()
  },
)

// Watch for active tab modification changes — trigger auto-save when content is modified
watch(
  () => tabsStore.activeTab?.isModified,
  (isModified) => {
    if (isModified) {
      autoSaveStore.scheduleAutoSave()
    }
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  autoSaveStore.cleanup()
  sessionStore.teardown()

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
</style>
