import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { getExportConfig } from '../../services/export'
import { useExportSettingsStore } from '../../stores/exportSettings'
import { useExportStore, parsePandocArgs } from '../../stores/export'
import { useTabsStore } from '../../stores/tabs'
import type { ExportConfig } from '../../types/export'

vi.mock('../../services/export', () => ({
  getExportConfig: vi.fn(),
}))

const mockedInvoke = vi.mocked(invoke)
const mockedGetExportConfig = vi.mocked(getExportConfig)

describe('parsePandocArgs', () => {
  it('keeps quoted values with spaces in one argument', () => {
    expect(parsePandocArgs('--metadata title="My notes" --css "/tmp/My style.css"')).toEqual([
      '--metadata',
      'title=My notes',
      '--css',
      '/tmp/My style.css',
    ])
  })

  it('supports escaped whitespace and empty quoted values', () => {
    expect(parsePandocArgs('--variable=foo\\ bar --metadata ""')).toEqual([
      '--variable=foo bar',
      '--metadata',
      '',
    ])
  })

  it('preserves backslashes inside single-quoted values', () => {
    expect(parsePandocArgs(String.raw`--variable='mainfont=\alpha'`)).toEqual([
      '--variable=mainfont=\\alpha',
    ])
  })

  it('rejects an unterminated quote', () => {
    expect(() => parsePandocArgs('--css "unfinished path')).toThrow(
      'Unterminated quote in Pandoc flags.',
    )
  })
})

describe('useExportStore configuration', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    mockedInvoke.mockReset()
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'check_pandoc') {
        return { path: '/usr/bin/pandoc', version: '3.7', pdf_engine: null } as never
      }
      return null as never
    })
    mockedGetExportConfig.mockReset()
  })

  it('passes persisted export options to the backend config', async () => {
    const defaultConfig: ExportConfig = {
      format: 'html',
      from_format: 'gfm+tex_math_dollars',
      standalone: true,
      pdf_engine: null,
      math_method: null,
      css_file: null,
      reference_doc: null,
      template: null,
      header_includes: null,
      before_body: null,
      after_body: null,
      table_of_contents: false,
      toc_depth: null,
      number_sections: false,
      highlight_style: null,
      document_class: null,
      paper_size: null,
      geometry: null,
      main_font: null,
      mono_font: null,
      font_size: null,
      line_stretch: null,
      extra_args: [],
      epub_cover_image: null,
      epub_chapter_level: null,
    }
    const expectedConfig: ExportConfig = {
      ...defaultConfig,
      standalone: false,
      template: '/tmp/My style.html',
      table_of_contents: true,
      extra_args: ['--metadata', 'title=My notes'],
    }
    mockedGetExportConfig.mockResolvedValue({ ...defaultConfig })
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'check_pandoc') {
        return { path: '/usr/bin/pandoc', version: '3.7', pdf_engine: null } as never
      }
      if (command === 'export_document') {
        return {
          success: true,
          output_path: '/tmp/notes.html',
          message: 'Exported',
        } as never
      }
      return null as never
    })

    const tabs = useTabsStore()
    const tab = tabs.createTab('/tmp/notes.md', '# Hello')
    tab.editorState.frontmatter = 'title: Notes\ntags: [a, b]'
    const settings = useExportSettingsStore()
    settings.settings.standalone = false
    settings.settings.customTemplatePath = '/tmp/My style.html'
    settings.settings.extraPandocArgs = '--metadata title="My notes"'

    const store = useExportStore()
    store.formats = [{ id: 'html', label: 'HTML', extension: 'html' }]
    store.pandocInfo = { path: '/usr/bin/pandoc', version: '3.7', pdf_engine: null }
    store.selectedFormatId = 'html'
    store.includeToc = true
    store.extraFlags = settings.settings.extraPandocArgs
    store.customOutputPath = '/tmp/notes.html'

    const capture = () => tabs.saveEditorState(tab.id, { markdown: '# Latest' })
    window.addEventListener('gdown:capture-state', capture)
    try {
      await expect(store.performExport()).resolves.toBe(true)
    } finally {
      window.removeEventListener('gdown:capture-state', capture)
    }

    expect(mockedGetExportConfig).toHaveBeenCalledWith('html')
    expect(mockedInvoke).toHaveBeenCalledWith('export_document', {
      markdown: '---\ntitle: Notes\ntags: [a, b]\n---\n\n# Latest',
      outputPath: '/tmp/notes.html',
      format: 'html',
      title: 'notes',
      resourcePath: '/tmp',
      config: expectedConfig,
    })
  })

  it('keeps one export in flight even when the dialog is reopened mid-export', async () => {
    let finishExport!: (value: unknown) => void
    let exportCalls = 0
    mockedGetExportConfig.mockResolvedValue({ extra_args: [] } as unknown as ExportConfig)
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'check_pandoc') {
        return { path: '/usr/bin/pandoc', version: '3.7', pdf_engine: null } as never
      }
      if (command === 'export_document') {
        exportCalls += 1
        return new Promise((resolve) => {
          finishExport = resolve
        }) as never
      }
      return null as never
    })

    useTabsStore().createTab('/tmp/notes.md', '# Hello')
    const store = useExportStore()
    store.formats = [{ id: 'html', label: 'HTML', extension: 'html' }]
    store.pandocInfo = { path: '/usr/bin/pandoc', version: '3.7', pdf_engine: null }
    store.selectedFormatId = 'html'
    store.customOutputPath = '/tmp/notes.html'

    const first = store.performExport()
    await vi.waitFor(() => expect(exportCalls).toBe(1))

    // Cmd+Shift+E while Pandoc is still running resets the dialog state.
    await store.openDialog()
    expect(store.isExporting).toBe(true)
    await expect(store.performExport()).resolves.toBe(false)
    expect(exportCalls).toBe(1)

    finishExport({ success: true, output_path: '/tmp/notes.html', message: 'Exported' })
    await expect(first).resolves.toBe(true)
    expect(store.isExporting).toBe(false)
  })

  describe('PDF export', () => {
    function setUpPdfExport(pdfEngine: string | null) {
      mockedGetExportConfig.mockResolvedValue({
        pdf_engine: 'xelatex',
        extra_args: [],
      } as unknown as ExportConfig)
      mockedInvoke.mockImplementation(async (command) => {
        if (command === 'export_document') {
          return { success: true, output_path: '/tmp/notes.pdf', message: 'Exported' } as never
        }
        return null as never
      })
      useTabsStore().createTab('/tmp/notes.md', '# Hello')
      const store = useExportStore()
      store.formats = [{ id: 'pdf', label: 'PDF', extension: 'pdf' }]
      store.pandocInfo = { path: '/usr/bin/pandoc', version: '3.7', pdf_engine: pdfEngine }
      store.selectedFormatId = 'pdf'
      store.customOutputPath = '/tmp/notes.pdf'
      return store
    }

    /** What App.vue does when it starts the print: cancel the request event. */
    const acceptPrint = (event: Event) => event.preventDefault()

    function exportedConfig(): ExportConfig | undefined {
      const call = mockedInvoke.mock.calls.find(([command]) => command === 'export_document')
      return (call?.[1] as { config: ExportConfig } | undefined)?.config
    }

    it('falls back to the native print sheet when no LaTeX engine is installed', async () => {
      const store = setUpPdfExport(null)
      const onPrint = vi.fn(acceptPrint)
      window.addEventListener('gdown:print', onPrint)
      try {
        await expect(store.performExport()).resolves.toBe(true)
      } finally {
        window.removeEventListener('gdown:print', onPrint)
      }

      expect(onPrint).toHaveBeenCalledTimes(1)
      expect(exportedConfig()).toBeUndefined()
      expect(store.status).toBe('success')
      expect(store.statusMessage).toContain('Save as PDF')
    })

    it('exports through Pandoc with the LaTeX engine that was found', async () => {
      const store = setUpPdfExport('xelatex')
      const onPrint = vi.fn(acceptPrint)
      window.addEventListener('gdown:print', onPrint)
      try {
        await expect(store.performExport()).resolves.toBe(true)
      } finally {
        window.removeEventListener('gdown:print', onPrint)
      }

      expect(onPrint).not.toHaveBeenCalled()
      expect(exportedConfig()?.pdf_engine).toBe('xelatex')
    })

    it.each(['--pdf-engine=weasyprint', '--pdf-engine weasyprint'])(
      'leaves an engine chosen in the Pandoc flags (%s) to Pandoc',
      async (flags) => {
        const store = setUpPdfExport(null)
        store.extraFlags = flags
        const onPrint = vi.fn(acceptPrint)
        window.addEventListener('gdown:print', onPrint)
        try {
          await expect(store.performExport()).resolves.toBe(true)
        } finally {
          window.removeEventListener('gdown:print', onPrint)
        }

        expect(onPrint).not.toHaveBeenCalled()
        expect(exportedConfig()?.pdf_engine).toBe('xelatex')
      },
    )

    it('reports an error when nothing takes the print request', async () => {
      const store = setUpPdfExport(null)
      // No listener cancels the event: a modal is blocking app actions, say.
      await expect(store.performExport()).resolves.toBe(false)

      expect(store.status).toBe('error')
      expect(store.statusMessage).toContain('File > Print / Export PDF')
      expect(exportedConfig()).toBeUndefined()
    })

    it('still falls back when the flags only pass options to the engine', async () => {
      const store = setUpPdfExport(null)
      store.extraFlags = '--pdf-engine-opt=-shell-escape'
      const onPrint = vi.fn(acceptPrint)
      window.addEventListener('gdown:print', onPrint)
      try {
        await expect(store.performExport()).resolves.toBe(true)
      } finally {
        window.removeEventListener('gdown:print', onPrint)
      }

      expect(onPrint).toHaveBeenCalledTimes(1)
      expect(exportedConfig()).toBeUndefined()
    })

    it('does not use the print sheet for other formats', async () => {
      const store = setUpPdfExport(null)
      store.formats = [{ id: 'html', label: 'HTML', extension: 'html' }]
      store.selectedFormatId = 'html'
      const onPrint = vi.fn(acceptPrint)
      window.addEventListener('gdown:print', onPrint)
      try {
        await expect(store.performExport()).resolves.toBe(true)
      } finally {
        window.removeEventListener('gdown:print', onPrint)
      }

      expect(onPrint).not.toHaveBeenCalled()
      expect(exportedConfig()).toBeDefined()
    })
  })
})
