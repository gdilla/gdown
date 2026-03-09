import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'

// ─── Export Settings Types ───

export type ExportFormat = 'pdf' | 'html' | 'word' | 'latex' | 'epub' | 'rtf'

export interface ExportSettings {
  /** Path to the Pandoc binary (empty = auto-detect) */
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
  /** Whether to open the exported file after export */
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
    if (settings.value.pandocPath) {
      return `Not found at: ${settings.value.pandocPath}`
    }
    return 'Pandoc not found. Install from pandoc.org or set the path manually.'
  })

  /** The effective Pandoc path (custom or auto-detected) */
  const effectivePandocPath = computed(() => {
    return settings.value.pandocPath || detectedPandocPath.value
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
      if (settings.value.pandocPath) {
        // Validate the custom path
        const info = await invoke<{ path: string; version: string }>('check_pandoc_at_path', {
          pandocPath: settings.value.pandocPath,
        })
        pandocAvailable.value = true
        pandocVersion.value = info.version
        detectedPandocPath.value = info.path
        return
      }

      // Auto-detect Pandoc
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
   * Open a native file dialog to select a Pandoc binary.
   */
  async function selectPandocPath(): Promise<void> {
    try {
      const path = await invoke<string | null>('select_pandoc_binary')
      if (path) {
        settings.value.pandocPath = path
        save()
        await detectPandoc()
      }
    } catch (err) {
      console.warn('Failed to select Pandoc binary:', err)
    }
  }

  /**
   * Open a native file dialog to select a custom export template.
   */
  async function selectExportTemplate(): Promise<void> {
    try {
      const path = await invoke<string | null>('select_export_template')
      if (path) {
        settings.value.customTemplatePath = path
        save()
      }
    } catch (err) {
      console.warn('Failed to select export template:', err)
    }
  }

  /**
   * Clear the custom Pandoc path and re-detect.
   */
  async function clearPandocPath(): Promise<void> {
    settings.value.pandocPath = ''
    save()
    await detectPandoc()
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
    selectPandocPath,
    selectExportTemplate,
    clearPandocPath,
    clearExportTemplate,
  }
})
