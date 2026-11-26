import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { EditorView } from '@codemirror/view'
import { language } from '@codemirror/language'
import { undoDepth } from '@codemirror/commands'
import App from '../../App.vue'
import { useTabsStore } from '../../stores/tabs'
import { useEditorModeStore } from '../../stores/editorMode'
import { useEditorSettingsStore } from '../../stores/editorSettings'
import { useAutoSaveStore } from '../../stores/autoSave'
import { useOutlineStore } from '../../stores/outline'
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

  // Present on main for any two tabs in source mode: a `gdown:capture-state`
  // that arrives after this editor has moved on to the new tab, but before it
  // has loaded it, saved the old document into the new tab. Two CSV tabs are
  // always in the source editor, so it is reachable in the default mode now.
  it.each([0, 250])(
    'never writes an edited tab into the tab switched to (%i ms after the edit)',
    async (pause) => {
      const tabs = useTabsStore()
      const first = tabs.createTab('/tmp/first.csv', 'first,1\n')
      const second = tabs.createTab('/tmp/second.csv', 'second,2\n')
      wrapper = mount(App, { global: { stubs } })
      await flushPromises()
      await sourceShown(wrapper)

      const view = EditorView.findFromDOM(wrapper.find('.cm-editor').element as HTMLElement)!
      view.dispatch({ changes: { from: 0, insert: 'edited,' } })
      await new Promise((resolve) => setTimeout(resolve, pause))
      tabs.setActiveTab(first.id)
      // A capture in the window between the switch and the new tab being loaded.
      window.dispatchEvent(new Event('gdown:capture-state'))
      await flushPromises()

      expect(first.editorState.markdown).toBe('first,1\n')
      expect(second.editorState.markdown).toBe('edited,second,2\n')
      await vi.waitFor(() => expect(view.state.doc.toString()).toBe('first,1\n'))

      // And typing in the tab switched to lands in that tab only.
      view.dispatch({ changes: { from: 0, insert: 'x' } })
      expect(first.editorState.markdown).toBe('xfirst,1\n')
      expect(second.editorState.markdown).toBe('edited,second,2\n')
    },
  )

  // The heading scan parses the whole document as markdown and is quadratic on
  // some input (62 s for 1 MB that opens with an unclosed link-reference title).
  it('builds no outline for a source-only tab', async () => {
    const tabs = useTabsStore()
    const note = tabs.createTab('/tmp/note.md', '# Real heading')
    const csv = tabs.createTab('/tmp/data.csv', '# looks like a heading\na,b\n')
    const outline = useOutlineStore()
    useEditorModeStore().setMode('source')

    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    await sourceShown(wrapper)
    expect(outline.headings).toEqual([])

    const view = EditorView.findFromDOM(wrapper.find('.cm-editor').element as HTMLElement)!
    view.dispatch({ changes: { from: 0, insert: '# another\n' } })
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(outline.headings).toEqual([])

    tabs.setActiveTab(note.id)
    await flushPromises()
    await vi.waitFor(() => expect(outline.headings.map((h) => h.text)).toEqual(['Real heading']))

    tabs.setActiveTab(csv.id)
    await flushPromises()
    await vi.waitFor(() => expect(outline.headings).toEqual([]))
  })

  it('saves an edited plain-text file that starts with --- exactly as typed', async () => {
    const yaml = '---\na: 1\n---\n\nb: 2\n'
    const tabs = useTabsStore()
    const tab = tabs.createTab('/tmp/k8s.yaml', yaml)
    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    await sourceShown(wrapper)

    const view = EditorView.findFromDOM(wrapper.find('.cm-editor').element as HTMLElement)!
    expect(view.state.doc.toString()).toBe(yaml)
    view.dispatch({ changes: { from: view.state.doc.length, insert: 'c: 3\n' } })

    expect(tab.editorState.frontmatter).toBeNull()
    expect(useAutoSaveStore().serializeTabToFile(tab)).toBe(yaml + 'c: 3\n')

    window.dispatchEvent(new Event('gdown:capture-state'))
    expect(useAutoSaveStore().serializeTabToFile(tab)).toBe(yaml + 'c: 3\n')
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

  // The classification of the tab on screen can change without a tab switch.
  it('stops parsing the shown note as markdown when it is saved as a CSV, keeping cursor and undo', async () => {
    const tabs = useTabsStore()
    const note = tabs.createTab('/tmp/note.md', '# Note\n\ntext')
    const outline = useOutlineStore()
    useEditorSettingsStore().defaultMode = 'source'
    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    await sourceShown(wrapper)
    expect(sourceLanguage(wrapper)).toBe('markdown')
    await vi.waitFor(() => expect(outline.headings.map((h) => h.text)).toEqual(['Note']))

    const view = EditorView.findFromDOM(wrapper.find('.cm-editor').element as HTMLElement)!
    view.dispatch({
      changes: { from: view.state.doc.length, insert: 'x' },
      selection: { anchor: 4 },
    })

    tabs.setFilePath(note.id, '/tmp/note.csv')
    await flushPromises()
    expect(sourceLanguage(wrapper)).toBeNull()
    expect(outline.headings).toEqual([])
    expect(view.state.doc.toString()).toBe('# Note\n\ntextx')
    expect(view.state.selection.main.head).toBe(4)
    expect(undoDepth(view.state)).toBe(1)

    // Saved back as markdown, it is a markdown document again.
    tabs.setFilePath(note.id, '/tmp/note.md')
    await flushPromises()
    expect(sourceLanguage(wrapper)).toBe('markdown')
    await vi.waitFor(() => expect(outline.headings.map((h) => h.text)).toEqual(['Note']))
  })

  // The markdown parser must not keep running on a document that has outgrown
  // the limit: it is what makes a multi-megabyte paste freeze the editor.
  it('stops parsing a note as markdown as soon as an edit takes it past the rich limit', async () => {
    const tabs = useTabsStore()
    const note = tabs.createTab('/tmp/note.md', '# Note')
    useEditorSettingsStore().defaultMode = 'source'
    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    await sourceShown(wrapper)
    expect(sourceLanguage(wrapper)).toBe('markdown')

    const view = EditorView.findFromDOM(wrapper.find('.cm-editor').element as HTMLElement)!
    // One long line, as in the other tests here: jsdom has no layout, and a
    // change spanning tens of thousands of lines takes minutes on a busy machine.
    const pasted = 'a'.repeat(MAX_RICH_CHARS + 1)
    view.dispatch({ changes: { from: view.state.doc.length, insert: '\n' + pasted } })
    await flushPromises()

    expect(note.sourceOnly).toBe('too-large')
    expect(sourceLanguage(wrapper)).toBeNull()
    expect(useAutoSaveStore().serializeTabToFile(note)).toBe('# Note\n' + pasted)

    // Trimming it back does not flip the editor under the cursor; asking for rich mode does.
    view.dispatch({ changes: { from: 6, to: view.state.doc.length } })
    await flushPromises()
    expect(note.sourceOnly).toBe('too-large')
    useEditorModeStore().setMode('wysiwyg')
    await richShown(wrapper)
    expect(note.sourceOnly).toBeNull()
  })

  // CodeMirror reads CRLF as a line break and writes LF. A source-only tab is
  // saved byte for byte, so a Windows CSV must keep its line endings.
  it('keeps a CRLF file’s line endings through edits, capture and save', async () => {
    const crlf = 'id,name\r\n1,ann\r\n2,bob\r\n'
    const tabs = useTabsStore()
    const csv = tabs.createTab('/tmp/windows.csv', crlf)
    const other = tabs.createTab('/tmp/unix.csv', 'a,b\n1,2\n')
    tabs.setActiveTab(csv.id)
    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    await sourceShown(wrapper)

    const view = EditorView.findFromDOM(wrapper.find('.cm-editor').element as HTMLElement)!
    expect(view.state.doc.lines).toBe(4)
    view.dispatch({ changes: { from: view.state.doc.length, insert: '3,cy\n' } })
    expect(csv.editorState.markdown).toBe(crlf + '3,cy\r\n')
    expect(useAutoSaveStore().serializeTabToFile(csv)).toBe(crlf + '3,cy\r\n')

    window.dispatchEvent(new Event('gdown:capture-state'))
    expect(csv.editorState.markdown).toBe(crlf + '3,cy\r\n')

    // An LF file in the same editor stays LF, and coming back keeps CRLF.
    tabs.setActiveTab(other.id)
    await flushPromises()
    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('a,b\n1,2\n'))
    view.dispatch({ changes: { from: view.state.doc.length, insert: '3,4\n' } })
    expect(other.editorState.markdown).toBe('a,b\n1,2\n3,4\n')
    expect(csv.editorState.markdown).toBe(crlf + '3,cy\r\n')

    tabs.setActiveTab(csv.id)
    await flushPromises()
    await vi.waitFor(() => expect(view.state.doc.lines).toBe(5))
    view.dispatch({ changes: { from: 0, insert: 'x' } })
    expect(csv.editorState.markdown).toBe('x' + crlf + '3,cy\r\n')
  })

  it('keeps CRLF line endings when a file is reloaded from disk into the open editor', async () => {
    const tabs = useTabsStore()
    const csv = tabs.createTab('/tmp/data.csv', 'a,b\n')
    wrapper = mount(App, { global: { stubs } })
    await flushPromises()
    await sourceShown(wrapper)

    const autoSave = useAutoSaveStore()
    autoSave.knownModifiedTimes['/tmp/data.csv'] = 100
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'get_file_modified_time') return 200
      if (command === 'read_file') return 'a,b\r\n1,2\r\n'
      return null
    })
    try {
      await autoSave.checkForExternalChanges()
      await flushPromises()
      const view = EditorView.findFromDOM(wrapper.find('.cm-editor').element as HTMLElement)!
      await vi.waitFor(() => expect(view.state.doc.lines).toBe(3))
      view.dispatch({ changes: { from: 0, insert: 'x' } })
      expect(csv.editorState.markdown).toBe('xa,b\r\n1,2\r\n')
    } finally {
      vi.mocked(invoke).mockReset()
      vi.mocked(invoke).mockResolvedValue('')
    }
  })
})
