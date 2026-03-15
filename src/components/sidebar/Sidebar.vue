<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSidebarStore } from '../../stores/sidebar'
import { useTabsStore } from '../../stores/tabs'
import { useRecentFilesStore } from '../../stores/recentFiles'
import FileTreeNode from './FileTreeNode.vue'
import AiFilesPanel from './AiFilesPanel.vue'

const sidebar = useSidebarStore()
const tabs = useTabsStore()
const recentFiles = useRecentFilesStore()

/** Image file extensions that should open with the system viewer instead of as a tab */
const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'svg',
  'webp',
  'ico',
  'tiff',
  'tif',
])

/** Check if a file path is an image based on its extension */
function isImageFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.has(ext)
}

/** The currently selected file path (from the active tab) */
const selectedFilePath = computed(() => {
  return tabs.activeTab?.filePath ?? null
})

/** Handle file selection in the tree — reads file from disk and opens in tab */
async function handleFileSelect(path: string) {
  // Image files open in the built-in image viewer tab
  if (isImageFile(path)) {
    tabs.openImageFile(path)
    recentFiles.addRecentFile(path)
    return
  }

  // openFile handles deduplication: switches to existing tab or reads from disk
  const tab = await tabs.openFile(path)
  if (tab) {
    // Track this file in recent items
    recentFiles.addRecentFile(path)
  }
}

// --- Sidebar resize drag logic ---
const sidebarWidth = ref(260)
const isResizing = ref(false)
const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 500

function onResizeStart(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const startX = e.clientX
  const startWidth = sidebarWidth.value

  function onMouseMove(ev: MouseEvent) {
    const delta = ev.clientX - startX
    const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, startWidth + delta))
    sidebarWidth.value = newWidth
  }

  function onMouseUp() {
    isResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

/** Computed style for the sidebar width */
const sidebarStyle = computed(() => ({
  width: sidebar.visible ? `${sidebarWidth.value}px` : '0px',
}))
</script>

<template>
  <aside
    class="sidebar"
    :class="{ 'sidebar-visible': sidebar.visible, 'sidebar-hidden': !sidebar.visible }"
    :style="sidebarStyle"
  >
    <!-- Sidebar header -->
    <div class="sidebar-header">
      <div class="sidebar-title-row">
        <h2 class="sidebar-title">
          {{ sidebar.hasFolderOpen ? sidebar.rootFolderName : 'Files' }}
        </h2>
        <div class="sidebar-actions">
          <!-- Refresh button -->
          <button
            v-if="sidebar.hasFolderOpen && sidebar.activePanel === 'files'"
            class="sidebar-btn"
            title="Refresh file tree"
            @click="sidebar.refreshTree()"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.418A6 6 0 1 1 8 2v1z" />
              <path
                d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"
              />
            </svg>
          </button>
          <!-- Hide sidebar button (does NOT clear folder) -->
          <button class="sidebar-btn" title="Hide sidebar" @click="sidebar.hideSidebar()">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path
                d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- Panel tabs -->
      <div class="sidebar-tabs">
        <button
          class="sidebar-tab"
          :class="{ 'sidebar-tab-active': sidebar.activePanel === 'files' }"
          @click="sidebar.setActivePanel('files')"
        >
          Files
        </button>
        <button
          class="sidebar-tab"
          :class="{ 'sidebar-tab-active': sidebar.activePanel === 'ai' }"
          @click="sidebar.setActivePanel('ai')"
        >
          AI
        </button>
      </div>
    </div>

    <!-- Breadcrumb navigation -->
    <div v-if="sidebar.hasFolderOpen && sidebar.activePanel === 'files'" class="breadcrumb-bar">
      <div class="breadcrumb-segments">
        <template v-for="(segment, index) in sidebar.breadcrumbSegments" :key="segment.path">
          <span v-if="index > 0" class="breadcrumb-separator">/</span>
          <button
            v-if="index < sidebar.breadcrumbSegments.length - 1"
            class="breadcrumb-btn"
            :title="segment.path"
            @click="sidebar.navigateToFolder(segment.path)"
          >
            {{ segment.name }}
          </button>
          <span v-else class="breadcrumb-current" :title="segment.path">
            {{ segment.name }}
          </span>
        </template>
      </div>
      <!-- Close folder (eject) button -->
      <button
        class="sidebar-btn breadcrumb-close"
        title="Close folder"
        @click="sidebar.closeFolder()"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path
            d="M8 1a.5.5 0 0 1 .5.5v4.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 6.293V1.5A.5.5 0 0 1 8 1z"
          />
          <path d="M3 13.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5z" />
        </svg>
      </button>
    </div>

    <!-- Sidebar content -->
    <div class="sidebar-content">
      <!-- AI Files panel -->
      <AiFilesPanel v-if="sidebar.activePanel === 'ai'" />

      <!-- Files panel -->
      <template v-else>
        <!-- Loading state -->
        <div v-if="sidebar.loading" class="sidebar-status">
          <span class="loading-spinner"></span>
          Loading...
        </div>

        <!-- Error state -->
        <div v-else-if="sidebar.error" class="sidebar-status sidebar-error">
          <p>{{ sidebar.error }}</p>
          <button class="retry-btn" @click="sidebar.refreshTree()">Retry</button>
        </div>

        <!-- Empty state: no folder open -->
        <div v-else-if="!sidebar.hasFolderOpen" class="sidebar-empty">
          <p class="empty-message">No folder opened</p>
          <button class="open-folder-btn" @click="sidebar.openFolderDialog()">Open Folder</button>
          <p class="empty-hint">
            Or use <kbd>&#x2318;</kbd><kbd>&#x21E7;</kbd><kbd>O</kbd> to open a folder
          </p>
        </div>

        <!-- File tree -->
        <div v-else-if="sidebar.fileTree" class="file-tree" role="tree">
          <FileTreeNode
            v-for="child in sidebar.fileTree.children || []"
            :key="child.path"
            :node="child"
            :depth="0"
            :selected-path="selectedFilePath"
            @select-file="handleFileSelect"
          />
          <!-- Empty folder -->
          <div
            v-if="sidebar.fileTree.children && sidebar.fileTree.children.length === 0"
            class="sidebar-empty"
          >
            <p class="empty-message">This folder is empty</p>
          </div>
        </div>
      </template>
    </div>

    <!-- Sidebar resize handle (draggable) -->
    <div
      class="sidebar-resize-handle"
      :class="{ 'is-resizing': isResizing }"
      @mousedown="onResizeStart"
    ></div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 500px;
  height: 100%;
  background-color: var(--sidebar-bg, #f5f5f5);
  border-right: 1px solid var(--sidebar-border, #e0e0e0);
  overflow: hidden;
  transition: width 0.2s ease;
  flex-shrink: 0;
}

.sidebar-hidden {
  width: 0 !important;
  min-width: 0 !important;
  border-right: none;
  overflow: hidden;
}

.sidebar-visible {
  min-width: 180px;
}

.sidebar-header {
  padding: 12px 12px 8px;
  border-bottom: 1px solid var(--sidebar-border, #e0e0e0);
  flex-shrink: 0;
}

.sidebar-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sidebar-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sidebar-title-color, #888);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.sidebar-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.sidebar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--sidebar-btn-color, #888);
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

.sidebar-btn:hover {
  background-color: var(--sidebar-hover-bg, rgba(0, 0, 0, 0.08));
  color: var(--sidebar-btn-hover-color, #333);
}

.breadcrumb-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--sidebar-border, #e0e0e0);
  flex-shrink: 0;
  min-height: 24px;
}

.breadcrumb-segments {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  font-size: 0.8em;
  scrollbar-width: none;
}

.breadcrumb-segments::-webkit-scrollbar {
  display: none;
}

.breadcrumb-separator {
  color: var(--text-secondary, #999);
  opacity: 0.6;
  flex-shrink: 0;
  user-select: none;
}

.breadcrumb-btn {
  border: none;
  background: none;
  padding: 1px 2px;
  cursor: pointer;
  color: var(--text-secondary, #999);
  font-size: inherit;
  font-family: inherit;
  border-radius: 2px;
  flex-shrink: 0;
}

.breadcrumb-btn:hover {
  text-decoration: underline;
  color: var(--sidebar-text-color, #666);
}

.breadcrumb-current {
  color: var(--sidebar-text-color, #333);
  font-weight: 600;
  flex-shrink: 0;
  padding: 1px 2px;
}

.breadcrumb-close {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}

.sidebar-content::-webkit-scrollbar {
  width: 6px;
}

.sidebar-content::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-content::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
}

.sidebar-content::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.25);
}

.sidebar-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--sidebar-text-color, #666);
  font-size: 13px;
}

.sidebar-error {
  flex-direction: column;
  align-items: flex-start;
  color: var(--sidebar-error-color, #d32f2f);
}

.sidebar-error p {
  margin: 0 0 8px;
  word-break: break-word;
}

.retry-btn {
  padding: 4px 12px;
  border: 1px solid var(--sidebar-border, #ddd);
  background: var(--sidebar-bg, #fff);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--sidebar-text-color, #333);
}

.retry-btn:hover {
  background-color: var(--sidebar-hover-bg, #eee);
}

.sidebar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
}

.empty-message {
  color: var(--sidebar-text-color, #999);
  font-size: 13px;
  margin: 0 0 16px;
}

.open-folder-btn {
  padding: 6px 16px;
  border: 1px solid var(--sidebar-border, #ccc);
  background: var(--sidebar-bg, #fff);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--sidebar-text-color, #333);
  transition: background-color 0.15s ease;
}

.open-folder-btn:hover {
  background-color: var(--sidebar-hover-bg, #e8e8e8);
}

.empty-hint {
  margin: 12px 0 0;
  font-size: 11px;
  color: var(--sidebar-text-color, #aaa);
}

.empty-hint kbd {
  display: inline-block;
  padding: 1px 5px;
  font-size: 10px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', Monaco, monospace;
  border: 1px solid var(--sidebar-border, #ccc);
  border-radius: 3px;
  background: var(--sidebar-bg, #f0f0f0);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.08);
  margin: 0 1px;
}

.file-tree {
  padding: 2px 4px;
}

.loading-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--sidebar-border, #ddd);
  border-top-color: var(--sidebar-selected-color, #007aff);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.sidebar-tabs {
  display: flex;
  gap: 0;
  margin-top: 6px;
  border-bottom: 1px solid var(--sidebar-border, #e0e0e0);
}

.sidebar-tab {
  flex: 1;
  padding: 4px 8px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--sidebar-text-color, #888);
  border-bottom: 2px solid transparent;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.sidebar-tab:hover {
  color: var(--sidebar-btn-hover-color, #555);
}

.sidebar-tab-active {
  color: var(--sidebar-selected-color, #007aff);
  border-bottom-color: var(--sidebar-selected-color, #007aff);
}

.sidebar-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}

.sidebar-resize-handle:hover,
.sidebar-resize-handle.is-resizing {
  background-color: var(--sidebar-selected-color, rgba(0, 122, 255, 0.3));
}
</style>
