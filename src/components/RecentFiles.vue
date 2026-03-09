<script setup lang="ts">
import { computed } from 'vue'
import { useRecentFilesStore, type RecentEntry } from '../stores/recentFiles'
import { useTabsStore } from '../stores/tabs'
import { useSidebarStore } from '../stores/sidebar'

const recentStore = useRecentFilesStore()
const tabsStore = useTabsStore()
const sidebarStore = useSidebarStore()

const recentFiles = computed(() => recentStore.recentFiles)
const recentFolders = computed(() => recentStore.recentFolders)
const hasAnyRecent = computed(() => recentStore.hasRecent)

/** Open a recent file in a new tab (or switch to it if already open) */
function openRecentFile(entry: RecentEntry) {
  const existingTab = tabsStore.tabs.find((t) => t.filePath === entry.path)
  if (existingTab) {
    tabsStore.setActiveTab(existingTab.id)
  } else {
    tabsStore.createTab(entry.path)
  }
  // Re-add to bump it to the top of recents
  recentStore.addRecentFile(entry.path)
}

/** Open a recent folder in the sidebar */
function openRecentFolder(entry: RecentEntry) {
  sidebarStore.openFolder(entry.path)
  sidebarStore.showSidebar()
  // Re-add to bump it to the top of recents
  recentStore.addRecentFolder(entry.path)
}

/** Remove a single entry from history */
function removeEntry(entry: RecentEntry, event: MouseEvent) {
  event.stopPropagation()
  recentStore.removeEntry(entry.path)
}

/** Clear all recent history */
function clearAllRecent() {
  recentStore.clearAll()
}

/** Format relative time for display */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Get the parent directory from a path for display */
function parentDir(path: string): string {
  const parts = path.split('/')
  if (parts.length <= 2) return '/'
  return parts.slice(0, -1).join('/')
}
</script>

<template>
  <div class="recent-files">
    <!-- No recent items -->
    <div v-if="!hasAnyRecent" class="recent-empty">
      <p class="recent-empty-text">No recent files or folders</p>
    </div>

    <template v-else>
      <!-- Recent Files section -->
      <div v-if="recentFiles.length > 0" class="recent-section">
        <div class="recent-section-header">
          <h3 class="recent-section-title">Recent Files</h3>
        </div>
        <ul class="recent-list">
          <li
            v-for="entry in recentFiles"
            :key="entry.path"
            class="recent-item"
            :title="entry.path"
            @click="openRecentFile(entry)"
          >
            <div class="recent-item-icon file-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.414A2 2 0 0 0 13.414 3L11 .586A2 2 0 0 0 9.586 0H4zm5.5 1.5v2A1.5 1.5 0 0 0 11 5h2v9a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 14V2a.5.5 0 0 1 .5-.5h6z"/>
              </svg>
            </div>
            <div class="recent-item-info">
              <span class="recent-item-name">{{ entry.name }}</span>
              <span class="recent-item-path">{{ parentDir(entry.path) }}</span>
            </div>
            <span class="recent-item-time">{{ formatRelativeTime(entry.lastOpenedAt) }}</span>
            <button
              class="recent-item-remove"
              title="Remove from recent"
              @click="removeEntry(entry, $event)"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
              </svg>
            </button>
          </li>
        </ul>
      </div>

      <!-- Recent Folders section -->
      <div v-if="recentFolders.length > 0" class="recent-section">
        <div class="recent-section-header">
          <h3 class="recent-section-title">Recent Folders</h3>
        </div>
        <ul class="recent-list">
          <li
            v-for="entry in recentFolders"
            :key="entry.path"
            class="recent-item"
            :title="entry.path"
            @click="openRecentFolder(entry)"
          >
            <div class="recent-item-icon folder-icon">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3H13.5a2 2 0 0 1 2 2v.092l-1-.341V5a1 1 0 0 0-1-1H9.828a3 3 0 0 1-2.12-.879l-.83-.828A1 1 0 0 0 6.173 2H2.5a1 1 0 0 0-1 1v.87L.54 3.87zM14.956 5.8l.644.22a.5.5 0 0 1 .309.635l-2 7a.5.5 0 0 1-.479.345H2.57a.5.5 0 0 1-.48-.345l-2-7a.5.5 0 0 1 .31-.635l.643-.22 1.489 5.21a.5.5 0 0 0 .48.345h9.977a.5.5 0 0 0 .48-.345l1.488-5.21z"/>
              </svg>
            </div>
            <div class="recent-item-info">
              <span class="recent-item-name">{{ entry.name }}</span>
              <span class="recent-item-path">{{ parentDir(entry.path) }}</span>
            </div>
            <span class="recent-item-time">{{ formatRelativeTime(entry.lastOpenedAt) }}</span>
            <button
              class="recent-item-remove"
              title="Remove from recent"
              @click="removeEntry(entry, $event)"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
              </svg>
            </button>
          </li>
        </ul>
      </div>

      <!-- Clear all button -->
      <div class="recent-footer">
        <button class="clear-all-btn" @click="clearAllRecent">
          Clear Recent History
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.recent-files {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 8px 0;
}

.recent-empty {
  text-align: center;
  padding: 24px 16px;
}

.recent-empty-text {
  color: #999;
  font-size: 13px;
  margin: 0;
}

.recent-section {
  margin-bottom: 8px;
}

.recent-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px 4px;
}

.recent-section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #888;
  margin: 0;
}

.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  cursor: pointer;
  border-radius: 6px;
  margin: 1px 6px;
  transition: background-color 0.1s ease;
  position: relative;
}

.recent-item:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.recent-item:active {
  background-color: rgba(0, 0, 0, 0.08);
}

.recent-item-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
}

.file-icon {
  color: #4a90d9;
  background-color: rgba(74, 144, 217, 0.1);
}

.folder-icon {
  color: #e8a838;
  background-color: rgba(232, 168, 56, 0.1);
}

.recent-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.recent-item-name {
  font-size: 13px;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-item-path {
  font-size: 11px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-item-time {
  flex-shrink: 0;
  font-size: 11px;
  color: #aaa;
  white-space: nowrap;
}

.recent-item-remove {
  display: none;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  color: #999;
  padding: 0;
  transition: background-color 0.1s ease, color 0.1s ease;
}

.recent-item:hover .recent-item-remove {
  display: flex;
}

.recent-item:hover .recent-item-time {
  display: none;
}

.recent-item-remove:hover {
  background-color: rgba(0, 0, 0, 0.1);
  color: #d32f2f;
}

.recent-footer {
  display: flex;
  justify-content: center;
  padding: 12px 12px 4px;
  border-top: 1px solid #eee;
  margin-top: 4px;
}

.clear-all-btn {
  padding: 5px 14px;
  border: 1px solid #d0d0d0;
  border-radius: 5px;
  background: #f8f8f8;
  color: #777;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.clear-all-btn:hover {
  background: #eee;
  color: #555;
  border-color: #bbb;
}

/* Dark theme support via CSS variables */
@media (prefers-color-scheme: dark) {
  .recent-section-title {
    color: #aaa;
  }

  .recent-item:hover {
    background-color: rgba(255, 255, 255, 0.06);
  }

  .recent-item:active {
    background-color: rgba(255, 255, 255, 0.1);
  }

  .recent-item-name {
    color: #ddd;
  }

  .recent-item-path {
    color: #777;
  }

  .recent-item-time {
    color: #666;
  }

  .recent-item-remove:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  .recent-footer {
    border-top-color: #333;
  }

  .clear-all-btn {
    background: #2a2a2a;
    border-color: #444;
    color: #999;
  }

  .clear-all-btn:hover {
    background: #333;
    color: #ccc;
    border-color: #555;
  }
}
</style>
