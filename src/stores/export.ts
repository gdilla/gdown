import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useTabsStore } from './tabs'

/** Supported export format info returned from the backend */
export interface ExportFormatInfo {
  id: string
  label: string
  extension: string
}

/** Pandoc installation info */
export interface PandocInfo {
  path: string
  version: string
}

/** Result of an export operation */
export interface ExportResult {
  success: boolean
  output_path: string
  message: string
}

export type ExportStatus = 'idle' | 'checking' | 'exporting' | 'success' | 'error'

export const useExportStore = defineStore('export', () => {
  // Dialog visibility
  const dialogVisible = ref(false)

  // Pandoc status
  const pandocInfo = ref<PandocInfo | null>(null)
  const pandocError = ref<string | null>(null)
  const pandocChecked = ref(false)

  // Export formats
  const formats = ref<ExportFormatInfo[]>([])

  // Selected format
  const selectedFormatId = ref<string>('pdf')

  // Custom output path (null = use default derived from source file)
  const customOutputPath = ref<string | null>(null)

  // Optional Pandoc flags
  const extraFlags = ref<string>('')

  // Include table of contents
  const includeToc = ref(false)

  // Export status
  const status = ref<ExportStatus>('idle')
  const statusMessage = ref('')
  const lastExportPath = ref<string | null>(null)

  // Computed
  const selectedFormat = computed(() =>
    formats.value.find(f => f.id === selectedFormatId.value) ?? null
  )

  const isPandocAvailable = computed(() => pandocInfo.value !== null)

  const isExporting = computed(() => status.value === 'exporting')

  const canExport = computed(() => {
    const tabsStore = useTabsStore()
    return isPandocAvailable.value && tabsStore.activeTab !== null && !isExporting.value
  })

  /**
   * Check if Pandoc is installed and get its version info.
   */
  async function checkPandoc(): Promise<boolean> {
    status.value = 'checking'
    pandocError.value = null

    try {
      const info = await invoke<PandocInfo>('check_pandoc')
      pandocInfo.value = info
      pandocChecked.value = true
      status.value = 'idle'
      return true
    } catch (err) {
      pandocInfo.value = null
      pandocError.value = typeof err === 'string' ? err : String(err)
      pandocChecked.value = true
      status.value = 'error'
      statusMessage.value = pandocError.value
      return false
    }
  }

  /**
   * Load available export formats from the backend.
   */
  async function loadFormats(): Promise<void> {
    try {
      const result = await invoke<ExportFormatInfo[]>('get_export_formats')
      formats.value = result
    } catch (err) {
      console.error('Failed to load export formats:', err)
      // Fallback formats
      formats.value = [
        { id: 'pdf', label: 'PDF', extension: 'pdf' },
        { id: 'html', label: 'HTML', extension: 'html' },
        { id: 'word', label: 'Word (.docx)', extension: 'docx' },
        { id: 'latex', label: 'LaTeX', extension: 'tex' },
        { id: 'epub', label: 'EPUB', extension: 'epub' },
        { id: 'rtf', label: 'RTF', extension: 'rtf' },
      ]
    }
  }

  /**
   * Open the export dialog. Checks Pandoc and loads formats if needed.
   */
  async function openDialog(): Promise<void> {
    dialogVisible.value = true
    status.value = 'idle'
    statusMessage.value = ''
    lastExportPath.value = null

    // Check Pandoc if not already checked
    if (!pandocChecked.value) {
      await checkPandoc()
    }

    // Load formats if not already loaded
    if (formats.value.length === 0) {
      await loadFormats()
    }
  }

  /**
   * Close the export dialog and reset transient state.
   */
  function closeDialog(): void {
    dialogVisible.value = false
    // Keep status for a moment if success, then reset
    if (status.value !== 'exporting') {
      setTimeout(() => {
        if (!dialogVisible.value) {
          status.value = 'idle'
          statusMessage.value = ''
        }
      }, 300)
    }
  }

  /**
   * Open native save dialog for choosing export output path.
   */
  async function chooseOutputPath(): Promise<void> {
    const tabsStore = useTabsStore()
    const activeTab = tabsStore.activeTab
    const defaultName = activeTab?.title ?? 'Untitled'

    try {
      const path = await invoke<string | null>('export_save_dialog', {
        format: selectedFormatId.value,
        defaultName,
      })
      if (path) {
        customOutputPath.value = path
      }
    } catch (err) {
      console.error('Failed to open export save dialog:', err)
    }
  }

  /**
   * Get the default output path based on the active tab's file path and selected format.
   */
  function getDefaultOutputPath(): string {
    const tabsStore = useTabsStore()
    const activeTab = tabsStore.activeTab
    const format = selectedFormat.value

    if (!activeTab || !format) return ''

    if (activeTab.filePath) {
      // Replace extension
      const basePath = activeTab.filePath.replace(/\.[^.]+$/, '')
      return `${basePath}.${format.extension}`
    }

    return `${activeTab.title}.${format.extension}`
  }

  /**
   * Execute the export operation.
   */
  async function performExport(): Promise<boolean> {
    const tabsStore = useTabsStore()
    const activeTab = tabsStore.activeTab

    if (!activeTab) {
      status.value = 'error'
      statusMessage.value = 'No active document to export.'
      return false
    }

    if (!isPandocAvailable.value) {
      status.value = 'error'
      statusMessage.value = 'Pandoc is not installed.'
      return false
    }

    // Get the markdown content
    const markdown = activeTab.editorState.markdown
    if (!markdown || markdown.trim() === '') {
      status.value = 'error'
      statusMessage.value = 'Document is empty — nothing to export.'
      return false
    }

    // Determine output path
    let outputPath = customOutputPath.value
    if (!outputPath) {
      // Open save dialog to choose path
      await chooseOutputPath()
      outputPath = customOutputPath.value
      if (!outputPath) {
        // User cancelled the dialog
        return false
      }
    }

    // Get resource path (directory of the source file, for resolving images)
    let resourcePath: string | null = null
    if (activeTab.filePath) {
      const lastSlash = activeTab.filePath.lastIndexOf('/')
      if (lastSlash > 0) {
        resourcePath = activeTab.filePath.substring(0, lastSlash)
      }
    }

    // Get document title
    const title = activeTab.title.replace(/\.[^.]+$/, '') || 'Untitled'

    status.value = 'exporting'
    statusMessage.value = `Exporting to ${selectedFormat.value?.label ?? selectedFormatId.value}...`

    try {
      const result = await invoke<ExportResult>('export_document', {
        markdown,
        outputPath,
        format: selectedFormatId.value,
        title,
        resourcePath,
      })

      if (result.success) {
        status.value = 'success'
        statusMessage.value = result.message
        lastExportPath.value = result.output_path
        return true
      } else {
        status.value = 'error'
        statusMessage.value = result.message
        return false
      }
    } catch (err) {
      status.value = 'error'
      statusMessage.value = typeof err === 'string' ? err : `Export failed: ${String(err)}`
      return false
    }
  }

  /**
   * Reset the export state for a fresh export.
   */
  function reset(): void {
    customOutputPath.value = null
    extraFlags.value = ''
    includeToc.value = false
    status.value = 'idle'
    statusMessage.value = ''
    lastExportPath.value = null
  }

  return {
    // State
    dialogVisible,
    pandocInfo,
    pandocError,
    pandocChecked,
    formats,
    selectedFormatId,
    customOutputPath,
    extraFlags,
    includeToc,
    status,
    statusMessage,
    lastExportPath,

    // Computed
    selectedFormat,
    isPandocAvailable,
    isExporting,
    canExport,

    // Actions
    checkPandoc,
    loadFormats,
    openDialog,
    closeDialog,
    chooseOutputPath,
    getDefaultOutputPath,
    performExport,
    reset,
  }
})
