<template>
  <div class="status-bar">
    <div class="status-bar-left">
      <!-- Sidebar toggle -->
      <button
        class="panel-toggle-btn"
        :class="{ active: sidebarStore.visible }"
        title="Toggle File Manager (⌘\)"
        @click="sidebarStore.toggleSidebar()"
      >
        <svg viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="5" height="14" rx="1" opacity="0.5" />
          <rect x="8" y="1" width="7" height="14" rx="1" />
        </svg>
      </button>
      <!-- Outline toggle -->
      <button
        class="panel-toggle-btn"
        :class="{ active: outlineStore.visible }"
        title="Toggle Outline (⌘⇧1)"
        @click="outlineStore.toggleOutline()"
      >
        <svg viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="7" height="14" rx="1" />
          <rect x="10" y="1" width="5" height="14" rx="1" opacity="0.5" />
        </svg>
      </button>
      <div class="panel-toggle-divider"></div>
      <!-- Auto-save status indicator -->
      <span
        v-if="tabsStore.activeTab"
        class="save-status"
        :class="'save-status--' + autoSaveStore.status"
        :title="saveTooltip"
      >
        <span class="save-status-icon">{{ autoSaveStore.statusIcon }}</span>
        <span class="save-status-text">{{ autoSaveStore.statusText }}</span>
      </span>
    </div>
    <div class="status-bar-center">
      <!-- File path display -->
      <div v-if="tabsStore.activeTab" class="file-path-display">
        <span class="file-path-text" :title="tabsStore.activeTab.filePath || 'Unsaved document'">
          {{ displayPath }}
        </span>
        <button
          v-if="tabsStore.activeTab.filePath"
          class="copy-path-btn"
          title="Copy full path"
          @click="copyPath"
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 4h6v1H4V4zm0 2h6v1H4V6zm0 2h4v1H4V8z"/>
            <path d="M10 1H2a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V2a1 1 0 00-1-1zm0 11H2V2h8v10z"/>
            <path d="M13 4h1v9a1 1 0 01-1 1H5v-1h8V4z"/>
          </svg>
        </button>
        <span v-if="copied" class="copy-confirm">Copied!</span>
      </div>
      <div class="path-word-divider" v-if="tabsStore.activeTab?.filePath && wordCountStore.displayText" />
      <!-- Word count display (Typora-style: click to expand details) -->
      <div
        v-if="tabsStore.activeTab"
        class="word-count"
        @click="wordCountStore.toggleDetails()"
        :title="'Click for detailed statistics'"
      >
        <span class="word-count-text">{{ wordCountStore.displayText }}</span>
      </div>
      <!-- Word count detail popover -->
      <Transition name="wc-popover">
        <div
          v-if="wordCountStore.showDetails && tabsStore.activeTab"
          class="word-count-popover"
          @click.stop
        >
          <div class="wc-popover-title">Document Statistics</div>
          <div
            v-for="item in wordCountStore.detailLines"
            :key="item.label"
            class="wc-popover-row"
          >
            <span class="wc-label">{{ item.label }}</span>
            <span class="wc-value">{{ item.value }}</span>
          </div>
        </div>
      </Transition>
    </div>
    <div class="status-bar-right">
      <!-- Link mode toggle: Browse (click opens) vs Edit (hover popup) -->
      <button
        class="mode-toggle-btn"
        :class="{ active: editorSettings.linkMode === 'edit' }"
        :title="editorSettings.linkMode === 'browse' ? 'Link mode: Browse (click opens URL) — click to switch to Edit mode' : 'Link mode: Edit (hover for options) — click to switch to Browse mode'"
        @click="editorSettings.linkMode = editorSettings.linkMode === 'browse' ? 'edit' : 'browse'"
      >
        <svg class="mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        <span class="mode-label">{{ editorSettings.linkMode === 'browse' ? 'Browse' : 'Edit' }}</span>
      </button>
      <button
        class="mode-toggle-btn"
        :class="{ active: editorModeStore.mode === 'source' }"
        :title="editorModeStore.mode === 'wysiwyg' ? 'Switch to Source Mode (⌘/)' : 'Switch to WYSIWYG Mode (⌘/)'"
        @click="handleModeToggle()"
      >
        <!-- Source code icon -->
        <svg
          v-if="editorModeStore.mode === 'wysiwyg'"
          class="mode-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
        <!-- WYSIWYG/eye icon -->
        <svg
          v-else
          class="mode-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span class="mode-label">{{ editorModeStore.mode === 'wysiwyg' ? 'WYSIWYG' : 'Source' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useEditorModeStore } from '../stores/editorMode'
import { useAutoSaveStore } from '../stores/autoSave'
import { useTabsStore } from '../stores/tabs'
import { useWordCountStore } from '../stores/wordCount'
import { useSidebarStore } from '../stores/sidebar'
import { useOutlineStore } from '../stores/outline'
import { useEditorSettingsStore } from '../stores/editorSettings'

const editorModeStore = useEditorModeStore()
const autoSaveStore = useAutoSaveStore()
const tabsStore = useTabsStore()

const wordCountStore = useWordCountStore()
const sidebarStore = useSidebarStore()
const outlineStore = useOutlineStore()
const editorSettings = useEditorSettingsStore()

const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

/** Shortened path for display: show last 2 segments or "Untitled" */
const displayPath = computed(() => {
  const tab = tabsStore.activeTab
  if (!tab) return ''
  if (!tab.filePath) return tab.title
  const parts = tab.filePath.split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : tab.filePath
})

async function copyPath() {
  const path = tabsStore.activeTab?.filePath
  if (!path) return
  await navigator.clipboard.writeText(path)
  copied.value = true
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copied.value = false }, 1500)
}

/**
 * Toggle editor mode with proper content capture.
 * WYSIWYG→source is handled via gdown:toggle-mode event so Editor.vue's
 * handleToggleMode runs (which serializes TipTap content before switching).
 * Source→WYSIWYG just sets mode directly — source/SourceEditor.vue's
 * updateListener already keeps tab state current.
 */
function handleModeToggle() {
  if (editorModeStore.isWysiwyg) {
    window.dispatchEvent(new CustomEvent('gdown:toggle-mode'))
  } else {
    editorModeStore.setMode('wysiwyg')
  }
}

// Close word count popover when clicking outside
function handleGlobalClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.word-count') && !target.closest('.word-count-popover')) {
    wordCountStore.showDetails = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleGlobalClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
})

const saveTooltip = computed(() => {
  const tab = tabsStore.activeTab
  if (!tab) return ''

  if (tab.isUntitled) {
    return 'Unsaved document — use ⌘S to save'
  }

  switch (autoSaveStore.status) {
    case 'saved':
      if (autoSaveStore.lastSavedAt) {
        return `Saved at ${autoSaveStore.lastSavedAt.toLocaleTimeString()}`
      }
      return 'No unsaved changes'
    case 'unsaved':
      return 'Unsaved changes — auto-saving soon...'
    case 'saving':
      return 'Saving to disk...'
    case 'error':
      return autoSaveStore.errorMessage || 'Failed to save'
  }
})
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  padding: 0 12px;
  background: var(--tab-bar-bg, #e8e8e8);
  border-top: 1px solid var(--tab-bar-border, #d0d0d0);
  font-size: 11px;
  color: var(--tab-text-color, #777);
  flex-shrink: 0;
  user-select: none;
  -webkit-app-region: no-drag;
}

.status-bar-left,
.status-bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* File path display */
.file-path-display {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--tab-text-color, #999);
  max-width: 280px;
}

.file-path-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'SF Mono', Menlo, monospace;
  font-size: 10px;
  opacity: 0.8;
}

.copy-path-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--tab-text-color, #999);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.file-path-display:hover .copy-path-btn {
  opacity: 1;
}

.copy-path-btn svg {
  width: 12px;
  height: 12px;
}

.copy-path-btn:hover {
  color: var(--tab-text-active-color, #333);
}

.copy-confirm {
  font-size: 10px;
  color: #4caf50;
  flex-shrink: 0;
}

.path-word-divider {
  width: 1px;
  height: 10px;
  background: var(--tab-separator-color, rgba(0,0,0,0.12));
  margin: 0 4px;
}

/* Panel toggle buttons (sidebar / outline) */
.panel-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--tab-text-color, #999);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.panel-toggle-btn svg {
  width: 14px;
  height: 14px;
}

.panel-toggle-btn:hover {
  color: var(--tab-text-active-color, #333);
  background: var(--tab-hover-bg, rgba(0,0,0,0.06));
}

.panel-toggle-btn.active {
  color: var(--tab-active-indicator, #4a9eff);
}

.panel-toggle-divider {
  width: 1px;
  height: 12px;
  background: var(--tab-separator-color, rgba(0,0,0,0.12));
  margin: 0 2px;
}

/* Save status indicator */
.save-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  line-height: 1;
  transition: color 0.2s ease, opacity 0.2s ease;
}

.save-status-icon {
  font-size: 10px;
  flex-shrink: 0;
}

.save-status-text {
  white-space: nowrap;
}

/* Saved state — subtle green check */
.save-status--saved {
  color: #86a386;
}

.save-status--saved .save-status-icon {
  color: #5a9a5a;
}

/* Unsaved state — amber dot */
.save-status--unsaved {
  color: var(--tab-modified-dot-color, #f59e0b);
}

.save-status--unsaved .save-status-icon {
  font-size: 12px;
}

/* Saving state — animated spinner effect */
.save-status--saving {
  color: var(--tab-active-indicator, #4a9eff);
}

.save-status--saving .save-status-icon {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Error state — red */
.save-status--error {
  color: #d94f4f;
}

.save-status--error .save-status-icon {
  color: #c33;
}

/* Word count center section */
.status-bar-center {
  display: flex;
  align-items: center;
  position: relative;
}

.word-count {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.word-count:hover {
  background: var(--tab-hover-bg, rgba(0, 0, 0, 0.06));
  color: var(--tab-text-active-color, #333);
}

.word-count-text {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

/* Word count detail popover */
.word-count-popover {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 6px;
  background: var(--sidebar-bg, #f5f5f5);
  border: 1px solid var(--sidebar-border, #d0d0d0);
  border-radius: 8px;
  padding: 10px 14px;
  min-width: 220px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 100;
  font-size: 12px;
}

.wc-popover-title {
  font-weight: 600;
  font-size: 12px;
  color: var(--tab-text-active-color, #333);
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--tab-bar-border, #e0e0e0);
}

.wc-popover-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  color: var(--tab-text-color, #666);
}

.wc-label {
  font-size: 11px;
}

.wc-value {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--tab-text-active-color, #333);
}

/* Popover transition */
.wc-popover-enter-active,
.wc-popover-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.wc-popover-enter-from,
.wc-popover-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
}

.mode-toggle-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--tab-text-color, #777);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1;
}

.mode-toggle-btn:hover {
  background: var(--tab-hover-bg, rgba(0, 0, 0, 0.06));
  color: var(--tab-text-active-color, #333);
}

.mode-toggle-btn.active {
  background: rgba(74, 158, 255, 0.12);
  color: var(--tab-active-indicator, #4a9eff);
}

.mode-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.mode-label {
  font-weight: 500;
  letter-spacing: 0.02em;
}
</style>
