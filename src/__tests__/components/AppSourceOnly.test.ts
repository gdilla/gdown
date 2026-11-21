import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { EditorView } from '@codemirror/view'
import { language } from '@codemirror/language'
import App from '../../App.vue'
import { useTabsStore } from '../../stores/tabs'
import { useEditorModeStore } from '../../stores/editorMode'
import { useAutoSaveStore } from '../../stores/autoSave'
import { invoke } from '@tauri-apps/api/core'
import * as converter from '../../utils/markdownConverter'
import { MAX_RICH_CHARS } from '../../utils/documentLimits'

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}))

// Real Editor and SourceEditor, as in AppModeSwitch.test.ts: these tests are
// about which of the two a tab is handed to, and what each writes back.
const stubs = {
  TabBar: true,
  Sidebar: true,
  OutlinePanel: true,
  StatusBar: true,
  RecentFiles: true,
  ConflictDialog: true,
  SaveNotification: true,
  PreferencesWindow: true,
  ExportDialog: true,
  ExportToast: true,
  QuickOpenDialog: true,
  ImageViewer: true,
  EditorContent: { template: '<div />' },
  LinkTooltip: true,
  InsertLinkDialog: true,
  FindReplace: true,
}

// Rows the rich editor would join into one line and escape (`with\_underscores\_`).
const CSV = 'id,name,note\n1,user_1,"a *note*, with_underscores_"\n2,user_2,"[brackets]"\n'

function pressCmdSlash() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true }))
}

async function sourceShown(wrapper: VueWrapper): Promise<void> {
  await vi.waitFor(() => expect(wrapper.find('.cm-content').exists()).toBe(true))
}

/** Name of the language CodeMirror is parsing the shown document as, or null for plain text. */
function sourceLanguage(wrapper: VueWrapper): string | null {
  const view = EditorView.findFromDOM(wrapper.find('.cm-editor').element as HTMLElement)
  return view?.state.facet(language)?.name ?? null
}

async function richShown(wrapper: VueWrapper): Promise<void> {
  await vi.waitFor(() => expect(wrapper.find('.cm-content').exists()).toBe(false))
  await flushPromises()
}

describe('App with source-only tabs', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.restoreAllMocks()
  })

  it('shows a CSV in the source editor and never converts it as markdown', async () => {
    const toHtml = vi.spyOn(converter, 'markdownToHtml')
    const toMarkdown = vi.spyOn(converter, 'htmlToMarkdown')
    const tabs = useTabsStore()
    const csv = tabs.createTab('/tmp/data.csv', CSV)

    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    await sourceShown(wrapper)

    // The default mode is rich; the tab overrides it.
    expect(useEditorModeStore().mode).toBe('source')
    expect(wrapper.find('.cm-content').text()).toContain('with_underscores_')

    window.dispatchEvent(new Event('gdown:capture-state'))
    expect(csv.editorState.markdown).toBe(CSV)
    expect(toHtml).not.toHaveBeenCalled()
    expect(toMarkdown).not.toHaveBeenCalled()
  })

  it('keeps a CSV in source mode on Cmd+/', async () => {
    const tabs = useTabsStore()
    const csv = tabs.createTab('/tmp/data.csv', CSV)
    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    await sourceShown(wrapper)

    pressCmdSlash()
    await flushPromises()

    expect(useEditorModeStore().mode).toBe('source')
    expect(wrapper.find('.cm-content').exists()).toBe(true)
    expect(csv.editorState.markdown).toBe(CSV)
  })

  it('switching between a rich tab and a CSV tab never mixes their content', async () => {
    const toHtml = vi.spyOn(converter, 'markdownToHtml')
    const tabs = useTabsStore()
    const note = tabs.createTab('/tmp/note.md', '# Note\n\nSome **bold** text')
    const csv = tabs.createTab('/tmp/data.csv', CSV)
    tabs.setActiveTab(note.id)

    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    await richShown(wrapper)
    toHtml.mockClear()

    // Rich tab -> CSV tab: the rich editor must not load the CSV on its way out.
    tabs.setActiveTab(csv.id)
    await flushPromises()
    await sourceShown(wrapper)
    expect(wrapper.find('.cm-content').text()).toContain('with_underscores_')
    expect(toHtml).not.toHaveBeenCalled()
    expect(note.editorState.markdown).toBe('# Note\n\nSome **bold** text')
    expect(csv.editorState.markdown).toBe(CSV)

    // CSV tab -> rich tab: the source editor must not write the CSV into the note.
    tabs.setActiveTab(note.id)
    await flushPromises()
    await richShown(wrapper)
    expect(note.editorState.markdown).toBe('# Note\n\nSome **bold** text')
    expect(csv.editorState.markdown).toBe(CSV)
    expect(note.isModified).toBe(false)
    expect(csv.isModified).toBe(false)

    // And back again, with the rich editor's own snapshot in between.
    tabs.setActiveTab(csv.id)
    await flushPromises()
    await sourceShown(wrapper)
    expect(wrapper.find('.cm-content').text()).toContain('with_underscores_')
    expect(note.editorState.markdown).toBe('# Note\n\nSome **bold** text')
    expect(csv.editorState.markdown).toBe(CSV)
  })

  it('switching between a source-mode note and a CSV keeps both intact', async () => {
    const tabs = useTabsStore()
    const note = tabs.createTab('/tmp/note.md', '# Note')
    const csv = tabs.createTab('/tmp/data.csv', CSV)
    const mode = useEditorModeStore()

    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    await sourceShown(wrapper)
    mode.setMode('source')

    tabs.setActiveTab(note.id)
    await flushPromises()
    await vi.waitFor(() => expect(wrapper!.find('.cm-content').text()).toContain('# Note'))
    tabs.setActiveTab(csv.id)
    await flushPromises()
    await vi.waitFor(() =>
      expect(wrapper!.find('.cm-content').text()).toContain('with_underscores_'),
    )

    expect(note.editorState.markdown).toBe('# Note')
    expect(csv.editorState.markdown).toBe(CSV)
  })

  it('hands a file that outgrew the rich limit on disk to the source editor', async () => {
    const tabs = useTabsStore()
    const log = tabs.createTab('/tmp/log.txt', 'short')
    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    await richShown(wrapper)

    const grown = 'line of log text\n'.repeat(MAX_RICH_CHARS / 10)
    const autoSave = useAutoSaveStore()
    autoSave.knownModifiedTimes['/tmp/log.txt'] = 100
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'get_file_modified_time') return 200
      if (command === 'read_file') return grown
      return null
    })
    const toHtml = vi.spyOn(converter, 'markdownToHtml')
    try {
      await autoSave.checkForExternalChanges()
      await flushPromises()
      await sourceShown(wrapper)

      // The mounted rich editor must not convert the reloaded document on its way out.
      expect(toHtml).not.toHaveBeenCalled()
      expect(log.sourceOnly).toBe('too-large')
      expect(log.editorState.markdown).toBe(grown)
      expect(log.isModified).toBe(false)
    } finally {
      vi.mocked(invoke).mockReset()
      vi.mocked(invoke).mockResolvedValue('')
    }
  })

  // The markdown parser reads a CSV as one paragraph and is quadratic in its
  // length (measured: 0.9 s at 500 KB, 67 s at 4 MB), so source-only tabs are
  // edited as plain text.
  it('does not parse a source-only tab as markdown', async () => {
    const tabs = useTabsStore()
    const note = tabs.createTab('/tmp/note.md', '# Note')
    const book = tabs.createTab('/tmp/book.md', 'a'.repeat(MAX_RICH_CHARS + 1))
    const csv = tabs.createTab('/tmp/data.csv', CSV)
    useEditorModeStore().setMode('source')

    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    await sourceShown(wrapper)
    expect(sourceLanguage(wrapper)).toBeNull()

    tabs.setActiveTab(note.id)
    await flushPromises()
    await vi.waitFor(() => expect(sourceLanguage(wrapper!)).toBe('markdown'))

    tabs.setActiveTab(book.id)
    await flushPromises()
    await vi.waitFor(() => expect(sourceLanguage(wrapper!)).toBeNull())

    tabs.setActiveTab(csv.id)
    await flushPromises()
    tabs.setActiveTab(note.id)
    await flushPromises()
    await vi.waitFor(() => expect(sourceLanguage(wrapper!)).toBe('markdown'))
  })
})
