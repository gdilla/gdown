import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

/** Entry representing a recently opened file or folder */
export interface RecentEntry {
  /** Absolute path to the file or folder */
  path: string
  /** Whether this entry is a folder (true) or file (false) */
  isFolder: boolean
  /** Display name (file/folder name extracted from path) */
  name: string
  /** ISO 8601 timestamp of last access */
  lastOpenedAt: string
}

const STORAGE_KEY = 'gdown-recent-files'
const DEFAULT_MAX_HISTORY = 20

/**
 * Load persisted recent entries from localStorage.
 */
function loadFromStorage(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Validate each entry has the required fields
    return parsed.filter(
      (e: any) =>
        typeof e.path === 'string' &&
        typeof e.isFolder === 'boolean' &&
        typeof e.name === 'string' &&
        typeof e.lastOpenedAt === 'string'
    )
  } catch {
    return []
  }
}

/**
 * Persist recent entries to localStorage.
 */
function saveToStorage(entries: RecentEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch (e) {
    console.error('Failed to persist recent files:', e)
  }
}

/**
 * Extract the file or folder name from an absolute path.
 */
function nameFromPath(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

export const useRecentFilesStore = defineStore('recentFiles', () => {
  /** Maximum number of recent entries to keep */
  const maxHistory = ref(DEFAULT_MAX_HISTORY)

  /** All recent entries, sorted by most recently opened first */
  const entries = ref<RecentEntry[]>(loadFromStorage())

  /** Recent files only */
  const recentFiles = computed(() =>
    entries.value.filter((e) => !e.isFolder)
  )

  /** Recent folders only */
  const recentFolders = computed(() =>
    entries.value.filter((e) => e.isFolder)
  )

  /** Whether there are any recent entries */
  const hasRecent = computed(() => entries.value.length > 0)

  // Auto-persist whenever entries change
  watch(
    entries,
    (newEntries) => {
      saveToStorage(newEntries)
    },
    { deep: true }
  )

  /**
   * Add or update a recent file entry.
   * If the path already exists, it moves to the top with an updated timestamp.
   * Trims the list to maxHistory size.
   */
  function addRecentFile(filePath: string): void {
    addEntry(filePath, false)
  }

  /**
   * Add or update a recent folder entry.
   * If the path already exists, it moves to the top with an updated timestamp.
   * Trims the list to maxHistory size.
   */
  function addRecentFolder(folderPath: string): void {
    addEntry(folderPath, true)
  }

  /**
   * Internal: add or update an entry.
   */
  function addEntry(path: string, isFolder: boolean): void {
    // Remove existing entry for this path (if any)
    const filtered = entries.value.filter((e) => e.path !== path)

    const entry: RecentEntry = {
      path,
      isFolder,
      name: nameFromPath(path),
      lastOpenedAt: new Date().toISOString(),
    }

    // Prepend the new/updated entry
    filtered.unshift(entry)

    // Trim to max history size
    entries.value = filtered.slice(0, maxHistory.value)
  }

  /**
   * Remove a specific entry by path.
   */
  function removeEntry(path: string): void {
    entries.value = entries.value.filter((e) => e.path !== path)
  }

  /**
   * Clear all recent entries.
   */
  function clearAll(): void {
    entries.value = []
  }

  /**
   * Clear only recent files (keeps folders).
   */
  function clearRecentFiles(): void {
    entries.value = entries.value.filter((e) => e.isFolder)
  }

  /**
   * Clear only recent folders (keeps files).
   */
  function clearRecentFolders(): void {
    entries.value = entries.value.filter((e) => !e.isFolder)
  }

  /**
   * Update the maximum history size.
   * If the new size is smaller, trims the oldest entries.
   */
  function setMaxHistory(size: number): void {
    if (size < 1) size = 1
    maxHistory.value = size
    if (entries.value.length > size) {
      entries.value = entries.value.slice(0, size)
    }
  }

  /**
   * Get the most recently opened file path, or null if none.
   */
  function getLastOpenedFile(): string | null {
    const file = recentFiles.value[0]
    return file ? file.path : null
  }

  /**
   * Get the most recently opened folder path, or null if none.
   */
  function getLastOpenedFolder(): string | null {
    const folder = recentFolders.value[0]
    return folder ? folder.path : null
  }

  return {
    // State
    entries,
    maxHistory,

    // Computed
    recentFiles,
    recentFolders,
    hasRecent,

    // Actions
    addRecentFile,
    addRecentFolder,
    removeEntry,
    clearAll,
    clearRecentFiles,
    clearRecentFolders,
    setMaxHistory,
    getLastOpenedFile,
    getLastOpenedFolder,
  }
})
