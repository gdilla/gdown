import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useTabsStore } from './tabs'
import { useExportSettingsStore } from './exportSettings'
import { getExportConfig } from '../services/export'
import { assembleFullMarkdown } from '../utils/copyMarkdown'
import { flushLiveEditorState } from '../utils/flushEditorState'
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
  /** The LaTeX engine PDF export uses, when it is installed; null when it is not. */
  pdf_engine: string | null
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

  // Separate from `status`, which openDialog/reset clear: export_document runs
  // off the main thread, so this is what keeps one export in flight at a time.
  const exportInFlight = ref(false)
  const isExporting = computed(() => exportInFlight.value)

  /** PDF is selected and Pandoc has no LaTeX engine (xelatex) to make it with. */
  const pdfEngineMissing = computed(
    () =>
      selectedFormatId.value === 'pdf' && pandocInfo.value !== null && !pandocInfo.value.pdf_engine,
  )

  /**
   * Whether Export will print instead of running Pandoc: PDF with no LaTeX
   * engine and no Pandoc flags. Any flags mean "run Pandoc as configured";
   * Leaf does not guess which of them choose an engine. The dialog says which
   * of the two will happen before the user configures anything.
   */
  const pdfViaPrint = computed(() => pdfEngineMissing.value && extraFlags.value.trim() === '')

  const canExport = computed(() => {
    const tabsStore = useTabsStore()
    const tab = tabsStore.activeTab
    return (
      isPandocAvailable.value &&
      tab !== null &&
      !tab.isImage &&
      !isExporting.value &&
      !checkingPandoc.value
    )
  })

  /**
   * Check if Pandoc is installed and get its version info.
   */
  /** The check in flight, if any: concurrent callers share it. */
  let pandocCheck: Promise<boolean> | null = null
  // While a check is pending nothing can be exported: its result decides
  // whether PDF goes to Pandoc or to Print, and the dialog still shows the
  // action the previous result implied.
  const checkingPandoc = ref(false)

  function checkPandoc(): Promise<boolean> {
    checkingPandoc.value = true
    pandocCheck ??= runPandocCheck().finally(() => {
      pandocCheck = null
      checkingPandoc.value = false
    })
    return pandocCheck
  }

  async function runPandocCheck(): Promise<boolean> {
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

    // Check Pandoc on every opening: it, or the LaTeX engine, may have been
    // installed or removed since, and the result decides what Export does.
    // Not while an export is running (Cmd+Shift+E reopens the dialog then):
    // the check ends by resetting the status the export is about to report in.
    if (!exportInFlight.value) await checkPandoc()

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
    if (exportInFlight.value || checkingPandoc.value) return false
    exportInFlight.value = true
    try {
      return await runExport()
    } finally {
      exportInFlight.value = false
    }
  }

  async function runExport(): Promise<boolean> {
    flushLiveEditorState()
    const tabsStore = useTabsStore()
    const activeTab = tabsStore.activeTab

    if (!activeTab) {
      status.value = 'error'
      statusMessage.value = 'No active document to export.'
      return false
    }

    if (activeTab.isImage) {
      status.value = 'error'
      statusMessage.value = 'An image cannot be exported.'
      return false
    }

    if (!isPandocAvailable.value) {
      status.value = 'error'
      statusMessage.value = 'Pandoc is not installed.'
      return false
    }

    // Pandoc needs a LaTeX engine for PDF. Without one (and with no Pandoc
    // flags set) the webview prints the document instead; App.vue owns the
    // editor. This is the test the dialog showed "Print…" for, and it comes
    // before the Pandoc-only checks: a print shows what the editor shows.
    if (pdfViaPrint.value) {
      // App.vue answers with how the print went: refused, busy with another
      // print and failed all mean no print sheet opened for this export.
      const request = new CustomEvent<{ started?: Promise<boolean> }>('gdown:print', { detail: {} })
      window.dispatchEvent(request)
      status.value = 'exporting'
      statusMessage.value = 'Opening the print dialog...'
      if (!(await request.detail.started)) {
        status.value = 'error'
        statusMessage.value = 'The print dialog could not be opened.'
        return false
      }
      status.value = 'success'
      statusMessage.value = 'No LaTeX engine found. Choose "Save as PDF" in the print dialog.'
      return true
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
    pdfEngineMissing,
    pdfViaPrint,

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
