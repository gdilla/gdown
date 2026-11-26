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

    /** What App.vue does with a print request: answer with how the print went. */
    const answerPrint = (started: Promise<boolean>) => (event: Event) => {
      ;(event as CustomEvent<{ started?: Promise<boolean> }>).detail.started = started
    }
    const acceptPrint = answerPrint(Promise.resolve(true))

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

    // Any flags at all mean "run Pandoc as I configured it": Leaf does not guess
    // which ones choose an engine (a defaults file, bundled short options like
    // `-sd`, and engine options all can, directly or not).
    it.each([
      '--pdf-engine=weasyprint',
      '--pdf-engine weasyprint',
      '--defaults=report.yaml',
      '-d report.yaml',
      '-sd report.yaml',
      '--pdf-engine-opt=-shell-escape',
      '--lua-filter=drafts.lua',
    ])('leaves an export with Pandoc flags (%s) to Pandoc', async (flags) => {
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
    })

    it('reports an error when nothing takes the print request', async () => {
      const store = setUpPdfExport(null)
      await expect(store.performExport()).resolves.toBe(false)

      expect(store.status).toBe('error')
      expect(store.statusMessage).toBe('The print dialog could not be opened.')
      expect(exportedConfig()).toBeUndefined()
    })

    // Refused (a modal blocks app actions), busy (another print is being
    // prepared) or rejected by the native print command: no sheet opened.
    it('reports an error when the print does not start', async () => {
      const store = setUpPdfExport(null)
      const onPrint = answerPrint(Promise.resolve(false))
      window.addEventListener('gdown:print', onPrint)
      try {
        await expect(store.performExport()).resolves.toBe(false)
      } finally {
        window.removeEventListener('gdown:print', onPrint)
      }

      expect(store.status).toBe('error')
      expect(store.statusMessage).toBe('The print dialog could not be opened.')
    })

    it('does not report success before the print has been accepted', async () => {
      const store = setUpPdfExport(null)
      let accept!: (started: boolean) => void
      const onPrint = answerPrint(new Promise<boolean>((resolve) => (accept = resolve)))
      window.addEventListener('gdown:print', onPrint)
      try {
        const exporting = store.performExport()
        await Promise.resolve()
        expect(store.status).toBe('exporting')
        accept(true)
        await expect(exporting).resolves.toBe(true)
        expect(store.status).toBe('success')
      } finally {
        window.removeEventListener('gdown:print', onPrint)
      }
    })

    // The dialog reads this to say, before the user configures anything, that
    // the export will be a print and which options do not apply.
    it.each<[string, string | null, string, string, boolean]>([
      ['PDF with no LaTeX engine and no flags', null, 'pdf', '', true],
      ['PDF with no LaTeX engine and blank flags', null, 'pdf', '   ', true],
      ['PDF with any Pandoc flag', null, 'pdf', '--number-sections', false],
      ['PDF with a bundled defaults flag', null, 'pdf', '-sd report.yaml', false],
      ['PDF with flags that do not parse', null, 'pdf', '--metadata "unterminated', false],
      ['PDF with xelatex found', 'xelatex', 'pdf', '', false],
      ['another format', null, 'html', '', false],
    ])('pdfViaPrint: %s', (_, engine, format, flags, expected) => {
      const store = setUpPdfExport(engine)
      store.selectedFormatId = format
      store.extraFlags = flags

      expect(store.pdfViaPrint).toBe(expected)
    })

    it.each<[string, string | null, string, boolean]>([
      ['PDF with no LaTeX engine', null, 'pdf', true],
      ['PDF with xelatex found', 'xelatex', 'pdf', false],
      ['another format', null, 'html', false],
    ])('pdfEngineMissing: %s', (_, engine, format, expected) => {
      const store = setUpPdfExport(engine)
      store.selectedFormatId = format
      store.extraFlags = '--number-sections'

      expect(store.pdfEngineMissing).toBe(expected)
    })

    // An image tab has no document: neither Pandoc nor the print fallback can use it.
    it.each([null, 'xelatex'])('offers no export for an image tab (engine: %s)', async (engine) => {
      const store = setUpPdfExport(engine)
      useTabsStore().openImageFile('/tmp/photo.png')
      const onPrint = vi.fn(acceptPrint)
      window.addEventListener('gdown:print', onPrint)
      try {
        expect(store.canExport).toBe(false)
        await expect(store.performExport()).resolves.toBe(false)
      } finally {
        window.removeEventListener('gdown:print', onPrint)
      }

      expect(store.statusMessage).toBe('An image cannot be exported.')
      expect(onPrint).not.toHaveBeenCalled()
      expect(exportedConfig()).toBeUndefined()
    })

    // xelatex (or Pandoc itself) may have been installed since the dialog was last open.
    it.each<[string, string | null, number]>([
      ['no LaTeX engine was found last time', null, 1],
      ['an engine is already known', 'xelatex', 0],
    ])('reopening the dialog re-checks Pandoc when %s', async (_, engine, checks) => {
      const store = setUpPdfExport(engine)
      store.pandocChecked = true
      mockedInvoke.mockImplementation(async (command) => {
        if (command === 'check_pandoc') {
          return { path: '/usr/bin/pandoc', version: '3.7', pdf_engine: 'xelatex' } as never
        }
        return null as never
      })

      mockedInvoke.mockClear()

      await store.openDialog()

      expect(
        mockedInvoke.mock.calls.filter(([command]) => command === 'check_pandoc'),
      ).toHaveLength(checks)
      expect(store.pandocInfo?.pdf_engine).toBe('xelatex')
      expect(store.pdfViaPrint).toBe(false)
    })

    // The button shows what the last check found ("Print…"); what a click would
    // do is only known when the re-check lands, so nothing may run before then.
    it('does not export while an engine re-check is pending, then takes the route it found', async () => {
      const store = setUpPdfExport(null)
      store.pandocChecked = true
      let found!: (info: unknown) => void
      mockedInvoke.mockImplementation(async (command) => {
        if (command === 'check_pandoc') return new Promise((resolve) => (found = resolve)) as never
        if (command === 'export_document') {
          return { success: true, output_path: '/tmp/notes.pdf', message: 'Exported' } as never
        }
        return null as never
      })
      const onPrint = vi.fn(acceptPrint)
      window.addEventListener('gdown:print', onPrint)
      try {
        // Reopened after xelatex was installed; Export is clicked before the re-check returns.
        const opening = store.openDialog()
        await vi.waitFor(() => expect(found).toBeDefined())
        store.selectedFormatId = 'pdf'
        store.customOutputPath = '/tmp/notes.pdf'
        expect(store.canExport).toBe(false)
        await expect(store.performExport()).resolves.toBe(false)
        expect(onPrint).not.toHaveBeenCalled()
        expect(exportedConfig()).toBeUndefined()

        found({ path: '/usr/bin/pandoc', version: '3.7', pdf_engine: 'xelatex' })
        await opening
        store.selectedFormatId = 'pdf'
        store.customOutputPath = '/tmp/notes.pdf'
        expect(store.canExport).toBe(true)
        expect(store.pdfViaPrint).toBe(false)
        await expect(store.performExport()).resolves.toBe(true)
      } finally {
        window.removeEventListener('gdown:print', onPrint)
      }

      expect(onPrint).not.toHaveBeenCalled()
      expect(exportedConfig()?.pdf_engine).toBe('xelatex')
    })

    // Print shows what the editor shows; Pandoc's "nothing to export" check is
    // about the markdown body and must not block a front-matter-only document.
    it('prints a document whose body is empty instead of calling it empty', async () => {
      const store = setUpPdfExport(null)
      const tab = useTabsStore().activeTab!
      useTabsStore().saveEditorState(tab.id, { markdown: '', frontmatter: 'title: Notes' })
      const onPrint = vi.fn(acceptPrint)
      window.addEventListener('gdown:print', onPrint)
      try {
        await expect(store.performExport()).resolves.toBe(true)
      } finally {
        window.removeEventListener('gdown:print', onPrint)
      }

      expect(onPrint).toHaveBeenCalledTimes(1)
      expect(store.status).toBe('success')
    })

    it('still refuses to send an empty body to Pandoc', async () => {
      const store = setUpPdfExport('xelatex')
      const tab = useTabsStore().activeTab!
      useTabsStore().saveEditorState(tab.id, { markdown: '', frontmatter: 'title: Notes' })

      await expect(store.performExport()).resolves.toBe(false)

      expect(store.statusMessage).toContain('Document is empty')
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
