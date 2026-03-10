<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useAiFilesStore } from '../../stores/aiFiles'
import { useSidebarStore } from '../../stores/sidebar'
import { useTabsStore } from '../../stores/tabs'
import { useRecentFilesStore } from '../../stores/recentFiles'
import type { AiFile } from '../../stores/aiFiles'

const aiFiles = useAiFilesStore()
const sidebar = useSidebarStore()
const tabs = useTabsStore()
const recentFiles = useRecentFilesStore()

/** Open a file in a new tab */
async function handleFileClick(file: AiFile) {
  const tab = await tabs.openFile(file.path)
  if (tab) {
    recentFiles.addRecentFile(file.path)
  }
}

/** Shorten a path relative to project root for display */
function shortPath(fullPath: string): string {
  const root = sidebar.rootPath
  if (root && fullPath.startsWith(root)) {
    return fullPath.slice(root.length + 1)
  }
  // For global files, show from ~/.claude/
  const claudeIdx = fullPath.indexOf('/.claude/')
  if (claudeIdx >= 0) {
    return '~' + fullPath.slice(claudeIdx)
  }
  return fullPath
}

/** Format a unix timestamp (seconds) to a relative or short date */
function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Trigger discovery when mounted or when rootPath changes */
function discover() {
  if (sidebar.rootPath) {
    aiFiles.discoverFiles(sidebar.rootPath)
  }
}

onMounted(() => {
  discover()
})

watch(
  () => sidebar.rootPath,
  () => {
    discover()
  },
)
</script>

<template>
  <div class="ai-files-panel">
    <!-- Loading state -->
    <div v-if="aiFiles.loading" class="panel-status">
      <span class="loading-spinner"></span>
      Scanning for AI files...
    </div>

    <!-- Error state -->
    <div v-else-if="aiFiles.error" class="panel-status panel-error">
      <p>{{ aiFiles.error }}</p>
      <button class="retry-btn" @click="discover">Retry</button>
    </div>

    <!-- Empty state -->
    <div v-else-if="!aiFiles.hasAnyFiles" class="panel-empty">
      <p class="empty-message">No AI files found</p>
      <p class="empty-hint">Add a <code>CLAUDE.md</code> to your project root to get started.</p>
    </div>

    <!-- File sections -->
    <div v-else class="panel-sections">
      <!-- Instructions section -->
      <section v-if="aiFiles.instructions.length > 0" class="file-section">
        <h3 class="section-title">Instructions</h3>
        <div
          v-for="file in aiFiles.instructions"
          :key="file.path"
          class="file-row"
          :title="file.path"
          role="button"
          tabindex="0"
          @click="handleFileClick(file)"
          @keydown.enter.prevent="handleFileClick(file)"
        >
          <svg class="file-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z"
            />
          </svg>
          <span class="file-name">{{ file.name }}</span>
          <span class="file-path">{{ shortPath(file.path) }}</span>
        </div>
      </section>

      <!-- Sessions section -->
      <section v-if="aiFiles.sessions.length > 0" class="file-section">
        <h3 class="section-title">Sessions</h3>
        <div
          v-for="file in aiFiles.sessions"
          :key="file.path"
          class="file-row"
          :title="file.path"
          role="button"
          tabindex="0"
          @click="handleFileClick(file)"
          @keydown.enter.prevent="handleFileClick(file)"
        >
          <svg class="file-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z"
            />
          </svg>
          <span class="file-name">{{ file.name }}</span>
          <span class="file-date">{{ formatDate(file.modifiedAt) }}</span>
        </div>
      </section>

      <!-- Memory section -->
      <section v-if="aiFiles.memoryFiles.length > 0" class="file-section">
        <h3 class="section-title">Memory</h3>
        <div
          v-for="file in aiFiles.memoryFiles"
          :key="file.path"
          class="file-row"
          :title="file.path"
          role="button"
          tabindex="0"
          @click="handleFileClick(file)"
          @keydown.enter.prevent="handleFileClick(file)"
        >
          <svg class="file-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M4 0h5.293A1 1 0 0 1 10 .293L13.707 4a1 1 0 0 1 .293.707V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5.5 1.5v2a1 1 0 0 0 1 1h2l-3-3z"
            />
          </svg>
          <span class="file-name">{{ file.name }}</span>
          <span class="file-date">{{ formatDate(file.modifiedAt) }}</span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ai-files-panel {
  padding: 4px 0;
}

.panel-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--sidebar-text-color, #666);
  font-size: 13px;
}

.panel-error {
  flex-direction: column;
  align-items: flex-start;
  color: var(--sidebar-error-color, #d32f2f);
}

.panel-error p {
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

.panel-empty {
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
  margin: 0 0 8px;
}

.empty-hint {
  color: var(--sidebar-text-color, #aaa);
  font-size: 11px;
  margin: 0;
}

.empty-hint code {
  padding: 1px 4px;
  background: var(--sidebar-hover-bg, rgba(0, 0, 0, 0.06));
  border-radius: 3px;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', Monaco, monospace;
}

.panel-sections {
  padding: 0 4px;
}

.file-section {
  margin-bottom: 8px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--sidebar-title-color, #888);
  margin: 0;
  padding: 8px 8px 4px;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.4;
  transition: background-color 0.1s ease;
  outline: none;
}

.file-row:hover {
  background-color: var(--sidebar-hover-bg, rgba(0, 0, 0, 0.06));
}

.file-row:focus-visible {
  outline: 2px solid var(--sidebar-selected-color, #007aff);
  outline-offset: -2px;
}

.file-icon {
  flex-shrink: 0;
  color: var(--sidebar-file-color, #999);
}

.file-name {
  color: var(--sidebar-text-color, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-path {
  color: var(--sidebar-text-color, #aaa);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: auto;
  flex-shrink: 1;
  min-width: 0;
}

.file-date {
  color: var(--sidebar-text-color, #aaa);
  font-size: 11px;
  white-space: nowrap;
  margin-left: auto;
  flex-shrink: 0;
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
</style>
