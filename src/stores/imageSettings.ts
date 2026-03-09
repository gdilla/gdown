import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

// ─── Image Settings Types ───

export type ImageSaveBehavior = 'copy-to-assets' | 'keep-in-place' | 'move-to-assets'
export type ImagePathType = 'relative' | 'absolute'

export interface ImageSettings {
  /** What to do when an image is inserted (drag/drop, paste, or via dialog) */
  saveBehavior: ImageSaveBehavior
  /** Folder name for storing copied/moved images (relative to document) */
  assetsFolderName: string
  /** Whether to use relative or absolute paths in markdown image references */
  pathType: ImagePathType
  /** Whether to prefer relative paths from the document's directory */
  preferRelativePath: boolean
  /** Whether to auto-rename images on copy to avoid conflicts */
  autoRenameOnConflict: boolean
  /** Upload service (placeholder for future cloud upload support) */
  uploadService: 'none' | 'custom'
  /** Custom upload service URL (for future use) */
  customUploadUrl: string
}

const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  saveBehavior: 'copy-to-assets',
  assetsFolderName: 'assets',
  pathType: 'relative',
  preferRelativePath: true,
  autoRenameOnConflict: true,
  uploadService: 'none',
  customUploadUrl: '',
}

const STORAGE_KEY = 'gdown-image-settings'

export const useImageSettingsStore = defineStore('imageSettings', () => {
  const settings = ref<ImageSettings>({ ...DEFAULT_IMAGE_SETTINGS })

  function load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        settings.value = { ...DEFAULT_IMAGE_SETTINGS, ...parsed }
      }
    } catch (err) {
      console.warn('Failed to load image settings:', err)
    }
  }

  function save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
    } catch (err) {
      console.warn('Failed to save image settings:', err)
    }
  }

  function update<K extends keyof ImageSettings>(key: K, value: ImageSettings[K]): void {
    settings.value[key] = value
    save()
  }

  function reset(): void {
    settings.value = { ...DEFAULT_IMAGE_SETTINGS }
    save()
  }

  // Auto-persist on changes
  watch(settings, () => save(), { deep: true })

  // Load on creation
  load()

  return {
    settings,
    load,
    save,
    update,
    reset,
  }
})
