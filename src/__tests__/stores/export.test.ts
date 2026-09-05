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
        return { path: '/usr/bin/pandoc', version: '3.7' } as never
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
        return { path: '/usr/bin/pandoc', version: '3.7' } as never
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
    store.pandocInfo = { path: '/usr/bin/pandoc', version: '3.7' }
    store.selectedFormatId = 'html'
    store.includeToc = true
    store.extraFlags = settings.settings.extraPandocArgs
    store.customOutputPath = '/tmp/notes.html'

    await expect(store.performExport()).resolves.toBe(true)

    expect(mockedGetExportConfig).toHaveBeenCalledWith('html')
    expect(mockedInvoke).toHaveBeenCalledWith('export_document', {
      markdown: '---\ntitle: Notes\ntags: [a, b]\n---\n\n# Hello',
      outputPath: '/tmp/notes.html',
      format: 'html',
      title: 'notes',
      resourcePath: '/tmp',
      config: expectedConfig,
    })
  })
})
