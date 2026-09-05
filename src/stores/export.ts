import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useTabsStore } from './tabs'
import { useExportSettingsStore } from './exportSettings'
import { getExportConfig } from '../services/export'
import { assembleFullMarkdown } from '../utils/copyMarkdown'
import type { ExportConfig, ExportFormat } from '../types/export'

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

/**
 * Parse the one-line Pandoc flags field without losing quoted values.
 *
 * Whitespace separates arguments outside quotes. Both quote styles group
 * values, and a backslash escapes the following character outside single
 * quotes. Backslashes inside single quotes are preserved for Pandoc/LaTeX
 * values. An unmatched quote is rejected before an export starts so a
 * malformed field cannot be sent to Pandoc with a surprising meaning.
 */
export function parsePandocArgs(value: string): string[] {
  const args: string[] = []
  let token = ''
  let tokenStarted = false
  let quote: '"' | "'" | null = null
  let escaped = false

  for (const character of value) {
    // Single-quoted values are literal. In particular, preserve the
    // backslashes commonly used in LaTeX commands such as '\\alpha'.
    if (quote === "'") {
      if (character === "'") {
        quote = null
      } else {
        token += character
      }
      continue
    }

    if (escaped) {
      token += character
      tokenStarted = true
      escaped = false
      continue
    }

    if (character === '\\') {
      escaped = true
      tokenStarted = true
      continue
    }

    if (quote === '"') {
      if (character === '"') {
        quote = null
      } else {
        token += character
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      tokenStarted = true
    } else if (/\s/.test(character)) {
      if (tokenStarted) {
        args.push(token)
        token = ''
        tokenStarted = false
      }
    } else {
      token += character
      tokenStarted = true
    }
  }

  if (quote) {
    throw new Error('Unterminated quote in Pandoc flags.')
  }

  if (escaped) {
    token += '\\'
  }

  if (tokenStarted) {
    args.push(token)
  }

  return args
}

export const useExportStore = defineStore('export', () => {
  const exportSettingsStore = useExportSettingsStore()

  // Dialog visibility
  const dialogVisible = ref(false)

  // Pandoc status
  const pandocInfo = ref<PandocInfo | null>(null)
  const pandocError = ref<string | null>(null)
  const pandocChecked = ref(false)

  // Export formats
  const formats = ref<ExportFormatInfo[]>([])

  // Selected format
  const selectedFormatId = ref<string>(exportSettingsStore.settings.defaultFormat)

  // Custom output path (null = use default derived from source file)
  const customOutputPath = ref<string | null>(null)

  // Optional Pandoc flags
  const extraFlags = ref<string>(exportSettingsStore.settings.extraPandocArgs)

  // Include table of contents
  const includeToc = ref<boolean>(exportSettingsStore.settings.addTableOfContents)

  // Export status
  const status = ref<ExportStatus>('idle')
  const statusMessage = ref('')
  const lastExportPath = ref<string | null>(null)

  // Computed
  const selectedFormat = computed(
    () => formats.value.find((f) => f.id === selectedFormatId.value) ?? null,
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

    // Start each export from the persisted preferences. Dialog edits remain
    // transient so a one-off export does not silently change future defaults.
    selectedFormatId.value = exportSettingsStore.settings.defaultFormat
    extraFlags.value = exportSettingsStore.settings.extraPandocArgs
    includeToc.value = exportSettingsStore.settings.addTableOfContents

    // Check Pandoc if not already checked
    if (!pandocChecked.value) {
      await checkPandoc()
    }

    // Load formats if not already loaded
    if (formats.value.length === 0) {
      await loadFormats()
    }

    if (!formats.value.some((format) => format.id === selectedFormatId.value)) {
      selectedFormatId.value = formats.value[0]?.id ?? 'pdf'
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
  async function chooseOutputPath(
    formatId: string = selectedFormatId.value,
    defaultName?: string,
  ): Promise<void> {
    const tabsStore = useTabsStore()
    const activeTab = tabsStore.activeTab
    const name = defaultName ?? activeTab?.title ?? 'Untitled'

    try {
      const path = await invoke<string | null>('export_save_dialog', {
        format: formatId,
        defaultName: name,
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
    if (isExporting.value) return false

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

    // Snapshot the document and options before any native dialog or backend
    // request can yield to another tab/format selection.
    const bodyMarkdown = activeTab.editorState.markdown
    if (!bodyMarkdown || bodyMarkdown.trim() === '') {
      status.value = 'error'
      statusMessage.value = 'Document is empty — nothing to export.'
      return false
    }
    const markdown = assembleFullMarkdown(bodyMarkdown, activeTab.editorState.frontmatter)

    const formatId = selectedFormatId.value as ExportFormat
    const formatLabel = selectedFormat.value?.label ?? formatId
    const sourceTitle = activeTab.title
    const title = sourceTitle.replace(/\.[^.]+$/, '') || 'Untitled'
    const filePath = activeTab.filePath
    const includeTocOption = includeToc.value
    const standaloneOption = exportSettingsStore.settings.standalone
    const templateOption = exportSettingsStore.settings.customTemplatePath || null
    const extraFlagsOption = extraFlags.value

    let extraArguments: string[]
    try {
      extraArguments = parsePandocArgs(extraFlagsOption)
    } catch (err) {
      status.value = 'error'
      statusMessage.value = `Invalid Pandoc flags: ${err instanceof Error ? err.message : String(err)}`
      return false
    }

    // Hold the guard across native dialogs and config loading so a second
    // click cannot export a different snapshot while the first is waiting.
    status.value = 'exporting'
    statusMessage.value = 'Preparing export...'

    // Determine output path
    let outputPath = customOutputPath.value
    if (!outputPath) {
      // Open save dialog to choose path
      await chooseOutputPath(formatId, sourceTitle)
      outputPath = customOutputPath.value
      if (!outputPath) {
        // User cancelled the dialog
        status.value = 'idle'
        statusMessage.value = ''
        return false
      }
    }

    // Get resource path (directory of the source file, for resolving images)
    let resourcePath: string | null = null
    if (filePath) {
      const lastSlash = filePath.lastIndexOf('/')
      if (lastSlash > 0) {
        resourcePath = filePath.substring(0, lastSlash)
      }
    }

    let config: ExportConfig
    try {
      config = await getExportConfig(formatId)
    } catch (err) {
      status.value = 'error'
      statusMessage.value = `Failed to load export settings: ${typeof err === 'string' ? err : String(err)}`
      return false
    }

    // These are the supported user-facing overrides. Keep the backend's
    // format defaults for every other option.
    config.table_of_contents = includeTocOption
    config.standalone = standaloneOption
    config.template = templateOption
    config.extra_args = extraArguments

    statusMessage.value = `Exporting to ${formatLabel}...`

    try {
      const result = await invoke<ExportResult>('export_document', {
        markdown,
        outputPath,
        format: formatId,
        title,
        resourcePath,
        config,
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
    selectedFormatId.value = exportSettingsStore.settings.defaultFormat
    extraFlags.value = exportSettingsStore.settings.extraPandocArgs
    includeToc.value = exportSettingsStore.settings.addTableOfContents
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
