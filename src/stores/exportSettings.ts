import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

// ─── Export Settings Types ───

export type ExportFormat = 'pdf' | 'html' | 'word' | 'latex' | 'epub' | 'rtf'

export interface ExportSettings {
  /** Legacy value retained when loading older preference files. */
  pandocPath: string
  /** Default export format */
  defaultFormat: ExportFormat
  /** Whether to add a table of contents on export */
  addTableOfContents: boolean
  /** Whether to use standalone mode (full HTML doc, etc.) */
  standalone: boolean
  /** Custom template path for exports (empty = use Pandoc default) */
  customTemplatePath: string
  /** Extra Pandoc CLI arguments (advanced) */
  extraPandocArgs: string
  /** Legacy value retained when loading older preference files. */
  openAfterExport: boolean
}

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  pandocPath: '',
  defaultFormat: 'pdf',
  addTableOfContents: false,
  standalone: true,
  customTemplatePath: '',
  extraPandocArgs: '',
  openAfterExport: true,
}

const STORAGE_KEY = 'gdown-export-settings'

export const useExportSettingsStore = defineStore('exportSettings', () => {
  const settings = ref<ExportSettings>({ ...DEFAULT_EXPORT_SETTINGS })

  /** Whether Pandoc was found and is available (runtime state, not persisted) */
  const pandocAvailable = ref(false)
  /** Detected Pandoc version string (runtime state) */
  const pandocVersion = ref('')
  /** Detected Pandoc path from auto-detection (runtime state) */
  const detectedPandocPath = ref('')

  // ─── Computed ───

  const pandocStatusText = computed(() => {
    if (pandocAvailable.value) {
      return `${pandocVersion.value} (${effectivePandocPath.value})`
    }
    return 'Pandoc not found. Install from pandoc.org to enable export.'
  })

  /** The Pandoc path selected by the backend's auto-detection. */
  const effectivePandocPath = computed(() => {
    return detectedPandocPath.value
  })

  const exportFormats: { id: ExportFormat; label: string; extension: string }[] = [
    { id: 'pdf', label: 'PDF', extension: 'pdf' },
    { id: 'html', label: 'HTML', extension: 'html' },
    { id: 'word', label: 'Word (.docx)', extension: 'docx' },
    { id: 'latex', label: 'LaTeX (.tex)', extension: 'tex' },
    { id: 'epub', label: 'EPUB', extension: 'epub' },
    { id: 'rtf', label: 'RTF', extension: 'rtf' },
  ]

  // ─── Persistence ───

  function load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        settings.value = { ...DEFAULT_EXPORT_SETTINGS, ...parsed }
      }
    } catch (err) {
      console.warn('Failed to load export settings:', err)
    }
  }

  function save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
    } catch (err) {
      console.warn('Failed to save export settings:', err)
    }
  }

  // ─── Pandoc Detection ───

  async function detectPandoc(): Promise<void> {
    try {
      const info = await invoke<{ path: string; version: string }>('check_pandoc')
      pandocAvailable.value = true
      pandocVersion.value = info.version
      detectedPandocPath.value = info.path
    } catch {
      pandocAvailable.value = false
      pandocVersion.value = ''
      detectedPandocPath.value = ''
    }
  }

  /**
   * Open a native file dialog to select a custom export template.
   */
  async function selectExportTemplate(): Promise<void> {
    try {
      const selected = await open({
        title: 'Choose Pandoc template',
        multiple: false,
        directory: false,
      })
      const path = Array.isArray(selected) ? selected[0] : selected
      if (path) {
        settings.value.customTemplatePath = path
        save()
      }
    } catch (err) {
      console.warn('Failed to select export template:', err)
    }
  }

  /**
   * Clear the custom export template path.
   */
  function clearExportTemplate(): void {
    settings.value.customTemplatePath = ''
    save()
  }

  function update<K extends keyof ExportSettings>(key: K, value: ExportSettings[K]): void {
    settings.value[key] = value
    save()
  }

  function reset(): void {
    settings.value = { ...DEFAULT_EXPORT_SETTINGS }
    save()
    detectPandoc()
  }

  // Auto-persist on changes
  watch(settings, () => save(), { deep: true })

  // Load and detect on creation
  load()
  detectPandoc()

  return {
    // State
    settings,
    pandocAvailable,
    pandocVersion,
    detectedPandocPath,

    // Computed
    pandocStatusText,
    effectivePandocPath,
    exportFormats,

    // Actions
    load,
    save,
    update,
    reset,
    detectPandoc,
    selectExportTemplate,
    clearExportTemplate,
  }
})
